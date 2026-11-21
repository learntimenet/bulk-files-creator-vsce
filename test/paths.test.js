const test = require('node:test');
const assert = require('node:assert/strict');
const { safeRelativePath, parsePathList } = require('../dist/paths');

test('safeRelativePath blocks escapes and absolute paths', () => {
  assert.equal(safeRelativePath('a\\b//./c'), 'a/b/c');
  assert.throws(() => safeRelativePath('../x'), /\.\./);
  assert.throws(() => safeRelativePath('/etc/x'), /relative/);
  assert.throws(() => safeRelativePath('C:\\x'), /relative/);
});

test('parsePathList reads files, folders, blanks and comments', () => {
  const { entries, problems } = parsePathList(
    'src/components/header/Header.tsx\r\n\n  # layout\nsrc\\pages\\home\\HomePage.tsx  \nsrc/assets/\nsrc\\styles\\\n',
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(entries, [
    { path: 'src/components/header/Header.tsx', kind: 'file' },
    { path: 'src/pages/home/HomePage.tsx', kind: 'file' },
    { path: 'src/assets', kind: 'folder' },
    { path: 'src/styles', kind: 'folder' },
  ]);
});

test('parsePathList reports bad, duplicate and conflicting lines', () => {
  const { entries, problems } = parsePathList('a/B.ts\n../x.ts\na/b.ts\nlib\nlib/util.ts\n/abs');
  assert.deepEqual(entries.map((e) => e.path), ['a/B.ts', 'lib', 'lib/util.ts']);
  assert.deepEqual(problems.map((p) => p.line), [2, 3, 4, 6]);
  assert.match(problems[1].message, /Duplicate of line 1/);
  assert.match(problems[2].message, /is a file/);
});
