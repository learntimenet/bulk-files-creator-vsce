import * as vscode from 'vscode';
import { parsePathList, PlannedEntry } from './paths';

/** Writes the entries into the folder. Returns the number written, or undefined if the user cancelled. */
export type Writer = (target: vscode.Uri, entries: PlannedEntry[]) => Promise<number | undefined>;

type FromWebview = { type: 'change'; text: string } | { type: 'create'; text: string } | { type: 'pickFolder' };

/** A webview where you type many paths, one per line, and create them all at once. */
export class ListPanel {
  private static current: ListPanel | undefined;

  static show(extensionUri: vscode.Uri, target: vscode.Uri, writer: Writer) {
    if (ListPanel.current) {
      ListPanel.current.setTarget(target);
      ListPanel.current.panel.reveal();
      return;
    }
    ListPanel.current = new ListPanel(extensionUri, target, writer);
  }

  private readonly panel: vscode.WebviewPanel;

  private constructor(extensionUri: vscode.Uri, private target: vscode.Uri, private readonly writer: Writer) {
    this.panel = vscode.window.createWebviewPanel('bulkFilesCreator.panel', 'Bulk Files Creator', vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [],
    });
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'icon.png');
    this.panel.webview.html = html(this.panel.webview.cspSource);
    this.panel.onDidDispose(() => (ListPanel.current = undefined));
    this.panel.webview.onDidReceiveMessage((msg: FromWebview) => this.onMessage(msg));
  }

  private post(msg: unknown) {
    void this.panel.webview.postMessage(msg);
  }

  private setTarget(target: vscode.Uri) {
    this.target = target;
    this.post({ type: 'target', label: label(target) });
  }

  private async onMessage(msg: FromWebview) {
    switch (msg.type) {
      case 'change': {
        // The webview sends 'change' once on load, so this is also where it gets the target.
        this.post({ type: 'target', label: label(this.target) });
        this.post({ type: 'preview', ...parsePathList(msg.text) });
        return;
      }
      case 'pickFolder': {
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          defaultUri: this.target,
          openLabel: 'Create Here',
        });
        if (picked?.[0]) this.setTarget(picked[0]);
        return;
      }
      case 'create': {
        const { entries, problems } = parsePathList(msg.text);
        if (problems.length > 0 || entries.length === 0) return;
        this.post({ type: 'busy', busy: true });
        try {
          const written = await this.writer(this.target, entries);
          if (written === undefined) return; // cancelled at the overwrite prompt; keep the list
          this.post({ type: 'created' });
          const target = this.target;
          const first = entries.find((e) => e.kind === 'file');
          const openFirst = 'Open First File';
          const where = label(target);
          void vscode.window
            .showInformationMessage(`Created ${written} item(s) in ${where}.`, ...(first ? [openFirst] : []))
            .then((choice) => {
              if (choice === openFirst && first) {
                // Open beside the panel so the panel stays visible.
                void vscode.window.showTextDocument(vscode.Uri.joinPath(target, ...first.path.split('/')), {
                  preview: true,
                  viewColumn: vscode.ViewColumn.Beside,
                });
              }
            });
        } catch (err) {
          this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        } finally {
          this.post({ type: 'busy', busy: false });
        }
        return;
      }
    }
  }
}

function label(uri: vscode.Uri): string {
  const rel = vscode.workspace.asRelativePath(uri, true);
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  // asRelativePath returns the bare folder name for a workspace root; make that explicit.
  return folder && folder.uri.toString() === uri.toString() ? `${folder.name} (workspace root)` : rel;
}

/** Shown greyed-out in the preview while the list is empty; the "Use Example" button inserts it into the list. */
const EXAMPLE = [
  'src/components/header/Header.tsx',
  'src/components/footer/Footer.tsx',
  'src/components/page-layout/PageLayout.tsx',
  'src/pages/home/HomePage.tsx',
  'src/pages/login/LoginPage.tsx',
];

/** Inline SVG icons (the webview loads no local resources, so codicons aren't available). */
const ICONS = {
  folder: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h4.3l1.4 1.5h7.3v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg>',
  file: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/></svg>',
  error: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v4.5M8 11v.5"/></svg>',
};

