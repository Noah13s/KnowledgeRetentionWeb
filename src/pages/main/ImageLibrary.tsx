import React, { useEffect, useState } from "react";
import GridList from "../../components/GridList";
import { Filesystem, Directory } from '@capacitor/filesystem';
import './ImageLibrary.css';
import { Capacitor } from '@capacitor/core';
import { usePersistentState } from '../../lib/usePersistentState';
import { SocialLogin } from '@capgo/capacitor-social-login';
import JSZip from 'jszip';

export type GridItem = {
    id: string;
    title: string;
    path: string;
    type: "file" | "directory";
    image?: string;
};

interface ImageLibraryProps {
    mode?: 'browse' | 'picker';
    onPick?: (imagePath: string) => void;
    onCancel?: () => void;
}

// ---- Configure these for your project ----
const GOOGLE_WEB_CLIENT_ID = "530291476755-2kru5go0d5ic6tkcuum6e3n1v5hef2ke.apps.googleusercontent.com";
const GOOGLE_DRIVE_FILE_ID = "1idh6hNWI3I5r4CyGQsPyVrFp4sm0nmM1";
// -------------------------------------------

let socialLoginInitialized = false;

async function ensureSocialLoginInitialized() {
    if (socialLoginInitialized) return;
    await SocialLogin.initialize({
        google: {
            webClientId: GOOGLE_WEB_CLIENT_ID,
            mode: 'online',
        },
    });
    socialLoginInitialized = true;
}

