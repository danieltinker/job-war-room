"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CompanyRow {
  id: string;
  name: string;
  website: string;
  linkedinSlug: string;
  careersUrl: string;
  ats: string;
  atsIdentifier: string;
  active: boolean;
  notes: string;
  jobCount: number;
}

const EMPTY = {
  name: "",
  website: "",
  linkedinSlug: "",
  careersUrl: "",
  ats: "NONE",
  atsIdentifier: "",
  notes: "",
};

export function CompanyManager({ companies }: { companies: CompanyRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);

  async function testCompany(c: CompanyRow) {
    setTesting(c.id);
    const data = await fetch("/api/diagnostics/company", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId: c.id }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setTesting(null);
    if (!data) {
      setTestResults((t) => ({ ...t, [c.id]: "✗ test failed" }));
      return;
    }
    const parts = (data.results as { source: string; ok: boolean; jobs: number; error?: string }[]).map(
      (r) => (r.ok ? `✓ ${r.source}: ${r.jobs} jobs` : `✗ ${r.source}: ${r.error}`)
    );
    if (data.detected) {
      parts.unshift(`🔎 detected ${data.detected.kind} board "${data.detected.identifier}" — saved`);
    }
    setTestResults((t) => ({ ...t, [c.id]: parts.join(" · ") }));
    if (data.detected) router.refresh();
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(editingId ? `/api/companies/${editingId}` : "/api/companies", {
      method: editingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "save failed");
      return;
    }
    setForm({ ...EMPTY });
    setEditingId(null);
    router.refresh();
  }

  function startEdit(c: CompanyRow) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      website: c.website,
      linkedinSlug: c.linkedinSlug,
      careersUrl: c.careersUrl,
      ats: c.ats,
      atsIdentifier: c.atsIdentifier,
      notes: c.notes,
    });
  }

  async function toggleActive(c: CompanyRow) {
    await fetch(`/api/companies/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    router.refresh();
  }

  async function remove(c: CompanyRow) {
    if (!confirm(`Remove ${c.name} from the watchlist?`)) return;
    await fetch(`/api/companies/${c.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-semibold text-white">
          {editingId ? "Edit company" : "Add a company to watch"}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div>
            <label className="label">Website</label>
            <input className="input" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="label">LinkedIn slug</label>
            <input className="input" value={form.linkedinSlug} onChange={(e) => set("linkedinSlug", e.target.value)} placeholder="linkedin.com/company/<slug>" />
          </div>
          <div>
            <label className="label">Careers page URL</label>
            <input
              className="input"
              value={form.careersUrl}
              onChange={(e) => set("careersUrl", e.target.value)}
              placeholder="https://company.com/careers — scraped directly"
            />
          </div>
          <div>
            <label className="label">Careers board (ATS)</label>
            <select className="input" value={form.ats} onChange={(e) => set("ats", e.target.value)}>
              <option value="NONE">None / LinkedIn only</option>
              <option value="GREENHOUSE">Greenhouse</option>
              <option value="LEVER">Lever</option>
              <option value="ASHBY">Ashby</option>
              <option value="SMARTRECRUITERS">SmartRecruiters</option>
            </select>
          </div>
          <div>
            <label className="label">Board token</label>
            <input
              className="input"
              value={form.atsIdentifier}
              onChange={(e) => set("atsIdentifier", e.target.value)}
              placeholder="e.g. stripe (from the board URL)"
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy}>
            {editingId ? "Save changes" : "Add company"}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditingId(null);
                setForm({ ...EMPTY });
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-line">
            <tr>
              <th className="th">Company</th>
              <th className="th">Sources</th>
              <th className="th">Jobs seen</th>
              <th className="th">Status</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {companies.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={5}>
                  No companies yet — add the ones you want scraped daily.
                </td>
              </tr>
            )}
            {companies.map((c) => (
              <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                <td className="td">
                  <div className="font-medium text-white">{c.name}</div>
                  {c.website && (
                    <a href={c.website} target="_blank" className="text-xs text-accent hover:underline">
                      {c.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </td>
                <td className="td text-xs text-slate-400">
                  {[
                    c.ats !== "NONE" ? `${c.ats.toLowerCase()} (${c.atsIdentifier})` : null,
                    c.careersUrl ? "careers page" : null,
                    "linkedin",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </td>
                <td className="td">{c.jobCount}</td>
                <td className="td">
                  <button
                    className={`text-xs font-semibold ${c.active ? "text-emerald-400" : "text-slate-500"}`}
                    onClick={() => toggleActive(c)}
                    title="Toggle daily scraping"
                  >
                    {c.active ? "● watching" : "○ paused"}
                  </button>
                </td>
                <td className="td text-right">
                  <button
                    className="btn py-1 text-xs"
                    onClick={() => testCompany(c)}
                    disabled={testing === c.id}
                    title="Scrape this company's sources right now and report what came back"
                  >
                    {testing === c.id ? "Testing…" : "Detect & test"}
                  </button>{" "}
                  <button className="btn py-1 text-xs" onClick={() => startEdit(c)}>
                    Edit
                  </button>{" "}
                  <button className="btn btn-danger py-1 text-xs" onClick={() => remove(c)}>
                    Delete
                  </button>
                  {testResults[c.id] && (
                    <p className="mt-1 max-w-md text-right text-xs text-slate-400">
                      {testResults[c.id]}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
