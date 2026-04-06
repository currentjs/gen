import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { ModuleConfig, WebPageConfig, AggregateConfig, AggregateFieldConfig, ValueObjectConfig, isValidModuleConfig } from '../types/configTypes';
import { getChildrenOfParent, ParentChildInfo } from '../utils/childEntityUtils';
import { capitalize, parseFieldType } from '../utils/typeUtils';

export class TemplateGenerator {
  private valueObjects: Record<string, ValueObjectConfig> = {};

  /**
   * Convert a route prefix like "/invoice/:invoiceId/items" into a
   * template-ready path like "/invoice/{{ invoiceId }}/items".
   */
  private prefixToTemplatePath(prefix: string): string {
    return prefix.replace(/:([a-zA-Z_]\w*)/g, '{{ $1 }}');
  }

  /**
   * Replace a single path param in prefix with a template expression (e.g. for list: item.id, for detail: id).
   */
  private prefixWithParam(prefix: string, paramName: string, templateExpr: string): string {
    return prefix.replace(new RegExp(':' + paramName + '(?=/|$)'), templateExpr);
  }

  private renderListTemplate(
    modelName: string,
    viewName: string,
    fields: [string, any][],
    basePath: string,
    withChildChildren?: ParentChildInfo[]
  ): string {
    const fieldHeaders = fields
      .filter(([name]) => name !== 'id')
      .slice(0, 5)
      .map(([name]) => `    <th>${capitalize(name)}</th>`)
      .join('\n');

    const fieldCells = fields
      .filter(([name]) => name !== 'id')
      .slice(0, 5)
      .map(([name, config]) => {
        const typeStr = (config.type || 'string') as string;
        const parsed = parseFieldType(typeStr);
        if (parsed.isArray || parsed.isUnion) {
          return `      <td>{{ item.${name} }}</td>`;
        }
        const voConfig = this.valueObjects[capitalize(typeStr)];
        if (voConfig) {
          const parts = Object.keys(voConfig.fields)
            .map(sub => `{{ item.${name}.${sub} }}`)
            .join(' ');
          return `      <td>${parts}</td>`;
        }
        return `      <td>{{ item.${name} }}</td>`;
      })
      .join('\n');

    const childLinkHeaders = (withChildChildren || [])
      .map(child => `        <th>${child.childEntityName}</th>`)
      .join('\n');
    const childLinkCells = (withChildChildren || [])
      .map(child => {
        const childPath = child.childWebPrefix
          ? this.prefixWithParam(child.childWebPrefix, child.parentIdField, '{{ item.id }}')
          : '#';
        return `        <td><a href="${childPath}" class="btn btn-sm btn-outline-secondary">Items</a></td>`;
      })
      .join('\n');

    const childHeaderBlock = childLinkHeaders ? '\n' + childLinkHeaders : '';
    const childCellBlock = childLinkCells ? '\n' + childLinkCells : '';

    return `<!-- @template name="${viewName}" -->
<div class="container mt-4">
  <h1>${modelName} List</h1>
  
  <div class="mb-3">
    <a href="${basePath}/create" class="btn btn-primary">Create New ${modelName}</a>
  </div>

  <table class="table table-striped">
    <thead>
      <tr>
${fieldHeaders}
        <th>Actions</th>${childHeaderBlock}
      </tr>
    </thead>
    <tbody x-for="items" x-row="item">
      <tr>
${fieldCells}
        <td>
          <a href="${basePath}/{{ item.id }}" class="btn btn-sm btn-info">View</a>
          <a href="${basePath}/{{ item.id }}/edit" class="btn btn-sm btn-warning">Edit</a>
        </td>${childCellBlock}
      </tr>
    </tbody>
  </table>

  <div x-if="total > limit">
    <nav>
      <ul class="pagination">
        <!-- Pagination controls -->
      </ul>
    </nav>
  </div>
</div>`;
  }

