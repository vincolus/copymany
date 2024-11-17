import * as fs from 'fs/promises';
import micromatch from 'micromatch';
import * as path from 'path';
import * as vscode from 'vscode';
import defaultIgnorePatterns from './ignores.json'; // Importieren der ignores.json zur Compile-Zeit

export function activate(context: vscode.ExtensionContext) {
  const copyFilesWithPaths = vscode.commands.registerCommand(
    'copymany.copyFilesWithPaths',
    async (...args: any[]) => {
      console.log('Befehl "copyFilesWithPaths" aktiviert.');
      console.log('Übergebene Argumente:', args);

      let uris: vscode.Uri[] = [];

      if (args.length > 1 && Array.isArray(args[1])) {
        // Wenn das Kommando vom Kontextmenü mit mehreren Auswahlen aufgerufen wurde
        uris = args[1];
        console.log('URIs aus context menu:', uris.map(uri => uri.fsPath));
      } else if (args.length === 1 && args[0] instanceof vscode.Uri) {
        // Wenn das Kommando über eine einzelne Datei oder Ordner aufgerufen wurde
        uris = [args[0]];
        console.log('Single URI:', uris[0].fsPath);
      } else {
        // Falls keine oder unerwartete Eingaben übergeben wurden, öffne den Dialog zur Dateiauswahl
        const selectedUris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          canSelectFolders: true,
          openLabel: 'Select Files and Folders',
          filters: {
            'All Files': ['*']
          }
        });
        if (selectedUris) {
          uris = selectedUris;
          console.log('URIs aus Dialog:', uris.map(uri => uri.fsPath));
        }
      }

      if (uris.length === 0) {
        vscode.window.showInformationMessage('Keine Dateien oder Ordner ausgewählt!');
        return;
      }

      try {
        // Sammeln Sie alle Dateien, einschließlich derjenigen in ausgewählten Ordnern
        const allFileUris = await collectAllFiles(uris);
        console.log('Gesammelte Dateien:', allFileUris.map(uri => uri.fsPath));

        if (allFileUris.length === 0) {
          vscode.window.showInformationMessage('Keine Dateien zum Kopieren gefunden!');
          return;
        }

        // Lesen Sie die Einstellungen aus der Konfiguration
        const config = vscode.workspace.getConfiguration('copymany');
        const whitelistPatterns: string[] = config.get('whitelistPatterns', []);
        const userIgnorePatterns: string[] = config.get('ignorePatterns', []);
        const ignorePatterns: string[] = [...defaultIgnorePatterns, ...userIgnorePatterns]; // Kombination aus Default und User-Patterns
        const maxFileSizeMB: number = config.get('maxFileSizeMB', 0.5);

        console.log('Whitelist-Muster:', whitelistPatterns);
        console.log('Ignoriermuster:', ignorePatterns);
        console.log('Maximale Dateigröße (MB):', maxFileSizeMB);

        // Filtern der Dateien basierend auf der Whitelist (falls vorhanden)
        let whitelistedUris = allFileUris;
        if (whitelistPatterns.length > 0) {
          whitelistedUris = filterUrisByPatterns(allFileUris, whitelistPatterns, true);
          console.log('Dateien nach Whitelist gefiltert:', whitelistedUris.map(uri => uri.fsPath));

          if (whitelistedUris.length === 0) {
            vscode.window.showInformationMessage('Keine Dateien entsprechen den Whitelist-Mustern!');
            return;
          }
        }

        // Filtern der Dateien basierend auf der Blacklist (Ignoriermuster)
        const validFileUris = filterUrisByPatterns(whitelistedUris, ignorePatterns, false);
        console.log('Dateien nach Ignoriermustern gefiltert:', validFileUris.map(uri => uri.fsPath));

        if (validFileUris.length === 0) {
          vscode.window.showInformationMessage('Keine gültigen Dateien zum Kopieren gefunden!');
          return;
        }

        // Progress-Indicator hinzufügen
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Copying Files with Paths",
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 0, message: "Überprüfe Dateien..." });

          // Überprüfen Sie die Existenz und Größe jeder Datei
          const existingUris = await Promise.all(
            validFileUris.map(async (uri, index) => {
              try {
                const stats = await fs.stat(uri.fsPath);
                const fileSizeMB = stats.size / (1024 * 1024);
                if (fileSizeMB <= maxFileSizeMB) {
                  progress.report({ increment: (index / validFileUris.length) * 50, message: `Überprüfe: ${uri.fsPath}` });
                  return uri;
                } else {
                  console.log(`Datei übersprungen (Größe ${fileSizeMB.toFixed(2)} MB überschreitet das Maximum von ${maxFileSizeMB} MB): ${uri.fsPath}`);
                  return null;
                }
              } catch {
                vscode.window.showErrorMessage(`Datei existiert nicht oder ist nicht zugänglich: ${uri.fsPath}`);
                console.error(`Datei existiert nicht oder ist nicht zugänglich: ${uri.fsPath}`);
                return null;
              }
            })
          );

          // Filtern Sie nicht existierende oder zu große Dateien heraus
          const finalValidUris = existingUris.filter(uri => uri !== null) as vscode.Uri[];

          if (finalValidUris.length === 0) {
            vscode.window.showInformationMessage('Keine gültigen Dateien zum Kopieren gefunden!');
            return;
          }

          progress.report({ increment: 50, message: "Lese Dateien..." });

          // Paralleles Lesen der Dateien
          const formattedContents = await Promise.all(
            finalValidUris.map(async (uri, index) => {
              try {
                const fileContent = await fs.readFile(uri.fsPath, 'utf-8');
                progress.report({ increment: (index / finalValidUris.length) * 50, message: `Lese: ${uri.fsPath}` });
                return formatFileContent(uri.fsPath, fileContent);
              } catch (error: any) {
                const errorMessage = `Fehler beim Lesen der Datei: ${uri.fsPath}\n${error.message}`;
                vscode.window.showErrorMessage(errorMessage);
                console.error(errorMessage);
                return ''; // Leere Zeichenkette bei Fehler
              }
            })
          );

          // Filter leere Inhalte heraus (Fehler beim Lesen)
          const textToCopy = formattedContents.filter(content => content).join('\n\n');
          if (textToCopy) {
            await vscode.env.clipboard.writeText(textToCopy);
            vscode.window.showInformationMessage('Dateien mit Pfaden erfolgreich kopiert!');
            console.log('Inhalte erfolgreich in die Zwischenablage kopiert.');
          } else {
            vscode.window.showInformationMessage('Keine Inhalte zum Kopieren vorhanden.');
          }
        });
      } catch (error: any) {
        const errorMessage = 'Fehler beim Verarbeiten der Dateien: ' + error.message;
        vscode.window.showErrorMessage(errorMessage);
        console.error(errorMessage);
      }
    }
  );

  context.subscriptions.push(copyFilesWithPaths);
}

