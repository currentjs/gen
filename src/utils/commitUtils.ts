import * as fs from 'fs';
import * as path from 'path';
import { computeContentHash, loadRegistry } from './generationRegistry';

export type DiffHunk = {
  oldStart: number; // 0-based index in base (old)
  oldLines: number;
  newStart: number; // 0-based index in result (new)
  newLines: number;
  oldContent: string[];
  newContent: string[];
  // Optional context from base (old) to improve rebase onto a different base
  ctxBeforeOld?: string[];
  ctxAfterOld?: string[];
};

type StoredCommit = {
  createdAt?: string;
  files: Array<{
    file: string; // relative path
    status: 'modified';
    // legacy fields
    oldHash?: string;
    newHash?: string;
    diff?: string;
    // hunks format
    format?: 'hunks-v1';
    baseHash?: string;
    resultHash?: string;
    hunks?: DiffHunk[];
    meta?: Record<string, any>;
  }>;
};

function parseCommitTimestamp(name: string): number {
  // commit-YYYY-MM-DDTHH-MM-SS-sssZ.json
  const match = name.match(/commit-(.*)\.json$/);
  if (!match) return 0;
  const iso = match[1].replace(/-/g, ':');
  // restore last hyphens: not exact; fallback to Date.parse of createdAt inside file
  return 0;
}

export function loadAllCommitRecords(rootDir: string): Array<{ createdAt: number; file: string; record: StoredCommit['files'][number] }> {
  const commitsDir = path.join(rootDir, 'commits');
  if (!fs.existsSync(commitsDir)) return [];
  const files = fs.readdirSync(commitsDir).filter(f => f.endsWith('.json'));
  const results: Array<{ createdAt: number; file: string; record: StoredCommit['files'][number] }> = [];

  files.forEach(f => {
    const abs = path.join(commitsDir, f);
    try {
      const data = JSON.parse(fs.readFileSync(abs, 'utf8')) as StoredCommit;
      const ts = data.createdAt ? Date.parse(data.createdAt) : parseCommitTimestamp(f);
      data.files.forEach(rec => {
        results.push({ createdAt: ts || 0, file: rec.file, record: rec });
      });
    } catch {
      // ignore broken commit files
    }
  });

  // sort by createdAt ascending
  results.sort((a, b) => a.createdAt - b.createdAt);
  return results;
}

function parseDiff(diff: string): Array<{ type: ' ' | '+' | '-'; line: string }> {
  return diff.split(/\r?\n/).map(line => {
    const type = line[0] as ' ' | '+' | '-';
    const content = line.length > 1 && line[1] === ' ' ? line.slice(2) : line.slice(1);
    return { type: type === ' ' || type === '+' || type === '-' ? type : ' ', line: content };
  });
}

export function computeLineDiff(oldStr: string, newStr: string): string {
  const oldLines = oldStr.split(/\r?\n/);
  const newLines = newStr.split(/\r?\n/);

  const n = oldLines.length;
  const m = newLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (oldLines[i] === newLines[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: Array<{ type: ' ' | '-' | '+'; line: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: ' ', line: oldLines[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: '-', line: oldLines[i] });
      i += 1;
    } else {
      result.push({ type: '+', line: newLines[j] });
      j += 1;
    }
  }
  while (i < n) {
    result.push({ type: '-', line: oldLines[i] });
    i += 1;
  }
  while (j < m) {
    result.push({ type: '+', line: newLines[j] });
    j += 1;
  }

  const lines = result.map(op => `${op.type} ${op.line}`);
  return lines.join('\n');
}

export function applyDiffToBase(base: string, diff: string): string | null {
  const baseLines = base.split(/\r?\n/);
  const ops = parseDiff(diff);
  const result: string[] = [];
  let i = 0;
  for (const op of ops) {
    if (op.type === ' ') {
      if (baseLines[i] !== op.line) {
        return null; // context mismatch
      }
      result.push(op.line);
      i += 1;
    } else if (op.type === '+') {
      if (baseLines[i] !== op.line) {
        return null; // base content deviates
      }
      // skip this line in result (removed compared to base)
      i += 1;
    } else if (op.type === '-') {
      // insert user-only line
      result.push(op.line);
    }
  }
  // any remaining base lines are unexpected; consider they should have been represented
  if (i < baseLines.length) {
    // append remaining lines only if ops end with matching context; otherwise fail
    result.push(...baseLines.slice(i));
  }
  return result.join('\n');
}

