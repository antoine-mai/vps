import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    Box,
    CheckCircle2,
    FileCode2,
    FileText,
    HardDrive,
    Loader2,
    Play,
    Plus,
    RefreshCw,
    RotateCw,
    Search,
    Server,
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
    const [containers, setContainers] = useState<DockerContainer[]>([]);
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
            setContainers(data.containers || []);
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

    // Stats
    const stats = useMemo(() => {
        const total = containers.length;
        const running = containers.filter((c) => c.state === "running" || c.status?.toLowerCase().startsWith("up")).length;
        const stopped = total - running;
        return { total, running, stopped };
    }, [containers]);

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

    return (
        <DashboardLayout title="Containers" fullWidth>
            <div className="flex h-full flex-col overflow-y-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Box className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-lg font-semibold text-foreground tracking-tight">Docker Containers</h1>
                                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-500 border border-blue-500/20">
                                        System (Root)
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    System services running on Docker engine from <code className="text-foreground font-mono">/root/htdocs</code>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                        <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search containers..."
                                className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary"
                            />
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 h-8 text-xs"
                            onClick={fetchContainers}
                            disabled={loading}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>

                        <Button
                            size="sm"
                            className="gap-2 h-8 text-xs font-medium"
                            onClick={() => {
                                setCreateError("");
                                setCreateModalOpen(true);
                            }}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Create Container
                        </Button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-lg border border-border bg-card p-3.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Total Containers</span>
                            <Server className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="mt-2 text-2xl font-bold text-foreground font-mono">{stats.total}</div>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-3.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Running</span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="mt-2 text-2xl font-bold text-emerald-500 font-mono">{stats.running}</div>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-3.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Stopped</span>
                            <Square className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="mt-2 text-2xl font-bold text-muted-foreground font-mono">{stats.stopped}</div>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-3.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Host Directory</span>
                            <HardDrive className="h-4 w-4 text-primary" />
                        </div>
                        <div className="mt-2 truncate font-mono text-xs font-medium text-foreground">/root/htdocs</div>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Container List Table */}
                {loading && containers.length === 0 ? (
                    <div className="flex items-center justify-center py-20 text-muted-foreground">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
                        <span className="text-xs">Loading Docker containers...</span>
                    </div>
                ) : filteredContainers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
                        <Box className="h-10 w-10 text-muted-foreground/50 mb-3" />
                        <p className="text-sm font-medium text-foreground">No Docker containers found</p>
                        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                            {searchTerm
                                ? "No containers match your search filter."
                                : "Deploy system Docker containers to run background services under /root/htdocs."}
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
                ) : (
                    <div className="overflow-hidden rounded-lg border border-border bg-card">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-3">Container</th>
                                        <th className="px-4 py-3">Image</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Ports</th>
                                        <th className="px-4 py-3">Location</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {filteredContainers.map((c) => {
                                        const isRunning =
                                            c.state === "running" || c.status?.toLowerCase().startsWith("up");
                                        const targetId = c.id || c.name;
                                        const isBusy = actionLoadingId === targetId;

                                        return (
                                            <tr key={targetId} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <span
                                                            className={`h-2 w-2 rounded-full shrink-0 ${
                                                                isRunning ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                                                            }`}
                                                        />
                                                        <div>
                                                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                                                                <span>{c.name || targetId}</span>
                                                            </div>
                                                            {c.id && (
                                                                <div className="font-mono text-[11px] text-muted-foreground">
                                                                    {c.id.slice(0, 12)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-xs text-foreground bg-muted/50 px-2 py-0.5 rounded border border-border">
                                                        {c.image || "custom"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                            isRunning
                                                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                                                : "bg-muted text-muted-foreground border border-border"
                                                        }`}
                                                    >
                                                        {c.status || (isRunning ? "Running" : "Stopped")}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {c.ports && c.ports.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {c.ports.map((p, idx) => (
                                                                <span
                                                                    key={idx}
                                                                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                                                                >
                                                                    {p}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-[11px] text-muted-foreground">
                                                        {c.path || `/root/htdocs/${c.name}`}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {isRunning ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-muted-foreground hover:text-amber-500"
                                                                title="Stop Container"
                                                                disabled={isBusy}
                                                                onClick={() => handleAction(c, "stop")}
                                                            >
                                                                {isBusy ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                ) : (
                                                                    <Square className="h-3.5 w-3.5" />
                                                                )}
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-muted-foreground hover:text-emerald-500"
                                                                title="Start Container"
                                                                disabled={isBusy}
                                                                onClick={() => handleAction(c, "start")}
                                                            >
                                                                {isBusy ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                ) : (
                                                                    <Play className="h-3.5 w-3.5" />
                                                                )}
                                                            </Button>
                                                        )}

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                            title="Restart Container"
                                                            disabled={isBusy}
                                                            onClick={() => handleAction(c, "restart")}
                                                        >
                                                            <RotateCw className="h-3.5 w-3.5" />
                                                        </Button>

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                            title="View Logs"
                                                            onClick={() => handleOpenLogs(c)}
                                                        >
                                                            <FileText className="h-3.5 w-3.5" />
                                                        </Button>

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                            title="View / Edit Dockerfile"
                                                            onClick={() => handleOpenDockerfile(c)}
                                                        >
                                                            <FileCode2 className="h-3.5 w-3.5" />
                                                        </Button>

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                            title="Delete Container"
                                                            disabled={isBusy}
                                                            onClick={() => setDeleteModal(c)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
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
                    <div className="relative w-full max-w-3xl rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
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

                        <div className="flex-1 overflow-auto rounded-md bg-zinc-950 p-4 font-mono text-xs text-zinc-100 whitespace-pre-wrap">
                            {logsLoading ? (
                                <div className="flex items-center justify-center py-10 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
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
                    <div className="relative w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
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

                        <div className="flex-1 flex flex-col">
                            {dockerfileLoading ? (
                                <div className="flex items-center justify-center py-10 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Loading Dockerfile...
                                </div>
                            ) : (
                                <textarea
                                    value={dockerfileContent}
                                    onChange={(e) => setDockerfileContent(e.target.value)}
                                    placeholder="# Dockerfile contents..."
                                    rows={14}
                                    className="w-full flex-1 rounded border border-border bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none focus:border-primary resize-none"
                                />
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-border pt-3 shrink-0">
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
                    <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
                        <div className="flex items-center gap-2.5 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            <h3 className="text-sm font-semibold">Delete Container</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Are you sure you want to delete container{" "}
                            <span className="font-semibold text-foreground font-mono">
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
