import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    AlertCircle,
    Box,
    CheckCircle2,
    Clock,
    FileCode2,
    FileText,
    Folder,
    Loader2,
    Network,
    Play,
    Plus,
    RefreshCw,
    RotateCw,
    Search,
    Square,
    Terminal,
    Trash2,
    X,
} from "lucide-react";

import DashboardLayout from "_layouts/dashboard";
import { Button } from "_layouts/_components/ui/button";
import { runtime } from "../../runtime";

export type DockerContainer = {
    id: string;
    name: string;
    image: string;
    command?: string;
    engine: string;
    owner: string;
    state: string;
    status: string;
    createdAt?: string;
    ports: string[];
    type?: string;
    runtime?: string;
    path?: string;
    relativePath?: string;
};

export default function DockerContainersRoute() {
    const { id: routeId } = useParams<{ id?: string }>();
    const navigate = useNavigate();

    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(routeId || null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    // Action state
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    // Create modal state
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createImage, setCreateImage] = useState("");
    const [createCommand, setCreateCommand] = useState("");
    const [createRestartPolicy, setCreateRestartPolicy] = useState("unless-stopped");
    const [createPorts, setCreatePorts] = useState<Array<{ host: string; container: string }>>([]);
    const [createVolumes, setCreateVolumes] = useState<Array<{ host: string; container: string }>>([]);
    const [createEnv, setCreateEnv] = useState<Array<{ key: string; value: string }>>([]);
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState("");

    // Logs modal state
    const [logsModal, setLogsModal] = useState<DockerContainer | null>(null);
    const [logsContent, setLogsContent] = useState("");
    const [logsLoading, setLogsLoading] = useState(false);

    // Dockerfile modal state
    const [dockerfileModal, setDockerfileModal] = useState<DockerContainer | null>(null);
    const [dockerfileContent, setDockerfileContent] = useState("");
    const [dockerfileLoading, setDockerfileLoading] = useState(false);
    const [dockerfileSaving, setDockerfileSaving] = useState(false);
    const [dockerfileError, setDockerfileError] = useState("");

    // Delete modal state
    const [deleteModal, setDeleteModal] = useState<DockerContainer | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Fetch root Docker containers
    const fetchContainers = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/post/containers?owner=root", { cache: "no-store" });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to load Docker containers");
            }
            const data = await res.json();
            const loaded: DockerContainer[] = data.containers || [];
            setContainers(loaded);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load Docker containers");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (runtime.isRoot) {
            fetchContainers();
        }
    }, [fetchContainers]);

    // Filtered containers
    const filteredContainers = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return containers;
        return containers.filter(
            (c) =>
                (c.name && c.name.toLowerCase().includes(term)) ||
                (c.image && c.image.toLowerCase().includes(term)) ||
                (c.id && c.id.toLowerCase().includes(term)) ||
                (c.ports && c.ports.some((p) => p.toLowerCase().includes(term)))
        );
    }, [containers, searchTerm]);

    // Active selected container
    const selectedContainer = useMemo(() => {
        if (!containers.length) return null;
        if (selectedId) {
            const match = containers.find((c) => c.id === selectedId || c.name === selectedId);
            if (match) return match;
        }
        if (routeId) {
            const match = containers.find((c) => c.id === routeId || c.name === routeId);
            if (match) return match;
        }
        return containers[0] || null;
    }, [containers, selectedId, routeId]);

    // Select container handler
    const handleSelectContainer = (container: DockerContainer) => {
        const id = container.id || container.name;
        setSelectedId(id);
        navigate(`/containers/${encodeURIComponent(id)}`, { replace: true });
    };

    // Perform container action (start, stop, restart)
    const handleAction = async (container: DockerContainer, action: "start" | "stop" | "restart") => {
        const targetId = container.id || container.name;
        setActionLoadingId(targetId);
        try {
            const res = await fetch("/post/containers/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    owner: "root",
                    id: targetId,
                    engine: "docker",
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `Failed to ${action} container`);
            }
            await fetchContainers();
        } catch (err) {
            alert(err instanceof Error ? err.message : `Failed to ${action} container`);
        } finally {
            setActionLoadingId(null);
        }
    };

    // Delete container
    const handleDeleteContainer = async () => {
        if (!deleteModal) return;
        setDeleteLoading(true);
        const targetId = deleteModal.id || deleteModal.name;
        try {
            const res = await fetch("/post/containers/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "delete",
                    owner: "root",
                    id: targetId,
                    engine: "docker",
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to delete container");
            }
            setDeleteModal(null);
            await fetchContainers();
            setSelectedId(null);
            navigate("/containers", { replace: true });
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete container");
        } finally {
            setDeleteLoading(false);
        }
    };

    // Open Logs
    const handleOpenLogs = async (container: DockerContainer) => {
        setLogsModal(container);
        setLogsLoading(true);
        setLogsContent("");
        const targetId = container.id || container.name;
        try {
            const res = await fetch(
                `/post/containers/logs?engine=docker&owner=root&id=${encodeURIComponent(targetId)}`,
                { cache: "no-store" }
            );
            if (!res.ok) throw new Error("Failed to load logs");
            const data = await res.json();
            setLogsContent(data.logs || "No logs available.");
        } catch (err) {
            setLogsContent(err instanceof Error ? err.message : "Failed to load logs");
        } finally {
            setLogsLoading(false);
        }
    };

    // Open Dockerfile
    const handleOpenDockerfile = async (container: DockerContainer) => {
        setDockerfileModal(container);
        setDockerfileLoading(true);
        setDockerfileError("");
        setDockerfileContent("");
        const targetId = container.id || container.name;
        try {
            const res = await fetch(
                `/post/containers/dockerfile?engine=docker&owner=root&id=${encodeURIComponent(targetId)}`,
                { cache: "no-store" }
            );
            if (!res.ok) throw new Error("Failed to load Dockerfile");
            const data = await res.json();
            setDockerfileContent(data.content || "");
        } catch (err) {
            setDockerfileError(err instanceof Error ? err.message : "Failed to load Dockerfile");
        } finally {
            setDockerfileLoading(false);
        }
    };

    // Save Dockerfile
    const handleSaveDockerfile = async () => {
        if (!dockerfileModal) return;
        setDockerfileSaving(true);
        setDockerfileError("");
        const targetId = dockerfileModal.id || dockerfileModal.name;
        try {
            const res = await fetch(
                `/post/containers/dockerfile?engine=docker&owner=root&id=${encodeURIComponent(targetId)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: dockerfileContent }),
                }
            );
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to save Dockerfile");
            }
            setDockerfileModal(null);
        } catch (err) {
            setDockerfileError(err instanceof Error ? err.message : "Failed to save Dockerfile");
        } finally {
            setDockerfileSaving(false);
        }
    };

    // Create Container
    const handleCreateContainer = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = createName.trim().toLowerCase();
        const trimmedImage = createImage.trim();

        if (!trimmedName) {
            setCreateError("Container name is required.");
            return;
        }
        if (!/^[a-z0-9_-]+$/.test(trimmedName)) {
            setCreateError("Name can only contain lowercase letters, numbers, hyphens (-), and underscores (_).");
            return;
        }
        if (!trimmedImage) {
            setCreateError("Docker image is required.");
            return;
        }

        setCreateLoading(true);
        setCreateError("");

        try {
            const ports = createPorts
                .filter((p) => p.container.trim())
                .map((p) => (p.host.trim() ? `${p.host.trim()}:${p.container.trim()}` : p.container.trim()));

            const volumes = createVolumes
                .filter((v) => v.container.trim())
                .map((v) => (v.host.trim() ? `${v.host.trim()}:${v.container.trim()}` : v.container.trim()));

            const env: Record<string, string> = {};
            for (const item of createEnv) {
                const k = item.key.trim();
                if (k) env[k] = item.value;
            }

            const payload = {
                name: trimmedName,
                owner: "root",
                type: "docker",
                runtime: "docker",
                image: trimmedImage,
                command: createCommand.trim(),
                restartPolicy: createRestartPolicy,
                ports,
                volumes,
                env,
            };

            const res = await fetch("/post/containers/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to create Docker container");
            }

            setCreateModalOpen(false);
            setCreateName("");
            setCreateImage("");
            setCreateCommand("");
            setCreatePorts([]);
            setCreateVolumes([]);
            setCreateEnv([]);
            await fetchContainers();
            setSelectedId(trimmedName);
            navigate(`/containers/${encodeURIComponent(trimmedName)}`, { replace: true });
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : "Failed to create Docker container");
        } finally {
            setCreateLoading(false);
        }
    };

    if (!runtime.isRoot) {
        return (
            <DashboardLayout title="Containers" fullWidth>
                <div className="flex flex-col items-center justify-center p-12 text-center">
                    <AlertCircle className="h-12 w-12 text-destructive mb-3" />
                    <h2 className="text-lg font-semibold text-foreground">Access Restricted</h2>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md">
                        Docker system containers are restricted to the root administrator.
                    </p>
                </div>
            </DashboardLayout>
        );
    }

    const isRunning =
        selectedContainer &&
        (selectedContainer.state === "running" || selectedContainer.status?.toLowerCase().startsWith("up"));
    const selectedTargetId = selectedContainer ? selectedContainer.id || selectedContainer.name : "";
    const isBusy = actionLoadingId === selectedTargetId;

    return (
        <DashboardLayout title="Containers" fullWidth>
            <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-[200px_1fr]">
                {/* Left Subsidebar */}
                <aside className="flex h-full flex-col overflow-hidden border-r border-border bg-card/60 select-none">
                    {/* Header bar */}
                    <div className="flex h-10 items-center justify-between border-b border-border bg-muted/20 px-3">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <Box className="h-3.5 w-3.5" />
                            Containers
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={fetchContainers}
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                title="Refresh containers"
                                disabled={loading}
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                            </button>
                            <button
                                onClick={() => {
                                    setCreateError("");
                                    setCreateModalOpen(true);
                                }}
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                title="Create Docker container"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Search box */}
                    <div className="border-b border-border p-2">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search..."
                                className="h-7 w-full rounded border border-border bg-background pl-6 pr-2 text-xs outline-none focus:border-primary"
                            />
                        </div>
                    </div>

                    {/* Containers List */}
                    <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
                        {loading && containers.length === 0 ? (
                            <div className="flex items-center justify-center py-10 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                        ) : filteredContainers.length === 0 ? (
                            <div className="p-4 text-center text-xs text-muted-foreground">
                                {searchTerm ? "No matching containers" : "No containers"}
                            </div>
                        ) : (
                            filteredContainers.map((c) => {
                                const targetId = c.id || c.name;
                                const isCurrent = (selectedContainer?.id || selectedContainer?.name) === targetId;
                                const running = c.state === "running" || c.status?.toLowerCase().startsWith("up");

                                return (
                                    <button
                                        key={targetId}
                                        type="button"
                                        onClick={() => handleSelectContainer(c)}
                                        className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors ${
                                            isCurrent
                                                ? "bg-primary/10 font-semibold text-primary"
                                                : "text-foreground/80 hover:bg-muted hover:text-foreground"
                                        }`}
                                    >
                                        <span
                                            className={`h-2 w-2 shrink-0 rounded-full ${
                                                running ? "animate-pulse bg-emerald-500" : "bg-zinc-400"
                                            }`}
                                        />
                                        <div className="min-w-0 flex-1 truncate">
                                            <div className="truncate font-medium">{c.name || targetId}</div>
                                            <div className="truncate text-[10px] text-muted-foreground">
                                                {c.image || "custom"}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </aside>

                {/* Right Details Area */}
                <main className="flex h-full flex-col overflow-y-auto bg-background">
                    {selectedContainer ? (
                        <div className="flex-1 space-y-5 p-6">
                            {/* Error Banner */}
                            {error && (
                                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Header Section */}
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <Box className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-lg font-bold tracking-tight text-foreground">
                                                {selectedContainer.name}
                                            </h2>
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                    isRunning
                                                        ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                                                        : "border border-border bg-muted text-muted-foreground"
                                                }`}
                                            >
                                                {isRunning ? (
                                                    <CheckCircle2 className="h-3 w-3" />
                                                ) : (
                                                    <Square className="h-3 w-3" />
                                                )}
                                                {selectedContainer.status || (isRunning ? "Running" : "Stopped")}
                                            </span>
                                            <span className="rounded border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                                                Docker (Root)
                                            </span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span>
                                                Image: <code className="font-mono text-foreground">{selectedContainer.image || "custom"}</code>
                                            </span>
                                            {selectedContainer.id && (
                                                <span>
                                                    ID: <code className="font-mono text-foreground">{selectedContainer.id.slice(0, 12)}</code>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions Toolbar */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {isRunning ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1.5 border-amber-500/20 text-xs text-amber-500 hover:bg-amber-500/10 hover:text-amber-600"
                                            disabled={isBusy}
                                            onClick={() => handleAction(selectedContainer, "stop")}
                                        >
                                            {isBusy ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Square className="h-3.5 w-3.5 fill-current" />
                                            )}
                                            Stop
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            className="gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                                            disabled={isBusy}
                                            onClick={() => handleAction(selectedContainer, "start")}
                                        >
                                            {isBusy ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Play className="h-3.5 w-3.5 fill-current" />
                                            )}
                                            Start
                                        </Button>
                                    )}

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1.5 text-xs"
                                        disabled={isBusy}
                                        onClick={() => handleAction(selectedContainer, "restart")}
                                        title="Restart container"
                                    >
                                        <RotateCw className="h-3.5 w-3.5" />
                                        Restart
                                    </Button>

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1.5 text-xs"
                                        onClick={() => handleOpenLogs(selectedContainer)}
                                        title="View container logs"
                                    >
                                        <FileText className="h-3.5 w-3.5" />
                                        Logs
                                    </Button>

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1.5 text-xs"
                                        onClick={() => handleOpenDockerfile(selectedContainer)}
                                        title="Edit Dockerfile"
                                    >
                                        <FileCode2 className="h-3.5 w-3.5" />
                                        Dockerfile
                                    </Button>

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1.5 border-destructive/20 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        disabled={isBusy}
                                        onClick={() => setDeleteModal(selectedContainer)}
                                        title="Delete container"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Delete
                                    </Button>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid gap-4 md:grid-cols-2">
                                {/* General Information */}
                                <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                                    <div className="flex items-center gap-2 border-b border-border pb-2.5">
                                        <Box className="h-4 w-4 text-primary" />
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            General Information
                                        </h3>
                                    </div>
                                    <div className="space-y-2.5 text-xs">
                                        <div className="flex items-start justify-between gap-4">
                                            <span className="text-muted-foreground">Container Name</span>
                                            <span className="font-mono font-medium text-foreground">{selectedContainer.name}</span>
                                        </div>
                                        <div className="flex items-start justify-between gap-4">
                                            <span className="text-muted-foreground">Full ID</span>
                                            <span className="break-all text-right font-mono text-[11px] text-foreground">
                                                {selectedContainer.id || "—"}
                                            </span>
                                        </div>
                                        <div className="flex items-start justify-between gap-4">
                                            <span className="text-muted-foreground">Image</span>
                                            <span className="font-mono text-foreground">{selectedContainer.image || "custom"}</span>
                                        </div>
                                        <div className="flex items-start justify-between gap-4">
                                            <span className="text-muted-foreground">Command</span>
                                            <span className="break-all font-mono text-[11px] text-foreground">
                                                {selectedContainer.command || "default"}
                                            </span>
                                        </div>
                                        {selectedContainer.createdAt && (
                                            <div className="flex items-start justify-between gap-4">
                                                <span className="text-muted-foreground">Created</span>
                                                <span className="flex items-center gap-1 font-mono text-[11px] text-foreground">
                                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                                    {selectedContainer.createdAt}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Networking & Ports */}
                                <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                                    <div className="flex items-center gap-2 border-b border-border pb-2.5">
                                        <Network className="h-4 w-4 text-primary" />
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Networking & Ports
                                        </h3>
                                    </div>
                                    <div>
                                        {selectedContainer.ports && selectedContainer.ports.length > 0 ? (
                                            <div className="space-y-2">
                                                <p className="text-xs text-muted-foreground">Port Bindings (Host : Container):</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {selectedContainer.ports.map((p, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="rounded-md border border-border bg-muted/80 px-2.5 py-1 font-mono text-xs font-medium text-foreground"
                                                        >
                                                            {p}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                No public port mappings configured for this container.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Filesystem & Locations */}
                                <div className="space-y-3 rounded-lg border border-border bg-card p-4 md:col-span-2">
                                    <div className="flex items-center gap-2 border-b border-border pb-2.5">
                                        <Folder className="h-4 w-4 text-primary" />
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Filesystem & Storage
                                        </h3>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2 text-xs">
                                        <div className="rounded border border-border/80 bg-muted/30 p-3">
                                            <span className="text-[11px] font-medium text-muted-foreground">Working Directory</span>
                                            <code className="mt-1 block font-mono text-xs text-primary break-all">
                                                {selectedContainer.path || `/root/htdocs/${selectedContainer.name}`}
                                            </code>
                                        </div>
                                        <div className="rounded border border-border/80 bg-muted/30 p-3">
                                            <span className="text-[11px] font-medium text-muted-foreground">Dockerfile Location</span>
                                            <code className="mt-1 block font-mono text-xs text-primary break-all">
                                                {`/root/htdocs/${selectedContainer.name}/Dockerfile`}
                                            </code>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Empty state when no container is available */
                        <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
                            <Box className="mb-3 h-12 w-12 text-muted-foreground/40" />
                            <h3 className="text-base font-semibold text-foreground">No Docker containers found</h3>
                            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                                Deploy system Docker containers to run background services under /root/htdocs.
                            </p>
                            <Button
                                size="sm"
                                className="mt-4 gap-2 text-xs"
                                onClick={() => {
                                    setCreateError("");
                                    setCreateModalOpen(true);
                                }}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Create Container
                            </Button>
                        </div>
                    )}
                </main>
            </div>

            {/* Create Container Modal */}
            {createModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                    <div className="relative w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-border pb-3">
                            <div className="flex items-center gap-2">
                                <Box className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">Create Docker Container</h3>
                                    <p className="text-[11px] text-muted-foreground">Runs as root via Docker engine</p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={() => setCreateModalOpen(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {createError && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                                {createError}
                            </div>
                        )}

                        <form onSubmit={handleCreateContainer} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-foreground">Container Name *</label>
                                <input
                                    type="text"
                                    value={createName}
                                    onChange={(e) => setCreateName(e.target.value)}
                                    placeholder="e.g. system-redis or my-api"
                                    required
                                    className="h-8 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Scaffolds to <code className="font-mono">/root/htdocs/{createName.trim() || "<name>"}</code>
                                </p>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-foreground">Docker Image *</label>
                                <input
                                    type="text"
                                    value={createImage}
                                    onChange={(e) => setCreateImage(e.target.value)}
                                    placeholder="e.g. redis:7-alpine or nginx:alpine"
                                    required
                                    className="h-8 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-foreground">Restart Policy</label>
                                <select
                                    value={createRestartPolicy}
                                    onChange={(e) => setCreateRestartPolicy(e.target.value)}
                                    className="h-8 w-full rounded border border-input bg-background px-2.5 text-xs outline-none focus:border-primary"
                                >
                                    <option value="unless-stopped">Unless Stopped (default)</option>
                                    <option value="always">Always</option>
                                    <option value="on-failure">On Failure</option>
                                    <option value="no">No</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-foreground">Command / Entrypoint (Optional)</label>
                                <input
                                    type="text"
                                    value={createCommand}
                                    onChange={(e) => setCreateCommand(e.target.value)}
                                    placeholder="e.g. redis-server --appendonly yes"
                                    className="h-8 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                                />
                            </div>

                            {/* Ports */}
                            <div className="space-y-2 border-t border-border pt-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-foreground">Port Mappings</label>
                                    <button
                                        type="button"
                                        onClick={() => setCreatePorts([...createPorts, { host: "", container: "" }])}
                                        className="text-xs text-primary hover:underline"
                                    >
                                        + Add Port
                                    </button>
                                </div>
                                {createPorts.map((p, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={p.host}
                                            onChange={(e) => {
                                                const next = [...createPorts];
                                                next[idx] = { ...next[idx], host: e.target.value };
                                                setCreatePorts(next);
                                            }}
                                            placeholder="Host Port (e.g. 6379)"
                                            className="h-8 flex-1 rounded border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-primary"
                                        />
                                        <span className="text-muted-foreground">:</span>
                                        <input
                                            type="text"
                                            value={p.container}
                                            onChange={(e) => {
                                                const next = [...createPorts];
                                                next[idx] = { ...next[idx], container: e.target.value };
                                                setCreatePorts(next);
                                            }}
                                            placeholder="Container Port (e.g. 6379)"
                                            className="h-8 flex-1 rounded border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-primary"
                                        />
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onClick={() => setCreatePorts(createPorts.filter((_, i) => i !== idx))}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>

                            {/* Volumes */}
                            <div className="space-y-2 border-t border-border pt-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-foreground">Volume Mounts</label>
                                    <button
                                        type="button"
                                        onClick={() => setCreateVolumes([...createVolumes, { host: "", container: "" }])}
                                        className="text-xs text-primary hover:underline"
                                    >
                                        + Add Volume
                                    </button>
                                </div>
                                {createVolumes.map((v, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={v.host}
                                            onChange={(e) => {
                                                const next = [...createVolumes];
                                                next[idx] = { ...next[idx], host: e.target.value };
                                                setCreateVolumes(next);
                                            }}
                                            placeholder="Host Path (/root/data/...)"
                                            className="h-8 flex-1 rounded border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-primary"
                                        />
                                        <span className="text-muted-foreground">:</span>
                                        <input
                                            type="text"
                                            value={v.container}
                                            onChange={(e) => {
                                                const next = [...createVolumes];
                                                next[idx] = { ...next[idx], container: e.target.value };
                                                setCreateVolumes(next);
                                            }}
                                            placeholder="Container Path (/data)"
                                            className="h-8 flex-1 rounded border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-primary"
                                        />
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onClick={() => setCreateVolumes(createVolumes.filter((_, i) => i !== idx))}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>

                            {/* Env */}
                            <div className="space-y-2 border-t border-border pt-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-foreground">Environment Variables</label>
                                    <button
                                        type="button"
                                        onClick={() => setCreateEnv([...createEnv, { key: "", value: "" }])}
                                        className="text-xs text-primary hover:underline"
                                    >
                                        + Add Env
                                    </button>
                                </div>
                                {createEnv.map((envItem, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={envItem.key}
                                            onChange={(e) => {
                                                const next = [...createEnv];
                                                next[idx] = { ...next[idx], key: e.target.value };
                                                setCreateEnv(next);
                                            }}
                                            placeholder="KEY"
                                            className="h-8 flex-1 rounded border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-primary"
                                        />
                                        <span className="text-muted-foreground">=</span>
                                        <input
                                            type="text"
                                            value={envItem.value}
                                            onChange={(e) => {
                                                const next = [...createEnv];
                                                next[idx] = { ...next[idx], value: e.target.value };
                                                setCreateEnv(next);
                                            }}
                                            placeholder="VALUE"
                                            className="h-8 flex-1 rounded border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-primary"
                                        />
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onClick={() => setCreateEnv(createEnv.filter((_, i) => i !== idx))}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCreateModalOpen(false)}
                                    disabled={createLoading}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" size="sm" disabled={createLoading} className="gap-2">
                                    {createLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    Create Container
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Logs Modal */}
            {logsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                    <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col space-y-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
                        <div className="flex shrink-0 items-center justify-between border-b border-border pb-3">
                            <div className="flex items-center gap-2">
                                <Terminal className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">
                                        Logs: {logsModal.name || logsModal.id}
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground">Engine: Docker</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleOpenLogs(logsModal)}
                                    disabled={logsLoading}
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? "animate-spin" : ""}`} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground"
                                    onClick={() => setLogsModal(null)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto rounded-md bg-zinc-950 p-4 font-mono text-xs whitespace-pre-wrap text-zinc-100">
                            {logsLoading ? (
                                <div className="flex items-center justify-center py-10 text-muted-foreground">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Loading logs...
                                </div>
                            ) : (
                                logsContent || "No logs available."
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Dockerfile Modal */}
            {dockerfileModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                    <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col space-y-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
                        <div className="flex shrink-0 items-center justify-between border-b border-border pb-3">
                            <div className="flex items-center gap-2">
                                <FileCode2 className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">
                                        Dockerfile: {dockerfileModal.name}
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground">
                                        /root/htdocs/{dockerfileModal.name}/Dockerfile
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={() => setDockerfileModal(null)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {dockerfileError && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                                {dockerfileError}
                            </div>
                        )}

                        <div className="flex flex-1 flex-col">
                            {dockerfileLoading ? (
                                <div className="flex items-center justify-center py-10 text-muted-foreground">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Loading Dockerfile...
                                </div>
                            ) : (
                                <textarea
                                    value={dockerfileContent}
                                    onChange={(e) => setDockerfileContent(e.target.value)}
                                    placeholder="# Dockerfile contents..."
                                    rows={14}
                                    className="w-full flex-1 resize-none rounded border border-border bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none focus:border-primary"
                                />
                            )}
                        </div>

                        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDockerfileModal(null)}
                                disabled={dockerfileSaving}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSaveDockerfile}
                                disabled={dockerfileSaving || dockerfileLoading}
                                className="gap-2"
                            >
                                {dockerfileSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Save Dockerfile
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {deleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                    <div className="relative w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
                        <div className="flex items-center gap-2.5 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            <h3 className="text-sm font-semibold">Delete Container</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Are you sure you want to delete container{" "}
                            <span className="font-mono font-semibold text-foreground">
                                {deleteModal.name || deleteModal.id}
                            </span>
                            ? This will stop and remove the Docker container and delete its directory{" "}
                            <span className="font-mono text-foreground">/root/htdocs/{deleteModal.name}</span>.
                        </p>
                        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteModal(null)}
                                disabled={deleteLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDeleteContainer}
                                disabled={deleteLoading}
                                className="gap-2"
                            >
                                {deleteLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Delete Container
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
