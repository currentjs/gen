import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { colors } from '../utils/colors';
import { createRl, promptText, promptNumber, promptYesNo, promptSelect, promptMultiSelect } from '../utils/promptUtils';
import { handleGenerateAll } from './generateAll';

// ─── Types used within the wizard ───────────────────────────────────────────

interface CollectedField {
  name: string;
  type: string;         // resolved YAML type or value object name
  required: boolean;
  unique: boolean;
  enumValues?: string[];
  valueObjectName?: string; // set when type is a value object
}

interface CollectedChild {
  name: string;
  fields: CollectedField[];
}

interface CollectedValueObjectField {
  name: string;
  type: string;
  enumValues?: string[];
  constraints?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

interface CollectedValueObject {
  name: string;
  fields: CollectedValueObjectField[];
}

interface ListUseCaseOptions {
  pagination: boolean;
  paginationType: 'offset' | 'cursor';
  perPage: number;
  filterFields: string[];
  sortFields: string[];
  defaultSortField: string;
  defaultSortOrder: 'asc' | 'desc';
  outputMode: 'all' | 'pick' | 'omit';
  outputFields: string[];
}

interface CreateUseCaseOptions {
  inputMode: 'all' | 'pick' | 'omit';
  inputFields: string[];
  addFields: Array<{ name: string; type: string; required: boolean }>;
  validateFields: Record<string, { pattern?: string; min?: number; max?: number }>;
}

interface UpdateUseCaseOptions extends CreateUseCaseOptions {
  partial: boolean;
}

// ─── Supported field types ───────────────────────────────────────────────────

const PRIMITIVE_TYPES = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'integer', value: 'integer' },
  { label: 'decimal', value: 'decimal' },
  { label: 'boolean', value: 'boolean' },
  { label: 'datetime', value: 'datetime' },
  { label: 'date', value: 'date' },
  { label: 'id  (foreign-key / reference)', value: 'id' },
  { label: 'json', value: 'json' },
  { label: 'enum  (choose values)', value: 'enum' },
  { label: 'Custom value object', value: '__valueObject__' },
];

const PRIMITIVE_TYPES_NO_VO = PRIMITIVE_TYPES.filter(t => t.value !== '__valueObject__');

const NUMERIC_TYPES = new Set(['number', 'integer', 'decimal']);

// ─── Auth options ─────────────────────────────────────────────────────────────

const AUTH_OPTIONS = [
  { label: 'all  (public)', value: 'all' },
  { label: 'authenticated  (any logged-in user)', value: 'authenticated' },
  { label: 'owner  (resource owner)', value: 'owner' },
  { label: 'admin', value: 'admin' },
  { label: 'Custom roles (enter manually)', value: '__custom__' },
];

// ─── Helper: resolve module YAML path ────────────────────────────────────────

