export const validationTemplates = {
  inputInterface: `export interface {{INTERFACE_NAME}} {
{{INTERFACE_FIELDS}}
}`,

  validationFunction: `export function {{FUNCTION_NAME}}(data: any): boolean {
  const errors: string[] = [];
  
{{VALIDATION_LOGIC}}
  
  if (errors.length > 0) {
    throw new Error(\`Validation failed: \${errors.join(', ')}\`);
  }
  
  return true;
}`,

  requiredStringValidation: `  if (!data.{{FIELD_NAME}} || typeof data.{{FIELD_NAME}} !== 'string') {
    errors.push('{{FIELD_NAME}} is required and must be a string');
  }`,

  optionalStringValidation: `  if (data.{{FIELD_NAME}} !== undefined && typeof data.{{FIELD_NAME}} !== 'string') {
    errors.push('{{FIELD_NAME}} must be a string');
  }`,

  requiredNumberValidation: `  if (data.{{FIELD_NAME}} === undefined || data.{{FIELD_NAME}} === null || typeof data.{{FIELD_NAME}} !== 'number' || isNaN(data.{{FIELD_NAME}})) {
    errors.push('{{FIELD_NAME}} is required and must be a number');
  }`,

  optionalNumberValidation: `  if (data.{{FIELD_NAME}} !== undefined && (typeof data.{{FIELD_NAME}} !== 'number' || isNaN(data.{{FIELD_NAME}}))) {
    errors.push('{{FIELD_NAME}} must be a number');
  }`,

  requiredBooleanValidation: `  if (data.{{FIELD_NAME}} === undefined || data.{{FIELD_NAME}} === null || typeof data.{{FIELD_NAME}} !== 'boolean') {
    errors.push('{{FIELD_NAME}} is required and must be a boolean');
  }`,

  optionalBooleanValidation: `  if (data.{{FIELD_NAME}} !== undefined && typeof data.{{FIELD_NAME}} !== 'boolean') {
    errors.push('{{FIELD_NAME}} must be a boolean');
  }`,

  requiredDateValidation: `  if (!data.{{FIELD_NAME}} || !(data.{{FIELD_NAME}} instanceof Date) && isNaN(Date.parse(data.{{FIELD_NAME}}))) {
    errors.push('{{FIELD_NAME}} is required and must be a valid date');
  }`,

  optionalDateValidation: `  if (data.{{FIELD_NAME}} !== undefined && !(data.{{FIELD_NAME}} instanceof Date) && isNaN(Date.parse(data.{{FIELD_NAME}}))) {
    errors.push('{{FIELD_NAME}} must be a valid date');
  }`,

  // For complex types, just pass through for now
  requiredComplexValidation: `  if (data.{{FIELD_NAME}} === undefined || data.{{FIELD_NAME}} === null) {
    errors.push('{{FIELD_NAME}} is required');
  }`,

  optionalComplexValidation: `  // {{FIELD_NAME}} - complex type validation to be implemented later`,

  validationFileTemplate: `// Generated validation for {{ENTITY_NAME}}

{{DTO_INTERFACES}}

{{VALIDATION_FUNCTIONS}}
`,

  dtoInterface: `export interface {{DTO_NAME}} {
{{DTO_FIELDS}}
}`
};

export const typeMapping = {
  string: 'string',
  number: 'number', 
  boolean: 'boolean',
  datetime: 'Date',
  json: 'any',
  object: 'any',
  array: 'any[]'
};