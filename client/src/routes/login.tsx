import { type FormEvent, useState, useEffect, useRef } from "react";
import {
    ArrowRight,
    Loader2,
    LockKeyhole,
    ShieldCheck,
    User,
} from "lucide-react";

import ColorModeSwitch from "_components/color-mode-switch";
import { Button } from "_layouts/_components/ui/button";
import DefaultLayout from "_layouts";
import Api from "_utils/api";
import { runtime } from "runtime";

type LoginStatus = "idle" | "loading" | "success" | "error";

export default function LoginRoute() {
    const [status, setStatus] = useState<LoginStatus>("idle");
    const [message, setMessage] = useState("");
    const isLoading = status === "loading";

    useEffect(() => {
        document.title = "Login | MTHAN VPS";
        const hasFlag = loginStorage().getItem(loginStorageKey()) === "true";
        if (hasFlag) {
            fetch(Api.current.session, { cache: "no-store" })
                .then((res) => {
                    if (res.ok) {
                        window.location.href = appPath("/");
                    } else {
                        loginStorage().removeItem(loginStorageKey());
                    }
                })
                .catch(() => {
                    loginStorage().removeItem(loginStorageKey());
                });
        }
    }, []);

    const handleInputChange = () => {
        if (status === "error") {
            setStatus("idle");
            setMessage("");
        }
    };

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);
        setStatus("loading");
        setMessage("");

        try {
            const response = await fetch(Api.current.login, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ...(runtime.isRoot ? {} : { username: formData.get("username") }),
                    password: formData.get("password"),
                }),
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error("Invalid username or password");
                }
                if ([502, 503, 504].includes(response.status)) {
                    throw new Error("The server is temporarily unavailable. Please try again shortly");
                }
                const contentType = response.headers.get("content-type") ?? "";
                const errorMsg = contentType.includes("text/plain") ? (await response.text()).trim() : "";
                throw new Error(errorMsg && errorMsg.length <= 200 ? errorMsg : `Login failed (${response.status})`);
            }

            setStatus("success");
            loginStorage().setItem(loginStorageKey(), "true");
            setTimeout(() => {
                window.location.href = appPath("/");
            }, 800);
        } catch (error: any) {
            setStatus("error");
            setMessage(
                error instanceof TypeError
                    ? "Unable to reach the server. Please try again shortly"
                    : error.message || "Unable to login",
            );
        }
    }

    return (
        <DefaultLayout>
            {runtime.isRoot ? (
                <RootLoginLayout
                    handleInputChange={handleInputChange}
                    handleSubmit={handleSubmit}
                    isLoading={isLoading}
                    message={message}
                    status={status}
                />
            ) : (
                <UserLoginLayout
                    handleInputChange={handleInputChange}
                    handleSubmit={handleSubmit}
                    isLoading={isLoading}
                    message={message}
                    status={status}
                />
            )}
        </DefaultLayout>
    );
}

type LoginLayoutProps = {
    handleInputChange: () => void;
    handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
    isLoading: boolean;
    message: string;
    status: LoginStatus;
};

function UserLoginLayout(props: LoginLayoutProps) {
    return (
        <main className="relative flex min-h-screen items-center justify-center bg-background px-6 py-8 text-foreground">
            <div className="absolute right-6 top-6">
                <ColorModeSwitch />
            </div>

            <section className="grid w-full max-w-4xl overflow-hidden rounded-md border border-border bg-card shadow-sm md:grid-cols-[0.9fr_1.1fr]">
                <aside className="flex min-h-64 flex-col justify-between border-b border-border bg-muted/40 p-6 md:border-b-0 md:border-r">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background p-1.5">
                                    <img
                                        src={`${runtime.basePath}/logo.svg`}
                                        alt="MThan VPS"
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">
                                        MTHAN VPS
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        User access
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium">
                                    <ShieldCheck
                                        className="h-3.5 w-3.5 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                    User session
                                </div>
                                <div className="space-y-2">
                                    <h1 className="text-3xl font-semibold tracking-tight">
                                        Sign in
                                    </h1>
                                    <p className="text-sm leading-6 text-muted-foreground">
                                        Enter your credentials to continue.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <p className="mt-8 text-xs text-muted-foreground">
                            Your shell and files remain isolated to your Linux account.
                        </p>
                </aside>

                <div className="p-6 sm:p-8">
                        <div className="mb-6 space-y-1">
                            <h2 className="text-xl font-semibold tracking-tight">
                                Login
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Use your Linux account credentials.
                            </p>
                        </div>

                        <LoginForm {...props} showUsername />
                </div>
            </section>
        </main>
    );
}

