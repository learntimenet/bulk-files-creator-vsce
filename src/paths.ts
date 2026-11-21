// Pure path-list logic. No `vscode` import, so it can be unit tested with plain Node.

export interface PlannedEntry {
  /** Relative path with `/` separators. */
  path: string;
  kind: 'file' | 'folder';
}

/** Normalize a relative path and reject anything that escapes the target folder. */
export function safeRelativePath(raw: string): string {
  if (/^([A-Za-z]:|[\\/])/.test(raw)) throw new Error(`Path must be relative: "${raw}"`);
  const parts = raw.split(/[\\/]+/).filter((p) => p !== '' && p !== '.');
  if (parts.some((p) => p === '..')) throw new Error(`Path must not contain "..": "${raw}"`);
  if (parts.length === 0) throw new Error(`Empty path: "${raw}"`);
  return parts.join('/');
}

export interface ListProblem {
  /** 1-based line number in the input. */
  line: number;
  message: string;
}

/**
 * Parse a list of paths, one per line, into empty files and folders.
 * Blank lines and lines starting with `#` are ignored. A trailing `/` makes a folder.
 */
export function parsePathList(text: string): { entries: PlannedEntry[]; problems: ListProblem[] } {
  const entries: PlannedEntry[] = [];
  const problems: ListProblem[] = [];
  const lineOf = new Map<string, number>();

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    let path: string;
    try {
      path = safeRelativePath(trimmed);
    } catch (err) {
      problems.push({ line, message: (err as Error).message });
      return;
    }
    const key = path.toLowerCase();
    if (lineOf.has(key)) {
      problems.push({ line, message: `Duplicate of line ${lineOf.get(key)}: "${path}"` });
      return;
    }
    lineOf.set(key, line);
    entries.push({ path, kind: /[\\/]$/.test(trimmed) ? 'folder' : 'file' });
  });

  // A file cannot also be the parent folder of another entry.
  for (const file of entries.filter((e) => e.kind === 'file')) {
    const prefix = file.path.toLowerCase() + '/';
    const child = entries.find((e) => e.path.toLowerCase().startsWith(prefix));
    if (child) {
      problems.push({ line: lineOf.get(file.path.toLowerCase())!, message: `"${file.path}" is a file but "${child.path}" puts things inside it` });
    }
  }

  problems.sort((a, b) => a.line - b.line);
  return { entries, problems };
}
