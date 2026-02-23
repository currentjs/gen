# CurrentJS Roadmap

## Next Releases

| Feature                         | Parts | Release                | Size | Notes                                                                         |
|---------------------------------|------|------------------------|------|-------------------------------------------------------------------------------|
| Conditional template generation | gen  | 0.5.1                  | S    | Skip existing templates; add separate command/flag                            |
| Support of tailwind in tpls     | gen  | 0.5.2                  | M    | setting in app.yaml                                                           |
| HTTP error handling             | router, gen | gen: 0.5.3 router: 0.2 | M    | Add errors to router, use in generator                                        |
| Configurable identifier types   | gen  | 0.5.4                  | M    | Support int/uuid/string in app config                                         |
| Database migrations             | gen | 0.6                    | L    |                                                                               |
| Remove "useCase" layer"         | gen | 0.6.x                  | M    | or "service"?                                                                 |
| Add logging                     | router | 0.3 | M    |                                                                               |
| Postgres provider               | provider | 1.x                    | M    | New database provider                                                         |
| Postgres support in generator   | gen | 1.x                    | M    | Generate code for postgres                                                    |
| WebSocket support               | router | later                  | L    | Router-level only for now                                                     |
| Queue handling                  | gen* | later                  | XL   | Extend beyond api/web to support message queues (* may require a new package) |

---

**Size Legend:** S = Small, M = Medium, L = Large, XL = Extra Large
