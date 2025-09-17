type FieldConfig = {
  name: string;
  type: string;
  required?: boolean;
  auto?: boolean;
  unique?: boolean;
  enum?: string[];
};

export function toFileNameFromTemplateName(name: string): string {
  const last = (name.split('/') as string[]).pop() || 'template';
  let base = last
    .replace(/\.tpl\.html$/i, '')
    .replace(/\.(html|htm|tpl)$/i, '');
  base = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  return `${base}.html`;
}

function generateFormInput(field: FieldConfig): string {
  const requiredAttr = field.required ? ' required' : '';
  const fieldId = field.name;
  const fieldName = field.name.charAt(0).toUpperCase() + field.name.slice(1).replace(/_/g, ' ');
  
  // Skip auto fields (like auto-incrementing IDs)
  if (field.auto) {
    return '';
  }
  
  switch (field.type.toLowerCase()) {
    case 'number':
    case 'int':
    case 'integer':
    case 'float':
    case 'decimal':
      return `  <div class="mb-3">
    <label for="${fieldId}" class="form-label">${fieldName}</label>
    <input id="${fieldId}" name="${field.name}" type="number" class="form-control"${requiredAttr} />
  </div>`;
    
    case 'boolean':
    case 'bool':
      return `  <div class="mb-3">
    <label class="form-label">${fieldName}</label>
    <div class="form-check">
      <input id="${fieldId}_true" name="${field.name}" type="radio" value="true" class="form-check-input"${requiredAttr} />
      <label for="${fieldId}_true" class="form-check-label">Yes</label>
    </div>
    <div class="form-check">
      <input id="${fieldId}_false" name="${field.name}" type="radio" value="false" class="form-check-input" />
      <label for="${fieldId}_false" class="form-check-label">No</label>
    </div>
  </div>`;
    
    case 'enum':
      if (field.enum && field.enum.length > 0) {
        const options = field.enum.map(opt => `      <option value="${opt}">${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('\n');
        return `  <div class="mb-3">
    <label for="${fieldId}" class="form-label">${fieldName}</label>
    <select id="${fieldId}" name="${field.name}" class="form-select"${requiredAttr}>
      <option value="">-- Select ${fieldName} --</option>
${options}
    </select>
  </div>`;
      }
      // Fallback to text if no enum values
      return `  <div class="mb-3">
    <label for="${fieldId}" class="form-label">${fieldName}</label>
    <input id="${fieldId}" name="${field.name}" type="text" class="form-control"${requiredAttr} />
  </div>`;
    
    default:
      // Text fields (string, text, etc.)
      return `  <div class="mb-3">
    <label for="${fieldId}" class="form-label">${fieldName}</label>
    <input id="${fieldId}" name="${field.name}" type="text" class="form-control"${requiredAttr} />
  </div>`;
  }
}

function generateUpdateFormInput(field: FieldConfig): string {
  const requiredAttr = field.required ? ' required' : '';
  const fieldId = field.name;
  const fieldName = field.name.charAt(0).toUpperCase() + field.name.slice(1).replace(/_/g, ' ');
  const fieldValue = `{{ $root.${field.name} }}`;
  
  // Skip auto fields (like auto-incrementing IDs)
  if (field.auto) {
    return '';
  }
  
  switch (field.type.toLowerCase()) {
    case 'number':
    case 'int':
    case 'integer':
    case 'float':
    case 'decimal':
      return `  <div class="mb-3">
    <label for="${fieldId}" class="form-label">${fieldName}</label>
    <input id="${fieldId}" name="${field.name}" type="number" class="form-control" value="${fieldValue}"${requiredAttr} />
  </div>`;
    
    case 'boolean':
    case 'bool':
      return `  <div class="mb-3">
    <label class="form-label">${fieldName}</label>
    <div class="form-check">
      <input id="${fieldId}_true" name="${field.name}" type="radio" value="true" class="form-check-input" {{ $root.${field.name} ? 'checked' : '' }}${requiredAttr} />
      <label for="${fieldId}_true" class="form-check-label">Yes</label>
    </div>
    <div class="form-check">
      <input id="${fieldId}_false" name="${field.name}" type="radio" value="false" class="form-check-input" {{ $root.${field.name} ? '' : 'checked' }} />
      <label for="${fieldId}_false" class="form-check-label">No</label>
    </div>
  </div>`;
    
    case 'enum':
      if (field.enum && field.enum.length > 0) {
        const options = field.enum.map(opt => 
          `      <option value="${opt}" {{ $root.${field.name} === '${opt}' ? 'selected' : '' }}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`
        ).join('\n');
        return `  <div class="mb-3">
    <label for="${fieldId}" class="form-label">${fieldName}</label>
    <select id="${fieldId}" name="${field.name}" class="form-select"${requiredAttr}>
      <option value="">-- Select ${fieldName} --</option>
${options}
    </select>
  </div>`;
      }
      // Fallback to text if no enum values
      return `  <div class="mb-3">
    <label for="${fieldId}" class="form-label">${fieldName}</label>
    <input id="${fieldId}" name="${field.name}" type="text" class="form-control" value="${fieldValue}"${requiredAttr} />
  </div>`;
    
    default:
      // Text fields (string, text, etc.)
      return `  <div class="mb-3">
    <label for="${fieldId}" class="form-label">${fieldName}</label>
    <input id="${fieldId}" name="${field.name}" type="text" class="form-control" value="${fieldValue}"${requiredAttr} />
  </div>`;
  }
}

export function renderListTemplate(entityName: string, templateName: string, basePath: string, fields: FieldConfig[], apiBase?: string): string {
  const safeFields = fields.length > 0 ? fields.map(f => f.name) : ['id', 'name'];
  const headers = ['ID', ...safeFields.filter(f => f !== 'id').map(f => f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, ' '))].map(f => `<th scope="col">${f}</th>`).join('');
  const cells = [
    '<td>{{ row.id }}</td>',
    ...safeFields.filter(f => f !== 'id').map(f => `<td>{{ row.${f} }}</td>`)
  ].join('\n      ');
  const deleteAction = apiBase ? `${apiBase}/{{ row.id }}` : `${basePath}/api/{{ row.id }}`;
  return `<!-- @template name="${templateName}" -->
<div class="container-fluid py-4">
  <div class="row">
    <div class="col">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h2">${entityName} List</h1>
        <a href="${basePath}/create" class="btn btn-primary">
          <i class="bi bi-plus-circle me-1"></i>Create New ${entityName}
        </a>
      </div>
      
      <div class="card">
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-hover">
              <thead class="table-light">
                <tr>
                  ${headers}
                  <th scope="col" class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody x-for="$root" x-row="row">
                <tr id="row-{{ row.id }}">
                  ${cells}
                  <td class="text-end">
                    <div class="btn-group" role="group">
                      <a href="${basePath}/{{ row.id }}" class="btn btn-sm btn-outline-primary">View</a>
                      <a href="${basePath}/{{ row.id }}/edit" class="btn btn-sm btn-outline-secondary">Edit</a>
                      <form style="display: inline;" 
                            data-action="${deleteAction}" 
                            data-method="DELETE" 
                            data-strategy='["toast", "remove"]'
                            data-entity-name="${entityName}"
                            data-confirm-message="Are you sure you want to delete this ${entityName.toLowerCase()}? This action cannot be undone."
                            data-target-selector="#row-{{ row.id }}">
                        <button type="submit" class="btn btn-sm btn-outline-danger">
                          <i class="bi bi-trash me-1"></i>Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`;
}

export function renderDetailTemplate(entityName: string, templateName: string, fields: FieldConfig[]): string {
  const safeFields = fields.length > 0 ? fields.map(f => f.name) : ['id', 'name'];
  const rows = safeFields.map(f => {
    const fieldName = f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, ' ');
    return `    <tr><th scope="row" class="w-25">${fieldName}</th><td>{{ $root.${f} }}</td></tr>`;
  }).join('\n');
  return `<!-- @template name="${templateName}" -->
<div class="container-fluid py-4">
  <div class="row justify-content-center">
    <div class="col-lg-8">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h2">${entityName} Details</h1>
        <div class="btn-group" role="group">
          <a href="{{ basePath }}/{{ $root.id }}/edit" class="btn btn-outline-primary">Edit</a>
          <button onclick="window.history.back()" class="btn btn-outline-secondary">Back</button>
        </div>
      </div>
      
      <div class="card">
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-borderless">
              <tbody>
${rows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`;
}

export function renderCreateTemplate(
  entityName: string,
  templateName: string,
  apiBase: string,
  fields: FieldConfig[],
  strategy: string[] = ['back', 'toast'],
  basePath?: string
): string {
  const safeFields = fields.filter(f => f.name !== 'id' && !f.auto);
  const inputs = safeFields.map(f => generateFormInput(f)).filter(input => input.trim() !== '').join('\n');
  const tplId = templateName.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
  const targetId = `${tplId}-result`;
  const messageId = `${tplId}-message`;
  const modalId = `${tplId}-modal`;
  const errorsId = `${tplId}-errors`;
  const fieldTypes = JSON.stringify(safeFields.reduce((acc, f) => {
    acc[f.name] = f.type;
    return acc;
  }, {} as Record<string, string>));
  const inlineErrorsBlock = strategy.includes('inline') ? `\n  <div id="${errorsId}" class="alert alert-danger d-none"></div>` : '';
  const messageBlock = strategy.includes('message') ? `\n  <div id="${messageId}" class="alert d-none" role="status"></div>` : '';
  const modalBlock = strategy.includes('modal')
    ? `\n<div class="modal fade" id="${modalId}" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-body"></div></div></div></div>`
    : '';
  return `<!-- @template name="${templateName}" -->
<div class="container-fluid py-4">
  <div class="row justify-content-center">
    <div class="col-lg-6">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h2">Create ${entityName}</h1>
        <button onclick="window.history.back()" class="btn btn-outline-secondary">Cancel</button>
      </div>
      
      <div class="card">
        <div class="card-body">
          <form data-template="${tplId}" data-action="${apiBase}" data-method="POST" data-strategy='${JSON.stringify(strategy)}' data-base-path="${basePath || ''}" data-entity-name="${entityName}" data-message-id="${messageId}" data-modal-id="${modalId}" data-field-types='${fieldTypes}'>
${inputs}
            <div class="d-flex gap-2 justify-content-end">
              <button type="button" onclick="window.history.back()" class="btn btn-outline-secondary">Cancel</button>
              <button type="submit" class="btn btn-primary">Create ${entityName}</button>
            </div>
          </form>
          <div id="${targetId}"></div>${inlineErrorsBlock}${messageBlock}
        </div>
      </div>
    </div>
  </div>
</div>${modalBlock}
`;
}

export function renderUpdateTemplate(
  entityName: string,
  templateName: string,
  apiBase: string,
  fields: FieldConfig[],
  strategy: string[] = ['back', 'toast'],
  basePath?: string
): string {
  const safeFields = fields.filter(f => f.name !== 'id' && !f.auto);
  const inputs = safeFields.map(f => generateUpdateFormInput(f)).filter(input => input.trim() !== '').join('\n');
  const tplId = templateName.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
  const targetId = `${tplId}-result`;
  const messageId = `${tplId}-message`;
  const modalId = `${tplId}-modal`;
  const errorsId = `${tplId}-errors`;
  const fieldTypes = JSON.stringify(safeFields.reduce((acc, f) => {
    acc[f.name] = f.type;
    return acc;
  }, {} as Record<string, string>));
  const inlineErrorsBlock = strategy.includes('inline') ? `\n  <div id="${errorsId}" class="alert alert-danger d-none"></div>` : '';
  const messageBlock = strategy.includes('message') ? `\n  <div id="${messageId}" class="alert d-none" role="status"></div>` : '';
  const modalBlock = strategy.includes('modal')
    ? `\n<div class="modal fade" id="${modalId}" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-body"></div></div></div></div>`
    : '';
  return `<!-- @template name="${templateName}" -->
<div class="container-fluid py-4">
  <div class="row justify-content-center">
    <div class="col-lg-6">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h2">Edit ${entityName}</h1>
        <button onclick="window.history.back()" class="btn btn-outline-secondary">Cancel</button>
      </div>
      
      <div class="card">
        <div class="card-body">
          <form data-template="${tplId}" data-action="${apiBase}/{{ $root.id }}" data-method="PUT" data-strategy='${JSON.stringify(strategy)}' data-base-path="${basePath || ''}" data-entity-name="${entityName}" data-message-id="${messageId}" data-modal-id="${modalId}" data-field-types='${fieldTypes}'>
${inputs}
            <div class="d-flex gap-2 justify-content-end">
              <button type="button" onclick="window.history.back()" class="btn btn-outline-secondary">Cancel</button>
              <button type="submit" class="btn btn-primary">Save Changes</button>
            </div>
          </form>
          <div id="${targetId}"></div>${inlineErrorsBlock}${messageBlock}
        </div>
      </div>
    </div>
  </div>
</div>${modalBlock}
`;
}

export function renderDeleteTemplate(
  entityName: string,
  templateName: string,
  apiBase: string,
  strategy: string[] = ['back', 'toast'],
  basePath?: string
): string {
  const tplId = templateName.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
  const messageId = `${tplId}-message`;
  const modalId = `${tplId}-modal`;
  const messageBlock = strategy.includes('message') ? `\n  <div id="${messageId}" class="alert d-none" role="status"></div>` : '';
  const modalBlock = strategy.includes('modal')
    ? `\n<div class="modal fade" id="${modalId}" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-body"></div></div></div></div>`
    : '';
  return `<!-- @template name="${templateName}" -->
<div class="container-fluid py-4">
  <div class="row justify-content-center">
    <div class="col-lg-6">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h2">Delete ${entityName}</h1>
        <button onclick="window.history.back()" class="btn btn-outline-secondary">Cancel</button>
      </div>
      
      <div class="card border-danger">
        <div class="card-body">
          <div class="alert alert-warning" role="alert">
            <h5 class="alert-heading">⚠️ Confirm Deletion</h5>
            <p class="mb-0">Are you sure you want to delete this ${entityName.toLowerCase()}? This action cannot be undone.</p>
          </div>
          
          <form data-template="${tplId}" data-action="${apiBase}/{{ $root.id }}" data-method="DELETE" data-strategy='${JSON.stringify(strategy)}' data-base-path="${basePath || ''}" data-entity-name="${entityName}" data-message-id="${messageId}" data-modal-id="${modalId}">
            <div class="d-flex gap-2 justify-content-end">
              <button type="button" onclick="window.history.back()" class="btn btn-outline-secondary">Cancel</button>
              <button type="submit" class="btn btn-danger">Delete ${entityName}</button>
            </div>
          </form>${messageBlock}
        </div>
      </div>
    </div>
  </div>
</div>${modalBlock}
`;
}

export function renderLayoutTemplate(layoutName: string): string {
  return `<!-- @template name="${layoutName}" -->
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${layoutName}</title>
  </head>
  <body>
    {{ content }}
  </body>
  </html>
`;
}

