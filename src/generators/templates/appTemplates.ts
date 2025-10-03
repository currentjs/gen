// Application-level templates for project scaffolding
import * as fs from 'fs';
import * as path from 'path';

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

export const tsconfigTemplate = fs.readFileSync(path.join(__dirname, 'data', 'tsConfigTemplate'), 'utf8');

export const appYamlTemplate = fs.readFileSync(path.join(__dirname, 'data', 'appYamlTemplate'), 'utf8');

export const appTsTemplate = fs.readFileSync(path.join(__dirname, 'data', 'appTsTemplate'), 'utf8');

export const mainViewTemplate = fs.readFileSync(path.join(__dirname, 'data', 'mainViewTemplate'), 'utf8');

export const errorTemplate = fs.readFileSync(path.join(__dirname, 'data', 'errorTemplate'), 'utf8');

export const frontendScriptTemplate = fs.readFileSync(path.join(__dirname, 'data', 'frontendScriptTemplate'), 'utf8');

export const translationsTemplate = fs.readFileSync(path.join(__dirname, 'data', 'translationsTemplate'), 'utf8');

export const cursorRulesTemplate = fs.readFileSync(path.join(__dirname, 'data', 'cursorRulesTemplate'), 'utf8');

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
  CURSOR_RULES: '.cursorrules'
} as const;
