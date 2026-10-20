import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    CalendarClock,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Copy,
    Edit2,
    Info,
    Loader2,
    Play,
    Plus,
    RefreshCw,
    Search,
    Shield,
    Trash2,
    User,
    X,
    XCircle,
} from "lucide-react";

import DashboardLayout from "_layouts/dashboard";
import { Button } from "_layouts/_components/ui/button";
import { runtime } from "../../runtime";

export interface CronTask {
    id: string;
    owner: string;
    name: string;
    schedule: string;
    command: string;
    enabled: boolean;
    lastRunAt?: string;
    lastStatus?: string;
    lastOutput?: string;
    createdAt: string;
    updatedAt: string;
}

export interface UserLimits {
    username: string;
    maxTasks: number;
    maxContainers: number;
    currentTasks?: number;
    currentContainers?: number;
}

export interface LinuxUser {
    username: string;
    uid: number;
    home?: string;
}

interface TaskingRouteProps {
    embedded?: boolean;
    username?: string;
}

const CRON_PRESETS = [
    { label: "Every minute", schedule: "* * * * *" },
    { label: "Every 5 minutes", schedule: "*/5 * * * *" },
    { label: "Every 15 minutes", schedule: "*/15 * * * *" },
    { label: "Hourly (at min 0)", schedule: "0 * * * *" },
    { label: "Daily (at midnight)", schedule: "0 0 * * *" },
    { label: "Daily (at 02:00 AM)", schedule: "0 2 * * *" },
    { label: "Weekly (Sunday 00:00)", schedule: "0 0 * * 0" },
    { label: "Monthly (1st at 00:00)", schedule: "0 0 1 * *" },
] as const;