  private renderChildTableSection(child: ParentChildInfo, parentIdTemplateExpr: string): string {
    const childVar = child.childEntityName.charAt(0).toLowerCase() + child.childEntityName.slice(1);
    const childItemsKey = `${childVar}Items`;
    const childBasePath = child.childWebPrefix
      ? this.prefixWithParam(child.childWebPrefix, child.parentIdField, parentIdTemplateExpr)
      : '';
    const fieldEntries = Object.entries(child.childFields).filter(([name]) => name !== 'id').slice(0, 5);
    const headers = fieldEntries.map(([name]) => `      <th>${capitalize(name)}</th>`).join('\n');
    const cells = fieldEntries.map(([name, config]) => {
      const typeStr = (config?.type || 'string') as string;
      const parsedType = parseFieldType(typeStr);
      if (!parsedType.isArray && !parsedType.isUnion) {
        const voConfig = this.valueObjects[capitalize(typeStr)];
        if (voConfig) {
          const parts = Object.keys(voConfig.fields)
            .map(sub => `{{ childItem.${name}.${sub} }}`)
            .join(' ');
          return `      <td>${parts}</td>`;
        }
      }
      return `      <td>{{ childItem.${name} }}</td>`;
    }).join('\n');
    const addLink = childBasePath
      ? `  <div class="mb-3">
    <a href="${childBasePath}/create" class="btn btn-primary btn-sm">Add ${child.childEntityName}</a>
  </div>`
      : '';
    const actionLinks = childBasePath
      ? `        <td>
          <a href="${childBasePath}/{{ childItem.id }}" class="btn btn-sm btn-info">View</a>
          <a href="${childBasePath}/{{ childItem.id }}/edit" class="btn btn-sm btn-warning">Edit</a>
        </td>`
      : '        <td></td>';
    return `
  <h2 class="mt-4">${child.childEntityName} List</h2>
${addLink}
  <table class="table table-striped">
    <thead>
      <tr>
${headers}
        <th>Actions</th>
      </tr>
    </thead>
    <tbody x-for="${childItemsKey}" x-row="childItem">
      <tr>
${cells}
${actionLinks}
      </tr>
    </tbody>
  </table>`;
  }

  private renderDetailTemplate(
    modelName: string,
    viewName: string,
    fields: [string, any][],
    basePath: string,
    withChildChildren?: ParentChildInfo[]
  ): string {
    const fieldRows = fields
      .map(([name, config]) => {
        const typeStr = (config.type || 'string') as string;
        const parsed = parseFieldType(typeStr);
        if (parsed.isArray || parsed.isUnion) {
          return `  <div class="row mb-2">
    <div class="col-4"><strong>${capitalize(name)}:</strong></div>
    <div class="col-8">{{ ${name} }}</div>
  </div>`;
        }
        const voConfig = this.valueObjects[capitalize(typeStr)];
        if (voConfig) {
          const parts = Object.keys(voConfig.fields)
            .map(sub => `{{ ${name}.${sub} }}`)
            .join(' ');
          return `  <div class="row mb-2">
    <div class="col-4"><strong>${capitalize(name)}:</strong></div>
    <div class="col-8">${parts}</div>
  </div>`;
        }
        return `  <div class="row mb-2">
    <div class="col-4"><strong>${capitalize(name)}:</strong></div>
    <div class="col-8">{{ ${name} }}</div>
  </div>`;
      })
      .join('\n');

    const childSections = (withChildChildren || [])
      .map(child => this.renderChildTableSection(child, '{{ id }}'))
      .join('');

    return `<!-- @template name="${viewName}" -->
<div class="container mt-4">
  <h1>${modelName} Details</h1>
  
  <div class="card">
    <div class="card-body">
${fieldRows}
    </div>
  </div>

  <div class="mt-3">
    <a href="${basePath}/{{ id }}/edit" class="btn btn-warning">Edit</a>
    <a href="${basePath}" class="btn btn-secondary">Back to List</a>
  </div>${childSections}
</div>`;
  }

