// Common constants used across the generator

// File extensions
export const FILE_EXTENSIONS = {
  YAML: '.yaml',
  TYPESCRIPT: '.ts', 
  JAVASCRIPT: '.js',
  JSON: '.json'
} as const;

// Common file names
export const COMMON_FILES = {
  APP_YAML: 'app.yaml',
  APP_TS: 'app.ts',
  REGISTRY_JSON: 'registry.json',
  STORE_INTERFACE: 'StoreInterface.ts'
} as const;

// Generator markers
export const GENERATOR_MARKERS = {
  CONTROLLERS_START: '// currentjs:controllers:start',
  CONTROLLERS_END: '// currentjs:controllers:end'
} as const;

// Path patterns
export const PATH_PATTERNS = {
  MODULES_PREFIX: 'modules/',
  MODULES_RELATIVE: './modules/',
  MODULES_DIRECTIVE: '@modules/',
  SRC_MODULES: 'src/modules/',
  INFRASTRUCTURE: 'infrastructure',
  APPLICATION: 'application',
  DOMAIN: 'domain',
  ENTITIES: 'entities',
  STORES: 'stores',
  SERVICES: 'services',
  CONTROLLERS: 'controllers'
} as const;

// Default values
export const DEFAULTS = {
  SERVER_PORT: 3000,
  SERVER_HOST: 'localhost',
  PAGINATION_LIMIT: 10,
  PAGINATION_PAGE: 1
} as const;

// Module structure paths
export const MODULE_STRUCTURE = {
  DOMAIN_ENTITIES: 'domain/entities',
  APPLICATION_SERVICES: 'application/services',
  INFRASTRUCTURE_STORES: 'infrastructure/stores',
  INFRASTRUCTURE_CONTROLLERS: 'infrastructure/controllers'
} as const;

// Server URLs and messages
export const SERVER = {
  BASE_URL: `http://${DEFAULTS.SERVER_HOST}:${DEFAULTS.SERVER_PORT}`,
  START_MESSAGE: `Server started on http://${DEFAULTS.SERVER_HOST}:${DEFAULTS.SERVER_PORT}`
} as const;

// Generator suffixes
export const GENERATOR_SUFFIXES = {
  STORE: 'Store',
  SERVICE: 'Service', 
  CONTROLLER: 'Controller',
  API_CONTROLLER: 'ApiController',
  WEB_CONTROLLER: 'WebController'
} as const;
