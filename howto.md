# CurrentJS Framework Rules

## Architecture Overview
This is a CurrentJS framework application using clean architecture principles with the following layers:
- **Controllers**: Handle HTTP requests/responses and route handling
- **Services**: Contain business logic and orchestrate operations
- **Stores**: Provide data access layer and database operations
- **Domain Entities**: Core business models
- **Views**: HTML templates for server-side rendering

## Commands

```bash
current create module Modulename # Creates "Modulename" with default structure and yaml file
```
```bash
current generate Modulename # Generates all TypeScript files based on the module's yaml
current generate # Does the same as above, but for all modules
```
```bash
current commit [files...] # Commits all changes in the code, so they won't be overwritten after regeneration
current diff [module] # Show differences between generated and current code
```

## The flow
1. Create an empty app (`current create app`)
2. Create a new module: `current create module Name`
3. In the module's yaml file, define module's:
 - model(s)
 - routes & actions
 - permissions
4. Generate TypeScript files: `current generate Name`
5. If required, make changes in the:
 - model (i.e. some specific business rules or validations)
 - views
6. Commit those changes: `current commit`

--- If needed more than CRUD: ---

7. Define action in the service by creating a method
8. Describe this action in the module's yaml. Additionaly, you may define routes and permissions.
9. `current generate Modulename`
10. commit changes: `current commit`

## Configuration Files

### Application Configuration (app.yaml)

**Do not modify this file**

### Module Configuration (modulename.yaml)

**The most work must be done in these files**

**Complete Module Example:**
```yaml
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

routes:                                 # Web interface configuration
  prefix: /posts                        # Base URL for web pages
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
```

**Make sure no `ID`/`owner id`/`is deleted` fields are present in the model definition, since it's added automatically**

**Field Types:**
- `string` - Text data
- `number` - Numeric data (integer or float)
- `boolean` - True/false values
- `datetime` - Date and time values

**🔄 Handler vs Action Architecture:**
- **Handler**: Creates a separate service method (one handler = one service method)
- **Action**: Virtual controller concept that calls handler methods step-by-step

**Built-in Action Handlers:**
- `ModelName:default:list` - Creates service method with pagination parameters
- `ModelName:default:get` - Creates service method named `get` with ID parameter
- `ModelName:default:create` - Creates service method with DTO parameter
- `ModelName:default:update` - Creates service method with ID and DTO parameters
- `ModelName:default:delete` - Creates service method with ID parameter