function findModuleYaml(moduleName: string): string {
  const lower = moduleName.toLowerCase();
  const candidates = [
    path.resolve(process.cwd(), 'src', 'modules', moduleName, `${lower}.yaml`),
    path.resolve(process.cwd(), 'src', 'modules', lower, `${lower}.yaml`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `Module "${moduleName}" not found. Did you run ${colors.bold(colors.green(`current create module ${moduleName}`))} first?`
  );
}

// ─── Helper: check if module already has an aggregate root ───────────────────

function hasAggregateRoot(moduleConfig: any): boolean {
  const aggregates = moduleConfig?.domain?.aggregates;
  if (!aggregates || typeof aggregates !== 'object') return false;
  return Object.values(aggregates).some((agg: any) => agg?.root === true);
}

// ─── Phase 1: Collect fields ─────────────────────────────────────────────────

async function promptValueObjectFields(rl: any, voName: string): Promise<CollectedValueObjectField[]> {
  const fields: CollectedValueObjectField[] = [];
  console.log(colors.cyan(`\n  Defining value object ${colors.bold(voName)} fields:`));

  while (true) {
    const hint = fields.length === 0 ? 'Field name:' : 'Field name (leave blank to finish):';
    const name = await promptText(rl, `    ${hint}`, { allowEmpty: fields.length > 0 });
    if (name === '') break;

    const typeChoice = await promptSelect(rl, `    Field type for ${colors.bold(name)}:`, PRIMITIVE_TYPES_NO_VO);
    let enumValues: string[] | undefined;
    let constraints: CollectedValueObjectField['constraints'] = {};

    if (typeChoice.value === 'enum') {
      const raw = await promptText(rl, `    Enum values (comma-separated):`);
      enumValues = raw.split(',').map(s => s.trim()).filter(Boolean);
    } else if (NUMERIC_TYPES.has(typeChoice.value)) {
      const min = await promptNumber(rl, `    Min value:`);
      const max = await promptNumber(rl, `    Max value:`);
      if (min !== undefined) constraints.min = min;
      if (max !== undefined) constraints.max = max;
    } else if (typeChoice.value === 'string') {
      const pat = await promptText(rl, `    Pattern (regex, leave blank to skip):`, { allowEmpty: true });
      if (pat) constraints.pattern = pat;
    }

    const field: CollectedValueObjectField = {
      name,
      type: typeChoice.value,
      ...(enumValues ? { enumValues } : {}),
      ...(Object.keys(constraints).length > 0 ? { constraints } : {}),
    };
    fields.push(field);
  }

  return fields;
}

async function promptFields(rl: any, existingValueObjects: Map<string, CollectedValueObject>): Promise<{ fields: CollectedField[]; valueObjects: Map<string, CollectedValueObject> }> {
  const fields: CollectedField[] = [];
  const valueObjects = new Map(existingValueObjects);

  while (true) {
    const isFirst = fields.length === 0;
    const hint = isFirst ? 'Field name:' : 'Field name (leave blank to finish):';
    console.log('');
    const name = await promptText(rl, hint, { allowEmpty: !isFirst });
    if (name === '') break;

    // Build type list including any already-defined value objects
    const voOptions = [...valueObjects.keys()].map(n => ({ label: `${n}  (value object, already defined)`, value: n }));
    const typeChoices = [...PRIMITIVE_TYPES.slice(0, -1), ...voOptions, PRIMITIVE_TYPES[PRIMITIVE_TYPES.length - 1]];

    const typeChoice = await promptSelect(rl, `Field type for ${colors.bold(name)}:`, typeChoices);

    let enumValues: string[] | undefined;
    let valueObjectName: string | undefined;
    let resolvedType = typeChoice.value;

    if (typeChoice.value === 'enum') {
      const raw = await promptText(rl, `Enum values (comma-separated):`);
      enumValues = raw.split(',').map(s => s.trim()).filter(Boolean);
    } else if (typeChoice.value === '__valueObject__') {
      const voName = await promptText(rl, `Value object name (e.g. Money, Address):`);
      const capitalizedVoName = voName.charAt(0).toUpperCase() + voName.slice(1);

      if (!valueObjects.has(capitalizedVoName)) {
        const voFields = await promptValueObjectFields(rl, capitalizedVoName);
        valueObjects.set(capitalizedVoName, { name: capitalizedVoName, fields: voFields });
      } else {
        console.log(colors.gray(`  Using existing value object ${capitalizedVoName}`));
      }

      resolvedType = capitalizedVoName;
      valueObjectName = capitalizedVoName;
    } else if (valueObjects.has(typeChoice.value)) {
      // User selected an already-defined value object
      resolvedType = typeChoice.value;
      valueObjectName = typeChoice.value;
    }

    const required = await promptYesNo(rl, `Required?`, true);
    const unique = await promptYesNo(rl, `Unique?`, false);

    fields.push({
      name,
      type: resolvedType,
      required,
      unique,
      ...(enumValues ? { enumValues } : {}),
      ...(valueObjectName ? { valueObjectName } : {}),
    });
  }

  return { fields, valueObjects };
}

// ─── Phase 1b: Child entities ────────────────────────────────────────────────

async function promptChildEntities(
  rl: any,
  parentName: string,
  existingValueObjects: Map<string, CollectedValueObject>,
): Promise<{ children: CollectedChild[]; valueObjects: Map<string, CollectedValueObject> }> {
  const children: CollectedChild[] = [];
  let currentValueObjects = new Map(existingValueObjects);

  const wantChildren = await promptYesNo(rl, `Add child entities to ${colors.bold(parentName)}?`, false);
  if (!wantChildren) return { children, valueObjects: currentValueObjects };

  while (true) {
    const rawName = await promptText(rl, `Child entity name:`);
    const childName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    console.log(colors.gray(`\n  Defining fields for ${colors.bold(childName)}:`));
    const { fields, valueObjects: updatedVOs } = await promptFields(rl, currentValueObjects);
    currentValueObjects = updatedVOs;

    children.push({ name: childName, fields });

    const another = await promptYesNo(rl, `Add another child entity?`, false);
    if (!another) break;
  }

  return { children, valueObjects: currentValueObjects };
}

// ─── Phase 2: Use cases ───────────────────────────────────────────────────────

async function promptListUseCase(rl: any, fieldNames: string[]): Promise<ListUseCaseOptions> {
  console.log(colors.bold(colors.cyan('\n  Configuring LIST use case:')));

  const pagination = await promptYesNo(rl, `  Use pagination?`, true);
  let paginationType: 'offset' | 'cursor' = 'offset';
  let perPage = 20;

  if (pagination) {
    const ptChoice = await promptSelect(rl, `  Pagination type:`, [
      { label: 'offset  (page + limit)', value: 'offset' },
      { label: 'cursor  (cursor-based)', value: 'cursor' },
    ]);
    paginationType = ptChoice.value as 'offset' | 'cursor';
    const pp = await promptNumber(rl, `  Items per page:`, 20);
    perPage = pp ?? 20;
  }

  const filterChoices = fieldNames.map(f => ({ label: f, value: f }));
  const filterSelected = await promptMultiSelect(rl, `  Filter by which fields? (select fields for filtering)`, filterChoices, { allowNone: true, defaultAll: false });
  const filterFields = filterSelected.map(f => f.value);

  const sortChoices = fieldNames.map(f => ({ label: f, value: f }));
  const sortSelected = await promptMultiSelect(rl, `  Sort by which fields?`, sortChoices, { allowNone: true, defaultAll: false });
  const sortFields = sortSelected.map(f => f.value);

  let defaultSortField = sortFields[0] ?? fieldNames[0] ?? 'id';
  let defaultSortOrder: 'asc' | 'desc' = 'asc';

  if (sortFields.length > 0) {
    const dsfChoices = sortFields.map(f => ({ label: f, value: f }));
    const dsf = await promptSelect(rl, `  Default sort field:`, dsfChoices);
    defaultSortField = dsf.value;

    const dsoChoice = await promptSelect(rl, `  Default sort order:`, [
      { label: 'asc', value: 'asc' },
      { label: 'desc', value: 'desc' },
    ]);
    defaultSortOrder = dsoChoice.value as 'asc' | 'desc';
  }

  const outputModeChoice = await promptSelect(rl, `  Output fields:`, [
    { label: 'all fields', value: 'all' },
    { label: 'pick  (select which to include)', value: 'pick' },
    { label: 'omit  (select which to exclude)', value: 'omit' },
  ]);
  const outputMode = outputModeChoice.value as 'all' | 'pick' | 'omit';
  let outputFields: string[] = [];

  if (outputMode !== 'all') {
    const ofChoices = fieldNames.map(f => ({ label: f, value: f }));
    const label = outputMode === 'pick' ? 'fields to include' : 'fields to exclude';
    const selected = await promptMultiSelect(rl, `  Select ${label}:`, ofChoices, { allowNone: false, defaultAll: false });
    outputFields = selected.map(f => f.value);
  }

  return { pagination, paginationType, perPage, filterFields, sortFields, defaultSortField, defaultSortOrder, outputMode, outputFields };
}

async function promptCreateUseCase(rl: any, fieldNames: string[], useCaseName: string): Promise<CreateUseCaseOptions> {
  console.log(colors.bold(colors.cyan(`\n  Configuring ${useCaseName.toUpperCase()} use case:`)));

  const inputModeChoice = await promptSelect(rl, `  Input fields:`, [
    { label: 'all fields', value: 'all' },
    { label: 'pick  (select which to include)', value: 'pick' },
    { label: 'omit  (select which to exclude)', value: 'omit' },
  ]);
  const inputMode = inputModeChoice.value as 'all' | 'pick' | 'omit';
  let inputFields: string[] = [];

  if (inputMode !== 'all' && fieldNames.length > 0) {
    const label = inputMode === 'pick' ? 'fields to include' : 'fields to exclude';
    const choices = fieldNames.map(f => ({ label: f, value: f }));
    const selected = await promptMultiSelect(rl, `  Select ${label}:`, choices, { allowNone: false, defaultAll: false });
    inputFields = selected.map(f => f.value);
  }

  const addFields: Array<{ name: string; type: string; required: boolean }> = [];
  const hasAdd = await promptYesNo(rl, `  Add extra input fields not on the model?`, false);
  if (hasAdd) {
    while (true) {
      const fn = await promptText(rl, `  Extra field name (leave blank to finish):`, { allowEmpty: true });
      if (fn === '') break;
      const ftChoice = await promptSelect(rl, `  Field type for ${colors.bold(fn)}:`, PRIMITIVE_TYPES_NO_VO);
      const freq = await promptYesNo(rl, `  Required?`, false);
      addFields.push({ name: fn, type: ftChoice.value, required: freq });
    }
  }

  // Fields eligible for validation: the picked/non-omitted set, or all if mode is 'all'
  const fieldsForValidation = inputMode === 'all'
    ? fieldNames
    : inputMode === 'pick'
      ? inputFields
      : fieldNames.filter(f => !inputFields.includes(f));

  const validateFields: Record<string, { pattern?: string; min?: number; max?: number }> = {};
  const hasValidate = fieldsForValidation.length > 0 && await promptYesNo(rl, `  Add validation rules?`, false);
  if (hasValidate) {
    for (const fn of fieldsForValidation) {
      const doValidate = await promptYesNo(rl, `  Validate field "${fn}"?`, false);
      if (!doValidate) continue;
      const rule: { pattern?: string; min?: number; max?: number } = {};
      const pat = await promptText(rl, `    Pattern (regex, leave blank to skip):`, { allowEmpty: true });
      if (pat) rule.pattern = pat;
      const minV = await promptNumber(rl, `    Min value:`);
      if (minV !== undefined) rule.min = minV;
      const maxV = await promptNumber(rl, `    Max value:`);
      if (maxV !== undefined) rule.max = maxV;
      if (Object.keys(rule).length > 0) validateFields[fn] = rule;
    }
  }

  return { inputMode, inputFields, addFields, validateFields };
}

async function promptUpdateUseCase(rl: any, fieldNames: string[]): Promise<UpdateUseCaseOptions> {
  const base = await promptCreateUseCase(rl, fieldNames, 'update');
  const partial = await promptYesNo(rl, `  Partial update (all fields optional)?`, true);
  return { ...base, partial };
}

// ─── Phase 3/4: Auth per route ───────────────────────────────────────────────

async function promptAuth(rl: any, label: string): Promise<string | string[]> {
  const choice = await promptSelect(rl, `  Auth for ${colors.bold(label)}:`, AUTH_OPTIONS);
  if (choice.value === '__custom__') {
    const raw = await promptText(rl, `  Enter roles (comma-separated):`);
    const roles = raw.split(',').map(s => s.trim()).filter(Boolean);
    return roles.length === 1 ? roles[0] : roles;
  }
  return choice.value;
}

// ─── Build YAML fragments ─────────────────────────────────────────────────────

function buildAggregateConfig(
  modelName: string,
  fields: CollectedField[],
  isRoot: boolean,
  entityNames?: string[],
): any {
  const aggregateFields: Record<string, any> = {};

  for (const f of fields) {
    const fieldDef: any = { type: f.type, required: f.required };
    if (f.unique) fieldDef.unique = true;
    if (f.enumValues) fieldDef.values = f.enumValues;
    aggregateFields[f.name] = fieldDef;
  }

  const config: any = { fields: aggregateFields };
  if (isRoot) config.root = true;
  if (entityNames && entityNames.length > 0) config.entities = entityNames;

  return config;
}

function buildValueObjectsConfig(valueObjects: Map<string, CollectedValueObject>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [name, vo] of valueObjects) {
    const voFields: Record<string, any> = {};
    for (const f of vo.fields) {
      const fieldDef: any = {};
      if (f.type === 'enum' && f.enumValues) {
        fieldDef.type = 'enum';
        fieldDef.values = f.enumValues;
      } else {
        fieldDef.type = f.type;
      }
      if (f.constraints && Object.keys(f.constraints).length > 0) {
        fieldDef.constraints = f.constraints;
      }
      voFields[f.name] = fieldDef;
    }
    result[name] = { fields: voFields };
  }

  return result;
}