  private buildFieldTypesJson(safeFields: [string, AggregateFieldConfig | Record<string, unknown>][]): string {
    return JSON.stringify(
      safeFields.reduce((acc, [name, config]) => {
        const typeStr = typeof config?.type === 'string' ? config.type : 'string';
        const parsed = parseFieldType(typeStr);

        // Array or union of VOs → stored as JSON, emit single "json" entry
        if (parsed.isArray || parsed.isUnion) {
          const anyVoReferenced = parsed.baseTypes.some(bt => this.valueObjects[capitalize(bt)]);
          if (anyVoReferenced) {
            acc[name] = 'json';
            return acc;
          }
        }

        const capitalizedType = capitalize(typeStr);
        const voConfig = this.valueObjects[capitalizedType];
        if (voConfig) {
          for (const [subName, subConfig] of Object.entries(voConfig.fields)) {
            if (typeof subConfig === 'object' && 'values' in subConfig) {
              acc[`${name}.${subName}`] = 'enum';
            } else {
              acc[`${name}.${subName}`] = (subConfig as { type?: string }).type || 'string';
            }
          }
        } else {
          acc[name] = typeStr;
        }
        return acc;
      }, {} as Record<string, string>)
    );
  }

  private renderFormTemplate(
    mode: 'create' | 'edit',
    modelName: string,
    viewName: string,
    fields: [string, any][],
    basePath: string,
    onSuccess?: WebPageConfig['onSuccess'],
    onError?: WebPageConfig['onError'],
    enumValuesMap: Record<string, string[]> = {}
  ): string {
    const safeFields = fields.filter(([name, config]) => name !== 'id' && !config.auto);
    const isEdit = mode === 'edit';
    const formFields = safeFields
      .map(([name, config]) => this.renderFormField(name, config, enumValuesMap[name] || [], isEdit))
      .join('\n');

    const fieldTypesJson = this.buildFieldTypesJson(safeFields);

    const strategies: string[] = [];
    if (onSuccess?.toast) strategies.push('toast');
    if (onSuccess?.back) strategies.push('back');
    if (mode === 'create' && onSuccess?.redirect) strategies.push('redirect');
    const strategyAttr = strategies.length > 0 ? `data-strategy='${JSON.stringify(strategies)}'` : '';
    const redirectAttr = mode === 'create' && onSuccess?.redirect
      ? `data-redirect="${this.prefixToTemplatePath(onSuccess.redirect)}"`
      : '';

    const title = mode === 'create' ? `Create ${modelName}` : `Edit ${modelName}`;
    const formAction = mode === 'create' ? `${basePath}/create` : `${basePath}/{{ id }}/edit`;
    const submitLabel = mode === 'create' ? 'Create' : 'Update';
    const cancelHref = mode === 'create' ? basePath : `${basePath}/{{ id }}`;

    return `<!-- @template name="${viewName}" -->
<div class="container mt-4">
  <h1>${title}</h1>
  
  <form method="POST" action="${formAction}" ${strategyAttr} ${redirectAttr} data-entity-name="${modelName}" data-field-types='${fieldTypesJson}'>
${formFields}
    
    <div class="d-flex gap-2">
      <button type="submit" class="btn btn-primary">${submitLabel}</button>
      <a href="${cancelHref}" class="btn btn-secondary">Cancel</a>
    </div>
  </form>
</div>`;
  }

  private renderCreateTemplate(
    modelName: string,
    viewName: string,
    fields: [string, any][],
    basePath: string,
    onSuccess?: WebPageConfig['onSuccess'],
    onError?: WebPageConfig['onError'],
    enumValuesMap: Record<string, string[]> = {}
  ): string {
    return this.renderFormTemplate('create', modelName, viewName, fields, basePath, onSuccess, onError, enumValuesMap);
  }

  private renderEditTemplate(
    modelName: string,
    viewName: string,
    fields: [string, any][],
    basePath: string,
    onSuccess?: WebPageConfig['onSuccess'],
    onError?: WebPageConfig['onError'],
    enumValuesMap: Record<string, string[]> = {}
  ): string {
    return this.renderFormTemplate('edit', modelName, viewName, fields, basePath, onSuccess, onError, enumValuesMap);
  }