function html(cspSource: string): string {
  const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  :root {
    --gap: 16px;
    --radius: 6px;
    --border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128, 128, 128, 0.35)));
    --card: var(--vscode-sideBar-background, var(--vscode-editorWidget-background));
    --muted: var(--vscode-descriptionForeground);
    --mono: var(--vscode-editor-font-family);
    --mono-size: var(--vscode-editor-font-size);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px clamp(12px, 3vw, 32px) 0;
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    color: var(--vscode-foreground); background: var(--vscode-editor-background);
  }
  .wrap { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--gap); }
  svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linejoin: round; stroke-linecap: round; }
  code, kbd { font-family: var(--mono); font-size: 0.92em; }
  kbd {
    padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border); border-bottom-width: 2px;
    background: var(--vscode-keybindingLabel-background, transparent); color: var(--vscode-keybindingLabel-foreground, inherit);
  }

  /* Header */
  header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px var(--gap); }
  h1 { font-size: 1.45em; font-weight: 600; margin: 0 0 4px; }
  .sub { margin: 0; color: var(--muted); }
  .target {
    display: flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%;
    padding: 4px 4px 4px 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card);
  }
  .target .lbl { color: var(--muted); white-space: nowrap; }
  .target code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .target svg { color: var(--vscode-symbolIcon-folderForeground, var(--muted)); }

  /* Syntax reference */
  .syntax { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; padding: 0; list-style: none; color: var(--muted); }
  .syntax li { display: flex; align-items: center; gap: 6px; }
  .syntax code { padding: 1px 6px; border-radius: 3px; background: var(--vscode-textCodeBlock-background); color: var(--vscode-foreground); }

  /* Cards */
  .cols { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: var(--gap); }
  .card { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); overflow: hidden; }
  .card-head {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 38px;
    padding: 6px 10px 6px 12px; border-bottom: 1px solid var(--border);
  }
  .card-head h2 { margin: 0; font-size: 0.85em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .badge {
    padding: 1px 8px; border-radius: 10px; font-size: 0.85em; white-space: nowrap;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  }
  .badge.dim { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .badge[hidden] { display: none; }

  /* Editor with line numbers */
  .editor { display: flex; flex: 1; min-height: 280px; height: 46vh; max-height: 640px; background: var(--vscode-input-background); }
  .editor:focus-within { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .gutter {
    margin: 0; padding: 10px 8px 10px 12px; min-width: 3.2em; text-align: right; overflow: hidden; user-select: none;
    font-family: var(--mono); font-size: var(--mono-size); line-height: 1.6;
    color: var(--vscode-editorLineNumber-foreground, var(--muted)); border-right: 1px solid var(--border);
  }
  .gutter span { display: block; }
  .gutter span.err { color: var(--vscode-errorForeground); font-weight: 600; }
  textarea {
    flex: 1; min-width: 0; margin: 0; padding: 10px 12px; border: 0; outline: 0; resize: none;
    white-space: pre; overflow: auto; tab-size: 2;
    font-family: var(--mono); font-size: var(--mono-size); line-height: 1.6;
    color: var(--vscode-input-foreground); background: transparent;
  }

  /* Empty-state call to action */
  .empty-cta {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
    padding: 8px 10px 8px 12px; border-top: 1px solid var(--border); color: var(--muted);
  }
  .empty-cta[hidden] { display: none; }

  /* Problems */
  .problems { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--border); max-height: 140px; overflow: auto; }
  .problems:empty { display: none; }
  .problems li {
    display: flex; gap: 8px; align-items: flex-start; padding: 6px 12px;
    color: var(--vscode-errorForeground); background: var(--vscode-inputValidation-errorBackground, transparent);
  }
  .problems li + li { border-top: 1px solid var(--border); }
  .problems svg { margin-top: 1px; }

  /* Tree preview */
  .tree {
    flex: 1; margin: 0; padding: 6px 0; list-style: none; overflow: auto; min-height: 200px; max-height: 640px;
    font-family: var(--mono); font-size: var(--mono-size); line-height: 1.7;
  }
  .tree li { display: flex; align-items: center; gap: 6px; padding-right: 12px; white-space: nowrap; }
  .tree li:hover { background: var(--vscode-list-hoverBackground); }
  .tree li .name { overflow: hidden; text-overflow: ellipsis; }
  .tree li.folder svg { color: var(--vscode-symbolIcon-folderForeground, var(--muted)); }
  .tree li.file svg { color: var(--vscode-symbolIcon-fileForeground, var(--muted)); }
  .tree li.implied { color: var(--muted); }
  .tree.example li { color: var(--muted); font-style: italic; opacity: 0.8; }
  .tree li.tree-empty { justify-content: center; padding: 32px 12px; color: var(--muted); font-family: var(--vscode-font-family); white-space: normal; text-align: center; }
  .tree li.tree-empty:hover { background: none; }

  /* Action bar */
  .actions {
    position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px;
    padding: 12px 0 20px; background: var(--vscode-editor-background);
  }
  .actions .hint { color: var(--muted); }

  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    font-family: inherit; font-size: inherit; line-height: 1.4; padding: 4px 12px; white-space: nowrap;
    border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; cursor: pointer;
    color: var(--vscode-button-foreground); background: var(--vscode-button-background);
  }
  button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  button.primary { padding: 6px 20px; font-weight: 600; }
  .spin { width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; }
  .spin[hidden] { display: none; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Responsive */
  @media (max-width: 760px) {
    .cols { grid-template-columns: minmax(0, 1fr); }
    .editor { height: 36vh; min-height: 200px; }
    .tree { min-height: 0; max-height: 40vh; }
  }
  @media (max-width: 480px) {
    body { padding-top: 14px; }
    h1 { font-size: 1.25em; }
    header > div, .target { width: 100%; }
    .target code { flex: 1; }
    .syntax { flex-direction: column; }
    .actions .hint { display: none; }
    .actions button.primary { flex: 1; }
  }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Bulk File Creator</h1>
      <p class="sub">Type paths, one per line, and create them all at once. Missing folders are created.</p>
    </div>
    <div class="target" title="Target folder">
      ${ICONS.folder}<span class="lbl">Create in</span><code id="target">…</code>
      <button class="secondary" id="pick">Change…</button>
    </div>
  </header>

  <ul class="syntax">
    <li><code>src/app.ts</code> file</li>
    <li><code>src/assets/</code> empty folder</li>
    <li><code># note</code> ignored</li>
  </ul>

  <div class="cols">
    <section class="card">
      <div class="card-head">
        <h2>Paths</h2>
        <span class="badge dim" id="lines">0 lines</span>
      </div>
      <div class="editor">
        <pre class="gutter" id="gutter" aria-hidden="true"><span>1</span></pre>
        <textarea id="input" spellcheck="false" autofocus wrap="off" aria-label="Paths, one per line"></textarea>
      </div>
      <div class="empty-cta" id="emptyCta">
        <span>Not sure where to start?</span>
        <button class="secondary" id="example">Use Example</button>
      </div>
      <ul class="problems" id="problems" role="alert"></ul>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Preview</h2>
        <span class="badge" id="summary" hidden></span>
      </div>
      <ul class="tree" id="tree"></ul>
    </section>
  </div>

  <div class="actions">
    <button class="primary" id="create" disabled><span class="spin" id="spin" hidden></span><span id="createLabel">Create</span></button>
    <span class="hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
  </div>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const input = $('input'), create = $('create'), gutter = $('gutter');
  const EXAMPLE = ${JSON.stringify(EXAMPLE)};
  const ICONS = ${JSON.stringify(ICONS)};
  let valid = false, busy = false, timer, errLines = new Set();

  input.value = (vscode.getState() || {}).text || '';
  const send = (type) => vscode.postMessage({ type, text: input.value });
  const isEmpty = () => input.value.trim() === '';

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

  function renderGutter() {
    const lines = input.value.split('\\n');
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= lines.length; i++) frag.appendChild(el('span', errLines.has(i) ? 'err' : '', String(i)));
    gutter.replaceChildren(frag);
    gutter.scrollTop = input.scrollTop;
    $('lines').textContent = plural(lines.filter((l) => l.trim()).length, 'line');
  }

  function syncLocal() {
    $('emptyCta').hidden = !isEmpty();
    renderGutter();
  }

  function setText(text) {
    input.value = text;
    vscode.setState({ text });
    syncLocal();
    send('change');
    input.focus();
  }

  input.addEventListener('input', () => {
    vscode.setState({ text: input.value });
    syncLocal();
    clearTimeout(timer);
    timer = setTimeout(() => send('change'), 120);
  });
  input.addEventListener('scroll', () => { gutter.scrollTop = input.scrollTop; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (valid && !busy) send('create'); }
  });
  $('example').addEventListener('click', () => setText(EXAMPLE.join('\\n') + '\\n'));
  create.addEventListener('click', () => send('create'));
  $('pick').addEventListener('click', () => vscode.postMessage({ type: 'pickFolder' }));

  /** Turn flat entries into tree rows (folders first, then A-Z), including implied parent folders. */
  function treeRows(entries) {
    const root = { children: new Map() };
    for (const e of entries) {
      const parts = e.path.split('/');
      let node = root;
      parts.forEach((part, i) => {
        const last = i === parts.length - 1;
        const key = part.toLowerCase();
        let child = node.children.get(key);
        if (!child) {
          child = { name: part, kind: last ? e.kind : 'folder', explicit: false, children: new Map() };
          node.children.set(key, child);
        }
        if (last) child.explicit = true;
        node = child;
      });
    }
    const rows = [];
    const walk = (node, depth) => {
      const kids = [...node.children.values()].sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1);
      for (const k of kids) { rows.push({ name: k.name, kind: k.kind, explicit: k.explicit, depth }); walk(k, depth + 1); }
    };
    walk(root, 0);
    return rows;
  }

  function renderTree(entries, example) {
    const tree = $('tree');
    tree.classList.toggle('example', example);
    if (!entries.length) {
      tree.replaceChildren(el('li', 'tree-empty', 'Nothing to create yet.'));
      return;
    }
    tree.replaceChildren(...treeRows(entries).map((r) => {
      const li = el('li', r.kind + (r.explicit ? '' : ' implied'));
      li.style.paddingLeft = (12 + r.depth * 16) + 'px';
      li.insertAdjacentHTML('beforeend', ICONS[r.kind]);
      li.appendChild(el('span', 'name', r.name + (r.kind === 'folder' ? '/' : '')));
      if (!r.explicit) li.title = 'Parent folder (created if missing)';
      return li;
    }));
  }

  function problemItem(text) {
    const li = el('li');
    li.insertAdjacentHTML('beforeend', ICONS.error);
    li.appendChild(el('span', '', text));
    return li;
  }

  window.addEventListener('message', ({ data }) => {
    if (data.type === 'target') { $('target').textContent = data.label; $('target').title = data.label; }
    if (data.type === 'busy') {
      busy = data.busy;
      create.disabled = busy || !valid;
      $('spin').hidden = !busy;
    }
    if (data.type === 'error') $('problems').replaceChildren(problemItem(data.message));
    if (data.type === 'created') setText('');
    if (data.type === 'preview') {
      const { entries, problems } = data;
      const example = !entries.length && isEmpty();
      const files = entries.filter((e) => e.kind === 'file').length;
      const folders = entries.length - files;

      const summary = $('summary');
      summary.hidden = !entries.length && !example;
      summary.className = example ? 'badge dim' : 'badge';
      summary.textContent = example
        ? 'Example'
        : [files && plural(files, 'file'), folders && plural(folders, 'folder')].filter(Boolean).join(' · ');
      renderTree(example
        ? EXAMPLE.map((p) => ({ path: p.replace(/\\/$/, ''), kind: p.endsWith('/') ? 'folder' : 'file' }))
        : entries, example);

      errLines = new Set(problems.map((p) => p.line));
      $('problems').replaceChildren(...problems.map((p) => problemItem('Line ' + p.line + ': ' + p.message)));
      renderGutter();

      valid = entries.length > 0 && problems.length === 0;
      create.disabled = busy || !valid;
      $('createLabel').textContent = valid ? 'Create ' + plural(entries.length, 'item') : 'Create';
    }
  });

  syncLocal();
  send('change');
</script>
</body>
</html>`;
}
