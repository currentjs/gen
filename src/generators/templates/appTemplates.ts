// Application-level templates for project scaffolding
import * as fs from 'fs';
import * as path from 'path';
import { GENERATOR_MARKERS } from '../../utils/constants';

export const packageJsonTemplate = (appName: string) => JSON.stringify(
  {
    name: appName || 'my-app',
    version: '0.1.0',
    private: true,
    scripts: {
      build: 'npm run clean && tsc -p tsconfig.json && npx path-fixer',
      start: 'node build/app.js',
      clean: 'rm -rf build',
      dev: 'ts-node src/app.ts',
      // uncomment this if you want to use the devstand script
      // devstand: 'npm i && npm link @currentjs/router @currentjs/templating @currentjs/provider-mysql && npm run build'
    },
    dependencies: {
      '@currentjs/router': 'latest',
      '@currentjs/templating': 'latest',
      '@currentjs/provider-mysql': 'latest',
    },
    devDependencies: {
      typescript: '^5.6.3',
      '@types/node': '^22.7.4',
      '@koz1024/path-fixer': '^0.2.1',
    },
    type: 'module'
  },
  null,
  2
);

export const tsconfigTemplate = `{
  "compilerOptions": {
    "module": "es2020",
    "target": "es2020",
    "sourceMap": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "baseUrl": "./src",
    "outDir": "./build",
    "types": ["node"],
    "moduleResolution": "Node",
    "declaration": true,
    "declarationMap": false
  },
  "exclude": [
    "node_modules"
  ],
  "type": "module"
}`;

export const appYamlTemplate = `
providers:
  mysql: '@currentjs/provider-mysql'
database: mysql
modules: []`;

export const appTsTemplate = `import { createWebServer } from '@currentjs/router';
import { createTemplateEngine } from '@currentjs/templating';
import * as path from 'path';

/** DO NOT CHANGE THESE LINES **/
${GENERATOR_MARKERS.CONTROLLERS_START}
${GENERATOR_MARKERS.CONTROLLERS_END}
/** END OF DO NOT CHANGE THESE LINES **/

export async function main() {
  await Promise.all(Object.values(providers).map(provider => provider.init()));
  const webDir = path.join(process.cwd(), 'web');
  const renderEngine = createTemplateEngine({ directories: [process.cwd()] });
  const app = createWebServer({ controllers, webDir }, { 
    port: 3000, 
    renderer: (template, data, layout) => {
      try {
        return layout ? renderEngine.renderWithLayout(layout, template, data) : renderEngine.render(template, data);
      } catch (e) {
        return String(e instanceof Error ? e.message : e);
      }
    },
    errorTemplate: 'error'
  });
  await app.listen();
  console.log('Server started on http://localhost:3000');

  const handleTermination = async () => {
    try { await app.close(); } catch {}
    const shutdowns = Object.values(providers).map(provider => provider.shutdown ?? (() => {}));
    await Promise.all(shutdowns);
    process.exit(0);
  };

  process.on('SIGINT', handleTermination);
  process.on('SIGTERM', handleTermination);
}

void main();
`;

export const mainViewTemplate = `<!-- @template name="main_view" -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your App</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN" crossorigin="anonymous">
  <script src="/app.js"></script>
</head>
<body>
  <div class="container-fluid">
    <div id="main">{{ content }}</div>
  </div>
</body>
</html>
`;

