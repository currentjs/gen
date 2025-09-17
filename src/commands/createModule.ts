import * as fs from 'fs';
import * as path from 'path';
import { ensureDir, toAbsolute } from '../utils/cliUtils';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

function moduleYamlTemplate(moduleName: string): string {
  const entityName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  const lower = moduleName.charAt(0).toLowerCase() + moduleName.slice(1);
  const config = {
    models: [
      {
        name: entityName,
        fields: [] as any[]
      }
    ],
    api: {
      prefix: `/api/${lower}`,
      endpoints: [
        { method: 'GET', path: '/', action: 'list' },
        { method: 'GET', path: '/:id', action: 'get' },
        { method: 'POST', path: '/', action: 'create' },
        { method: 'PUT', path: '/:id', action: 'update' },
        { method: 'DELETE', path: '/:id', action: 'delete' }
      ]
    },
    routes: {
      prefix: `/${lower}`,
      strategy: ['back', 'toast'],
      endpoints: [
        //bug: the order of the endpoints is important (to fix it in the router)
        { path: '/create', action: 'empty', view: `${lower}Create` },
        { path: '/', action: 'list', view: `${lower}List` },
        { path: '/:id', action: 'get', view: `${lower}Detail` },
        { path: '/:id/edit', action: 'get', view: `${lower}Update` },
      ]
    },
    actions: {
      list: { handlers: ['default:list'] },
      get: { handlers: ['default:getById'] },
      create: { handlers: ['default:create'] },
      update: { handlers: ['default:update'] },
      delete: { handlers: ['default:delete'] }
    },
    permissions: [] as any[]
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

  // Create standard subfolders
  ensureDir(path.join(moduleRoot, 'domain'));
  ensureDir(path.join(moduleRoot, 'application'));
  ensureDir(path.join(moduleRoot, 'infrastructure'));
  ensureDir(path.join(moduleRoot, 'views'));

  // Create module yaml
  const moduleYamlFile = path.join(moduleRoot, `${name.toLowerCase()}.yaml`);
  if (!fs.existsSync(moduleYamlFile)) {
    fs.writeFileSync(moduleYamlFile, moduleYamlTemplate(name), 'utf8');
  }

  // Add to root app.yaml
  const appYamlPath = path.join(process.cwd(), 'app.yaml');
  let appConfig: any = { modules: [] };
  if (fs.existsSync(appYamlPath)) {
    try {
      const content = fs.readFileSync(appYamlPath, 'utf8');
      appConfig = parseYaml(content) || { modules: [] };
    } catch {
      appConfig = { modules: [] };
    }
  }
  if (!Array.isArray(appConfig.modules)) appConfig.modules = [];

  // Use posix-style path in YAML
  const moduleYamlRel = path.posix.join('src', 'modules', name, `${name.toLowerCase()}.yaml`);
  const alreadyPresent = appConfig.modules.some((m: any) => (typeof m === 'string' ? m === moduleYamlRel : m?.module === moduleYamlRel));
  if (!alreadyPresent) {
    appConfig.modules.push({ module: moduleYamlRel });
  }

  fs.writeFileSync(appYamlPath, stringifyYaml(appConfig), 'utf8');
}

