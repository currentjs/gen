# @currentjs/gen 🚀

> *"Because writing boilerplate code is like doing laundry - necessary, tedious, and something a machine should definitely handle for you."*

A CLI code generator that transforms YAML specifications into fully functional TypeScript applications following clean architecture principles. Think of it as the overly enthusiastic intern who actually enjoys writing controllers, services, and domain models all day long.

## Installation 📦

```bash
npm install -g @currentjs/gen
# or use without installing
npx @currentjs/gen
```

## Quick Start 🏃‍♂️

```bash
# Show help
currentjs --help

# Create a new app in the current directory
currentjs init

# Create a new app inside a folder
currentjs init my-app

# Create a module folder under src/modules
currentjs create module Blog

# Generate everything from app.yaml
currentjs generate

# Generate specific module
currentjs generate Blog --yaml app.yaml
```

## Step-by-Step Development Workflow 🔄

### Basic Development Flow

1. **Create an empty app**
   ```bash
   currentjs init # will create an app inside the current directory
   # or:
   currentjs init my-project # will create a directory "my-project" and create an app there
   ```

2. **Create a new module**
   ```bash
   currentjs create module Blog
   ```

3. **Define your module's configuration** in `src/modules/Blog/blog.yaml`:
   - Define your domain (aggregates and value objects)
   - Configure use cases (CRUD is already configured)
   - Set up API and web endpoints with auth

4. **Generate TypeScript files**
   ```bash
   currentjs generate Blog
   ```

5. **Make custom changes** (if needed) to:
   - Business logic in models
   - Custom actions in services
   - HTML templates

6. **Commit your changes** to preserve them
   ```bash
   currentjs commit
   ```

## What Does This Actually Do? 🤔

This generator takes your YAML specifications and creates:

- **🏗️ Complete app structure** with TypeScript, configs, and dependencies
- **📋 Domain entities** from your model definitions
- **🔄 Service layer** with business logic and validation
- **🎭 Controllers** for both API endpoints and web pages
- **💾 Data stores** with database provider integration
- **🎨 HTML templates** using @currentjs/templating
- **📊 Change tracking** so you can modify generated code safely

## Commands Reference 🛠️

> See the [HOW TO](howto.md) reference

### App & Module Creation
```bash
currentjs init [name]                 # Create new application
currentjs create module <name>        # Create new module in existing app
```

### Code Generation
```bash
currentjs generate [module]           # Generate code from YAML specs
  --yaml app.yaml                     # Specify config file (default: ./app.yaml)
  --force                            # Overwrite files without prompting
  --skip                             # Skip conflicts, never overwrite
```

### Advanced Change Management 🔄

The generator includes a sophisticated change tracking system that **revolutionizes how you work with generated code**:

```bash
currentjs diff [module]               # Show differences between generated and current code
currentjs commit [files...]           # Commit your changes to version tracking
currentjs infer --file Entity.ts      # Generate YAML model from existing TypeScript
  --write                            # Write back to module YAML file
```

#### 🚀 **The Revolutionary Approach: Version Control Without Generated Code**

Here's the game-changer: **You don't need to commit generated source code to your repository at all!** 

Instead, you only need to track:
- **Your YAML files** (the source of truth)
- **`registry.json`** (change tracking metadata)
- **Your custom modifications** (stored as reusable "patches")

**Traditional Approach** ❌
```
git/
├── src/modules/Blog/Blog.yaml        # Source specification  
├── src/modules/Blog/domain/entities/Post.ts    # Generated + modified
├── src/modules/Blog/services/PostService.ts    # Generated + modified
└── ... (hundreds of generated files with custom changes)
```

**CurrentJS Approach** ✅
```
git/
├── src/modules/Blog/Blog.yaml        # Source specification
├── registry.json                     # Change tracking metadata
└── .currentjs/commits/               # Your custom modifications as patches
    ├── commit-2024-01-15.json
    └── commit-2024-01-20.json
```

#### 🔧 **How It Works (Like Git for Generated Code)**

**1. Initial Generation**
```bash
currentjs generate
# Creates all files and tracks their hashes in registry.json
```

