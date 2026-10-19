import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    AppWindow,
    Box,
    ChevronDown,
    ChevronRight,
    FileCode2,
    FileText,
    FolderOpen,
    Layers,
    Loader2,
    Lock,
    Pencil,
    Play,
    Plus,
    RefreshCw,
    RotateCw,
    Save,
    Search,
    Server,
    ShieldCheck,
    Sliders,
    Square,
    Trash2,
    User,
    Wrench,
    X,
} from "lucide-react";

import DashboardLayout from "_layouts/dashboard";
import { Button } from "_layouts/_components/ui/button";
import Api from "_utils/api";
import { runtime } from "../../runtime";

export type ContainerRecord = {
    id: string;
    name: string;
    image: string;
    command?: string;
    engine: "podman" | string;
    owner: string;
    state: string;
    status: string;
    createdAt?: string;
    ports: string[];
    type?: "docker" | "direct";
    runtime?: string;
    path?: string;
    relativePath?: string;
};

export type LinuxUser = {
    username: string;
    uid?: number;
};

export type LibraryImage = {
    id: string;
    name: string;
    image: string;
    category: "ai" | "automation" | "runtime" | "database" | "cache" | "tools" | string;
    description: string;
    defaultPorts?: Array<{ host: string; container: string }>;
    defaultEnv?: Array<{ key: string; value: string }>;
    defaultVolumes?: Array<{ host: string; container: string }>;
    tags: string[];
    enabled?: boolean;
    isCustom?: boolean;
};

export type UserLimits = {
    username: string;
    maxTasks: number;
    maxContainers: number;
    currentTasks?: number;
    currentContainers?: number;
};

function formatRuntimeLanguage(runtime?: string): string {
    switch (runtime?.toLowerCase()) {
        case "php":
            return "PHP";
        case "node":
            return "Node.js";
        case "python":
            return "Python";
        case "static":
            return "Static HTML";
        default:
            return runtime ? runtime.toUpperCase() : "Static HTML";
    }
}

const LIB_CATEGORIES = [
    { id: "all", label: "All" },
    { id: "automation", label: "Automation" },
    { id: "ai", label: "AI & LLM" },
    { id: "runtime", label: "Runtimes" },
    { id: "database", label: "Databases" },
    { id: "cache", label: "Cache & Queue" },
    { id: "tools", label: "Dev Tools" },
];

const DEFAULT_LIBRARY_IMAGES: LibraryImage[] = [
    // ── Automation & Workflows ──
    {
        id: "n8n",
        name: "n8n",
        image: "n8nio/n8n:latest",
        category: "automation",
        description: "Extensible workflow automation platform with AI agent nodes and 400+ integrations.",
        defaultPorts: [{ host: "5678", container: "5678" }],
        defaultVolumes: [{ host: "n8n_data", container: "/home/node/.n8n" }],
        defaultEnv: [
            { key: "GENERIC_TIMEZONE", value: "Asia/Ho_Chi_Minh" },
            { key: "TZ", value: "Asia/Ho_Chi_Minh" },
        ],
        tags: ["latest", "next"],
        enabled: true,
    },
    {
        id: "flowise",
        name: "Flowise",
        image: "flowiseai/flowise:latest",
        category: "automation",
        description: "Drag-and-drop UI to build customized LLM orchestration flows, chains, and AI agents.",
        defaultPorts: [{ host: "3000", container: "3000" }],
        defaultVolumes: [{ host: "flowise_data", container: "/root/.flowise" }],
        tags: ["latest"],
        enabled: true,
    },
    {
        id: "activepieces",
        name: "Activepieces",
        image: "activepieces/activepieces:latest",
        category: "automation",
        description: "Open-source no-code business automation tool, self-hosted Zapier alternative.",
        defaultPorts: [{ host: "8080", container: "80" }],
        tags: ["latest"],
        enabled: true,
    },
    {
        id: "pocketbase",
        name: "PocketBase",
        image: "muchobien/pocketbase:latest",
        category: "automation",
        description: "Open-source realtime backend in 1 file with embedded SQLite database and auth.",
        defaultPorts: [{ host: "8090", container: "8090" }],
        defaultVolumes: [{ host: "pb_data", container: "/pb/pb_data" }],
        tags: ["latest"],
        enabled: true,
    },
    {
        id: "directus",
        name: "Directus",
        image: "directus/directus:latest",
        category: "automation",
        description: "Composable data engine, instant REST/GraphQL API, and intuitive headless CMS.",
        defaultPorts: [{ host: "8055", container: "8055" }],
        tags: ["latest"],
        enabled: true,
    },

    // ── AI & LLM ──
    {
        id: "ollama",
        name: "Ollama",
        image: "ollama/ollama:latest",
        category: "ai",
        description: "Run Llama 3, Mistral, Gemma, Phi, and other open-source LLMs locally.",
        defaultPorts: [{ host: "11434", container: "11434" }],
        defaultVolumes: [{ host: "ollama", container: "/root/.ollama" }],
        tags: ["latest"],
        enabled: true,
    },
    {
        id: "open-webui",
        name: "Open WebUI",
        image: "ghcr.io/open-webui/open-webui:main",
        category: "ai",
        description: "Feature-rich, user-friendly ChatGPT-like web interface for Ollama and local LLMs.",
        defaultPorts: [{ host: "3000", container: "8080" }],
        defaultVolumes: [{ host: "open-webui", container: "/app/backend/data" }],
        defaultEnv: [{ key: "OLLAMA_BASE_URL", value: "http://host.containers.internal:11434" }],
        tags: ["main", "latest", "cuda"],
        enabled: true,
    },
    {
        id: "localai",
        name: "LocalAI",
        image: "localai/localai:latest",
        category: "ai",
        description: "Self-hosted, drop-in replacement REST API compatible with OpenAI specifications.",
        defaultPorts: [{ host: "8080", container: "8080" }],
        defaultVolumes: [{ host: "localai-models", container: "/build/models" }],
        tags: ["latest"],
        enabled: true,
    },
    {
        id: "qdrant",
        name: "Qdrant",
        image: "qdrant/qdrant:latest",
        category: "ai",
        description: "High-performance vector database & search engine for AI embeddings and RAG.",
        defaultPorts: [
            { host: "6333", container: "6333" },
            { host: "6334", container: "6334" },
        ],
        defaultVolumes: [{ host: "qdrant_storage", container: "/qdrant/storage" }],
        tags: ["latest"],
        enabled: true,
    },
    {
        id: "chroma",
        name: "ChromaDB",
        image: "chromadb/chroma:latest",
        category: "ai",
        description: "Open-source embedding database for AI application memory and search.",
        defaultPorts: [{ host: "8000", container: "8000" }],
        defaultVolumes: [{ host: "chroma_data", container: "/chroma/chroma" }],
        tags: ["latest"],
        enabled: true,
    },
    {
        id: "vllm",
        name: "vLLM",
        image: "vllm/vllm-openai:latest",
        category: "ai",
        description: "High-throughput, low-latency LLM serving engine with OpenAI-compatible API.",
        defaultPorts: [{ host: "8000", container: "8000" }],
        tags: ["latest"],
        enabled: true,
    },

    // ── Runtimes ──
    {
        id: "node",
        name: "Node.js",
        image: "node:20-alpine",
        category: "runtime",
        description: "JavaScript runtime built on Chrome's V8 engine for building fast web apps and APIs.",
        defaultPorts: [{ host: "3000", container: "3000" }],
        tags: ["20-alpine", "22-alpine", "latest", "lts-alpine"],
        enabled: true,
    },
    {
        id: "python",
        name: "Python",
        image: "python:3.12-alpine",
        category: "runtime",
        description: "Modern Python programming language runtime with pip and virtual environment support.",
        defaultPorts: [{ host: "8000", container: "8000" }],
        tags: ["3.12-alpine", "3.11-alpine", "latest"],
        enabled: true,
    },
    {
        id: "bun",
        name: "Bun",
        image: "oven/bun:alpine",
        category: "runtime",
        description: "Incredibly fast all-in-one JavaScript & TypeScript runtime, bundler, and package manager.",
        defaultPorts: [{ host: "3000", container: "3000" }],
        tags: ["alpine", "latest", "debian"],
        enabled: true,
    },
    {
        id: "golang",
        name: "Golang",
        image: "golang:1.22-alpine",
        category: "runtime",
        description: "Official Go compiler and runtime environment for building fast, concurrent systems.",
        tags: ["1.22-alpine", "1.23-alpine", "latest"],
        enabled: true,
    },
    {
        id: "deno",
        name: "Deno",
        image: "denoland/deno:alpine",
        category: "runtime",
        description: "Next-generation secure JavaScript, TypeScript, and WebAssembly runtime.",
        defaultPorts: [{ host: "8000", container: "8000" }],
        tags: ["alpine", "latest"],
        enabled: true,
    },
    {
        id: "php",
        name: "PHP FPM",
        image: "php:8.3-fpm-alpine",
        category: "runtime",
        description: "FastCGI Process Manager implementation for PHP web applications.",
        defaultPorts: [{ host: "9000", container: "9000" }],
        tags: ["8.3-fpm-alpine", "8.2-fpm-alpine", "latest"],
        enabled: true,
    },
    {
        id: "rust",
        name: "Rust",
        image: "rust:alpine",
        category: "runtime",
        description: "Official Rust programming language compiler and Cargo toolchain.",
        tags: ["alpine", "latest"],
        enabled: true,
    },

    // ── Databases ──
    {
        id: "postgres",
        name: "PostgreSQL",
        image: "postgres:16-alpine",
        category: "database",
        description: "World's most advanced open source relational database.",
        defaultPorts: [{ host: "5432", container: "5432" }],
        defaultEnv: [{ key: "POSTGRES_PASSWORD", value: "" }],
        defaultVolumes: [{ host: "postgres_data", container: "/var/lib/postgresql/data" }],
        tags: ["16-alpine", "15-alpine", "latest"],
        enabled: true,
    },
    {
        id: "mysql",
        name: "MySQL",
        image: "mysql:8",
        category: "database",
        description: "Widely used open source relational database management system.",
        defaultPorts: [{ host: "3306", container: "3306" }],
        defaultEnv: [{ key: "MYSQL_ROOT_PASSWORD", value: "" }],
        defaultVolumes: [{ host: "mysql_data", container: "/var/lib/mysql" }],
        tags: ["8", "8.4", "latest"],
        enabled: true,
    },
    {
        id: "mariadb",
        name: "MariaDB",
        image: "mariadb:11",
        category: "database",
        description: "Fast, scalable open source relational database made by MySQL original creators.",
        defaultPorts: [{ host: "3306", container: "3306" }],
        defaultEnv: [{ key: "MARIADB_ROOT_PASSWORD", value: "" }],
        defaultVolumes: [{ host: "mariadb_data", container: "/var/lib/mysql" }],
        tags: ["11", "latest"],
        enabled: true,
    },
    {
        id: "mongo",
        name: "MongoDB",
        image: "mongo:7",
        category: "database",
        description: "Modern, document-oriented NoSQL general purpose database.",
        defaultPorts: [{ host: "27017", container: "27017" }],
        defaultVolumes: [{ host: "mongo_data", container: "/data/db" }],
        tags: ["7", "6", "latest"],
        enabled: true,
    },

    // ── Cache & Queue ──
    {
        id: "redis",
        name: "Redis",
        image: "redis:alpine",
        category: "cache",
        description: "In-memory key-value data store, cache, and message broker.",
        defaultPorts: [{ host: "6379", container: "6379" }],
        defaultVolumes: [{ host: "redis_data", container: "/data" }],
        tags: ["alpine", "7-alpine", "latest"],
        enabled: true,
    },
    {
        id: "rabbitmq",
        name: "RabbitMQ",
        image: "rabbitmq:3-management-alpine",
        category: "cache",
        description: "Robust open source message broker with web management interface.",
        defaultPorts: [
            { host: "5672", container: "5672" },
            { host: "15672", container: "15672" },
        ],
        tags: ["3-management-alpine", "latest"],
        enabled: true,
    },
    {
        id: "memcached",
        name: "Memcached",
        image: "memcached:alpine",
        category: "cache",
        description: "High-performance, distributed memory object caching system.",
        defaultPorts: [{ host: "11211", container: "11211" }],
        tags: ["alpine", "latest"],
        enabled: true,
    },

    // ── Dev Tools ──
    {
        id: "adminer",
        name: "Adminer",
        image: "adminer:latest",
        category: "tools",
        description: "Database management in a single PHP file supporting MySQL, Postgres, SQLite.",
        defaultPorts: [{ host: "8080", container: "8080" }],
        tags: ["latest"],
        enabled: true,
    },
    {
        id: "meilisearch",
        name: "Meilisearch",
        image: "getmeili/meilisearch:v1.7",
        category: "tools",
        description: "Lightning-fast, typo-tolerant search engine with intuitive REST APIs.",
        defaultPorts: [{ host: "7700", container: "7700" }],
        defaultVolumes: [{ host: "meili_data", container: "/meili_data" }],
        tags: ["v1.7", "latest"],
        enabled: true,
    },
    {
        id: "minio",
        name: "MinIO",
        image: "minio/minio:latest",
        category: "tools",
        description: "High-performance, S3-compatible cloud object storage service.",
        defaultPorts: [
            { host: "9000", container: "9000" },
            { host: "9001", container: "9001" },
        ],
        defaultVolumes: [{ host: "minio_data", container: "/data" }],
        defaultEnv: [
            { key: "MINIO_ROOT_USER", value: "admin" },
            { key: "MINIO_ROOT_PASSWORD", value: "password123" },
        ],
        tags: ["latest"],
        enabled: true,
    },
    {
        id: "uptime-kuma",
        name: "Uptime Kuma",
        image: "louislam/uptime-kuma:1",
        category: "tools",
        description: "Self-hosted monitoring tool for HTTP, TCP, Ping, and service uptime.",
        defaultPorts: [{ host: "3001", container: "3001" }],
        defaultVolumes: [{ host: "uptime_kuma", container: "/app/data" }],
        tags: ["1", "latest"],
        enabled: true,
    },
    {
        id: "alpine",
        name: "Alpine Linux",
        image: "alpine:latest",
        category: "tools",
        description: "Lightweight, security-oriented Linux distribution (~5MB).",
        tags: ["latest", "3.20"],
        enabled: true,
    },
    {
        id: "ubuntu",
        name: "Ubuntu",
        image: "ubuntu:latest",
        category: "tools",
        description: "Clean Ubuntu Linux official base container environment.",
        tags: ["latest", "24.04", "22.04"],
        enabled: true,
    },
];