/**
 * Recursively collects all file URIs from the provided URIs.
 * @param uris An array of file or folder URIs.
 * @returns A promise that resolves to an array of file URIs.
 */
async function collectAllFiles(uris: vscode.Uri[]): Promise<vscode.Uri[]> {
  const fileUris: vscode.Uri[] = [];

  for (const uri of uris) {
    try {
      const stats = await fs.stat(uri.fsPath);
      if (stats.isFile()) {
        fileUris.push(uri);
      } else if (stats.isDirectory()) {
        const subUris = await vscode.workspace.findFiles(new vscode.RelativePattern(uri, '**/*'), undefined, Infinity, undefined);
        fileUris.push(...subUris);
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Fehler beim Zugriff auf URI: ${uri.fsPath}\n${error.message}`);
      console.error(`Fehler beim Zugriff auf URI: ${uri.fsPath}`, error);
    }
  }

  return fileUris;
}

/**
 * Filters URIs based on given patterns.
 * @param uris An array of URIs to filter.
 * @param patterns Glob patterns to match against.
 * @param include If true, includes URIs matching the patterns; if false, excludes them.
 * @returns An array of filtered URIs.
 */
function filterUrisByPatterns(uris: vscode.Uri[], patterns: string[], include: boolean): vscode.Uri[] {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  return uris.filter(uri => {
    const relativePath = path.relative(workspaceFolder, uri.fsPath);
    const isMatch = micromatch.isMatch(relativePath, patterns, { dot: true, matchBase: true });
    return include ? isMatch : !isMatch;
  });
}

/**
 * Formatiert den Inhalt einer Datei mit ihrem relativen Pfad.
 * @param filePath Der absolute Pfad zur Datei.
 * @param fileContent Der Inhalt der Datei.
 * @returns Ein formatierter String mit dem Dateipfad und -inhalt.
 */
function formatFileContent(filePath: string, fileContent: string): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const relativePath = path.relative(workspaceFolder, filePath);
  return `=== START OF FILE: ${relativePath} ===\n${fileContent}\n=== END OF FILE: ${relativePath} ===`;
}

export function deactivate() {}