**2. Make Your Custom Changes**
```typescript
// Edit generated service to add custom logic
export class PostService extends GeneratedPostService {
  async publishPost(id: number): Promise<void> {
    // Your custom business logic here
    const post = await this.getById(id);
    post.publishedAt = new Date();
    await this.update(id, post);
    await this.sendNotificationEmail(post);
  }
}
```

**3. Commit Your Changes**
```bash
currentjs commit src/modules/Blog/services/PostService.ts
# Saves your modifications as reusable "hunks" (like git patches)
```

**4. Regenerate Safely**
```bash
# Change your YAML specification
currentjs generate --force
# Your custom changes are automatically reapplied to the new generated code!
```

#### 📊 **Change Tracking in Action**

```bash
# See what's different from generated baseline
currentjs diff Blog
```

**Sample Output:**
```diff
[modified] src/modules/Blog/services/PostService.ts

@@ -15,0 +16,8 @@
+ 
+   async publishPost(id: number): Promise<void> {
+     const post = await this.getById(id);
+     post.publishedAt = new Date();
+     await this.update(id, post);
+     await this.sendNotificationEmail(post);
+   }
```

#### 🌟 **Workflow Benefits**

**For Solo Development:**
- Cleaner repositories (no generated code noise)
- Fearless regeneration (your changes are always preserved)
- Clear separation between specifications and implementations

**For Team Development:**
- Merge conflicts only happen in YAML files (much simpler)
- Team members can have different generated code locally
- Changes to business logic are tracked separately from schema changes
- New team members just run `currentjs generate` to get up and running

**For CI/CD:**
```bash
# In your deployment pipeline
git clone your-repo
currentjs generate  # Recreates all source code from YAML + patches
npm run deploy
```

**Sharing Customizations:**
```bash
# Export your modifications
git add registry.json .currentjs/
git commit -m "Add custom publish functionality"
git push

# Teammates get your changes
git pull
currentjs generate  # Their code automatically includes your customizations
```

This change management system solves the age-old problem of "generated code vs. version control" by treating your customizations as first-class citizens while keeping your repository clean and merge-friendly!

#### 📝 **Recommended .gitignore Setup**

For the cleanest repository experience, add this to your `.gitignore`:

```gitignore
# Generated source code (will be recreated from YAML + registry)
src/modules/*/domain/entities/*.ts
src/modules/*/domain/valueObjects/*.ts
src/modules/*/application/useCases/*.ts
src/modules/*/application/services/*.ts
src/modules/*/application/dto/*.ts
src/modules/*/infrastructure/controllers/*.ts
src/modules/*/infrastructure/stores/*.ts

# Keep these in version control
!*.yaml
!registry.json
!.currentjs/

# Standard Node.js ignores
node_modules/
build/
dist/
*.log
```

With this setup, your repository stays focused on what matters: your specifications and customizations, not generated boilerplate!

## Multi-Model Endpoint Support 🔀

Working with multiple related models in a single module? In the current YAML format, each model gets its own section in `api` and `web`, keyed by model name:

```yaml
domain:
  aggregates:
    Cat:
      root: true
      fields:
        name: { type: string, required: true }
    Person:
      root: true
      fields:
        name: { type: string, required: true }
        email: { type: string, required: true }

useCases:
  Cat:
    list:
      handlers: [default:list]
    create:
      input: { from: Cat }
      output: { from: Cat }
      handlers: [default:create]
  Person:
    list:
      handlers: [default:list]
    create:
      input: { from: Person }
      output: { from: Person }
      handlers: [default:create]

api:
  Cat:
    prefix: /api/cat
    endpoints:
      - method: GET
        path: /
        useCase: Cat:list
        auth: all
  Person:
    prefix: /api/person
    endpoints:
      - method: GET
        path: /
        useCase: Person:list
        auth: all

web:
  Cat:
    prefix: /cat
    layout: main_view
    pages:
      - path: /
        useCase: Cat:list
        view: catList
        auth: all
      - path: /create
        method: GET
        view: catCreate
        auth: authenticated
  Person:
    prefix: /person
    layout: main_view
    pages:
      - path: /
        useCase: Person:list
        view: personList
        auth: all
      - path: /create
        method: GET
        view: personCreate
        auth: authenticated
```

**Result**: Generates separate controllers, services, use cases, and stores for each model, each with their own base paths and endpoints.

## Example: Building a Blog System 📝

