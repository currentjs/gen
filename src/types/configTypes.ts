/**
 * Type definitions for the Clean Architecture module configuration
 */

// ============= IDENTIFIER TYPES =============

export type IdentifierType = 'numeric' | 'uuid' | 'nanoid';

export function normalizeIdentifierType(value: string): IdentifierType {
  const lower = value.toLowerCase();
  if (lower === 'id' || lower === 'numeric') return 'numeric';
  if (lower === 'uuid') return 'uuid';
  if (lower === 'nanoid') return 'nanoid';
  throw new Error(`Unknown identifier type: "${value}". Expected: numeric, uuid, or nanoid`);
}

export function idTsType(identifiers: IdentifierType): 'number' | 'string' {
  return identifiers === 'numeric' ? 'number' : 'string';
}

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
  constraints?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
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

/** Additional input field definition (type only; used in add) */
export interface UseCaseInputAddField {
  type: string;
  source?: string;
}

export interface UseCaseInputConfig {
  from?: string;
  pick?: string[];
  omit?: string[];
  add?: Record<string, UseCaseInputAddField>;
  validate?: Record<string, unknown>;
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
  layout?: string;
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

export interface ModuleConfig {
  domain: DomainConfig;
  useCases: UseCasesConfig;
  api?: ApiConfig;
  web?: WebConfig;
}

// Type guard to validate module config (domain + useCases)
export function isValidModuleConfig(config: any): config is ModuleConfig {
  return config && typeof config === 'object' && 'domain' in config && 'useCases' in config;
}

