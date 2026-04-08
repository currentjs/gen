# Changelog

## [0.5.7] - 2026-04-08

- HTTP errors in generated controllers

## [0.5.6] - 2026-04-08

- database identifier types (numeric, uuid, nanoid)

## [0.5.5] - 2026-04-07

- data access layer generation fixes and improvements

## [0.5.4] - 2026-04-07

- Array and union value objects

## [0.5.3] - 2026-04-07

- expand autowiring (DI) for providers

## [0.5.2] - 2026-03-21

- skip templates on generation; introduced a flag to regenerate templates
- rename command create app to init
- adjusted output for create module command
- create model command
- migrate commit fix
- rework documentation

## [0.5.1] - 2026-02-28

- fixes pack:
- aggregate references
- layout setting in module config
- SPA layout mismatch bug (if a page uses other layout, its loaded inside current one)
- local provider imports bug
- types in generated services (was any)
- access control issues

## [0.5.0] – 2026-02-26

So many changes were made that we skipped version 0.4:
- Rethought YAML structures entirely
- Implemented DI wiring during the build process
- Internals: Added comprehensive testing
- Internals: Completed a full refactoring of the codebase

## [0.3.2] - 2025-12-28

fixed an issue 6

## [0.3.1] - 2025-10-03

bug fixed with overwriting committed changes

## [0.3.0] - 2025-10-03

- model relationship (between each other); - frontend script cleanup; - new command: migrate commit; - small refactoring.

## [0.2.2] - 2025-10-02

fix bug: required params after optional in the generated models; fix: views(templates) are not stored in the registry and being regenerated (overwritten); small readme fix; running 'npm i' on 'create app' and 'npm run build' on 'generate'

## [0.2.1] - 2025-09-18

Improve generated package.json

## [0.2.0] - 2025-09-18

implement multi-model generation (controllers, services); fix service-controller interaction; update documentation: more clear & reflect important things

## [0.1.2] - 2025-09-18

fix: failed to generate with empty permissions actions

## [0.1.1] - 2025-09-17

Initial release