interface ContainersRouteProps {
    embedded?: boolean;
    ownerFilter?: string;
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

export default function ContainersRoute({
    embedded = false,
    ownerFilter,
}: ContainersRouteProps = {}) {
    if (embedded) {
        return <ContainersContent activeOwner={ownerFilter} embedded />;
    }
    if (!runtime.isRoot) {
        return <ContainersUserStandalone />;
    }
    return <ContainersStandalone />;
}

// ─── Non-root User Standalone (Single column, no subsidebar) ─────────────────

function ContainersUserStandalone() {
    return (
        <DashboardLayout title="Apps" fullWidth>
            <div className="h-full overflow-y-auto p-6">
                <ContainersContent />
            </div>
        </DashboardLayout>
    );
}

// ─── Root Standalone with 220px Subsidebar ───────────────────────────────────

function ContainersStandalone() {
    const { owner: ownerParam } = useParams<{ owner?: string }>();
    const activeOwner = ownerParam || "all";

    const [users, setUsers] = useState<LinuxUser[]>([]);
    const [usersOpen, setUsersOpen] = useState(true);
    const [loadingUsers, setLoadingUsers] = useState(true);

    const [allContainers, setAllContainers] = useState<ContainerRecord[]>([]);
    const [loadingContainers, setLoadingContainers] = useState(true);
    const [containerError, setContainerError] = useState("");

    const fetchAllContainers = useCallback(async () => {
        setLoadingContainers(true);
        setContainerError("");
        try {
            const res = await fetch("/post/containers", { cache: "no-store" });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to load apps");
            }
            const data = await res.json();
            setAllContainers(data.containers || []);
        } catch (err) {
            setContainerError(err instanceof Error ? err.message : "Failed to load apps");
        } finally {
            setLoadingContainers(false);
        }
    }, []);

    useEffect(() => {
        fetchAllContainers();
    }, [fetchAllContainers]);

