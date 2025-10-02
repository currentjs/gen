import * as path from 'path';
import { ensureDir, writeFileIfMissing, toAbsolute, runCommand } from '../utils/cliUtils';
import { 
  packageJsonTemplate,
  tsconfigTemplate,
  appYamlTemplate,
  appTsTemplate,
  mainViewTemplate,
  errorTemplate,
  frontendScriptTemplate,
  translationsTemplate,
  cursorRulesTemplate,
  DEFAULT_DIRECTORIES,
  DEFAULT_FILES
} from '../generators/templates/appTemplates';

export function handleCreateApp(rawName?: string): void {
  const targetRoot = rawName ? toAbsolute(rawName) : process.cwd();
  ensureDir(targetRoot);

  // Basic structure using constants
  const srcDir = path.join(targetRoot, DEFAULT_DIRECTORIES.SRC);
  const distDir = path.join(targetRoot, DEFAULT_DIRECTORIES.DIST);
  const webDir = path.join(targetRoot, DEFAULT_DIRECTORIES.WEB);
  const templatesDir = path.join(targetRoot, DEFAULT_DIRECTORIES.TEMPLATES);
  const servicesDir = path.join(targetRoot, DEFAULT_DIRECTORIES.SERVICES);
  ensureDir(srcDir);
  ensureDir(distDir);
  ensureDir(webDir);
  ensureDir(templatesDir);
  ensureDir(servicesDir);

  // Files using imported templates
  writeFileIfMissing(path.join(targetRoot, DEFAULT_FILES.PACKAGE_JSON), packageJsonTemplate(path.basename(targetRoot)));
  writeFileIfMissing(path.join(targetRoot, DEFAULT_FILES.TSCONFIG), tsconfigTemplate);
  writeFileIfMissing(path.join(targetRoot, DEFAULT_FILES.APP_YAML), appYamlTemplate);
  writeFileIfMissing(path.join(targetRoot, DEFAULT_FILES.CURSOR_RULES), cursorRulesTemplate);
  writeFileIfMissing(path.join(srcDir, DEFAULT_FILES.APP_TS), appTsTemplate);
  writeFileIfMissing(path.join(templatesDir, DEFAULT_FILES.MAIN_VIEW), mainViewTemplate);
  writeFileIfMissing(path.join(templatesDir, DEFAULT_FILES.ERROR_TEMPLATE), errorTemplate);
  writeFileIfMissing(path.join(webDir, DEFAULT_FILES.FRONTEND_SCRIPT), frontendScriptTemplate);
  writeFileIfMissing(path.join(webDir, DEFAULT_FILES.TRANSLATIONS), translationsTemplate);

  // Run npm install
  runCommand('npm install', {
    cwd: targetRoot,
    errorMessage: '[X] Failed to install dependencies:'
  });
}