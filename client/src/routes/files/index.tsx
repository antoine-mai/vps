import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    Folder,
    ChevronRight,
    ChevronDown,
    FileText,
    Loader2,
    AlertCircle,
    RefreshCw,
    Clipboard,
    FilePlus2,
    FolderPlus,
    FolderUp,
    Home,
    Pencil,
    Trash2,
    Download,
    Copy,
} from "lucide-react";

import DashboardLayout from "_layouts/dashboard";
import FileEditor from "../../_components/file-editor";
import { runtime } from "../../runtime";

interface FileItem {
    name: string;
    isDir: boolean;
    size: number;
    modTime: string;
    path: string;
}

interface DirectoryList {
    currentPath: string;
    parentPath: string;
    items: FileItem[];
}

interface ExplorerContextMenu {
    item: FileItem;
    x: number;
    y: number;
}

const apiEndpoint = runtime.isRoot ? "/post/files" : "/api/files";

export type FilesRouteProps = {
    initialPath?: string;
    rootLabel?: string;
    embedded?: boolean;
};

export default function FilesRoute({
    initialPath,
    rootLabel,
    embedded = false,
}: FilesRouteProps = {}) {
    const [searchParams] = useSearchParams();
    const queryPath = searchParams.get("path") || "";
    const targetInitialPath = initialPath || queryPath;

    const [homePath, setHomePath] = useState<string>("");
    const [currentParentPath, setCurrentParentPath] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Tree Explorer state
    const [expanded, setExpanded] = useState<Record<string, FileItem[]>>({});
    const [openPaths, setOpenPaths] = useState<Record<string, boolean>>({});

    // Active File Viewer state
    const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
    const [fileContent, setFileContent] = useState<string>("");
    const [isBinary, setIsBinary] = useState(false);
    const [fileSize, setFileSize] = useState<number>(0);
    const [isContentLoading, setIsContentLoading] = useState(false);
    const [contentError, setContentError] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ExplorerContextMenu | null>(null);
    const [copiedPath, setCopiedPath] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);

    // Load folder contents (directories & files)
    const fetchFolderContents = async (path: string): Promise<FileItem[]> => {
        try {
            const response = await fetch(`${apiEndpoint}?path=${encodeURIComponent(path)}`);
            if (!response.ok) return [];
            const data: DirectoryList = await response.json();

            return (data.items || []).sort((a, b) => {
                if (a.isDir && !b.isDir) return -1;
                if (!a.isDir && b.isDir) return 1;
                return a.name.localeCompare(b.name);
            });
        } catch {
            return [];
        }
    };

    // Load a directory as root view
    const loadDirectory = useCallback(async (dirPath: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${apiEndpoint}?path=${encodeURIComponent(dirPath)}`);
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "Failed to initialize root path");
            }
            const data: DirectoryList = await response.json();
            setHomePath(data.currentPath);
            setCurrentParentPath(data.parentPath || "");

            const items = (data.items || []).sort((a, b) => {
                if (a.isDir && !b.isDir) return -1;
                if (!a.isDir && b.isDir) return 1;
                return a.name.localeCompare(b.name);
            });
            setExpanded({ [data.currentPath]: items });
            setOpenPaths({ [data.currentPath]: true });
            setSelectedFile(null);
        } catch (err: any) {
            setError(err.message || "Could not load file system.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initialize root / home directory
    const initExplorer = useCallback(() => {
        return loadDirectory(targetInitialPath);
    }, [loadDirectory, targetInitialPath]);

    useEffect(() => {
        initExplorer();
    }, [initExplorer]);

    const handleToggleExpand = async (path: string) => {
        const isOpen = openPaths[path] || false;

        if (!isOpen) {
            if (!expanded[path]) {
                const items = await fetchFolderContents(path);
                setExpanded((prev) => ({ ...prev, [path]: items }));
            }
            setOpenPaths((prev) => ({ ...prev, [path]: true }));
        } else {
            setOpenPaths((prev) => ({ ...prev, [path]: false }));
        }
    };

    const refreshFolder = useCallback(async (path: string) => {
        const items = await fetchFolderContents(path);
        setExpanded((prev) => ({ ...prev, [path]: items }));
        setOpenPaths((prev) => ({ ...prev, [path]: true }));
    }, []);

    const handleSelectNode = async (item: FileItem) => {
        if (item.isDir) {
            await handleToggleExpand(item.path);
        } else {
            // Load file content
            setSelectedFile(item);
            setIsContentLoading(true);
            setContentError(null);
            try {
                const response = await fetch(`${apiEndpoint}?path=${encodeURIComponent(item.path)}&content=true`);
                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(text || "Failed to load file contents");
                }
                const data = await response.json();
                setFileContent(data.content || "");
                setIsBinary(data.isBinary || false);
                setFileSize(data.size || 0);
            } catch (err: any) {
                setContentError(err.message || "Failed to read file");
            } finally {
                setIsContentLoading(false);
            }
        }
    };

    useEffect(() => {
        initExplorer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Robust click-outside & escape listener for context menu
    useEffect(() => {
        if (!contextMenu) return;

        const handleOutsideClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setContextMenu(null);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setContextMenu(null);
        };

        const timer = setTimeout(() => {
            document.addEventListener("mousedown", handleOutsideClick);
            document.addEventListener("contextmenu", handleOutsideClick);
        }, 10);

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("resize", () => setContextMenu(null));

        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", handleOutsideClick);
            document.removeEventListener("contextmenu", handleOutsideClick);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [contextMenu]);

    const openContextMenu = (event: React.MouseEvent, item: FileItem) => {
        event.preventDefault();
        event.stopPropagation();
        setCopiedPath(false);
        const menuWidth = 200;
        const menuHeight = item.isDir ? 250 : 230;
        setContextMenu({
            item,
            x: Math.min(event.clientX, window.innerWidth - menuWidth - 12),
            y: Math.min(event.clientY, window.innerHeight - menuHeight - 12),
        });
    };

    const copyPath = async () => {
        if (!contextMenu) return;
        try {
            await navigator.clipboard.writeText(contextMenu.item.path);
            setCopiedPath(true);
            window.setTimeout(() => setContextMenu(null), 500);
        } catch {
            setError("Could not copy the path to the clipboard.");
            setContextMenu(null);
        }
    };

    const parentPath = (path: string) => (path === "/" ? "/" : path.slice(0, path.lastIndexOf("/")) || "/");

    const mutateItem = async (
        method: "POST" | "PATCH" | "DELETE" | "PUT",
        payload: { path: string; name?: string; kind?: string; content?: string }
    ) => {
        setError(null);
        const response = await fetch(apiEndpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error((await response.text()) || "File operation failed");
    };

    const handleSaveFile = async (newContent: string) => {
        if (!selectedFile) return;
        setError(null);
        const response = await fetch(apiEndpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: selectedFile.path, content: newContent }),
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || "Failed to save file");
        }
        setFileContent(newContent);
        setFileSize(new Blob([newContent]).size);
    };

    const createItem = async (kind: "file" | "folder") => {
        if (!contextMenu) return;
        const name = window.prompt(kind === "file" ? "New file name" : "New folder name");
        if (!name) return;
        const folder = contextMenu.item.path;
        setContextMenu(null);
        try {
            await mutateItem("POST", { path: folder, name, kind });
            await refreshFolder(folder);
            if (kind === "file") {
                const newFilePath = folder === "/" ? `/${name}` : `${folder}/${name}`;
                await handleSelectNode({
                    name,
                    isDir: false,
                    path: newFilePath,
                    size: 0,
                    modTime: "",
                });
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : `Could not create ${kind}`);
        }
    };

    const duplicateItem = async () => {
        if (!contextMenu) return;
        const item = contextMenu.item;
        setContextMenu(null);
        try {
            await mutateItem("POST", { path: item.path, kind: "duplicate" });
            await refreshFolder(parentPath(item.path));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not duplicate item");
        }
    };

    const downloadItem = () => {
        if (!contextMenu) return;
        const item = contextMenu.item;
        setContextMenu(null);
        const url = `${apiEndpoint}?path=${encodeURIComponent(item.path)}&download=true`;
        const a = document.createElement("a");
        a.href = url;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const renameItem = async () => {
        if (!contextMenu) return;
        const item = contextMenu.item;
        const name = window.prompt("Rename item", item.name);
        if (!name || name === item.name) return;
        setContextMenu(null);
        try {
            await mutateItem("PATCH", { path: item.path, name });
            if (selectedFile?.path === item.path) setSelectedFile(null);
            await refreshFolder(parentPath(item.path));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not rename item");
        }
    };

    const deleteItem = async () => {
        if (!contextMenu) return;
        const item = contextMenu.item;
        if (!window.confirm(`Delete ${item.name}${item.isDir ? " and everything inside it" : ""}? This cannot be undone.`))
            return;
        setContextMenu(null);
        try {
            await mutateItem("DELETE", { path: item.path });
            if (selectedFile?.path === item.path || selectedFile?.path.startsWith(item.path + "/")) setSelectedFile(null);
            setExpanded((prev) => {
                const next = { ...prev };
                delete next[item.path];
                return next;
            });
            await refreshFolder(parentPath(item.path));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not delete item");
        }
    };

    const displayRootName =
        homePath
            ? homePath === "/"
                ? "/"
                : homePath.split("/").filter(Boolean).pop() || homePath
            : rootLabel || (runtime.isRoot ? "/" : runtime.username);

    const content = (
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] overflow-hidden h-full w-full bg-background relative">
            {/* 1. Left Explorer Sidebar */}
            <aside className="border-r border-border bg-card/60 flex flex-col h-full overflow-hidden select-none">
                <div className="flex h-10 items-center justify-between px-3 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {currentParentPath && (
                            <button
                                onClick={() => void loadDirectory(currentParentPath)}
                                className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                                title={`Up to ${currentParentPath}`}
                            >
                                <FolderUp className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <span className="text-xs font-semibold text-muted-foreground truncate" title={homePath || rootLabel || "Explorer"}>
                            {displayRootName}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {currentParentPath && (
                            <button
                                onClick={() => void loadDirectory("")}
                                className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                title="Root / Home"
                            >
                                <Home className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <button
                            onClick={initExplorer}
                            className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title="Refresh Explorer"
                            disabled={isLoading}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                <div
                    className="flex-1 overflow-y-auto py-2 px-2"
                    onContextMenu={(e) => {
                        if (e.target === e.currentTarget && homePath) {
                            openContextMenu(e, {
                                name: displayRootName,
                                isDir: true,
                                path: homePath,
                                size: 0,
                                modTime: "",
                            });
                        }
                    }}
                >
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : error ? (
                        <div className="text-xs text-destructive p-3 text-center">
                            <AlertCircle className="h-5 w-5 mx-auto mb-2 text-destructive" />
                            <span>{error}</span>
                        </div>
                    ) : homePath ? (
                        <DirectoryTreeNode
                            path={homePath}
                            name={displayRootName}
                            isDir={true}
                            depth={0}
                            selectedPath={selectedFile?.path || ""}
                            contextMenuPath={contextMenu?.item.path}
                            onSelect={handleSelectNode}
                            expanded={expanded}
                            openPaths={openPaths}
                            onToggle={handleToggleExpand}
                            onContextMenu={openContextMenu}
                        />
                    ) : null}
                </div>
            </aside>

            {/* 2. Right Editor Pane */}
            <FileEditor
                fileName={selectedFile?.name || ""}
                filePath={selectedFile?.path || ""}
                fileSize={fileSize}
                content={fileContent}
                isBinary={isBinary}
                isLoading={isContentLoading}
                error={contentError}
                onClose={() => setSelectedFile(null)}
                onSave={handleSaveFile}
            />

            {/* Context Menu for Files and Folders */}
            {contextMenu && (
                <div
                    ref={menuRef}
                    className="fixed z-[70] w-[200px] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    role="menu"
                >
                    {contextMenu.item.isDir ? (
                        /* FOLDER Context Menu */
                        <>
                            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground truncate border-b border-border mb-1 flex items-center gap-1.5">
                                <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="truncate">{contextMenu.item.name}</span>
                            </div>
                            <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                                onClick={() => void createItem("file")}
                                role="menuitem"
                            >
                                <FilePlus2 className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>New file</span>
                            </button>
                            <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                                onClick={() => void createItem("folder")}
                                role="menuitem"
                            >
                                <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>New folder</span>
                            </button>
                            <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                                onClick={() => {
                                    void refreshFolder(contextMenu.item.path);
                                    setContextMenu(null);
                                }}
                                role="menuitem"
                            >
                                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Refresh folder</span>
                            </button>
                            <div className="my-1 border-t border-border" />
                            {contextMenu.item.path !== homePath && (
                                <button
                                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                                    onClick={() => void renameItem()}
                                    role="menuitem"
                                >
                                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>Rename</span>
                                </button>
                            )}
                            <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                                onClick={() => void copyPath()}
                                role="menuitem"
                            >
                                <Clipboard className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{copiedPath ? "Copied!" : "Copy path"}</span>
                            </button>
                            {contextMenu.item.path !== homePath && (
                                <>
                                    <div className="my-1 border-t border-border" />
                                    <button
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 transition-colors"
                                        onClick={() => void deleteItem()}
                                        role="menuitem"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        <span>Delete folder</span>
                                    </button>
                                </>
                            )}
                        </>
                    ) : (
                        /* FILE Context Menu */
                        <>
                            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground truncate border-b border-border mb-1 flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{contextMenu.item.name}</span>
                            </div>
                            <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors font-medium text-foreground"
                                onClick={() => {
                                    void handleSelectNode(contextMenu.item);
                                    setContextMenu(null);
                                }}
                                role="menuitem"
                            >
                                <Pencil className="h-3.5 w-3.5 text-primary" />
                                <span>Edit file</span>
                            </button>
                            <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                                onClick={() => void duplicateItem()}
                                role="menuitem"
                            >
                                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Duplicate</span>
                            </button>
                            <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                                onClick={() => downloadItem()}
                                role="menuitem"
                            >
                                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Download</span>
                            </button>
                            <div className="my-1 border-t border-border" />
                            <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                                onClick={() => void renameItem()}
                                role="menuitem"
                            >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Rename</span>
                            </button>
                            <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                                onClick={() => void copyPath()}
                                role="menuitem"
                            >
                                <Clipboard className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{copiedPath ? "Copied!" : "Copy path"}</span>
                            </button>
                            <div className="my-1 border-t border-border" />
                            <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 transition-colors"
                                onClick={() => void deleteItem()}
                                role="menuitem"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete file</span>
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );

    if (embedded) {
        return content;
    }

    return (
        <DashboardLayout
            title="Files"
            description="Manage and edit configuration files exactly like VSCode."
            fullWidth={true}
        >
            {content}
        </DashboardLayout>
    );
}

// Tree view Node component helper (directories & files mixed)
interface DirectoryTreeNodeProps {
    path: string;
    name: string;
    isDir: boolean;
    depth: number;
    selectedPath: string;
    contextMenuPath?: string;
    onSelect: (item: FileItem) => void;
    expanded: Record<string, FileItem[]>;
    openPaths: Record<string, boolean>;
    onToggle: (path: string) => Promise<void>;
    onContextMenu: (event: React.MouseEvent, item: FileItem) => void;
}

function DirectoryTreeNode({
    path,
    name,
    isDir,
    depth,
    selectedPath,
    contextMenuPath,
    onSelect,
    expanded,
    openPaths,
    onToggle,
    onContextMenu,
}: DirectoryTreeNodeProps) {
    const isExpanded = openPaths[path] || false;
    const isSelected = selectedPath === path || contextMenuPath === path;
    const children = expanded[path] || [];

    const handleToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDir) {
            await onToggle(path);
        }
    };

    const handleClick = () => {
        onSelect({ name, isDir, path, size: 0, modTime: "" });
    };

    return (
        <div className="select-none">
            <div
                className={`flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer hover:bg-muted/60 transition-colors text-xs ${
                    isSelected ? "bg-primary/10 text-primary font-medium" : "text-foreground/90"
                }`}
                style={{ paddingLeft: `${depth * 10 + 8}px` }}
                onClick={handleClick}
                onContextMenu={(event) => onContextMenu(event, { name, isDir, path, size: 0, modTime: "" })}
            >
                {isDir ? (
                    <button
                        onClick={handleToggle}
                        className="p-0.5 rounded hover:bg-muted-foreground/10 text-muted-foreground shrink-0"
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                        ) : (
                            <ChevronRight className="h-3 w-3" />
                        )}
                    </button>
                ) : (
                    <div className="w-4 h-4 shrink-0" />
                )}
                {isDir ? (
                    <Folder className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary fill-primary/10" : "text-muted-foreground"}`} />
                ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
                <span className="truncate flex-1 min-w-0">{name}</span>
            </div>

            {isDir && isExpanded && children.length > 0 && (
                <div className="mt-0.5">
                    {children.map((item) => (
                        <DirectoryTreeNode
                            key={item.path}
                            path={item.path}
                            name={item.name}
                            isDir={item.isDir}
                            depth={depth + 1}
                            selectedPath={selectedPath}
                            contextMenuPath={contextMenuPath}
                            onSelect={onSelect}
                            expanded={expanded}
                            openPaths={openPaths}
                            onToggle={onToggle}
                            onContextMenu={onContextMenu}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
