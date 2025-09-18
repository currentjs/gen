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
currentjs create app

# Create a new app inside a folder
currentjs create app my-app

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
   currentjs create app # will create an app inside the current directory
   # or:
   currentjs create app my-project # will create a directory "my-project" and create an app there
   ```

2. **Create a new module**
   ```bash
   currentjs create module Blog
   ```

3. **Define your module's configuration** in `src/modules/Blog/blog.yaml`:
   - Define your data models
   - Configure API routes & actions (CRUD is already configured)
   - Set up permissions

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
currentjs create app [name]           # Create new application
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
npm run build
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
src/modules/*/application/services/*.ts
src/modules/*/application/validation/*.ts
src/modules/*/infrastructure/controllers/*.ts
src/modules/*/infrastructure/stores/*.ts
src/modules/*/infrastructure/interfaces/*.ts

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

## Example: Building a Blog System 📝

Here's how you'd create a complete very simple blog system:

### 1. Create the app and module
```bash
currentjs create app my-blog
cd my-blog
currentjs create module Blog
```

### 2. Define your data model
```yaml
# src/modules/Blog/Blog.yaml
models:
  - name: Post
    fields:
      - name: title
        type: string
        required: true
      - name: content
        type: string
        required: true
      - name: authorEmail
        type: string
        required: true
      - name: publishedAt
        type: datetime
        required: false
# this part is already generated for you!
api:
  prefix: /api/posts
  endpoints:
    - method: GET
      path: /
      action: list
    - method: POST
      path: /
      action: create
    - method: GET
      path: /:id
      action: get
    - method: PUT
      path: /:id
      action: update
    - method: DELETE
      path: /:id
      action: delete

routes:
  prefix: /posts
  strategy: [back, toast]
  endpoints:
    - path: /
      action: list
      view: postList
    - path: /:id
      action: get
      view: postDetail
    - path: /create
      action: empty
      view: postCreate
    - path: /:id/edit
      action: get
      view: postUpdate

actions:
  list:
    handlers: [default:list]
  get:
    handlers: [default:getById]
  create:
    handlers: [default:create]
  update:
    handlers: [default:update]
  delete:
    handlers: [default:delete]

permissions: []
```
> **Note**: All CRUD routes and configurations are automatically generated when you run `currentjs create module Blog`. The only thing is left for you is your data model.

### 3. Generate everything
```bash
currentjs generate
npm run build
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
│   ├── app.ts                  # Main application entry point
│   ├── common/                 # Shared utilities and templates
│   │   ├── services/           # Common services
│   │   └── ui/
│   │       └── templates/
│   │           ├── main_view.html    # Main layout template
│   │           └── error.html        # Error page template
│   └── modules/                # Your business modules
│       └── YourModule/
│           ├── YourModule.yaml           # Module specification
│           ├── domain/
│           │   └── entities/             # Domain models
│           ├── application/
│           │   ├── services/             # Business logic
│           │   └── validation/           # Input validation
│           ├── infrastructure/
│           │   ├── controllers/          # HTTP endpoints
│           │   └── stores/               # Data access
│           └── views/                    # HTML templates
├── build/                      # Compiled JavaScript
└── web/                        # Static assets, served as is
    ├── app.js                  # Frontend JavaScript
    └── translations.json       # i18n support
```


## Complete YAML Configuration Guide 📋

### Module Structure Overview

When you create a module, you'll work primarily with the `ModuleName.yaml` file. This file defines everything about your module:

```
src/modules/YourModule/
├── YourModule.yaml           # ← This is where you define everything
├── domain/
│   └── entities/             # Generated domain models
├── application/
│   ├── services/             # Generated business logic
│   └── validation/           # Generated input validation
├── infrastructure/
│   ├── controllers/          # Generated HTTP endpoints
│   └── stores/               # Generated data access
└── views/                    # Generated HTML templates
```

### Complete Module Configuration Example

Here's a comprehensive example showing all available configuration options:

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
    handlers: [default:list]            # Use built-in list handler
  get:
    handlers: [default:getById]         # Use built-in get handler
  create:
    handlers: [default:create]          # Built-in create
  update:
    handlers: [default:update]
  delete:
    handlers: [                         # Chain multiple handlers
      service:checkCanDelete,           # Custom business logic
      default:delete
    ]
  publish:                              # Custom action
    handlers: [
      default:getById,                  # Fetch entity
      service:validateForPublish,       # Custom validation
      service:updatePublishStatus       # Custom update logic
    ]

permissions:                            # Role-based access control
  - action: list
    roles: [all]                        # Anyone (including anonymous)
  - action: get
    roles: [all]                        # Anyone can view
  - action: create
    roles: [authenticated]              # Must be logged in
  - action: update
    roles: [owner, admin]              # Entity owner or admin role
  - action: delete
    roles: [admin]                     # Only admin role
  - action: publish
    roles: [owner, editor, admin]      # Multiple roles allowed
```

