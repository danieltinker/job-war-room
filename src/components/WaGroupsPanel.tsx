"use client";

import { useEffect, useState } from "react";

interface GroupsState {
  groups: { jid: string; name: string }[];
  monitored: string[];
}

export function WaGroupsPanel() {
  const [state, setState] = useState<GroupsState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/whatsapp/groups")
      .then((r) => r.json())
      .then((data: GroupsState) => {
        setState(data);
        setSelected(new Set(data.monitored));
      });
  }, []);

  if (!state) return null;

  const toggle = (jid: string) => {
    const next = new Set(selected);
    if (next.has(jid)) next.delete(jid);
    else next.add(jid);
    setSelected(next);
    setSaved(false);
  };

  async function save() {
    setBusy(true);
    await fetch("/api/whatsapp/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ monitored: [...selected] }),
    });
    setBusy(false);
    setSaved(true);
  }

  const visible = state.groups.filter((g) =>
    g.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <section className="card space-y-4">
      <h2 className="font-semibold text-white">👥 WhatsApp job groups</h2>
      <p className="text-sm text-slate-400">
        Pick the groups to scan for job posts (e.g. משרות בהייטק). New posts with links or
        hiring language become jobs tagged as <b>referral opportunities</b>, scored against your
        profiles, with instant alerts on strong matches. Only the groups you check here are read.
      </p>
      {state.groups.length === 0 ? (
        <p className="text-sm text-amber-300">
          No groups listed yet — connect WhatsApp and the list refreshes automatically within a
          minute of pairing.
        </p>
      ) : (
        <>
          <input
            className="input"
            placeholder={`Filter ${state.groups.length} groups…`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
            {visible.map((g) => (
              <label
                key={g.jid}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-overlay"
              >
                <input
                  type="checkbox"
                  checked={selected.has(g.jid)}
                  onChange={() => toggle(g.jid)}
                />
                <span dir="auto">{g.name}</span>
              </label>
            ))}
            {visible.length === 0 && (
              <p className="px-2 py-1 text-sm text-slate-500">No groups match the filter.</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : `Monitor ${selected.size} group${selected.size === 1 ? "" : "s"}`}
            </button>
            {saved && <span className="text-sm text-emerald-400">Saved ✓</span>}
          </div>
        </>
      )}
    </section>
  );
}