Here's how you'd create a complete very simple blog system:

### 1. Create the app and module
```bash
currentjs init my-blog
cd my-blog
currentjs create module Blog
```

### 2. Define your data model
```yaml
# src/modules/Blog/blog.yaml
# Only the domain fields need to be customized - the rest is auto-generated!
domain:
  aggregates:
    Post:
      root: true
      fields:
        title: { type: string, required: true }
        content: { type: string, required: true }
        authorEmail: { type: string, required: true }
        publishedAt: { type: datetime }

# Everything below is already generated for you by `currentjs create module`!
useCases:
  Post:
    list:
      input:
        pagination: { type: offset, defaults: { limit: 20, maxLimit: 100 } }
      output: { from: Post, pagination: true }
      handlers: [default:list]
    get:
      input: { identifier: id }
      output: { from: Post }
      handlers: [default:get]
    create:
      input: { from: Post }
      output: { from: Post }
      handlers: [default:create]
    update:
      input: { identifier: id, from: Post, partial: true }
      output: { from: Post }
      handlers: [default:update]
    delete:
      input: { identifier: id }
      output: void
      handlers: [default:delete]

api:
  Post:
    prefix: /api/posts
    endpoints:
      - method: GET
        path: /
        useCase: Post:list
        auth: all
      - method: GET
        path: /:id
        useCase: Post:get
        auth: all
      - method: POST
        path: /
        useCase: Post:create
        auth: authenticated
      - method: PUT
        path: /:id
        useCase: Post:update
        auth: [owner, admin]
      - method: DELETE
        path: /:id
        useCase: Post:delete
        auth: [owner, admin]

web:
  Post:
    prefix: /posts
    layout: main_view
    pages:
      - path: /
        useCase: Post:list
        view: postList
        auth: all
      - path: /:id
        useCase: Post:get
        view: postDetail
        auth: all
      - path: /create
        method: GET
        view: postCreate
        auth: authenticated
      - path: /create
        method: POST
        useCase: Post:create
        auth: authenticated
        onSuccess:
          redirect: /posts/:id
          toast: "Post created successfully"
        onError:
          stay: true
          toast: error
      - path: /:id/edit
        method: GET
        useCase: Post:get
        view: postEdit
        auth: [owner, admin]
      - path: /:id/edit
        method: POST
        useCase: Post:update
        auth: [owner, admin]
        onSuccess:
          back: true
          toast: "Post updated successfully"
```
> **Note**: All CRUD use cases, API endpoints, and web pages are automatically generated when you run `currentjs create module Blog`. The only thing left for you is your domain fields.

### 3. Generate everything
```bash
currentjs generate
npm start
```

**Boom!** 💥 You now have a complete blog system with:
- REST API endpoints at `/api/posts/*`
- Web interface at `/posts/*`
- Full CRUD operations
- HTML templates for all views
- Database integration ready to go

## Generated Project Structure 🏗️

```
my-app/
├── package.json                 # Dependencies (router, templating, providers)
├── tsconfig.json               # TypeScript configuration
├── app.yaml                    # Main application config
├── src/
│   ├── app.ts                  # Main application entry point (with DI wiring)
│   ├── system.ts               # @Injectable decorator for DI
│   ├── common/                 # Shared utilities and templates
│   │   ├── services/           # Common services
│   │   └── ui/
│   │       └── templates/
│   │           ├── main_view.html    # Main layout template
│   │           └── error.html        # Error page template
│   └── modules/                # Your business modules
│       └── YourModule/
│           ├── yourmodule.yaml           # Module specification
│           ├── domain/
│           │   ├── entities/             # Domain models (aggregates)
│           │   └── valueObjects/         # Value objects
│           ├── application/
│           │   ├── useCases/             # Use case orchestrators
│           │   ├── services/             # Business logic handlers
│           │   └── dto/                  # Input/Output DTOs
│           ├── infrastructure/
│           │   ├── controllers/          # HTTP endpoints (API + Web)
│           │   └── stores/               # Data access
│           └── views/                    # HTML templates
├── build/                      # Compiled JavaScript
└── web/                        # Static assets, served as is
    ├── app.js                  # Frontend JavaScript
    └── translations.json       # i18n support
```