### Field Types and Validation

**Available Field Types:**
- `string` - Text data (VARCHAR in database)
- `number` - Numeric data (INT/DECIMAL in database)  
- `boolean` - True/false values (BOOLEAN in database)
- `datetime` - Date and time values (DATETIME in database)

**Important Field Rules:**
- **Never include `id`/`owner_id`/`is_deleted` fields** - these are added automatically
- Use `required: true` for mandatory fields
- Use `required: false` for optional fields

```yaml
models:
  - name: User
    fields:
      - name: email
        type: string
        required: true
      - name: age
        type: number
        required: false
      - name: isActive
        type: boolean
        required: true
      - name: lastLoginAt
        type: datetime
        required: false
```

### Action Handlers Explained

**Built-in Handlers (`default:`):**
- `default:list` - Returns paginated list of entities
- `default:getById` - Fetches single entity by ID
- `default:create` - Creates new entity with validation
- `default:update` - Updates existing entity by ID
- `default:delete` - Soft deletes entity

**Custom Handlers (`service:`):**
- `service:methodName` - Calls custom method on service class
- Method name must EXACTLY match the actual method name in your service
- Can be chained with built-in handlers

**⚠️ Critical Service Method Convention:**
```typescript
// If your service has this method:
async generateInvoicePdf(id: number): Promise<Buffer> { ... }

// Use this in YAML:
action: generatePdf
handlers: [service:generateInvoicePdf]  # NOT service:generatePdf
```

### Strategy Options for Forms

Configure what happens after successful form submissions:

```yaml
routes:
  strategy: [toast, back]  # Show success message and go back
```

**Available Strategies:**
- `toast` - Success toast notification (most common)
- `back` - Navigate back in browser history
- `message` - Inline success message
- `modal` - Modal success dialog
- `redirect` - Redirect to specific URL
- `refresh` - Reload current page

**Common Strategy Combinations:**
```yaml
# Most common: Show message and go back
strategy: [toast, back]

# Show message and stay on page
strategy: [toast]

# Show modal dialog
strategy: [modal]

# Multiple feedback
strategy: [toast, modal, back]
```

### Permission System

Control who can access what actions:

```yaml
permissions:
  - action: create
    roles: [authenticated]     # Any logged-in user
  - action: update  
    roles: [owner, admin]      # Owner of entity or admin
  - action: delete
    roles: [admin]             # Only admins
  - action: list
    roles: [all]               # Anyone (including anonymous)
```

**Special Roles:**
- `all` - Everyone (including anonymous users)
- `authenticated` - Any logged-in user
- `owner` - User who created the entity
- `admin`, `editor`, `user` - Custom roles from JWT token

**How Ownership Works:**
The system automatically adds an `owner_id` field to track who created each entity. When you use `owner` role, it checks if the current user's ID matches the entity's `owner_id`.

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

- `currentjs create app` scaffolds complete app structure with TypeScript configs and dependencies
- `currentjs generate` creates domain entities, services, controllers, stores, and templates
- Generated code follows clean architecture: domain/application/infrastructure layers
- Supports both API endpoints and web page routes in the same module
- Includes change tracking system for safely modifying generated code

## Authorship & Contribution

Vibecoded with `claude-4-sonnet` (mostly) by Konstantin Zavalny. Yes, it is a vibecoded solution, really.

Any contributions such as bugfixes, improvements, etc are very welcome.

## License

GNU Lesser General Public License (LGPL)

It simply means, that you:
- can create a proprietary application that uses this library without having to open source their entire application code (this is the "lesser" aspect of LGPL compared to GPL).
- can make any modifications, but must distribute those modifications under the LGPL (or a compatible license) and include the original copyright and license notice.