function lcsMatrix(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

export function computeHunks(oldStr: string, newStr: string): DiffHunk[] {
  const a = oldStr.split(/\r?\n/);
  const b = newStr.split(/\r?\n/);
  const dp = lcsMatrix(a, b);
  const hunks: DiffHunk[] = [];
  let i = 0;
  let j = 0;
  let pending: DiffHunk | null = null;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      if (pending) {
        hunks.push(pending);
        pending = null;
      }
      i += 1;
      j += 1;
    } else if (dp[i + 1]?.[j] >= dp[i]?.[j + 1]) {
      // deletion from old (i advanced)
      if (!pending) {
        pending = { oldStart: i, oldLines: 0, newStart: j, newLines: 0, oldContent: [], newContent: [] };
      }
      pending.oldLines += 1;
      pending.oldContent.push(a[i]);
      i += 1;
    } else {
      // insertion to new (j advanced)
      if (!pending) {
        pending = { oldStart: i, oldLines: 0, newStart: j, newLines: 0, oldContent: [], newContent: [] };
      }
      pending.newLines += 1;
      pending.newContent.push(b[j]);
      j += 1;
    }
  }

  // tail remainders
  if (i < a.length || j < b.length) {
    const tail: DiffHunk = {
      oldStart: i,
      oldLines: a.length - i,
      newStart: j,
      newLines: b.length - j,
      oldContent: a.slice(i),
      newContent: b.slice(j)
    };
    if (tail.oldLines > 0 || tail.newLines > 0) {
      if (pending) {
        // merge if adjacent
        if (pending.oldStart + pending.oldLines === tail.oldStart && pending.newStart + pending.newLines === tail.newStart) {
          pending.oldLines += tail.oldLines;
          pending.newLines += tail.newLines;
          pending.oldContent.push(...tail.oldContent);
          pending.newContent.push(...tail.newContent);
        } else {
          hunks.push(pending);
          hunks.push(tail);
          pending = null;
        }
      } else {
        pending = tail;
      }
    }
  }

  if (pending) hunks.push(pending);
  // Attach lightweight context (up to 3 lines) around old segments to help rebase
  const CONTEXT = 3;
  return hunks.map(h => {
    const beforeStart = Math.max(0, h.oldStart - CONTEXT);
    const before = a.slice(beforeStart, h.oldStart);
    const afterEnd = h.oldStart + h.oldLines + CONTEXT;
    const after = a.slice(h.oldStart + h.oldLines, Math.min(a.length, afterEnd));
    return { ...h, ctxBeforeOld: before, ctxAfterOld: after } as DiffHunk;
  });
}

export function applyHunksToBase(base: string, hunks: DiffHunk[]): string | null {
  const baseLines = base.split(/\r?\n/);
  let offset = 0;
  for (const h of hunks) {
    const start = h.oldStart + offset;
    const end = start + h.oldLines;
    if (start < 0 || start > baseLines.length || end < 0 || end > baseLines.length) {
      return null;
    }
    baseLines.splice(start, h.oldLines, ...h.newContent);
    offset += h.newContent.length - h.oldLines;
  }
  return baseLines.join('\n');
}

