/**
 * Type definitions for the new Clean Architecture module configuration
 */

// ============= DOMAIN LAYER =============

export interface FieldDefinition {
  type: string;
  constraints?: {
    min?: number;
    max?: number;
    pattern?: string;
    unique?: boolean;
  };
}

export interface ValueObjectConfig {
  fields: Record<string, FieldDefinition | { type: string; values: string[] }>;
}

export interface AggregateFieldConfig {
  type: string;
  required?: boolean;
  unique?: boolean;
  auto?: boolean;
  values?: string[];
}

export interface AggregateConfig {
  root?: boolean;
  fields: Record<string, AggregateFieldConfig>;
  entities?: string[];
}

export interface DomainConfig {
  aggregates: Record<string, AggregateConfig>;
  valueObjects?: Record<string, ValueObjectConfig>;
}

// ============= USE CASE LAYER =============

export interface PaginationConfig {
  type: 'cursor' | 'offset';
  defaults?: {
    limit?: number;
    maxLimit?: number;
  };
}

export interface FilterFieldConfig {
  type: string;
  enum?: string[];
  optional?: boolean;
  searchIn?: string[];
}

export interface SortingConfig {
  allow: string[];
  default?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

export interface UseCaseInputConfig {
  from?: string;
  pick?: string[];
  omit?: string[];
  add?: Record<string, any>;
  validate?: Record<string, any>;
  identifier?: string;
  partial?: boolean;
  pagination?: PaginationConfig;
  filters?: Record<string, FilterFieldConfig>;
  sorting?: SortingConfig;
  parentId?: string;
}

export interface UseCaseOutputInclude {
  from: string;
  pick?: string[];
}

export interface UseCaseOutputConfig {
  from?: string;
  pick?: string[];
  include?: Record<string, UseCaseOutputInclude>;
  add?: Record<string, { type: string; source?: string }>;
  pagination?: boolean;
}

export interface UseCaseDefinition {
  input?: UseCaseInputConfig;
  output?: UseCaseOutputConfig | 'void';
  handlers: string[];
  withChild?: boolean;
}

export interface UseCasesConfig {
  [modelName: string]: {
    [actionName: string]: UseCaseDefinition;
  };
}

// ============= ACCESS CONTROL =============

/**
 * Auth configuration for endpoints.
 * Can be:
 * - 'all': Public access (no authentication required)
 * - 'authenticated': Any logged-in user
 * - 'owner': User must own the resource (checks owner_id field)
 * - string (e.g., 'admin', 'editor'): User must have this role
 * - string[] (e.g., ['owner', 'admin']): User must match ANY of these (OR logic)
 */
export type AuthConfig = 'all' | 'authenticated' | 'owner' | string | string[];

// ============= ADAPTER LAYER - API =============

export interface ApiEndpointConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  useCase: string;
  auth?: AuthConfig;
}

export interface ApiResourceConfig {
  prefix: string;
  endpoints: ApiEndpointConfig[];
}

export type ApiConfig = Record<string, ApiResourceConfig>;

// ============= ADAPTER LAYER - WEB =============

export interface WebPageConfig {
  path: string;
  method?: 'GET' | 'POST';
  useCase?: string;
  view?: string;
  auth?: AuthConfig;
  onSuccess?: {
    redirect?: string;
    toast?: string;
    back?: boolean;
    stay?: boolean;
  };
  onError?: {
    stay?: boolean;
    toast?: string | 'error';
  };
}

export interface WebResourceConfig {
  prefix: string;
  layout?: string;
  pages: WebPageConfig[];
}

export type WebConfig = Record<string, WebResourceConfig>;

// ============= MODULE CONFIG =============

export interface NewModuleConfig {
  domain: DomainConfig;
  useCases: UseCasesConfig;
  api?: ApiConfig;
  web?: WebConfig;
}

// ============= LEGACY SUPPORT (for backwards compatibility during transition) =============

export interface LegacyFieldConfig {
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  auto?: boolean;
  displayFields?: string[];
}

export interface LegacyModelConfig {
  name: string;
  fields: LegacyFieldConfig[];
}

export interface LegacyActionConfig {
  handlers: string[];
}

export interface LegacyModuleConfig {
  models?: LegacyModelConfig[];
  api?: any;
  routes?: any;
  actions?: Record<string, LegacyActionConfig>;
  permissions?: any[];
}

// Type guard to check if config is new format
export function isNewModuleConfig(config: any): config is NewModuleConfig {
  return config && typeof config === 'object' && 'domain' in config && 'useCases' in config;
}

