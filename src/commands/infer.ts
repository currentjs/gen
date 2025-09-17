import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolveYamlPath, toAbsolute } from '../utils/cliUtils';

type InferredField = {
  name: string;
  type: string;
  required?: boolean;
  auto?: boolean;
};

function reverseType(tsType: string): string {
  const t = tsType.trim();
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'Date') return 'datetime';
  if (t === 'any[]') return 'array';
  if (t === 'object') return 'object';
  if (t === 'any') return 'json';
  return 'json';
}

function inferFromConstructorParams(paramsSrc: string): InferredField[] {
  // Remove newlines to simplify parsing
  const src = paramsSrc.replace(/\n/g, ' ');
  const fields: InferredField[] = [];
  const regex = /public\s+(\w+)(\?)?\s*:\s*([^=,]+)(\s*=\s*([^,]+))?/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = regex.exec(src))) {
    const name = match[1];
    const optionalMark = !!match[2];
    const tsType = match[3].trim();
    const hasDefault = !!match[4];
    if (index === 0 && name === 'id') {
      // Skip id
      index += 1;
      continue;
    }
    const yamlType = reverseType(tsType);
    const field: InferredField = { name, type: yamlType };
    if (hasDefault) field.auto = true;
    // required: if optional mark present then not required; if auto true, mark not required as well
    if (optionalMark || hasDefault) field.required = false;
    else field.required = true;
    fields.push(field);
    index += 1;
  }
  return fields;
}

function parseEntity(filePath: string): { entityName: string; fields: InferredField[] } {
  const content = fs.readFileSync(filePath, 'utf8');
  const classMatch = content.match(/export\s+class\s+(\w+)\s*\{/);
  if (!classMatch) {
    throw new Error(`Cannot find exported class in ${filePath}`);
  }
  const entityName = classMatch[1];
  // Extract constructor params
  const ctorMatch = content.match(/constructor\s*\(([^)]*)\)/s);
  if (!ctorMatch) {
    throw new Error(`Cannot find constructor in ${filePath}`);
  }
  const paramsSrc = ctorMatch[1];
  const fields = inferFromConstructorParams(paramsSrc);
  return { entityName, fields };
}

function findModuleYamlForEntity(entityFile: string): string | null {
  const abs = toAbsolute(entityFile);
  // Expect .../src/modules/<ModuleName>/domain/entities/<Entity>.ts
  const parts = abs.split(path.sep);
  const idx = parts.lastIndexOf('modules');
  if (idx === -1 || idx + 1 >= parts.length) return null;
  const moduleName = parts[idx + 1];
  // Build absolute module dir (handle leading path segment on POSIX correctly)
  const moduleDir = path.isAbsolute(abs)
    ? path.join(path.sep, ...parts.slice(1, idx + 2))
    : path.join(...parts.slice(0, idx + 2));
  // Try to find any yaml in module dir (prefer one matching module name)
  try {
    const entries = fs.readdirSync(moduleDir);
    const yamls = entries.filter(e => e.toLowerCase().endsWith('.yaml'));
    if (yamls.length > 0) {
      const preferred = yamls.find(y => y.toLowerCase() === `${moduleName.toLowerCase()}.yaml`);
      const chosen = preferred ?? yamls[0];
      return path.join(moduleDir, chosen);
    }
  } catch {
    // ignore
  }
  // Fallback to conventional name
  const moduleYaml = path.join(moduleDir, `${moduleName.toLowerCase()}.yaml`);
  return moduleYaml;
}

export function handleInfer(entityFileArg?: string, write?: boolean): void {
  if (!entityFileArg) {
    throw new Error('Usage: currentjs infer --file <path/to/Entity.ts> [--write]');
  }
  const entityFile = toAbsolute(entityFileArg);
  if (!fs.existsSync(entityFile)) {
    throw new Error(`Entity file not found: ${entityFile}`);
  }

  const { entityName, fields } = parseEntity(entityFile);

  const modelDesc = {
    name: entityName,
    fields
  };

  if (!write) {
    // Print a YAML snippet for the model only
    // eslint-disable-next-line no-console
    console.log(stringifyYaml({ models: [modelDesc] }));
    return;
  }

  const moduleYamlPath = findModuleYamlForEntity(entityFile);
  if (!moduleYamlPath) {
    throw new Error('Could not determine module YAML path from entity file location. Use --write only within a module structure.');
  }

  let config: any = {};
  if (fs.existsSync(moduleYamlPath)) {
    try {
      config = parseYaml(fs.readFileSync(moduleYamlPath, 'utf8')) || {};
    } catch {
      config = {};
    }
  }
  if (!config.models) config.models = [];
  const idx = config.models.findIndex((m: any) => m && m.name === entityName);
  if (idx === -1) config.models.push(modelDesc);
  else config.models[idx] = modelDesc;

  fs.mkdirSync(path.dirname(moduleYamlPath), { recursive: true });
  const yamlOut = stringifyYaml(config);
  fs.writeFileSync(moduleYamlPath, yamlOut, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Updated ${path.relative(process.cwd(), path.resolve(moduleYamlPath))} with model ${entityName}`);
}

