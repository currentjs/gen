// Application-level templates for project scaffolding
import * as fs from 'fs';
import * as path from 'path';

function loadTemplate(filename: string): string {
  return fs.readFileSync(path.join(__dirname, 'data', filename), 'utf8');
}

export const packageJsonTemplate = (appName: string) => JSON.stringify(
  {
    name: appName || 'my-app',
    version: '0.1.0',
    private: true,
    scripts: {
      build: 'npm run clean && tsc -p tsconfig.json && npx path-fixer',
      start: 'node build/app.js',
      clean: 'rm -rf build',
      dev: 'ts-node src/app.ts',
      // uncomment this if you want to use the devstand script
      // devstand: 'npm i && npm link @currentjs/router @currentjs/templating @currentjs/provider-mysql && npm run build'
    },
    dependencies: {
      '@currentjs/router': 'latest',
      '@currentjs/templating': 'latest',
      '@currentjs/provider-mysql': 'latest',
    },
    devDependencies: {
      typescript: '^5.6.3',
      '@types/node': '^22.7.4',
      '@koz1024/path-fixer': '^0.2.1',
    },
    type: 'module'
  },
  null,
  2
);

export const tsconfigTemplate = loadTemplate('tsConfigTemplate');
export const appYamlTemplate = loadTemplate('appYamlTemplate');
export const appTsTemplate = loadTemplate('appTsTemplate');
export const mainViewTemplate = loadTemplate('mainViewTemplate');
export const errorTemplate = loadTemplate('errorTemplate');
export const frontendScriptTemplate = loadTemplate('frontendScriptTemplate');
export const translationsTemplate = loadTemplate('translationsTemplate');
export const cursorRulesTemplate = loadTemplate('cursorRulesTemplate');
export const systemTsTemplate = loadTemplate('systemTsTemplate');

// Directory structure constants
export const DEFAULT_DIRECTORIES = {
  SRC: 'src',
  DIST: 'build', 
  WEB: 'web',
  TEMPLATES: path.join('src', 'common', 'ui', 'templates'),
  SERVICES: path.join('src', 'common', 'services'),
  MIGRATIONS: 'migrations'
} as const;

// File names constants
export const DEFAULT_FILES = {
  PACKAGE_JSON: 'package.json',
  TSCONFIG: 'tsconfig.json',
  APP_YAML: 'app.yaml',
  APP_TS: 'app.ts',
  MAIN_VIEW: 'main_view.html',
  ERROR_TEMPLATE: 'error.html',
  FRONTEND_SCRIPT: 'app.js',
  TRANSLATIONS: 'translations.json',
  CURSOR_RULES: 'AGENTS.md',
  SYSTEM_TS: 'system.ts'
} as const;
