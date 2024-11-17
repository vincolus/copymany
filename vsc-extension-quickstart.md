# 🚀 Welcome to Your VS Code Extension

## 📂 What's in the folder

- **`package.json`**  
  The manifest file where you declare your extension and command.

  - Registers a command with a title and command name, enabling it in the command palette.
  - It doesn't load the plugin yet, just declares it.

- **`src/extension.ts`**  
  The main file where the implementation of your command lives.
  - Exports the `activate` function, called when your extension is first activated (e.g., by executing the command).
  - Calls `registerCommand` to tie the command to its implementation.

---

## 🚀 Get Up and Running Immediately

1. **Press `F5`** to open a new window with your extension loaded.
2. **Run your command** from the command palette:
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac).
   - Type `Hello World`.
3. **Set breakpoints** in `src/extension.ts` to debug your extension.
4. **Check the debug console** for output from your extension.

---

## 📄 Adding commands

Add commands to your `package.json` like this:

    {
      "activationEvents": [
        "onCommand:copymany.copyContentsAll",
        "..."
      ],
      "contributes": {
        "commands": [
          {
            "command": "copymany.showTypeInfo",
            "title": "CC: Show Type Info"
          },
          {
            ...
          }
        ]
      }
    }

This configuration:

- Defines when the extension activates using `activationEvents`
- Specifies commands that trigger the extension
- Registers a command with ID `copymany.showTypeInfo`
- Sets a user-friendly command title with "CC:" prefix
- Links to the implementation in your `extension.ts` file

---

## 🛠️ Make Changes

- **Relauch the extension**: After editing `src/extension.ts`, restart the extension from the debug toolbar.
- **Reload VS Code**: Press `Ctrl+R` or `Cmd+R` (Mac) to load the changes.

---

## 🔍 Explore the API

- Open the file `node_modules/@types/vscode/index.d.ts` to explore the full API.

---

## 🧪 Run Tests

1. Open the debug viewlet: `Ctrl+Shift+D` or `Cmd+Shift+D` (Mac).
2. Select **`Extension Tests`** from the launch configuration dropdown.
3. Press `F5` to run tests in a new window with your extension loaded.
4. View the test results in the debug console.
5. Modify or create tests in `src/test/suite/extension.test.ts` or the `test/suite` folder.
   - The test runner looks for files matching the `**.test.ts` pattern.

---

## 🚀 Go Further

- **Bundle your extension** to reduce size and improve startup time: [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
- **Publish your extension** on the VS Code marketplace: [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
- **Automate builds** with [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).

---

## 📦 [vsce](#vsce)

**vsce** is a command-line tool for packaging, publishing, and managing VS Code extensions.

### ⚙️ Installation

- Make sure you have [Node.js](https://nodejs.org/) installed.
- Run the following to install `vsce` globally:

  `npm install -g @vscode/vsce`

### 🔧 Usage

- Package and publish your extension easily:

  1. Navigate to your extension folder:
     - `cd myExtension`
  2. Package your extension:
     - `vsce package`  
       This will generate `myExtension.vsix`.
  3. Publish your extension:
     - `vsce publish`  
       This will publish `<publisher id>.myExtension` to the VS Code Marketplace.

- `vsce` also supports searching, retrieving metadata, and unpublishing extensions. Run `vsce --help` for a list of all available commands.

---

## 📤 Publishing Extensions

---

**Note**: Due to security concerns, `vsce` will not publish extensions containing user-provided SVG images.

### Publishing Constraints:

- **Icon in `package.json`** cannot be an SVG.
- **Badges** in `package.json` must not be SVGs unless they're from trusted badge providers.
- **Image URLs** in `README.md` and `CHANGELOG.md` must use HTTPS.
- **Images in `README.md` and `CHANGELOG.md`** must not be SVGs unless from trusted badge providers.

---

Stay productive with your extension development! ✨
