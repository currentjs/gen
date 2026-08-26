import {
  ModuleConfig,
  ExportedCommandConfig,
  UseCaseInputConfig
} from '../types/configTypes';

export type PortKind = 'query' | 'command';

/**
 * Returns a map of every imported port name to its kind ('query' | 'command').
 * Used by both the controller and service generators so the logic stays in sync.
 */
export function collectImportedPorts(config: ModuleConfig): Map<string, PortKind> {
  const result = new Map<string, PortKind>();
  if (!config.dependencies) return result;
  for (const depConfig of Object.values(config.dependencies)) {
    (depConfig.queries || []).forEach(q => result.set(q, 'query'));
    (depConfig.commands || []).forEach(c => result.set(c, 'command'));
  }
  return result;
}

/**
 * Resolves the backing model for an exported command:
 * uses the explicit `model` field, then falls back to `output.from`.
 */
export function resolveCommandModel(cmd: ExportedCommandConfig): string | undefined {
  if (cmd.model) return cmd.model;
  if (cmd.output && cmd.output !== 'void' && cmd.output.from) return cmd.output.from;
  return undefined;
}

/**
 * Builds the argument string for a `default:*` handler call.
 * Lifted out of controllerGenerator so commandGenerator uses identical logic.
 */
export function defaultHandlerArgs(
  action: string,
  inputConfig: UseCaseInputConfig | undefined,
  ownerIdArg?: string
): string {
  if (action === 'list') {
    if (inputConfig?.pagination) {
      return ownerIdArg
        ? `input.page || 1, input.limit || 20, ${ownerIdArg}`
        : 'input.page || 1, input.limit || 20';
    }
    return ownerIdArg ? ownerIdArg : '';
  }
  if (action === 'get' || action === 'getById') return 'input.id';
  if (action === 'create') return 'input';
  if (action === 'update') return 'input.id, input';
  if (action === 'delete') return 'input.id';
  if (action === 'search') return 'input.query || "", input.limit || 20';
  if (action === 'searchableList') return 'input.query, input.limit || 20';
  return 'input';
}
