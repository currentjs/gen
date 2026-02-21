# CurrentJS Roadmap

## Current: v0.5 — Stabilization

### Scenarios to verify

**Domain Layer:**
- [ ] Entity with all field types (string, number, boolean, datetime, id, money, json, enum)
- [ ] Entity with value objects (e.g., Money with amount + currency)
- [ ] Entity-to-entity references (foreign keys, e.g., `authorId` → User)
- [ ] Child entities within aggregates (e.g., InvoiceItem inside Invoice)
- [ ] Optional vs required fields
- [ ] Field constraints (min, max, pattern, unique)

**Use Cases / DTOs:**
- [ ] Input with `pick` (subset of entity fields)
- [ ] Input with `omit` (exclude specific fields)
- [ ] Input with `add` (extra fields not on entity)
- [ ] Partial update (`partial: true` — all fields optional)
- [ ] Nested array inputs (e.g., `items: { type: array, of: InvoiceItem }`)
- [ ] Pagination: cursor mode
- [ ] Pagination: offset mode
- [ ] Filters and search (`searchIn` across multiple fields)
- [ ] Custom sorting (`allow`, `default`)
- [ ] Handler chains with multiple handlers
- [ ] Custom handlers generate empty stubs correctly

**API / Auth:**
- [ ] `auth: all` (public access)
- [ ] `auth: authenticated`
- [ ] `auth: owner` (post-fetch check for reads, pre-mutation check for writes)
- [ ] `auth: admin` (single role)
- [ ] `auth: [owner, admin]` (array — OR logic, privileged bypass)

**Web Layer:**
- [ ] View rendering with layout
- [ ] Form POST with `onSuccess.redirect` (dynamic path like `/invoice/:id`)
- [ ] Form POST with `onSuccess.toast`
- [ ] Form error handling (`onError.stay`)

**Cross-cutting:**
- [ ] Value objects serialize/deserialize in Store correctly
- [ ] Datetime fields convert between Date objects and DB strings
- [ ] JSON fields store and retrieve properly
- [ ] `getResourceOwner()` generated for aggregate roots

### Before release
- [ ] Remove legacy support
- [ ] Update README
- [ ] Don't forget to skip version (v0.3 -> v0.5), thus GH actions are not suitable for release (can be done locally with manual updating package.json)

## Next Releases

| Feature                         | Parts | Release                | Size | Notes                                                                         |
|---------------------------------|------|------------------------|----|-------------------------------------------------------------------------------|
| Conditional template generation | gen  | 0.5.1                  | S  | Skip existing templates; add separate command/flag                            |
| HTTP error handling             | router, gen | gen: 0.5.2 router: 0.2 | M  | Add errors to router, use in generator                                        |
| Configurable identifier types   | gen  | 0.5.3                  | M  | Support int/uuid/string in app config                                         |
| Database migrations             | gen | 0.6                    | L  |                                                                               |
| Remove "useCase" layer"         | gen | 0.6.x                  | M  | or "service"?                                                                 |
| Add logging                     | router | 0.3 | M  |                                                                               |
| Postgres provider               | provider | 1.x                    | M  | New database provider                                                         |
| Postgres support in generator   | gen | 1.x                    | M  | Generate code for postgres                                                    |
| WebSocket support               | router | later                  | L  | Router-level only for now                                                     |
| Queue handling                  | gen* | later                  | XL | Extend beyond api/web to support message queues (* may require a new package) |

---

**Size Legend:** S = Small, M = Medium, L = Large, XL = Extra Large