    useEffect(() => {
        setLoadingUsers(true);
        fetch("/post/user/list", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                // Filter out root (uid 0) - apps always run under non-root users!
                const list: LinuxUser[] = (data?.users ?? []).filter(
                    (u: LinuxUser) => u.uid !== 0
                );
                setUsers(list);
            })
            .catch(() => setUsers([]))
            .finally(() => setLoadingUsers(false));
    }, []);

    const containersByOwner = useMemo(() => {
        const map: Record<string, number> = {};
        for (const c of allContainers) {
            map[c.owner] = (map[c.owner] || 0) + 1;
        }
        return map;
    }, [allContainers]);

    return (
        <DashboardLayout title="Apps" fullWidth>
            <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-[220px_1fr]">
                {/* Subsidebar */}
                <aside className="flex h-full flex-col overflow-y-auto border-r border-border bg-card/60">
                    {/* All Apps Link */}
                    <Link
                        to="/apps"
                        className={`flex items-center justify-between border-b border-border px-3 py-3 text-xs font-semibold transition-colors ${
                            activeOwner === "all"
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <AppWindow className="h-4 w-4 shrink-0" />
                            All Apps
                        </span>
                        <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                activeOwner === "all"
                                    ? "bg-primary/20 text-primary"
                                    : "bg-muted text-muted-foreground"
                            }`}
                        >
                            {allContainers.length}
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
                                    <p className="px-2 py-1 text-xs text-muted-foreground">No non-root users</p>
                                ) : (
                                    users.map((u) => {
                                        const count = containersByOwner[u.username] || 0;
                                        const isSelected = activeOwner === u.username;
                                        return (
                                            <Link
                                                key={u.username}
                                                to={`/apps/${encodeURIComponent(u.username)}`}
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
                    <ContainersContent
                        activeOwner={activeOwner}
                        usersList={users}
                        allContainers={allContainers}
                        loadingContainers={loadingContainers}
                        containerError={containerError}
                        onRefreshContainers={fetchAllContainers}
                    />
                </main>
            </div>
        </DashboardLayout>
    );
}

// ─── Containers Content (Core Table & Modals) ────────────────────────────────

interface ContainersContentProps {
    activeOwner?: string;
    embedded?: boolean;
    usersList?: LinuxUser[];
    allContainers?: ContainerRecord[];
    loadingContainers?: boolean;
    containerError?: string;
    onRefreshContainers?: () => void;
}

export function ContainersContent({
    activeOwner,
    embedded = false,
    usersList = [],
    allContainers,
    loadingContainers: externalLoading,
    containerError: externalError,
    onRefreshContainers,
}: ContainersContentProps) {
    const isControlled = Array.isArray(allContainers);
    const [localContainers, setLocalContainers] = useState<ContainerRecord[]>([]);
    const [localLoading, setLocalLoading] = useState(!isControlled);
    const [localError, setLocalError] = useState("");
    const [actionLoading, setActionLoading] = useState("");

    const [logsContainer, setLogsContainer] = useState<ContainerRecord | null>(null);
    const [logs, setLogs] = useState("");
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsError, setLogsError] = useState("");

    const [dockerfileContainer, setDockerfileContainer] = useState<ContainerRecord | null>(null);
    const [dockerfileContent, setDockerfileContent] = useState("");
    const [dockerfilePath, setDockerfilePath] = useState("");
    const [dockerfileLoading, setDockerfileLoading] = useState(false);
    const [dockerfileSaving, setDockerfileSaving] = useState(false);
    const [dockerfileError, setDockerfileError] = useState("");

    const [searchTerm, setSearchTerm] = useState("");
    const [userLimits, setUserLimits] = useState<UserLimits | null>(null);

    // Non-root users list fallback for embedded / local mode
    const [localUsers, setLocalUsers] = useState<LinuxUser[]>([]);
    const users = usersList.length > 0 ? usersList : localUsers;

    // Allowed Templates and Settings state
    const [templates, setTemplates] = useState<LibraryImage[]>(DEFAULT_LIBRARY_IMAGES);
    const [libraryOnly, setLibraryOnly] = useState<boolean>(false);
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsError, setSettingsError] = useState("");
    const [settingsSearch, setSettingsSearch] = useState("");
    const [settingsCategory, setSettingsCategory] = useState("all");

    // Template Add / Edit state
    const [templateEditModal, setTemplateEditModal] = useState<LibraryImage | null>(null);
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
    const [editTplId, setEditTplId] = useState("");
    const [editTplName, setEditTplName] = useState("");
    const [editTplImage, setEditTplImage] = useState("");
    const [editTplCategory, setEditTplCategory] = useState("automation");
    const [editTplDescription, setEditTplDescription] = useState("");
    const [editTplTags, setEditTplTags] = useState("");
    const [editTplPorts, setEditTplPorts] = useState<Array<{ host: string; container: string }>>([]);
    const [editTplVolumes, setEditTplVolumes] = useState<Array<{ host: string; container: string }>>([]);
    const [editTplEnv, setEditTplEnv] = useState<Array<{ key: string; value: string }>>([]);
    const [editTplEnabled, setEditTplEnabled] = useState(true);
    const [editTplError, setEditTplError] = useState("");

    // Delete template confirmation
    const [templateDeleteTarget, setTemplateDeleteTarget] = useState<LibraryImage | null>(null);
    // Reset confirmation
    const [resetModalOpen, setResetModalOpen] = useState(false);

    // Create container modal state
    // Note: Container MUST run under non-root user!
    const effectiveDefaultOwner = useMemo(() => {
        if (!runtime.isRoot) {
            return runtime.username || "";
        }
        if (activeOwner && activeOwner !== "all") {
            return activeOwner;
        }
        return users[0]?.username || "";
    }, [activeOwner, users]);

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createTab, setCreateTab] = useState<"system" | "support" | "custom">("system");
    const [libSearch, setLibSearch] = useState("");
    const [libCategory, setLibCategory] = useState("all");
    const [selectedLibImage, setSelectedLibImage] = useState<LibraryImage | null>(null);

    const [createName, setCreateName] = useState("");
    const [createImage, setCreateImage] = useState("");
    const [createOwner, setCreateOwner] = useState(effectiveDefaultOwner);
    const [createCommand, setCreateCommand] = useState("");
    const [createRestartPolicy, setCreateRestartPolicy] = useState("unless-stopped");
    const [createPorts, setCreatePorts] = useState<Array<{ host: string; container: string }>>([]);
    const [createVolumes, setCreateVolumes] = useState<Array<{ host: string; container: string }>>([]);
    const [createEnv, setCreateEnv] = useState<Array<{ key: string; value: string }>>([]);
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState("");
    const [customAppMode, setCustomAppMode] = useState<"docker" | "direct">("docker");
    const [directRuntime, setDirectRuntime] = useState<"php" | "node" | "python" | "static">("php");

    // Delete container modal state
    const [deleteModal, setDeleteModal] = useState<ContainerRecord | null>(null);

    // Load users if not provided and runtime is root
    useEffect(() => {
        if (!runtime.isRoot || usersList.length > 0) return;
        fetch("/post/user/list", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const list: LinuxUser[] = (data?.users ?? []).filter((u: LinuxUser) => u.uid !== 0);
                setLocalUsers(list);
            })
            .catch(() => setLocalUsers([]));
    }, [usersList.length]);

    // Fetch allowed templates from server
    const fetchTemplates = useCallback(async () => {
        try {
            const response = await fetch(`${Api.current.containers}/templates`, { cache: "no-store" });
            if (response.ok) {
                const data: { templates?: LibraryImage[]; libraryOnly?: boolean } = await response.json();
                if (Array.isArray(data.templates) && data.templates.length > 0) {
                    setTemplates(data.templates);
                }
                if (typeof data.libraryOnly === "boolean") {
                    setLibraryOnly(data.libraryOnly);
                }
            }
        } catch {
            // Keep default fallback
        }
    }, []);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    // Local container fetch (if not controlled)
    const fetchLocalContainers = useCallback(async () => {
        if (isControlled) return;
        setLocalLoading(true);
        setLocalError("");
        try {
            let ep: string;
            if (runtime.isRoot) {
                ep = activeOwner && activeOwner !== "all"
                    ? `/post/containers?owner=${encodeURIComponent(activeOwner)}`
                    : "/post/containers";
            } else {
                ep = "/api/containers";
            }
            const res = await fetch(ep, { cache: "no-store" });
            if (!res.ok) throw new Error((await res.text()) || "Failed to load containers");
            const data = await res.json();
            setLocalContainers(data.containers ?? []);
        } catch (err) {
            setLocalError(err instanceof Error ? err.message : "Failed to load containers");
        } finally {
            setLocalLoading(false);
        }
    }, [isControlled, activeOwner]);

    // Fetch limits for target user
    const fetchLimits = useCallback(async () => {
        try {
            if (runtime.isRoot) {
                const targetUser = activeOwner && activeOwner !== "all" ? activeOwner : null;
                if (targetUser) {
                    const res = await fetch(`/post/user/limits?user=${encodeURIComponent(targetUser)}`, {
                        cache: "no-store",
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setUserLimits(data);
                    } else {
                        setUserLimits(null);
                    }
                } else {
                    setUserLimits(null);
                }
            } else {
                const res = await fetch("/api/user/limits", { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json();
                    setUserLimits(data);
                }
            }
        } catch {
            setUserLimits(null);
        }
    }, [activeOwner]);

    useEffect(() => {
        if (!isControlled) {
            fetchLocalContainers();
        }
        fetchLimits();
    }, [isControlled, fetchLocalContainers, fetchLimits]);

    const handleRefresh = () => {
        if (isControlled && onRefreshContainers) {
            onRefreshContainers();
        } else {
            fetchLocalContainers();
        }
        fetchLimits();
    };

    const isLoading = isControlled ? !!externalLoading : localLoading;
    const currentError = (isControlled ? externalError : localError);

    // Filter containers based on selected owner
    const scopedContainers = useMemo(() => {
        const raw = isControlled ? (allContainers || []) : localContainers;
        if (!activeOwner || activeOwner === "all") {
            return raw;
        }
        return raw.filter((c) => c.owner === activeOwner);
    }, [isControlled, allContainers, localContainers, activeOwner]);

    // Search filter
    const displayedContainers = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return scopedContainers;
        return scopedContainers.filter((c) =>
            (c.name && c.name.toLowerCase().includes(term)) ||
            (c.owner && c.owner.toLowerCase().includes(term)) ||
            (c.image && c.image.toLowerCase().includes(term)) ||
            (c.id && c.id.toLowerCase().includes(term))
        );
    }, [scopedContainers, searchTerm]);

    // Allowed templates (only enabled ones)
    const allowedTemplates = useMemo(() => {
        return templates.filter((t) => t.enabled !== false);
    }, [templates]);

    // Filter library tab in Create Container modal
    const filteredLibImages = useMemo(() => {
        return allowedTemplates.filter((item) => {
            const matchCat = libCategory === "all" || item.category === libCategory;
            const matchSearch =
                !libSearch.trim() ||
                item.name.toLowerCase().includes(libSearch.toLowerCase()) ||
                item.description.toLowerCase().includes(libSearch.toLowerCase()) ||
                item.image.toLowerCase().includes(libSearch.toLowerCase());
            return matchCat && matchSearch;
        });
    }, [allowedTemplates, libCategory, libSearch]);

    const runAction = async (container: ContainerRecord, action: "start" | "stop" | "restart" | "rm") => {
        const key = `${container.engine}:${container.owner}:${container.id}:${action}`;
        setActionLoading(key);
        try {
            const response = await fetch(`${Api.current.containers}/action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, engine: container.engine, id: container.id, owner: container.owner }),
            });
            if (!response.ok) throw new Error((await response.text()) || `Failed to ${action} container`);
            handleRefresh();
        } catch (actionError) {
            alert(actionError instanceof Error ? actionError.message : `Failed to ${action} container`);
        } finally {
            setActionLoading("");
        }
    };

    const selectLibraryImage = (item: LibraryImage) => {
        setSelectedLibImage(item);
        setCreateImage(item.image);
        setCreatePorts(item.defaultPorts ? item.defaultPorts.map((p) => ({ ...p })) : []);
        setCreateVolumes(item.defaultVolumes ? item.defaultVolumes.map((v) => ({ ...v })) : []);
        setCreateEnv(item.defaultEnv ? item.defaultEnv.map((e) => ({ ...e })) : []);
        if (!createName.trim()) {
            const cleanId = item.id.toLowerCase().replace(/[^a-z0-9_-]/g, "");
            setCreateName(`${cleanId}-1`);
        }
    };

    const selectTag = (tag: string) => {
        if (!selectedLibImage) return;
        const base = selectedLibImage.image.split(":")[0];
        setCreateImage(`${base}:${tag}`);
    };

    const openCreateModal = () => {
        setCreateTab("system");
        setCustomAppMode("docker");
        setDirectRuntime("php");
        setCreateName("");
        const initial = allowedTemplates[0] || templates[0];
        if (initial) {
            setSelectedLibImage(initial);
            setCreateImage(initial.image);
            setCreatePorts(initial.defaultPorts ? initial.defaultPorts.map((p) => ({ ...p })) : []);
            setCreateVolumes(initial.defaultVolumes ? initial.defaultVolumes.map((v) => ({ ...v })) : []);
            setCreateEnv(initial.defaultEnv ? initial.defaultEnv.map((e) => ({ ...e })) : []);
        } else {
            setSelectedLibImage(null);
            setCreateImage("");
            setCreatePorts([]);
            setCreateVolumes([]);
            setCreateEnv([]);
        }
        setLibSearch("");
        setLibCategory("all");
        setCreateOwner(effectiveDefaultOwner);
        setCreateCommand("");
        setCreateRestartPolicy("unless-stopped");
        setCreateError("");
        setCreateModalOpen(true);
    };

    const handleCreateContainer = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (createTab === "system") {
            setCreateError("System applications are coming soon. Please select an app from Support or Custom tab.");
            return;
        }

        const trimmedName = createName.trim().toLowerCase();
        if (!trimmedName) {
            setCreateError("App name is required.");
            return;
        }
        if (!/^[a-z0-9_-]+$/.test(trimmedName)) {
            setCreateError("App name can only contain lowercase letters, numbers, hyphens (-), and underscores (_). No spaces.");
            return;
        }

        const isDirect = createTab === "custom" && customAppMode === "direct";
        const trimmedImage = createImage.trim();
        if (!isDirect && !trimmedImage) {
            setCreateError("Container image is required.");
            return;
        }

        const selectedOwner = runtime.isRoot ? createOwner : (runtime.username || "");
        if (!selectedOwner || selectedOwner === "root") {
            setCreateError("A non-root user must be selected as the app owner.");
            return;
        }

        if (libraryOnly && !runtime.isRoot && createTab === "custom") {
            setCreateError("Custom app creation is restricted. Please select an app from the Support tab.");
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
                if (k) {
                    env[k] = item.value;
                }
            }

            const payload = {
                name: trimmedName,
                owner: selectedOwner,
                type: isDirect ? "direct" : "docker",
                runtime: isDirect ? directRuntime : "docker",
                image: isDirect ? "" : trimmedImage,
                command: isDirect ? "" : createCommand.trim(),
                restartPolicy: isDirect ? "" : createRestartPolicy,
                ports: isDirect ? [] : ports,
                volumes: isDirect ? [] : volumes,
                env: isDirect ? {} : env,
            };

            const response = await fetch(`${Api.current.containers}/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || "Failed to create container");
            }

            setCreateModalOpen(false);
            handleRefresh();
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : "Failed to create container");
        } finally {
            setCreateLoading(false);
        }
    };

    const openLogs = async (container: ContainerRecord) => {
        setLogsContainer(container);
        setLogs("");
        setLogsError("");
        setLogsLoading(true);
        try {
            const query = new URLSearchParams({ engine: container.engine, id: container.id, owner: container.owner });
            const response = await fetch(`${Api.current.containers}/logs?${query.toString()}`, { cache: "no-store" });
            if (!response.ok) throw new Error((await response.text()) || "Failed to load container logs");
            const data: { logs?: string } = await response.json();
            setLogs(data.logs ?? "");
        } catch (logsLoadError) {
            setLogsError(logsLoadError instanceof Error ? logsLoadError.message : "Failed to load container logs");
        } finally {
            setLogsLoading(false);
        }
    };

    const dockerfileQuery = (container: ContainerRecord) => new URLSearchParams({
        engine: container.engine,
        id: container.id,
        owner: container.owner,
    });

    const openDockerfile = async (container: ContainerRecord) => {
        setDockerfileContainer(container);
        setDockerfileContent("");
        setDockerfilePath("");
        setDockerfileError("");
        setDockerfileLoading(true);
        try {
            const response = await fetch(`${Api.current.containers}/dockerfile?${dockerfileQuery(container)}`, { cache: "no-store" });
            if (!response.ok) throw new Error((await response.text()) || "Containerfile not found");
            const data: { content?: string; path?: string } = await response.json();
            setDockerfileContent(data.content ?? "");
            setDockerfilePath(data.path ?? "");
        } catch (dockerfileLoadError) {
            setDockerfileError(dockerfileLoadError instanceof Error ? dockerfileLoadError.message : "Containerfile not found");
        } finally {
            setDockerfileLoading(false);
        }
    };

    const saveDockerfile = async () => {
        if (!dockerfileContainer) return;
        setDockerfileSaving(true);
        setDockerfileError("");
        try {
            const response = await fetch(`${Api.current.containers}/dockerfile?${dockerfileQuery(dockerfileContainer)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: dockerfileContent }),
            });
            if (!response.ok) throw new Error((await response.text()) || "Failed to save Containerfile");
            setDockerfileContainer(null);
        } catch (dockerfileSaveError) {
            setDockerfileError(dockerfileSaveError instanceof Error ? dockerfileSaveError.message : "Failed to save Containerfile");
        } finally {
            setDockerfileSaving(false);
        }
    };

    // ── Settings Handlers ───────────────────────────────────────────────────

    const saveTemplatesConfig = async (nextTemplates: LibraryImage[], nextLibraryOnly: boolean) => {
        setSettingsSaving(true);
        setSettingsError("");
        try {
            const response = await fetch(`${Api.current.containers}/templates`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templates: nextTemplates, libraryOnly: nextLibraryOnly }),
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "Failed to save container settings");
            }
            setTemplates(nextTemplates);
            setLibraryOnly(nextLibraryOnly);
        } catch (err) {
            setSettingsError(err instanceof Error ? err.message : "Failed to save container settings");
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleToggleTemplate = async (templateId: string) => {
        const next = templates.map((t) =>
            t.id === templateId ? { ...t, enabled: t.enabled === false ? true : false } : t
        );
        await saveTemplatesConfig(next, libraryOnly);
    };

    const handleTogglePolicy = async (newPolicy: boolean) => {
        await saveTemplatesConfig(templates, newPolicy);
    };

    const handleOpenAddTemplate = () => {
        setIsCreatingTemplate(true);
        setEditTplId("");
        setEditTplName("");
        setEditTplImage("");
        setEditTplCategory("automation");
        setEditTplDescription("");
        setEditTplTags("latest");
        setEditTplPorts([]);
        setEditTplVolumes([]);
        setEditTplEnv([]);
        setEditTplEnabled(true);
        setEditTplError("");
        setTemplateEditModal({
            id: "",
            name: "",
            image: "",
            category: "automation",
            description: "",
            tags: ["latest"],
            enabled: true,
            isCustom: true,
        });
    };

    const handleOpenEditTemplate = (item: LibraryImage) => {
        setIsCreatingTemplate(false);
        setEditTplId(item.id);
        setEditTplName(item.name);
        setEditTplImage(item.image);
        setEditTplCategory(item.category);
        setEditTplDescription(item.description);
        setEditTplTags((item.tags || []).join(", "));
        setEditTplPorts(item.defaultPorts ? item.defaultPorts.map((p) => ({ ...p })) : []);
        setEditTplVolumes(item.defaultVolumes ? item.defaultVolumes.map((v) => ({ ...v })) : []);
        setEditTplEnv(item.defaultEnv ? item.defaultEnv.map((e) => ({ ...e })) : []);
        setEditTplEnabled(item.enabled !== false);
        setEditTplError("");
        setTemplateEditModal(item);
    };

    const handleSaveTemplateModal = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = editTplName.trim();
        const trimmedImage = editTplImage.trim();
        let trimmedId = editTplId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");

        if (!trimmedName) {
            setEditTplError("Template name is required.");
            return;
        }
        if (!trimmedImage) {
            setEditTplError("Container image URI is required.");
            return;
        }
        if (!trimmedId) {
            trimmedId = trimmedName.toLowerCase().replace(/[^a-z0-9-_]/g, "");
        }

        const tags = editTplTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

        const updatedItem: LibraryImage = {
            id: trimmedId,
            name: trimmedName,
            image: trimmedImage,
            category: editTplCategory,
            description: editTplDescription.trim(),
            tags: tags.length > 0 ? tags : ["latest"],
            defaultPorts: editTplPorts.filter((p) => p.container.trim()),
            defaultVolumes: editTplVolumes.filter((v) => v.container.trim()),
            defaultEnv: editTplEnv.filter((e) => e.key.trim()),
            enabled: editTplEnabled,
            isCustom: isCreatingTemplate ? true : templateEditModal?.isCustom,
        };

        let nextList: LibraryImage[];
        if (isCreatingTemplate) {
            if (templates.some((t) => t.id === trimmedId)) {
                setEditTplError(`A template with ID "${trimmedId}" already exists.`);
                return;
            }
            nextList = [updatedItem, ...templates];
        } else {
            nextList = templates.map((t) => (t.id === templateEditModal?.id ? updatedItem : t));
        }

        await saveTemplatesConfig(nextList, libraryOnly);
        setTemplateEditModal(null);
    };

    const handleDeleteTemplateConfirmed = async () => {
        if (!templateDeleteTarget) return;
        const next = templates.filter((t) => t.id !== templateDeleteTarget.id);
        await saveTemplatesConfig(next, libraryOnly);
        setTemplateDeleteTarget(null);
    };

    const handleResetTemplatesConfirmed = async () => {
        setSettingsSaving(true);
        setSettingsError("");
        try {
            const response = await fetch(`${Api.current.containers}/templates/reset`, {
                method: "POST",
            });
            if (!response.ok) throw new Error("Failed to reset templates");
            await fetchTemplates();
            setResetModalOpen(false);
        } catch (err) {
            setSettingsError(err instanceof Error ? err.message : "Failed to reset templates");
        } finally {
            setSettingsSaving(false);
        }
    };

    // Filter settings catalog
    const filteredSettingsTemplates = useMemo(() => {
        return templates.filter((item) => {
            const matchCat = settingsCategory === "all" || item.category === settingsCategory;
            const q = settingsSearch.trim().toLowerCase();
            const matchSearch =
                !q ||
                item.name.toLowerCase().includes(q) ||
                item.image.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q);
            return matchCat && matchSearch;
        });
    }, [templates, settingsCategory, settingsSearch]);

    const renderDockerRuntimeConfig = () => (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-foreground">Command (Optional)</label>
                <input
                    type="text"
                    value={createCommand}
                    onChange={(e) => setCreateCommand(e.target.value)}
                    placeholder="e.g. sh -c 'sleep 3600'"
                    className="h-8 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                />
            </div>

            <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-foreground">Restart Policy</label>
                <select
                    value={createRestartPolicy}
                    onChange={(e) => setCreateRestartPolicy(e.target.value)}
                    className="h-8 w-full rounded border border-input bg-background px-2.5 text-xs outline-none focus:border-primary"
                >
                    <option value="unless-stopped">Unless Stopped (Recommended)</option>
                    <option value="always">Always</option>
                    <option value="on-failure">On Failure</option>
                    <option value="no">Do not restart (No)</option>
                </select>
            </div>
        </div>
    );

    const renderPortsSection = () => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <label className="text-xs font-medium text-foreground">Port Bindings</label>
                    <p className="text-xs text-muted-foreground">Map host ports to container service ports.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setCreatePorts([...createPorts, { host: "", container: "" }])}
                    className="text-xs text-primary hover:underline"
                >
                    + Add Port
                </button>
            </div>
            {createPorts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No port bindings configured.</p>
            ) : (
                <div className="space-y-2">
                    {createPorts.map((p, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={p.host}
                                onChange={(e) => {
                                    const next = [...createPorts];
                                    next[index] = { ...next[index], host: e.target.value };
                                    setCreatePorts(next);
                                }}
                                placeholder="Host Port (e.g. 8080)"
                                className="h-8 flex-1 rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                            />
                            <span className="text-xs text-muted-foreground">:</span>
                            <input
                                type="text"
                                value={p.container}
                                onChange={(e) => {
                                    const next = [...createPorts];
                                    next[index] = { ...next[index], container: e.target.value };
                                    setCreatePorts(next);
                                }}
                                placeholder="Container Port (e.g. 80)"
                                className="h-8 flex-1 rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setCreatePorts(createPorts.filter((_, i) => i !== index))}
                                aria-label="Remove port mapping"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderVolumesSection = () => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <label className="text-xs font-medium text-foreground">Volume Mounts</label>
                    <p className="text-xs text-muted-foreground">
                        Host app folder <code>htdocs/{createName.trim() || "app-name"}</code> is automatically mounted. Add extra mounts if needed.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setCreateVolumes([...createVolumes, { host: "", container: "" }])}
                    className="text-xs text-primary hover:underline"
                >
                    + Add Volume
                </button>
            </div>
            {createVolumes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No volume mounts added.</p>
            ) : (
                <div className="space-y-2">
                    {createVolumes.map((v, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={v.host}
                                onChange={(e) => {
                                    const next = [...createVolumes];
                                    next[index] = { ...next[index], host: e.target.value };
                                    setCreateVolumes(next);
                                }}
                                placeholder="Host Path (e.g. appdata/data)"
                                className="h-8 flex-1 rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                            />
                            <span className="text-xs text-muted-foreground">:</span>
                            <input
                                type="text"
                                value={v.container}
                                onChange={(e) => {
                                    const next = [...createVolumes];
                                    next[index] = { ...next[index], container: e.target.value };
                                    setCreateVolumes(next);
                                }}
                                placeholder="Container Path (e.g. /data)"
                                className="h-8 flex-1 rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setCreateVolumes(createVolumes.filter((_, i) => i !== index))}
                                aria-label="Remove volume mount"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderEnvSection = () => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Environment Variables</label>
                <button
                    type="button"
                    onClick={() => setCreateEnv([...createEnv, { key: "", value: "" }])}
                    className="text-xs text-primary hover:underline"
                >
                    + Add Variable
                </button>
            </div>
            {createEnv.length === 0 ? (
                <p className="text-xs text-muted-foreground">No environment variables added.</p>
            ) : (
                <div className="space-y-2">
                    {createEnv.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={item.key}
                                onChange={(e) => {
                                    const next = [...createEnv];
                                    next[index] = { ...next[index], key: e.target.value };
                                    setCreateEnv(next);
                                }}
                                placeholder="KEY (e.g. PORT)"
                                className="h-8 flex-1 rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                            />
                            <span className="text-xs text-muted-foreground">=</span>
                            <input
                                type="text"
                                value={item.value}
                                onChange={(e) => {
                                    const next = [...createEnv];
                                    next[index] = { ...next[index], value: e.target.value };
                                    setCreateEnv(next);
                                }}
                                placeholder="Value (e.g. 3000)"
                                className="h-8 flex-1 rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setCreateEnv(createEnv.filter((_, i) => i !== index))}
                                aria-label="Remove environment variable"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Standalone Page Header & Toolbar */}
            {!embedded && (
                <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold text-foreground">
                                {runtime.isRoot
                                    ? activeOwner === "all"
                                        ? "All Apps"
                                        : `Apps: ${activeOwner}`
                                    : "Apps"}
                            </h2>
                            {userLimits && userLimits.maxContainers > 0 && (
                                <span
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                        scopedContainers.length >= userLimits.maxContainers
                                            ? "bg-destructive/15 text-destructive"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    Quota: {scopedContainers.length} / {userLimits.maxContainers}
                                </span>
                            )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {displayedContainers.length} of {scopedContainers.length} app{scopedContainers.length !== 1 ? "s" : ""}
                            {runtime.isRoot
                                ? activeOwner === "all"
                                    ? " across all users"
                                    : ` owned by ${activeOwner}`
                                : ""}
                        </p>
                    </div>

                    <div className="flex flex-1 items-center justify-end gap-2 flex-wrap sm:flex-nowrap">
                        <div className="relative min-w-[180px] max-w-xs flex-1 sm:flex-initial">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search apps..."
                                className="h-8 w-full rounded border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary"
                            />
                        </div>

                        {runtime.isRoot && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 h-8 text-xs"
                                onClick={() => setSettingsModalOpen(true)}
                                title="App Settings & Supported Templates"
                            >
                                <Sliders className="h-3.5 w-3.5" />
                                Settings
                            </Button>
                        )}

                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 h-8 text-xs"
                            onClick={handleRefresh}
                            disabled={isLoading}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>

                        <Button size="sm" className="gap-2 h-8 text-xs font-medium" onClick={openCreateModal}>
                            <Plus className="h-3.5 w-3.5" />
                            Create App
                        </Button>
                    </div>
                </div>
            )}

            {/* Compact Toolbar for embedded view */}
            {embedded && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative min-w-[200px] max-w-sm flex-1">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search apps..."
                            className="h-8 w-full rounded border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-2 h-8 text-xs" onClick={handleRefresh} disabled={isLoading}>
                            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>

                        <Button size="sm" className="gap-2 h-8 text-xs font-medium" onClick={openCreateModal}>
                            <Plus className="h-3.5 w-3.5" />
                            Create App
                        </Button>
                    </div>
                </div>
            )}

            {/* Error banner */}
            {currentError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                    {currentError}
                </div>
            ) : null}

            {/* Table */}
            {isLoading && scopedContainers.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
                    <span className="text-xs">Loading apps...</span>
                </div>
            ) : displayedContainers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
                    <AppWindow className="h-10 w-10 text-muted-foreground/60" />
                    <p className="mt-3 text-sm font-medium text-foreground">No apps found</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {searchTerm
                            ? "No apps match your search filter."
                            : activeOwner && activeOwner !== "all"
                                ? `No applications found for user "${activeOwner}".`
                                : "Rootless applications created under user accounts will appear here."}
                    </p>
                    <Button size="sm" className="mt-4 gap-2 text-xs" onClick={openCreateModal}>
                        <Plus className="h-3.5 w-3.5" />
                        Create App
                    </Button>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-border bg-muted/50 text-muted-foreground font-medium">
                                <tr>
                                    <th className="px-4 py-3">App</th>
                                    <th className="px-4 py-3 w-28">Type</th>
                                    <th className="px-4 py-3 min-w-[120px]">Language</th>
                                    {runtime.isRoot && (!activeOwner || activeOwner === "all") && (
                                        <th className="px-4 py-3 w-28">Owner</th>
                                    )}
                                    <th className="px-4 py-3 w-32">State</th>
                                    <th className="px-4 py-3 min-w-[140px]">Ports</th>
                                    <th className="px-4 py-3 text-right w-44">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {displayedContainers.map((container) => {
                                    const isDirect = container.type === "direct";
                                    const fileHref = runtime.isRoot
                                        ? `/users/${encodeURIComponent(container.owner)}/files?path=${encodeURIComponent(container.path || `/home/${container.owner}/htdocs/${container.name}`)}`
                                        : `/files?path=${encodeURIComponent(container.relativePath || container.path || `htdocs/${container.name}`)}`;

                                    return (
                                        <tr key={`${container.engine}:${container.owner}:${container.id}`} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-foreground">{container.name || container.id.slice(0, 12)}</p>
                                            </td>

                                            <td className="px-4 py-3">
                                                {isDirect ? (
                                                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 font-medium text-xs text-emerald-600 dark:text-emerald-400">
                                                        <FileCode2 className="h-3 w-3" />
                                                        Direct
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 font-medium text-xs text-blue-600 dark:text-blue-400">
                                                        <Box className="h-3 w-3" />
                                                        Docker
                                                    </span>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {isDirect ? (
                                                    <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                                                        {formatRuntimeLanguage(container.runtime)}
                                                    </span>
                                                ) : (
                                                    <span className="max-w-44 truncate font-mono text-xs text-muted-foreground block" title={container.image || "podman"}>
                                                        {container.image || "podman"}
                                                    </span>
                                                )}
                                            </td>

                                            {runtime.isRoot && (!activeOwner || activeOwner === "all") && (
                                                <td className="px-4 py-3 font-medium text-foreground">
                                                    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                                                        <User className="h-3 w-3 text-muted-foreground" />
                                                        {container.owner}
                                                    </span>
                                                </td>
                                            )}

                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`h-2 w-2 rounded-full ${
                                                            container.state?.toLowerCase() === "running"
                                                                ? "bg-emerald-500"
                                                                : container.state?.toLowerCase() === "ready"
                                                                ? "bg-blue-500"
                                                                : "bg-muted-foreground/40"
                                                        }`}
                                                    />
                                                    <span className="text-foreground capitalize">{isDirect ? "Ready" : (container.status || container.state || "Unknown")}</span>
                                                </div>
                                            </td>

                                            <td className="px-4 py-3 text-muted-foreground font-mono">
                                                {container.ports?.length ? container.ports.join(", ") : "—"}
                                            </td>

                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <Link to={fileHref} title={`Open files in ${container.relativePath || `htdocs/${container.name}`}`}>
                                                        <Button size="icon" variant="outline" className="h-7 w-7" aria-label={`Open files for ${container.name}`}>
                                                            <FolderOpen className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </Link>

                                                    <Button size="icon" variant="outline" className="h-7 w-7" title="Logs" aria-label={`View logs for ${container.name}`} onClick={() => openLogs(container)}>
                                                        <FileText className="h-3 w-3" />
                                                    </Button>

                                                    {!isDirect && (
                                                        <>
                                                            {container.state?.toLowerCase() === "running" ? (
                                                                <Button size="icon" variant="outline" className="h-7 w-7" title="Stop" aria-label={`Stop ${container.name}`} disabled={Boolean(actionLoading)} onClick={() => runAction(container, "stop")}>
                                                                    {actionLoading.endsWith(":stop") && actionLoading.includes(container.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                                                                </Button>
                                                            ) : (
                                                                <Button size="icon" variant="outline" className="h-7 w-7 text-emerald-600" title="Start" aria-label={`Start ${container.name}`} disabled={Boolean(actionLoading)} onClick={() => runAction(container, "start")}>
                                                                    {actionLoading.endsWith(":start") && actionLoading.includes(container.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                                                </Button>
                                                            )}
                                                            <Button size="icon" variant="outline" className="h-7 w-7" title="Restart" aria-label={`Restart ${container.name}`} disabled={Boolean(actionLoading) || container.state?.toLowerCase() !== "running"} onClick={() => runAction(container, "restart")}>
                                                                {actionLoading.endsWith(":restart") && actionLoading.includes(container.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                                                            </Button>
                                                            <Button size="icon" variant="outline" className="h-7 w-7" title="Edit Containerfile" aria-label={`Edit Containerfile for ${container.name}`} onClick={() => openDockerfile(container)}>
                                                                <FileCode2 className="h-3 w-3" />
                                                            </Button>
                                                        </>
                                                    )}

                                                    <Button size="icon" variant="outline" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Delete App" aria-label={`Delete ${container.name}`} disabled={Boolean(actionLoading)} onClick={() => setDeleteModal(container)}>
                                                        {actionLoading.endsWith(":rm") && actionLoading.includes(container.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
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

            {/* Create App Modal */}
            {createModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="flex h-[min(840px,92vh)] w-full max-w-5xl flex-col overflow-hidden border border-border bg-card shadow-2xl">
                        {/* Header */}
                        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                            <div className="flex items-center gap-2">
                                <AppWindow className="h-4 w-4 text-primary" />
                                <h3 className="text-sm font-semibold text-foreground">Create App</h3>
                            </div>
                            <button type="button" onClick={() => setCreateModalOpen(false)} aria-label="Close create app modal">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateContainer} className="flex min-h-0 flex-1 flex-col">
                            {/* Common App Name & Owner Configuration (Shared across System, Support, Custom) */}
                            <div className="shrink-0 border-b border-border bg-card px-6 py-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className={`space-y-1.5 ${runtime.isRoot ? "" : "sm:col-span-2"}`}>
                                        <label className="text-xs font-semibold text-foreground">
                                            App Name <span className="text-destructive">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={createName}
                                            onChange={(e) => {
                                                const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
                                                setCreateName(clean);
                                            }}
                                            placeholder="my-app"
                                            pattern="^[a-z0-9_-]+$"
                                            title="Lowercase letters, numbers, hyphens (-), and underscores (_) only."
                                            required
                                            className="h-9 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                                        />
                                    </div>

                                    {/* App Owner (Non-root users only) */}
                                    {runtime.isRoot && (
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-foreground">
                                                App Owner <span className="text-destructive">*</span>
                                            </label>
                                            {users.length === 0 ? (
                                                <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                                                    No non-root users found. Apps must run under a user account.
                                                </div>
                                            ) : (
                                                <select
                                                    value={createOwner}
                                                    onChange={(e) => setCreateOwner(e.target.value)}
                                                    required
                                                    className="h-9 w-full rounded border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-primary"
                                                >
                                                    {users.map((u) => (
                                                        <option key={u.username} value={u.username}>
                                                            {u.username}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex shrink-0 border-b border-border bg-muted/20 px-6">
                                <button
                                    type="button"
                                    onClick={() => setCreateTab("system")}
                                    className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                                        createTab === "system"
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <Server className="h-4 w-4" />
                                    System
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCreateTab("support")}
                                    className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                                        createTab === "support"
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <Layers className="h-4 w-4" />
                                    Support
                                    <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-xs font-normal text-primary">
                                        {allowedTemplates.length}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCreateTab("custom")}
                                    className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                                        createTab === "custom"
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {libraryOnly && !runtime.isRoot ? (
                                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                    ) : (
                                        <Wrench className="h-4 w-4" />
                                    )}
                                    Custom
                                    {libraryOnly && !runtime.isRoot && (
                                        <span className="rounded bg-muted px-1.5 py-0.2 text-xs text-muted-foreground">
                                            Restricted
                                        </span>
                                    )}
                                </button>
                            </div>
                            {/* Tab 1: System */}
                            {createTab === "system" && (
                                <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
                                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted/40 text-muted-foreground">
                                        <Server className="h-8 w-8" />
                                    </div>
                                    <h3 className="mt-4 text-sm font-semibold text-foreground">Coming Soon</h3>
                                    <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                                        System app templates will be available here soon.
                                    </p>
                                    <div className="mt-5 flex items-center gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => setCreateTab("support")}
                                            className="text-xs"
                                        >
                                            <Layers className="mr-1.5 h-3.5 w-3.5" />
                                            Go to Support Apps
                                        </Button>
                                        {(!libraryOnly || runtime.isRoot) && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCreateTab("custom")}
                                                className="text-xs"
                                            >
                                                <Wrench className="mr-1.5 h-3.5 w-3.5" />
                                                Custom Image
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Tab 2: Support */}
                            {createTab === "support" && (
                                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                                    {/* Left catalog list */}
                                    <div className="flex w-full flex-col border-b border-border md:w-5/12 md:border-b-0 md:border-r">
                                        {/* Search & Category filter */}
                                        <div className="border-b border-border p-3 space-y-2">
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                                <input
                                                    type="text"
                                                    value={libSearch}
                                                    onChange={(e) => setLibSearch(e.target.value)}
                                                    placeholder="Search support apps..."
                                                    className="h-8 w-full rounded border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary"
                                                />
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {LIB_CATEGORIES.map((cat) => (
                                                    <button
                                                        key={cat.id}
                                                        type="button"
                                                        onClick={() => setLibCategory(cat.id)}
                                                        className={`rounded px-2 py-0.5 text-xs transition-colors ${
                                                            libCategory === cat.id
                                                                ? "bg-primary font-medium text-primary-foreground"
                                                                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                                        }`}
                                                    >
                                                        {cat.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* List of library images */}
                                        <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
                                            {filteredLibImages.map((item) => {
                                                const isSelected = selectedLibImage?.id === item.id;
                                                return (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => selectLibraryImage(item)}
                                                        className={`flex cursor-pointer items-start gap-3 rounded border p-2.5 transition-colors ${
                                                            isSelected
                                                                ? "border-primary bg-primary/5 text-foreground"
                                                                : "border-border bg-card text-foreground hover:bg-muted/40"
                                                        }`}
                                                    >
                                                        <div className={`mt-0.5 rounded p-2 ${isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                                            <Box className="h-4 w-4" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-1">
                                                                <span className="truncate font-semibold text-xs text-foreground">{item.name}</span>
                                                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground truncate max-w-36">
                                                                    {item.image}
                                                                </span>
                                                            </div>
                                                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {filteredLibImages.length === 0 && (
                                                <div className="p-6 text-center text-xs text-muted-foreground">
                                                    No support apps match your filter.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right configuration pane */}
                                    <div className="flex-1 space-y-4 overflow-y-auto p-5">
                                        {/* Selected Image Banner */}
                                        <div className="space-y-2 rounded border border-border bg-muted/20 p-3.5">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <span className="text-xs font-semibold text-foreground">{selectedLibImage?.name || "Select an App"}</span>
                                                    <span className="ml-2 font-mono text-xs text-muted-foreground">{createImage}</span>
                                                </div>
                                                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                                                    Supported
                                                </span>
                                            </div>
                                            {selectedLibImage?.description && (
                                                <p className="text-xs text-muted-foreground">{selectedLibImage.description}</p>
                                            )}
                                            {/* Tag selection chips */}
                                            {selectedLibImage?.tags && selectedLibImage.tags.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                    <span className="text-xs text-muted-foreground">Tags:</span>
                                                    {selectedLibImage.tags.map((tag) => {
                                                        const isCurTag = createImage.endsWith(`:${tag}`);
                                                        return (
                                                            <button
                                                                key={tag}
                                                                type="button"
                                                                onClick={() => selectTag(tag)}
                                                                className={`rounded border px-2 py-0.5 font-mono text-xs transition-colors ${
                                                                    isCurTag
                                                                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                                                                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                                                                }`}
                                                            >
                                                                {tag}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Image override input if needed */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-foreground">Selected Image</label>
                                            <input
                                                type="text"
                                                value={createImage}
                                                onChange={(e) => setCreateImage(e.target.value)}
                                                required
                                                className="h-8 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                                            />
                                        </div>

                                        {renderDockerRuntimeConfig()}
                                        {renderPortsSection()}
                                        {renderVolumesSection()}
                                        {renderEnvSection()}
                                    </div>
                                </div>
                            )}

                            {/* Tab 3: Custom */}
                            {createTab === "custom" && (
                                <div className="flex-1 overflow-y-auto p-6">
                                    <div className="mx-auto max-w-2xl space-y-5">
                                        {libraryOnly && !runtime.isRoot ? (
                                            <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-3">
                                                <Lock className="h-5 w-5 shrink-0 mt-0.5" />
                                                <div className="space-y-1">
                                                    <p className="font-semibold">Custom app creation is restricted</p>
                                                    <p className="text-muted-foreground">
                                                        The administrator has restricted app deployments to supported templates only.
                                                        Please switch to the <strong>Support</strong> tab to select an approved app.
                                                    </p>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setCreateTab("support")}
                                                        className="mt-2 text-xs"
                                                    >
                                                        Go to Support
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Mode Selector */}
                                                <div className="space-y-2">
                                                    <label className="text-xs font-medium text-foreground">App Execution Mode</label>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => setCustomAppMode("docker")}
                                                            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                                                                customAppMode === "docker"
                                                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                                    : "border-border hover:bg-muted/50"
                                                            }`}
                                                        >
                                                            <Box className={`h-5 w-5 mt-0.5 shrink-0 ${customAppMode === "docker" ? "text-primary" : "text-muted-foreground"}`} />
                                                            <div>
                                                                <p className={`text-xs font-semibold ${customAppMode === "docker" ? "text-primary" : "text-foreground"}`}>
                                                                    Docker Container
                                                                </p>
                                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                                    Run containerized applications from Docker Hub or any image registry.
                                                                </p>
                                                            </div>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setCustomAppMode("direct")}
                                                            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                                                                customAppMode === "direct"
                                                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                                    : "border-border hover:bg-muted/50"
                                                            }`}
                                                        >
                                                            <FileCode2 className={`h-5 w-5 mt-0.5 shrink-0 ${customAppMode === "direct" ? "text-primary" : "text-muted-foreground"}`} />
                                                            <div>
                                                                <p className={`text-xs font-semibold ${customAppMode === "direct" ? "text-primary" : "text-foreground"}`}>
                                                                    Direct Code Run
                                                                </p>
                                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                                    Run PHP, Node.js, Python, or Static HTML directly on the host VPS.
                                                                </p>
                                                            </div>
                                                        </button>
                                                    </div>
                                                </div>

                                                {customAppMode === "direct" ? (
                                                    <div className="space-y-4">
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-medium text-foreground">Runtime Template</label>
                                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                                {[
                                                                    { id: "php", label: "PHP", desc: "index.php" },
                                                                    { id: "node", label: "Node.js", desc: "server.js" },
                                                                    { id: "python", label: "Python", desc: "app.py" },
                                                                    { id: "static", label: "Static HTML", desc: "index.html" },
                                                                ].map((rt) => (
                                                                    <button
                                                                        key={rt.id}
                                                                        type="button"
                                                                        onClick={() => setDirectRuntime(rt.id as any)}
                                                                        className={`flex flex-col items-center justify-center rounded-md border p-3 text-center transition-all ${
                                                                            directRuntime === rt.id
                                                                                ? "border-primary bg-primary/10 font-semibold text-primary"
                                                                                : "border-border hover:bg-muted text-muted-foreground"
                                                                        }`}
                                                                    >
                                                                        <span className="text-xs">{rt.label}</span>
                                                                        <span className="mt-1 font-mono text-xs text-muted-foreground">{rt.desc}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                                                            <p className="font-medium text-foreground">Direct Mode</p>
                                                            <p className="mt-1">
                                                                Starter code will be generated inside <code>htdocs/{createName.trim() || "app-name"}</code>.
                                                                You can browse, upload, and edit application files anytime in the File Manager.
                                                            </p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-medium text-foreground">
                                                                App Image / Registry URI <span className="text-destructive">*</span>
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={createImage}
                                                                onChange={(e) => setCreateImage(e.target.value)}
                                                                placeholder="e.g. docker.io/library/nginx:alpine or ghcr.io/owner/repo:latest"
                                                                required
                                                                className="h-8 w-full rounded border border-input bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                                                            />
                                                            <p className="text-xs text-muted-foreground">
                                                                Supports standard image references from Docker Hub or any accessible container registry.
                                                            </p>
                                                        </div>

                                                        {renderDockerRuntimeConfig()}
                                                        {renderPortsSection()}
                                                        {renderVolumesSection()}
                                                        {renderEnvSection()}
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/20 px-5 py-3">
                                <div className="min-w-0 flex-1 pr-4">
                                    {createError && <p className="truncate text-xs font-medium text-destructive">{createError}</p>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={() => setCreateModalOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        size="sm"
                                        disabled={
                                            createLoading ||
                                            createTab === "system" ||
                                            (runtime.isRoot && users.length === 0) ||
                                            (libraryOnly && !runtime.isRoot && createTab === "custom")
                                        }
                                    >
                                        {createLoading ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : createTab === "system" ? (
                                            <Server className="mr-2 h-4 w-4" />
                                        ) : (
                                            <Plus className="mr-2 h-4 w-4" />
                                        )}
                                        {createTab === "system" ? "Coming Soon" : "Deploy App"}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* App Settings Modal (Root Only) */}
            {settingsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="flex h-[min(840px,92vh)] w-full max-w-5xl flex-col overflow-hidden border border-border bg-card shadow-2xl">
                        {/* Header */}
                        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                            <div className="flex items-center gap-2">
                                <Sliders className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">App Settings & Supported Templates</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Configure approved app templates and user deployment policies.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSettingsModalOpen(false)}
                                aria-label="Close settings modal"
                                className="rounded p-1 hover:bg-muted"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Error banner */}
                        {settingsError && (
                            <div className="flex items-center justify-between border-b border-destructive/30 bg-destructive/10 px-5 py-2.5 text-xs text-destructive">
                                <span>{settingsError}</span>
                                <button onClick={() => setSettingsError("")}>
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}

                        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 space-y-6">
                            {/* Policy Section */}
                            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-primary" />
                                    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                                        Deployment Access Policies
                                    </h4>
                                </div>

                                <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 p-3">
                                    <div>
                                        <p className="text-xs font-semibold text-foreground">
                                            Restrict non-root users to supported templates only
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            When enabled, non-root users can only deploy apps from the Support catalog and cannot enter arbitrary custom images.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleTogglePolicy(!libraryOnly)}
                                        disabled={settingsSaving}
                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                            libraryOnly ? "bg-primary" : "bg-muted"
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                libraryOnly ? "translate-x-4" : "translate-x-0"
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>

                            {/* Catalog Section */}
                            <div className="rounded-lg border border-border bg-card p-4 space-y-4 flex-1 flex flex-col min-h-0">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                                                Supported App Templates ({templates.length} total, {allowedTemplates.length} enabled)
                                            </h4>
                                            {settingsSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Templates enabled here will appear in the Support tab for users when creating apps.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setResetModalOpen(true)}
                                            className="h-8 text-xs"
                                        >
                                            Reset Defaults
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleOpenAddTemplate}
                                            className="h-8 text-xs font-medium"
                                        >
                                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                                            Add Template
                                        </Button>
                                    </div>
                                </div>

                                {/* Search and Filter Toolbar */}
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
                                    <div className="relative flex-1 max-w-sm">
                                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            type="text"
                                            value={settingsSearch}
                                            onChange={(e) => setSettingsSearch(e.target.value)}
                                            placeholder="Search templates by name, image, description..."
                                            className="h-8 w-full rounded border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary"
                                        />
                                    </div>

                                    <div className="flex flex-wrap gap-1">
                                        {LIB_CATEGORIES.map((cat) => (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => setSettingsCategory(cat.id)}
                                                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                                                    settingsCategory === cat.id
                                                        ? "bg-primary font-medium text-primary-foreground"
                                                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                                }`}
                                            >
                                                {cat.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Templates Table */}
                                <div className="rounded border border-border overflow-hidden">
                                    <div className="overflow-x-auto max-h-96">
                                        <table className="w-full text-left text-xs">
                                            <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground sticky top-0 bg-muted/90 backdrop-blur-sm">
                                                <tr>
                                                    <th className="px-3 py-2.5 w-16 text-center">Status</th>
                                                    <th className="px-3 py-2.5 min-w-[150px]">Template Name</th>
                                                    <th className="px-3 py-2.5 w-24">Category</th>
                                                    <th className="px-3 py-2.5 min-w-[180px]">Image</th>
                                                    <th className="px-3 py-2.5 min-w-[140px]">Defaults</th>
                                                    <th className="px-3 py-2.5 w-24 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {filteredSettingsTemplates.map((t) => {
                                                    const isEnabled = t.enabled !== false;
                                                    return (
                                                        <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                                                            {/* Enable switch */}
                                                            <td className="px-3 py-2 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleTemplate(t.id)}
                                                                    title={isEnabled ? "Disable template" : "Enable template"}
                                                                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                                                                        isEnabled ? "bg-primary" : "bg-muted"
                                                                    }`}
                                                                >
                                                                    <span
                                                                        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                                                                            isEnabled ? "translate-x-3" : "translate-x-0"
                                                                        }`}
                                                                    />
                                                                </button>
                                                            </td>

                                                            {/* Name & ID */}
                                                            <td className="px-3 py-2">
                                                                <div className="font-semibold text-foreground flex items-center gap-1.5">
                                                                    {t.name}
                                                                    {t.isCustom && (
                                                                        <span className="rounded bg-primary/10 px-1.5 py-0.2 text-xs text-primary font-normal">
                                                                            Custom
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground line-clamp-1">
                                                                    {t.description}
                                                                </div>
                                                            </td>

                                                            {/* Category */}
                                                            <td className="px-3 py-2">
                                                                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground capitalize">
                                                                    {t.category}
                                                                </span>
                                                            </td>

                                                            {/* Image */}
                                                            <td className="px-3 py-2 font-mono text-xs text-foreground truncate max-w-xs" title={t.image}>
                                                                {t.image}
                                                            </td>

                                                            {/* Defaults summary */}
                                                            <td className="px-3 py-2 text-xs text-muted-foreground">
                                                                {t.defaultPorts?.length ? (
                                                                    <span className="font-mono">
                                                                        {t.defaultPorts.map((p) => p.host || p.container).join(", ")}
                                                                    </span>
                                                                ) : (
                                                                    <span>—</span>
                                                                )}
                                                            </td>

                                                            {/* Actions */}
                                                            <td className="px-3 py-2 text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleOpenEditTemplate(t)}
                                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                                        title="Edit template"
                                                                    >
                                                                        <Pencil className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => setTemplateDeleteTarget(t)}
                                                                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                                                        title="Delete template"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {filteredSettingsTemplates.length === 0 && (
                                                    <tr>
                                                        <td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">
                                                            No templates match your search filter.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex shrink-0 items-center justify-end border-t border-border bg-muted/20 px-5 py-3">
                            <Button size="sm" onClick={() => setSettingsModalOpen(false)}>
                                Done
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add / Edit Template Submodal */}
            {templateEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="relative w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-border pb-3">
                            <h3 className="text-sm font-semibold text-foreground">
                                {isCreatingTemplate ? "Add App Template" : `Edit Template: ${templateEditModal.name}`}
                            </h3>
                            <button
                                onClick={() => setTemplateEditModal(null)}
                                className="rounded p-1 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {editTplError && (
                            <div className="rounded border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                                {editTplError}
                            </div>
                        )}

                        <form onSubmit={handleSaveTemplateModal} className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-foreground mb-1">
                                        Template Name <span className="text-destructive">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Grafana"
                                        value={editTplName}
                                        onChange={(e) => setEditTplName(e.target.value)}
                                        className="h-8 w-full rounded border border-border bg-background px-3 text-xs outline-none focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-foreground mb-1">
                                        Slug ID
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. grafana"
                                        value={editTplId}
                                        onChange={(e) => setEditTplId(e.target.value)}
                                        disabled={!isCreatingTemplate}
                                        className="h-8 w-full rounded border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary disabled:opacity-60"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-foreground mb-1">
                                        App Image <span className="text-destructive">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. grafana/grafana:latest"
                                        value={editTplImage}
                                        onChange={(e) => setEditTplImage(e.target.value)}
                                        className="h-8 w-full rounded border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-foreground mb-1">
                                        Category
                                    </label>
                                    <select
                                        value={editTplCategory}
                                        onChange={(e) => setEditTplCategory(e.target.value)}
                                        className="h-8 w-full rounded border border-border bg-background px-2.5 text-xs outline-none focus:border-primary"
                                    >
                                        <option value="automation">Automation</option>
                                        <option value="ai">AI & LLM</option>
                                        <option value="runtime">Runtimes</option>
                                        <option value="database">Databases</option>
                                        <option value="cache">Cache & Queue</option>
                                        <option value="tools">Dev Tools</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                    Description
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Brief summary of what this application does..."
                                    value={editTplDescription}
                                    onChange={(e) => setEditTplDescription(e.target.value)}
                                    className="w-full rounded border border-border bg-background p-2.5 text-xs outline-none focus:border-primary"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-foreground mb-1">
                                    Tags (comma-separated)
                                </label>
                                <input
                                    type="text"
                                    placeholder="latest, 10.4.0, alpine"
                                    value={editTplTags}
                                    onChange={(e) => setEditTplTags(e.target.value)}
                                    className="h-8 w-full rounded border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                                />
                            </div>

                            {/* Ports configuration */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-foreground">Default Port Mappings</label>
                                    <button
                                        type="button"
                                        onClick={() => setEditTplPorts([...editTplPorts, { host: "", container: "" }])}
                                        className="text-xs text-primary hover:underline"
                                    >
                                        + Add Port
                                    </button>
                                </div>
                                {editTplPorts.map((p, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="Host Port (e.g. 3000)"
                                            value={p.host}
                                            onChange={(e) => {
                                                const next = [...editTplPorts];
                                                next[idx].host = e.target.value;
                                                setEditTplPorts(next);
                                            }}
                                            className="h-7 flex-1 rounded border border-border bg-background px-2 font-mono text-xs"
                                        />
                                        <span className="text-xs text-muted-foreground">:</span>
                                        <input
                                            type="text"
                                            placeholder="Container Port (e.g. 3000)"
                                            value={p.container}
                                            onChange={(e) => {
                                                const next = [...editTplPorts];
                                                next[idx].container = e.target.value;
                                                setEditTplPorts(next);
                                            }}
                                            className="h-7 flex-1 rounded border border-border bg-background px-2 font-mono text-xs"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setEditTplPorts(editTplPorts.filter((_, i) => i !== idx))}
                                            className="text-muted-foreground hover:text-destructive p-1"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Enabled switch */}
                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditTplEnabled(!editTplEnabled)}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                        editTplEnabled ? "bg-primary" : "bg-muted"
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                                            editTplEnabled ? "translate-x-4" : "translate-x-0"
                                        }`}
                                    />
                                </button>
                                <span className="text-xs font-medium text-foreground">
                                    {editTplEnabled ? "Template is enabled in catalog" : "Template is disabled"}
                                </span>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setTemplateEditModal(null)}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" size="sm">
                                    {isCreatingTemplate ? "Add to Catalog" : "Save Changes"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Template Delete Confirmation Modal */}
            {templateDeleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl space-y-4">
                        <div className="flex items-center gap-3 text-destructive">
                            <div className="rounded-full bg-destructive/10 p-2">
                                <Trash2 className="h-5 w-5" />
                            </div>
                            <h3 className="text-sm font-semibold text-foreground">Remove Template from Catalog</h3>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Are you sure you want to remove <strong className="text-foreground">{templateDeleteTarget.name}</strong> ({templateDeleteTarget.image}) from the supported templates catalog?
                        </p>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setTemplateDeleteTarget(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDeleteTemplateConfirmed}
                            >
                                Remove Template
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset to Defaults Confirmation Modal */}
            {resetModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl space-y-4">
                        <div className="flex items-center gap-3 text-amber-600">
                            <div className="rounded-full bg-amber-500/10 p-2">
                                <RotateCw className="h-5 w-5" />
                            </div>
                            <h3 className="text-sm font-semibold text-foreground">Reset Supported App Templates to Defaults</h3>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Are you sure you want to restore the system default app templates catalog? Custom additions and custom edits will be replaced with standard defaults.
                        </p>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setResetModalOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleResetTemplatesConfirmed}
                            >
                                Reset to Defaults
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete app modal */}
            {deleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 shadow-2xl">
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-foreground">Remove App</h3>
                            <p className="text-xs text-muted-foreground">
                                Are you sure you want to remove app <span className="font-semibold text-foreground">{deleteModal.name || deleteModal.id}</span>?
                            </p>
                            <div className="rounded border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                                Warning: This will delete the app folder <code className="font-mono font-semibold">{deleteModal.relativePath || `htdocs/${deleteModal.name}`}</code> and remove any associated container. This action cannot be undone.
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setDeleteModal(null)}>
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                    const c = deleteModal;
                                    setDeleteModal(null);
                                    runAction(c, "rm");
                                }}
                            >
                                Remove
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Logs modal */}
            {logsContainer ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="flex h-[min(640px,90vh)] w-full max-w-3xl flex-col rounded-lg border border-border bg-card shadow-2xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">{logsContainer.name || logsContainer.id} logs</h3>
                                <p className="text-xs text-muted-foreground">{logsContainer.owner}</p>
                            </div>
                            <button type="button" onClick={() => setLogsContainer(null)} aria-label="Close logs dialog">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto bg-black p-4 font-mono text-xs text-emerald-400">
                            {logsLoading ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Loading logs...</span>
                                </div>
                            ) : logsError ? (
                                <span className="text-destructive">{logsError}</span>
                            ) : (
                                <pre className="whitespace-pre-wrap">{logs || "No logs available."}</pre>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Dockerfile edit modal */}
            {dockerfileContainer ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="flex h-[min(640px,90vh)] w-full max-w-3xl flex-col rounded-lg border border-border bg-card shadow-2xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">Containerfile — {dockerfileContainer.name || dockerfileContainer.id}</h3>
                                {dockerfilePath ? <p className="font-mono text-xs text-muted-foreground">{dockerfilePath}</p> : null}
                            </div>
                            <button type="button" onClick={() => setDockerfileContainer(null)} aria-label="Close Containerfile editor">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        {dockerfileError ? (
                            <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-destructive">
                                {dockerfileError}
                            </div>
                        ) : null}
                        <div className="flex flex-1 flex-col overflow-hidden p-4">
                            {dockerfileLoading ? (
                                <div className="flex flex-1 items-center justify-center text-muted-foreground">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    <span>Loading Containerfile...</span>
                                </div>
                            ) : (
                                <textarea
                                    value={dockerfileContent}
                                    onChange={(e) => setDockerfileContent(e.target.value)}
                                    className="flex-1 resize-none rounded border border-border bg-background p-3 font-mono text-xs outline-none focus:border-primary"
                                    placeholder="# Containerfile content..."
                                    spellCheck={false}
                                />
                            )}
                            <div className="mt-4 flex items-center justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => setDockerfileContainer(null)}>
                                    Cancel
                                </Button>
                                <Button size="sm" className="gap-2" onClick={saveDockerfile} disabled={dockerfileLoading || dockerfileSaving}>
                                    {dockerfileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    Save
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