async function getGoogleAccessToken(): Promise<string> {
    await ensureSocialLoginInitialized();
    const result = await SocialLogin.login({
        provider: 'google',
        options: {
            scopes: [
                'profile',
                'email',
                'https://www.googleapis.com/auth/drive',
            ],
            style: 'bottom',
            filterByAuthorizedAccounts: false,
        },
    });
    const token = (result as any)?.result?.accessToken?.token;
    if (!token) {
        throw new Error("Couldn't get a Google access token. Please sign in again.");
    }
    return token;
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const binaryString = atob(base64);
    const buffer = new ArrayBuffer(binaryString.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function downloadZipFromDrive(accessToken: string): Promise<ArrayBuffer> {
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${GOOGLE_DRIVE_FILE_ID}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
        throw new Error(`Drive download failed (${response.status}): ${await response.text()}`);
    }
    return response.arrayBuffer();
}

async function uploadZipToDrive(accessToken: string, base64Zip: string): Promise<void> {
    const bytes = base64ToUint8Array(base64Zip);
    const blob = new Blob([bytes], { type: "application/zip" });
    const response = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${GOOGLE_DRIVE_FILE_ID}?uploadType=media`,
        {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/zip',
            },
            body: blob,
        }
    );
    if (!response.ok) {
        throw new Error(`Drive upload failed (${response.status}): ${await response.text()}`);
    }
}

// Recursively reads a directory under Directory.External and returns
// every file found, with paths relative to the External root.
async function readDirRecursive(path: string): Promise<{ path: string; data: string }[]> {
    const collected: { path: string; data: string }[] = [];
    let dir;
    try {
        dir = await Filesystem.readdir({ path, directory: Directory.External });
    } catch (e) {
        console.warn(`Skipping "${path}" (not found):`, e);
        return collected;
    }
    for (const entry of dir.files) {
        const entryPath = `${path}/${entry.name}`;
        if (entry.type === "directory") {
            collected.push(...(await readDirRecursive(entryPath)));
        } else {
            const fileRes = await Filesystem.readFile({ path: entryPath, directory: Directory.External });
            collected.push({ path: entryPath, data: fileRes.data as string });
        }
    }
    return collected;
}

export default function ImagePage({ mode = 'browse', onPick, onCancel }: ImageLibraryProps) {
    const isPickerMode = mode === 'picker';
    const [items, setItems] = usePersistentState<GridItem[]>('imageLibrary.items', []);
    const [currentPath, setCurrentPath] = usePersistentState<string>('imageLibrary.currentPath', "images");
    const [isSelectionMode, setIsSelectionMode] = usePersistentState<boolean>('imageLibrary.isSelectionMode', false);
    const [selectedPaths, setSelectedPaths] = usePersistentState<string[]>('imageLibrary.selectedPaths', []);
    // Picker's picked file is intentionally NOT persisted globally — it's tied
    // to one picking session (see reset in handlePickerCancel/handlePickerOpen)
    const [pickedPath, setPickedPath] = usePersistentState<string | null>('imageLibrary.pickedPath', null);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    useEffect(() => {
        loadImages();
    }, [currentPath]);

    async function loadImages() {
        try {
            const result = await Filesystem.readdir({
                path: currentPath,
                directory: Directory.External,
            });
            const mappedItems: GridItem[] = await Promise.all(
                result.files.map(async (file, index) => {
                    let image: string | undefined = undefined;
                    if (file.type === "file" && file.uri) {
                        image = Capacitor.convertFileSrc(file.uri);
                    }
                    return {
                        id: String(index),
                        title: file.name,
                        path: file.uri ?? file.name,
                        type: file.type === "directory" ? "directory" : "file",
                        image,
                    };
                })
            );
            setItems(mappedItems);
        } catch (e) {
            console.error("Failed to load directory:", e);
        }
    }

    async function createFolder() {
        try {
            const folderName = window.prompt("Enter a new name:");
            if (!folderName) return;
            const targetPath = `${currentPath}/${folderName}`;
            console.log("Creating folder at:", targetPath);
            await Filesystem.mkdir({
                path: targetPath,
                directory: Directory.External,
                recursive: true
            });
            await loadImages();
        } catch (e) {
            console.error(e);
        }
    }

    async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = (reader.result as string).split(",")[1];
            await Filesystem.writeFile({
                path: `${currentPath}/${file.name}`,
                directory: Directory.External,
                data: base64,
            });
            await loadImages();
        };
        reader.readAsDataURL(file);
    }

    function handleItemLongPress(item: GridItem) {
        if (isPickerMode) return; // no multi-select long-press in picker mode
        if (!isSelectionMode) {
            setIsSelectionMode(true);
            setSelectedPaths([item.path]);
        }
    }

    function handleItemClick(item: GridItem) {
        if (isPickerMode) {
            if (item.type === "directory") {
                setCurrentPath(`${currentPath}/${item.title}`);
                setPickedPath(null);
            } else {
                setPickedPath((prev) => (prev === item.path ? null : item.path));
            }
            return;
        }
        if (isSelectionMode) {
            setSelectedPaths(prev => {
                if (prev.includes(item.path)) {
                    return prev.filter(p => p !== item.path);
                } else {
                    return [...prev, item.path];
                }
            });
        } else {
            if (item.type === "directory") {
                setCurrentPath(`${currentPath}/${item.title}`);
            } else {
                console.log("Selected image:", item.title);
            }
        }
    }

    async function handleDeleteSelected() {
        if (selectedPaths.length === 0) return;
        const confirmDelete = window.confirm(`Are you sure you want to delete these ${selectedPaths.length} items?`);
        if (!confirmDelete) return;
        try {
            for (const path of selectedPaths) {
                const targetItem = items.find(i => i.path === path);
                if (!targetItem) continue;
                const relativePath = `${currentPath}/${targetItem.title}`;
                if (targetItem.type === "directory") {
                    await Filesystem.rmdir({
                        path: relativePath,
                        directory: Directory.External,
                        recursive: true
                    });
                } else {
                    await Filesystem.deleteFile({
                        path: relativePath,
                        directory: Directory.External
                    });
                }
            }
            cancelSelection();
            await loadImages();
        } catch (e) {
            console.error("Error during deletion process:", e);
            alert("Failed to complete full deletion. Some items may be locked.");
        }
    }

    async function handleRenameSelected() {
        if (selectedPaths.length !== 1) return;
        const selectedPath = selectedPaths[0];
        const targetItem = items.find(i => i.path === selectedPath);
        if (!targetItem) return;
        const newName = window.prompt("Enter a new name:", targetItem.title);
        if (newName === null || newName.trim() === "") return;
        try {
            await Filesystem.rename({
                from: `${currentPath}/${targetItem.title}`,
                to: `${currentPath}/${newName.trim()}`,
                directory: Directory.External
            });
            cancelSelection();
            await loadImages();
        } catch (e) {
            console.error("Error during rename operations:", e);
            alert("Failed to rename item. Make sure the name is valid and unique.");
        }
    }

    function handleGoBack() {
        if (currentPath === "images") return;
        const pathParts = currentPath.split("/");
        pathParts.pop();
        setCurrentPath(pathParts.join("/"));
        cancelSelection();
        setPickedPath(null);
    }

    function cancelSelection() {
        setIsSelectionMode(false);
        setSelectedPaths([]);
    }

    function handlePickerCancel() {
        setPickedPath(null);
        cancelSelection();
        onCancel?.();
    }

    function handlePickerOpen() {
        if (!pickedPath) return;
        onPick?.(pickedPath);
    }

    async function handleExportAll() {
        if (isExporting || isImporting) return;
        setIsExporting(true);
        try {
            const zip = new JSZip();

            const [imageFiles, quizFiles] = await Promise.all([
                readDirRecursive("images"),
                readDirRecursive("quizzes"),
            ]);
            for (const f of [...imageFiles, ...quizFiles]) {
                zip.file(f.path, f.data, { base64: true });
            }

            try {
                const categoriesRes = await Filesystem.readFile({
                    path: "categories.json",
                    directory: Directory.External,
                });
                zip.file("categories.json", categoriesRes.data as string, { base64: true });
            } catch (e) {
                console.warn("categories.json not found, skipping it in the export:", e);
            }

            const zipBase64 = await zip.generateAsync({ type: "base64" });
            const accessToken = await getGoogleAccessToken();
            await uploadZipToDrive(accessToken, zipBase64);

            alert("Export complete! Your data has been backed up to Google Drive.");
        } catch (e) {
            console.error("Export failed:", e);
            alert("Failed to export data. Check the console for details.");
        } finally {
            setIsExporting(false);
        }
    }

    async function handleImportAll() {
        if (isExporting || isImporting) return;
        const confirmImport = window.confirm(
            "This will overwrite your local images, quizzes, and categories with the version stored on Google Drive. Continue?"
        );
        if (!confirmImport) return;

        setIsImporting(true);
        try {
            const accessToken = await getGoogleAccessToken();
            const zipData = await downloadZipFromDrive(accessToken);
            const zip = await JSZip.loadAsync(zipData);

            for (const entry of Object.values(zip.files)) {
                if (entry.dir) continue;
                const base64 = await entry.async("base64");
                await Filesystem.writeFile({
                    path: entry.name,
                    directory: Directory.External,
                    data: base64,
                    recursive: true,
                });
            }

            cancelSelection();
            setPickedPath(null);
            await loadImages();
            alert("Import complete! Your data has been restored from Google Drive.");
        } catch (e) {
            console.error("Import failed:", e);
            alert("Failed to import data. Check the console for details.");
        } finally {
            setIsImporting(false);
        }
    }


    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "5px" }}>
            <div style={{ flex: "0 0 auto", display: "flex", flexWrap: "wrap", gap: "5px", justifyContent: "center" }}>
                {isPickerMode ? (
                    <>
                        <button style={{ backgroundColor: "#e74c3c", color: "white" }} onClick={handlePickerCancel}>
                            Cancel
                        </button>
                        <button onClick={handleGoBack} disabled={currentPath === "images"}>
                            Go back
                        </button>
                        {pickedPath && (
                            <button onClick={handlePickerOpen}>
                                Open
                            </button>
                        )}
                    </>
                ) : isSelectionMode ? (
                    <>
                        <button style={{ backgroundColor: "#e74c3c", color: "white" }} onClick={cancelSelection}>
                            Cancel Selection
                        </button>
                        <div style={{ display: "flex", alignItems: "center", color: "white" }}>
                            {selectedPaths.length} items selected
                        </div>
                        <button disabled={selectedPaths.length === 0} onClick={handleDeleteSelected}>
                            Delete Selected
                        </button>
                        <button disabled={selectedPaths.length != 1} onClick={handleRenameSelected}>
                            Rename
                        </button>
                    </>
                ) : (
                    <>
                        <button>
                            <input itemID="filePicker" style={{ display: "none" }} type="file" id="filePicker" accept=".png, .jpg, .jpeg" onChange={(e) => importFile(e)}></input>
                            <label htmlFor="filePicker">Import file</label>
                        </button>
                        <button onClick={handleGoBack} disabled={currentPath === "images"}>
                            Go Back
                        </button>
                        <button onClick={() => createFolder()}>Add Folder</button>
                    </>
                )}
            </div>
            <div style={{ padding: "5px 15px", color: "white", fontSize: "12px", opacity: 0.7 }}>
                Current Path: /{currentPath}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", backgroundColor: "#282a35" }}>
                <GridList
                    items={items}
                    getId={(item) => item.id}
                    getTitle={(item) => item.title}
                    isSelected={(item) => (isPickerMode ? pickedPath === item.path : selectedPaths.includes(item.path))}
                    onItemClick={handleItemClick}
                    onItemLongPress={isPickerMode ? undefined : handleItemLongPress}
                    renderVisual={(item) =>
                        item.type === "directory" ? (
                            <div className="folder">📁</div>
                        ) : (
                            <img className="thumbnail" src={item.image} alt={item.title} />
                        )
                    }
                />
            </div>
            {!isPickerMode && (
                <div style={{ flex: "0 0 auto", display: "flex", flexWrap: "wrap", gap: "5px", justifyContent: "center" }}>
                    <button onClick={handleExportAll} disabled={isExporting || isImporting}>
                        {isExporting ? "Exporting…" : "Export All Data"}
                    </button>
                    <button onClick={handleImportAll} disabled={isExporting || isImporting}>
                        {isImporting ? "Importing…" : "Import Data"}
                    </button>
                </div>
            )}
        </div>
    );
}