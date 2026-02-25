import * as fs from 'fs';
import * as path from 'path';

export interface ConstructorParam {
  name: string;
  type: string;
}

export interface ClassInfo {
  className: string;
  filePath: string;
  isController: boolean;
  isInjectable: boolean;
  constructorParams: ConstructorParam[];
}

export interface InstantiationStep {
  className: string;
  varName: string;
  importPath: string;
  constructorArgs: string[];
  isController: boolean;
}

const INJECTABLE_RE = /@Injectable\s*\(/;
const CONTROLLER_RE = /@Controller\s*\(/;
const EXPORT_CLASS_RE = /export\s+class\s+(\w+)/;
const CONSTRUCTOR_PARAMS_RE = /constructor\s*\(([^)]*)\)/s;
const PARAM_RE = /(?:private|protected|public)\s+(\w+)\s*:\s*([A-Za-z_]\w*)/g;

export function parseClassFile(filePath: string): ClassInfo | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const classMatch = content.match(EXPORT_CLASS_RE);
  if (!classMatch) return null;

  const isInjectable = INJECTABLE_RE.test(content);
  const isController = CONTROLLER_RE.test(content);

  if (!isInjectable && !isController) return null;

  const className = classMatch[1];
  const constructorParams: ConstructorParam[] = [];

  const ctorMatch = content.match(CONSTRUCTOR_PARAMS_RE);
  if (ctorMatch) {
    const paramsSrc = ctorMatch[1].replace(/\n/g, ' ');
    let match: RegExpExecArray | null;
    const paramRe = new RegExp(PARAM_RE.source, PARAM_RE.flags);
    while ((match = paramRe.exec(paramsSrc))) {
      constructorParams.push({ name: match[1], type: match[2] });
    }
  }

  return { className, filePath, isController, isInjectable, constructorParams };
}

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

export function scanModuleClasses(moduleDir: string): ClassInfo[] {
  const tsFiles = walkTsFiles(moduleDir);
  const classes: ClassInfo[] = [];
  for (const file of tsFiles) {
    const info = parseClassFile(file);
    if (info) classes.push(info);
  }
  return classes;
}

/**
 * @param classes - All discovered @Injectable and @Controller classes
 * @param providerVarByType - Default mapping from interface type to variable name (e.g., ISqlProvider -> dbMysql)
 * @param classProviderVar - Per-class override for provider variable (className -> varName).
 *   Used when different modules use different database providers.
 * @param srcDir - Absolute path to src/ directory (for computing relative import paths)
 */
export function buildInstantiationOrder(
  classes: ClassInfo[],
  providerVarByType: Map<string, string>,
  classProviderVar: Map<string, string>,
  srcDir: string
): InstantiationStep[] {
  const classMap = new Map<string, ClassInfo>();
  for (const cls of classes) {
    if (!classMap.has(cls.className)) {
      classMap.set(cls.className, cls);
    }
  }

  const graph = new Map<string, string[]>();
  for (const cls of classMap.values()) {
    const deps: string[] = [];
    for (const param of cls.constructorParams) {
      if (classMap.has(param.type)) {
        deps.push(param.type);
      }
    }
    graph.set(cls.className, deps);
  }

  const sorted = topologicalSort(graph);

  const steps: InstantiationStep[] = [];
  const varNames = new Map<string, string>();

  for (const className of sorted) {
    const cls = classMap.get(className)!;
    const varName = className.charAt(0).toLowerCase() + className.slice(1);
    varNames.set(className, varName);

    const constructorArgs: string[] = [];
    for (const param of cls.constructorParams) {
      if (classProviderVar.has(className) && providerVarByType.has(param.type)) {
        constructorArgs.push(classProviderVar.get(className)!);
      } else if (providerVarByType.has(param.type)) {
        constructorArgs.push(providerVarByType.get(param.type)!);
      } else if (varNames.has(param.type)) {
        constructorArgs.push(varNames.get(param.type)!);
      }
    }

    const relPath = path.relative(srcDir, cls.filePath)
      .replace(/\\/g, '/')
      .replace(/\.ts$/, '');
    const importPath = relPath.startsWith('.') ? relPath : `./${relPath}`;

    steps.push({
      className,
      varName,
      importPath,
      constructorArgs,
      isController: cls.isController
    });
  }

  return steps;
}

function topologicalSort(graph: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: string[] = [];

  function visit(node: string): void {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      throw new Error(`Circular dependency detected involving: ${node}`);
    }
    visiting.add(node);
    const deps = graph.get(node) || [];
    for (const dep of deps) {
      if (graph.has(dep)) {
        visit(dep);
      }
    }
    visiting.delete(node);
    visited.add(node);
    result.push(node);
  }

  for (const node of graph.keys()) {
    visit(node);
  }

  return result;
}

export function resolveProviderImport(
  importSpec: string,
  appTsDir: string
): { importPath: string; className: string } {
  const baseName = importSpec.split('/').pop() || 'provider';
  const className = baseName
    .replace(/^[^a-zA-Z_]*/g, '')
    .split(/[-_]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

  const isLocal = importSpec.startsWith('.') || importSpec.startsWith('/');
  if (isLocal) {
    const absPath = path.resolve(appTsDir, importSpec);
    let relPath = path.relative(appTsDir, absPath).replace(/\\/g, '/');
    if (!relPath.startsWith('.')) relPath = `./${relPath}`;
    return { importPath: relPath, className };
  }

  return { importPath: importSpec, className };
}