## Automatic Dependency Injection 🔌

The generator includes a **decorator-driven DI system** that automatically wires all your module classes together in `src/app.ts`. No manual instantiation or import management required.

### How It Works

1. **Generated classes are decorated**: Stores, Services, and UseCases get the `@Injectable()` decorator. Controllers use the existing `@Controller()` decorator.
2. **Constructor-based discovery**: The generator scans constructors to determine what each class needs (e.g., `InvoiceService` needs `InvoiceStore`).
3. **Automatic ordering**: Dependencies are topologically sorted — stores first, then services, then use cases, then controllers.
4. **Wiring in `app.ts`**: All imports, instantiations, and the `controllers` array are auto-generated between marker comments.

### The `@Injectable` Decorator

Lives in `src/system.ts` (generated with your app, no external dependencies):

```typescript
export function Injectable() {
  return function (target: any) {
    target.__injectable = true;
  };
}
```

Any class decorated with `@Injectable()` will be automatically discovered, instantiated, and injected where needed.

### Adding Custom Injectable Classes

If you create a custom class that should participate in DI wiring, just add the `@Injectable()` decorator:

```typescript
import { Injectable } from '../../../../system';

@Injectable()
export class EmailNotificationService {
  constructor(private invoiceService: InvoiceService) {}
  
  async sendInvoiceEmail(invoiceId: number): Promise<void> {
    // ...
  }
}
```

On the next `currentjs generate`, this class will be automatically imported and instantiated in `app.ts` with its dependencies resolved.

### Database Providers

Database providers are configured in `app.yaml`:

```yaml
database:
  provider: "@currentjs/provider-mysql"  # npm package
  # or:
  provider: "./src/common/SomeProvider"  # local file path
```

Modules can override the global provider with their own:

```yaml
# In module's yaml section of app.yaml
modules:
  - name: Analytics
    database:
      provider: "@currentjs/provider-postgres"
```

Both npm packages and local paths are supported. Stores automatically receive the correct provider instance based on their module's configuration.

### Generated Wiring Example

After generation, `src/app.ts` contains auto-generated wiring between markers:

```typescript
// currentjs:controllers:start
import { InvoiceStore } from './modules/Invoice/infrastructure/stores/InvoiceStore';
import { InvoiceService } from './modules/Invoice/application/services/InvoiceService';
import { InvoiceUseCase } from './modules/Invoice/application/useCases/InvoiceUseCase';
import { InvoiceApiController } from './modules/Invoice/infrastructure/controllers/InvoiceApiController';
import { InvoiceWebController } from './modules/Invoice/infrastructure/controllers/InvoiceWebController';

const db = new MySQLProvider(config.database);
const invoiceStore = new InvoiceStore(db);
const invoiceService = new InvoiceService(invoiceStore);
const invoiceUseCase = new InvoiceUseCase(invoiceService);

const controllers = [
  new InvoiceApiController(invoiceUseCase),
  new InvoiceWebController(invoiceUseCase),
];
// currentjs:controllers:end
```

This block is fully regenerated on each `currentjs generate` run. You never need to edit it manually.

## Complete YAML Configuration Guide 📋

### Module Structure Overview

When you create a module, you'll work primarily with the `modulename.yaml` file. This file defines everything about your module:

```
src/modules/YourModule/
├── yourmodule.yaml           # ← This is where you define everything
├── domain/
│   ├── entities/             # Generated domain models (aggregates)
│   └── valueObjects/         # Generated value objects
├── application/
│   ├── useCases/             # Generated use case orchestrators
│   ├── services/             # Generated business logic handlers
│   └── dto/                  # Generated Input/Output DTOs
├── infrastructure/
│   ├── controllers/          # Generated HTTP endpoints (API + Web)
│   └── stores/               # Generated data access
└── views/                    # Generated HTML templates
```

### Complete Module Configuration Example

Here's a comprehensive example showing all available configuration options:

```yaml
domain:
  aggregates:
    Post:
      root: true                          # Marks as aggregate root
      fields:
        title: { type: string, required: true }
        content: { type: string, required: true }
        authorId: { type: id, required: true }
        publishedAt: { type: datetime }
        status: { type: string, required: true }

useCases:
  Post:
    list:
      input:
        pagination: { type: offset, defaults: { limit: 20, maxLimit: 100 } }
      output: { from: Post, pagination: true }
      handlers: [default:list]            # Built-in list handler
    get:
      input: { identifier: id }
      output: { from: Post }
      handlers: [default:get]             # Built-in get handler
    create:
      input: { from: Post }
      output: { from: Post }
      handlers: [default:create]
    update:
      input: { identifier: id, from: Post, partial: true }
      output: { from: Post }
      handlers: [default:update]
    delete:
      input: { identifier: id }
      output: void
      handlers: [                         # Chain multiple handlers
        checkCanDelete,                   # Custom → PostService.checkCanDelete(result, input)
        default:delete                    # Built-in delete
      ]
    publish:                              # Custom action
      input: { identifier: id }
      output: { from: Post }
      handlers: [
        default:get,                      # Fetch entity
        validateForPublish,               # Custom → PostService.validateForPublish(result, input)
        updatePublishStatus               # Custom → PostService.updatePublishStatus(result, input)
      ]

api:                                      # REST API configuration
  Post:                                   # Keyed by model name
    prefix: /api/posts
    endpoints:
      - method: GET
        path: /
        useCase: Post:list                # References useCases.Post.list
        auth: all                         # Public access
      - method: GET
        path: /:id
        useCase: Post:get
        auth: all
      - method: POST
        path: /
        useCase: Post:create
        auth: authenticated               # Must be logged in
      - method: PUT
        path: /:id
        useCase: Post:update
        auth: [owner, admin]              # Owner OR admin (OR logic)
      - method: DELETE
        path: /:id
        useCase: Post:delete
        auth: [owner, admin]
      - method: POST                      # Custom endpoint
        path: /:id/publish
        useCase: Post:publish
        auth: [owner, editor, admin]

web:                                      # Web interface configuration
  Post:                                   # Keyed by model name
    prefix: /posts
    layout: main_view
    pages:
      - path: /                           # List page
        useCase: Post:list
        view: postList
        auth: all
      - path: /:id                        # Detail page
        useCase: Post:get
        view: postDetail
        auth: all
      - path: /create                     # Create form (GET = show form)
        method: GET
        view: postCreate
        auth: authenticated
      - path: /create                     # Create form (POST = submit)
        method: POST
        useCase: Post:create
        auth: authenticated
        onSuccess:
          redirect: /posts/:id
          toast: "Post created successfully"
        onError:
          stay: true
          toast: error
      - path: /:id/edit                   # Edit form (GET = show form)
        method: GET
        useCase: Post:get
        view: postUpdate
        auth: [owner, admin]
      - path: /:id/edit                   # Edit form (POST = submit)
        method: POST
        useCase: Post:update
        auth: [owner, admin]
        onSuccess:
          back: true
          toast: "Post updated successfully"
```

### Displaying child entities on root pages (withChild)

When you have an aggregate root with child entities (e.g. `Invoice` with `InvoiceItem`), you can show child data on the root’s list or detail page by setting `withChild: true` on the corresponding use case.

- **`list` + `withChild: true`**: Adds a link column (e.g. “Items”) on the list page; each row links to that root’s child entity list. No extra data is loaded (good for performance).
- **`get` + `withChild: true`**: On the root’s detail page, shows a table of child entities below the main card, with links to view/edit each child and to add new ones.

If the entity has no child entities, `withChild` is ignored. The parameter defaults to `false` when you run `currentjs create module`.

**Example:**

```yaml
useCases:
  Invoice:
    list:
      withChild: true    # Adds link column to child entities on list page
      input:
        pagination: { type: offset, defaults: { limit: 20, maxLimit: 100 } }
      output: { from: Invoice, pagination: true }
      handlers: [default:list]
    get:
      withChild: true    # Shows child entities table on detail page
      input: { identifier: id }
      output: { from: Invoice }
      handlers: [default:get]
```

### Field Types and Validation

**Available Field Types:**
- `string` - Text data (VARCHAR in database)
- `number` - Numeric data (INT/DECIMAL in database)
- `integer` - Integer data (INT in database)
- `decimal` - Decimal data (DECIMAL in database)
- `boolean` - True/false values (BOOLEAN in database)
- `datetime` - Date and time values (DATETIME in database)
- `date` - Date values (DATE in database)
- `id` - Foreign key reference (INT in database)
- `json` - JSON data
- `enum` - Enumerated values (use with `values: [...]`)

