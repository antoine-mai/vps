import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
    Boxes,
    RefreshCw,
    Play,
    Square,
    CheckCircle2,
    XCircle,
    Loader2,
    Pin,
    PinOff,
    Download,
    FileCode2,
    HardDrive,
    Network,
    Settings2,
    TerminalSquare,
    Pencil,
    Save,
    X,
} from "lucide-react";

import { useApp } from "_contexts/app";
import DashboardLayout from "_layouts/dashboard";
import { Button } from "_layouts/_components/ui/button";
import Api from "_utils/api";
import SettingsSidebar from "../settings/sidebar";

interface ServerApp {
    id: string;
    name: string;
    displayName: string;
    serviceName?: string;
    version: string;
    port?: string | number;
    description: string;
    running: boolean;
    uptime: string;
    installed: boolean;
    manageable: boolean;
    versions?: string[];
}

type ConfigEditorTarget = {
    app: string;
    label: string;
    path: string;
};

export default function AppsRoute() {
    const { headerApps, isRoot, setHeaderApps } = useApp();
    const { app: requestedApp } = useParams<{ app?: string }>();
    const [apps, setApps] = useState<ServerApp[]>([
        {
            id: "0",
            name: "caddy",
            displayName: "Caddy",
            serviceName: "caddy.service",
            version: "System",
            port: "80, 443",
            description: "Primary public web server and automatic HTTPS reverse proxy.",
            running: true,
            uptime: "—",
            installed: false,
            manageable: true,
        },
        {
            id: "1",
            name: "podman",
            displayName: "Podman",
            version: "System",
            description: "Daemonless container engine for rootless containers.",
            running: false,
            uptime: "Stopped",
            installed: false,
            manageable: false,
        },
        {
            id: "2",
            name: "bind9",
            displayName: "Nameserver",
            serviceName: "named.service",
            version: "System",
            port: "53",
            description: "Authoritative and recursive DNS nameserver daemon (BIND 9).",
            running: false,
            uptime: "Stopped",
            installed: false,
            manageable: true,
        },
    ]);

    const [selectedApp, setSelectedApp] = useState<ServerApp | null>(apps[0]);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [statusError, setStatusError] = useState("");
    const [configEditor, setConfigEditor] = useState<ConfigEditorTarget | null>(null);

    useEffect(() => {
        if (!requestedApp) {
            setSelectedApp(apps[0]);
            return;
        }
        const match = apps.find((app) => app.name === requestedApp);
        if (match) setSelectedApp(match);
    }, [requestedApp]);

    useEffect(() => {
        const loadStatuses = async () => {
            try {
                const response = await fetch(Api.current.apps, { cache: "no-store" });
                if (!response.ok) throw new Error("Failed to load app status");
                const data: {
                    apps: Array<Pick<ServerApp, "name" | "installed" | "manageable" | "running" | "serviceName" | "version" | "versions">>;
                } = await response.json();
                setApps((current) =>
                    current.map((app) => ({
                        ...app,
                        ...(data.apps.find((status) => status.name === app.name) ?? {}),
                    })),
                );
                setSelectedApp((current) => {
                    if (!current) return current;
                    const status = data.apps.find((item) => item.name === current.name);
                    return status ? { ...current, ...status } : current;
                });
                setStatusError("");
            } catch (error) {
                setStatusError(error instanceof Error ? error.message : "Failed to load app status");
            }
        };

        loadStatuses();
    }, []);

    const handleServiceAction = async (id: string, action: "start" | "stop" | "restart") => {
        if (!selectedApp) return;
        setActionLoading(action);
        setStatusError("");
        try {
            const response = await fetch(Api.current.apps, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: selectedApp.name, action }),
            });
            if (!response.ok) throw new Error((await response.text()) || `Failed to ${action} service`);
            const data = await response.json();
            setApps((current) =>
                current.map((app) => ({
                    ...app,
                    ...(data.apps.find((status: ServerApp) => status.name === app.name) ?? {}),
                })),
            );
            const status = data.apps.find((app: ServerApp) => app.name === selectedApp.name);
            if (status) setSelectedApp((current) => (current ? { ...current, ...status } : current));
        } catch (error) {
            setStatusError(error instanceof Error ? error.message : `Failed to ${action} service`);
        } finally {
            setActionLoading(null);
        }
    };

    const installApp = async () => {
        if (!selectedApp) return;
        setActionLoading("install");
        setStatusError("");
        try {
            const response = await fetch(Api.current.apps, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: selectedApp.name }) });
            if (!response.ok) throw new Error((await response.text()) || "Failed to install app");
            const data = await response.json();
            setApps((current) => current.map((app) => ({ ...app, ...(data.apps.find((status: ServerApp) => status.name === app.name) ?? {}) })));
            const status = data.apps.find((app: ServerApp) => app.name === selectedApp.name);
            if (status) setSelectedApp((current) => current ? { ...current, ...status } : current);
        } catch (error) {
            setStatusError(error instanceof Error ? error.message : "Failed to install app");
        } finally { setActionLoading(null); }
    };

    return (
        <DashboardLayout
            title="Settings"
            fullWidth={true}
        >
            <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-[200px_1fr]">
                <SettingsSidebar section="apps" app={selectedApp?.name} />
                <main className="bg-background flex flex-col h-full overflow-hidden">
                    {selectedApp ? (
                        <div className="flex-1 space-y-4 overflow-y-auto p-4">
                            {statusError ? (
                                <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{statusError}</p>
                            ) : null}
                            {/* Compact app header */}
                            <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-lg font-semibold tracking-tight text-foreground">
                                            {selectedApp.displayName}
                                        </h2>
                                        {!selectedApp.installed ? (
                                            <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                <XCircle className="h-3 w-3 shrink-0" />
                                                Not installed
                                            </span>
                                        ) : selectedApp.running ? (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wide">
                                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                                                Running
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border uppercase tracking-wide">
                                                <XCircle className="h-3 w-3 shrink-0" />
                                                Stopped
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        <span>
                                            Version <strong className="font-medium text-foreground">{selectedApp.version}</strong>
                                        </span>
                                        {selectedApp.serviceName ? (
                                            <span>
                                                Service <code className="text-foreground">{selectedApp.serviceName}</code>
                                            </span>
                                        ) : null}
                                        {selectedApp.port !== undefined ? (
                                            <span>
                                                Port <code className="text-foreground">{selectedApp.port}</code>
                                            </span>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="ml-auto flex shrink-0 items-center gap-2">
                                    {isRoot && !selectedApp.installed ? (
                                        <Button size="sm" className="gap-2" disabled={actionLoading !== null} onClick={installApp}>
                                            {actionLoading === "install" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                            {selectedApp.name === "bind9" ? "Active" : "Install"}
                                        </Button>
                                    ) : null}
                                    {selectedApp.installed && selectedApp.manageable ? (
                                        selectedApp.running ? (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="gap-2 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 border-amber-500/20"
                                                disabled={actionLoading !== null}
                                                onClick={() => handleServiceAction(selectedApp.id, "restart")}
                                            >
                                                <RefreshCw className={`h-4 w-4 ${actionLoading === "restart" ? "animate-spin" : ""}`} />
                                                Restart
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                                                disabled={actionLoading !== null}
                                                onClick={() => handleServiceAction(selectedApp.id, "stop")}
                                            >
                                                {actionLoading === "stop" ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Square className="h-4 w-4 fill-current" />
                                                )}
                                                Stop Service
                                            </Button>
                                        </>
                                        ) : (
                                            <Button
                                                size="sm"
                                                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                disabled={actionLoading !== null}
                                                onClick={() => handleServiceAction(selectedApp.id, "start")}
                                            >
                                                {actionLoading === "start" ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Play className="h-4 w-4 fill-current" />
                                                )}
                                                Start Service
                                            </Button>
                                        )
                                    ) : null}

                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-9 w-9"
                                        aria-label={headerApps.includes(selectedApp.name) ? "Remove from header" : "Add to header"}
                                        title={headerApps.includes(selectedApp.name) ? "Remove from header" : "Add to header"}
                                        onClick={() =>
                                            setHeaderApps(
                                                headerApps.includes(selectedApp.name)
                                                    ? headerApps.filter((app) => app !== selectedApp.name)
                                                    : [...headerApps, selectedApp.name],
                                            )
                                        }
                                    >
                                        {headerApps.includes(selectedApp.name) ? (
                                            <PinOff className="h-4 w-4" />
                                        ) : (
                                            <Pin className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {selectedApp.name === "podman" ? (
                                <ContainerEngineConfiguration
                                    app={selectedApp}
                                    canEdit={isRoot}
                                    onEdit={setConfigEditor}
                                />
                            ) : null}

                            {selectedApp.name === "caddy" ? (
                                <section className="space-y-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground">Caddy configuration</h3>
                                        <p className="mt-1 text-xs text-muted-foreground">Caddy is the primary public server for ports 80 and 443.</p>
                                    </div>
                                    <div className="relative rounded-md border border-border bg-card p-4">
                                        {isRoot ? (
                                            <Button size="sm" variant="outline" className="absolute right-3 top-3 h-7 gap-1.5 px-2 text-xs" onClick={() => setConfigEditor({ app: "caddy", label: "Caddyfile", path: "/etc/caddy/Caddyfile" })}>
                                                <Pencil className="h-3 w-3" />
                                                Edit
                                            </Button>
                                        ) : null}
                                        <div className="flex items-start gap-3 pr-16">
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><FileCode2 className="h-4 w-4" /></span>
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-foreground">Caddyfile</p>
                                                <code className="mt-1 block break-all text-xs text-primary">/etc/caddy/Caddyfile</code>
                                                <p className="mt-2 text-xs leading-5 text-muted-foreground">Global public host, TLS, reverse proxy, and route configuration.</p>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            ) : null}

                            {selectedApp.name === "bind9" ? (
                                <section className="space-y-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground">BIND 9 configuration</h3>
                                        <p className="mt-1 text-xs text-muted-foreground">BIND 9 (named) is the system DNS nameserver operating on UDP/TCP port 53.</p>
                                    </div>
                                    <div className="grid gap-3 lg:grid-cols-2">
                                        <div className="relative rounded-md border border-border bg-card p-4">
                                            {isRoot ? (
                                                <Button size="sm" variant="outline" className="absolute right-3 top-3 h-7 gap-1.5 px-2 text-xs" onClick={() => setConfigEditor({ app: "bind9", label: "named.conf", path: "/etc/bind/named.conf" })}>
                                                    <Pencil className="h-3 w-3" />
                                                    Edit
                                                </Button>
                                            ) : null}
                                            <div className="flex items-start gap-3 pr-16">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><FileCode2 className="h-4 w-4" /></span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-foreground">Main Named Configuration</p>
                                                    <code className="mt-1 block break-all text-xs text-primary">/etc/bind/named.conf</code>
                                                    <p className="mt-2 text-xs leading-5 text-muted-foreground">Primary BIND 9 configuration file and includes.</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="relative rounded-md border border-border bg-card p-4">
                                            {isRoot ? (
                                                <Button size="sm" variant="outline" className="absolute right-3 top-3 h-7 gap-1.5 px-2 text-xs" onClick={() => setConfigEditor({ app: "bind9", label: "named.conf.options", path: "/etc/bind/named.conf.options" })}>
                                                    <Pencil className="h-3 w-3" />
                                                    Edit
                                                </Button>
                                            ) : null}
                                            <div className="flex items-start gap-3 pr-16">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Settings2 className="h-4 w-4" /></span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-foreground">Named Options</p>
                                                    <code className="mt-1 block break-all text-xs text-primary">/etc/bind/named.conf.options</code>
                                                    <p className="mt-2 text-xs leading-5 text-muted-foreground">Global forwarders, listen ports, access control lists, and DNSSEC.</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="relative rounded-md border border-border bg-card p-4">
                                            {isRoot ? (
                                                <Button size="sm" variant="outline" className="absolute right-3 top-3 h-7 gap-1.5 px-2 text-xs" onClick={() => setConfigEditor({ app: "bind9", label: "named.conf.local", path: "/etc/bind/named.conf.local" })}>
                                                    <Pencil className="h-3 w-3" />
                                                    Edit
                                                </Button>
                                            ) : null}
                                            <div className="flex items-start gap-3 pr-16">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Network className="h-4 w-4" /></span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-foreground">Local Zones</p>
                                                    <code className="mt-1 block break-all text-xs text-primary">/etc/bind/named.conf.local</code>
                                                    <p className="mt-2 text-xs leading-5 text-muted-foreground">Authoritative DNS zones and domain definitions hosted on this server.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            ) : null}
                        </div>
                    ) : (
                        /* Empty state */
                        <div className="flex-grow flex flex-col items-center justify-center p-8 text-muted-foreground">
                            <Boxes className="h-12 w-12 text-muted-foreground/30 mb-2 shrink-0" />
                            <p className="text-sm font-medium">Select a system app from the list to manage it.</p>
                        </div>
                    )}
                </main>
            </div>
            {configEditor ? (
                <AppConfigEditorModal target={configEditor} onClose={() => setConfigEditor(null)} />
            ) : null}
        </DashboardLayout>
    );
}

type ContainerEngineName = "podman";

type ConfigurationItem = {
    label: string;
    value: string;
    icon: typeof Settings2;
    description: string;
    editablePath?: string;
};

const containerEngineDetails: Record<
    ContainerEngineName,
    {
        summary: string;
        items: ConfigurationItem[];
        commands: Array<{ label: string; command: string }>;
    }
> = {
    podman: {
        summary: "These system-wide defaults apply to Podman installations. Individual rootless users can override them in ~/.config/containers/.",
        items: [
            {
                label: "Container configuration",
                value: "/etc/containers/containers.conf",
                icon: FileCode2,
                description: "Global runtime, networking, capabilities, and container behavior defaults.",
                editablePath: "/etc/containers/containers.conf",
            },
            {
                label: "Registry configuration",
                value: "/etc/containers/registries.conf",
                icon: Network,
                description: "Global registry search order, aliases, mirrors, and registry security settings.",
                editablePath: "/etc/containers/registries.conf",
            },
            {
                label: "Storage configuration",
                value: "/etc/containers/storage.conf",
                icon: HardDrive,
                description: "Global storage-driver defaults inherited by rootless users unless overridden.",
                editablePath: "/etc/containers/storage.conf",
            },
            {
                label: "Container policy",
                value: "/etc/containers/policy.json",
                icon: Settings2,
                description: "Global image-signature verification and trust policy.",
                editablePath: "/etc/containers/policy.json",
            },
            {
                label: "Rootless API socket",
                value: "$XDG_RUNTIME_DIR/podman/podman.sock",
                icon: Network,
                description: "Per-user Docker-compatible socket. It remains isolated and is not editable as a file.",
            },
            {
                label: "UID and GID mappings",
                value: "/etc/subuid and /etc/subgid",
                icon: Settings2,
                description: "Unique subordinate ID ranges provide each user with an isolated user namespace.",
            },
        ],
        commands: [
            { label: "Verify rootless mode", command: "podman info --format '{{.Host.Security.Rootless}}'" },
            { label: "Running containers", command: "podman ps" },
            { label: "All containers", command: "podman ps -a" },
            { label: "Disk usage", command: "podman system df" },
            { label: "Enable user API socket", command: "systemctl --user enable --now podman.socket" },
        ],
    },
};

function ContainerEngineConfiguration({
    app,
    canEdit,
    onEdit,
}: {
    app: ServerApp;
    canEdit: boolean;
    onEdit: (target: ConfigEditorTarget) => void;
}) {
    const engine = app.name as ContainerEngineName;
    const details = containerEngineDetails[engine];

    return (
        <section className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-foreground">
                    {app.displayName} configuration
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {details.summary}
                </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                {details.items.map((item) => {
                    const Icon = item.icon;
                    return (
                        <div key={item.label} className="relative rounded-md border border-border bg-card p-4">
                            {canEdit && item.editablePath ? (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="absolute right-3 top-3 h-7 gap-1.5 px-2 text-xs"
                                    onClick={() => onEdit({ app: engine, label: item.label, path: item.editablePath! })}
                                >
                                    <Pencil className="h-3 w-3" />
                                    Edit
                                </Button>
                            ) : null}
                            <div className="flex items-start gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                    <Icon className="h-4 w-4" />
                                </span>
                                <div className={`min-w-0 ${canEdit && item.editablePath ? "pr-16" : ""}`}>
                                    <p className="text-xs font-semibold text-foreground">{item.label}</p>
                                    <code className="mt-1 block break-all text-xs text-primary">{item.value}</code>
                                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="rounded-md border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-xs font-semibold text-foreground">Management commands</h4>
                </div>
                <div className="divide-y divide-border">
                    {details.commands.map((item) => (
                        <div key={item.command} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <span className="text-xs text-muted-foreground">{item.label}</span>
                            <code className="break-all rounded bg-muted px-2 py-1 text-xs text-foreground">{item.command}</code>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function AppConfigEditorModal({ target, onClose }: { target: ConfigEditorTarget; onClose: () => void }) {
    const [content, setContent] = useState("");
    const [exists, setExists] = useState(true);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const query = new URLSearchParams({ app: target.app, path: target.path });
                const response = await fetch(`/post/apps/config?${query.toString()}`, { cache: "no-store" });
                if (!response.ok) throw new Error((await response.text()) || "Failed to load configuration");
                const data: { content: string; exists: boolean } = await response.json();
                if (active) {
                    setContent(data.content ?? "");
                    setExists(data.exists);
                }
            } catch (loadError) {
                if (active) setError(loadError instanceof Error ? loadError.message : "Failed to load configuration");
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => { active = false; };
    }, [target]);

    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !saving) onClose();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [onClose, saving]);

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            const query = new URLSearchParams({ app: target.app, path: target.path });
            const response = await fetch(`/post/apps/config?${query.toString()}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
            if (!response.ok) throw new Error((await response.text()) || "Failed to save configuration");
            setExists(true);
            onClose();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Failed to save configuration");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
            <div className="flex h-[min(720px,90vh)] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-border bg-card shadow-xl">
                <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-foreground">Edit {target.label}</h2>
                        <code className="mt-1 block break-all text-xs text-muted-foreground">{target.path}</code>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onClose} disabled={saving} aria-label="Close editor">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {!exists && !loading ? (
                    <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-2 text-xs text-amber-700 dark:text-amber-300">
                        This file does not exist yet. Saving will create it.
                    </div>
                ) : null}
                {error ? (
                    <div className="border-b border-destructive/20 bg-destructive/10 px-5 py-2 text-xs text-destructive">{error.trim()}</div>
                ) : null}

                <div className="min-h-0 flex-1 bg-background">
                    {loading ? (
                        <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <textarea
                            value={content}
                            onChange={(event) => setContent(event.target.value)}
                            spellCheck={false}
                            className="h-full w-full resize-none bg-transparent p-5 font-mono text-xs leading-6 text-foreground outline-none"
                            aria-label={`${target.label} content`}
                        />
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
                    <p className="text-xs text-muted-foreground">Saving does not restart the container engine.</p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button size="sm" className="gap-2" onClick={save} disabled={loading || saving || Boolean(error && !content)}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
