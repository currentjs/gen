/* Simple ANSI color utilities with TTY/NO_COLOR/FOREG_COLOR detection */

export type ColorizeFn = (text: string | number) => string;

function isColorSupported(): boolean {
  const force = process.env.FORCE_COLOR;
  if (force && force !== '0') return true;
  if (force === '0') return false;
  if (process.env.NO_COLOR) return false;
  // Prefer stdout TTY; fall back to true in CI with FORCE_COLOR
  return !!process.stdout && !!process.stdout.isTTY;
}

const enabled = isColorSupported();

function createStyle(openCode: number, closeCode: number): ColorizeFn {
  const open = `\u001b[${openCode}m`;
  const close = `\u001b[${closeCode}m`;
  return (text: string | number) => {
    const value = String(text);
    if (!enabled) return value;
    return open + value + close;
  };
}

const dim: ColorizeFn = createStyle(2, 22);
const bold: ColorizeFn = createStyle(1, 22);
const italic: ColorizeFn = createStyle(3, 23);
const underline: ColorizeFn = createStyle(4, 24);
const inverse: ColorizeFn = createStyle(7, 27);

const black: ColorizeFn = createStyle(30, 39);
const red: ColorizeFn = createStyle(31, 39);
const green: ColorizeFn = createStyle(32, 39);
const yellow: ColorizeFn = createStyle(33, 39);
const blue: ColorizeFn = createStyle(34, 39);
const magenta: ColorizeFn = createStyle(35, 39);
const cyan: ColorizeFn = createStyle(36, 39);
const white: ColorizeFn = createStyle(37, 39);
const gray: ColorizeFn = createStyle(90, 39);

const brightRed: ColorizeFn = createStyle(91, 39);
const brightGreen: ColorizeFn = createStyle(92, 39);
const brightYellow: ColorizeFn = createStyle(93, 39);
const brightBlue: ColorizeFn = createStyle(94, 39);
const brightMagenta: ColorizeFn = createStyle(95, 39);
const brightCyan: ColorizeFn = createStyle(96, 39);
const brightWhite: ColorizeFn = createStyle(97, 39);

export const colors = {
  enabled,
  // modifiers
  dim,
  bold,
  italic,
  underline,
  inverse,
  // base colors
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,
  // bright variants
  brightRed,
  brightGreen,
  brightYellow,
  brightBlue,
  brightMagenta,
  brightCyan,
  brightWhite
};

export function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /[\u001b\u009b][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return input.replace(ansiRegex, '');
}

