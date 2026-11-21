# Bulk Files Creator

Type a list of paths, one per line, and create all the files and folders in one step. Missing folders are created for you.

## Usage

1. Right-click a folder (or a file) in the Explorer and choose **Bulk Create Files and Folders**, or run the same command from the Command Palette. From the Command Palette, files go in the workspace root; if you have several workspace folders (or none open), you are asked which folder to use.
2. Type your paths in the panel, or press **Use Example** while the list is empty to start from this one:

   ```text
   src/components/header/Header.tsx
   src/components/footer/Footer.tsx
   src/components/page-layout/PageLayout.tsx
   src/pages/home/HomePage.tsx
   src/pages/login/LoginPage.tsx
   ```

3. Press **Create** or Ctrl+Enter.

A notification confirms how many items were created, with an **Open First File** button that opens the first file beside the panel. The panel stays open and the list is cleared, ready for the next batch.

## Rules

- A line ending in `/` creates an empty folder. Every other line creates an empty file.
- Blank lines and lines starting with `#` are ignored.
- Paths must be relative and cannot contain `..`, so files are only created inside the target folder.
- Folders you type are created empty. Parent folders that a path needs are created too, if they don't exist yet.
- If some files already exist, you choose **Overwrite with Empty** or **Skip Existing**. If you cancel, nothing is written and your list stays in the panel.

## The panel

- **Create in** shows the target folder. Use **Change…** to pick a different one.
- The list has line numbers. Bad, duplicate or conflicting lines are listed under it with their line numbers, those numbers turn red, and **Create** stays disabled until you fix them.
- **Preview** shows what will be created as a folder tree, with a count of files and folders. Parent folders you didn't type are dimmed.
- The two columns stack into one on narrow panels.

## Development

```sh
npm install
npm test        # compile and run unit tests
npm run package # build the .vsix
```

Press F5 in VS Code to start an Extension Development Host.
