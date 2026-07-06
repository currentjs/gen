import * as path from 'path';
import { ensureDir, writeFileIfMissing, toAbsolute, runCommand } from '../utils/cliUtils';
import { 
  packageJsonTemplate,
  tsconfigTemplate,
  appYamlTemplate,
  appTsTemplate,
  mainViewTemplate,
  mainViewTemplateTailwind,
  errorTemplate,
  errorTemplateTailwind,
  frontendScriptTemplate,
  translationsTemplate,
  cursorRulesTemplate,
  systemTsTemplate,
  envTemplate,
  DEFAULT_DIRECTORIES,
  DEFAULT_FILES
} from '../generators/templates/appTemplates';

export function handleInit(rawName?: string): void {
  const targetRoot = rawName ? toAbsolute(rawName) : process.cwd();
  ensureDir(targetRoot);

  // Basic structure using constants
  const srcDir = path.join(targetRoot, DEFAULT_DIRECTORIES.SRC);
  const distDir = path.join(targetRoot, DEFAULT_DIRECTORIES.DIST);
  const webDir = path.join(targetRoot, DEFAULT_DIRECTORIES.WEB);
  const templatesDir = path.join(targetRoot, DEFAULT_DIRECTORIES.TEMPLATES);
  const servicesDir = path.join(targetRoot, DEFAULT_DIRECTORIES.SERVICES);
  const migrationsDir = path.join(targetRoot, DEFAULT_DIRECTORIES.MIGRATIONS);
  ensureDir(srcDir);
  ensureDir(distDir);
  ensureDir(webDir);
  ensureDir(templatesDir);
  ensureDir(servicesDir);
  ensureDir(migrationsDir);

  // Files using imported templates
  writeFileIfMissing(path.join(targetRoot, DEFAULT_FILES.ENV), envTemplate);
  writeFileIfMissing(path.join(targetRoot, DEFAULT_FILES.PACKAGE_JSON), packageJsonTemplate(path.basename(targetRoot)));
  writeFileIfMissing(path.join(targetRoot, DEFAULT_FILES.TSCONFIG), tsconfigTemplate);
  writeFileIfMissing(path.join(targetRoot, DEFAULT_FILES.APP_YAML), appYamlTemplate);
  writeFileIfMissing(path.join(targetRoot, DEFAULT_FILES.CURSOR_RULES), cursorRulesTemplate);
  writeFileIfMissing(path.join(srcDir, DEFAULT_FILES.APP_TS), appTsTemplate);
  writeFileIfMissing(path.join(srcDir, DEFAULT_FILES.SYSTEM_TS), systemTsTemplate);

  // Both styling variants are always written.
  // Bootstrap is the default active styling so its template has name="main_view" / name="error".
  // Tailwind templates have name="main_view_tailwind" / name="error_tailwind" (inactive).
  // The `generate` command swaps the internal names based on config.styling.
  writeFileIfMissing(path.join(templatesDir, DEFAULT_FILES.MAIN_VIEW_BOOTSTRAP), mainViewTemplate);
  writeFileIfMissing(path.join(templatesDir, DEFAULT_FILES.MAIN_VIEW_TAILWIND), mainViewTemplateTailwind);
  writeFileIfMissing(path.join(templatesDir, DEFAULT_FILES.ERROR_BOOTSTRAP), errorTemplate);
  writeFileIfMissing(path.join(templatesDir, DEFAULT_FILES.ERROR_TAILWIND), errorTemplateTailwind);

  writeFileIfMissing(path.join(webDir, DEFAULT_FILES.FRONTEND_SCRIPT), frontendScriptTemplate);
  writeFileIfMissing(path.join(webDir, DEFAULT_FILES.TRANSLATIONS), translationsTemplate);

  // Run npm install
  runCommand('npm install', {
    cwd: targetRoot,
    errorMessage: '[X] Failed to install dependencies:'
  });
}
