import { ModuleConfig, AggregateFieldConfig } from '../types/configTypes';

export interface ChildEntityInfo {
  parentEntityName: string;
  parentIdField: string;
  parentTableName: string;
}

export interface ParentChildInfo {
  childEntityName: string;
  parentIdField: string;
  childFields: Record<string, AggregateFieldConfig>;
  childWebPrefix?: string;
}

export function buildChildEntityMap(config: ModuleConfig): Map<string, ChildEntityInfo> {
  const map = new Map<string, ChildEntityInfo>();

  if (!config.domain?.aggregates || !config.useCases) {
    return map;
  }

  const aggregates = config.domain.aggregates;

  Object.entries(aggregates).forEach(([parentName, aggregateConfig]) => {
    const entities = aggregateConfig.entities || [];

    entities.forEach(childName => {
      const childUseCases = config.useCases[childName];
      if (!childUseCases) {
        return;
      }

      let parentIdField: string | undefined;

      Object.values(childUseCases).forEach(useCaseDef => {
        const input: any = useCaseDef.input;
        if (input && typeof input.parentId === 'string' && !parentIdField) {
          parentIdField = input.parentId;
        }
      });

      if (!parentIdField) {
        return;
      }

      map.set(childName, {
        parentEntityName: parentName,
        parentIdField,
        parentTableName: parentName.toLowerCase(),
      });
    });
  });

  return map;
}

/**
 * Returns all child entities of a given parent aggregate, with field definitions and web prefix.
 * Used by template and controller generators when withChild is true.
 */
export function getChildrenOfParent(
  config: ModuleConfig,
  parentName: string
): ParentChildInfo[] {
  const result: ParentChildInfo[] = [];
  if (!config.domain?.aggregates || !config.useCases) {
    return result;
  }

  const parentAggregate = config.domain.aggregates[parentName];
  if (!parentAggregate?.entities?.length) {
    return result;
  }

  for (const childName of parentAggregate.entities) {
    const childUseCases = config.useCases[childName];
    if (!childUseCases) continue;

    let parentIdField: string | undefined;
    for (const useCaseDef of Object.values(childUseCases)) {
      const input = (useCaseDef as { input?: { parentId?: string } }).input;
      if (input?.parentId) {
        parentIdField = input.parentId;
        break;
      }
    }
    if (!parentIdField) continue;

    const childAggregate = config.domain.aggregates[childName];
    if (!childAggregate?.fields) continue;

    const childWebPrefix = config.web?.[childName]?.prefix;

    result.push({
      childEntityName: childName,
      parentIdField,
      childFields: childAggregate.fields,
      childWebPrefix,
    });
  }

  return result;
}