  private getInputType(fieldType: string): string {
    switch (fieldType) {
      case 'string': return 'text';
      case 'number':
      case 'integer':
      case 'float':
      case 'decimal':
      case 'id': return 'number';
      case 'datetime':
      case 'date': return 'datetime-local';
      default: return 'text';
    }
  }

  private renderValueObjectField(name: string, label: string, voConfig: ValueObjectConfig, required: string, isEdit: boolean): string {
    const subFields = Object.entries(voConfig.fields);

    const columns = subFields.map(([subName, subConfig]) => {
      const fullName = `${name}.${subName}`;
      const subLabel = capitalize(subName);

      if (typeof subConfig === 'object' && 'values' in subConfig) {
        const uniqueValues = [...new Set(subConfig.values)];
        const options = uniqueValues.map(v => {
          const sel = isEdit ? ` {{ ${name}.${subName} === '${v}' ? 'selected' : '' }}` : '';
          return `          <option value="${v}"${sel}>${v}</option>`;
        }).join('\n');

        return `      <div class="col-auto">
        <select class="form-select" id="${fullName}" name="${fullName}" ${required}>
          <option value="">-- ${subLabel} --</option>
${options}
        </select>
      </div>`;
      } else {
        const type = this.getInputType(subConfig.type);
        const value = isEdit ? ` value="{{ ${name}.${subName} || '' }}"` : '';
        return `      <div class="col">
        <input type="${type}" class="form-control" id="${fullName}" name="${fullName}" placeholder="${subLabel}"${value} ${required}>
      </div>`;
      }
    }).join('\n');

    return `  <div class="mb-3">
    <label class="form-label">${label}</label>
    <div class="row g-2">
${columns}
    </div>
  </div>`;
  }

  /**
   * Render an array-of-VOs field as checkboxes.
   * If the VO has a single enum field: one checkbox per enum value.
   * If the VO has multiple / non-enum fields: one labeled checkbox group per VO subfield.
   */
  private renderArrayVoField(name: string, label: string, voName: string, voConfig: ValueObjectConfig, isEdit: boolean): string {
    const subFields = Object.entries(voConfig.fields);

    // Single enum field: render one checkbox per enum value
    if (subFields.length === 1) {
      const [subName, subConfig] = subFields[0];
      if (typeof subConfig === 'object' && 'values' in subConfig) {
        const uniqueValues = [...new Set(subConfig.values)];
        const checkboxes = uniqueValues.map(v => {
          const checkedExpr = isEdit ? ` {{ (${name} || []).some(function(item){ return item.${subName} === '${v}'; }) ? 'checked' : '' }}` : '';
          return `      <div class="form-check form-check-inline">
        <input type="checkbox" class="form-check-input" name="${name}[]" value="${v}"${checkedExpr}>
        <label class="form-check-label">${v}</label>
      </div>`;
        }).join('\n');
        return `  <div class="mb-3">
    <label class="form-label">${label}</label>
    <div>
${checkboxes}
    </div>
  </div>`;
      }
    }

    // Multi-field VO: render a repeatable entry group with one checkbox-style row per sub-field
    const subInputs = subFields.map(([subName, subConfig]) => {
      const subLabel = capitalize(subName);
      if (typeof subConfig === 'object' && 'values' in subConfig) {
        const uniqueValues = [...new Set(subConfig.values)];
        const options = uniqueValues.map(v => `<option value="${v}">${v}</option>`).join('');
        return `        <div class="col-auto">
          <label class="form-label">${subLabel}</label>
          <select class="form-select form-select-sm" name="${name}[0].${subName}"><option value="">--</option>${options}</select>
        </div>`;
      }
      const inputType = this.getInputType((subConfig as { type: string }).type);
      return `        <div class="col">
          <label class="form-label">${subLabel}</label>
          <input type="${inputType}" class="form-control form-control-sm" name="${name}[0].${subName}" placeholder="${subLabel}">
        </div>`;
    }).join('\n');

    return `  <div class="mb-3">
    <label class="form-label">${label}</label>
    <div class="border rounded p-2">
      <div class="row g-2 align-items-end">
${subInputs}
      </div>
      <small class="text-muted">Add multiple ${voName} entries as needed.</small>
    </div>
  </div>`;
  }