**Custom Action Handlers:**
- `ModelName:customMethodName` - Creates service method that accepts `result, context` parameters
- `result`: Result from previous handler (or `null` if it's the first handler)
- `context`: The request context object
- Each handler generates a separate method in the service
- User can customize the implementation after generation

**🔗 Multiple Handlers per Action:**
When an action has multiple handlers, each handler generates a separate service method, and the controller action calls them sequentially. The action returns the result from the last handler.

**Parameter Passing Rules:**
- **Default handlers** (`:default:`): Receive standard parameters (id, pagination, DTO, etc.)
- **Custom handlers**: Receive `(result, context)` where:
  - `result`: Result from previous handler, or `null` if it's the first handler
  - `context`: Request context object

**Handler Format Examples:**
- `Post:default:list` - Creates Post service method `list(page, limit)`
- `Post:default:get` - Creates Post service method `get(id)`
- `Post:validateContent` - Creates Post service method `validateContent(result, context)`
- `Comment:notifySubscribers` - Creates Comment service method `notifySubscribers(result, context)`

**Strategy Options (for forms):**
- `toast` - Success toast notification
- `back` - Navigate back in browser history
- `message` - Inline success message
- `modal` - Modal success dialog
- `redirect` - Redirect to specific URL
- `refresh` - Reload current page

**Permission Roles:**
- `all` - Anyone (including anonymous users)
- `authenticated` - Any logged-in user
- `owner` - User who created the entity
- `admin`, `editor`, `user` - Custom roles from JWT token
- Multiple roles can be specified for each action

**Generated Files from Configuration:**
- Domain entity class
- Service class
- API controller with REST endpoints
- Web controller with page rendering
- Store class with database operations
- HTML templates for all views
- TypeScript interfaces and DTOs

## Module Structure
```
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
```

## Best Practices

- Use Domain Driven Design and Clean Architecture (kind of).
- Prefer declarative configuration over imperative programming: when possible, change yamls instead of writing the code. Write the code only when it's really neccessary.
- CRUD operation are autogenerated (first in module's yaml, then in the generated code).
- If some custom action is needed, then it has to be defined in the **Service** then just put this action to the module's yaml. You may also define new methods in the *Store* and its interface (if needed).
- Business rules must be defined only in models. That also applies to business rules validations (in contrast to *just* validations: e.g. if field exists and is of needed type – then validators are in use)

## Core Package APIs (For Generated Code)

### @currentjs/router - Controller Decorators & Context

**Decorators (in controllers):**
```typescript
@Controller('/api/posts')  // Base path for controller
@Get('/')                  // GET endpoint
@Get('/:id')              // GET with path parameter
@Post('/')                // POST endpoint
@Put('/:id')              // PUT endpoint
@Delete('/:id')           // DELETE endpoint
@Render('template', 'layout')  // For web controllers
```

**Context Object (in route handlers):**
```typescript
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
```

**Authentication Support:**
- JWT tokens parsed automatically from `Authorization: Bearer <token>` header
- User object available at `ctx.request.user` with `id`, `email`, `role` fields
- No manual setup required in generated code

### @currentjs/templating - Template Syntax

**Variables & Data Access:**
```html
{{ variableName }}
{{ object.property }}
{{ $root.arrayData }}     <!-- Access root data -->
{{ $index }}              <!-- Loop index -->
```

**Control Structures:**
```html
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
```

**Layout Integration:**
- Templates use `<!-- @template name="templateName" -->` header
- Main layout gets `{{ content }}` variable
- Forms use `{{ formData.field || '' }}` for default values

### @currentjs/provider-mysql - Database Operations

**Query Execution (in stores):**
```typescript
// Named parameters (preferred)
const result = await this.db.query(
  'SELECT * FROM users WHERE status = :status AND age > :minAge',
  { status: 'active', minAge: 18 }
);

// Result handling
if (result.success && result.data.length > 0) {
  return result.data.map(row => this.rowToModel(row));
}
```

**Common Query Patterns:**
```typescript
// Insert with auto-generated fields
const row = { ...data, created_at: new Date(), updated_at: new Date() };
const result = await this.db.query(
  `INSERT INTO table_name (${fields.join(', ')}) VALUES (${placeholders})`,
  row
);
const newId = result.insertId;

// Update with validation
const query = `UPDATE table_name SET ${updateFields.join(', ')}, updated_at = :updated_at WHERE id = :id`;
await this.db.query(query, { ...updateData, updated_at: new Date(), id });

// Soft delete
await this.db.query(
  'UPDATE table_name SET deleted_at = :deleted_at WHERE id = :id',
  { deleted_at: new Date(), id }
);
```

**Error Handling:**
```typescript
try {
  const result = await this.db.query(query, params);
} catch (error) {
  if (error instanceof MySQLConnectionError) {
    throw new Error(`Database connection error: ${error.message}`);
  } else if (error instanceof MySQLQueryError) {
    throw new Error(`Query error: ${error.message}`);
  }
  throw error;
}
```

## Frontend System (web/app.js)

### Translation System

**Basic Usage:**
```javascript
// Translate strings
t('Hello World')  // Returns translated version or original
t('Save changes')

// Set language
setLang('pl')     // Switch to Polish
setLang('en')     // Switch to English
getCurrentLanguage()  // Get current language code
```

**Translation File (web/translations.json):**
```json
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
```

### UI Feedback & Notifications

**Toast Notifications:**
```javascript
showToast('Success message', 'success')  // Green toast
showToast('Error occurred', 'error')     // Red toast  
showToast('Information', 'info')         // Blue toast
showToast('Warning', 'warning')          // Yellow toast
```

**Inline Messages:**
```javascript
showMessage('messageId', 'Success!', 'success')
showMessage('errorContainer', 'Validation failed', 'error')
```

**Modal Dialogs:**
```javascript
showModal('confirmModal', 'Item saved successfully', 'success')
showModal('errorModal', 'Operation failed', 'error')
```

### Navigation & Page Actions

**Navigation Functions:**
```javascript
navigateBack()              // Go back in history or to home
redirectTo('/posts')        // Safe redirect with validation
reloadPage()               // Reload with loading indicator
refreshSection('#content') // Refresh specific section

// SPA-style navigation
navigateToPage('/posts/123')  // Loads via AJAX, updates #main
```

**Content Management:**
```javascript
updateContent('#results', newHtml, 'replace')  // Replace content
updateContent('#list', itemHtml, 'append')     // Add to end
updateContent('#list', itemHtml, 'prepend')    // Add to beginning
removeElement('#item-123')                     // Animate and remove
```

### Form Handling & Strategy System

**Form Strategy Configuration:**
```html
<!-- Form with strategy attributes -->
<form data-strategy='["toast", "back"]' 
      data-entity-name="Post"
      data-field-types='{"age": "number", "active": "boolean"}'>
  <input name="title" type="text" required>
  <input name="age" type="number">
  <input name="active" type="checkbox">
  <button type="submit">Save</button>
</form>
```

**Available Strategies:**
- `toast` - Show success toast notification
- `back` - Navigate back using browser history
- `message` - Show inline message in specific element
- `modal` - Show modal dialog
- `redirect` - Redirect to specific URL
- `refresh` - Reload the page
- `remove` - Remove form element

**Manual Form Submission:**
```javascript
const form = document.querySelector('#myForm');
submitForm(form, ['toast', 'back'], {
  entityName: 'Post',
  basePath: '/posts',
  messageId: 'form-message'
});
```

**Success Handling:**
```javascript
handleFormSuccess(response, ['toast', 'back'], {
  entityName: 'Post',
  basePath: '/posts',
  messageId: 'success-msg',
  modalId: 'success-modal'
});
```

### Form Validation & Type Conversion

**Client-side Validation Setup:**
```javascript
setupFormValidation('#createForm');  // Adds required field validation
```

**Field Type Conversion:**
```javascript
// Automatic conversion based on data-field-types
convertFieldValue('123', 'number')    // Returns 123 (number)
convertFieldValue('true', 'boolean')  // Returns true (boolean)
convertFieldValue('text', 'string')   // Returns 'text' (string)
```

### Loading States & Utilities

**Loading Indicators:**
```javascript
showLoading('#form')      // Show spinner on form
hideLoading('#form')      // Hide spinner
showLoading('#main')      // Show spinner on main content
```

**Utility Functions:**
```javascript
debounce(searchFunction, 300)  // Debounce for search inputs
getElementSafely('#selector') // Safe element selection
clearForm('#myForm')          // Reset form and clear validation
```

### Event Handling & SPA Integration

**Automatic Link Handling:**
- Internal links automatically use AJAX navigation
- External links work normally
- Links with `data-external` skip AJAX handling

**Automatic Form Handling:**
- Forms with `data-strategy` use AJAX submission
- Regular forms work normally
- Automatic JSON conversion from FormData

**Custom Event Listeners:**
```javascript
// Re-initialize after dynamic content loading
initializeEventListeners();

// Handle specific link navigation
document.querySelector('#myLink').addEventListener('click', (e) => {
  e.preventDefault();
  navigateToPage('/custom/path');
});
```

### Global App Object

**Accessing Functions:**
```javascript
// All functions available under window.App
App.showToast('Message', 'success');
App.navigateBack();
App.t('Translate this');
App.setLang('pl');
App.showLoading('#content');
```

### Template Data Binding
```html
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
```