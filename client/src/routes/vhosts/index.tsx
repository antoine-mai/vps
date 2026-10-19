import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ChevronDown,
    ChevronRight,
    ExternalLink,
    FileCode2,
    Globe,
    Loader2,
    Lock,
    Pencil,
    Plus,
    RefreshCw,
    Save,
    Search,
    ShieldCheck,
    ShieldOff,
    Trash2,
    User,
    X,
} from "lucide-react";

import DashboardLayout from "_layouts/dashboard";
import { Button } from "_layouts/_components/ui/button";
import { runtime } from "../../runtime";

type CaddyVHost = {
    aliases: string[];
    configFiles?: string[];
    hostname: string;
    listen: string[];
    owner?: string;
    server: "caddy";
    tls: boolean;
};

type EditTarget = {
    title: string;
    path: string;
};

type LinuxUser = {
    username: string;
    uid: number;
    home: string;
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export default function VHostsRoute({
    embedded = false,
    ownerFilter,
}: {
    embedded?: boolean;
    ownerFilter?: string;
} = {}) {
    if (embedded) {
        return <VHostsContent ownerFilter={ownerFilter} embedded />;
    }
    if (!runtime.isRoot) {
        return <VHostsUserStandalone />;
    }
    return <VHostsStandalone />;
}

// ─── Standalone for user session (no Caddyfile, user's vhosts list only) ───────

function VHostsUserStandalone() {
    return (
        <DashboardLayout title="Virtual Hosts">
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Virtual Hosts</h1>
                    <p className="text-xs text-muted-foreground mt-1">
                        Virtual hosts and domains configured for your account.
                    </p>
                </div>
                <VHostsContent />
            </div>
        </DashboardLayout>
    );
}

// ─── Standalone with subsidebar (Root only) ───────────────────────────────────

function VHostsStandalone() {
    const { owner: ownerParam } = useParams<{ owner?: string }>();
    const activeOwner = ownerParam || "caddyfile";

    const [users, setUsers] = useState<LinuxUser[]>([]);
    const [usersOpen, setUsersOpen] = useState(true);
    const [loadingUsers, setLoadingUsers] = useState(runtime.isRoot);

    useEffect(() => {
        if (!runtime.isRoot) return;
        setLoadingUsers(true);
        fetch("/post/user/list", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const list: LinuxUser[] = (data?.users ?? []).filter(
                    (u: LinuxUser) => u.uid !== 0
                );
                setUsers(list);
            })
            .catch(() => setUsers([]))
            .finally(() => setLoadingUsers(false));
    }, []);

    return (
        <DashboardLayout title="VHosts" fullWidth>
            <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-[200px_1fr]">
                {/* Subsidebar */}
                <aside className="flex h-full flex-col overflow-y-auto border-r border-border bg-card/60">
                    {/* Root node: Caddyfile */}
                    <Link
                        to="/vhosts"
                        className={`flex items-center gap-2.5 border-b border-border px-3 py-3 text-xs font-semibold transition-colors ${
                            activeOwner === "caddyfile"
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                        <FileCode2 className="h-4 w-4 shrink-0" />
                        Caddyfile
                        {activeOwner === "caddyfile" ? (
                            <span className="ml-auto text-xs font-medium text-primary/60">All</span>
                        ) : null}
                    </Link>

                    {/* Users subtree (root only) */}
                    {runtime.isRoot && (
                        <div className="flex flex-col">
                            <button
                                type="button"
                                onClick={() => setUsersOpen((v) => !v)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                {usersOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                ) : (
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                )}
                                Users
                            </button>

                            {usersOpen && (
                                <nav className="flex flex-col gap-0.5 pb-2 pl-5 pr-2">
                                    {loadingUsers ? (
                                        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Loading…
                                        </div>
                                    ) : users.length === 0 ? (
                                        <p className="px-2 py-1 text-xs text-muted-foreground">No users</p>
                                    ) : (
                                        users.map((u) => (
                                            <Link
                                                key={u.username}
                                                to={`/vhosts/${encodeURIComponent(u.username)}`}
                                                className={`flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs transition-colors ${
                                                    activeOwner === u.username
                                                        ? "font-semibold text-primary bg-primary/10"
                                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                                }`}
                                            >
                                                <User className="h-3.5 w-3.5 shrink-0" />
                                                {u.username}
                                            </Link>
                                        ))
                                    )}
                                </nav>
                            )}
                        </div>
                    )}
                </aside>

                {/* Main content */}
                {activeOwner === "caddyfile" ? (
                    <main className="overflow-y-auto p-6">
                        <VHostsContent
                            ownerFilter={undefined}
                            pageTitle="Caddyfile — All VHosts"
                            activeOwner="caddyfile"
                        />
                    </main>
                ) : (
                    <UserCaddyfileEditor username={activeOwner} key={activeOwner} />
                )}
            </div>
        </DashboardLayout>
    );
}

// ─── Inline user Caddyfile editor ────────────────────────────────────────────

function UserCaddyfileEditor({ username }: { username: string }) {
    const path = `/etc/caddy/mthan-users/${username}.caddy`;
    const [content, setContent] = useState("");
    const [loadingFile, setLoadingFile] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setLoadingFile(true);
        setError("");
        setSaved(false);
        const query = new URLSearchParams({ app: "caddy", path });
        fetch(`/post/apps/config?${query}`, { cache: "no-store" })
            .then(async (r) => { if (!r.ok) throw new Error(await r.text()); return r.json(); })
            .then((data: { content: string }) => setContent(data.content ?? ""))
            .catch((reason) => setError(reason instanceof Error ? reason.message : "Failed to load Caddyfile"))
            .finally(() => setLoadingFile(false));
    }, [path]);

    const save = async () => {
        setSaving(true);
        setSaved(false);
        setError("");
        try {
            const query = new URLSearchParams({ app: "caddy", path });
            const response = await fetch(`/post/apps/config?${query}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
            if (!response.ok) throw new Error((await response.text()) || "Failed to save Caddyfile");
            const reload = await fetch("/post/vhost/reload", { method: "POST" });
            if (!reload.ok) throw new Error((await reload.text()) || "Caddyfile saved, but Caddy could not be reloaded");
            setSaved(true);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Failed to save Caddyfile");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-3">
                <div>
                    <p className="text-sm font-semibold text-foreground">{username}.caddy</p>
                    <code className="text-xs text-muted-foreground">{path}</code>
                </div>
                <div className="flex items-center gap-2">
                    {saved && !saving ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved & reloaded</span>
                    ) : null}
                    <Button size="sm" className="gap-2" onClick={save} disabled={loadingFile || saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save & reload
                    </Button>
                </div>
            </div>

            {/* Error */}
            {error ? (
                <div className="shrink-0 border-b border-destructive/20 bg-destructive/10 px-5 py-2 text-xs text-destructive">
                    {error.trim()}
                </div>
            ) : null}

            {/* Editor body */}
            <div className="min-h-0 flex-1 bg-background">
                {loadingFile ? (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <textarea
                        value={content}
                        onChange={(e) => { setContent(e.target.value); setSaved(false); }}
                        spellCheck={false}
                        className="h-full w-full resize-none bg-transparent p-5 font-mono text-xs leading-6 text-foreground outline-none"
                        aria-label={`${username}.caddy content`}
                    />
                )}
            </div>
        </div>
    );
}

// ─── Shared content (table + modals) ─────────────────────────────────────────

function VHostsContent({
    embedded = false,
    ownerFilter,
    pageTitle,
    activeOwner,
}: {
    embedded?: boolean;
    ownerFilter?: string;
    pageTitle?: string;
    activeOwner?: string;
}) {
    const [vhosts, setVhosts] = useState<CaddyVHost[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [editing, setEditing] = useState<EditTarget | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    const endpoint = runtime.isRoot
        ? ownerFilter
            ? `/post/vhost/list?owner=${encodeURIComponent(ownerFilter)}`
            : "/post/vhost/list"
        : "/api/vhost/list";

    const loadVHosts = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(endpoint, { cache: "no-store" });
            if (!response.ok)
                throw new Error((await response.text()) || "Failed to load virtual hosts");
            const data: { vhosts?: CaddyVHost[] } = await response.json();
            setVhosts((data.vhosts ?? []).filter((v) => v.server === "caddy"));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Failed to load virtual hosts");
        } finally {
            setLoading(false);
        }
    }, [endpoint]);

    useEffect(() => {
        loadVHosts();
    }, [loadVHosts]);

    const baseVHosts = useMemo(() => {
        if (!ownerFilter) return vhosts;
        return vhosts.filter((v) => !v.owner || v.owner === ownerFilter);
    }, [ownerFilter, vhosts]);

    const filtered = useMemo(() => {
        const value = query.trim().toLowerCase();
        if (!value) return baseVHosts;
        return baseVHosts.filter(
            (vhost) =>
                vhost.hostname.toLowerCase().includes(value) ||
                vhost.aliases.some((a) => a.toLowerCase().includes(value)) ||
                (vhost.owner && vhost.owner.toLowerCase().includes(value))
        );
    }, [query, baseVHosts]);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        const hostname = deleteTarget;
        setDeleteTarget(null);
        setDeleting(hostname);
        setError("");
        try {
            const ep = runtime.isRoot
                ? `/post/vhost/${encodeURIComponent(hostname)}`
                : `/api/vhost/${encodeURIComponent(hostname)}`;
            const response = await fetch(ep, { method: "DELETE" });
            if (!response.ok)
                throw new Error((await response.text()) || "Failed to delete virtual host");
            await loadVHosts();
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Failed to delete virtual host");
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    {embedded ? (
                        <>
                            <h3 className="text-sm font-semibold text-foreground">Virtual Hosts</h3>
                            <p className="text-xs text-muted-foreground">
                                Virtual hosts owned by {ownerFilter || "this user"}.
                            </p>
                        </>
                    ) : pageTitle ? (
                        <>
                            <h2 className="text-base font-semibold text-foreground">{pageTitle}</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {filtered.length} of {baseVHosts.length} virtual host
                                {baseVHosts.length !== 1 ? "s" : ""}
                            </p>
                        </>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            {filtered.length} of {baseVHosts.length} virtual host
                            {baseVHosts.length !== 1 ? "s" : ""}
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter hosts…"
                            className="h-8 w-44 rounded border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary"
                        />
                    </div>

                    <Button variant="outline" size="sm" className="gap-2" onClick={loadVHosts} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>

                    <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Create VHost
                    </Button>

                    {ownerFilter && runtime.isRoot ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() =>
                                setEditing({
                                    title: `${ownerFilter}.caddy`,
                                    path: `/etc/caddy/mthan-users/${ownerFilter}.caddy`,
                                })
                            }
                        >
                            <FileCode2 className="h-4 w-4" />
                            Edit Caddyfile
                        </Button>
                    ) : null}

                    {!ownerFilter && !embedded && runtime.isRoot ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() =>
                                setEditing({ title: "Caddyfile", path: "/etc/caddy/Caddyfile" })
                            }
                        >
                            <FileCode2 className="h-4 w-4" />
                            Edit Caddyfile
                        </Button>
                    ) : null}
                </div>
            </div>

            {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error.trim()}
                </div>
            ) : null}

            {loading ? (
                <div className="flex min-h-64 items-center justify-center rounded-md border border-border bg-card">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-border text-center">
                    <Globe className="mb-3 h-9 w-9 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-foreground">No virtual hosts found</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {runtime.isRoot
                            ? (ownerFilter
                                ? `Add a host block to ${ownerFilter}.caddy, then reload Caddy.`
                                : "Add a host block to /etc/caddy/Caddyfile or a user's .caddy file, then reload Caddy.")
                            : "No virtual hosts have been configured for your account yet."}
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-md border border-border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-xs">
                            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Hostname</th>
                                    {runtime.isRoot && <th className="px-4 py-3 font-medium">Owner</th>}
                                    <th className="px-4 py-3 font-medium">Aliases</th>
                                    <th className="px-4 py-3 font-medium">Listen</th>
                                    <th className="px-4 py-3 font-medium">TLS</th>
                                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.map((vhost) => (
                                    <tr key={vhost.hostname} className="hover:bg-muted/30">
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            <span className="flex items-center gap-2">
                                                <Globe className="h-4 w-4 text-primary" />
                                                {vhost.hostname}
                                            </span>
                                        </td>
                                        {runtime.isRoot && (
                                            <td className="px-4 py-3">
                                                <span className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                                                    {vhost.owner || "system"}
                                                </span>
                                            </td>
                                        )}
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {vhost.aliases.length ? vhost.aliases.join(", ") : "—"}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-muted-foreground">
                                            {vhost.listen.length ? vhost.listen.join(", ") : ":80, :443"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex items-center gap-1.5 ${
                                                    vhost.tls
                                                        ? "text-emerald-600 dark:text-emerald-400"
                                                        : "text-muted-foreground"
                                                }`}
                                            >
                                                {vhost.tls ? (
                                                    <ShieldCheck className="h-3.5 w-3.5" />
                                                ) : (
                                                    <ShieldOff className="h-3.5 w-3.5" />
                                                )}
                                                {vhost.tls ? "Automatic" : "HTTP"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="inline-flex items-center gap-1.5">
                                                {runtime.isRoot ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 gap-1.5 px-2 text-xs"
                                                        onClick={() =>
                                                            setEditing({
                                                                title: vhost.hostname,
                                                                path: vhost.configFiles?.[0] || "/etc/caddy/Caddyfile",
                                                            })
                                                        }
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                        Edit
                                                    </Button>
                                                ) : null}
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => setDeleteTarget(vhost.hostname)}
                                                    disabled={deleting === vhost.hostname}
                                                    aria-label={`Delete ${vhost.hostname}`}
                                                >
                                                    {deleting === vhost.hostname ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    )}
                                                </Button>
                                                <a
                                                    href={`${vhost.tls ? "https" : "http"}://${vhost.hostname}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    aria-label={`Open ${vhost.hostname}`}
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </a>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Delete confirm modal */}
            {deleteTarget ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm border border-border bg-card shadow-lg">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div className="flex items-center gap-2.5">
                                <Trash2 className="h-4 w-4 text-destructive" />
                                <h3 className="text-sm font-semibold">Delete Virtual Host</h3>
                            </div>
                            <button type="button" onClick={() => setDeleteTarget(null)} aria-label="Close">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="space-y-3 p-5">
                            <p className="text-sm text-muted-foreground">
                                Remove this virtual host from the configuration?
                            </p>
                            <div className="border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                                <p className="font-mono text-sm font-semibold text-destructive">{deleteTarget}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                This action <span className="font-semibold text-destructive">cannot be undone</span>.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                            <Button
                                className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={confirmDelete}
                                disabled={!!deleting}
                            >
                                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {editing ? (
                <CaddyEditor title={editing.title} path={editing.path} onClose={() => setEditing(null)} onSaved={loadVHosts} />
            ) : null}

            {createOpen ? (
                <CreateVHostModal
                    onClose={() => setCreateOpen(false)}
                    onCreated={loadVHosts}
                    defaultOwner={ownerFilter}
                />
            ) : null}
        </div>
    );
}

// ─── Caddy file editor modal ───────────────────────────────────────────────────

function CaddyEditor({
    title,
    path = "/etc/caddy/Caddyfile",
    onClose,
    onSaved,
}: {
    title: string;
    path?: string;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [content, setContent] = useState("");
    const [loadingFile, setLoadingFile] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const query = new URLSearchParams({ app: "caddy", path });
        fetch(`/post/apps/config?${query}`, { cache: "no-store" })
            .then(async (r) => { if (!r.ok) throw new Error(await r.text()); return r.json(); })
            .then((data: { content: string }) => setContent(data.content ?? ""))
            .catch((reason) => setError(reason instanceof Error ? reason.message : "Failed to load Caddyfile"))
            .finally(() => setLoadingFile(false));
    }, [path]);

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            const query = new URLSearchParams({ app: "caddy", path });
            const response = await fetch(`/post/apps/config?${query}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
            if (!response.ok) throw new Error((await response.text()) || "Failed to save Caddyfile");
            const reload = await fetch("/post/vhost/reload", { method: "POST" });
            if (!reload.ok) throw new Error((await reload.text()) || "Caddyfile was saved, but Caddy could not be reloaded");
            await onSaved();
            onClose();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Failed to save Caddyfile");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
            <div className="flex h-[min(720px,90vh)] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-border bg-card shadow-xl">
                <div className="flex items-start justify-between border-b border-border px-5 py-4">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">Edit {title}</h2>
                        <code className="text-xs text-muted-foreground">{path}</code>
                    </div>
                    <Button size="icon" variant="ghost" onClick={onClose} disabled={saving} aria-label="Close editor">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                {error ? (
                    <div className="border-b border-destructive/20 bg-destructive/10 px-5 py-2 text-xs text-destructive">
                        {error.trim()}
                    </div>
                ) : null}
                <div className="min-h-0 flex-1 bg-background">
                    {loadingFile ? (
                        <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            spellCheck={false}
                            className="h-full w-full resize-none bg-transparent p-5 font-mono text-xs leading-6 text-foreground outline-none"
                            aria-label="Caddyfile content"
                        />
                    )}
                </div>
                <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
                    <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button size="sm" className="gap-2" onClick={save} disabled={loadingFile || saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save & reload
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Create Virtual Host Modal ───────────────────────────────────────────────

function CreateVHostModal({
    onClose,
    onCreated,
    defaultOwner,
}: {
    onClose: () => void;
    onCreated: () => void;
    defaultOwner?: string;
}) {
    const [hostname, setHostname] = useState("");
    const [aliases, setAliases] = useState("");
    const [port, setPort] = useState("");
    const [tls, setTls] = useState(true);
    const [owner, setOwner] = useState(defaultOwner || runtime.username || "root");
    const [users, setUsers] = useState<LinuxUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (runtime.isRoot) {
            fetch("/post/user/list", { cache: "no-store" })
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                    const list: LinuxUser[] = (data?.users ?? []).filter((u: LinuxUser) => u.uid !== 0);
                    setUsers(list);
                    if (!defaultOwner && list.length > 0) {
                        setOwner(list[0].username);
                    }
                })
                .catch(() => {});
        }
    }, [defaultOwner]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanHost = hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
        if (!cleanHost) {
            setError("Hostname is required.");
            return;
        }

        const cleanPort = port.trim();
        if (!cleanPort) {
            setError("Target port is required.");
            return;
        }

        setLoading(true);
        setError("");
        try {
            const aliasList = aliases
                .split(/[\s,]+/)
                .map((a) => a.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, ""))
                .filter(Boolean);

            const payload = {
                hostname: cleanHost,
                aliases: aliasList,
                target: cleanPort,
                tls,
                owner: runtime.isRoot ? owner : (runtime.username || owner),
            };

            const ep = runtime.isRoot ? "/post/vhost/create" : "/api/vhost/create";
            const response = await fetch(ep, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "Failed to create virtual host.");
            }
            onCreated();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create virtual host.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg border border-border bg-card shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Create Virtual Host</h3>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 p-5">
                    {error ? (
                        <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                            {error}
                        </div>
                    ) : null}

                    {/* Owner (if Root) */}
                    {runtime.isRoot && (users.length > 0 || defaultOwner) && (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-foreground">Owner</label>
                                {defaultOwner && (
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Lock className="h-3 w-3" />
                                        Locked to current user
                                    </span>
                                )}
                            </div>
                            <select
                                value={owner}
                                onChange={(e) => setOwner(e.target.value)}
                                disabled={Boolean(defaultOwner)}
                                className="h-9 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                            >
                                <option value="root">root (system)</option>
                                {defaultOwner && defaultOwner !== "root" && !users.some((u) => u.username === defaultOwner) && (
                                    <option value={defaultOwner}>{defaultOwner}</option>
                                )}
                                {users.map((u) => (
                                    <option key={u.username} value={u.username}>
                                        {u.username}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Hostname */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">
                            Domain / Hostname <span className="text-destructive">*</span>
                        </label>
                        <input
                            type="text"
                            value={hostname}
                            onChange={(e) => setHostname(e.target.value)}
                            placeholder="example.com"
                            required
                            className="h-9 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                        />
                    </div>

                    {/* Target Port */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">
                            Target Port <span className="text-destructive">*</span>
                        </label>
                        <input
                            type="text"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            placeholder="3000 or localhost:3000"
                            required
                            className="h-9 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Local port or address to reverse proxy (e.g. 3000, 8080, localhost:3000)
                        </p>
                    </div>

                    {/* Aliases */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">Aliases (optional)</label>
                        <input
                            type="text"
                            value={aliases}
                            onChange={(e) => setAliases(e.target.value)}
                            placeholder="www.example.com, api.example.com"
                            className="h-9 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                        />
                        <p className="text-[11px] text-muted-foreground">Comma-separated domain aliases</p>
                    </div>

                    {/* TLS Checkbox */}
                    <div className="flex items-center gap-2 pt-1">
                        <input
                            type="checkbox"
                            id="vhost-tls"
                            checked={tls}
                            onChange={(e) => setTls(e.target.checked)}
                            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                        />
                        <label htmlFor="vhost-tls" className="text-xs font-medium text-foreground cursor-pointer select-none">
                            Automatic HTTPS / SSL with Caddy (Recommended)
                        </label>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-border pt-4">
                        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading} className="gap-2">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            Create Virtual Host
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
