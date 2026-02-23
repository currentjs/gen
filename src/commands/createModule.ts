import * as fs from 'fs';
import * as path from 'path';
import { ensureDir, toAbsolute } from '../utils/cliUtils';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

function moduleYamlTemplate(moduleName: string): string {
  const entityName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  const lower = moduleName.charAt(0).toLowerCase() + moduleName.slice(1);
  
  const config = {
    domain: {
      aggregates: {
        [entityName]: {
          root: true,
          fields: {
            // Add your fields here, e.g.:
            // name: { type: 'string', required: true }
          }
        }
      }
    },
    useCases: {
      [entityName]: {
        list: {
          withChild: false,
          input: {
            pagination: {
              type: 'offset',
              defaults: {
                limit: 20,
                maxLimit: 100
              }
            }
          },
          output: {
            from: entityName,
            pagination: true
          },
          handlers: ['default:list']
        },
        get: {
          withChild: false,
          input: {
            identifier: 'id'
          },
          output: {
            from: entityName
          },
          handlers: ['default:get']
        },
        create: {
          withChild: false,
          input: {
            from: entityName
          },
          output: {
            from: entityName
          },
          handlers: ['default:create']
        },
        update: {
          withChild: false,
          input: {
            identifier: 'id',
            from: entityName,
            partial: true
          },
          output: {
            from: entityName
          },
          handlers: ['default:update']
        },
        delete: {
          withChild: false,
          input: {
            identifier: 'id'
          },
          output: 'void',
          handlers: ['default:delete']
        }
      }
    },
    api: {
      [entityName]: {
        prefix: `/api/${lower}`,
        endpoints: [
          // Public read access
          { method: 'GET', path: '/', useCase: `${entityName}:list`, auth: 'all' },
          { method: 'GET', path: '/:id', useCase: `${entityName}:get`, auth: 'all' },
          // Authenticated users can create
          { method: 'POST', path: '/', useCase: `${entityName}:create`, auth: 'authenticated' },
          // Owner or admin can update/delete
          { method: 'PUT', path: '/:id', useCase: `${entityName}:update`, auth: ['owner', 'admin'] },
          { method: 'DELETE', path: '/:id', useCase: `${entityName}:delete`, auth: ['owner', 'admin'] }
        ]
      }
    },
    web: {
      [entityName]: {
        prefix: `/${lower}`,
        layout: 'main_view',
        pages: [
          // Public list and detail views
          { path: '/', useCase: `${entityName}:list`, view: `${lower}List`, auth: 'all' },
          { path: '/:id', useCase: `${entityName}:get`, view: `${lower}Detail`, auth: 'all' },
          // Authenticated users can access create form
          { 
            path: '/create', 
            method: 'GET',
            view: `${lower}Create`, 
            auth: 'authenticated' 
          },
          { 
            path: '/create', 
            method: 'POST',
            useCase: `${entityName}:create`, 
            auth: 'authenticated',
            onSuccess: {
              redirect: `/${lower}/:id`,
              toast: `${entityName} created successfully`
            },
            onError: {
              stay: true,
              toast: 'error'
            }
          },
          // Owner or admin can edit
          { 
            path: '/:id/edit', 
            method: 'GET',
            useCase: `${entityName}:get`, 
            view: `${lower}Edit`, 
            auth: ['owner', 'admin']
          },
          { 
            path: '/:id/edit', 
            method: 'POST',
            useCase: `${entityName}:update`, 
            auth: ['owner', 'admin'],
            onSuccess: {
              back: true,
              toast: `${entityName} updated successfully`
            }
          }
        ]
      }
    }
  };
  
  return stringifyYaml(config);
}

export function handleCreateModule(name?: string): void {
  if (!name) {
    throw new Error('Module name is required: currentjs create module <name>');
  }
  const modulesRoot = path.join(process.cwd(), 'src', 'modules');
  const moduleRoot = path.join(modulesRoot, name);
  ensureDir(toAbsolute(moduleRoot));

  // Create standard subfolders for Clean Architecture
  ensureDir(path.join(moduleRoot, 'domain', 'entities'));
  ensureDir(path.join(moduleRoot, 'domain', 'valueObjects'));
  ensureDir(path.join(moduleRoot, 'application', 'useCases'));
  ensureDir(path.join(moduleRoot, 'application', 'services'));
  ensureDir(path.join(moduleRoot, 'application', 'dto'));
  ensureDir(path.join(moduleRoot, 'infrastructure', 'controllers'));
  ensureDir(path.join(moduleRoot, 'infrastructure', 'stores'));
  ensureDir(path.join(moduleRoot, 'views'));

  // Create module yaml
  const moduleYamlFile = path.join(moduleRoot, `${name.toLowerCase()}.yaml`);
  if (!fs.existsSync(moduleYamlFile)) {
    fs.writeFileSync(moduleYamlFile, moduleYamlTemplate(name), 'utf8');
  }

  // Add to root app.yaml
  const appYamlPath = path.join(process.cwd(), 'app.yaml');
  let appConfig: any = { modules: {} };
  if (fs.existsSync(appYamlPath)) {
    try {
      const content = fs.readFileSync(appYamlPath, 'utf8');
      appConfig = parseYaml(content) || { modules: {} };
    } catch {
      appConfig = { modules: {} };
    }
  }
  if (!appConfig.modules || typeof appConfig.modules !== 'object' || Array.isArray(appConfig.modules)) {
    appConfig.modules = {};
  }

  const moduleKey = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  const moduleYamlRel = path.posix.join('src', 'modules', name, `${name.toLowerCase()}.yaml`);
  const alreadyPresent = appConfig.modules[moduleKey]?.path === moduleYamlRel;
  if (!alreadyPresent) {
    appConfig.modules[moduleKey] = { path: moduleYamlRel };
  }

  fs.writeFileSync(appYamlPath, stringifyYaml(appConfig), 'utf8');
}

