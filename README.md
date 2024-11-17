# CopyMany

This extension allows you to easily copy the contents of selected files directly from the Visual Studio Code project pane to the clipboard, with an option to prepend file paths for better context. 
It intelligently handles both files and folders, making it a versatile tool for developers.

[CopyMany - Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=vincolus.copymany)

## Features

- **Copy File(s) + Path(s)**: Copy the contents of selected files with their file paths prepended for reference.
- Right-click to quickly access the action from the context menu.
- Supports multiple file selections in the explorer pane for batch copying.
- **Recursive Folder Handling**: If a folder is selected, the extension recursively processes all files within it, respecting your configuration for included and excluded patterns.
- Automatically detects whether the selection is a binary, a text-file or a folder and handles it accordingly.
- Customizable settings for including or excluding files and folders during copying.

## Installation

1. Open **VS Code**.
2. Go to the **Extensions** view by pressing `Ctrl+Shift+X`.
3. Search for "CopyMany".
4. Click **Install**.

## Usage

### Copy Contents of Files or Folders

1. In the **Explorer** (Project pane), select one or more files or folders.
2. Right-click on the selected files or folders.
3. Choose **"Copy File(s) + Path(s)"**:
   - For files: The content of the file(s) will be copied along with their paths.
   - For folders: The extension will recursively process all files in the folder, copying their content and paths based on your configuration.

### Configuration Settings

The extension provides configuration options for fine-grained control over which files and folders are included or excluded during the copying process:

- **`copymany.ignorePatterns`**:
  - **Type**: Array of strings.
  - **Default**: Includes common files and directories such as `node_modules/`, temporary files, and binary formats.
  - **Description**: Specifies glob patterns to ignore during copying. Supports wildcards like `*.pyc` and directories like `node_modules/`.

- **`copymany.whitelistPatterns`**:
  - **Type**: Array of strings.
  - **Default**: Empty array.
  - **Description**: Specifies glob patterns to include when copying files and folders. If set, only files matching these patterns will be considered.

## Contributing

Contributions are welcome! If you'd like to help improve this extension, please fork the repository and submit a pull request.

## License

This extension is licensed under the **MIT License**.
