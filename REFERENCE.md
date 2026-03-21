# CurrentJS Generator -- Reference

Version: 0.5.2

---

## Table of Contents

- [Quick Start](#quick-start)
  - [Development Flow](#development-flow)
- [CLI Commands](#cli-commands)
  - [init](#init)
  - [create module](#create-module)
  - [create model](#create-model)
  - [generate](#generate)
  - [commit](#commit)
  - [diff](#diff)
  - [infer](#infer)
  - [migrate commit](#migrate-commit)
- [Global Options](#global-options)
- [Application Configuration (app.yaml)](#application-configuration-appyaml)
- [Module Configuration (module YAML)](#module-configuration-module-yaml)
  - [domain](#domain)
    - [aggregates](#aggregates)
    - [valueObjects](#valueobjects)
  - [useCases](#usecases)
    - [input](#input)
    - [output](#output)
    - [handlers](#handlers)
  - [api](#api)
  - [web](#web)
  - [auth](#auth)
- [Field Types](#field-types)
- [Generated File Structure](#generated-file-structure)
- [Notes](#notes)

---

## Quick Start

Building an application from scratch:

1. Initialize a new project:

```
currentjs init myapp
cd myapp
```

2. Create a module:

```
currentjs create module Blog
```

3. Run an interactive command:

```
currentjs create model Blog:Post
```

It will:
- ask everything it needs,
- generate yaml config,
- generate a TypeScript source code,
- and build it.

UI tool will come some time soon.

Alternatevly, you can:
 - edit the generated module YAML at `src/modules/Blog/blog.yaml`. Define the domain model fields, use cases, API endpoints, and web routes.
 - Generate TypeScript files from the YAML configuration: `currentjs generate Blog`
 - If needed, make manual changes to generated files (domain entities, views, services).
 - Commit those manual changes so they survive regeneration: `currentjs commit`

To add custom (non-CRUD) behavior: define a method in the service, reference it in the module YAML as a handler, regenerate, and commit.

```
currentjs generate Blog
currentjs commit
```

### Development Flow

```
                    ┌──────────────────┐
                    │   currentjs init │
                    └────────┬─────────┘
                             │
                             ▼
                ┌────────────────────────┐
                │ currentjs create module│
                └────────────┬───────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
   ┌────────────────────┐   ┌────────────────────────┐
   │ Edit module YAML   │   │ currentjs create model │
   │ (define structure) │   │ (interactive wizard)   │
   └─────────┬──────────┘   └────────────┬───────────┘
             │                           │
             ▼                           │
   ┌───────────────────┐                 │
   │ currentjs generate│                 │
   └─────────┬─────────┘                 │
             │                           │
             └────────────┬──────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │ Modify generated files│
              │ (entities, views, etc)│
              │ (optional step)       │
              └───────────┬───────────┘
                          │
                          ▼
                ┌───────────────────┐
                │ currentjs commit  │
                └───────────────────┘
```

---

## CLI Commands

### init

Create a new project with default structure and configuration files.

```
currentjs init [name]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | No | Project directory name. Defaults to the current working directory. |

Creates the following structure:

```
<name>/
  app.yaml
  package.json
  tsconfig.json
  src/
    app.ts
    system.ts
    common/
      ui/templates/
        main_view.html
        error.html
      services/
  web/
    app.js
    translations.json
  build/
  migrations/
```

Runs `npm install` after scaffolding.

---

### create module

Create a new module with default directory structure and YAML configuration.

```
currentjs create module <name>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | Yes | Module name (PascalCase recommended). |

Creates the module directory under `src/modules/<name>/` with subdirectories for domain, application, infrastructure, and views. Generates a starter YAML file with a single root aggregate and default CRUD use cases. Automatically registers the module in `app.yaml`.

---

### create model

Interactive wizard to add a model (aggregate) to an existing module.

```
currentjs create model <ModuleName:ModelName>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `ModuleName:ModelName` | Yes | Colon-separated module and model names. |

The wizard prompts for:

1. Field definitions (name, type, required, unique, value objects).
2. Child entity definitions (optional; each child gets its own name and fields).
3. Use case configuration (list with pagination/filtering/sorting, create, update, delete). If child entities were defined, the wizard also prompts for their CRUD use cases (with `input.parentId` set automatically) and optional web/API routes.
4. Web route configuration with auth per route.
5. API endpoint configuration with auth per endpoint.

The first model added to a module becomes the aggregate root. Runs `currentjs generate` automatically at the end.

---

### generate

Generate TypeScript files from module YAML configurations.

```
currentjs generate [module]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `module` | No | Module name or `*` for all modules. If omitted, generates all. |

Generation order: domain entities, DTOs, use cases, services, stores, controllers, templates.

After generating module files, updates `src/app.ts` with dependency injection wiring (imports, provider initialization, controller registration) between the `// currentjs:controllers:start` and `// currentjs:controllers:end` markers.

Runs `npm run build` after generation.

| Option | Description |
|--------|-------------|
| `--force` | Overwrite modified files without prompting. |
| `--skip` | Skip overwriting modified files without prompting. |
| `--with-templates` | Regenerate existing HTML templates. Without this flag, existing templates are preserved; only missing templates are created. |

---

### commit

Record manual changes made to generated files. Stores diff hunks in `commits/` so they can be reapplied after regeneration.

```
currentjs commit [file ...]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `file` | No | One or more file paths to commit. If omitted, scans all generated files. |

Compares each generated file's current content against what the generator would produce. Files that have not been modified by the user (matching the stored hash in the registry) are skipped. The resulting diff is saved as a JSON file in the `commits/` directory.

---

### diff

Show differences between current file contents and what the generator would produce.

```
currentjs diff [module]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `module` | No | Module name or `*` for all modules. If omitted, diffs all. |

For each generated file, reports one of three statuses:

- `[clean]` -- file matches generated output (or generated + committed changes).
- `[modified]` -- file differs from expected content. Displays hunk-level diffs.
- `[missing]` -- file does not exist on disk.

---

### infer

Infer a YAML model definition from an existing TypeScript entity class.

```
currentjs infer --file <path> [--write]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--file` | Yes | Path to a TypeScript entity file. |
| `--write` | No | Write the inferred model directly into the module's YAML file. Without this flag, prints the YAML to stdout. |

Parses the entity class constructor parameters to extract field names, types, optionality, and defaults. Reverses TypeScript types back to YAML types (`Date` to `datetime`, `number` to `number`, etc.).

---

### migrate commit

Generate a SQL migration file based on the current model definitions.

```
currentjs migrate commit
```

Collects model definitions from all module YAMLs and the `app.yaml`, compares them against the stored schema state (`migrations/schema_state.yaml`), and generates a SQL migration file in the `migrations/` directory.

Note: `migrate push` and `migrate update` are not yet implemented.

---

## Global Options

These options apply to commands that reference the application configuration:

| Option | Description | Default |
|--------|-------------|---------|
| `--yaml <path>` | Path to app.yaml. | `./app.yaml` |
| `-h`, `--help` | Show help. | |
| `--out <dir>` | Deprecated. Generators write into each module's directory structure. | |

---

## Application Configuration (app.yaml)

The `app.yaml` file is the root configuration for the project. It defines providers, global settings, and references to module YAML files.

### Schema

```yaml
providers:
  <key>: <import-specifier>

config:
  database: <provider-key>
  styling: <string>
  identifiers: <string>

modules:
  <ModuleName>:
    path: <relative-path-to-module-yaml>
    database: <provider-key>       # optional, overrides config.database
    styling: <string>              # optional, overrides config.styling
    identifiers: <string>          # optional, overrides config.identifiers
```

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `providers` | `Record<string, string>` | `{ mysql: "@currentjs/provider-mysql" }` | Map of provider key to npm package or local path. |
| `config.database` | `string` | `"mysql"` | Default database provider key (must match a key in `providers`). |
| `config.styling` | `string` | `"bootstrap"` | Default styling framework. |
| `config.identifiers` | `string` | `"id"` | Default primary key field name. |
| `modules` | `Record<string, ModuleEntry>` | `{}` | Map of module name to module entry. |
| `modules.<Name>.path` | `string` | -- | Relative path from project root to the module's YAML file. Required. |
| `modules.<Name>.database` | `string` | Inherits from `config.database` | Database provider override for this module. |
| `modules.<Name>.styling` | `string` | Inherits from `config.styling` | Styling override for this module. |
| `modules.<Name>.identifiers` | `string` | Inherits from `config.identifiers` | Identifiers override for this module. |

### Provider Import Resolution

Provider values can be:

- An npm package name (e.g., `"@currentjs/provider-mysql"`).
- A local path starting with `./` or `/`, resolved relative to the `src/` directory.

---

## Module Configuration (module YAML)

Each module has its own YAML file (typically `src/modules/<Name>/<name>.yaml`) that defines the domain model, use cases, API endpoints, and web routes.

A valid module configuration must contain at least `domain` and `useCases` top-level keys.

### Top-Level Structure

```yaml
domain:
  aggregates: { ... }
  valueObjects: { ... }    # optional

useCases:
  <ModelName>:
    <actionName>: { ... }

api:                        # optional
  <ResourceName>: { ... }

web:                        # optional
  <ResourceName>: { ... }
```

---

### domain

#### aggregates

Defines the entity models within the module.

```yaml
domain:
  aggregates:
    <EntityName>:
      root: <boolean>
      fields:
        <fieldName>:
          type: <type>
          required: <boolean>
          unique: <boolean>
          auto: <boolean>
          values: [<string>, ...]
      entities: [<ChildEntityName>, ...]
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `root` | `boolean` | `false` | Whether this entity is the aggregate root. Root entities get an `ownerId` field automatically. |
| `fields` | `Record<string, AggregateFieldConfig>` | -- | Required. Map of field name to field configuration. |
| `entities` | `string[]` | -- | List of child entity names belonging to this aggregate. |

**AggregateFieldConfig:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | `string` | -- | Required. See [Field Types](#field-types). Can also reference another aggregate or value object by name. |
| `required` | `boolean` | `true` | Whether the field must be provided. |
| `unique` | `boolean` | `false` | Whether the field must be unique. |
| `auto` | `boolean` | `false` | Whether a default value is generated automatically. |
| `values` | `string[]` | -- | Valid values for `enum` type fields. |


Do not include `id`, `ownerId`, or `deletedAt` fields -- these are added automatically.

When `type` is set to another aggregate's name, it becomes a foreign key reference. The generated store maps it to a column named `<fieldName>Id` of type `number`.

---

#### valueObjects

Defines reusable value types that are embedded within aggregates.

```yaml
domain:
  valueObjects:
    <ValueObjectName>:
      fields:
        <fieldName>:
          type: <type>
          values: [<string>, ...]      # for enum type
          constraints:
            min: <number>
            max: <number>
            pattern: <string>
            unique: <boolean>
```

| Field | Type | Description |
|-------|------|-------------|
| `fields` | `Record<string, FieldDefinition>` | Map of field name to field definition. |

**FieldDefinition:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Field type (see [Field Types](#field-types)). |
| `values` | `string[]` | Valid values (for `enum` type). |
| `constraints.min` | `number` | Minimum value (for numeric types). |
| `constraints.max` | `number` | Maximum value (for numeric types). |
| `constraints.pattern` | `string` | Regex pattern (for string types). |
| `constraints.unique` | `boolean` | Uniqueness constraint. |

Value object fields are stored as JSON strings in the database.

---

### useCases

Defines the business operations available for each model.

```yaml
useCases:
  <ModelName>:
    <actionName>:
      input: { ... }
      output: { ... } | "void"
      handlers: [...]
      withChild: <boolean>
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `input` | `UseCaseInputConfig` | -- | Input DTO configuration. |
| `output` | `UseCaseOutputConfig` or `"void"` | -- | Output DTO configuration, or `"void"` if no return value. |
| `handlers` | `string[]` | -- | Required. Ordered list of handler references. |
| `withChild` | `boolean` | `false` | Include child entities in the result (for get operations). |

---

#### input

Configures the input DTO for a use case.

```yaml
input:
  from: <ModelName>
  pick: [field1, field2]
  omit: [field3]
  add:
    <fieldName>:
      type: <type>
      source: <string>
  validate:
    <fieldName>:
      pattern: <regex>
      min: <number>
      max: <number>
  identifier: <string>
  partial: <boolean>
  parentId: <string>
  pagination:
    type: offset | cursor
    defaults:
      limit: <number>
      maxLimit: <number>
  filters:
    <fieldName>:
      type: <type>
      enum: [<string>, ...]
      optional: <boolean>
      searchIn: [<fieldName>, ...]
  sorting:
    allow: [field1, field2]
    default:
      field: <fieldName>
      order: asc | desc
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | `string` | -- | Model to derive fields from. |
| `pick` | `string[]` | -- | Include only these fields from the model. Mutually exclusive with `omit`. |
| `omit` | `string[]` | -- | Exclude these fields from the model. Mutually exclusive with `pick`. |
| `add` | `Record<string, { type, source? }>` | -- | Additional fields not on the model. `type` can be `"array"` for nested child entities. |
| `validate` | `Record<string, { pattern?, min?, max? }>` | -- | Validation rules for specific fields. |
| `identifier` | `string` | -- | Path parameter used to identify the entity (e.g., `"id"`). |
| `partial` | `boolean` | `false` | Make all input fields optional (for partial updates). |
| `parentId` | `string` | -- | Field name linking to the parent entity (for child entities). |
| `pagination` | `PaginationConfig` | -- | Pagination settings. |
| `pagination.type` | `"offset"` or `"cursor"` | -- | Pagination strategy. |
| `pagination.defaults.limit` | `number` | -- | Default page size. |
| `pagination.defaults.maxLimit` | `number` | -- | Maximum allowed page size. |
| `filters` | `Record<string, FilterFieldConfig>` | -- | Filterable fields. |
| `filters.<field>.type` | `string` | -- | Filter value type. |
| `filters.<field>.enum` | `string[]` | -- | Allowed filter values. |
| `filters.<field>.optional` | `boolean` | -- | Whether the filter is optional. |
| `filters.<field>.searchIn` | `string[]` | -- | Fields to search across (for text search filters). |
| `sorting` | `SortingConfig` | -- | Sorting configuration. |
| `sorting.allow` | `string[]` | -- | Fields that can be sorted on. |
| `sorting.default.field` | `string` | -- | Default sort field. |
| `sorting.default.order` | `"asc"` or `"desc"` | -- | Default sort order. |

---

#### output

Configures the output DTO for a use case.

```yaml
output:
  from: <ModelName>
  pick: [field1, field2]
  include:
    <nestedName>:
      from: <ChildModelName>
      pick: [field1, field2]
  add:
    <fieldName>:
      type: <type>
      source: <string>
  pagination: <boolean>
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | `string` | -- | Model to derive output fields from. |
| `pick` | `string[]` | -- | Include only these fields in the output. |
| `include` | `Record<string, { from, pick? }>` | -- | Nested entities to include in the output. |
| `add` | `Record<string, { type, source? }>` | -- | Additional computed fields. |
| `pagination` | `boolean` | `false` | Whether the output is a paginated list. |

---

#### handlers

Handlers define the execution pipeline for a use case. They are processed in order.

**Built-in handlers:**

| Handler | Description |
|---------|-------------|
| `default:list` | Returns a paginated list of entities. |
| `default:get` | Fetches a single entity by identifier. |
| `default:create` | Creates a new entity with input validation. |
| `default:update` | Updates an existing entity by identifier. |
| `default:delete` | Soft-deletes an entity (sets `deleted_at`). |

**Custom handlers:**

Custom handlers reference methods on the service class. Use the format `service:methodName` or just `methodName`. The generator creates stub methods with TODO comments for custom handlers.

Multiple handlers can be chained:

```yaml
handlers:
  - default:get
  - service:validateStatus
  - service:performAction
```

---

### api

Defines REST API endpoints.

```yaml
api:
  <ResourceName>:
    prefix: <string>
    endpoints:
      - method: GET | POST | PUT | PATCH | DELETE
        path: <string>
        useCase: <ModelName>:<actionName>
        auth: <AuthConfig>
```

| Field | Type | Description |
|-------|------|-------------|
| `prefix` | `string` | Base URL path for this resource (e.g., `/api/blog`). |
| `endpoints` | `ApiEndpointConfig[]` | List of endpoint definitions. |

**ApiEndpointConfig:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `method` | `string` | -- | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. |
| `path` | `string` | -- | Route path relative to prefix. Supports parameters (e.g., `/:id`). |
| `useCase` | `string` | -- | Reference to a use case in format `ModelName:actionName`. |
| `auth` | `AuthConfig` | -- | Authorization configuration. See [auth](#auth). |

---

### web

Defines server-rendered web pages.

```yaml
web:
  <ResourceName>:
    prefix: <string>
    layout: <string>
    pages:
      - path: <string>
        method: GET | POST
        useCase: <ModelName>:<actionName>
        view: <string>
        layout: <string>
        auth: <AuthConfig>
        onSuccess:
          redirect: <string>
          toast: <string>
          back: <boolean>
          stay: <boolean>
        onError:
          stay: <boolean>
          toast: <string>
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prefix` | `string` | -- | Base URL path for web routes (e.g., `/blog`). |
| `layout` | `string` | -- | Default layout template name. Use `"none"` for no layout. |
| `pages` | `WebPageConfig[]` | -- | List of page definitions. |

**WebPageConfig:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | `string` | -- | Route path relative to prefix. |
| `method` | `string` | `"GET"` | HTTP method (`GET` or `POST`). |
| `useCase` | `string` | -- | Reference to a use case. Omit for pages that do not load data (e.g., empty create forms). |
| `view` | `string` | -- | Template name (without extension). |
| `layout` | `string` | Inherits from resource | Layout template override. |
| `auth` | `AuthConfig` | -- | Authorization configuration. |
| `onSuccess.redirect` | `string` | -- | URL to redirect to on success. Supports `:id` placeholder. |
| `onSuccess.toast` | `string` | -- | Toast message on success. |
| `onSuccess.back` | `boolean` | -- | Navigate back on success. |
| `onSuccess.stay` | `boolean` | -- | Stay on the current page on success. |
| `onError.stay` | `boolean` | -- | Stay on the current page on error. |
| `onError.toast` | `string` | -- | Toast message on error. Use `"error"` to display the error message. |

---

### auth

Authorization can be configured on both API endpoints and web pages. The `auth` field accepts one of the following:

| Value | Type | Description |
|-------|------|-------------|
| `"all"` | `string` | Public access. No authentication required. |
| `"authenticated"` | `string` | Any logged-in user (valid JWT). |
| `"owner"` | `string` | User must own the resource (matched via `owner_id` field). |
| `"admin"`, `"editor"`, etc. | `string` | User must have this role (from JWT `role` field). |
| `["owner", "admin"]` | `string[]` | User must match any one of the listed roles (OR logic). |

---

## Field Types

| YAML Type | TypeScript (Domain) | TypeScript (Store Row) | Description |
|-----------|--------------------|-----------------------|-------------|
| `string` | `string` | `string` | Text data. |
| `number` | `number` | `number` | Numeric data (general). |
| `integer` | `number` | `number` | Integer numeric data. |
| `decimal` | `number` | `number` | Decimal numeric data. |
| `boolean` | `boolean` | `boolean` | Boolean value. |
| `datetime` | `Date` | `string` | Date and time. |
| `date` | `Date` | `string` | Date only. |
| `id` | `number` | `number` | Foreign key / reference identifier. |
| `json` | `any` | `string` | Arbitrary JSON data. |
| `array` | `any[]` | `string` | Array (stored as JSON string). |
| `object` | `object` | `string` | Object (stored as JSON string). |
| `enum` | `string` | `string` | Enumerated string. Requires `values` to be set. |

Additionally, the `type` field can reference:

- Another **aggregate name** -- treated as a foreign key. The domain type becomes the referenced entity class; the store column becomes `<fieldName>Id` of type `number`.
- A **value object name** -- the domain type becomes the value object class; stored as a JSON string in the database.

---

## Generated File Structure

For each module, the generator produces the following files:

```
src/modules/<ModuleName>/
  domain/
    entities/
      <EntityName>.ts               # Domain entity class
    valueObjects/
      <ValueObjectName>.ts          # Value object class (if defined)
  application/
    dto/
      <ActionName>InputDto.ts       # Input DTO
      <ActionName>OutputDto.ts      # Output DTO
    useCases/
      <ActionName>UseCase.ts        # Use case orchestrator
    services/
      <EntityName>Service.ts        # Service with business logic
  infrastructure/
    controllers/
      <EntityName>ApiController.ts  # REST API controller
      <EntityName>WebController.ts  # Web page controller
    stores/
      <EntityName>Store.ts          # Data access layer
  views/
    <viewName>.html                 # HTML templates
```

The generator also updates:

- `src/app.ts` -- imports, provider initialization, dependency injection wiring, and controller registration (between `// currentjs:controllers:start` and `// currentjs:controllers:end` markers).
- `src/system.ts` -- created if missing.

---

## Notes

### Auto-Generated Fields

The following fields are added automatically and must not be included in the YAML field definitions:

- **Root aggregates:** `id`, `ownerId`.
- **Child entities:** `id`, `<parentEntityName>Id` (e.g., `invoiceId` for a child of `Invoice`).
- **Store tables:** `id`, `created_at`, `updated_at`, `deleted_at`, `owner_id` (or parent ID column).

### Naming Conventions

- Module names in `app.yaml` should be PascalCase (e.g., `Blog`).
- Module directories are created using the name as provided to `create module`.
- Module YAML files are named in lowercase (e.g., `blog.yaml`).
- Database table names are the lowercased entity name with an `s` suffix (e.g., `blogs`).

### Template Regeneration

By default, `generate` does not overwrite existing HTML templates. New templates (for views not yet on disk) are always created. Use `--with-templates` to force regeneration of all templates.

### File Change Tracking

The generator maintains a `registry.json` file to track the hash of each generated file's content. This enables `commit` and `diff` to detect which files have been manually modified. The registry is initialized per project via `initGenerationRegistry()`.

### Commit Mechanism

`currentjs commit` does not modify generated files. It records the diff between the current file content and what the generator would produce, saving it as a JSON file in the `commits/` directory. During regeneration, the generator attempts to reapply these stored diffs. If reapplication fails and neither `--force` nor `--skip` is set, the user is prompted.

### Static Route Priority

When generating web controllers, static routes (e.g., `/create`) are registered before parameterized routes (e.g., `/:id`) to prevent incorrect route matching.

### Child Entities

To define parent-child relationships:

1. List child entity names in the parent's `entities` field under `domain.aggregates`.
2. Set `input.parentId` in child use cases to the parent ID field name.
3. Child entities get `getByParentId()` in their stores and `listByParent()` in their services.

### app.ts Markers

The `src/app.ts` file uses marker comments to delineate the auto-generated section:

```
// currentjs:controllers:start
... generated wiring code ...
// currentjs:controllers:end
```

Code outside these markers is preserved across regeneration. Code inside is replaced.

### Migration Compatibility

The `migrate commit` command uses a different model format (`models` array with `name` and `fields` properties) than the main generators (`domain.aggregates` map). These two formats are not interchangeable. Ensure the correct format is used for each command.
