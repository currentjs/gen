#!/usr/bin/env node
import { handleCreateApp } from './commands/createApp';
import { handleCreateModule } from './commands/createModule';
import { handleGenerateAll } from './commands/generateAll';
import { handleCommit } from './commands/commit';
import { handleDiff } from './commands/diff';
import { colors } from './utils/colors';
import { handleInfer } from './commands/infer';

function printHelp() {
  const title = colors.bold(colors.brightCyan('currentjs - Clean architecture CLI'));
  const usage = colors.bold('Usage:');
  const options = colors.bold('Options:');
  const cmd = (s: string) => colors.green(s);
  const flag = (s: string) => colors.yellow(s);
  const help = `
${title}

${usage}
  ${cmd('currentjs create app')} ${colors.gray('[name]')}
  ${cmd('currentjs create module')} ${colors.gray('<name>')}
  ${cmd('currentjs generate')} ${colors.gray('<module|*>')} ${flag('--yaml')} ${colors.gray('app.yaml')} ${colors.gray('[')}${flag('--force')}${colors.gray(']')} ${colors.gray('[')}${flag('--skip')}${colors.gray(']')}
  ${cmd('currentjs commit')} ${colors.gray('[<file> ...]')} ${flag('--yaml')} ${colors.gray('app.yaml')}
  ${cmd('currentjs diff')} ${colors.gray('<module|*>')} ${flag('--yaml')} ${colors.gray('app.yaml')}
  ${cmd('currentjs infer')} ${flag('--file')} ${colors.gray('src/modules/<Module>/domain/entities/<Entity>.ts')} ${colors.gray('[')}${flag('--write')}${colors.gray(']')}

${options}
  ${flag('--yaml')} <path>   ${colors.gray('Path to app.yaml (default: ./app.yaml)')}
  ${flag('--force')}         ${colors.gray('Overwrite modified files without prompting')}
  ${flag('--skip')}          ${colors.gray('Always skip overwriting modified files (no prompts)')}
  ${flag('--out')} <dir>     ${colors.gray('[deprecated] Generators now write into each module\'s structure')}
  ${flag('-h, --help')}      ${colors.gray('Show help')}
`;
  // eslint-disable-next-line no-console
  console.log(help);
}

type Args = { command?: string; sub?: string; name?: string; files?: string[]; yaml?: string; out?: string; force?: boolean; skip?: boolean; help?: boolean };

function parseArgs(argv: string[]): Args {
  const [, , ...rest] = argv;
  const result: Args = {};
  if (rest.length === 0) return { help: true } as Args;

  result.command = rest.shift();
  if (result.command === 'create') {
    result.sub = rest.shift();
    result.name = rest[0] && !rest[0].startsWith('-') ? rest.shift() : undefined;
  } else if (result.command === 'generate') {
    // capture optional module name (or *) before flags
    result.name = rest[0] && !rest[0].startsWith('-') ? rest.shift() : undefined;
  } else if (result.command === 'commit') {
    // capture positional file paths until a flag begins
    const files: string[] = [];
    while (rest[0] && !rest[0].startsWith('-')) {
      files.push(rest.shift() as string);
    }
    // store as name for backward compatibility? better extend Args
    (result as any).files = files;
  }
  else if (result.command === 'diff') {
    // capture optional module name (or *) before flags
    result.name = rest[0] && !rest[0].startsWith('-') ? rest.shift() : undefined;
  }
  else if (result.command === 'infer') {
    // no subcommands
  }

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--yaml') {
      result.yaml = rest[i + 1];
      i += 1;
    } else if (token === '--force') {
      result.force = true;
    } else if (token === '--skip') {
      result.skip = true;
    } else if (token === '--out') {
      result.out = rest[i + 1];
      i += 1;
    } else if (token === '-h' || token === '--help') {
      result.help = true;
    }
  }
  return result;
}

async function run() {
  try {
    const args = parseArgs(process.argv);
    if (args.help || !args.command) {
      printHelp();
      return;
    }

    switch (args.command) {
      case 'create': {
        if (args.sub === 'app') {
          handleCreateApp(args.name);
          return;
        }
        if (args.sub === 'module') {
          handleCreateModule(args.name);
          return;
        }
        printHelp();
        process.exitCode = 1;
        return;
      }
      case 'generate': {
        await handleGenerateAll(args.yaml, args.out, args.name, { force: !!args.force, skip: !!args.skip });
        return;
      }
      case 'commit': {
        handleCommit(args.yaml, args.files);
        return;
      }
      case 'diff': {
        await handleDiff(args.yaml, args.name);
        return;
      }
      case 'infer': {
        const fileFlagIndex = process.argv.findIndex(a => a === '--file');
        const fileArg = fileFlagIndex !== -1 ? process.argv[fileFlagIndex + 1] : undefined;
        const write = process.argv.includes('--write');
        handleInfer(fileArg, write);
        return;
      }
      default: {
        printHelp();
        process.exitCode = 1;
        return;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(colors.red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  }
}

run();

