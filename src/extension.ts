// src/extension.ts
import * as fs from "fs/promises";
import ignore from "ignore";
import { isBinaryFile as checkIsBinaryFile } from "isbinaryfile";
import * as path from "path";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const copyFilesWithPaths = vscode.commands.registerCommand(
    "copymany.copyFilesWithPaths",
    async (...args: any[]) => {
      console.log('Befehl "copyFilesWithPaths" aktiviert.');
      console.log("Übergebene Argumente:", args);

      let uris: vscode.Uri[] = [];

      if (args.length > 0) {
        if (Array.isArray(args) && args.every(arg => arg instanceof vscode.Uri)) {
          // Mehrfachauswahl aus dem Explorer oder SCM
          uris = args as vscode.Uri[];
          console.log("Mehrfachauswahl erkannt:", uris.map(uri => uri.fsPath));
        } else if (args.length > 1 && Array.isArray(args[1])) {
          // Mehrfachauswahl aus Explorer-Kontextmenü
          uris = args[1];
          console.log("URIs aus Kontextmenü:", uris.map(uri => uri.fsPath));
        } else if (args.length >= 1 && args[0] instanceof vscode.Uri) {
          // Einzelne Datei oder Ordner aus verschiedenen Kontexten (z.B. Editor-Titel)
          uris = [args[0]];
          console.log("Einzelner URI aus Argumenten:", uris[0].fsPath);
        } else {
          // Keine oder unbekannte Eingabe, öffne Dateiauswahl-Dialog
          console.log("Keine gültigen Eingaben erkannt, öffne Dialog...");
        }
      }

      // Fallback: Öffnen des Dateiauswahl-Dialogs
      if (uris.length === 0) {
        const selectedUris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          canSelectFolders: true,
          openLabel: "Select Files and Folders",
          filters: { "All Files": ["*"] },
        });
        if (selectedUris) {
          uris = selectedUris;
          console.log("URIs aus Dialog:", uris.map(uri => uri.fsPath));
        }
      }

      // **Zusätzliche Logik für den Editor-Kontext**
      if (uris.length === 0 && args.length === 2) {
        // Vermutlich aus dem Editor-Kontextmenü aufgerufen
        // Sammle alle geöffneten Editor-Tabs
        const visibleEditors = vscode.window.visibleTextEditors;
        uris = visibleEditors.map(editor => editor.document.uri);
        console.log("Verarbeite alle offenen Editor-Tabs:", uris.map(uri => uri.fsPath));
      }

      if (uris.length === 0) {
        vscode.window.showInformationMessage(
          "Keine Dateien oder Ordner ausgewählt!"
        );
        return;
      }

      try {
        // Sammeln aller Dateien (inkl. rekursiv in Ordnern)
        const allFileUris = await collectAllFiles(uris);
        console.log("Gesammelte Dateien:", allFileUris.map(uri => uri.fsPath));

        if (allFileUris.length === 0) {
          vscode.window.showInformationMessage("Keine Dateien zum Kopieren gefunden!");
          return;
        }

        // Einstellungen lesen
        const config = vscode.workspace.getConfiguration("copymany");
        const whitelistPatterns: string[] = config.get("whitelistPatterns", []);
        const ignorePatterns: string[] = config.get("ignorePatterns", []);
        const maxFileSizeMB: number = config.get("maxFileSizeMB", 0.5);

        console.log("Whitelist-Muster:", whitelistPatterns);
        console.log("Ignoriermuster:", ignorePatterns);
        console.log("Maximale Dateigröße (MB):", maxFileSizeMB);

        // Whitelist-Filter anwenden (falls definiert)
        let whitelistedUris = allFileUris;
        if (whitelistPatterns.length > 0) {
          whitelistedUris = filterUrisByPatterns(allFileUris, whitelistPatterns, true);
          console.log(
            "Nach Whitelist gefilterte Dateien:",
            whitelistedUris.map(uri => uri.fsPath)
          );

          if (whitelistedUris.length === 0) {
            vscode.window.showInformationMessage(
              "Keine Dateien entsprechen den Whitelist-Mustern!"
            );
            return;
          }
        }

        // Blacklist-Filter anwenden
        const validFileUris = filterUrisByPatterns(whitelistedUris, ignorePatterns, false);
        console.log(
          "Nach Ignoriermustern gefilterte Dateien:",
          validFileUris.map(uri => uri.fsPath)
        );

        if (validFileUris.length === 0) {
          vscode.window.showInformationMessage(
            "Keine gültigen Dateien zum Kopieren gefunden!"
          );
          return;
        }

        // Mit Fortschrittsanzeige Dateien verarbeiten
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Copying Files with Paths",
            cancellable: false,
          },
          async (progress) => {
            progress.report({ increment: 0, message: "Überprüfe Dateien..." });

            // Dateiüberprüfung (Existenz, Größe, Binärstatus)
            const existingUris = await Promise.all(
              validFileUris.map(async (uri, index) => {
                try {
                  const stats = await fs.stat(uri.fsPath);
                  const fileSizeMB = stats.size / (1024 * 1024);
                  if (fileSizeMB > maxFileSizeMB) {
                    console.log(
                      `Überspringen: ${uri.fsPath} (Größe ${fileSizeMB.toFixed(2)} MB > ${maxFileSizeMB} MB)`
                    );
                    return null;
                  }

                  const binary = await isBinaryFile(uri.fsPath);
                  if (binary) {
                    console.log(`Überspringen (Binärdatei): ${uri.fsPath}`);
                    return null;
                  }

                  progress.report({
                    increment: (index / validFileUris.length) * 50,
                    message: `Überprüfe: ${uri.fsPath}`,
                  });
                  return uri;
                } catch (error: any) {
                  console.error(`Fehler bei Datei: ${uri.fsPath}`, error);
                  return null;
                }
              })
            );

            // Nicht gültige Dateien entfernen
            const finalValidUris = existingUris.filter(uri => uri !== null) as vscode.Uri[];

            if (finalValidUris.length === 0) {
              vscode.window.showInformationMessage(
                "Keine gültigen Dateien zum Kopieren gefunden!"
              );
              return;
            }

            progress.report({ increment: 50, message: "Lese Dateien..." });

            // Dateien lesen und formatieren
            const formattedContents = await Promise.all(
              finalValidUris.map(async (uri, index) => {
                try {
                  const content = await fs.readFile(uri.fsPath, "utf-8");
                  progress.report({
                    increment: (index / finalValidUris.length) * 50,
                    message: `Lese: ${uri.fsPath}`,
                  });
                  return formatFileContent(uri.fsPath, content);
                } catch (error: any) {
                  console.error(`Fehler beim Lesen von: ${uri.fsPath}`, error);
                  return "";
                }
              })
            );

            const textToCopy = formattedContents.filter(Boolean).join("\n\n");
            if (textToCopy) {
              await vscode.env.clipboard.writeText(textToCopy);
              const numfiles = finalValidUris.length;
              vscode.window.showInformationMessage(
                numfiles + " Dateien mit Pfaden erfolgreich kopiert!"
              );
            } else {
              vscode.window.showInformationMessage(
                "Keine Inhalte zum Kopieren vorhanden."
              );
            }
          }
        );
      } catch (error: any) {
        console.error("Fehler beim Kopieren der Dateien:", error);
        vscode.window.showErrorMessage("Fehler: " + error.message);
      }
    }
  );

  const copyAllOpenEditors = vscode.commands.registerCommand(
    "copymany.copyAllOpenEditors",
    async () => {
      const tabGroups = vscode.window.tabGroups.all;
      const uris: vscode.Uri[] = [];
  
      for (const group of tabGroups) {
        for (const tab of group.tabs) {
          // Type-safe check with type assertion
          if (tab.input && typeof tab.input === 'object') {
            // Try to extract URI from different possible input types
            let uri: vscode.Uri | undefined;
  
            // Check for TextDocument
            if ('document' in tab.input) {
              uri = (tab.input as { document: { uri: vscode.Uri } }).document.uri;
            }
            
            // Check for direct URI
            if (!uri && 'uri' in tab.input) {
              uri = (tab.input as { uri: vscode.Uri }).uri;
            }
  
            // Additional checks for other potential input types
            if (!uri && 'resourceUri' in tab.input) {
              uri = (tab.input as { resourceUri: vscode.Uri }).resourceUri;
            }
  
            if (uri) {
              uris.push(uri);
              console.log("Found URI:", uri.fsPath);
            }
          }
        }
      }
  
      console.log("Total URIs found:", uris.length);
      console.log("URI paths:", uris.map(uri => uri.fsPath));
  
      if (uris.length === 0) {
        vscode.window.showInformationMessage("Keine offenen Dateien zum Kopieren gefunden!");
        return;
      }
  
      await processUris(uris);
    }
  );
  
  

  context.subscriptions.push(copyFilesWithPaths, copyAllOpenEditors);
  // context.subscriptions.push(copyFilesWithPaths);
}

