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
  json: 'any',
  array: 'any[]',
  object: 'any',
  enum: 'string'
} as const;

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Parsed representation of a compound YAML field type.
 * Supports array syntax ("Foo[]") and union syntax ("Foo | Bar").
 */
export interface ParsedFieldType {
  /** Individual base type names without modifiers. */
  baseTypes: string[];
  /** True when the type ends with "[]" (array of values). */
  isArray: boolean;
  /** True when the type contains "|" (union of types). */
  isUnion: boolean;
}

/**
 * Parse a YAML field type string into its structural components.
 * Handles simple types ("Money"), array types ("Money[]"), union types ("Foo | Bar"),
 * and array-of-union types ("(Foo | Bar)[]").
 */
export function parseFieldType(typeStr: string): ParsedFieldType {
  const trimmed = typeStr.trim();

  // Array of union: "(Foo | Bar)[]"
  if (trimmed.startsWith('(') && trimmed.endsWith(')[]')) {
    const inner = trimmed.slice(1, -3).trim();
    const parts = inner.split('|').map(p => p.trim()).filter(Boolean);
    return { baseTypes: parts, isArray: true, isUnion: true };
  }

  if (trimmed.endsWith('[]')) {
    const base = trimmed.slice(0, -2).trim();
    return { baseTypes: [base], isArray: true, isUnion: false };
  }

  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map(p => p.trim()).filter(Boolean);
    return { baseTypes: parts, isArray: false, isUnion: true };
  }

  return { baseTypes: [trimmed], isArray: false, isUnion: false };
}

/**
 * Returns true when any base type in the (possibly compound) type expression is a known value object.
 */
export function isValueObjectFieldType(
  typeStr: string,
  valueObjects: Set<string> | Map<string, unknown>
): boolean {
  const { baseTypes } = parseFieldType(typeStr);
  return baseTypes.some(bt => {
    const cap = capitalize(bt);
    return valueObjects instanceof Set ? valueObjects.has(cap) : valueObjects.has(cap);
  });
}

/**
 * Returns the set of value object names referenced in a (possibly compound) type expression.
 */
export function getReferencedValueObjects(
  typeStr: string,
  valueObjects: Set<string> | Map<string, unknown>
): Set<string> {
  const { baseTypes } = parseFieldType(typeStr);
  const result = new Set<string>();
  for (const bt of baseTypes) {
    const cap = capitalize(bt);
    const has = valueObjects instanceof Set ? valueObjects.has(cap) : valueObjects.has(cap);
    if (has) result.add(cap);
  }
  return result;
}

/**
 * Map a YAML field type to TypeScript type, resolving aggregates and value objects by name.
 * Supports compound types: "Foo[]" -> "Foo[]", "Foo | Bar" -> "Foo | Bar".
 */
export function mapType(
  yamlType: string,
  aggregates?: Set<string> | Map<string, unknown>,
  valueObjects?: Set<string> | Map<string, unknown>
): string {
  // Simple aggregate reference (no compound syntax)
  if (aggregates?.has(yamlType)) return yamlType;

  const parsed = parseFieldType(yamlType);

  // Array of union of value objects: "(Foo | Bar)[]"
  if (parsed.isArray && parsed.isUnion) {
    const resolvedParts = parsed.baseTypes.map(bt => {
      const cap = capitalize(bt);
      if (valueObjects) {
        const has = valueObjects instanceof Set ? valueObjects.has(cap) : valueObjects.has(cap);
        if (has) return cap;
      }
      return (TYPE_MAPPING as Record<string, string>)[bt] ?? 'any';
    });
    return `(${resolvedParts.join(' | ')})[]`;
  }

  // Array of value objects: "Foo[]"
  if (parsed.isArray) {
    const [base] = parsed.baseTypes;
    const capitalizedBase = capitalize(base);
    if (valueObjects) {
      const has = valueObjects instanceof Set ? valueObjects.has(capitalizedBase) : valueObjects.has(capitalizedBase);
      if (has) return `${capitalizedBase}[]`;
    }
    // Fall back: treat as plain mapped type array
    return `${(TYPE_MAPPING as Record<string, string>)[base] ?? 'any'}[]`;
  }

  // Union of value objects: "Foo | Bar"
  if (parsed.isUnion) {
    const resolvedParts = parsed.baseTypes.map(bt => {
      const cap = capitalize(bt);
      if (valueObjects) {
        const has = valueObjects instanceof Set ? valueObjects.has(cap) : valueObjects.has(cap);
        if (has) return cap;
      }
      return (TYPE_MAPPING as Record<string, string>)[bt] ?? 'any';
    });
    return resolvedParts.join(' | ');
  }

  // Simple type
  const capitalizedType = capitalize(yamlType);
  if (valueObjects) {
    const has = valueObjects instanceof Set ? valueObjects.has(capitalizedType) : valueObjects.has(capitalizedType);
    if (has) return capitalizedType;
  }
  return (TYPE_MAPPING as Record<string, string>)[yamlType] ?? 'any';
}

/**
 * Check if a YAML field type references another aggregate entity.
 */
export function isAggregateReference(
  yamlType: string,
  aggregates?: Set<string> | Map<string, unknown>
): boolean {
  return !!aggregates?.has(yamlType);
}

/**
 * Map a YAML type to the store row TypeScript type.
 * Value objects (including compound types) become "string" (stored as JSON).
 */
export function mapRowType(
  yamlType: string,
  valueObjects?: Set<string> | Map<string, unknown>
): string {
  if (valueObjects) {
    // Any compound type containing a VO name is stored as JSON string
    if (isValueObjectFieldType(yamlType, valueObjects)) return 'string';
  }
  return (ROW_TYPE_MAPPING as Record<string, string>)[yamlType] ?? 'string';
}
