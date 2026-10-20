import { type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { redirectToLogin, useUser } from "../_contexts/user";
import Sidebar from "./_components/sidebar";
import Header from "./_components/header";
import { useApp } from "../_contexts/app";
import { useTerminal } from "../_contexts/terminal";

type DashboardLayoutProps = {
    actions?: ReactNode;
    children: ReactNode;
    description?: string;
    title: string;
    headerTitle?: string;
    fullWidth?: boolean;
    wide?: boolean;
};

function DashboardLayoutContent({
    actions,
    children,
    description,
    title,
    headerTitle,
    fullWidth,
    wide,
}: DashboardLayoutProps) {
    const { isLoggedIn, isCheckingSession } = useUser();
    const { appName } = useApp();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const { isOpen: isTerminalOpen, openRoot } = useTerminal();
    const location = useLocation();

    const getModuleTitle = () => {
        if (headerTitle) return headerTitle;
        const path = location.pathname;
        if (path === "/" || path === "") return "Dashboard";
        if (path.startsWith("/users")) return "Users";
        if (path.startsWith("/vhosts")) return "VHosts";
        if (path.startsWith("/apps")) return "Apps";
        if (path.startsWith("/containers")) return "Containers";
        if (path.startsWith("/tasking")) return "Tasking";
        if (path.startsWith("/files")) return "Files";
        if (path.startsWith("/backup")) return "Backup";
        if (path.startsWith("/settings")) return "Settings";
        if (path.startsWith("/agent")) return "Agent";
        if (path.startsWith("/apis")) return "APIs";
        return title || appName;
    };

    useEffect(() => {
        if (!isCheckingSession && !isLoggedIn) {
            redirectToLogin();
        }
    }, [isCheckingSession, isLoggedIn]);

    useEffect(() => {
        if (title) {
            document.title = `${title} | ${appName}`;
        } else {
            document.title = appName;
        }
    }, [appName, title]);

    if (isCheckingSession || !isLoggedIn) {
        return <div className="flex h-screen w-screen items-center justify-center bg-background" />;
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
            {/* Desktop Sidebar */}
            <Sidebar className="hidden md:flex" isTerminalOpen={isTerminalOpen} onTerminalToggle={openRoot} />

            {/* Mobile Sidebar Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Mobile Sidebar Drawer */}
            <Sidebar
                className={`fixed bottom-0 top-0 left-0 z-50 transition-transform duration-300 md:hidden ${
                    isMobileOpen ? "translate-x-0" : "-translate-x-full"
                }`}
                isTerminalOpen={isTerminalOpen}
                onTerminalToggle={openRoot}
            />

            {/* Main Content Area */}
            <div className="flex flex-1 flex-col overflow-hidden">
                <Header title={getModuleTitle()} onMenuClick={() => setIsMobileOpen(true)} />

                <div className="relative flex flex-1 flex-col overflow-hidden">
                    {fullWidth ? (
                        <main className="flex-1 overflow-hidden h-full w-full">
                            {children}
                        </main>
                    ) : (
                        <main className="flex-1 overflow-y-auto px-6 py-4">
                            <div className={`mx-auto w-full ${wide ? "max-w-none" : "max-w-5xl"}`}>
                                {/* Page Header */}
                                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <h2 className="text-lg font-bold tracking-tight text-foreground">
                                            {title}
                                        </h2>
                                        {description ? (
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {description}
                                            </p>
                                        ) : null}
                                    </div>

                                    {actions ? (
                                        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
                                    ) : null}
                                </div>

                                {/* Page Content */}
                                {children}
                            </div>
                        </main>
                    )}

                </div>
            </div>
        </div>
    );
}

export default function DashboardLayout(props: DashboardLayoutProps) {
    return <DashboardLayoutContent {...props} />;
}