function buildListUseCaseConfig(modelName: string, opts: ListUseCaseOptions): any {
  const input: any = {};
  if (opts.pagination) {
    input.pagination = {
      type: opts.paginationType,
      defaults: { limit: opts.perPage, maxLimit: Math.max(opts.perPage * 5, 100) },
    };
  }

  if (opts.filterFields.length > 0) {
    const filters: Record<string, any> = {};
    for (const f of opts.filterFields) {
      filters[f] = { type: 'string', optional: true };
    }
    input.filters = filters;
  }

  if (opts.sortFields.length > 0) {
    input.sorting = {
      allow: opts.sortFields,
      default: { field: opts.defaultSortField, order: opts.defaultSortOrder },
    };
  }

  const output: any = { from: modelName, pagination: opts.pagination };
  if (opts.outputMode === 'pick' && opts.outputFields.length > 0) {
    output.pick = ['id', ...opts.outputFields.filter(f => f !== 'id')];
  } else if (opts.outputMode === 'omit' && opts.outputFields.length > 0) {
    output.omit = opts.outputFields;
  }

  return { input, output, handlers: ['default:list'] };
}

function buildCreateUseCaseConfig(modelName: string, opts: CreateUseCaseOptions): any {
  const input: any = { from: modelName };

  if (opts.inputMode === 'pick' && opts.inputFields.length > 0) {
    input.pick = opts.inputFields;
  } else if (opts.inputMode === 'omit' && opts.inputFields.length > 0) {
    input.omit = opts.inputFields;
  }

  if (opts.addFields.length > 0) {
    input.add = {};
    for (const af of opts.addFields) {
      input.add[af.name] = { type: af.type, required: af.required };
    }
  }

  if (Object.keys(opts.validateFields).length > 0) {
    input.validate = opts.validateFields;
  }

  return { input, output: { from: modelName }, handlers: ['default:create'] };
}