  /**
   * Render a union-of-VOs field as a type selector with sub-fields for each VO type.
   */
  private renderUnionVoField(name: string, label: string, unionVoNames: string[], isEdit: boolean): string {
    const typeOptions = unionVoNames.map(voName => {
      const sel = isEdit ? ` {{ ${name}._type === '${voName}' ? 'selected' : '' }}` : '';
      return `      <option value="${voName}"${sel}>${voName}</option>`;
    }).join('\n');

    const subFieldGroups = unionVoNames.map(voName => {
      const voConfig = this.valueObjects[voName];
      if (!voConfig) return '';
      const subInputs = Object.entries(voConfig.fields).map(([subName, subConfig]) => {
        const subLabel = capitalize(subName);
        const fullName = `${name}.${subName}`;
        if (typeof subConfig === 'object' && 'values' in subConfig) {
          const uniqueValues = [...new Set(subConfig.values)];
          const options = uniqueValues.map(v => {
            const sel = isEdit ? ` {{ ${name}.${subName} === '${v}' ? 'selected' : '' }}` : '';
            return `            <option value="${v}"${sel}>${v}</option>`;
          }).join('\n');
          return `        <div class="col-auto">
          <label class="form-label">${subLabel}</label>
          <select class="form-select" id="${fullName}" name="${fullName}">
            <option value="">-- ${subLabel} --</option>
${options}
          </select>
        </div>`;
        }
        const inputType = this.getInputType((subConfig as { type: string }).type);
        const value = isEdit ? ` value="{{ ${name}.${subName} || '' }}"` : '';
        return `        <div class="col">
          <label class="form-label">${subLabel}</label>
          <input type="${inputType}" class="form-control" id="${fullName}" name="${fullName}" placeholder="${subLabel}"${value}>
        </div>`;
      }).join('\n');

      return `      <div class="${name}-fields-${voName}">
        <div class="row g-2">
${subInputs}
        </div>
      </div>`;
    }).join('\n');

    return `  <div class="mb-3">
    <label for="${name}_type" class="form-label">${label} Type</label>
    <select class="form-select mb-2" id="${name}_type" name="${name}._type">
      <option value="">-- Select type --</option>
${typeOptions}
    </select>
${subFieldGroups}
  </div>`;
  }

  /**
   * Render an array-of-union-VOs field as a repeatable group where each item
   * has a type selector and conditionally-shown sub-fields per VO type.
   */
  private renderArrayUnionVoField(name: string, label: string, unionVoNames: string[], isEdit: boolean): string {
    const typeOptions = unionVoNames.map(voName => {
      return `          <option value="${voName}">${voName}</option>`;
    }).join('\n');

    const subFieldGroups = unionVoNames.map(voName => {
      const voConfig = this.valueObjects[voName];
      if (!voConfig) return '';
      const subInputs = Object.entries(voConfig.fields).map(([subName, subConfig]) => {
        const subLabel = capitalize(subName);
        const fullName = `${name}[0].${subName}`;
        if (typeof subConfig === 'object' && 'values' in subConfig) {
          const uniqueValues = [...new Set(subConfig.values)];
          const options = uniqueValues.map(v => `<option value="${v}">${v}</option>`).join('');
          return `          <div class="col-auto">
            <label class="form-label">${subLabel}</label>
            <select class="form-select form-select-sm" name="${fullName}"><option value="">--</option>${options}</select>
          </div>`;
        }
        const inputType = this.getInputType((subConfig as { type: string }).type);
        return `          <div class="col">
            <label class="form-label">${subLabel}</label>
            <input type="${inputType}" class="form-control form-control-sm" name="${fullName}" placeholder="${subLabel}">
          </div>`;
      }).join('\n');

      return `        <div class="${name}-fields-${voName}">
          <div class="row g-2">
${subInputs}
          </div>
        </div>`;
    }).join('\n');

    const editHint = isEdit ? ` <!-- existing items rendered server-side -->` : '';
    return `  <div class="mb-3">
    <label class="form-label">${label}</label>
    <div class="border rounded p-2" id="${name}-container">${editHint}
      <div class="${name}-entry mb-2">
        <select class="form-select form-select-sm mb-1" name="${name}[0]._type">
          <option value="">-- Select type --</option>
${typeOptions}
        </select>
${subFieldGroups}
      </div>
    </div>
    <small class="text-muted">Add multiple ${label} entries as needed.</small>
  </div>`;
  }

