import * as vscode from 'vscode';
import { ListPanel } from './listPanel';
import { PlannedEntry } from './paths';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('bulkFilesCreator.create', async (uri?: vscode.Uri) => {
      try {
        const target = await resolveTarget(uri);
        if (target) ListPanel.show(context.extensionUri, target, write);
      } catch (err) {
        vscode.window.showErrorMessage(`Files from List: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );
}

export function deactivate() {}

async function exists(uri: vscode.Uri): Promise<vscode.FileType | undefined> {
  try {
    return (await vscode.workspace.fs.stat(uri)).type;
  } catch {
    return undefined;
  }
}

/** The folder that was right-clicked (or a file's folder), else the workspace root, else ask. */
async function resolveTarget(uri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (uri) {
    return (await exists(uri)) === vscode.FileType.Directory ? uri : vscode.Uri.joinPath(uri, '..');
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 1) return folders[0].uri;
  if (folders.length > 1) return (await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Create files in which folder?' }))?.uri;
  const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Create Here' });
  return picked?.[0];
}

/** Create folders and empty files. Returns how many items were written, or undefined if cancelled. */
async function write(target: vscode.Uri, entries: PlannedEntry[]): Promise<number | undefined> {
  const uriOf = (e: PlannedEntry) => vscode.Uri.joinPath(target, ...e.path.split('/'));

  const clashes: PlannedEntry[] = [];
  for (const e of entries) {
    const type = await exists(uriOf(e));
    if (type === undefined) continue;
    const isDir = (type & vscode.FileType.Directory) !== 0;
    if (e.kind === 'file' && isDir) throw new Error(`"${e.path}" already exists as a folder`);
    if (e.kind === 'folder' && !isDir) throw new Error(`"${e.path}" already exists as a file`);
    if (e.kind === 'file') clashes.push(e);
  }

  let skip = new Set<string>();
  if (clashes.length > 0) {
    const list = clashes.slice(0, 10).map((e) => `• ${e.path}`).join('\n') + (clashes.length > 10 ? `\n…and ${clashes.length - 10} more` : '');
    const choice = await vscode.window.showWarningMessage(
      `${clashes.length} file(s) already exist.`,
      { modal: true, detail: list },
      'Overwrite with Empty',
      'Skip Existing',
    );
    if (!choice) return undefined;
    if (choice === 'Skip Existing') skip = new Set(clashes.map((e) => e.path));
  }

  let count = 0;
  for (const e of entries) {
    if (skip.has(e.path)) continue;
    const uri = uriOf(e);
    if (e.kind === 'folder') {
      await vscode.workspace.fs.createDirectory(uri); // creates missing parents too
    } else {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
      await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    }
    count++;
  }
  return count;
}