function buildUpdateUseCaseConfig(modelName: string, opts: UpdateUseCaseOptions): any {
  const base = buildCreateUseCaseConfig(modelName, opts);
  base.input.identifier = 'id';
  if (opts.partial) base.input.partial = true;
  base.handlers = ['default:update'];
  return base;
}

function buildWebConfig(modelName: string, lower: string, useCases: string[], authMap: Record<string, string | string[]>): any {
  const pages: any[] = [];

  if (useCases.includes('list')) {
    pages.push({ path: '/', useCase: `${modelName}:list`, view: `${lower}List`, auth: authMap['list'] ?? 'all' });
  }
  if (useCases.includes('get')) {
    pages.push({ path: '/:id', useCase: `${modelName}:get`, view: `${lower}Detail`, auth: authMap['get'] ?? 'all' });
  }
  if (useCases.includes('create')) {
    pages.push({ path: '/create', method: 'GET', view: `${lower}Create`, auth: authMap['create'] ?? 'authenticated' });
    pages.push({
      path: '/create',
      method: 'POST',
      useCase: `${modelName}:create`,
      auth: authMap['create'] ?? 'authenticated',
      onSuccess: { redirect: `/${lower}/:id`, toast: `${modelName} created successfully` },
      onError: { stay: true, toast: 'error' },
    });
  }
  if (useCases.includes('update')) {
    pages.push({
      path: '/:id/edit',
      method: 'GET',
      useCase: `${modelName}:get`,
      view: `${lower}Edit`,
      auth: authMap['update'] ?? ['owner', 'admin'],
    });
    pages.push({
      path: '/:id/edit',
      method: 'POST',
      useCase: `${modelName}:update`,
      auth: authMap['update'] ?? ['owner', 'admin'],
      onSuccess: { back: true, toast: `${modelName} updated successfully` },
      onError: { stay: true, toast: 'error' },
    });
  }

  return { prefix: `/${lower}`, layout: 'main_view', pages };
}

