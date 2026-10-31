import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "_layouts/_components/ui/button";
type Entry = { hostname: string; address: string };
type Config = { nameservers: Entry[]; revision: number; suggestedIp?: string };
export default function NameserverSettings({ installed }: { installed: boolean }) {
    const [config, setConfig] = useState<Config | null>(null);
    const [entries, setEntries] = useState<Entry[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    async function load() {
        try { const response = await fetch("/post/nameservers", { cache: "no-store" }); if (!response.ok) throw new Error(await response.text()); const data: Config = await response.json(); setConfig(data); setEntries(data.nameservers); setError(""); }
        catch (error) { setError(error instanceof Error ? error.message : "Could not load nameservers"); }
    }
    useEffect(() => { void load(); }, []);
    return <section className="space-y-4"><div><h3 className="text-sm font-semibold">Your nameservers</h3><p className="mt-1 text-xs text-muted-foreground">Add names such as ns1.example.com and ns2.example.com, with the IP address clients should reach.</p></div>
        {!config && !error && <p className="text-xs text-muted-foreground">Loading…</p>}
        {error && <p role="alert" className="text-xs text-destructive">{error} <button type="button" className="underline" disabled={busy} onClick={() => void load()}>Reload</button></p>}
        {notice && <p role="status" className="text-xs text-primary">{notice}</p>}
        <form className="space-y-3" onSubmit={async event => {
            event.preventDefault(); if (!config || busy) return; setBusy(true); setError(""); setNotice("");
            try { const response = await fetch("/post/nameservers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nameservers: entries, expectedRevision: config.revision }) }); if (!response.ok) throw new Error(await response.text()); const saved: Config = await response.json(); setConfig(previous => ({ ...saved, suggestedIp: previous?.suggestedIp })); setEntries(saved.nameservers); setNotice("Nameservers saved and BIND configuration applied."); }
            catch (error) { setError(error instanceof Error ? error.message : "Could not apply nameservers"); } finally { setBusy(false); }
        }}>
            {entries.map((item, index) => <div className="flex items-end gap-2" key={index}><label className="min-w-0 flex-1 space-y-1 text-xs">Hostname<input aria-label={`Nameserver ${index + 1} hostname`} required disabled={busy} value={item.hostname} placeholder={index % 2 ? "ns2.example.com" : "ns1.example.com"} className="h-9 w-full rounded border border-input bg-background px-3" onChange={event => setEntries(previous => previous.map((entry, i) => i === index ? { ...entry, hostname: event.target.value } : entry))} /></label><label className="min-w-0 flex-1 space-y-1 text-xs">IP address<input aria-label={`Nameserver ${index + 1} IP address`} required disabled={busy} value={item.address} placeholder="Public IPv4 or IPv6" className="h-9 w-full rounded border border-input bg-background px-3 font-mono" onChange={event => setEntries(previous => previous.map((entry, i) => i === index ? { ...entry, address: event.target.value } : entry))} /></label><Button type="button" variant="outline" size="icon" disabled={busy} title="Remove nameserver" aria-label={`Remove nameserver ${index + 1}`} onClick={() => setEntries(previous => previous.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}
            {config && !entries.length && <p className="text-xs text-muted-foreground">No nameservers configured yet.</p>}
            {entries.some(item => item.hostname.split(".").length >= 3) && <p className="text-xs text-muted-foreground">Managed DNS zones: {Array.from(new Set(entries.filter(item => item.hostname.trim().replace(/\.$/, "").split(".").length >= 3).map(item => item.hostname.trim().replace(/\.$/, "").split(".").slice(1).join(".")))).join(", ")}. This form creates nameserver records; website and mail records need separate setup.</p>}
            <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={busy || !config || entries.length >= 20} onClick={() => setEntries(previous => [...previous, { hostname: "", address: previous[0]?.address || config?.suggestedIp || "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add nameserver</Button><Button type="submit" size="sm" disabled={busy || !config || !installed}><Save className="mr-1 h-3.5 w-3.5" />{busy ? "Applying…" : "Save & apply"}</Button></div>
            {!installed && <p className="text-xs text-muted-foreground">Use Active above to install BIND 9 first.</p>}
        </form>
        {config && config.nameservers.length > 0 && <div className="rounded border border-border bg-muted/30 p-3 text-xs space-y-2"><strong>At your domain registrar</strong><p className="text-muted-foreground">Register these hostnames as child nameservers (glue records), then select them for the domains you want this server to host. BIND must listen on the configured address, and UDP/TCP port 53 must be reachable. Saving here does not change registrar settings.</p>{config.nameservers.map(item => <p className="font-mono" key={item.hostname}>{item.hostname} → {item.address}</p>)}<p className="text-muted-foreground">This form creates the nameserver host records. Website, mail and other domain records must also exist before delegating a live domain.</p></div>}
    </section>;
}
