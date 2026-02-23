import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { NewModuleConfig, WebPageConfig, AggregateConfig, ValueObjectConfig, isNewModuleConfig } from '../types/configTypes';
import { getChildrenOfParent, ParentChildInfo } from '../utils/childEntityUtils';

export class NewTemplateGenerator {
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
      .map(([name]) => `    <th>${this.capitalize(name)}</th>`)
      .join('\n');

    const fieldCells = fields
      .filter(([name]) => name !== 'id')
      .slice(0, 5)
      .map(([name, config]) => {
        const voConfig = this.valueObjects[this.capitalize((config.type || 'string'))];
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
    const headers = fieldEntries.map(([name]) => `      <th>${this.capitalize(name)}</th>`).join('\n');
    const cells = fieldEntries.map(([name, config]) => {
      const voConfig = this.valueObjects[this.capitalize((config?.type || 'string') as string)];
      if (voConfig) {
        const parts = Object.keys(voConfig.fields)
          .map(sub => `{{ childItem.${name}.${sub} }}`)
          .join(' ');
        return `      <td>${parts}</td>`;
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
        const voConfig = this.valueObjects[this.capitalize((config.type || 'string'))];
        if (voConfig) {
          const parts = Object.keys(voConfig.fields)
            .map(sub => `{{ ${name}.${sub} }}`)
            .join(' ');
          return `  <div class="row mb-2">
    <div class="col-4"><strong>${this.capitalize(name)}:</strong></div>
    <div class="col-8">${parts}</div>
  </div>`;
        }
        return `  <div class="row mb-2">
    <div class="col-4"><strong>${this.capitalize(name)}:</strong></div>
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

  private renderCreateTemplate(
    modelName: string, 
    viewName: string, 
    fields: [string, any][],
    basePath: string,
    onSuccess?: WebPageConfig['onSuccess'],
    onError?: WebPageConfig['onError'],
    enumValuesMap: Record<string, string[]> = {}
  ): string {
    const safeFields = fields.filter(([name, config]) => name !== 'id' && !config.auto);
    const formFields = safeFields
      .map(([name, config]) => this.renderFormField(name, config, enumValuesMap[name] || []))
      .join('\n');

    const fieldTypesJson = JSON.stringify(
      safeFields.reduce((acc, [name, config]) => {
        const capitalizedType = this.capitalize(config.type || 'string');
        const voConfig = this.valueObjects[capitalizedType];
        if (voConfig) {
          for (const [subName, subConfig] of Object.entries(voConfig.fields)) {
            if (typeof subConfig === 'object' && 'values' in subConfig) {
              acc[`${name}.${subName}`] = 'enum';
            } else {
              acc[`${name}.${subName}`] = subConfig.type || 'string';
            }
          }
        } else {
          acc[name] = config.type || 'string';
        }
        return acc;
      }, {} as Record<string, string>)
    );

    // Build strategy array from onSuccess/onError
    const strategies: string[] = [];
    if (onSuccess?.toast) strategies.push('toast');
    if (onSuccess?.back) strategies.push('back');
    if (onSuccess?.redirect) strategies.push('redirect');
    
    const strategyAttr = strategies.length > 0 
      ? `data-strategy='${JSON.stringify(strategies)}'` 
      : '';

    const redirectAttr = onSuccess?.redirect 
      ? `data-redirect="${this.prefixToTemplatePath(onSuccess.redirect)}"` 
      : '';

    return `<!-- @template name="${viewName}" -->
<div class="container mt-4">
  <h1>Create ${modelName}</h1>
  
  <form method="POST" action="${basePath}/create" ${strategyAttr} ${redirectAttr} data-entity-name="${modelName}" data-field-types='${fieldTypesJson}'>
${formFields}
    
    <div class="d-flex gap-2">
      <button type="submit" class="btn btn-primary">Create</button>
      <a href="${basePath}" class="btn btn-secondary">Cancel</a>
    </div>
  </form>
</div>`;
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
    const safeFields = fields.filter(([name, config]) => name !== 'id' && !config.auto);
    const formFields = safeFields
      .map(([name, config]) => this.renderFormField(name, config, enumValuesMap[name] || [], true))
      .join('\n');

    const fieldTypesJson = JSON.stringify(
      safeFields.reduce((acc, [name, config]) => {
        const capitalizedType = this.capitalize(config.type || 'string');
        const voConfig = this.valueObjects[capitalizedType];
        if (voConfig) {
          for (const [subName, subConfig] of Object.entries(voConfig.fields)) {
            if (typeof subConfig === 'object' && 'values' in subConfig) {
              acc[`${name}.${subName}`] = 'enum';
            } else {
              acc[`${name}.${subName}`] = subConfig.type || 'string';
            }
          }
        } else {
          acc[name] = config.type || 'string';
        }
        return acc;
      }, {} as Record<string, string>)
    );

    // Build strategy array from onSuccess/onError
    const strategies: string[] = [];
    if (onSuccess?.toast) strategies.push('toast');
    if (onSuccess?.back) strategies.push('back');
    
    const strategyAttr = strategies.length > 0 
      ? `data-strategy='${JSON.stringify(strategies)}'` 
      : '';

    return `<!-- @template name="${viewName}" -->
<div class="container mt-4">
  <h1>Edit ${modelName}</h1>
  
  <form method="POST" action="${basePath}/{{ id }}/edit" ${strategyAttr} data-entity-name="${modelName}" data-field-types='${fieldTypesJson}'>
${formFields}
    
    <div class="d-flex gap-2">
      <button type="submit" class="btn btn-primary">Update</button>
      <a href="${basePath}/{{ id }}" class="btn btn-secondary">Cancel</a>
    </div>
  </form>
</div>`;
  }

  private getInputType(fieldType: string): string {
    switch (fieldType) {
      case 'string': return 'text';
      case 'number':
      case 'integer':
      case 'float':
      case 'decimal':
      case 'money':
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
      const subLabel = this.capitalize(subName);

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

  private renderFormField(name: string, config: any, enumValues: string[] = [], isEdit = false): string {
    const required = config.required ? 'required' : '';
    const label = this.capitalize(name);
    const fieldType = (config.type || 'string').toLowerCase();

    const capitalizedType = this.capitalize(fieldType);
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
            return `      <option value="${v}"${sel}>${this.capitalize(v)}</option>`;
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

  private getEnumValuesMap(config: NewModuleConfig, resourceName: string): Record<string, string[]> {
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

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  public generateFromConfig(config: NewModuleConfig): Record<string, string> {
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

    if (!isNewModuleConfig(config)) {
      throw new Error('Configuration does not match new module format. Expected domain/useCases/web structure.');
    }

    return this.generateFromConfig(config);
  }

  public async generateAndSaveFiles(
    yamlFilePath: string,
    moduleDir: string,
    opts?: { force?: boolean; skipOnConflict?: boolean }
  ): Promise<void> {
    const templatesByName = this.generateFromYamlFile(yamlFilePath);
    
    const viewsDir = path.join(moduleDir, 'views');
    fs.mkdirSync(viewsDir, { recursive: true });

    for (const [name, content] of Object.entries(templatesByName)) {
      const filePath = path.join(viewsDir, `${name}.html`);
      // eslint-disable-next-line no-await-in-loop
      await writeGeneratedFile(filePath, content, { force: !!opts?.force, skipOnConflict: !!opts?.skipOnConflict });
    }

    // eslint-disable-next-line no-console
    console.log('\n' + colors.green('Template files generated successfully!') + '\n');
  }
}