function buildApiConfig(modelName: string, lower: string, useCases: string[], authMap: Record<string, string | string[]>): any {
  const endpoints: any[] = [];

  const METHOD_MAP: Record<string, string> = { list: 'GET', get: 'GET', create: 'POST', update: 'PUT', delete: 'DELETE' };
  const PATH_MAP: Record<string, string> = { list: '/', get: '/:id', create: '/', update: '/:id', delete: '/:id' };

  for (const uc of useCases) {
    endpoints.push({
      method: METHOD_MAP[uc],
      path: PATH_MAP[uc],
      useCase: `${modelName}:${uc}`,
      auth: authMap[uc] ?? 'all',
    });
  }

  return { prefix: `/api/${lower}`, endpoints };
}

function buildChildWebConfig(
  childName: string,
  childLower: string,
  parentLower: string,
  parentIdField: string,
  useCases: string[],
  authMap: Record<string, string | string[]>,
): any {
  const pages: any[] = [];

  if (useCases.includes('list')) {
    pages.push({ path: '/', useCase: `${childName}:list`, view: `${childLower}List`, auth: authMap['list'] ?? 'all' });
  }
  if (useCases.includes('get')) {
    pages.push({ path: '/:id', useCase: `${childName}:get`, view: `${childLower}Detail`, auth: authMap['get'] ?? 'all' });
  }
  if (useCases.includes('create')) {
    pages.push({ path: '/create', method: 'GET', view: `${childLower}Create`, auth: authMap['create'] ?? 'authenticated' });
    pages.push({
      path: '/create',
      method: 'POST',
      useCase: `${childName}:create`,
      auth: authMap['create'] ?? 'authenticated',
      onSuccess: { back: true, toast: `${childName} created successfully` },
      onError: { stay: true, toast: 'error' },
    });
  }
  if (useCases.includes('update')) {
    pages.push({
      path: '/:id/edit',
      method: 'GET',
      useCase: `${childName}:get`,
      view: `${childLower}Edit`,
      auth: authMap['update'] ?? ['owner', 'admin'],
    });
    pages.push({
      path: '/:id/edit',
      method: 'POST',
      useCase: `${childName}:update`,
      auth: authMap['update'] ?? ['owner', 'admin'],
      onSuccess: { back: true, toast: `${childName} updated successfully` },
      onError: { stay: true, toast: 'error' },
    });
  }

  return { prefix: `/${parentLower}/:${parentIdField}/${childLower}`, layout: 'main_view', pages };
}