// Gemeinsame Logik auslagern
async function processUris(uris: vscode.Uri[]) {
  try {
    // Sammeln aller Dateien (inkl. rekursiv in Ordnern)
    const allFileUris = await collectAllFiles(uris);
    console.log("Gesammelte Dateien:", allFileUris.map(uri => uri.fsPath));

    if (allFileUris.length === 0) {
      vscode.window.showInformationMessage("Keine Dateien zum Kopieren gefunden!");
      return;
    }

    // Einstellungen lesen
    const config = vscode.workspace.getConfiguration("copymany");
    const whitelistPatterns: string[] = config.get("whitelistPatterns", []);
    const ignorePatterns: string[] = config.get("ignorePatterns", []);
    const maxFileSizeMB: number = config.get("maxFileSizeMB", 0.5);

    console.log("Whitelist-Muster:", whitelistPatterns);
    console.log("Ignoriermuster:", ignorePatterns);
    console.log("Maximale Dateigröße (MB):", maxFileSizeMB);

    // Whitelist-Filter anwenden (falls definiert)
    let whitelistedUris = allFileUris;
    if (whitelistPatterns.length > 0) {
      whitelistedUris = filterUrisByPatterns(allFileUris, whitelistPatterns, true);
      console.log(
        "Nach Whitelist gefilterte Dateien:",
        whitelistedUris.map(uri => uri.fsPath)
      );

      if (whitelistedUris.length === 0) {
        vscode.window.showInformationMessage(
          "Keine Dateien entsprechen den Whitelist-Mustern!"
        );
        return;
      }
    }

    // Blacklist-Filter anwenden
    const validFileUris = filterUrisByPatterns(whitelistedUris, ignorePatterns, false);
    console.log(
      "Nach Ignoriermustern gefilterte Dateien:",
      validFileUris.map(uri => uri.fsPath)
    );

    if (validFileUris.length === 0) {
      vscode.window.showInformationMessage(
        "Keine gültigen Dateien zum Kopieren gefunden!"
      );
      return;
    }

    // Mit Fortschrittsanzeige Dateien verarbeiten
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Copying Files with Paths",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0, message: "Überprüfe Dateien..." });

        // Dateiüberprüfung (Existenz, Größe, Binärstatus)
        const existingUris = await Promise.all(
          validFileUris.map(async (uri, index) => {
            try {
              const stats = await fs.stat(uri.fsPath);
              const fileSizeMB = stats.size / (1024 * 1024);
              if (fileSizeMB > maxFileSizeMB) {
                console.log(
                  `Überspringen: ${uri.fsPath} (Größe ${fileSizeMB.toFixed(2)} MB > ${maxFileSizeMB} MB)`
                );
                return null;
              }

              const binary = await isBinaryFile(uri.fsPath);
              if (binary) {
                console.log(`Überspringen (Binärdatei): ${uri.fsPath}`);
                return null;
              }

              progress.report({
                increment: (index / validFileUris.length) * 50,
                message: `Überprüfe: ${uri.fsPath}`,
              });
              return uri;
            } catch (error: any) {
              console.error(`Fehler bei Datei: ${uri.fsPath}`, error);
              return null;
            }
          })
        );

        // Nicht gültige Dateien entfernen
        const finalValidUris = existingUris.filter(uri => uri !== null) as vscode.Uri[];

        if (finalValidUris.length === 0) {
          vscode.window.showInformationMessage(
            "Keine gültigen Dateien zum Kopieren gefunden!"
          );
          return;
        }

        progress.report({ increment: 50, message: "Lese Dateien..." });

        // Dateien lesen und formatieren
        const formattedContents = await Promise.all(
          finalValidUris.map(async (uri, index) => {
            try {
              const content = await fs.readFile(uri.fsPath, "utf-8");
              progress.report({
                increment: (index / finalValidUris.length) * 50,
                message: `Lese: ${uri.fsPath}`,
              });
              return formatFileContent(uri.fsPath, content);
            } catch (error: any) {
              console.error(`Fehler beim Lesen von: ${uri.fsPath}`, error);
              return "";
            }
          })
        );

        const textToCopy = formattedContents.filter(Boolean).join("\n\n");
        if (textToCopy) {
          await vscode.env.clipboard.writeText(textToCopy);
          const numfiles = finalValidUris.length;

          vscode.window.showInformationMessage(
            numfiles + " Dateien mit Pfaden erfolgreich kopiert!"
          );
        } else {
          vscode.window.showInformationMessage(
            "Keine Inhalte zum Kopieren vorhanden."
          );
        }
      }
    );
  } catch (error: any) {
    console.error("Fehler beim Kopieren der Dateien:", error);
    vscode.window.showErrorMessage("Fehler: " + error.message);
  }
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
        // Suche rekursiv nach allen Dateien in diesem Verzeichnis
        const subUris = await vscode.workspace.findFiles(
          new vscode.RelativePattern(uri, "**/*"),
          undefined,
          Infinity,
          undefined
        );
        fileUris.push(...subUris);
        console.log(
          `Gesammelte ${subUris.length} Dateien aus Verzeichnis: ${uri.fsPath}`
        );
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Fehler beim Zugriff auf URI: ${uri.fsPath}\n${error.message}`
      );
      console.error(`Fehler beim Zugriff auf URI: ${uri.fsPath}`, error);
    }
  }

  return fileUris;
}

/**
 * Filters URIs based on given patterns.
 * @param uris An array of URIs to filter.
 * @param patterns Glob patterns to match against.
 * @param isWhitelist If true, includes only URIs matching the patterns; if false, excludes URIs matching the patterns.
 * @returns An array of filtered URIs.
 */
function filterUrisByPatterns(
  uris: vscode.Uri[],
  patterns: string[],
  isWhitelist: boolean
): vscode.Uri[] {
  const workspaceFolder =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";

  // Initialisiere die ignore-Instanz mit den Mustern
  const ig = ignore().add(patterns);

  return uris.filter((uri) => {
    let relativePath = path
      .relative(workspaceFolder, uri.fsPath)
      .split(path.sep)
      .join("/");

    const isIgnored = ig.ignores(relativePath);

    // Debugging-Ausgabe
    console.log(
      `Datei: ${relativePath}, Ignored: ${isIgnored} (${isWhitelist ? "Include" : "Exclude"
      })`
    );

    // Wenn isWhitelist=false, dann nur Dateien einbeziehen, die NICHT den Ignore-Mustern entsprechen (isIgnored=false)
    if (isWhitelist) {
      return isIgnored;
    } else {
      return !isIgnored;
    }
  });
}

/**
 * Formatiert den Inhalt einer Datei mit ihrem relativen Pfad.
 * @param filePath Der absolute Pfad zur Datei.
 * @param fileContent Der Inhalt der Datei.
 * @returns Ein formatierter String mit dem Dateipfad und -inhalt.
 */
function formatFileContent(filePath: string, fileContent: string): string {
  const workspaceFolder =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  const relativePath = path
    .relative(workspaceFolder, filePath)
    .split(path.sep)
    .join("/");
  return `=== START OF FILE: ${relativePath} ===\n${fileContent}\n=== END OF FILE: ${relativePath} ===`;
}

/**
 * Überprüft, ob eine Datei binär ist.
 * @param filePath Der absolute Pfad zur Datei.
 * @returns True, wenn die Datei binär ist, sonst false.
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    return await checkIsBinaryFile(filePath);
  } catch (error) {
    console.error(
      `Fehler bei der Binärdatei-Überprüfung für ${filePath}:`,
      error
    );
    // Im Fehlerfall gehen wir davon aus, dass die Datei nicht binär ist, um den Prozess nicht zu unterbrechen
    return false;
  }
}

export function deactivate() { }