**Important Field Rules:**
- **Never include `id`/`owner_id`/`created_at`/`updated_at`/`deleted_at` fields** - these are added automatically
- Use `required: true` for mandatory fields
- Fields without `required` are optional

```yaml
domain:
  aggregates:
    User:
      root: true
      fields:
        email: { type: string, required: true }
        age: { type: number }
        isActive: { type: boolean, required: true }
        lastLoginAt: { type: datetime }
```

### 🔗 Model Relationships

You can define relationships between models by specifying another model name as the field type. The generator will automatically handle foreign keys, type checking, and UI components.

**Basic Relationship Example:**
```yaml
domain:
  aggregates:
    Owner:
      root: true
      fields:
        name: { type: string, required: true }
        email: { type: string, required: true }

    Cat:
      root: true
      fields:
        name: { type: string, required: true }
        breed: { type: string }
        owner: { type: Owner, required: true }  # Relationship to Owner model
```

**Architecture: Rich Domain Models**

The generator uses **Infrastructure-Level Relationship Assembly**:

- **Domain Layer**: Works with full objects (no FKs)
- **Infrastructure (Store)**: Handles FK ↔ Object conversion
- **DTOs**: Use FKs for API transmission

**What Gets Generated:**

1. **Domain Model**: Pure business objects
   ```typescript
   import { Owner } from './Owner';
   
   export class Cat {
     constructor(
       public id: number,
       public name: string,
       public breed?: string,
       public owner: Owner  // ✨ Full object, no FK!
     ) {}
   }
   ```

2. **DTOs**: Use foreign keys for API
   ```typescript
   export interface CatDTO {
     name: string;
     breed?: string;
     ownerId: number;  // ✨ FK for over-the-wire
   }
   ```

3. **Store**: Converts FK ↔ Object
   ```typescript
   export class CatStore {
     constructor(
       private db: ISqlProvider,
       private ownerStore: OwnerStore  // ✨ Foreign store dependency
     ) {}
     
     async loadRelationships(entity: Cat, row: CatRow): Promise<Cat> {
       const owner = await this.ownerStore.getById(row.ownerId);
       if (owner) entity.setOwner(owner);
       return entity;
     }
     
     async insert(cat: Cat): Promise<Cat> {
       const row = {
         name: cat.name,
         ownerId: cat.owner?.id  // ✨ Extract FK to save
       };
       // ...
     }
   }
   ```

4. **Service**: Loads objects from FKs
   ```typescript
   export class CatService {
     constructor(
       private catStore: CatStore,
       private ownerStore: OwnerStore  // ✨ To load relationships
     ) {}
     
     async create(catData: CatDTO): Promise<Cat> {
       // ✨ Load full owner object from FK
       const owner = await this.ownerStore.getById(catData.ownerId);
       const cat = new Cat(0, catData.name, catData.breed, owner);
       return await this.catStore.insert(cat);
     }
   }
   ```

5. **HTML Forms**: Select dropdown with "Create New" button
   ```html
   <select id="ownerId" name="ownerId" required>
     <option value="">-- Select Owner --</option>
     <!-- Options loaded from /api/owner -->
   </select>
   <button onclick="window.open('/owner/create')">+ New</button>
   ```

**Relationship Naming Convention:**

The generator automatically creates foreign key fields following this convention:
- **Field name**: `owner` → **Foreign key**: `ownerId`
- **Field name**: `author` → **Foreign key**: `authorId`
- **Field name**: `parentComment` → **Foreign key**: `parentCommentId`

The foreign key always references the `id` field of the related model.

**Multiple Relationships:**
```yaml
domain:
  aggregates:
    Comment:
      root: true
      fields:
        content: { type: string, required: true }
        post: { type: Post, required: true }         # Creates foreign key: postId
        author: { type: User, required: true }        # Creates foreign key: authorId
        parentComment: { type: Comment }               # Self-referential, optional
```

