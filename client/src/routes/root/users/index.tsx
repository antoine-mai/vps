import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
    Plus,
    RefreshCw,
    Shield,
    Loader2,
    X,
    Key,
    KeyRound,
    CheckCircle,
    Eye,
    EyeOff,
    User,
    Terminal,
    Home,
    Trash2,
    LayoutDashboard,
    Folder,
    HardDrive,
    CheckCircle2,
    XCircle,
    Globe,
    AppWindow,
    Archive,
    Braces,
    CalendarClock,
    Sliders,
} from "lucide-react";

import DashboardLayout from "_layouts/dashboard";
import { Button } from "_layouts/_components/ui/button";
import { useApp } from "_contexts/app";
import UserTerminal from "_components/user-terminal";
import FilesRoute from "../../files";
import VHostsRoute from "../../vhosts";
import ContainersRoute from "../../containers";
import BackupRoute from "../../backup";
import TaskingRoute from "../../tasking";
import APIsRoute from "../../apis";

interface LinuxUser {
    cpanelEnabled: boolean;
    hasPassword: boolean;
    home: string;
    name: string;
    shell: string;
    uid: number;
    username: string;
}

interface UserOverviewData {
    username: string;
    home: string;
    containers: {
        total: number;
        running: number;
        stopped: number;
        items: Array<{
            id: string;
            name: string;
            image: string;
            status: string;
            ports?: string;
        }>;
    };
    vhosts: {
        total: number;
        items: Array<{
            hostname: string;
            aliases?: string[];
            tls: boolean;
            listen?: string[];
        }>;
    };
    storage: {
        homePath: string;
        homeUsed: number;
        diskTotal: number;
        diskUsed: number;
        diskUsage: number;
        breakdown?: Record<string, number>;
    };
}

interface UserContextMenu {
    user: LinuxUser;
    x: number;
    y: number;
}

function formatStorageBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function UsersRoute() {
    const { settings } = useApp();
    const navigate = useNavigate();
    const params = useParams<{ username?: string; section?: string }>();
    const autoUsername = (settings.users_auto_username ?? "false") === "true";
    const routeUsername = params.username ?? "";
    const activeSection = userSection(params.section);
    const [users, setUsers] = useState<LinuxUser[]>([]);
    const [selectedUser, setSelectedUser] = useState<LinuxUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [overviewData, setOverviewData] = useState<UserOverviewData | null>(null);
    const [overviewLoading, setOverviewLoading] = useState(false);
    const [overviewError, setOverviewError] = useState<string | null>(null);
    const [activationOpen, setActivationOpen] = useState(false);
    const [activationPassword, setActivationPassword] = useState("");
    const [activationConfirm, setActivationConfirm] = useState("");
    const [activationShowPassword, setActivationShowPassword] = useState(false);
    const [activationSaving, setActivationSaving] = useState(false);
    const [activationError, setActivationError] = useState("");
    const [contextMenu, setContextMenu] = useState<UserContextMenu | null>(null);
    const [deleteConfirmUser, setDeleteConfirmUser] = useState<LinuxUser | null>(null);

    // Change Password modal state
    const [changePasswordOpen, setChangePasswordOpen] = useState(false);
    const [changePasswordTarget, setChangePasswordTarget] = useState<LinuxUser | null>(null);
    const [changePasswordValue, setChangePasswordValue] = useState("");
    const [changePasswordConfirm, setChangePasswordConfirm] = useState("");
    const [changePasswordShow, setChangePasswordShow] = useState(false);
    const [changePasswordSaving, setChangePasswordSaving] = useState(false);
    const [changePasswordError, setChangePasswordError] = useState("");
    const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);


    const [isModalOpen, setIsModalOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [username, setUsername] = useState("");
    const [createdUser, setCreatedUser] = useState<{ username: string; password: string } | null>(null);

    // User Resource Limits state
    const [userLimits, setUserLimits] = useState<{ username: string; maxTasks: number; maxContainers: number } | null>(null);
    const [limitsModalOpen, setLimitsModalOpen] = useState(false);
    const [editMaxTasks, setEditMaxTasks] = useState(10);
    const [editMaxContainers, setEditMaxContainers] = useState(5);
    const [limitsSaving, setLimitsSaving] = useState(false);
    const [limitsError, setLimitsError] = useState("");

    const generateRandomPassword = () => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=";
        const length = 16;
        let result = "";
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * charset.length);
            result += charset[randomIndex];
        }
        setPassword(result);
        setConfirmPassword(result);
        setShowPassword(true);
    };

    useEffect(() => {
        if (!isModalOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                handleCloseModal();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isModalOpen]);

    useEffect(() => {
        if (!contextMenu) return;
        const close = () => setContextMenu(null);
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("blur", close);
        window.addEventListener("resize", close);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("blur", close);
            window.removeEventListener("resize", close);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [contextMenu]);

    const openContextMenu = (event: React.MouseEvent, user: LinuxUser) => {
        event.preventDefault();
        event.stopPropagation();
        const menuWidth = 210;
        const menuHeight = user.uid === 0 ? 222 : user.cpanelEnabled ? 258 : 290;
        setSelectedUser(user);
        setContextMenu({
            user,
            x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
            y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
        });
    };

    const navigateFromContextMenu = (section: UserSection) => {
        if (!contextMenu) return;
        const username = contextMenu.user.username;
        setContextMenu(null);
        navigate(`/users/${encodeURIComponent(username)}/${section}`);
    };

    const activateFromContextMenu = () => {
        if (!contextMenu) return;
        setSelectedUser(contextMenu.user);
        setActivationError("");
        setActivationOpen(true);
        setContextMenu(null);
    };

    const deleteFromContextMenu = () => {
        if (!contextMenu) return;
        const user = contextMenu.user;
        setContextMenu(null);
        setDeleteConfirmUser(user);
    };

    const openChangePassword = (user: LinuxUser) => {
        setChangePasswordTarget(user);
        setChangePasswordValue("");
        setChangePasswordConfirm("");
        setChangePasswordShow(false);
        setChangePasswordError("");
        setChangePasswordSuccess(false);
        setChangePasswordOpen(true);
    };

    const changePasswordFromContextMenu = () => {
        if (!contextMenu) return;
        const user = contextMenu.user;
        setContextMenu(null);
        openChangePassword(user);
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!changePasswordTarget) return;
        setChangePasswordError("");
        if (!changePasswordValue.trim()) {
            setChangePasswordError("Password is required");
            return;
        }
        if (changePasswordValue !== changePasswordConfirm) {
            setChangePasswordError("Passwords do not match");
            return;
        }
        setChangePasswordSaving(true);
        try {
            const res = await fetch("/post/user/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: changePasswordTarget.username, password: changePasswordValue }),
            });
            if (!res.ok) throw new Error((await res.text()) || "Failed to change password");
            setChangePasswordSuccess(true);
            setChangePasswordValue("");
            setChangePasswordConfirm("");
            await fetchUsers(true);
        } catch (err) {
            setChangePasswordError(err instanceof Error ? err.message : "Failed to change password");
        } finally {
            setChangePasswordSaving(false);
        }
    };

    const generateChangePassword = () => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=";
        let result = "";
        for (let i = 0; i < 16; i++) result += charset[Math.floor(Math.random() * charset.length)];
        setChangePasswordValue(result);
        setChangePasswordConfirm(result);
        setChangePasswordShow(true);
    };



    const fetchUsers = async (showRefresh = false) => {
        if (showRefresh) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);
        try {
            const response = await fetch("/post/user/list");
            if (!response.ok) {
                throw new Error("Failed to fetch users");
            }
            const data = await response.json();
            if (data.status === "ok") {
                const list = data.users || [];
                setUsers(list);
                
                // Set default selected user
                if (list.length > 0) {
                    setSelectedUser((prev) => {
                        const routed = list.find((u: LinuxUser) => u.username === routeUsername);
                        if (routed) return routed;
                        const exists = list.find((u: LinuxUser) => u.username === prev?.username);
                        return exists || list[0];
                    });
                } else {
                    setSelectedUser(null);
                }
            } else {
                throw new Error(data.message || "Failed to load users");
            }
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        if (!routeUsername) return;
        const routed = users.find((user) => user.username === routeUsername);
        if (routed) setSelectedUser(routed);
    }, [routeUsername, users]);


    useEffect(() => {
        if (activeSection !== "overview" || !selectedUser) return;

        const controller = new AbortController();
        setOverviewLoading(true);
        setOverviewError(null);
        fetch(`/post/user/overview?user=${encodeURIComponent(selectedUser.username)}`, {
            cache: "no-store",
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error((await response.text()) || "Failed to load user overview");
                return response.json();
            })
            .then((data) => {
                if (data.overview) setOverviewData(data.overview);
            })
            .catch((requestError) => {
                if (requestError.name !== "AbortError") setOverviewError(requestError.message || "Failed to load user overview");
            })
            .finally(() => {
                if (!controller.signal.aborted) setOverviewLoading(false);
            });

        return () => controller.abort();
    }, [activeSection, selectedUser?.username]);

    useEffect(() => {
        if (!selectedUser) {
            setUserLimits(null);
            return;
        }
        fetch(`/post/user/limits?user=${encodeURIComponent(selectedUser.username)}`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data) {
                    setUserLimits(data);
                    setEditMaxTasks(data.maxTasks ?? 10);
                    setEditMaxContainers(data.maxContainers ?? 5);
                }
            })
            .catch(() => {});
    }, [selectedUser?.username]);

    const handleSaveLimits = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;
        setLimitsSaving(true);
        setLimitsError("");
        try {
            const res = await fetch("/post/user/limits", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: selectedUser.username,
                    maxTasks: Number(editMaxTasks),
                    maxContainers: Number(editMaxContainers),
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to update resource limits");
            }
            setUserLimits({
                username: selectedUser.username,
                maxTasks: Number(editMaxTasks),
                maxContainers: Number(editMaxContainers),
            });
            setLimitsModalOpen(false);
        } catch (err) {
            setLimitsError(err instanceof Error ? err.message : "Failed to update resource limits");
        } finally {
            setLimitsSaving(false);
        }
    };

    const handleCreateUser = async (e: FormEvent) => {
        e.preventDefault();
        setModalError(null);

        if (!autoUsername && !username.trim()) {
            setModalError("Username is required");
            return;
        }

        if (!password.trim()) {
            setModalError("Password is required");
            return;
        }

        if (password !== confirmPassword) {
            setModalError("Passwords do not match");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch("/post/user/add", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ password, username: autoUsername ? "" : username.trim() }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "Failed to create user");
            }

            const data = await response.json();
            if (data.status === "ok") {
                setCreatedUser({
                    username: data.username,
                    password: password,
                });
                setPassword("");
                setConfirmPassword("");
                setUsername("");
                fetchUsers();
            } else {
                throw new Error(data.message || "Failed to create user");
            }
        } catch (err: any) {
            setModalError(err.message || "An error occurred during user creation");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCreatedUser(null);
        setPassword("");
        setConfirmPassword("");
        setUsername("");
        setShowPassword(false);
        setModalError(null);
    };

    const openDeleteConfirm = (user: LinuxUser) => {
        setDeleteConfirmUser(user);
    };

    const confirmDeleteUser = async () => {
        if (!deleteConfirmUser) return;
        const username = deleteConfirmUser.username;
        setDeleteConfirmUser(null);

        setIsDeleting(true);
        try {
            const response = await fetch("/post/user/delete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ username }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "Failed to delete user");
            }

            const data = await response.json();
            if (data.status === "ok") {
                fetchUsers();
            } else {
                throw new Error(data.message || "Failed to delete user");
            }
        } catch (err: any) {
            alert(err.message || "Could not delete user.");
        } finally {
            setIsDeleting(false);
        }
    };

    const activateCPanel = async (event: FormEvent) => {
        event.preventDefault();
        if (!selectedUser) return;
        setActivationError("");
        if (!activationPassword) {
            setActivationError("Password is required");
            return;
        }
        if (activationPassword !== activationConfirm) {
            setActivationError("Passwords do not match");
            return;
        }
        setActivationSaving(true);
        try {
            const response = await fetch("/post/user/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: selectedUser.username, password: activationPassword }),
            });
            if (!response.ok) throw new Error((await response.text()) || "Failed to activate cPanel access");
            setActivationOpen(false);
            setActivationPassword("");
            setActivationConfirm("");
            setActivationShowPassword(false);
            await fetchUsers(true);
        } catch (activationRequestError) {
            setActivationError(activationRequestError instanceof Error ? activationRequestError.message : "Failed to activate cPanel access");
        } finally {
            setActivationSaving(false);
        }
    };

    return (
        <DashboardLayout
            title="Linux users"
            description="Manage local system accounts, home folders, shells, and system access."
            fullWidth={true}
        >
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] h-[calc(100vh-56px)] overflow-hidden">
                {/* Left Sidebar - Users List */}
                <aside className="border-r border-border bg-card/60 flex flex-col h-full overflow-hidden select-none">
                    <div className="flex h-10 items-center justify-between px-3 border-b border-border bg-muted/20">
                        <span className="text-xs font-semibold text-muted-foreground">
                            Users List
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => fetchUsers(true)}
                                className="p-1 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                title="Refresh Users"
                                disabled={isLoading || isRefreshing}
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                            </button>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="p-1 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                title="Create User"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
                        {isLoading && users.length === 0 ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : error ? (
                            <div className="text-xs text-destructive p-3 text-center">
                                <AlertCircle className="h-5 w-5 mx-auto mb-2 text-destructive" />
                                <span>{error}</span>
                            </div>
                        ) : users.length === 0 ? (
                            <div className="text-xs text-muted-foreground p-4 text-center">
                                No home users found.
                            </div>
                        ) : (
                            users.map((u) => {
                                const isOpen = selectedUser?.username === u.username;
                                return (
                                    <div key={u.username} onContextMenu={(event) => openContextMenu(event, u)}>
                                    <Link
                                        to={`/users/${encodeURIComponent(u.username)}/overview`}
                                        className="flex items-center gap-2 rounded-none px-2.5 py-1.5 text-xs text-foreground/90 transition-colors hover:bg-muted/60"
                                    >
                                        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        <span className="truncate flex-1 min-w-0">{u.username}</span>
                                    </Link>
                                    {isOpen ? (
                                        <nav className="ml-5 border-l border-border py-1 pl-2">
                                            <UserSubItem username={u.username} section="overview" active={activeSection === "overview"} icon={LayoutDashboard} label="Overview" />
                                            <UserSubItem username={u.username} section="files" active={activeSection === "files"} icon={Folder} label="Files" />
                                            <UserSubItem username={u.username} section="containers" active={activeSection === "containers"} icon={AppWindow} label="Apps" />
                                            <UserSubItem username={u.username} section="vhosts" active={activeSection === "vhosts"} icon={Globe} label="VHosts" />
                                            <UserSubItem username={u.username} section="tasking" active={activeSection === "tasking"} icon={CalendarClock} label="Tasking" />
                                            <UserSubItem username={u.username} section="apis" active={activeSection === "apis"} icon={Braces} label="APIs" />
                                            <UserSubItem username={u.username} section="terminal" active={activeSection === "terminal"} icon={Terminal} label="Terminal" />
                                            <UserSubItem username={u.username} section="backup" active={activeSection === "backup"} icon={Archive} label="Backup" />
                                        </nav>
                                    ) : null}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </aside>

                {/* Right Panel - User Details Dashboard */}
                <main className="bg-background flex flex-col h-full overflow-hidden">
                    {selectedUser ? (
                        <div className="flex flex-col h-full overflow-hidden">
                            {/* Profile Header Bar */}
                            <div className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0 bg-card/30">
                                <div className="flex items-center gap-3 min-w-0">
                                    <h2 className="text-lg font-bold tracking-tight text-foreground truncate">
                                        {selectedUser.username}
                                    </h2>
                                    <div className="flex max-w-full items-center gap-2 overflow-x-auto">
                                        <UserInfoBox icon={Shield} label="UID" value={String(selectedUser.uid)} />
                                        <UserInfoBox icon={Home} label="Home" value={selectedUser.home} />
                                        <UserInfoBox icon={Terminal} label="Shell" value={selectedUser.shell || "/bin/bash"} />
                                    </div>
                                </div>

                                <div className="ml-auto flex shrink-0 items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className={`h-7 cursor-default gap-1.5 px-2 text-xs ${selectedUser.cpanelEnabled ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                                        tabIndex={-1}
                                    >
                                        {selectedUser.cpanelEnabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                        {selectedUser.cpanelEnabled ? "CPanel Enabled" : "CPanel Disabled"}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1.5 px-2 text-xs"
                                        onClick={() => {
                                             setLimitsError("");
                                             setEditMaxTasks(userLimits?.maxTasks ?? 10);
                                             setEditMaxContainers(userLimits?.maxContainers ?? 5);
                                             setLimitsModalOpen(true);
                                        }}
                                        title="Configure task and app limits for this user"
                                    >
                                        <Sliders className="h-3.5 w-3.5 text-primary" />
                                        <span>Limits: {userLimits?.maxTasks ?? 10} Tasks / {userLimits?.maxContainers ?? 5} Apps</span>
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1.5 px-2 text-xs"
                                        onClick={() => openChangePassword(selectedUser)}
                                        title="Change this user's Linux password"
                                    >
                                        <KeyRound className="h-3.5 w-3.5" />
                                        Change Password
                                    </Button>

                                    {!selectedUser.cpanelEnabled ? (
                                        <Button size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => { setActivationError(""); setActivationOpen(true); }}>
                                            <Key className="h-3.5 w-3.5" />
                                            Activate
                                        </Button>
                                    ) : null}
                                    {selectedUser.uid !== 0 && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-destructive border-destructive/20 hover:bg-destructive/10 gap-1.5 shrink-0 rounded-none"
                                            onClick={() => openDeleteConfirm(selectedUser)}
                                            disabled={isDeleting}
                                        >
                                            {isDeleting ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-3.5 w-3.5" />
                                            )}
                                            Delete User
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {activeSection === "files" ? (
                                /* File Explorer filling 100% remaining space without page scrollbar */
                                <div className="flex-1 min-h-0 w-full overflow-hidden">
                                    {(() => {
                                        const queryPath = new URLSearchParams(window.location.search).get("path");
                                        const targetPath = queryPath || selectedUser.home;
                                        return (
                                            <FilesRoute
                                                key={`${selectedUser.username}:${targetPath}`}
                                                initialPath={targetPath}
                                                rootLabel={selectedUser.username}
                                                embedded={true}
                                            />
                                        );
                                    })()}
                                </div>
                            ) : activeSection === "terminal" ? (
                                /* Embedded User Terminal filling 100% remaining space */
                                <div className="flex-1 min-h-0 w-full overflow-hidden">
                                    <UserTerminal
                                        username={selectedUser.username}
                                        key={selectedUser.username}
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                    {activeSection === "overview" ? (
                                        <div className="space-y-6">
                                            {overviewLoading ? (
                                                <div className="flex items-center justify-center p-16">
                                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                                </div>
                                            ) : overviewError ? (
                                                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
                                                    {overviewError}
                                                </div>
                                            ) : overviewData ? (
                                                <div className="space-y-6">
                                                    {/* 4 Metric Summary Cards */}
                                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                                        {/* Card 1: Apps */}
                                                        <div className="border border-border bg-card p-5 relative overflow-hidden flex flex-col justify-between">
                                                            <div>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                                        Apps
                                                                    </span>
                                                                    <div className="p-2 rounded-md bg-primary/10 text-primary">
                                                                        <AppWindow className="h-4 w-4" />
                                                                    </div>
                                                                </div>
                                                                <div className="mt-3 flex items-baseline gap-2">
                                                                    <span className="text-3xl font-bold tracking-tight text-foreground">
                                                                        {overviewData.containers.total}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground">/ {userLimits?.maxContainers ?? 5} max</span>
                                                                </div>
                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                    {overviewData.containers.running} running · {overviewData.containers.stopped} stopped
                                                                </p>
                                                            </div>
                                                            <div className="mt-4 pt-3 border-t border-border">
                                                                <Link
                                                                    to={`/users/${encodeURIComponent(selectedUser.username)}/containers`}
                                                                    className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                                                                >
                                                                    Manage containers →
                                                                </Link>
                                                            </div>
                                                        </div>

                                                        {/* Card 2: Virtual Hosts */}
                                                        <div className="border border-border bg-card p-5 relative overflow-hidden flex flex-col justify-between">
                                                            <div>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                                        Virtual Hosts
                                                                    </span>
                                                                    <div className="p-2 rounded-md bg-primary/10 text-primary">
                                                                        <Globe className="h-4 w-4" />
                                                                    </div>
                                                                </div>
                                                                <div className="mt-3 flex items-baseline gap-2">
                                                                    <span className="text-3xl font-bold tracking-tight text-foreground">
                                                                        {overviewData.vhosts.total}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground">configured</span>
                                                                </div>
                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                    {overviewData.vhosts.items.filter((v) => v.tls).length} with SSL/TLS enabled
                                                                </p>
                                                            </div>
                                                            <div className="mt-4 pt-3 border-t border-border">
                                                                <Link
                                                                    to={`/users/${encodeURIComponent(selectedUser.username)}/vhosts`}
                                                                    className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                                                                >
                                                                    Manage vhosts →
                                                                </Link>
                                                            </div>
                                                        </div>

                                                        {/* Card 3: Storage */}
                                                        <div className="border border-border bg-card p-5 relative overflow-hidden flex flex-col justify-between">
                                                            <div>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                                        Storage
                                                                    </span>
                                                                    <div className="p-2 rounded-md bg-primary/10 text-primary">
                                                                        <HardDrive className="h-4 w-4" />
                                                                    </div>
                                                                </div>
                                                                <div className="mt-3 flex items-baseline gap-2">
                                                                    <span className="text-3xl font-bold tracking-tight text-foreground">
                                                                        {formatStorageBytes(overviewData.storage.homeUsed)}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground">home directory</span>
                                                                </div>
                                                                <p className="mt-1 text-xs text-muted-foreground truncate" title={overviewData.storage.homePath}>
                                                                    Disk: {overviewData.storage.diskUsage.toFixed(1)}% ({formatStorageBytes(overviewData.storage.diskUsed)} / {formatStorageBytes(overviewData.storage.diskTotal)})
                                                                </p>
                                                            </div>
                                                            <div className="mt-4 pt-3 border-t border-border">
                                                                <Link
                                                                    to={`/users/${encodeURIComponent(selectedUser.username)}/files`}
                                                                    className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                                                                >
                                                                    Browse files →
                                                                </Link>
                                                            </div>
                                                        </div>

                                                        {/* Card 4: Resource Limits */}
                                                        <div className="border border-border bg-card p-5 relative overflow-hidden flex flex-col justify-between">
                                                            <div>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                                        Resource Limits
                                                                    </span>
                                                                    <div className="p-2 rounded-md bg-primary/10 text-primary">
                                                                        <Sliders className="h-4 w-4" />
                                                                    </div>
                                                                </div>
                                                                <div className="mt-3 flex items-baseline gap-2">
                                                                    <span className="text-3xl font-bold tracking-tight text-foreground">
                                                                        {userLimits?.maxTasks ?? 10}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground">max tasks</span>
                                                                </div>
                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                    Max apps: {userLimits?.maxContainers ?? 5}
                                                                </p>
                                                            </div>
                                                            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setLimitsError("");
                                                                        setEditMaxTasks(userLimits?.maxTasks ?? 10);
                                                                        setEditMaxContainers(userLimits?.maxContainers ?? 5);
                                                                        setLimitsModalOpen(true);
                                                                    }}
                                                                    className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                                                                >
                                                                    Edit limits →
                                                                </button>
                                                                <Link
                                                                    to={`/users/${encodeURIComponent(selectedUser.username)}/tasking`}
                                                                    className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                                                                >
                                                                    Tasks →
                                                                </Link>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Storage Overview Progress & Breakdown */}
                                                    <div className="border border-border bg-card">
                                                        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
                                                            <div>
                                                                <h3 className="text-sm font-semibold text-foreground">Storage Overview</h3>
                                                                <p className="text-xs text-muted-foreground font-mono">{overviewData.storage.homePath}</p>
                                                            </div>
                                                            <span className="text-xs font-mono font-medium text-muted-foreground">
                                                                {formatStorageBytes(overviewData.storage.homeUsed)} used
                                                            </span>
                                                        </div>
                                                        <div className="p-5 space-y-4">
                                                            <div>
                                                                <div className="flex justify-between text-xs mb-1.5">
                                                                    <span className="text-muted-foreground">Filesystem Capacity</span>
                                                                    <span className="font-medium text-foreground">
                                                                        {formatStorageBytes(overviewData.storage.diskUsed)} / {formatStorageBytes(overviewData.storage.diskTotal)} ({overviewData.storage.diskUsage.toFixed(1)}%)
                                                                    </span>
                                                                </div>
                                                                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full transition-all duration-300 ${
                                                                            overviewData.storage.diskUsage > 90
                                                                                ? "bg-destructive"
                                                                                : overviewData.storage.diskUsage > 75
                                                                                ? "bg-amber-500"
                                                                                : "bg-primary"
                                                                        }`}
                                                                        style={{ width: `${Math.min(100, Math.max(0, overviewData.storage.diskUsage))}%` }}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {overviewData.storage.breakdown && Object.keys(overviewData.storage.breakdown).length > 0 && (
                                                                <div className="pt-3 border-t border-border">
                                                                    <h4 className="text-xs font-semibold text-muted-foreground mb-3">Directories in Home</h4>
                                                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                                                        {Object.entries(overviewData.storage.breakdown).map(([dir, size]) => (
                                                                            <div key={dir} className="p-2.5 rounded border border-border bg-muted/20">
                                                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                                                                    <Folder className="h-3.5 w-3.5 text-primary" />
                                                                                    <span className="font-medium truncate">{dir}/</span>
                                                                                </div>
                                                                                <span className="font-mono text-xs font-semibold text-foreground">
                                                                                    {formatStorageBytes(size)}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Containers & VHosts Preview Rows */}
                                                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                                        {/* Apps List */}
                                                        <div className="border border-border bg-card flex flex-col">
                                                            <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <AppWindow className="h-4 w-4 text-primary" />
                                                                    <h3 className="text-sm font-semibold text-foreground">Apps</h3>
                                                                </div>
                                                                <Link
                                                                    to={`/users/${encodeURIComponent(selectedUser.username)}/containers`}
                                                                    className="text-xs text-primary hover:underline font-medium"
                                                                >
                                                                    View all ({overviewData.containers.total})
                                                                </Link>
                                                            </div>
                                                            <div className="p-4 flex-1">
                                                                {overviewData.containers.items.length === 0 ? (
                                                                    <div className="text-center py-6 text-xs text-muted-foreground">
                                                                        No apps found for this user.
                                                                    </div>
                                                                ) : (
                                                                    <div className="divide-y divide-border">
                                                                        {overviewData.containers.items.slice(0, 5).map((c) => (
                                                                            <div key={c.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                                                                                <div className="min-w-0">
                                                                                    <div className="font-medium text-foreground truncate">{c.name}</div>
                                                                                    <div className="text-muted-foreground font-mono truncate text-xs">{c.image}</div>
                                                                                </div>
                                                                                <span
                                                                                    className={`px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${
                                                                                        c.status === "running"
                                                                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                                                                            : "bg-muted text-muted-foreground border border-border"
                                                                                    }`}
                                                                                >
                                                                                    {c.status}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Virtual Hosts List */}
                                                        <div className="border border-border bg-card flex flex-col">
                                                            <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <Globe className="h-4 w-4 text-primary" />
                                                                    <h3 className="text-sm font-semibold text-foreground">Virtual Hosts</h3>
                                                                </div>
                                                                <Link
                                                                    to={`/users/${encodeURIComponent(selectedUser.username)}/vhosts`}
                                                                    className="text-xs text-primary hover:underline font-medium"
                                                                >
                                                                    View all ({overviewData.vhosts.total})
                                                                </Link>
                                                            </div>
                                                            <div className="p-4 flex-1">
                                                                {overviewData.vhosts.items.length === 0 ? (
                                                                    <div className="text-center py-6 text-xs text-muted-foreground">
                                                                        No virtual hosts configured for this user.
                                                                    </div>
                                                                ) : (
                                                                    <div className="divide-y divide-border">
                                                                        {overviewData.vhosts.items.slice(0, 5).map((v) => (
                                                                            <div key={v.hostname} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                                                                                <div className="min-w-0">
                                                                                    <div className="font-medium text-foreground truncate">{v.hostname}</div>
                                                                                    {v.aliases && v.aliases.length > 0 && (
                                                                                        <div className="text-muted-foreground truncate text-xs">
                                                                                            {v.aliases.join(", ")}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <span
                                                                                    className={`px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${
                                                                                        v.tls
                                                                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                                                                            : "bg-muted text-muted-foreground border border-border"
                                                                                    }`}
                                                                                >
                                                                                    {v.tls ? "SSL / TLS" : "HTTP"}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                ) : activeSection === "containers" ? (
                                    <div className="space-y-4">
                                        <ContainersRoute embedded={true} ownerFilter={selectedUser.username} key={selectedUser.username} />
                                    </div>
                                ) : activeSection === "vhosts" ? (
                                    <div className="space-y-4">
                                        <VHostsRoute embedded={true} ownerFilter={selectedUser.username} key={selectedUser.username} />
                                    </div>
                                ) : activeSection === "backup" ? (
                                    <div className="space-y-4">
                                        <BackupRoute embedded={true} username={selectedUser.username} key={selectedUser.username} />
                                    </div>
                                ) : activeSection === "tasking" ? (
                                    <div className="space-y-4">
                                        <TaskingRoute embedded={true} username={selectedUser.username} key={selectedUser.username} />
                                    </div>
                                ) : activeSection === "apis" ? (
                                    <div className="space-y-4">
                                        <APIsRoute embedded={true} owner={selectedUser.username} key={selectedUser.username} />
                                    </div>
                                ) : null}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Empty state */
                        <div className="flex-grow flex flex-col items-center justify-center p-8 text-muted-foreground">
                            <User className="h-12 w-12 text-muted-foreground/30 mb-2 shrink-0" />
                            <p className="text-sm font-medium">Select a user from the list to view profile details.</p>
                        </div>
                    )}
                </main>
            </div>

            {contextMenu ? (
                <div
                    className="fixed z-[70] w-[210px] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onPointerDown={(event) => event.stopPropagation()}
                    role="menu"
                    aria-label={`Actions for ${contextMenu.user.username}`}
                >
                    <div className="border-b border-border px-2 py-1.5">
                        <p className="truncate text-xs font-semibold">{contextMenu.user.username}</p>
                        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                            UID {contextMenu.user.uid} · {contextMenu.user.home}
                        </p>
                    </div>
                    <button className="mt-1 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => navigateFromContextMenu("overview")} role="menuitem">
                        <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />Overview
                    </button>
                    <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => navigateFromContextMenu("files")} role="menuitem">
                        <Folder className="h-3.5 w-3.5 text-muted-foreground" />Files
                    </button>
                    <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => navigateFromContextMenu("containers")} role="menuitem">
                        <AppWindow className="h-3.5 w-3.5 text-muted-foreground" />Apps
                    </button>
                    <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => navigateFromContextMenu("vhosts")} role="menuitem">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />VHosts
                    </button>
                    <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => navigateFromContextMenu("tasking")} role="menuitem">
                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />Tasking
                    </button>
                    <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => navigateFromContextMenu("apis")} role="menuitem">
                        <Braces className="h-3.5 w-3.5 text-muted-foreground" />APIs
                    </button>
                    <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => navigateFromContextMenu("terminal")} role="menuitem">
                        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />Terminal
                    </button>
                    <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => navigateFromContextMenu("backup")} role="menuitem">
                        <Archive className="h-3.5 w-3.5 text-muted-foreground" />Backup
                    </button>
                    <div className="my-1 border-t border-border" />
                    <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={changePasswordFromContextMenu} role="menuitem">
                        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />Change Password
                    </button>

                    {!contextMenu.user.cpanelEnabled ? (
                        <>
                            <div className="my-1 border-t border-border" />
                            <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={activateFromContextMenu} role="menuitem">
                                <Key className="h-3.5 w-3.5 text-muted-foreground" />Activate cPanel
                            </button>
                        </>
                    ) : null}
                    {contextMenu.user.uid !== 0 ? (
                        <>
                            <div className="my-1 border-t border-border" />
                            <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10" onClick={deleteFromContextMenu} role="menuitem">
                                <Trash2 className="h-3.5 w-3.5" />Delete user
                            </button>
                        </>
                    ) : null}
                </div>
            ) : null}


            {deleteConfirmUser ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm border border-border bg-card shadow-lg">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div className="flex items-center gap-2.5">
                                <Trash2 className="h-4 w-4 text-destructive" />
                                <h3 className="text-sm font-semibold">Delete User</h3>
                            </div>
                            <button type="button" onClick={() => setDeleteConfirmUser(null)} disabled={isDeleting} aria-label="Close">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="space-y-3 p-5">
                            <p className="text-sm text-muted-foreground">
                                Are you sure you want to permanently delete this account?
                            </p>
                            <div className="rounded-none border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                                <p className="font-mono text-sm font-semibold text-destructive">{deleteConfirmUser.username}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{deleteConfirmUser.home}</p>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                All files in their home directory will be <span className="font-semibold text-destructive">permanently deleted</span> and cannot be recovered.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                            <Button type="button" variant="outline" onClick={() => setDeleteConfirmUser(null)} disabled={isDeleting}>Cancel</Button>
                            <Button
                                type="button"
                                className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={confirmDeleteUser}
                                disabled={isDeleting}
                            >
                                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete permanently
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {activationOpen && selectedUser ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <form onSubmit={activateCPanel} className="w-full max-w-md border border-border bg-card shadow-lg">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div>
                                <h3 className="text-sm font-semibold">Activate cPanel access</h3>
                                <p className="mt-1 font-mono text-xs text-muted-foreground">{selectedUser.username}</p>
                            </div>
                            <button type="button" onClick={() => setActivationOpen(false)} disabled={activationSaving} aria-label="Close activation modal">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="space-y-4 p-5">
                            <p className="text-xs leading-5 text-muted-foreground">
                                Set a Linux account password to allow this user to authenticate with cPanel.
                            </p>
                            <label className="block space-y-1.5 text-xs font-medium">
                                <span>Password</span>
                                <div className="relative">
                                    <input type={activationShowPassword ? "text" : "password"} value={activationPassword} onChange={(event) => setActivationPassword(event.target.value)} className="h-9 w-full border border-input bg-background px-3 pr-10 text-sm outline-none focus:border-primary" autoComplete="new-password" required />
                                    <button type="button" onClick={() => setActivationShowPassword((current) => !current)} className="absolute right-3 top-2.5 text-muted-foreground">
                                        {activationShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </label>
                            <label className="block space-y-1.5 text-xs font-medium">
                                <span>Confirm Password</span>
                                <input type={activationShowPassword ? "text" : "password"} value={activationConfirm} onChange={(event) => setActivationConfirm(event.target.value)} className="h-9 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary" autoComplete="new-password" required />
                            </label>
                            {activationError ? <p className="text-xs text-destructive">{activationError.trim()}</p> : null}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                            <Button type="button" variant="outline" onClick={() => setActivationOpen(false)} disabled={activationSaving}>Cancel</Button>
                            <Button type="submit" className="gap-2" disabled={activationSaving}>
                                {activationSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                                Activate
                            </Button>
                        </div>
                    </form>
                </div>
            ) : null}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md overflow-hidden rounded-none border border-border bg-card shadow-lg animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-border px-6 py-4">
                            <h3 className="text-lg font-semibold tracking-tight">Create Linux User</h3>
                            <button
                                onClick={handleCloseModal}
                                className="rounded-none opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Close</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            {createdUser ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 rounded-none bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle className="h-5 w-5 shrink-0" />
                                        <span>User created successfully!</span>
                                    </div>

                                    <div className="rounded-none bg-muted p-4 space-y-3">
                                        <div>
                                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Username</label>
                                            <span className="text-base font-mono font-bold select-all block mt-1">{createdUser.username}</span>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Password</label>
                                            <span className="text-base font-mono font-bold select-all block mt-1">{createdUser.password}</span>
                                        </div>
                                    </div>

                                    <div className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-none p-2.5">
                                        Please record this username and password. You will need them to log in to this account.
                                    </div>

                                    <Button onClick={handleCloseModal} className="w-full mt-4 rounded-none">
                                        Done
                                    </Button>
                                </div>
                            ) : (
                                <form onSubmit={handleCreateUser} className="space-y-4">
                                    {autoUsername ? (
                                    <div className="rounded-none border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-600 dark:text-blue-400 leading-normal">
                                        <strong>Username Notice:</strong> The username will be generated automatically using the prefix <code className="font-mono bg-blue-500/10 px-1 rounded-none">user-</code> followed by 8 random characters (e.g. <code className="font-mono bg-blue-500/10 px-1 rounded-none">user-ax9h2b7m</code>).
                                    </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <label htmlFor="username" className="text-sm font-medium">Username</label>
                                            <input
                                                id="username"
                                                value={username}
                                                onChange={(event) => setUsername(event.target.value)}
                                                placeholder="Enter Linux username"
                                                className="flex h-9 w-full rounded-none border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                required
                                            />
                                        </div>
                                    )}

                                    {modalError && (
                                        <div className="rounded-none border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                                            {modalError}
                                        </div>
                                    )}

                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <label htmlFor="password" className="text-sm font-medium">Password</label>
                                            <button
                                                type="button"
                                                onClick={generateRandomPassword}
                                                className="text-xs text-primary hover:underline"
                                            >
                                                Generate password
                                            </button>
                                        </div>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <input
                                                id="password"
                                                type={showPassword ? "text" : "password"}
                                                className="flex h-9 w-full rounded-none border border-input bg-transparent pl-9 pr-10 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                placeholder="Enter account password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword((prev) => !prev)}
                                                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</label>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <input
                                                id="confirmPassword"
                                                type={showPassword ? "text" : "password"}
                                                className="flex h-9 w-full rounded-none border border-input bg-transparent pl-9 pr-10 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                placeholder="Confirm account password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={handleCloseModal}
                                            disabled={isSubmitting}
                                            className="rounded-none"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="gap-2 rounded-none"
                                        >
                                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                            Create User
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {changePasswordOpen && changePasswordTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <form onSubmit={handleChangePassword} className="w-full max-w-md border border-border bg-card shadow-lg">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div>
                                <h3 className="text-sm font-semibold">Change Password</h3>
                                <p className="mt-1 font-mono text-xs text-muted-foreground">{changePasswordTarget.username}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setChangePasswordOpen(false)}
                                disabled={changePasswordSaving}
                                aria-label="Close"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="space-y-4 p-5">
                            {changePasswordSuccess ? (
                                <div className="flex items-center gap-3 rounded-none bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle className="h-5 w-5 shrink-0" />
                                    <span>Password changed successfully.</span>
                                </div>
                            ) : (
                                <>
                                    <p className="text-xs leading-5 text-muted-foreground">
                                        Set a new Linux account password for this user.
                                    </p>
                                    <label className="block space-y-1.5 text-xs font-medium">
                                        <div className="flex items-center justify-between">
                                            <span>New Password</span>
                                            <button type="button" onClick={generateChangePassword} className="text-xs text-primary hover:underline">
                                                Generate password
                                            </button>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type={changePasswordShow ? "text" : "password"}
                                                value={changePasswordValue}
                                                onChange={(e) => setChangePasswordValue(e.target.value)}
                                                className="h-9 w-full border border-input bg-background px-3 pr-10 text-sm outline-none focus:border-primary"
                                                autoComplete="new-password"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setChangePasswordShow((v) => !v)}
                                                className="absolute right-3 top-2.5 text-muted-foreground"
                                            >
                                                {changePasswordShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </label>
                                    <label className="block space-y-1.5 text-xs font-medium">
                                        <span>Confirm Password</span>
                                        <input
                                            type={changePasswordShow ? "text" : "password"}
                                            value={changePasswordConfirm}
                                            onChange={(e) => setChangePasswordConfirm(e.target.value)}
                                            className="h-9 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                                            autoComplete="new-password"
                                            required
                                        />
                                    </label>
                                    {changePasswordError ? (
                                        <p className="text-xs text-destructive">{changePasswordError.trim()}</p>
                                    ) : null}
                                </>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                            <Button type="button" variant="outline" onClick={() => setChangePasswordOpen(false)} disabled={changePasswordSaving}>
                                {changePasswordSuccess ? "Close" : "Cancel"}
                            </Button>
                            {!changePasswordSuccess && (
                                <Button type="submit" className="gap-2" disabled={changePasswordSaving}>
                                    {changePasswordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                    Change Password
                                </Button>
                            )}
                        </div>
                    </form>
                </div>
            )}

            {/* User Limits Modal */}
            {limitsModalOpen && selectedUser && (

                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-border pb-3">
                            <div className="flex items-center gap-2">
                                <Sliders className="h-5 w-5 text-primary" />
                                <h3 className="text-sm font-semibold text-foreground">
                                    Resource Limits: {selectedUser.username}
                                </h3>
                            </div>
                            <button
                                onClick={() => setLimitsModalOpen(false)}
                                className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Configure resource quotas for this user. These limits restrict how many scheduled tasks and apps the user can create.
                        </p>

                        {limitsError && (
                            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                                {limitsError}
                            </div>
                        )}

                        <form onSubmit={handleSaveLimits} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                    Max Tasks (Cron Jobs)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="1000"
                                    required
                                    value={editMaxTasks}
                                    onChange={(e) => setEditMaxTasks(parseInt(e.target.value, 10) || 0)}
                                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Maximum number of scheduled cron tasks allowed (default: 10).
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                    Max Apps
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="1000"
                                    required
                                    value={editMaxContainers}
                                    onChange={(e) => setEditMaxContainers(parseInt(e.target.value, 10) || 0)}
                                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Maximum number of applications allowed (default: 5).
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setLimitsModalOpen(false)}
                                    disabled={limitsSaving}
                                    className="text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={limitsSaving}
                                    className="text-xs font-medium"
                                >
                                    {limitsSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                    Save Limits
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}

// Simple AlertCircle fallback since we need it in root.tsx & user.tsx
function AlertCircle({ className }: { className?: string }) {
    return (
        <span className={className}>⚠️</span>
    );
}

type UserSection = "overview" | "files" | "containers" | "vhosts" | "terminal" | "backup" | "tasking" | "apis";

function userSection(section?: string): UserSection {
    return section === "files" || section === "containers" || section === "vhosts" || section === "terminal" || section === "backup" || section === "tasking" || section === "apis" ? section : "overview";
}

function UserSubItem({ username, section, active, icon: Icon, label }: {
    username: string;
    section: UserSection;
    active: boolean;
    icon: typeof User;
    label: string;
}) {
    return (
        <Link
            to={`/users/${encodeURIComponent(username)}/${section}`}
            className={`flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs transition-colors ${
                active ? "font-semibold text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
        >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
        </Link>
    );
}

function UserInfoBox({ icon: Icon, label, value }: {
    icon: typeof User;
    label: string;
    value: string;
}) {
    return (
        <div className="flex h-7 min-w-0 max-w-full items-center gap-2 border border-border bg-card/40 px-2.5 rounded-sm">
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <span className="max-w-48 truncate font-mono text-xs text-foreground" title={value}>{value}</span>
        </div>
    );
}
