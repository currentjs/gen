/**
 * Shared type mapping and string utilities used across generators.
 */

export interface TypeMapping {
  [key: string]: string;
}

/** Standard YAML type to TypeScript (domain) type mapping. */
export const TYPE_MAPPING: Record<string, string> = {
  string: 'string',
  number: 'number',
  integer: 'number',
  decimal: 'number',
  boolean: 'boolean',
  datetime: 'Date',
  date: 'Date',
  id: 'number',
  json: 'any',
  array: 'any[]',
  object: 'object',
  enum: 'string'
} as const;

/** Store-specific: YAML type to DB row TypeScript type (e.g. datetime -> string). */
export const ROW_TYPE_MAPPING: Record<string, string> = {
  string: 'string',
  number: 'number',
  integer: 'number',
  decimal: 'number',
  boolean: 'boolean',
  datetime: 'string',
  date: 'string',
  id: 'number',
  json: 'string',
  array: 'string',
  object: 'string',
  enum: 'string'
} as const;

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Map a YAML field type to TypeScript type, resolving aggregates and value objects by name.
 */
export function mapType(
  yamlType: string,
  aggregates?: Set<string> | Map<string, unknown>,
  valueObjects?: Set<string> | Map<string, unknown>
): string {
  if (aggregates?.has(yamlType)) return yamlType;
  const capitalizedType = capitalize(yamlType);
  if (valueObjects) {
    const has = valueObjects instanceof Set ? valueObjects.has(capitalizedType) : valueObjects.has(capitalizedType);
    if (has) return capitalizedType;
  }
  return (TYPE_MAPPING as Record<string, string>)[yamlType] ?? 'any';
}

/**
 * Map a YAML type to the store row TypeScript type (value objects become string).
 */
export function mapRowType(
  yamlType: string,
  valueObjects?: Set<string> | Map<string, unknown>
): string {
  if (valueObjects) {
    const capitalizedType = capitalize(yamlType);
    const has = valueObjects instanceof Set ? valueObjects.has(capitalizedType) : valueObjects.has(capitalizedType);
    if (has) return 'string';
  }
  return (ROW_TYPE_MAPPING as Record<string, string>)[yamlType] ?? 'string';
}
