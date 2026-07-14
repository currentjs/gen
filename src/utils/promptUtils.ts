import * as readline from 'readline';
import { colors } from './colors';

// ─── Interactive checkbox list ─────────────────────────────────────────────

export type CheckboxItem<T> = {
  value: T;
  label: string;
  checked: boolean;
  /** Disabled items cannot be toggled (e.g. already at latest version). */
  disabled?: boolean;
  disabledReason?: string;
};

/**
 * Interactive checkbox list using raw terminal mode.
 * Navigate with ↑/↓, toggle with <space>, confirm with <enter>.
 * Disabled items are displayed but cannot be toggled.
 */
export async function promptCheckboxList<T>(
  items: CheckboxItem<T>[],
  header?: string,
): Promise<T[]> {
  if (!process.stdin.isTTY) {
    // Non-interactive mode: return all pre-checked non-disabled items
    return items.filter(i => i.checked && !i.disabled).map(i => i.value);
  }

  const state = items.map(item => ({ ...item }));
  let cursor = 0;

  const KEYS = {
    UP: '\u001b[A',
    DOWN: '\u001b[B',
    SPACE: ' ',
    ENTER: '\r',
    CTRL_C: '\u0003',
  };

  function render() {
    process.stdout.write('\u001b[?25l'); // hide cursor
    const lines: string[] = [];
    if (header) lines.push(colors.bold(header));
    for (let i = 0; i < state.length; i++) {
      const item = state[i];
      const isCursor = i === cursor;
      let checkbox: string;
      if (item.disabled) {
        checkbox = colors.gray('[-]');
      } else if (item.checked) {
        checkbox = colors.green('[x]');
      } else {
        checkbox = '[ ]';
      }
      let label: string;
      if (item.disabled) {
        label = colors.gray(item.label + (item.disabledReason ? ` (${item.disabledReason})` : ''));
      } else {
        label = item.label;
      }
      const row = `  ${checkbox} ${label}`;
      lines.push(isCursor ? colors.bold('> ' + row.trimStart()) : '  ' + row.trimStart());
    }
    lines.push('');
    lines.push(colors.gray('  ↑/↓ navigate   <space> toggle   <enter> install'));
    process.stdout.write('\u001b[2J\u001b[H' + lines.join('\n'));
  }

  return new Promise<T[]>((resolve) => {
    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function onKey(key: string) {
      if (key === KEYS.CTRL_C) {
        cleanup();
        process.exit(0);
      } else if (key === KEYS.UP) {
        cursor = (cursor - 1 + state.length) % state.length;
        render();
      } else if (key === KEYS.DOWN) {
        cursor = (cursor + 1) % state.length;
        render();
      } else if (key === KEYS.SPACE) {
        const item = state[cursor];
        if (!item.disabled) {
          item.checked = !item.checked;
        }
        render();
      } else if (key === KEYS.ENTER) {
        cleanup();
        resolve(state.filter(i => i.checked && !i.disabled).map(i => i.value));
      }
    }

    function cleanup() {
      process.stdin.removeListener('data', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\u001b[?25h\n'); // show cursor
    }

    process.stdin.on('data', onKey);
  });
}

export function createRl(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

/**
 * Ask for free-form text.
 * If allowEmpty is false (default), re-prompts until non-blank is entered.
 */
export async function promptText(rl: readline.Interface, question: string, opts: { allowEmpty?: boolean; defaultValue?: string } = {}): Promise<string> {
  const { allowEmpty = false, defaultValue } = opts;
  const suffix = defaultValue !== undefined ? colors.gray(` (${defaultValue})`) : '';
  while (true) {
    const raw = await ask(rl, `${question}${suffix} `);
    const value = raw.trim();
    if (value !== '') return value;
    if (allowEmpty) return defaultValue ?? '';
    console.log(colors.yellow('  Value is required. Please enter something.'));
  }
}

/**
 * Ask for a number. Re-prompts on invalid input.
 */
export async function promptNumber(rl: readline.Interface, question: string, defaultValue?: number): Promise<number | undefined> {
  const suffix = defaultValue !== undefined ? colors.gray(` (${defaultValue})`) : colors.gray(' (leave blank to skip)');
  const raw = await ask(rl, `${question}${suffix} `);
  const trimmed = raw.trim();
  if (trimmed === '') return defaultValue;
  const n = Number(trimmed);
  if (isNaN(n)) {
    console.log(colors.yellow('  Invalid number, skipping.'));
    return undefined;
  }
  return n;
}

/**
 * Yes/No prompt. Returns true for yes.
 */
export async function promptYesNo(rl: readline.Interface, question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? colors.gray('[Y/n]') : colors.gray('[y/N]');
  const raw = await ask(rl, `${question} ${hint} `);
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '') return defaultYes;
  return trimmed === 'y' || trimmed === 'yes';
}

/**
 * Single-select from a list of choices. Returns the chosen item.
 */
export async function promptSelect<T extends { label: string; value: string }>(
  rl: readline.Interface,
  question: string,
  choices: T[]
): Promise<T> {
  console.log(colors.bold(question));
  choices.forEach((c, i) => {
    console.log(`  ${colors.cyan(String(i + 1).padStart(2))}. ${c.label}`);
  });
  while (true) {
    const raw = await ask(rl, `  ${colors.gray('Enter number:')} `);
    const n = parseInt(raw.trim(), 10);
    if (!isNaN(n) && n >= 1 && n <= choices.length) {
      return choices[n - 1];
    }
    console.log(colors.yellow(`  Please enter a number between 1 and ${choices.length}.`));
  }
}

/**
 * Multi-select from a list of choices.
 * User types comma-separated numbers, "all", or "none".
 * Returns array of selected items (may be empty).
 */
export async function promptMultiSelect<T extends { label: string; value: string }>(
  rl: readline.Interface,
  question: string,
  choices: T[],
  opts: { allowNone?: boolean; defaultAll?: boolean } = {}
): Promise<T[]> {
  const { allowNone = true, defaultAll = false } = opts;
  console.log(colors.bold(question));
  choices.forEach((c, i) => {
    console.log(`  ${colors.cyan(String(i + 1).padStart(2))}. ${c.label}`);
  });
  const hint = defaultAll ? colors.gray('(comma-separated, "all", or "none" – default: all)') : colors.gray('(comma-separated, "all", or "none")');
  while (true) {
    const raw = await ask(rl, `  ${hint} `);
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === '' && defaultAll) return [...choices];
    if (trimmed === 'all') return [...choices];
    if (trimmed === 'none') {
      if (allowNone) return [];
      console.log(colors.yellow('  At least one selection is required.'));
      continue;
    }
    const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    const indices = parts.map(p => parseInt(p, 10));
    if (indices.some(n => isNaN(n) || n < 1 || n > choices.length)) {
      console.log(colors.yellow(`  Please enter numbers between 1 and ${choices.length}, "all", or "none".`));
      continue;
    }
    const selected = [...new Set(indices)].map(n => choices[n - 1]);
    if (selected.length === 0 && !allowNone) {
      console.log(colors.yellow('  At least one selection is required.'));
      continue;
    }
    return selected;
  }
}