function RootLoginLayout(props: LoginLayoutProps) {
    return (
        <main className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-10 text-zinc-100">
            <div className="absolute right-6 top-6">
                <ColorModeSwitch />
            </div>

            <section className="w-full max-w-md overflow-hidden rounded-lg border border-red-500/30 bg-zinc-900 shadow-2xl shadow-red-950/30">
                <div className="border-b border-red-500/20 bg-red-950/30 px-7 py-6">
                    <div className="mb-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-red-500/30 bg-red-500/15 p-1.5">
                                <img
                                    src={`${runtime.basePath}/logo.svg`}
                                    alt="MThan VPS"
                                    className="h-full w-full object-contain"
                                />
                            </div>
                            <div>
                                <p className="font-semibold">MTHAN VPS</p>
                                <p className="text-xs text-red-300/70">Privileged access</p>
                            </div>
                        </div>
                        <span className="rounded border border-red-500/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-300">
                            Root
                        </span>
                    </div>
                    <h1 className="text-2xl font-semibold">Root console</h1>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                        This area has unrestricted control of the server. Authorized administrators only.
                    </p>
                </div>

                <div className="px-7 py-7">
                    <div className="mb-5">
                        <p className="text-sm font-medium text-zinc-200">Authenticate as root</p>
                        <p className="mt-1 text-xs text-zinc-500">Enter the root account password to continue.</p>
                    </div>
                    <LoginForm {...props} showUsername={false} root />
                    <a className="mt-6 block text-center text-xs text-zinc-500 hover:text-zinc-300" href="/login">
                        Return to user login
                    </a>
                </div>
            </section>
        </main>
    );
}

function LoginForm({
    handleInputChange,
    handleSubmit,
    isLoading,
    message,
    root = false,
    showUsername,
    status,
}: LoginLayoutProps & { root?: boolean; showUsername: boolean }) {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isLoading) {
            inputRef.current?.focus();
        }
    }, [isLoading]);

    return (
        <form className="space-y-5" onSubmit={handleSubmit}>
            {showUsername && (
                            <label className="block space-y-2">
                                <span className="text-sm font-medium">
                                    Username
                                </span>
                                <span className="relative block">
                                    <User
                                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                    <input
                                        ref={inputRef}
                                        autoFocus
                                        className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                                        name="username"
                                        autoComplete="username"
                                        placeholder="username"
                                        required
                                        onChange={handleInputChange}
                                    />
                                </span>
                            </label>
            )}

                            <label className="block space-y-2">
                                <span className="text-sm font-medium">
                                    Password
                                </span>
                                <span className="relative block">
                                    <LockKeyhole
                                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                    <input
                                        ref={!showUsername ? inputRef : undefined}
                                        autoFocus={!showUsername}
                                        className={`h-11 w-full rounded-md border pl-9 pr-3 text-sm outline-none transition-colors ${
                                            root
                                                ? "border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                                : "border-input bg-background placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                                        }`}
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        placeholder="password"
                                        required
                                        onChange={handleInputChange}
                                    />
                                </span>
                            </label>

                            <Button
                                className={`h-11 w-full gap-2 transition-all duration-300 ${
                                    status === "success"
                                        ? "bg-emerald-600 hover:bg-emerald-600 text-white disabled:opacity-100"
                                        : status === "error"
                                        ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                        : root
                                        ? "bg-red-600 text-white hover:bg-red-500"
                                        : ""
                                }`}
                                disabled={isLoading || status === "success"}
                                type="submit"
                            >
                                {status === "loading" && (
                                    <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
                                )}
                                {status === "success" && (
                                    <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                                )}
                                {(status === "idle" || status === "error") && (
                                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                                )}
                                
                                {status === "idle" && (root ? "Unlock root console" : "Sign in")}
                                {status === "loading" && "Signing in..."}
                                {status === "success" && "Login successful. Redirecting..."}
                                {status === "error" && `${message || "Login failed"} - Try again`}
                            </Button>
        </form>
    );
}

function loginStorageKey() {
    return runtime.isRoot ? "is_root_logged_in" : "is_user_logged_in";
}

function loginStorage(): Storage {
    return runtime.isRoot ? window.sessionStorage : window.localStorage;
}

function appPath(path: string) {
    return `${runtime.basePath}${path}`;
}
