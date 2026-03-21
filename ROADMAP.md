# CurrentJS Roadmap

## Next Releases

| Feature                           | Parts       | Release                | Size | Notes                                                                           |
|-----------------------------------|-------------|------------------------|------|---------------------------------------------------------------------------------|
| ✅ Stabilization                   | gen         | 0.5.1                  | -    | Fix bugs                                                                        |
| ✅ Conditional template generation | gen         | 0.5.2                  | S    | Skip existing templates; add separate command/flag                              |
| ✅ Console input/output adjust     | gen         | 0.5.2                  | S    | `init`, `create module`                                                         |
| ✅ `current create model`          | gen         | 0.5.2                  | M    | see below                                                                       |
| Configurable identifier types     | gen         | 0.5.3                  | M    | Support int/uuid/string in app config                                           |
| HTTP error handling               | router, gen | gen: 0.5.4 router: 0.2 | M    | Add errors to router, use in generator                                          |
| Support of tailwind in tpls       | gen         | 0.5.5                  | M    | setting in app.yaml                                                             |
| Database migrations               | gen         | 0.5.6                  | L    |                                                                                 |
| Remove "useCase" layer"           | gen         | 0.6                    | M    | or "service"?                                                                   |
| Add logging                       | router      | 0.3                    | M    |                                                                                 |
| scaffold (UI)                     | gen*        | xx                     | M    | new package is required. `gen` will just install/run it                         |
| Postgres provider                 | provider    | 1.x                    | M    | New database provider                                                           |
| Postgres support in generator     | gen         | 1.x                    | M    | Generate code for postgres                                                      |
| WebSocket support                 | router      | later                  | L    | Router-level only for now                                                       |
| Queue handling                    | gen         | later                  | XL   | Extend beyond api/web to support message queues (* may require a new package)   |
| Installing modules/providers      | gen         | later                  | ?    | `current install module/provider` – after several apps created, extract modules |

---

**Size Legend:** S = Small, M = Medium, L = Large, XL = Extra Large

---

### some ideas to consider (19/03/26):
- `current install module` / `current install provider` [planned]
- `current scaffold` – opens the ui [planned]
