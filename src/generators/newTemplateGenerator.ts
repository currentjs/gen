import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { writeGeneratedFile } from '../utils/generationRegistry';
import { colors } from '../utils/colors';
import { NewModuleConfig, WebPageConfig, AggregateConfig, isNewModuleConfig } from '../types/configTypes';

export class NewTemplateGenerator {
  private renderListTemplate(modelName: string, viewName: string, fields: [string, any][]): string {
    const fieldHeaders = fields
      .filter(([name]) => name !== 'id')
      .slice(0, 5)
      .map(([name]) => `    <th>${this.capitalize(name)}</th>`)
      .join('\n');

    const fieldCells = fields
      .filter(([name]) => name !== 'id')
      .slice(0, 5)
      .map(([name]) => `      <td>{{ item.${name} }}</td>`)
      .join('\n');

    return `<!-- @template name="${viewName}" -->
<div class="container mt-4">
  <h1>${modelName} List</h1>
  
  <div class="mb-3">
    <a href="/${modelName.toLowerCase()}/create" class="btn btn-primary">Create New ${modelName}</a>
  </div>

  <table class="table table-striped">
    <thead>
      <tr>
${fieldHeaders}
        <th>Actions</th>
      </tr>
    </thead>
    <tbody x-for="items" x-row="item">
      <tr>
${fieldCells}
        <td>
          <a href="/${modelName.toLowerCase()}/{{ item.id }}" class="btn btn-sm btn-info">View</a>
          <a href="/${modelName.toLowerCase()}/{{ item.id }}/edit" class="btn btn-sm btn-warning">Edit</a>
        </td>
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

  private renderDetailTemplate(modelName: string, viewName: string, fields: [string, any][]): string {
    const fieldRows = fields
      .map(([name]) => `  <div class="row mb-2">
    <div class="col-4"><strong>${this.capitalize(name)}:</strong></div>
    <div class="col-8">{{ ${name} }}</div>
  </div>`)
      .join('\n');

    return `<!-- @template name="${viewName}" -->
<div class="container mt-4">
  <h1>${modelName} Details</h1>
  
  <div class="card">
    <div class="card-body">
${fieldRows}
    </div>
  </div>

  <div class="mt-3">
    <a href="/${modelName.toLowerCase()}/{{ id }}/edit" class="btn btn-warning">Edit</a>
    <a href="/${modelName.toLowerCase()}" class="btn btn-secondary">Back to List</a>
  </div>
</div>`;
  }

  private renderCreateTemplate(
    modelName: string, 
    viewName: string, 
    fields: [string, any][],
    onSuccess?: WebPageConfig['onSuccess'],
    onError?: WebPageConfig['onError']
  ): string {
    const formFields = fields
      .filter(([name, config]) => name !== 'id' && !config.auto)
      .map(([name, config]) => {
        const required = config.required ? 'required' : '';
        const type = this.getInputType(config.type);
        
        return `  <div class="mb-3">
    <label for="${name}" class="form-label">${this.capitalize(name)}</label>
    <input type="${type}" class="form-control" id="${name}" name="${name}" ${required}>
  </div>`;
      })
      .join('\n');

    // Build strategy array from onSuccess/onError
    const strategies: string[] = [];
    if (onSuccess?.toast) strategies.push('toast');
    if (onSuccess?.back) strategies.push('back');
    if (onSuccess?.redirect) strategies.push('redirect');
    
    const strategyAttr = strategies.length > 0 
      ? `data-strategy='${JSON.stringify(strategies)}'` 
      : '';

    const redirectAttr = onSuccess?.redirect 
      ? `data-redirect="${onSuccess.redirect}"` 
      : '';

    return `<!-- @template name="${viewName}" -->
<div class="container mt-4">
  <h1>Create ${modelName}</h1>
  
  <form method="POST" action="/${modelName.toLowerCase()}/create" ${strategyAttr} ${redirectAttr} data-entity-name="${modelName}">
${formFields}
    
    <div class="d-flex gap-2">
      <button type="submit" class="btn btn-primary">Create</button>
      <a href="/${modelName.toLowerCase()}" class="btn btn-secondary">Cancel</a>
    </div>
  </form>
</div>`;
  }

  private renderEditTemplate(
    modelName: string, 
    viewName: string, 
    fields: [string, any][],
    onSuccess?: WebPageConfig['onSuccess'],
    onError?: WebPageConfig['onError']
  ): string {
    const formFields = fields
      .filter(([name, config]) => name !== 'id' && !config.auto)
      .map(([name, config]) => {
        const required = config.required ? 'required' : '';
        const type = this.getInputType(config.type);
        
        return `  <div class="mb-3">
    <label for="${name}" class="form-label">${this.capitalize(name)}</label>
    <input type="${type}" class="form-control" id="${name}" name="${name}" value="{{ ${name} || '' }}" ${required}>
  </div>`;
      })
      .join('\n');

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
  
  <form method="POST" action="/${modelName.toLowerCase()}/{{ id }}/edit" ${strategyAttr} data-entity-name="${modelName}">
${formFields}
    
    <div class="d-flex gap-2">
      <button type="submit" class="btn btn-primary">Update</button>
      <a href="/${modelName.toLowerCase()}/{{ id }}" class="btn btn-secondary">Cancel</a>
    </div>
  </form>
</div>`;
  }

  private getInputType(fieldType: string): string {
    switch (fieldType) {
      case 'string': return 'text';
      case 'number':
      case 'integer':
      case 'decimal': return 'number';
      case 'boolean': return 'checkbox';
      case 'datetime':
      case 'date': return 'datetime-local';
      case 'id': return 'number';
      default: return 'text';
    }
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  public generateFromConfig(config: NewModuleConfig): Record<string, string> {
    const result: Record<string, string> = {};

    if (!config.web || !config.web.resources) {
      return result;
    }

    Object.entries(config.web.resources).forEach(([resourceName, resourceConfig]) => {
      const aggregate = config.domain.aggregates[resourceName];
      if (!aggregate) {
        console.warn(`Warning: No aggregate found for resource ${resourceName}`);
        return;
      }

      const fields = Object.entries(aggregate.fields);

      resourceConfig.pages.forEach(page => {
        if (!page.view) return;

        // Determine template type from path and method
        if (page.method === 'POST') {
          // Skip POST endpoints - they don't need templates
          return;
        }

        if (page.path === '/' && page.useCase?.endsWith(':list')) {
          result[page.view] = this.renderListTemplate(resourceName, page.view, fields);
        } else if (page.path.includes(':id') && !page.path.includes('edit')) {
          result[page.view] = this.renderDetailTemplate(resourceName, page.view, fields);
        } else if (page.path.includes('/create')) {
          // Find corresponding POST endpoint for onSuccess/onError
          const postEndpoint = resourceConfig.pages.find(p => 
            p.path === page.path && p.method === 'POST'
          );
          result[page.view] = this.renderCreateTemplate(
            resourceName, 
            page.view, 
            fields,
            postEndpoint?.onSuccess,
            postEndpoint?.onError
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
            postEndpoint?.onSuccess,
            postEndpoint?.onError
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
      throw new Error('Configuration does not match new module format. Expected web.resources structure.');
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

