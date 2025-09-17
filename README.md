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

#### 🎯 **registry.json Explained**

The registry tracks the "fingerprint" of each generated file:

```json
{
  "src/modules/Blog/services/PostService.ts": {
    "hash": "a1b2c3d4...",           // Hash of the generated baseline
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "diffFormat": "hunks-v1",       // Change tracking format
    "diffBaseHash": "a1b2c3d4...",  // Hash of baseline this diff applies to
    "diffHunks": [                  // Your custom changes as patches
      {
        "oldStart": 15,
        "newStart": 16, 
        "oldLines": 0,
        "newLines": 8,
        "oldContent": [],
        "newContent": [
          "  async publishPost(id: number): Promise<void> {",
          "    const post = await this.getById(id);",
          "    // ... your custom logic"
        ]
      }
    ]
  }
}
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

#### 🔄 **Advanced Workflows**

**Evolving Your Schema:**
```bash
# 1. Modify your YAML files
vim src/modules/Blog/Blog.yaml

# 2. See what would change
currentjs diff Blog

# 3. Regenerate with preserved customizations
currentjs generate --force

# 4. Commit any new customizations
currentjs commit
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

**Branching Strategy:**
```bash
# Feature branch: only track YAML changes
git checkout -b feature/add-comments
# Edit Blog.yaml to add Comment model
currentjs generate
currentjs commit  # Save any customizations
git add src/modules/Blog/Blog.yaml registry.json
git commit -m "Add comment system"
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
src/modules/*/views/*.html

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

Here's how you'd create a complete blog system:

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

## YAML Configuration Reference 📋

Understanding the key configuration sections in your module YAML files:

### Strategy Settings 🎯

The `strategy` array controls what happens after successful form submissions in your web interface:

```yaml
routes:
  prefix: /posts
  strategy: [back, toast]  # Multiple strategies can be combined
  endpoints:
    # ... your routes
```

**Available Strategies:**
- **`toast`** - Shows a success notification popup (most common)
- **`back`** - Navigates back to the previous page using browser history
- **`message`** - Displays a success message in a specific element on the page
- **`modal`** - Shows a success message in a modal dialog
- **`redirect`** - Redirects to a specific URL after success
- **`refresh`** - Refreshes the current page

**Examples:**
```yaml
# Show toast and go back
strategy: [toast, back]

# Just show a toast notification
strategy: [toast]

# Show message in a specific element
strategy: [message]

# Multiple feedback mechanisms
strategy: [toast, modal, back]
```

The strategy is automatically applied to all form submissions in your generated templates (create, update forms).

### Actions & Handlers 🔧

The `actions` section maps logical business operations to their implementations:

```yaml
actions:
  list:
    handlers: [default:list]        # Built-in CRUD handler
  get:
    handlers: [default:getById]     # Built-in get by ID
  create:
    handlers: [default:create]      # Built-in create
  update:
    handlers: [default:update]      # Built-in update
  delete:
    handlers: [default:delete]      # Built-in delete
  customAction:
    handlers: [service:myMethod]    # Custom service method
  complexAction:
    handlers: [                     # Multiple handlers (executed in order)
      default:getById,
      service:validateData,
      default:update
    ]
```

**Built-in Handlers (`default:`):**
- **`default:list`** - Returns all entities with optional filtering/pagination
- **`default:getById`** - Fetches a single entity by ID
- **`default:create`** - Creates a new entity with validation
- **`default:update`** - Updates an existing entity by ID
- **`default:delete`** - Soft or hard deletes an entity by ID

**Custom Handlers (`service:`):**
- **`service:methodName`** - Calls a custom method on your service class
- Useful for complex business logic beyond basic CRUD
- Methods are automatically generated with proper type signatures

**Handler Chaining:**
You can chain multiple handlers to create complex workflows:
```yaml
actions:
  publish:
    handlers: [
      default:getById,           # First, fetch the entity
      service:validateForPublish,  # Then, run custom validation
      service:updatePublishStatus, # Finally, update status
      service:sendNotification    # And send notifications
    ]
```

### Permissions & Security 🔐

The `permissions` array controls role-based access to your actions:

```yaml
permissions:
  - action: create
    roles: [admin, editor]        # Only admins and editors can create
  - action: delete
    roles: [admin]                # Only admins can delete
  - action: list
    roles: [all]                  # Everyone can list (including anonymous)
  - action: update
    roles: [admin, editor, owner] # Multiple roles allowed
```

**Special Roles:**
- **`all`** - Any user, including anonymous (no authentication required)
- **`authenticated`** - Any logged-in user 
- **`owner`** - The user who owns/created the entity (automatic ownership check)
- **`admin`**, **`editor`**, **`user`** - Custom roles from your authentication system

**How It Works:**
```typescript
// Generated service methods automatically include permission checks
async create(data: CreatePostDto, user?: AuthenticatedUser): Promise<Post> {
  // Auto-generated permission check
  if (!user || !['admin', 'editor'].includes(user.role)) {
    throw new Error('Insufficient permissions');
  }
  // ... rest of create logic
}
```

**No Permissions = Open Access:**
```yaml
permissions: []  # No restrictions - all actions available to everyone
```

**Ownership-Based Permissions:**
```yaml
permissions:
  - action: update
    roles: [owner, admin]  # Users can update their own posts, admins can update any
  - action: delete
    roles: [owner]         # Only the creator can delete their post
```

### Complete Configuration Example 🚀

Here's a real-world blog module with all concepts combined:

```yaml
models:
  - name: Post
    fields:
      - name: title
        type: string
        required: true
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
    - method: POST
      path: /:id/publish
      action: publish

routes:
  prefix: /posts
  strategy: [toast, back]           # Show success message and navigate back
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
    handlers: [
      service:validateContent,      # Custom validation
      default:create,               # Standard creation
      service:sendCreationNotice    # Custom notification
    ]
  update:
    handlers: [default:update]
  delete:
    handlers: [
      service:checkCanDelete,       # Custom business logic
      default:delete
    ]
  publish:
    handlers: [
      default:getById,
      service:validateForPublish,
      service:updatePublishStatus
    ]

permissions:
  - action: list
    roles: [all]                    # Anyone can view list
  - action: get
    roles: [all]                    # Anyone can view individual posts
  - action: create
    roles: [authenticated]          # Must be logged in to create
  - action: update
    roles: [owner, admin]          # Authors and admins can edit
  - action: delete
    roles: [admin]                 # Only admins can delete
  - action: publish
    roles: [owner, admin]          # Authors and admins can publish
```

This configuration creates a sophisticated blog system with proper security, custom business logic, and user-friendly interface behaviors.

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