function buildChildApiConfig(
  childName: string,
  childLower: string,
  parentLower: string,
  parentIdField: string,
  useCases: string[],
  authMap: Record<string, string | string[]>,
): any {
  const endpoints: any[] = [];

  const METHOD_MAP: Record<string, string> = { list: 'GET', get: 'GET', create: 'POST', update: 'PUT', delete: 'DELETE' };
  const PATH_MAP: Record<string, string> = { list: '/', get: '/:id', create: '/', update: '/:id', delete: '/:id' };

  for (const uc of useCases) {
    endpoints.push({
      method: METHOD_MAP[uc],
      path: PATH_MAP[uc],
      useCase: `${childName}:${uc}`,
      auth: authMap[uc] ?? 'all',
    });
  }

  return { prefix: `/api/${parentLower}/:${parentIdField}/${childLower}`, endpoints };
}

// ─── Merge into existing YAML config ─────────────────────────────────────────

function deepMerge(target: any, source: any): any {
  if (source === null || source === undefined) return target;
  if (typeof source !== 'object' || Array.isArray(source)) return source;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      key in result &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key]) &&
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ─── Main wizard for a single model ──────────────────────────────────────────

async function runModelWizard(
  rl: any,
  moduleName: string,
  modelName: string,
  moduleYamlPath: string,
): Promise<void> {
  let moduleConfig: any = {};
  if (fs.existsSync(moduleYamlPath)) {
    moduleConfig = parseYaml(fs.readFileSync(moduleYamlPath, 'utf8')) ?? {};
  }

  const isRoot = !hasAggregateRoot(moduleConfig);

  console.log('');
  console.log(colors.bold(colors.brightCyan(`── Model: ${modelName} ──────────────────────────────────────────`)));
  if (isRoot) {
    console.log(colors.gray(`  This will be the aggregate root of the ${moduleName} module.`));
  }

  // Phase 1: Fields
  console.log(colors.bold('\nStep 1: Define fields'));
  const existingValueObjects: Map<string, CollectedValueObject> = new Map();
  const { fields, valueObjects: parentValueObjects } = await promptFields(rl, existingValueObjects);

  if (fields.length === 0) {
    console.log(colors.yellow('No fields defined. Model will be created with no fields.'));
  }

  const fieldNames = fields.map(f => f.name);

  // Phase 2: Child entities
  console.log(colors.bold('\nStep 2: Child entities'));
  const { children, valueObjects } = await promptChildEntities(rl, modelName, parentValueObjects);

  // Phase 3: Use cases
  console.log(colors.bold('\nStep 3: Use cases'));
  const createUseCases = await promptYesNo(rl, `Create default use cases (list, get, create, update, delete)?`, true);

  const collectedUseCases: Record<string, any> = {};
  const useCaseNames: string[] = [];

  if (createUseCases) {
    useCaseNames.push('list', 'get', 'create', 'update', 'delete');

    const listOpts = await promptListUseCase(rl, fieldNames);
    collectedUseCases['list'] = buildListUseCaseConfig(modelName, listOpts);

    collectedUseCases['get'] = {
      input: { identifier: 'id' },
      output: { from: modelName },
      handlers: ['default:get'],
    };

    const createOpts = await promptCreateUseCase(rl, fieldNames, 'create');
    collectedUseCases['create'] = buildCreateUseCaseConfig(modelName, createOpts);

    const updateOpts = await promptUpdateUseCase(rl, fieldNames);
    collectedUseCases['update'] = buildUpdateUseCaseConfig(modelName, updateOpts);

    collectedUseCases['delete'] = {
      input: { identifier: 'id' },
      output: 'void',
      handlers: ['default:delete'],
    };
  }

  // Phase 3b: Child entity use cases / routes
  interface ChildConfig {
    useCases: Record<string, any>;
    web?: any;
    api?: any;
  }
  const childConfigs = new Map<string, ChildConfig>();
  const lower = modelName.charAt(0).toLowerCase() + modelName.slice(1);

  if (createUseCases && children.length > 0) {
    for (const child of children) {
      const childLower = child.name.charAt(0).toLowerCase() + child.name.slice(1);
      const parentIdField = `${lower}Id`;
      const childFieldNames = child.fields.map(f => f.name);

      console.log(colors.bold(colors.brightCyan(`\n  ── Child: ${child.name} ──────────────────────────────────────────`)));
      const createChildUCs = await promptYesNo(rl, `  Create CRUD use cases for ${colors.bold(child.name)}?`, true);

      if (!createChildUCs) continue;

      const childUCNames = ['list', 'get', 'create', 'update', 'delete'];
      const childUseCases: Record<string, any> = {};

      const childListOpts = await promptListUseCase(rl, childFieldNames);
      const childListConfig = buildListUseCaseConfig(child.name, childListOpts);
      childListConfig.input = { parentId: parentIdField, ...childListConfig.input };
      childUseCases['list'] = childListConfig;

      childUseCases['get'] = {
        input: { identifier: 'id', parentId: parentIdField },
        output: { from: child.name },
        handlers: ['default:get'],
      };

      const childCreateOpts = await promptCreateUseCase(rl, childFieldNames, 'create');
      const childCreateConfig = buildCreateUseCaseConfig(child.name, childCreateOpts);
      childCreateConfig.input = { parentId: parentIdField, ...childCreateConfig.input };
      childUseCases['create'] = childCreateConfig;

      const childUpdateOpts = await promptUpdateUseCase(rl, childFieldNames);
      const childUpdateConfig = buildUpdateUseCaseConfig(child.name, childUpdateOpts);
      childUpdateConfig.input = { parentId: parentIdField, ...childUpdateConfig.input };
      childUseCases['update'] = childUpdateConfig;

      childUseCases['delete'] = {
        input: { identifier: 'id', parentId: parentIdField },
        output: 'void',
        handlers: ['default:delete'],
      };

      const childConfig: ChildConfig = { useCases: childUseCases };

      // Web routes for child
      const childWebAuthMap: Record<string, string | string[]> = {};
      const createChildWeb = await promptYesNo(rl, `  Create web routes for ${colors.bold(child.name)}?`, true);
      if (createChildWeb) {
        console.log(colors.gray('    Configure auth for each web route:'));
        for (const uc of childUCNames) {
          childWebAuthMap[uc] = await promptAuth(rl, `${child.name}:${uc} (web)`);
        }
        childConfig.web = buildChildWebConfig(child.name, childLower, lower, parentIdField, childUCNames, childWebAuthMap);
      }

      // API routes for child
      const childApiAuthMap: Record<string, string | string[]> = {};
      const createChildApi = await promptYesNo(rl, `  Create API routes for ${colors.bold(child.name)}?`, true);
      if (createChildApi) {
        console.log(colors.gray('    Configure auth for each API endpoint:'));
        for (const uc of childUCNames) {
          childApiAuthMap[uc] = await promptAuth(rl, `${child.name}:${uc} (api)`);
        }
        childConfig.api = buildChildApiConfig(child.name, childLower, lower, parentIdField, childUCNames, childApiAuthMap);
      }

      childConfigs.set(child.name, childConfig);
    }
  }

  // Phase 4: Web routes (only when use cases were created)
  let createWeb = false;
  const webAuthMap: Record<string, string | string[]> = {};

  if (createUseCases) {
    console.log(colors.bold('\nStep 4: Web routes'));
    createWeb = await promptYesNo(rl, `Create web routes?`, true);
    if (createWeb) {
      console.log(colors.gray('  Configure auth for each web route:'));
      for (const uc of useCaseNames) {
        webAuthMap[uc] = await promptAuth(rl, `${modelName}:${uc} (web)`);
      }
    }
  }

  // Phase 5: API routes (only when use cases were created)
  let createApi = false;
  const apiAuthMap: Record<string, string | string[]> = {};

  if (createUseCases) {
    console.log(colors.bold('\nStep 5: API routes'));
    createApi = await promptYesNo(rl, `Create API routes?`, true);
    if (createApi) {
      console.log(colors.gray('  Configure auth for each API endpoint:'));
      for (const uc of useCaseNames) {
        apiAuthMap[uc] = await promptAuth(rl, `${modelName}:${uc} (api)`);
      }
    }
  }

  // Phase 6: Build and merge YAML
  const childNames = children.map(c => c.name);
  const newAggregateConfig = buildAggregateConfig(modelName, fields, isRoot, childNames.length > 0 ? childNames : undefined);
  const newValueObjectsConfig = buildValueObjectsConfig(valueObjects);

  const patch: any = {
    domain: {
      aggregates: { [modelName]: newAggregateConfig },
    },
  };

  // Add child aggregates to domain
  for (const child of children) {
    patch.domain.aggregates[child.name] = buildAggregateConfig(child.name, child.fields, false);
  }

  if (Object.keys(newValueObjectsConfig).length > 0) {
    patch.domain.valueObjects = newValueObjectsConfig;
  }

  if (createUseCases && Object.keys(collectedUseCases).length > 0) {
    patch.useCases = { [modelName]: collectedUseCases };
    // Add child use cases
    for (const [childName, childCfg] of childConfigs) {
      patch.useCases[childName] = childCfg.useCases;
    }
  }

  if (createWeb && useCaseNames.length > 0) {
    patch.web = { [modelName]: buildWebConfig(modelName, lower, useCaseNames, webAuthMap) };
  }
  // Add child web configs (regardless of whether parent has web routes)
  for (const [childName, childCfg] of childConfigs) {
    if (childCfg.web) {
      patch.web = patch.web ?? {};
      patch.web[childName] = childCfg.web;
    }
  }

  if (createApi && useCaseNames.length > 0) {
    patch.api = { [modelName]: buildApiConfig(modelName, lower, useCaseNames, apiAuthMap) };
  }
  // Add child api configs (regardless of whether parent has api routes)
  for (const [childName, childCfg] of childConfigs) {
    if (childCfg.api) {
      patch.api = patch.api ?? {};
      patch.api[childName] = childCfg.api;
    }
  }

  const merged = deepMerge(moduleConfig, patch);
  fs.writeFileSync(moduleYamlPath, stringifyYaml(merged), 'utf8');

  console.log('');
  console.log(colors.green(`  Model ${colors.bold(modelName)} saved to ${moduleYamlPath}`));
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function handleCreateModel(nameArg?: string): Promise<void> {
  // Parse <ModuleName:ModelName>
  if (!nameArg || !nameArg.includes(':')) {
    throw new Error(
      `Usage: current create model <ModuleName:ModelName>\n  Example: current create model Invoice:InvoiceItem`
    );
  }

  const colonIdx = nameArg.indexOf(':');
  const moduleName = nameArg.slice(0, colonIdx).trim();
  let modelName = nameArg.slice(colonIdx + 1).trim();

  if (!moduleName || !modelName) {
    throw new Error(`Both module name and model name are required: current create model <ModuleName:ModelName>`);
  }

  // Capitalize model name
  modelName = modelName.charAt(0).toUpperCase() + modelName.slice(1);

  const moduleYamlPath = findModuleYaml(moduleName);

  const rl = createRl();

  try {
    let currentModelName = modelName;

    while (true) {
      await runModelWizard(rl, moduleName, currentModelName, moduleYamlPath);

      console.log('');
      const another = await promptYesNo(rl, `Create another model in the ${colors.bold(moduleName)} module?`, false);
      if (!another) break;

      currentModelName = await promptText(rl, `Model name:`);
      currentModelName = currentModelName.charAt(0).toUpperCase() + currentModelName.slice(1);
    }
  } finally {
    rl.close();
  }

  console.log('');
  console.log(colors.cyan(`Running ${colors.bold('current generate')} for module ${colors.bold(moduleName)}...`));

  // Find the module's name as registered in app.yaml for generate
  const moduleKey = moduleName.charAt(0).toUpperCase() + moduleName.slice(1).toLowerCase();
  await handleGenerateAll(undefined, undefined, moduleKey, { force: false, skip: false, withTemplates: false });
}
