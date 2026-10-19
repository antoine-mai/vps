import { type ReactNode } from "react";
import { Navigate, Route, Routes as RouterRoutes } from "react-router-dom";

import { useUser } from "../_contexts/user";
import { runtime } from "../runtime";
import AgentRoute from "./agent";
import AppsRoute from "./apps";
import ContainersRoute from "./containers";
import DockerContainersRoute from "./docker";
import APIsRoute from "./apis";
import FilesRoute from "./files";
import LoginRoute from "./login";
import RootRoutes from "./root";
import UsersRoute from "./root/users";
import SettingsRoute from "./settings";
import UserRoutes from "./user";
import VHostsRoute from "./vhosts";
import BackupRoute from "./backup";
import TaskingRoute from "./tasking";

function ProtectedRoute({ children }: { children: ReactNode }) {
    const { isLoggedIn, isCheckingSession } = useUser();

    if (isCheckingSession) {
        return <div className="flex h-screen w-screen items-center justify-center bg-background" />;
    }

    if (!isLoggedIn) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

export default function AppRoutes() {
    return (
        <RouterRoutes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/files" element={<ProtectedRoute><FilesRoute /></ProtectedRoute>} />
            <Route path="/vhosts" element={<ProtectedRoute><VHostsRoute /></ProtectedRoute>} />
            <Route path="/apps" element={<ProtectedRoute><ContainersRoute /></ProtectedRoute>} />
            <Route path="/containers" element={<ProtectedRoute><DockerContainersRoute /></ProtectedRoute>} />
            <Route path="/tasking" element={<ProtectedRoute><TaskingRoute /></ProtectedRoute>} />
            <Route path="/backup" element={<ProtectedRoute><BackupRoute /></ProtectedRoute>} />
            <Route path="/agent" element={<ProtectedRoute><AgentRoute /></ProtectedRoute>} />
            <Route path="/apis" element={<ProtectedRoute><APIsRoute /></ProtectedRoute>} />
            {runtime.isRoot ? (
                <>
                    <Route path="/vhosts/:owner" element={<ProtectedRoute><VHostsRoute /></ProtectedRoute>} />
                    <Route path="/apps/:owner" element={<ProtectedRoute><ContainersRoute /></ProtectedRoute>} />
                    <Route path="/tasking/:owner" element={<ProtectedRoute><TaskingRoute /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><SettingsRoute /></ProtectedRoute>} />
                    <Route path="/settings/:section" element={<ProtectedRoute><SettingsRoute /></ProtectedRoute>} />
                    <Route path="/settings/apps/:app" element={<ProtectedRoute><AppsRoute /></ProtectedRoute>} />
                    <Route path="/users" element={<ProtectedRoute><UsersRoute /></ProtectedRoute>} />
                    <Route path="/users/:username" element={<ProtectedRoute><UsersRoute /></ProtectedRoute>} />
                    <Route path="/users/:username/:section" element={<ProtectedRoute><UsersRoute /></ProtectedRoute>} />
                    <Route path="*" element={<ProtectedRoute><RootRoutes /></ProtectedRoute>} />
                </>
            ) : (
                <Route path="*" element={<ProtectedRoute><UserRoutes /></ProtectedRoute>} />
            )}
        </RouterRoutes>
    );
}