function findSubsequence(haystack: string[], needle: string[], fromIndex: number = 0): number {
  if (needle.length === 0) return fromIndex;
  for (let i = fromIndex; i <= haystack.length - needle.length; i += 1) {
    let ok = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

/**
 * Try to apply hunks to an arbitrary base using contextual search.
 * - If oldContent exists, locate it and replace by newContent.
 * - If oldLines === 0 (pure insertion), use ctxBeforeOld/ctxAfterOld anchors to place newContent.
 * Returns null if cannot apply cleanly.
 */
export function applyHunksToAnyBase(base: string, hunks: DiffHunk[]): string | null {
  let baseLines = base.split(/\r?\n/);
  let searchFrom = 0;
  for (const h of hunks) {
    if (h.oldLines > 0 && h.oldContent.length > 0) {
      // Try to find exact oldContent sequence
      let idx = findSubsequence(baseLines, h.oldContent, searchFrom);
      if (idx === -1 && h.ctxBeforeOld && h.ctxBeforeOld.length > 0) {
        // Try to locate by ctxBefore then expect oldContent after
        const beforeIdx = findSubsequence(baseLines, h.ctxBeforeOld, Math.max(0, searchFrom - h.ctxBeforeOld.length));
        if (beforeIdx !== -1) {
          idx = findSubsequence(baseLines, h.oldContent, beforeIdx + h.ctxBeforeOld.length);
        }
      }
      if (idx === -1 && h.ctxAfterOld && h.ctxAfterOld.length > 0) {
        // Try to locate by ctxAfter before it
        const afterIdx = findSubsequence(baseLines, h.ctxAfterOld, searchFrom);
        if (afterIdx !== -1) {
          // Scan backwards window before afterIdx
          const windowStart = Math.max(0, afterIdx - h.oldLines - h.ctxBeforeOld!.length);
          idx = findSubsequence(baseLines.slice(windowStart, afterIdx), h.oldContent);
          if (idx !== -1) idx += windowStart;
        }
      }
      if (idx === -1) return null;
      baseLines.splice(idx, h.oldLines, ...h.newContent);
      searchFrom = idx + h.newContent.length;
    } else {
      // Insertion-only hunk: place using context anchors
      let insertAt = h.newStart; // fallback
      if (h.ctxBeforeOld && h.ctxBeforeOld.length > 0) {
        const beforeIdx = findSubsequence(baseLines, h.ctxBeforeOld, Math.max(0, searchFrom - h.ctxBeforeOld.length));
        if (beforeIdx !== -1) insertAt = beforeIdx + h.ctxBeforeOld.length;
      } else if (h.ctxAfterOld && h.ctxAfterOld.length > 0) {
        const afterIdx = findSubsequence(baseLines, h.ctxAfterOld, searchFrom);
        if (afterIdx !== -1) insertAt = afterIdx;
      }
      if (insertAt < 0 || insertAt > baseLines.length) insertAt = baseLines.length;
      baseLines.splice(insertAt, 0, ...h.newContent);
      searchFrom = insertAt + h.newContent.length;
    }
  }
  return baseLines.join('\n');
}

export function tryApplyCommitsToGenerated(fileAbsPath: string, generatedContent: string): { applied: boolean; content: string } {
  const root = process.cwd();
  const rel = path.relative(root, path.resolve(fileAbsPath));
  const baseHash = computeContentHash(generatedContent);
  // Prefer registry snapshot if present and compatible
  const registry = loadRegistry();
  const regEntry = (registry as any)[rel] as
    | {
        diffFormat?: string;
        diffBaseHash?: string;
        diffHunks?: DiffHunk[];
      }
    | undefined;
  if (regEntry && regEntry.diffFormat === 'hunks-v1' && regEntry.diffHunks) {
    // If baseHash matches, use fast exact apply; else attempt contextual apply
    const appliedViaRegistry = regEntry.diffBaseHash === baseHash
      ? applyHunksToBase(generatedContent, regEntry.diffHunks)
      : applyHunksToAnyBase(generatedContent, regEntry.diffHunks);
    if (appliedViaRegistry != null) {
      return { applied: true, content: appliedViaRegistry };
    }
  }

  // Fallback to commit files if registry snapshot not usable
  const all = loadAllCommitRecords(root).filter(r => r.file === rel && r.record.status === 'modified');
  if (all.length === 0) return { applied: false, content: generatedContent };
  // Prefer hunks format
  const hunksCandidates = all.filter(r => r.record.format === 'hunks-v1' && r.record.baseHash === baseHash && r.record.hunks);
  if (hunksCandidates.length > 0) {
    const latest = hunksCandidates[hunksCandidates.length - 1].record;
    const applied = applyHunksToBase(generatedContent, latest.hunks!);
    if (applied != null) return { applied: true, content: applied };
  }
  // Fallback to legacy line diff
  const legacyCandidates = all.filter(r => r.record.newHash === baseHash && r.record.diff);
  if (legacyCandidates.length > 0) {
    const latest = legacyCandidates[legacyCandidates.length - 1].record;
    const applied = applyDiffToBase(generatedContent, latest.diff!);
    if (applied != null) return { applied: true, content: applied };
  }
  return { applied: false, content: generatedContent };
}