function describeSchedule(schedule: string): string {
    const trimmed = schedule.trim();
    for (const preset of CRON_PRESETS) {
        if (preset.schedule === trimmed) {
            return preset.label;
        }
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 5) {
        return "Invalid 5-field cron schedule";
    }
    const [min, hour, dom, mon, dow] = parts;
    if (min === "*" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
        return "Runs every minute";
    }
    if (min.startsWith("*/") && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
        return `Runs every ${min.slice(2)} minutes`;
    }
    if (hour.startsWith("*/") && min === "0" && dom === "*" && mon === "*" && dow === "*") {
        return `Runs every ${hour.slice(2)} hours`;
    }
    if (dom === "*" && mon === "*" && dow === "*") {
        return `Runs daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    }
    return "Custom cron schedule";
}

function formatDate(iso?: string): string {
    if (!iso) return "Never";
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleString();
    } catch {
        return iso;
    }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

export default function TaskingRoute({ embedded = false, username }: TaskingRouteProps = {}) {
    if (embedded) {
        return <TaskingContent activeOwner={username} embedded />;
    }
    if (!runtime.isRoot) {
        return <TaskingUserStandalone />;
    }
    return <TaskingStandalone />;
}

// ─── Regular User Standalone (No subsidebar, single standard layout) ─────────

function TaskingUserStandalone() {
    return (
        <DashboardLayout
            title="Tasking"
            description="Manage your scheduled cron jobs, automated tasks, and execution history."
            wide
        >
            <div className="space-y-6">
                <TaskingContent />
            </div>
        </DashboardLayout>
    );
}

// ─── Root Standalone with 220px Subsidebar ───────────────────────────────────

function TaskingStandalone() {
    const { owner: ownerParam } = useParams<{ owner?: string }>();
    const activeOwner = ownerParam || "all";

    const [users, setUsers] = useState<LinuxUser[]>([]);
    const [usersOpen, setUsersOpen] = useState(true);
    const [loadingUsers, setLoadingUsers] = useState(true);

    const [allTasks, setAllTasks] = useState<CronTask[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(true);
    const [taskError, setTaskError] = useState("");

    const fetchAllTasks = useCallback(async () => {
        setLoadingTasks(true);
        setTaskError("");
        try {
            const res = await fetch("/post/tasking/list", { cache: "no-store" });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to load tasks");
            }
            const data = await res.json();
            setAllTasks(data.tasks || []);
        } catch (err) {
            setTaskError(err instanceof Error ? err.message : "Failed to load tasks");
        } finally {
            setLoadingTasks(false);
        }
    }, []);

    useEffect(() => {
        fetchAllTasks();
    }, [fetchAllTasks]);

    useEffect(() => {
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

    const rootTasksCount = useMemo(
        () => allTasks.filter((t) => t.owner === "root").length,
        [allTasks]
    );

    const taskCountsByOwner = useMemo(() => {
        const map: Record<string, number> = {};
        for (const t of allTasks) {
            map[t.owner] = (map[t.owner] || 0) + 1;
        }
        return map;
    }, [allTasks]);

    return (
        <DashboardLayout title="Tasking" fullWidth>
            <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-[200px_1fr]">
                {/* Subsidebar */}
                <aside className="flex h-full flex-col overflow-y-auto border-r border-border bg-card/60">
                    {/* All Tasks Link */}
                    <Link
                        to="/tasking"
                        className={`flex items-center justify-between border-b border-border px-3 py-3 text-xs font-semibold transition-colors ${
                            activeOwner === "all"
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <CalendarClock className="h-4 w-4 shrink-0" />
                            All Tasks
                        </span>
                        <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                activeOwner === "all"
                                    ? "bg-primary/20 text-primary"
                                    : "bg-muted text-muted-foreground"
                            }`}
                        >
                            {allTasks.length}
                        </span>
                    </Link>

                    {/* root (System) Link */}
                    <Link
                        to="/tasking/root"
                        className={`flex items-center justify-between border-b border-border px-3 py-2.5 text-xs font-semibold transition-colors ${
                            activeOwner === "root"
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <Shield className="h-4 w-4 shrink-0 text-amber-500" />
                            root (System)
                        </span>
                        <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                activeOwner === "root"
                                    ? "bg-primary/20 text-primary"
                                    : "bg-muted text-muted-foreground"
                            }`}
                        >
                            {rootTasksCount}
                        </span>
                    </Link>

                    {/* Users Section */}
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
                            <span>Users</span>
                            <span className="ml-auto text-xs text-muted-foreground font-normal">
                                {users.length}
                            </span>
                        </button>

                        {usersOpen && (
                            <nav className="flex flex-col gap-0.5 pb-2 pl-3 pr-2">
                                {loadingUsers ? (
                                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Loading…
                                    </div>
                                ) : users.length === 0 ? (
                                    <p className="px-2 py-1 text-xs text-muted-foreground">No users found</p>
                                ) : (
                                    users.map((u) => {
                                        const count = taskCountsByOwner[u.username] || 0;
                                        const isSelected = activeOwner === u.username;
                                        return (
                                            <Link
                                                key={u.username}
                                                to={`/tasking/${encodeURIComponent(u.username)}`}
                                                className={`flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-xs transition-colors ${
                                                    isSelected
                                                        ? "font-semibold text-primary bg-primary/10"
                                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                                }`}
                                            >
                                                <span className="flex items-center gap-2 truncate">
                                                    <User className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate">{u.username}</span>
                                                </span>
                                                {count > 0 ? (
                                                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                                                        {count}
                                                    </span>
                                                ) : null}
                                            </Link>
                                        );
                                    })
                                )}
                            </nav>
                        )}
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="overflow-y-auto p-6">
                    <TaskingContent
                        activeOwner={activeOwner}
                        usersList={users}
                        allTasks={allTasks}
                        loadingTasks={loadingTasks}
                        taskError={taskError}
                        onRefreshTasks={fetchAllTasks}
                    />
                </main>
            </div>
        </DashboardLayout>
    );
}

// ─── Tasking Content (Core Table & Modals) ───────────────────────────────────

interface TaskingContentProps {
    activeOwner?: string;
    embedded?: boolean;
    usersList?: LinuxUser[];
    allTasks?: CronTask[];
    loadingTasks?: boolean;
    taskError?: string;
    onRefreshTasks?: () => void;
}

export function TaskingContent({
    activeOwner,
    embedded = false,
    usersList = [],
    allTasks,
    loadingTasks: externalLoading,
    taskError: externalError,
    onRefreshTasks,
}: TaskingContentProps) {
    // If not provided externally (e.g. regular user or embedded), manage locally
    const isControlled = Array.isArray(allTasks);
    const [localTasks, setLocalTasks] = useState<CronTask[]>([]);
    const [localLoading, setLocalLoading] = useState(!isControlled);
    const [localError, setLocalError] = useState("");
    const [actionError, setActionError] = useState("");

    const [query, setQuery] = useState("");
    const [userLimits, setUserLimits] = useState<UserLimits | null>(null);

    // Modals
    const [formModalOpen, setFormModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<CronTask | null>(null);
    const [deleteModal, setDeleteModal] = useState<CronTask | null>(null);
    const [runOutputModal, setRunOutputModal] = useState<{
        task: CronTask;
        output: string;
        isRunning: boolean;
        error?: string;
    } | null>(null);

    // Form fields
    const [formName, setFormName] = useState("");
    const [formOwner, setFormOwner] = useState(
        activeOwner && activeOwner !== "all" ? activeOwner : "root"
    );
    const [formSchedule, setFormSchedule] = useState("*/5 * * * *");
    const [formCommand, setFormCommand] = useState("");
    const [formEnabled, setFormEnabled] = useState(true);
    const [formSaving, setFormSaving] = useState(false);
    const [formError, setFormError] = useState("");

    // Copied feedback
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const fetchLocalTasks = useCallback(async () => {
        if (isControlled) return;
        setLocalLoading(true);
        setLocalError("");
        try {
            let ep: string;
            if (runtime.isRoot) {
                ep = activeOwner && activeOwner !== "all"
                    ? `/post/tasking/list?owner=${encodeURIComponent(activeOwner)}`
                    : "/post/tasking/list";
            } else {
                ep = "/api/tasking/list";
            }
            const response = await fetch(ep, { cache: "no-store" });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "Failed to load tasks");
            }
            const data = await response.json();
            setLocalTasks(data.tasks || []);
        } catch (err) {
            setLocalError(err instanceof Error ? err.message : "Failed to load tasks");
        } finally {
            setLocalLoading(false);
        }
    }, [isControlled, activeOwner]);

    const fetchLimits = useCallback(async () => {
        try {
            if (runtime.isRoot) {
                const targetUser = activeOwner && activeOwner !== "all" && activeOwner !== "root" ? activeOwner : null;
                if (targetUser) {
                    const response = await fetch(`/post/user/limits?user=${encodeURIComponent(targetUser)}`, {
                        cache: "no-store",
                    });
                    if (response.ok) {
                        const data = await response.json();
                        setUserLimits(data);
                    } else {
                        setUserLimits(null);
                    }
                } else {
                    setUserLimits(null);
                }
            } else {
                const response = await fetch("/api/user/limits", { cache: "no-store" });
                if (response.ok) {
                    const data = await response.json();
                    setUserLimits(data);
                }
            }
        } catch {
            setUserLimits(null);
        }
    }, [activeOwner]);

    useEffect(() => {
        if (!isControlled) {
            fetchLocalTasks();
        }
        fetchLimits();
    }, [isControlled, fetchLocalTasks, fetchLimits]);

    const handleRefresh = () => {
        setActionError("");
        if (isControlled && onRefreshTasks) {
            onRefreshTasks();
        } else {
            fetchLocalTasks();
        }
        fetchLimits();
    };

    const isLoading = isControlled ? !!externalLoading : localLoading;
    const currentError = (isControlled ? externalError : localError) || actionError;

    // Filter tasks based on selected owner (if activeOwner is set and not "all")
    const scopedTasks = useMemo(() => {
        const raw = isControlled ? (allTasks || []) : localTasks;
        if (!activeOwner || activeOwner === "all") {
            return raw;
        }
        return raw.filter((t) => t.owner === activeOwner);
    }, [isControlled, allTasks, localTasks, activeOwner]);

    // Search filter
    const filteredTasks = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return scopedTasks;
        return scopedTasks.filter((t) =>
            t.name.toLowerCase().includes(q) ||
            t.command.toLowerCase().includes(q) ||
            t.schedule.toLowerCase().includes(q) ||
            t.owner.toLowerCase().includes(q)
        );
    }, [scopedTasks, query]);

    const isTaskLimitReached = Boolean(
        userLimits &&
        userLimits.maxTasks > 0 &&
        scopedTasks.length >= userLimits.maxTasks
    );

    const handleOpenCreate = () => {
        setEditingTask(null);
        setFormName("");
        setFormOwner(activeOwner && activeOwner !== "all" ? activeOwner : "root");
        setFormSchedule("*/5 * * * *");
        setFormCommand("");
        setFormEnabled(true);
        setFormError("");
        setFormModalOpen(true);
    };

    const handleOpenEdit = (task: CronTask) => {
        setEditingTask(task);
        setFormName(task.name);
        setFormOwner(task.owner);
        setFormSchedule(task.schedule);
        setFormCommand(task.command);
        setFormEnabled(task.enabled);
        setFormError("");
        setFormModalOpen(true);
    };

    const handleSaveTask = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormSaving(true);
        setFormError("");

        const trimmedName = formName.trim();
        const trimmedSchedule = formSchedule.trim();
        const trimmedCommand = formCommand.trim();

        if (!trimmedName) {
            setFormError("Task name is required");
            setFormSaving(false);
            return;
        }
        if (!trimmedSchedule) {
            setFormError("Schedule is required");
            setFormSaving(false);
            return;
        }
        if (!trimmedCommand) {
            setFormError("Command is required");
            setFormSaving(false);
            return;
        }

        try {
            const isEditing = !!editingTask;
            let ep: string;
            if (runtime.isRoot) {
                ep = isEditing ? "/post/tasking/update" : "/post/tasking/create";
            } else {
                ep = isEditing ? "/api/tasking/update" : "/api/tasking/create";
            }

            const payload: Record<string, any> = {
                name: trimmedName,
                schedule: trimmedSchedule,
                command: trimmedCommand,
                enabled: formEnabled,
            };

            if (isEditing) {
                payload.id = editingTask.id;
            } else {
                payload.owner = runtime.isRoot ? formOwner : undefined;
            }

            const res = await fetch(ep, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to save task");
            }

            setFormModalOpen(false);
            handleRefresh();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Failed to save task");
        } finally {
            setFormSaving(false);
        }
    };

    const handleToggleEnabled = async (task: CronTask) => {
        const nextEnabled = !task.enabled;
        setActionError("");

        try {
            const ep = runtime.isRoot ? "/post/tasking/toggle" : "/api/tasking/toggle";
            const res = await fetch(ep, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: task.id, enabled: nextEnabled }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to toggle task status");
            }
            handleRefresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Failed to toggle status");
        }
    };

    const handleDeleteTask = async () => {
        if (!deleteModal) return;
        setActionError("");
        try {
            const ep = runtime.isRoot ? "/post/tasking/delete" : "/api/tasking/delete";
            const res = await fetch(ep, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: deleteModal.id }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to delete task");
            }
            setDeleteModal(null);
            handleRefresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Failed to delete task");
            setDeleteModal(null);
        }
    };

    const handleRunNow = async (task: CronTask) => {
        setRunOutputModal({
            task,
            output: "",
            isRunning: true,
        });

        try {
            const ep = runtime.isRoot ? "/post/tasking/run" : "/api/tasking/run";
            const res = await fetch(ep, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: task.id }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || data.error || "Execution failed");
            }
            setRunOutputModal({
                task,
                output: data.output || "(no output produced)",
                isRunning: false,
            });
            handleRefresh();
        } catch (err) {
            setRunOutputModal({
                task,
                output: err instanceof Error ? err.message : "Execution failed",
                isRunning: false,
                error: err instanceof Error ? err.message : "Execution failed",
            });
            handleRefresh();
        }
    };

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="space-y-5">
            {/* Header info for root in subsidebar view */}
            {runtime.isRoot && !embedded && (
                <div className="flex flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold text-foreground">
                                {activeOwner === "all"
                                    ? "All Scheduled Tasks"
                                    : activeOwner === "root"
                                    ? "System Tasks (root)"
                                    : `Tasks: ${activeOwner}`}
                            </h2>
                            {userLimits && userLimits.maxTasks > 0 && activeOwner && activeOwner !== "all" && activeOwner !== "root" ? (
                                <span
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                        isTaskLimitReached
                                            ? "bg-destructive/15 text-destructive"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    Quota: {scopedTasks.length} / {userLimits.maxTasks}
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {filteredTasks.length} of {scopedTasks.length} task{scopedTasks.length !== 1 ? "s" : ""}
                            {activeOwner === "all" ? " across all accounts" : ` for ${activeOwner}`}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 pt-2 sm:pt-0">
                        <Button
                            size="sm"
                            onClick={handleOpenCreate}
                            disabled={isTaskLimitReached}
                            title={isTaskLimitReached ? "Task quota reached" : "Create new scheduled task"}
                            className="h-8 text-xs font-medium"
                        >
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            New Task
                        </Button>
                    </div>
                </div>
            )}

            {/* Top Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-3">
                    {/* Search bar */}
                    <div className="relative min-w-[240px] max-w-sm flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search tasks, commands, schedules..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full rounded-md border border-border bg-card py-1.5 pl-9 pr-3 text-xs text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isLoading}
                        className="h-8 text-xs"
                    >
                        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                </div>

                {/* For non-root or embedded, show quota & Create Task button here */}
                {(!runtime.isRoot || embedded) && (
                    <div className="flex items-center gap-3">
                        {!runtime.isRoot && userLimits && (
                            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">
                                <span className="text-muted-foreground">Task Quota:</span>
                                <span
                                    className={`font-semibold ${
                                        isTaskLimitReached ? "text-destructive" : "text-foreground"
                                    }`}
                                >
                                    {userLimits.currentTasks ?? scopedTasks.length} / {userLimits.maxTasks}
                                </span>
                            </div>
                        )}

                        <Button
                            size="sm"
                            onClick={handleOpenCreate}
                            disabled={isTaskLimitReached}
                            title={isTaskLimitReached ? "Task quota reached" : "Create new scheduled task"}
                            className="h-8 text-xs font-medium"
                        >
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            New Task
                        </Button>
                    </div>
                )}
            </div>

            {/* Quota Banner when max reached */}
            {isTaskLimitReached && (
                <div className="flex items-center gap-2.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>
                        The maximum task limit ({userLimits?.maxTasks} tasks) has been reached. Delete existing tasks
                        or increase the quota in user settings to schedule more.
                    </span>
                </div>
            )}

            {/* Error banner */}
            {currentError && (
                <div className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive">
                    <span>{currentError}</span>
                    <button
                        onClick={() => setActionError("")}
                        className="p-1 hover:opacity-75"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* Tasks Table */}
            <div className="rounded-md border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 w-16 text-center">Status</th>
                                <th className="px-4 py-3 min-w-[160px]">Task Name</th>
                                {runtime.isRoot && (!activeOwner || activeOwner === "all") && (
                                    <th className="px-4 py-3 w-28">Owner</th>
                                )}
                                <th className="px-4 py-3 min-w-[180px]">Schedule</th>
                                <th className="px-4 py-3 min-w-[240px]">Command</th>
                                <th className="px-4 py-3 min-w-[150px]">Last Run</th>
                                <th className="px-4 py-3 w-28 text-center">Result</th>
                                <th className="px-4 py-3 w-36 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {isLoading && scopedTasks.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={runtime.isRoot && (!activeOwner || activeOwner === "all") ? 8 : 7}
                                        className="p-8 text-center"
                                    >
                                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            <span>Loading scheduled tasks...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredTasks.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={runtime.isRoot && (!activeOwner || activeOwner === "all") ? 8 : 7}
                                        className="p-8 text-center text-muted-foreground"
                                    >
                                        {query
                                            ? "No tasks match your search criteria."
                                            : "No scheduled tasks configured yet."}
                                    </td>
                                </tr>
                            ) : (
                                filteredTasks.map((t) => (
                                    <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                                        {/* Status Toggle */}
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleEnabled(t)}
                                                title={t.enabled ? "Disable task" : "Enable task"}
                                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                    t.enabled ? "bg-primary" : "bg-muted"
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                        t.enabled ? "translate-x-4" : "translate-x-0"
                                                    }`}
                                                />
                                            </button>
                                        </td>

                                        {/* Name */}
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-foreground">{t.name}</div>
                                            <div className="text-xs text-muted-foreground font-mono truncate max-w-xs">
                                                {t.id}
                                            </div>
                                        </td>

                                        {/* Owner (shown when viewing all users) */}
                                        {runtime.isRoot && (!activeOwner || activeOwner === "all") && (
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                                                    <User className="h-3 w-3 text-muted-foreground" />
                                                    {t.owner}
                                                </span>
                                            </td>
                                        )}

                                        {/* Schedule */}
                                        <td className="px-4 py-3">
                                            <div className="font-mono text-xs font-semibold text-foreground">
                                                {t.schedule}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {describeSchedule(t.schedule)}
                                            </div>
                                        </td>

                                        {/* Command */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className="font-mono text-xs bg-muted/60 px-2 py-1 rounded max-w-sm truncate text-foreground"
                                                    title={t.command}
                                                >
                                                    {t.command}
                                                </span>
                                                <button
                                                    onClick={() => handleCopy(t.command, t.id)}
                                                    className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                                                    title="Copy command"
                                                >
                                                    {copiedId === t.id ? (
                                                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                                                    ) : (
                                                        <Copy className="h-3.5 w-3.5" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>

                                        {/* Last Run */}
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {formatDate(t.lastRunAt)}
                                        </td>

                                        {/* Result */}
                                        <td className="px-4 py-3 text-center">
                                            {t.lastStatus === "success" ? (
                                                <button
                                                    onClick={() =>
                                                        setRunOutputModal({
                                                            task: t,
                                                            output: t.lastOutput || "(no output)",
                                                            isRunning: false,
                                                        })
                                                    }
                                                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                                                    title="View output"
                                                >
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    Success
                                                </button>
                                            ) : t.lastStatus === "failed" ? (
                                                <button
                                                    onClick={() =>
                                                        setRunOutputModal({
                                                            task: t,
                                                            output: t.lastOutput || "(error)",
                                                            isRunning: false,
                                                            error: "Command exited with error",
                                                        })
                                                    }
                                                    className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors"
                                                    title="View error output"
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                    Failed
                                                </button>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRunNow(t)}
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                    title="Run now"
                                                >
                                                    <Play className="h-3.5 w-3.5 text-primary" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleOpenEdit(t)}
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                    title="Edit task"
                                                >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDeleteModal(t)}
                                                    className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    title="Delete task"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create / Edit Task Modal */}
            {formModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="relative w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl space-y-5">
                        <div className="flex items-center justify-between border-b border-border pb-3">
                            <div className="flex items-center gap-2">
                                <CalendarClock className="h-5 w-5 text-primary" />
                                <h3 className="text-sm font-semibold text-foreground">
                                    {editingTask ? "Edit Scheduled Task" : "Create Scheduled Task"}
                                </h3>
                            </div>
                            <button
                                onClick={() => setFormModalOpen(false)}
                                className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {formError && (
                            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                                {formError}
                            </div>
                        )}

                        <form onSubmit={handleSaveTask} className="space-y-4">
                            {/* Name */}
                            <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                    Task Name <span className="text-destructive">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Daily Database Backup"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            {/* Owner (Root only) */}
                            {runtime.isRoot && !editingTask && (
                                <div>
                                    <label className="block text-xs font-medium text-foreground mb-1">
                                        Owner (Linux User)
                                    </label>
                                    <select
                                        value={formOwner}
                                        onChange={(e) => setFormOwner(e.target.value)}
                                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="root">root (System)</option>
                                        {usersList.map((u) => (
                                            <option key={u.username} value={u.username}>
                                                {u.username}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        The command will be executed under this user's account and crontab.
                                    </p>
                                </div>
                            )}

                            {/* Schedule & Presets */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-medium text-foreground">
                                        Schedule (Cron Expression) <span className="text-destructive">*</span>
                                    </label>
                                    <span className="text-xs text-muted-foreground">
                                        {describeSchedule(formSchedule)}
                                    </span>
                                </div>

                                <input
                                    type="text"
                                    required
                                    placeholder="* * * * *"
                                    value={formSchedule}
                                    onChange={(e) => setFormSchedule(e.target.value)}
                                    className="w-full font-mono rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />

                                {/* Preset quick selector */}
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {CRON_PRESETS.map((p) => (
                                        <button
                                            key={p.schedule}
                                            type="button"
                                            onClick={() => setFormSchedule(p.schedule)}
                                            className={`rounded border px-2 py-1 text-xs transition-colors ${
                                                formSchedule === p.schedule
                                                    ? "border-primary bg-primary/10 font-semibold text-primary"
                                                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Command */}
                            <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                    Command to Execute <span className="text-destructive">*</span>
                                </label>
                                <textarea
                                    required
                                    rows={3}
                                    placeholder="e.g. /usr/local/bin/backup.sh or php /var/www/artisan schedule:run"
                                    value={formCommand}
                                    onChange={(e) => setFormCommand(e.target.value)}
                                    className="w-full font-mono rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Full command string to run on the system.
                                </p>
                            </div>

                            {/* Enabled switch */}
                            <div className="flex items-center gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setFormEnabled(!formEnabled)}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        formEnabled ? "bg-primary" : "bg-muted"
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                                            formEnabled ? "translate-x-4" : "translate-x-0"
                                        }`}
                                    />
                                </button>
                                <span className="text-xs font-medium text-foreground">
                                    {formEnabled ? "Task enabled" : "Task disabled"}
                                </span>
                            </div>

                            {/* Modal actions */}
                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setFormModalOpen(false)}
                                    disabled={formSaving}
                                    className="text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={formSaving}
                                    className="text-xs font-medium"
                                >
                                    {formSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                    {editingTask ? "Save Changes" : "Create Task"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Run Output Modal */}
            {runOutputModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="relative w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-border pb-3">
                            <div className="flex items-center gap-2">
                                <Play className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">
                                        Execution Output: {runOutputModal.task.name}
                                    </h3>
                                    <p className="font-mono text-xs text-muted-foreground">
                                        {runOutputModal.task.command}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setRunOutputModal(null)}
                                className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {runOutputModal.isRunning ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <span className="text-xs font-medium text-foreground">
                                    Executing task in background...
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span
                                        className={`inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-medium ${
                                            runOutputModal.error
                                                ? "bg-destructive/10 text-destructive border border-destructive/20"
                                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                        }`}
                                    >
                                        {runOutputModal.error ? (
                                            <>
                                                <XCircle className="h-3.5 w-3.5" />
                                                Failed
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Completed Successfully
                                            </>
                                        )}
                                    </span>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleCopy(runOutputModal.output, "modal-output")}
                                        className="h-7 text-xs"
                                    >
                                        {copiedId === "modal-output" ? (
                                            <>
                                                <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                                                Copied
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="mr-1.5 h-3.5 w-3.5" />
                                                Copy Output
                                            </>
                                        )}
                                    </Button>
                                </div>

                                <div className="relative max-h-80 overflow-y-auto rounded-md border border-border bg-black/80 p-3.5 font-mono text-xs text-emerald-400">
                                    <pre className="whitespace-pre-wrap break-all">
                                        {runOutputModal.output || "(no output)"}
                                    </pre>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end pt-3 border-t border-border">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRunOutputModal(null)}
                                className="text-xs"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Delete Confirmation Modal (NO window.confirm) */}
            {deleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl space-y-4">
                        <div className="flex items-center gap-3 text-destructive">
                            <div className="rounded-full bg-destructive/10 p-2">
                                <Trash2 className="h-5 w-5" />
                            </div>
                            <h3 className="text-sm font-semibold text-foreground">Delete Scheduled Task</h3>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Are you sure you want to delete the scheduled task{" "}
                            <strong className="text-foreground">{deleteModal.name}</strong>? This action will remove the
                            entry from crontab and cannot be undone.
                        </p>

                        <div className="rounded-md border border-border bg-muted/30 p-2.5 font-mono text-xs text-foreground truncate">
                            {deleteModal.command}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteModal(null)}
                                className="text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDeleteTask}
                                className="text-xs font-medium"
                            >
                                Delete Task
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
