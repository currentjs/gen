import * as fs from 'fs';
import * as path from 'path';
import { colors } from '../utils/colors';
import { ensureDir } from '../utils/cliUtils';
import {
  fetchRegistry,
  fetchManifestFiles,
  fetchText,
  readInstalledData,
  markInstalled,
  isNewerVersion,
  RegistryEntry,
} from '../utils/registryUtils';
import { promptCheckboxList, CheckboxItem } from '../utils/promptUtils';

interface SkillOption {
  name: string;
  entry: RegistryEntry;
  /** undefined = new, string = currently installed version */
  installedVersion?: string;
}

function buildCheckboxItems(skills: SkillOption[]): CheckboxItem<SkillOption>[] {
  return skills.map(skill => {
    const { installedVersion, entry } = skill;
    const desc = entry.description ? ` – ${entry.description}` : '';

    if (!installedVersion) {
      return {
        value: skill,
        label: `${colors.bold(skill.name)} (v${entry.version})${desc}`,
        checked: true,
      };
    }

    if (isNewerVersion(entry.version, installedVersion)) {
      return {
        value: skill,
        label: `${colors.bold(skill.name)} – update v${installedVersion} → v${entry.version}${desc}`,
        checked: true,
      };
    }

    return {
      value: skill,
      label: `${colors.bold(skill.name)} (v${entry.version})${desc}`,
      checked: false,
      disabled: true,
      disabledReason: 'already latest version',
    };
  });
}

async function installSkill(skillName: string, entry: RegistryEntry, cwd: string): Promise<void> {
  const files = await fetchManifestFiles(entry.path);
  const baseUrl = `https://raw.githubusercontent.com/currentjs/registry/refs/heads/main/${entry.path}`;

  // Cursor: .cursor/skills/<name>/
  const cursorSkillDir = path.join(cwd, '.cursor', 'skills', skillName);
  ensureDir(cursorSkillDir);

  // Claude Code: .claude/commands/<name>/ for companion files, main SKILL.md → <name>.md
  const claudeCommandsDir = path.join(cwd, '.claude', 'commands');
  const claudeSkillCompanionDir = path.join(claudeCommandsDir, skillName);
  ensureDir(claudeCommandsDir);

  for (const file of files) {
    const fileUrl = baseUrl + file;
    const content = await fetchText(fileUrl);

    // Install for Cursor (all files in skill dir)
    const cursorDest = path.join(cursorSkillDir, file);
    ensureDir(path.dirname(cursorDest));
    fs.writeFileSync(cursorDest, content, 'utf8');

    // Install for Claude Code
    if (file === 'SKILL.md') {
      // Main skill file becomes a slash command: .claude/commands/<name>.md
      fs.writeFileSync(path.join(claudeCommandsDir, `${skillName}.md`), content, 'utf8');
    } else {
      // Companion files go into .claude/commands/<name>/
      ensureDir(claudeSkillCompanionDir);
      const claudeDest = path.join(claudeSkillCompanionDir, file);
      ensureDir(path.dirname(claudeDest));
      fs.writeFileSync(claudeDest, content, 'utf8');
    }
  }
}

export async function handleAi(): Promise<void> {
  console.log(colors.cyan('Fetching registry…'));

  const registry = await fetchRegistry();
  const skills = registry.registry['ai/skills'] ?? {};
  const skillNames = Object.keys(skills);

  if (skillNames.length === 0) {
    console.log(colors.yellow('No AI skills found in registry.'));
    return;
  }

  const cwd = process.cwd();
  const installed = readInstalledData(cwd);

  const skillOptions: SkillOption[] = skillNames.map(name => ({
    name,
    entry: skills[name],
    installedVersion: installed['ai/skills'][name]?.version,
  }));

  const items = buildCheckboxItems(skillOptions);
  const allLatest = items.every(i => i.disabled);

  if (allLatest) {
    console.log(colors.green('All skills are already at the latest version.'));
    return;
  }

  const count = skillNames.length;
  const header = `${count} skill${count !== 1 ? 's' : ''} available:`;

  const selected = await promptCheckboxList<SkillOption>(items, header);

  if (selected.length === 0) {
    console.log(colors.yellow('Nothing selected, no skills installed.'));
    return;
  }

  console.log('');
  let installed_count = 0;
  for (const skill of selected) {
    process.stdout.write(`  Installing ${colors.bold(skill.name)}… `);
    await installSkill(skill.name, skill.entry, cwd);
    markInstalled(cwd, 'ai/skills', skill.name, skill.entry.version);
    console.log(colors.green('done'));
    installed_count++;
  }

  console.log('');
  console.log(colors.green(`${installed_count} skill${installed_count !== 1 ? 's' : ''} installed.`));
  console.log(colors.gray('  Cursor: .cursor/skills/'));
  console.log(colors.gray('  Claude Code: .claude/commands/'));
}