  private renderFormField(name: string, config: any, enumValues: string[] = [], isEdit = false): string {
    const required = config.required ? 'required' : '';
    const label = capitalize(name);
    const fieldType = (config.type || 'string') as string;

    const parsed = parseFieldType(fieldType);

    // Array of union of value objects
    if (parsed.isArray && parsed.isUnion) {
      const unionVoNames = parsed.baseTypes.map(bt => capitalize(bt)).filter(n => this.valueObjects[n]);
      if (unionVoNames.length > 0) {
        return this.renderArrayUnionVoField(name, label, unionVoNames, isEdit);
      }
    }

    // Array of value objects
    if (parsed.isArray) {
      const voName = capitalize(parsed.baseTypes[0]);
      const voConfig = this.valueObjects[voName];
      if (voConfig) {
        return this.renderArrayVoField(name, label, voName, voConfig, isEdit);
      }
    }

    // Union of value objects
    if (parsed.isUnion) {
      const unionVoNames = parsed.baseTypes.map(bt => capitalize(bt)).filter(n => this.valueObjects[n]);
      if (unionVoNames.length > 0) {
        return this.renderUnionVoField(name, label, unionVoNames, isEdit);
      }
    }

    // Simple value object
    const capitalizedType = capitalize(fieldType.toLowerCase());
    const voConfig = this.valueObjects[capitalizedType];
    if (voConfig) {
      return this.renderValueObjectField(name, label, voConfig, required, isEdit);
    }

    switch (fieldType) {
      case 'boolean':
      case 'bool': {
        const checked = isEdit ? ` {{ ${name} ? 'checked' : '' }}` : '';
        return `  <div class="mb-3">
    <div class="form-check">
      <input type="checkbox" class="form-check-input" id="${name}" name="${name}" value="true"${checked} ${required}>
      <label for="${name}" class="form-check-label">${label}</label>
    </div>
  </div>`;
      }

      case 'enum': {
        if (enumValues.length > 0) {
          const options = enumValues.map(v => {
            const sel = isEdit ? ` {{ ${name} === '${v}' ? 'selected' : '' }}` : '';
            return `      <option value="${v}"${sel}>${capitalize(v)}</option>`;
          }).join('\n');
          return `  <div class="mb-3">
    <label for="${name}" class="form-label">${label}</label>
    <select class="form-select" id="${name}" name="${name}" ${required}>
      <option value="">-- Select ${label} --</option>
${options}
    </select>
  </div>`;
        }
        const value = isEdit ? ` value="{{ ${name} || '' }}"` : '';
        return `  <div class="mb-3">
    <label for="${name}" class="form-label">${label}</label>
    <input type="text" class="form-control" id="${name}" name="${name}"${value} ${required}>
  </div>`;
      }

      default: {
        const type = this.getInputType(config.type);
        const value = isEdit ? ` value="{{ ${name} || '' }}"` : '';
        return `  <div class="mb-3">
    <label for="${name}" class="form-label">${label}</label>
    <input type="${type}" class="form-control" id="${name}" name="${name}"${value} ${required}>
  </div>`;
      }
    }
  }

  private getEnumValuesMap(config: ModuleConfig, resourceName: string): Record<string, string[]> {
    const enumMap: Record<string, string[]> = {};

    const aggregate = config.domain.aggregates[resourceName];
    if (!aggregate) return enumMap;

    for (const [fieldName, fieldConfig] of Object.entries(aggregate.fields)) {
      if (fieldConfig.type === 'enum' && (fieldConfig as any).values) {
        enumMap[fieldName] = (fieldConfig as any).values;
      }
    }

    const modelUseCases = config.useCases[resourceName];
    if (modelUseCases) {
      for (const useCase of Object.values(modelUseCases)) {
        if (useCase.input?.filters) {
          for (const [filterName, filterConfig] of Object.entries(useCase.input.filters)) {
            if (filterConfig.enum && !enumMap[filterName]) {
              enumMap[filterName] = filterConfig.enum;
            }
          }
        }
      }
    }

    return enumMap;
  }

