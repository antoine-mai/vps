import { Link } from "react-router-dom";
import { Boxes, Cpu, Settings, User } from "lucide-react";

export const availableApps = [
    ["caddy", "Caddy"],
    ["podman", "Podman"],
] as const;

type SettingsSection = "general" | "users" | "apps";

export default function SettingsSidebar({ section, app }: { section: SettingsSection; app?: string }) {
    return (
        <aside className="flex h-full flex-col gap-1 overflow-y-auto border-r border-border bg-card/60 p-2">
            <SettingsNavItem active={section === "general"} href="/settings/general" icon={Settings} label="General Settings" />
            <SettingsNavItem active={section === "users"} href="/settings/users" icon={User} label="Users Settings" />
            <SettingsNavItem active={section === "apps" && !app} href="/settings/apps" icon={Boxes} label="Apps Settings" />
            {section === "apps" ? (
                <nav className="ml-5 border-l border-border py-1 pl-2">
                    {availableApps.map(([name, label]) => (
                        <Link
                            key={name}
                            to={`/settings/apps/${encodeURIComponent(name)}`}
                            className={`flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs transition-colors ${app === name ? "font-semibold text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                        >
                            <Cpu className="h-3.5 w-3.5" />
                            {label}
                        </Link>
                    ))}
                </nav>
            ) : null}
        </aside>
    );
}

function SettingsNavItem({ active, href, icon: Icon, label }: {
    active: boolean;
    href: string;
    icon: typeof Settings;
    label: string;
}) {
    return (
        <Link
            to={href}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
            <Icon className="h-4 w-4" />
            {label}
        </Link>
    );
}
