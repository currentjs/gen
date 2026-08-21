# @currentjs/gen

An AI-ready CLI code generator that transforms YAML specifications into fully functional TypeScript applications following clean architecture principles. Works standalone or as a backend for AI coding assistants — describe what you need in natural language, and the AI handles YAML configuration, code generation, and custom business logic.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
  - [AI-Powered Workflow](#ai-powered-workflow)
- [Development Flow](#development-flow)
  - [TL;DR](#tldr)
- [Reference](#reference)
- [Module Configuration Overview](#module-configuration-overview)
- [Generated Source Code](#generated-source-code)
- [Change Tracking: diff and commit](#change-tracking-diff-and-commit)
- [Database Migrations](#database-migrations)
- [Template System](#template-system)
- [Registry: AI Skills, Modules & Providers](#registry-ai-skills-modules--providers)
- [Authorship & Contribution](#authorship--contribution)
- [License](#license)

## Installation

```bash
npm install -g @currentjs/gen
# or use without installing
npx @currentjs/gen
```

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

3. Edit the module YAML at `src/modules/Blog/blog.yaml` — define your data models, use cases, API endpoints, and web pages. See [Module Configuration Overview](#module-configuration-overview) for the YAML structure, or the full [Reference](REFERENCE.md) for all options.

4. Generate TypeScript from the YAML:

```
currentjs generate Blog
```

5. Optionally customize the generated code (business logic, templates, etc.), then preserve your changes:

```
currentjs commit
```

To add custom (non-CRUD) behavior: define a method in the service, reference it in the module YAML as a handler, regenerate, and commit.

<details>
<summary>Alternative: interactive wizard</summary>

Instead of editing YAML by hand, you can use the interactive CLI wizard to define fields, use cases, and routes step-by-step:

```
currentjs create module Blog
currentjs create model Blog:Post
```

The wizard walks you through field definitions, use cases, and route configuration, then generates the YAML for you.

</details>

### AI-Powered Workflow

If you use an AI coding assistant like [Cursor](https://cursor.com) or [Claude Code](https://claude.ai), you can skip manual YAML editing entirely. Install the AI skills:

```
currentjs ai
```

This installs AI skills for both Cursor (`.cursor/skills/`) and Claude Code (`.claude/commands/`). Then describe the module you need using the `/current-create-module` skill:

> /current-create-module I need a Blog module with posts that have title, content, excerpt, and a status field (draft/published/archived). Posts should be publishable and archivable. Public read access, only authenticated users can create, owners and admins can edit/delete.

The AI will create the module structure, generate the YAML configuration, implement custom business logic, generate TypeScript, and build the app. For subsequent changes, describe what you want in natural language — the AI handles YAML updates and regeneration.

## Development Flow

```
                    ┌──────────────────┐
                    │   currentjs init │
                    └────────┬─────────┘
                             │
               ┌─────────────┴──────────────┐
               │                            │
               ▼                            ▼
  ┌──────────────────────┐    ┌───────────────────────┐
  │ currentjs create     │    │ currentjs ai          │
  │   module <Name>      │    │ (install AI skills)   │
  └──────────┬───────────┘    └───────────┬───────────┘
             │                            │
             ▼                            ▼
  ┌──────────────────────┐    ┌───────────────────────┐
  │ Edit YAML manually   │    │ AI skill:             │
  │ (or use wizard)      │    │ /current-create-module│
  └──────────┬───────────┘    │ (describe what you    │
             │                │  need in plain text)  │
             ▼                └───────────┬───────────┘
  ┌──────────────────────┐                │
  │ currentjs generate   │                │
  └──────────┬───────────┘                │
             │                            │
             └─────────────┬──────────────┘
                           │
                           ▼
             ┌───────────────────────┐
             │ Modify generated files│
             │ (optional)            │
             └───────────┬───────────┘
                         │
                         ▼
               ┌───────────────────┐
               │ currentjs commit  │
               └───────────────────┘
```

There are two paths to building a module:

- **Manual** — create a module with `currentjs create module`, edit the YAML by hand (or use the interactive wizard), then run `currentjs generate`. Full control over every configuration option.
- **AI-powered** — install AI skills with `currentjs ai`, then use `/current-create-module` to describe what you need in plain language. The AI creates the module, writes the YAML, generates code, and implements custom logic.

Both paths converge at the same point: once files are generated, you can optionally customize the generated code (business logic, templates, etc.) and run `currentjs commit` to preserve those changes across future regenerations.

#### TLDR

- Module YAML configurations (plus "commits") are the source of truth.
- `currentjs generate`: YAML + commits → TypeScript → JS
- For AI-assisted development: install skills with `currentjs ai`, then use `/current-create-module` — describe what you need, the AI handles everything.
- Since YAML is the main source of truth, it's also the best place to make changes.
- If changes are beyond configuration (require some coding), the best place is (in descending order): model, service.
- In order to preserve changes in TypeScript files, use `currentjs commit`.
- Templates can be changed freely, they are not regenerated by default.


## Reference

For detailed documentation of all CLI commands, YAML configuration options, and field types, see the [Reference](REFERENCE.md).

## Module Configuration Overview

Each module is configured through a single YAML file located at `src/modules/<Name>/<name>.yaml`. The configuration follows a layered structure inspired by Clean Architecture. Each layer in the YAML maps to a set of generated TypeScript files.

| YAML Section | Purpose | Generated Files |
|---|---|---|
| `domain` | Define your data models (aggregates, value objects, relationships) | Entity classes, value object classes |
| `useCases` | Define business operations, input/output shapes, handler chains | Services, DTOs |
| `api` | Define REST API endpoints with auth | API controller |
| `web` | Define server-rendered pages and forms | Web controller, HTML templates |

A minimal module YAML needs at least `domain` and `useCases`. The `api` and `web` sections are optional.

For the full YAML specification — field types, handler chains, input/output configuration, auth roles, form strategies, relationships, child entities, and more — see the [Reference](REFERENCE.md#module-configuration-module-yaml).

Modules can also expose read-only data to other modules via `exports.queries`, or trigger write operations in other modules via `exports.commands`. Consuming modules declare these under `dependencies`. See [exports](REFERENCE.md#exports) and [dependencies](REFERENCE.md#dependencies) in the Reference.

---

## Generated Source Code

When you run `currentjs generate`, the following files are produced for each model defined in a module:

```
src/modules/<ModuleName>/
  domain/
    entities/<EntityName>.ts           — Domain entity class with typed constructor and setters
    valueObjects/<ValueObject>.ts      — Value object class (if defined)
  application/
    dto/<Action>InputDto.ts            — Input DTO with parse() and validation
    dto/<Action>OutputDto.ts           — Output DTO with from() mapper
    services/<EntityName>Service.ts    — Service with handler implementations (CRUD + custom stubs)
  infrastructure/
    controllers/<EntityName>ApiController.ts  — REST endpoints; orchestrates handler chain, auth checks
    controllers/<EntityName>WebController.ts  — Page rendering; orchestrates handler chain, form handling
    stores/<EntityName>Store.ts        — Database access (CRUD, row-to-model conversion, relationships)
  views/
    <viewName>.html                    — HTML templates (list, detail, create, edit forms)
```

The generator also updates `src/app.ts` with dependency injection wiring between marker comments (`// currentjs:controllers:start` ... `// currentjs:controllers:end`). This section is fully regenerated each time — imports, instantiation order (topologically sorted), and the controllers array.

Each generated class is decorated with `@Injectable()` or `@Controller()`, so the DI system discovers and wires them automatically.

→ Reference: [Generated File Structure](REFERENCE.md#generated-file-structure) · [generate](REFERENCE.md#generate)

## Change Tracking: `diff` and `commit`

Generated code often needs small adjustments — custom business logic, template tweaks, validation rules. The generator includes a change tracking system so these adjustments survive regeneration.

### How it works

1. **Registry** — when files are generated, their content hashes are stored in `registry.json`.

2. **`currentjs diff [module]`** — compares each generated file's current content against what the generator would produce. Reports files as `[clean]`, `[modified]`, or `[missing]`.

3. **`currentjs commit [files...]`** — records the differences between your current files and the generated baseline. Diffs are saved as JSON files in the `commits/` directory.

4. **Regeneration** — on the next `currentjs generate`, committed changes are reapplied to the freshly generated code. If a change cannot be applied cleanly (e.g., the generated code changed in the same area), you are prompted to resolve it (unless `--force` or `--skip` is set).

### Practical workflow

```bash
# Generate code
currentjs generate

# Make your changes (service logic, templates, etc.)
# ...

# See what you changed
currentjs diff Blog

# Save your changes
currentjs commit

# Later, after modifying the YAML and regenerating:
currentjs generate
# Your committed changes are reapplied automatically
```

### Repository strategy

You can choose to either commit generated source code to git normally, or keep your repository lean by only tracking YAML files, `registry.json`, and the `commits/` directory. In the latter case, anyone can recreate the full source by running `currentjs generate`.

→ Reference: [diff](REFERENCE.md#diff) · [commit](REFERENCE.md#commit) · [Notes — File Change Tracking](REFERENCE.md#file-change-tracking) · [Notes — Commit Mechanism](REFERENCE.md#commit-mechanism)

## Database Migrations

The generator can produce SQL migration files based on changes to your domain models.

### `migrate commit`

```bash
currentjs migrate commit
```

Collects all aggregate definitions from module YAMLs, compares them against the stored schema state (`migrations/schema_state.yaml`), and generates a `.sql` migration file in the `migrations/` directory.

The migration file contains `CREATE TABLE`, `ALTER TABLE ADD/MODIFY/DROP COLUMN`, and `DROP TABLE` statements as needed. Foreign keys, indexes, and standard timestamp columns (`created_at`, `updated_at`, `deleted_at`) are handled automatically.

The SQL types of primary keys and foreign keys are determined by the `config.identifiers` setting in `app.yaml`.

After generating the file, the schema state is updated so the next `migrate commit` only produces a diff of subsequent changes.

### `migrate push`

```bash
currentjs migrate push
```

Applies all pending `.sql` files from the `migrations/` directory to the database. Applied migrations are tracked in a `_migrations` table (created automatically on first run). Files are applied in ascending filename (timestamp) order.

Requires a database connection — set the `MYSQL` or `POSTGRES` environment variable (or add it to a `.env` file in the project root):

```bash
MYSQL='{"host":"localhost","port":3306,"user":"root","password":"secret","database":"myapp"}'
```

### `migrate pull`

```bash
currentjs migrate pull
```

Introspects the live database schema and updates `migrations/schema_state.yaml` to match. Use this when the database has been modified outside the normal migration workflow. After running `migrate pull`, the next `migrate commit` will detect no diff.

→ Reference: [migrate commit](REFERENCE.md#migrate-commit) · [migrate push](REFERENCE.md#migrate-push) · [migrate pull](REFERENCE.md#migrate-pull)

## Template System

Generated HTML templates use the `@currentjs/templating` engine. Templates are placed in the module's `views/` directory and referenced by name in the `web` section of the YAML.

### Template header

Each template starts with a comment that declares its name:

```html
<!-- @template name="postList" -->
```

### Variables

```html
{{ title }}
{{ post.authorName }}
{{ formData.email || '' }}
```

### Loops

```html
<tbody x-for="items" x-row="item">
  <tr>
    <td>{{ item.name }}</td>
    <td>{{ $index }}</td>
  </tr>
</tbody>
```

`x-for` specifies the data key to iterate over, `x-row` names the loop variable. `$index` gives the current iteration index.

### Conditionals

```html
<div x-if="user.isAdmin">Admin-only content</div>
<span x-if="errors.name">{{ errors.name }}</span>
```

### Layouts

Templates are rendered inside a layout (specified per resource or per page in the `web` config). The layout receives the rendered template content as `{{ content }}`.

### Forms

Generated forms include `data-strategy` attributes for the frontend JavaScript to handle submission via AJAX:

```html
<form data-strategy='["toast", "back"]'
      data-entity-name="Post"
      data-field-types='{"age": "number", "active": "boolean"}'>
  <input name="title" type="text" required>
  <button type="submit">Save</button>
</form>
```

The `data-field-types` attribute tells the frontend how to convert form values before sending (e.g., string to number, checkbox to boolean).

### Styling Frameworks

The CSS framework used in generated templates is controlled by `config.styling` in `app.yaml`:

```yaml
config:
  styling: bootstrap   # or: tailwind
```

| Value | Framework |
|-------|-----------|
| `bootstrap` (default) | Bootstrap 5 via CDN |
| `tailwind` | Tailwind CSS via CDN play script |

→ Reference: [Styling Frameworks](REFERENCE.md#styling-frameworks)

### Template regeneration behavior

By default, `currentjs generate` does not overwrite existing HTML templates. Only missing templates are created. Use `--with-templates` to force regeneration of all templates.

→ Reference: [Notes — Template Regeneration](REFERENCE.md#template-regeneration) · [web](REFERENCE.md#web)

## Registry: AI Skills, Modules & Providers

The [CurrentJS Registry](https://github.com/currentjs/registry) provides installable content: AI skills, application modules, and providers.

### AI Skills

```bash
currentjs ai
```

Fetches all available skills from the registry and shows an interactive selection screen. Skills are installed for both **Cursor** (`.cursor/skills/`) and **Claude Code** (`.claude/commands/`). Already-installed skills show their version status; updates are pre-selected automatically.

### Install a Module

```bash
currentjs install module <name>
```

Downloads the named module into `src/modules/<name>/` and registers it in `app.yaml`. Prompts to update if a newer version is available. Run `currentjs generate` afterwards to produce TypeScript source files.

### Install a Provider

```bash
currentjs install provider <name>
```

Downloads the named provider into `src/shared/providers/<name>/`. Wire it into `app.yaml` under `providers:` after installation.

→ Reference: [ai](REFERENCE.md#ai) · [install module](REFERENCE.md#install-module) · [install provider](REFERENCE.md#install-provider)

---

## Authorship & Contribution

Vibecoded mostly with `claude` models by Konstantin Zavalny. Yes, it is a vibecoded solution, really.

Any contributions such as bugfixes, improvements, etc are very welcome.

## License

GNU Lesser General Public License (LGPL)

It simply means, that you:
- can create a proprietary application that uses this library without having to open source their entire application code (this is the "lesser" aspect of LGPL compared to GPL).
- can make any modifications, but must distribute those modifications under the LGPL (or a compatible license) and include the original copyright and license notice.