  public generateFromConfig(config: ModuleConfig): Record<string, string> {
    const result: Record<string, string> = {};
    this.valueObjects = config.domain.valueObjects || {};

    if (!config.web) {
      return result;
    }

    Object.entries(config.web).forEach(([resourceName, resourceConfig]) => {
      const aggregate = config.domain.aggregates[resourceName];
      if (!aggregate) {
        console.warn(`Warning: No aggregate found for resource ${resourceName}`);
        return;
      }

      const fields = Object.entries(aggregate.fields);
      const enumValuesMap = this.getEnumValuesMap(config, resourceName);
      const basePath = this.prefixToTemplatePath(resourceConfig.prefix);

      const withChildChildren = getChildrenOfParent(config, resourceName);

      resourceConfig.pages.forEach(page => {
        if (!page.view) return;

        // Determine template type from path and method
        if (page.method === 'POST') {
          // Skip POST endpoints - they don't need templates
          return;
        }

        const useCaseWithChild = (() => {
          if (!page.useCase) return false;
          const [model, action] = page.useCase.split(':');
          return (config.useCases[model] as Record<string, { withChild?: boolean }>)?.[action]?.withChild === true;
        })();
        const childrenForTemplate = useCaseWithChild && withChildChildren.length > 0 ? withChildChildren : undefined;

        if (page.path === '/' && page.useCase?.endsWith(':list')) {
          result[page.view] = this.renderListTemplate(resourceName, page.view, fields, basePath, childrenForTemplate);
        } else if (page.path.includes(':id') && !page.path.includes('edit')) {
          result[page.view] = this.renderDetailTemplate(resourceName, page.view, fields, basePath, childrenForTemplate);
        } else if (page.path.includes('/create')) {
          // Find corresponding POST endpoint for onSuccess/onError
          const postEndpoint = resourceConfig.pages.find(p => 
            p.path === page.path && p.method === 'POST'
          );
          result[page.view] = this.renderCreateTemplate(
            resourceName, 
            page.view, 
            fields,
            basePath,
            postEndpoint?.onSuccess,
            postEndpoint?.onError,
            enumValuesMap
          );
        } else if (page.path.includes('edit')) {
          // Find corresponding POST endpoint for onSuccess/onError
          const postEndpoint = resourceConfig.pages.find(p => 
            p.path === page.path && p.method === 'POST'
          );
          result[page.view] = this.renderEditTemplate(
            resourceName, 
            page.view, 
            fields,
            basePath,
            postEndpoint?.onSuccess,
            postEndpoint?.onError,
            enumValuesMap
          );
        }
      });
    });

    return result;
  }

  public generateFromYamlFile(yamlFilePath: string): Record<string, string> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = parseYaml(yamlContent);

    if (!isValidModuleConfig(config)) {
      throw new Error('Configuration does not match new module format. Expected domain/useCases/web structure.');
    }

    return this.generateFromConfig(config);
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    moduleDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean; onlyIfMissing?: boolean }
  ): Promise<void> {
    let isGenerated = false;
    const templatesByName = this.generateFromYamlFile(yamlFilePath);
    
    const viewsDir = path.join(moduleDir, 'views');
    fs.mkdirSync(viewsDir, { recursive: true });

    for (const [name, content] of Object.entries(templatesByName)) {
      const filePath = path.join(viewsDir, `${name}.html`);
      if (opts?.onlyIfMissing && fs.existsSync(filePath)) continue;
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, content, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
      isGenerated = true;
    }

    if (isGenerated) {
      // eslint-disable-next-line no-console
      console.log('\n' + colors.green('Template files generated successfully!') + '\n');
    }
  }
}