**Relationship Best Practices:**
- ✅ Always define the foreign model first in the same module
- ✅ Use descriptive field names for relationships (e.g., `author` instead of `user`)
- ✅ Set appropriate `displayFields` to show meaningful data in dropdowns
- ✅ Use `required: false` for optional relationships
- ✅ Foreign keys are auto-generated following the pattern `fieldName + 'Id'`
- ❌ Don't manually add foreign key fields (they're auto-generated)
- ❌ Don't create circular dependencies between modules

### Use Case Handlers Explained

**🔄 Handler vs Use Case Distinction:**
- **Handler**: Creates a separate service method (one handler = one method)
- **Use Case**: Defined under `useCases.ModelName.actionName`, orchestrates handler calls step-by-step
- **UseCase reference**: Used in `api`/`web` endpoints as `ModelName:actionName` (e.g., `Post:list`)

**Built-in Handlers (inside `useCases.*.*.handlers`):**
- `default:list` - Creates service method with pagination parameters
- `default:get` - Creates service method named `get` with ID parameter
- `default:create` - Creates service method with DTO parameter
- `default:update` - Creates service method with ID and DTO parameters
- `default:delete` - Creates service method with ID parameter

Note: Handlers within `useCases` do NOT need a model prefix because the model is already the key.

**Custom Handlers:**
- `customMethodName` - Creates service method that accepts `(result, input)` parameters
- `result`: Result from previous handler (or `null` if it's the first handler)
- `input`: The parsed input DTO
- User can customize the implementation after generation
- Each handler generates a separate method in the service

**🔗 Multiple Handlers per Use Case:**
When a use case has multiple handlers, each handler generates a separate service method, and the use case orchestrator calls them sequentially:

```yaml
useCases:
  Invoice:
    get:
      input: { identifier: id }
      output: { from: Invoice }
      handlers: 
        - default:get          # Creates InvoiceService.get() method
        - enrichData           # Creates InvoiceService.enrichData() method
```

**Generated Code Example:**
```typescript
// InvoiceService.ts
async get(id: number): Promise<Invoice> { 
  // Standard get implementation
}
async enrichData(result: any, input: any): Promise<any> { 
  // TODO: Implement custom enrichData method
  // result = result from previous handler (Invoice object in this case)
  // input = parsed input DTO
}

// InvoiceUseCase.ts  
async get(input: InvoiceGetInput): Promise<Invoice> {
  const result0 = await this.invoiceService.get(input.id);
  const result = await this.invoiceService.enrichData(result0, input);
  return result; // Returns result from last handler
}
```

**Parameter Passing Rules:**
- **Default handlers** (`default:*`): Receive standard parameters (id, pagination, DTO, etc.)
- **Custom handlers**: Receive `(result, input)` where:
  - `result`: Result from previous handler, or `null` if it's the first handler
  - `input`: Parsed input DTO

**Handler Format Examples:**
```yaml
useCases:
  Post:
    list:
      handlers: [default:list]           # Single handler: list(page, limit)
    get:
      handlers: [default:get]            # Single handler: get(id)
    complexFlow:
      handlers: [
        default:create,                  # create(input) - standard parameters
        sendNotification                 # sendNotification(result, input) - result from create
      ]
    customFirst:
      handlers: [
        validateInput,                   # validateInput(null, input) - first handler
        default:create                   # create(input) - standard parameters
      ]
```

### Multi-Model Support 🔄

When you have multiple models in a single module, the system generates individual services, use cases, controllers, and stores for each model:

```yaml
domain:
  aggregates:
    Post:
      root: true
      fields:
        title: { type: string, required: true }
    Comment:
      root: true
      fields:
        content: { type: string, required: true }
        post: { type: Post, required: true }

useCases:
  Post:
    list:
      handlers: [default:list]
    create:
      input: { from: Post }
      output: { from: Post }
      handlers: [default:create]
  Comment:
    create:
      input: { from: Comment }
      output: { from: Comment }
      handlers: [default:create]

api:
  Post:
    prefix: /api/posts
    endpoints:
      - method: GET
        path: /
        useCase: Post:list
        auth: all
      - method: POST
        path: /
        useCase: Post:create
        auth: authenticated
  Comment:
    prefix: /api/comments
    endpoints:
      - method: POST
        path: /
        useCase: Comment:create
        auth: authenticated
```

**Key Points:**
- Each model gets its own Service, UseCase, Controller, and Store classes
- In `api`/`web`, each model is a separate key (e.g., `api.Post`, `api.Comment`)
- UseCase references use `ModelName:actionName` format (e.g., `Post:list`, `Comment:create`)
- Handlers within `useCases` do not need a model prefix (model is already the key)

### Form Success/Error Handling

Configure what happens after successful form submissions using `onSuccess` and `onError` on web page endpoints:

```yaml
web:
  Post:
    prefix: /posts
    pages:
      - path: /create
        method: POST
        useCase: Post:create
        auth: authenticated
        onSuccess:
          redirect: /posts/:id
          toast: "Post created successfully"
        onError:
          stay: true
          toast: error
```

**Available `onSuccess` Options:**
- `toast: "message"` - Show toast notification with custom message
- `back: true` - Navigate back in browser history
- `redirect: /path` - Redirect to specific URL
- `stay: true` - Stay on current page

**Available `onError` Options:**
- `stay: true` - Stay on current page (re-render form with errors)
- `toast: error` - Show error toast notification

**Common Combinations:**
```yaml
# Show message and go back
onSuccess: { toast: "Saved!", back: true }

# Redirect after creation
onSuccess: { redirect: /posts/:id, toast: "Created!" }

# Stay on page with toast
onSuccess: { stay: true, toast: "Updated!" }
```

The template generator converts `onSuccess` options into `data-strategy` attributes on HTML forms for the frontend JavaScript to handle.

### Auth System

Control who can access what using the `auth` property on each endpoint in `api` and `web`:

```yaml
api:
  Post:
    prefix: /api/posts
    endpoints:
      - method: GET
        path: /
        useCase: Post:list
        auth: all                    # Anyone (including anonymous)
      - method: POST
        path: /
        useCase: Post:create
        auth: authenticated          # Any logged-in user
      - method: PUT
        path: /:id
        useCase: Post:update
        auth: [owner, admin]         # Owner OR admin (OR logic)
      - method: DELETE
        path: /:id
        useCase: Post:delete
        auth: admin                  # Only admin role
```

**Auth Options:**
- `all` - Everyone (including anonymous users)
- `authenticated` - Any logged-in user
- `owner` - User who created the entity
- `admin`, `editor`, `user` - Custom roles from JWT token
- `[owner, admin]` - Array syntax: user must match ANY (OR logic). Privileged roles bypass ownership check.

**How Ownership Works:**
The system automatically adds an `owner_id` field to aggregate roots to track who created each entity. When `owner` auth is specified:
- **For reads (get)**: Post-fetch check compares `result.ownerId` with `context.request.user.id`
- **For mutations (update/delete)**: Pre-mutation check calls `getResourceOwner(id)` before the operation to prevent unauthorized changes

### Code vs Configuration Guidelines

**✅ Use YAML Configuration For:**
- Basic CRUD operations
- Standard REST endpoints
- Simple permission rules
- Form success strategies
- Standard data field types

**✅ Write Custom Code For:**
- Complex business logic
- Custom validation rules
- Data transformations
- Integration with external services
- Complex database queries

## Part of the Framework Ecosystem 🌍

This generator is the foundation of the `currentjs` framework:
- Works seamlessly with `@currentjs/router` for HTTP handling
- Integrates with `@currentjs/templating` for server-side rendering
- Uses `@currentjs/provider-*` packages for database access
- Follows clean architecture principles for maintainable code

## Notes

- `currentjs init` scaffolds complete app structure with TypeScript configs and dependencies
- `currentjs generate` creates domain entities, value objects, use cases, services, DTOs, controllers, stores, and templates
- Generated code follows clean architecture: domain/application/infrastructure layers
- Supports both API endpoints and web page routes in the same module
- Includes change tracking system for safely modifying generated code

## Authorship & Contribution

Vibecoded mostly with `claude` models by Konstantin Zavalny. Yes, it is a vibecoded solution, really.

Any contributions such as bugfixes, improvements, etc are very welcome.

## License

GNU Lesser General Public License (LGPL)

It simply means, that you:
- can create a proprietary application that uses this library without having to open source their entire application code (this is the "lesser" aspect of LGPL compared to GPL).
- can make any modifications, but must distribute those modifications under the LGPL (or a compatible license) and include the original copyright and license notice.