export const errorTemplate = `<!-- @template name="error" -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Your App</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN" crossorigin="anonymous">
  <script src="/app.js"></script>
</head>
<body>
  <div class="container-fluid">
    <div class="row justify-content-center">
      <div class="col-md-6">
        <div class="text-center mt-5">
          <div class="display-1 text-danger fw-bold mb-3">{{ statusCode }}</div>
          <h2 class="mb-3">Oops! Something went wrong</h2>
          <p class="text-muted mb-4">{{ error }}</p>
          <div class="d-flex gap-2 justify-content-center">
            <button class="btn btn-primary" onclick="window.history.back()">Go Back</button>
            <a href="/" class="btn btn-outline-secondary">Home Page</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

export const frontendScriptTemplate = fs.readFileSync(path.join(__dirname, 'data', 'frontendScriptTemplate'), 'utf8');

export const translationsTemplate = `{
  "ru": {
    "error": "ошибка",
    "success": "успешно",
    "Reloading page...": "Перезагрузка страницы...",
    "Request failed. Please try again.": "Запрос не выполнен. Попробуйте еще раз.",
    "This field is required": "Это поле обязательно",
    "An error occurred": "Произошла ошибка",
    "saved successfully": "успешно сохранено",
    "updated successfully": "успешно обновлено",
    "deleted successfully": "успешно удалено"
  },
  "pl": {
    "error": "błąd",
    "success": "sukces",
    "Reloading page...": "Przeładowywanie strony...",
    "Request failed. Please try again.": "Żądanie nie powiodło się. Spróbuj ponownie.",
    "This field is required": "To pole jest wymagane",
    "An error occurred": "Wystąpił błąd",
    "saved successfully": "zapisano pomyślnie",
    "updated successfully": "zaktualizowano pomyślnie",
    "deleted successfully": "usunięto pomyślnie"
  },
  "es": {
    "error": "error",
    "success": "éxito",
    "Reloading page...": "Recargando página...",
    "Request failed. Please try again.": "La solicitud falló. Por favor, inténtelo de nuevo.",
    "This field is required": "Este campo es obligatorio",
    "An error occurred": "Ha ocurrido un error",
    "saved successfully": "guardado exitosamente",
    "updated successfully": "actualizado exitosamente",
    "deleted successfully": "eliminado exitosamente"
  },
  "de": {
    "error": "Fehler",
    "success": "Erfolg",
    "Reloading page...": "Seite wird neu geladen...",
    "Request failed. Please try again.": "Anfrage fehlgeschlagen. Bitte versuchen Sie es erneut.",
    "This field is required": "Dieses Feld ist erforderlich",
    "An error occurred": "Ein Fehler ist aufgetreten",
    "saved successfully": "erfolgreich gespeichert",
    "updated successfully": "erfolgreich aktualisiert",
    "deleted successfully": "erfolgreich gelöscht"
  },
  "pt": {
    "error": "erro",
    "success": "sucesso",
    "Reloading page...": "Recarregando página...",
    "Request failed. Please try again.": "A solicitação falhou. Por favor, tente novamente.",
    "This field is required": "Este campo é obrigatório",
    "An error occurred": "Ocorreu um erro",
    "saved successfully": "salvo com sucesso",
    "updated successfully": "atualizado com sucesso",
    "deleted successfully": "excluído com sucesso"
  },
  "zh": {
    "error": "错误",
    "success": "成功",
    "Reloading page...": "正在重新加载页面...",
    "Request failed. Please try again.": "请求失败。请再试一次。",
    "This field is required": "此字段为必填项",
    "An error occurred": "发生错误",
    "saved successfully": "保存成功",
    "updated successfully": "更新成功",
    "deleted successfully": "删除成功"
  }
}`;

export const cursorRulesTemplate = `# CurrentJS Framework Rules

## Architecture Overview
This is a CurrentJS framework application using clean architecture principles with the following layers:
- **Controllers**: Handle HTTP requests/responses and route handling
- **Services**: Contain business logic and orchestrate operations
- **Stores**: Provide data access layer and database operations
- **Domain Entities**: Core business models
- **Views**: HTML templates for server-side rendering

## Commands

