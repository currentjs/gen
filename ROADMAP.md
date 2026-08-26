# CurrentJS Roadmap

## Next Releases

| Feature                           | Parts       | Release                | Size | Notes                                                                            |
|-----------------------------------|-------------|------------------------|------|----------------------------------------------------------------------------------|
| ✅ Stabilization                   | gen         | 0.5.1                  | -    | Fix bugs                                                                         |
| ✅ Conditional template generation | gen         | 0.5.2                  | S    | Skip existing templates; add separate command/flag                               |
| ✅ Console input/output adjust     | gen         | 0.5.2                  | S    | `init`, `create module`                                                          |
| ✅ `current create model`          | gen         | 0.5.2                  | M    | see below                                                                        |
| ✅ fix DI (autowiring) providers   | gen         | 0.5.3                  | M    |                                                                                  |
| ✅ Array and union value objs      | gen         | 0.5.4                  | M    |                                                                                  |
| ✅ Fix data access layer gen       | gen         | 0.5.5                  | S    |                                                                                  |
| ✅ Configurable identifier types   | gen         | 0.5.6                  | M    | Support int/uuid/string in app config                                            |
| ✅ HTTP error handling             | router, gen | gen: 0.5.7 router: 0.2 | M    | Add errors to router, use in generator                                           |
| ✅ Minor fixes                     | gen         | 0.5.8                  | M    | non-numeric ids (db) + change signature for store method "update"                |
| ✅ Add logging                     | router      | ~~0.3~~ 0.2            | M    |                                                                                  |
| ✅ Remove "useCase" layer"         | gen         | 0.6                    | M    |                                                                                  |
| ✅ cross-module com: queries       | gen         | 0.6.1                  | M    |                                                                                  |
| ✅ Support of tailwind in tpls     | gen         | 0.6.2                  | M    | setting in app.yaml                                                              |
| ✅ Postgres support in generator   | gen         | 0.6.3                  | M    | Generate code for postgres                                                       |
| ✅ Database migrations             | gen         | 0.6.3                  | L    |                                                                                  |
| ✅ current ai                      | skill, gen  | 0.6.4                  | L    | `currentjs ai` installs skills for Cursor + Claude Code from registry            |
| scaffold (UI)                     | gen*        | xx                     | M    | new package is required. `gen` will just install/run it                          |
| ✅ Postgres provider               | provider    | 1.x                    | M    | New database provider                                                            |
| WebSocket support                 | router      | later                  | L    | Router-level only for now                                                        |
| Queue handling                    | gen         | later                  | XL   | Extend beyond api/web to support message queues (* may require a new package)    |
| ✅ Installing modules/providers    | gen         | 0.6.4                  | M    | `current install module/provider` – installs from registry with version tracking |
| ✅ cross-module com: commands      | gen         | 0.6.6                  | L    |                                                                                  |
| ✅ search & searchableList         | gen         | 0.6.6                  | M    | add new default handlers & support them in the template                          |

---

**Size Legend:** S = Small, M = Medium, L = Large, XL = Extra Large

---
