import * as readline from 'readline';
import { colors } from './colors';

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