\`\`\`bash
current create module Modulename # Creates "Modulename" with default structure and yaml file
\`\`\`
\`\`\`bash
current generate Modulename # Generates all TypeScript files based on the module's yaml, and runs "npm run build"
current generate # Does the same as above, but for all modules
\`\`\`
\`\`\`bash
current commit [files...] # Commits all changes in the code, so they won't be overwritten after regeneration
current diff [module] # Show differences between generated and current code
\`\`\`

## The flow
1. Create an empty app (\`current create app\`) – this step is already done.
2. Create a new module: \`current create module Name\`
3. In the module's yaml file, define module's:
 - model(s)
 - routes & actions
 - permissions
4. Generate TypeScript files: \`current generate Name\`
5. If required, make changes in the:
 - model (i.e. some specific business rules or validations)
 - views
6. Commit those changes: \`current commit\`

--- If needed more than CRUD: ---

7. Define action in the service by creating a method
8. Describe this action in the module's yaml. Additionaly, you may define routes and permissions.
9. \`current generate Modulename\`
10. commit changes: \`current commit\`

## Configuration Files

### Application Configuration (app.yaml)

**Do not modify this file**

### Module Configuration (modulename.yaml)

**The most work must be done in these files**

**Complete Module Example:**
\`\`\`yaml
models:
  - name: Post                          # Entity name (capitalized)
    fields:
      - name: title                     # Field name
        type: string                    # Field type: string, number, boolean, datetime
        required: true                  # Validation requirement
      - name: content
        type: string
        required: true
      - name: authorId
        type: number
        required: true
      - name: publishedAt
        type: datetime
        required: false
      - name: status
        type: string
        required: true

api:                                    # REST API configuration
  prefix: /api/posts                    # Base URL for API endpoints
  model: Post                           # Optional: which model this API serves (defaults to first model)
  endpoints:
    - method: GET                       # HTTP method
      path: /                           # Relative path (becomes /api/posts/)
      action: list                      # Action name (references actions section)
    - method: GET
      path: /:id                        # Path parameter
      action: get
    - method: POST
      path: /
      action: create
    - method: PUT
      path: /:id
      action: update
    - method: DELETE
      path: /:id
      action: delete
    - method: POST                      # Custom endpoint
      path: /:id/publish
      action: publish
      model: Post                       # Optional: override model for specific endpoint

routes:                                 # Web interface configuration
  prefix: /posts                        # Base URL for web pages
  model: Post                           # Optional: which model this route serves (defaults to first model)
  strategy: [toast, back]               # Default success strategies for forms
  endpoints:
    - path: /                           # List page
      action: list
      view: postList                    # Template name
    - path: /:id                        # Detail page
      action: get
      view: postDetail
    - path: /create                     # Create form page
      action: empty                     # No data loading action
      view: postCreate
    - path: /:id/edit                   # Edit form page
      action: get                       # Load existing data
      view: postUpdate
      model: Post                       # Optional: override model for specific endpoint

actions:                                # Business logic mapping
  list:
    handlers: [Post:default:list]       # Use built-in list handler
  get:
    handlers: [Post:default:get]    # Use built-in get handler
  create:
    handlers: [Post:default:create]     # Built-in create
  update:
    handlers: [Post:default:update]
  delete:
    handlers: [                         # Chain multiple handlers
      Post:checkCanDelete,              # Custom business logic
      Post:default:delete
    ]
  publish:                              # Custom action
    handlers: [
      Post:default:get,             # Fetch entity
      Post:validateForPublish,          # Custom validation
      Post:updatePublishStatus          # Custom update logic
    ]

permissions:                            # Role-based access control
  - role: all
    actions: [list, get]                # Anyone (including anonymous)
  - role: authenticated
    actions: [create]                   # Must be logged in
  - role: owner
    actions: [update, publish]          # Entity owner permissions
  - role: admin
    actions: [update, delete, publish]  # Admin role permissions
  - role: editor
    actions: [publish]                  # Editor role permissions
\`\`\`

**Make sure no \`ID\`/\`owner id\`/\`is deleted\` fields are present in the model definition, since it's added automatically**

**Field Types:**
- \`string\` - Text data
- \`number\` - Numeric data (integer or float)
- \`boolean\` - True/false values
- \`datetime\` - Date and time values
- \`ModelName\` - Relationship to another model (e.g., \`Owner\`, \`User\`, \`Post\`)

**Multi-Model Endpoint Configuration:**

When working with multiple models in a single module, you have flexible options:

**Option 1: Per-Endpoint Model Override**

Specify \`model\` on individual endpoints to override the section default:

\`\`\`yaml
models:
  - name: Cat
  - name: Person

routes:
  prefix: /cat
  model: Cat  # Default for this section
  endpoints:
    - path: /create
      view: catCreate
      # Uses Cat model
    
    - path: /createOwner
      view: ownerCreate
      model: Person  # Override for this endpoint
\`\`\`

**Option 2: Multiple API/Routes Sections**

Use arrays to organize endpoints by model:

\`\`\`yaml
routes:
  - prefix: /cat
    model: Cat
    endpoints: [...]
  
  - prefix: /person
    model: Person
    endpoints: [...]

# Same works for api sections
api:
  - prefix: /api/cat
    model: Cat
    endpoints: [...]
  
  - prefix: /api/person
    model: Person
    endpoints: [...]
\`\`\`

**Model Resolution Priority:**
1. \`endpoint.model\` (explicit override)
2. Inferred from action handler (e.g., \`Person:default:create\`)
3. \`api.model\` or \`routes.model\` (section default)
4. First model in \`models[]\` array (fallback)

**Model Relationships:**

Define relationships by using another model's name as the field type:

\`\`\`yaml
models:
  - name: Owner
    fields:
      - name: name
        type: string
        required: true

  - name: Cat
    fields:
      - name: name
        type: string
        required: true
      - name: owner
        type: Owner        # Creates relationship with Owner model
        required: true     # Auto-generates foreign key: ownerId
        displayFields: [name]  # Optional: fields to show in dropdowns
\`\`\`

**Generated Behavior:**
- **Domain Model**: Rich object with \`owner: Owner\` (full object, not just ID)
- **DTOs**: Use \`ownerId: number\` for API requests
- **Database**: Stores \`ownerId\` foreign key column (references \`Owner.id\`)
- **Store**: Automatically loads the related Owner object when fetching a Cat
- **HTML Forms**: Auto-generates select dropdown with "Create New" button
- **TypeScript**: Full type safety with proper imports

**Naming Convention:**
Foreign keys are auto-generated following the pattern \`fieldName + 'Id'\`:
- \`owner\` → \`ownerId\`
- \`author\` → \`authorId\`
- \`parentComment\` → \`parentCommentId\`

The foreign key always references the \`id\` field of the related model.

**🔄 Handler vs Action Architecture:**
- **Handler**: Creates a separate service method (one handler = one service method)
- **Action**: Virtual controller concept that calls handler methods step-by-step

**Built-in Action Handlers:**
- \`ModelName:default:list\` - Creates service method with pagination parameters
- \`ModelName:default:get\` - Creates service method named \`get\` with ID parameter
- \`ModelName:default:create\` - Creates service method with DTO parameter
- \`ModelName:default:update\` - Creates service method with ID and DTO parameters
- \`ModelName:default:delete\` - Creates service method with ID parameter

**Custom Action Handlers:**
- \`ModelName:customMethodName\` - Creates service method that accepts \`result, context\` parameters
- \`result\`: Result from previous handler (or \`null\` if it's the first handler)
- \`context\`: The request context object
- Each handler generates a separate method in the service
- User can customize the implementation after generation

**🔗 Multiple Handlers per Action:**
When an action has multiple handlers, each handler generates a separate service method, and the controller action calls them sequentially. The action returns the result from the last handler.

**Parameter Passing Rules:**
- **Default handlers** (\`:default:\`): Receive standard parameters (id, pagination, DTO, etc.)
- **Custom handlers**: Receive \`(result, context)\` where:
  - \`result\`: Result from previous handler, or \`null\` if it's the first handler
  - \`context\`: Request context object

**Handler Format Examples:**
- \`Post:default:list\` - Creates Post service method \`list(page, limit)\`
- \`Post:default:get\` - Creates Post service method \`get(id)\`
- \`Post:validateContent\` - Creates Post service method \`validateContent(result, context)\`
- \`Comment:notifySubscribers\` - Creates Comment service method \`notifySubscribers(result, context)\`

**Strategy Options (for forms):**
- \`toast\` - Success toast notification
- \`back\` - Navigate back in browser history
- \`message\` - Inline success message
- \`modal\` - Modal success dialog
- \`redirect\` - Redirect to specific URL
- \`refresh\` - Reload current page

**Permission Roles:**
- \`all\` - Anyone (including anonymous users)
- \`authenticated\` - Any logged-in user
- \`owner\` - User who created the entity
- \`admin\`, \`editor\`, \`user\` - Custom roles from JWT token
- Multiple roles can be specified for each action

**Generated Files from Configuration:**
- Domain entity class (one per model)
- Service class (one per model)
- API controller with REST endpoints (one per model)
- Web controller with page rendering (one per model)
- Store class with database operations (one per model)
- HTML templates for all views
- TypeScript interfaces and DTOs

**Multi-Model Support:**
- Each model gets its own service, controller, and store
- Use \`model\` parameter in \`api\` and \`routes\` to specify which model to use (defaults to first model)
- Use \`model\` parameter on individual endpoints to override model for specific endpoints
- Action handlers use \`modelname:action\` format to specify which model's service method to call
- Controllers and services are generated per model, not per module

## Module Structure
\`\`\`
src/modules/ModuleName/
├── application/
│   ├── services/ModuleService.ts      # Business logic
│   └── validation/ModuleValidation.ts # DTOs and validation
├── domain/
│   └── entities/Module.ts             # Domain model
├── infrastructure/
│   ├── controllers/
│   │   ├── ModuleApiController.ts     # REST API endpoints
│   │   └── ModuleWebController.ts     # Web page controllers
│   ├── interfaces/StoreInterface.ts   # Data access interface
│   └── stores/ModuleStore.ts          # Data access implementation
├── views/
│   ├── modulelist.html               # List view template
│   ├── moduledetail.html             # Detail view template
│   ├── modulecreate.html             # Create form template
│   └── moduleupdate.html             # Update form template
└── module.yaml                       # Module configuration
\`\`\`

## Best Practices

- Use Domain Driven Design and Clean Architecture (kind of).
- Prefer declarative configuration over imperative programming: when possible, change yamls instead of writing the code. Write the code only when it's really neccessary.
- CRUD operation are autogenerated (first in module's yaml, then in the generated code).
- If some custom action is needed, then it has to be defined in the **Service** then just put this action to the module's yaml. You may also define new methods in the *Store* and its interface (if needed).
- Business rules must be defined only in models. That also applies to business rules validations (in contrast to *just* validations: e.g. if field exists and is of needed type – then validators are in use)

## Core Package APIs (For Generated Code)

### @currentjs/router - Controller Decorators & Context

**Decorators (in controllers):**
\`\`\`typescript
@Controller('/api/posts')  // Base path for controller
@Get('/')                  // GET endpoint
@Get('/:id')              // GET with path parameter
@Post('/')                // POST endpoint
@Put('/:id')              // PUT endpoint
@Delete('/:id')           // DELETE endpoint
@Render('template', 'layout')  // For web controllers
\`\`\`

**Context Object (in route handlers):**
\`\`\`typescript
interface IContext {
  request: {
    url: string;
    path: string;
    method: string;
    parameters: Record<string, string | number>; // Path params + query params
    body: any; // Parsed JSON or raw string
    headers: Record<string, string | string[]>;
    user?: AuthenticatedUser; // Parsed JWT user if authenticated
  };
  response: Record<string, any>;
}

// Usage examples
const id = parseInt(ctx.request.parameters.id as string);
const page = parseInt(ctx.request.parameters.page as string) || 1;
const payload = ctx.request.body;
const user = ctx.request.user; // If authenticated
\`\`\`

**Authentication Support:**
- JWT tokens parsed automatically from \`Authorization: Bearer <token>\` header
- User object available at \`ctx.request.user\` with \`id\`, \`email\`, \`role\` fields
- No manual setup required in generated code

### @currentjs/templating - Template Syntax

**Variables & Data Access:**
\`\`\`html
{{ variableName }}
{{ object.property }}
{{ $root.arrayData }}     <!-- Access root data -->
{{ $index }}              <!-- Loop index -->
\`\`\`

**Control Structures:**
\`\`\`html
<!-- Loops -->
<tbody x-for="$root" x-row="item">
  <tr>
    <td>{{ item.name }}</td>
    <td>{{ $index }}</td>
  </tr>
</tbody>

<!-- Conditionals -->
<div x-if="user.isAdmin">Admin content</div>
<span x-if="errors.name">{{ errors.name }}</span>

<!-- Template includes -->
<userCard name="{{ user.name }}" role="admin" />
\`\`\`

**Layout Integration:**
- Templates use \`<!-- @template name="templateName" -->\` header
- Main layout gets \`{{ content }}\` variable
- Forms use \`{{ formData.field || '' }}\` for default values

### @currentjs/provider-mysql - Database Operations

**Query Execution (in stores):**
\`\`\`typescript
// Named parameters (preferred)
const result = await this.db.query(
  'SELECT * FROM users WHERE status = :status AND age > :minAge',
  { status: 'active', minAge: 18 }
);

// Result handling
if (result.success && result.data.length > 0) {
  return result.data.map(row => this.rowToModel(row));
}
\`\`\`

**Common Query Patterns:**
\`\`\`typescript
// Insert with auto-generated fields
const row = { ...data, created_at: new Date(), updated_at: new Date() };
const result = await this.db.query(
  \`INSERT INTO table_name (\${fields.join(', ')}) VALUES (\${placeholders})\`,
  row
);
const newId = result.insertId;

// Update with validation
const query = \`UPDATE table_name SET \${updateFields.join(', ')}, updated_at = :updated_at WHERE id = :id\`;
await this.db.query(query, { ...updateData, updated_at: new Date(), id });

// Soft delete
await this.db.query(
  'UPDATE table_name SET deleted_at = :deleted_at WHERE id = :id',
  { deleted_at: new Date(), id }
);
\`\`\`

**Error Handling:**
\`\`\`typescript
try {
  const result = await this.db.query(query, params);
} catch (error) {
  if (error instanceof MySQLConnectionError) {
    throw new Error(\`Database connection error: \${error.message}\`);
  } else if (error instanceof MySQLQueryError) {
    throw new Error(\`Query error: \${error.message}\`);
  }
  throw error;
}
\`\`\`

## Frontend System (web/app.js)

### Translation System

**Basic Usage:**
\`\`\`javascript
// Translate strings
App.lang.t('Hello World')  // Returns translated version or original
App.lang.t('Save changes')

// Set language
App.lang.set('pl')     // Switch to Polish
App.lang.set('en')     // Switch to English
App.lang.get()         // Get current language code
\`\`\`

**Translation File (web/translations.json):**
\`\`\`json
{
  "pl": {
    "Hello World": "Witaj Świecie",
    "Save changes": "Zapisz zmiany",
    "Delete": "Usuń"
  },
  "ru": {
    "Hello World": "Привет мир",
    "Save changes": "Сохранить изменения"
  }
}
\`\`\`

### UI Feedback & Notifications

**Toast Notifications:**
\`\`\`javascript
App.ui.showToast('Success message', 'success')  // Green toast
App.ui.showToast('Error occurred', 'error')     // Red toast  
App.ui.showToast('Information', 'info')         // Blue toast
App.ui.showToast('Warning', 'warning')          // Yellow toast
\`\`\`

**Inline Messages:**
\`\`\`javascript
App.ui.showMessage('messageId', 'Success!', 'success')
App.ui.showMessage('errorContainer', 'Validation failed', 'error')
\`\`\`

**Modal Dialogs:**
\`\`\`javascript
App.ui.showModal('confirmModal', 'Item saved successfully', 'success')
App.ui.showModal('errorModal', 'Operation failed', 'error')
\`\`\`

### Navigation & Page Actions

**Navigation Functions:**
\`\`\`javascript
// SPA-style navigation
App.nav.go('/posts/123')  // Loads via AJAX, updates #main

// Or use native browser APIs directly
window.history.back()      // Go back in history
window.location.href = '/posts'  // Full page redirect
window.location.reload()   // Reload page
\`\`\`

### Form Handling & Strategy System

**Form Strategy Configuration:**
\`\`\`html
<!-- Form with strategy attributes -->
<form data-strategy='["toast", "back"]' 
      data-entity-name="Post"
      data-field-types='{"age": "number", "active": "boolean"}'>
  <input name="title" type="text" required>
  <input name="age" type="number">
  <input name="active" type="checkbox">
  <button type="submit">Save</button>
</form>
\`\`\`

**Available Strategies:**
- \`toast\` - Show success toast notification
- \`back\` - Navigate back using browser history
- \`message\` - Show inline message in specific element
- \`modal\` - Show modal dialog
- \`redirect\` - Redirect to specific URL
- \`refresh\` - Reload the page
- \`remove\` - Remove form element

**Manual Form Submission:**
\`\`\`javascript
const form = document.querySelector('#myForm');
App.nav.submit(form, ['toast', 'back'], {
  entityName: 'Post',
  basePath: '/posts',
  messageId: 'form-message'
});
\`\`\`

### Loading States & Utilities

**Loading Indicators:**
\`\`\`javascript
App.ui.showLoading('#form')      // Show spinner on form
App.ui.hideLoading('#form')      // Hide spinner
App.ui.showLoading('#main')      // Show spinner on main content
\`\`\`

**Utility Functions:**
\`\`\`javascript
App.utils.debounce(searchFunction, 300)  // Debounce for search inputs
App.utils.$('#selector')                  // Safe element selection
\`\`\`

### Event Handling & SPA Integration

**Automatic Link Handling:**
- Internal links automatically use AJAX navigation
- External links work normally
- Links with \`data-external\` skip AJAX handling

**Automatic Form Handling:**
- Forms with \`data-strategy\` use AJAX submission
- Regular forms work normally
- Automatic JSON conversion from FormData

**Custom Event Listeners:**
\`\`\`javascript
// Re-initialize after dynamic content loading
App.utils.initializeEventListeners();

// Handle specific link navigation
document.querySelector('#myLink').addEventListener('click', (e) => {
  e.preventDefault();
  App.nav.go('/custom/path');
});
\`\`\`

### Global App Object

**Accessing Functions:**
\`\`\`javascript
// All functions available under window.App
// Organized by category for better discoverability

// UI Functions
App.ui.showToast('Message', 'success');
App.ui.showMessage('elementId', 'Success!', 'success');
App.ui.showModal('modalId', 'Done!', 'success');
App.ui.showLoading('#form');
App.ui.hideLoading('#form');

// Navigation Functions
App.nav.go('/posts/123');  // SPA-style navigation with AJAX
App.nav.submit(formElement, ['toast', 'back'], options);  // Submit form via AJAX

// Translation Functions
App.lang.t('Translate this');  // Translate string
App.lang.set('pl');  // Set language
App.lang.get();  // Get current language

// Utility Functions
App.utils.$('#selector');  // Safe element selection
App.utils.debounce(fn, 300);  // Debounce function
App.utils.initializeEventListeners();  // Re-initialize after dynamic content

// Authentication Functions (JWT)
App.auth.setAuthToken(token);  // Store JWT token
App.auth.clearAuthToken();  // Remove JWT token
App.auth.buildAuthHeaders(additionalHeaders);  // Build headers with auth token
\`\`\`

### Template Data Binding
\`\`\`html
<!-- List with pagination -->
<tbody x-for="modules" x-row="module">
  <tr>
    <td>{{ module.name }}</td>
    <td><a href="/module/{{ module.id }}">View</a></td>
  </tr>
</tbody>

<!-- Form with validation errors -->
<div x-if="errors.name" class="text-danger">{{ errors.name }}</div>
<input type="text" name="name" value="{{ formData.name || '' }}" class="form-control">

<!-- Form with strategy attributes -->
<form data-strategy='["toast", "back"]' 
      data-entity-name="Module"
      data-field-types='{"count": "number", "active": "boolean"}'>
  <!-- form fields -->
</form>
\`\`\`
`;

// Directory structure constants
export const DEFAULT_DIRECTORIES = {
  SRC: 'src',
  DIST: 'build', 
  WEB: 'web',
  TEMPLATES: path.join('src', 'common', 'ui', 'templates'),
  SERVICES: path.join('src', 'common', 'services'),
  MIGRATIONS: 'migrations'
} as const;

// File names constants
export const DEFAULT_FILES = {
  PACKAGE_JSON: 'package.json',
  TSCONFIG: 'tsconfig.json',
  APP_YAML: 'app.yaml',
  APP_TS: 'app.ts',
  MAIN_VIEW: 'main_view.html',
  ERROR_TEMPLATE: 'error.html',
  FRONTEND_SCRIPT: 'app.js',
  TRANSLATIONS: 'translations.json',
  CURSOR_RULES: '.cursorrules'
} as const;
