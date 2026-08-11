"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ProfileRow {
  id: string;
  name: string;
  keywords: string[];
  titleKeywords: string[];
  excludeKeywords: string[];
  locations: string[];
  remoteOk: boolean;
  minScore: number;
  active: boolean;
  resumeId: string | null;
  matchCount: number;
}

export interface ResumeOption {
  id: string;
  name: string;
}

const EMPTY = {
  name: "",
  titleKeywords: "",
  keywords: "",
  excludeKeywords: "",
  locations: "",
  remoteOk: true,
  minScore: 40,
  resumeId: "",
};

const toList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function ProfileManager({
  profiles,
  resumes,
}: {
  profiles: ProfileRow[];
  resumes: ResumeOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      name: form.name,
      titleKeywords: toList(form.titleKeywords),
      keywords: toList(form.keywords),
      excludeKeywords: toList(form.excludeKeywords),
      locations: toList(form.locations),
      remoteOk: form.remoteOk,
      minScore: Number(form.minScore),
      resumeId: form.resumeId || null,
    };
    const res = await fetch(editingId ? `/api/profiles/${editingId}` : "/api/profiles", {
      method: editingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      setError("save failed — check the fields");
      return;
    }
    setForm({ ...EMPTY });
    setEditingId(null);
    router.refresh();
  }

  function startEdit(p: ProfileRow) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      titleKeywords: p.titleKeywords.join(", "),
      keywords: p.keywords.join(", "),
      excludeKeywords: p.excludeKeywords.join(", "),
      locations: p.locations.join(", "),
      remoteOk: p.remoteOk,
      minScore: p.minScore,
      resumeId: p.resumeId ?? "",
    });
  }

  async function toggleActive(p: ProfileRow) {
    await fetch(`/api/profiles/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    router.refresh();
  }

  async function remove(p: ProfileRow) {
    if (!confirm(`Delete profile "${p.name}"? Its suggestions will be removed.`)) return;
    await fetch(`/api/profiles/${p.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-semibold text-white">
          {editingId ? "Edit position profile" : "Define a position profile"}
        </h2>
        <p className="text-sm text-slate-400">
          Profiles define what “relevant” means. The daily sweep searches LinkedIn with these
          keywords and scores every scraped job against them; jobs above the threshold appear as
          suggestions.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">Profile name *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Senior Backend Engineer"
              required
            />
          </div>
          <div>
            <label className="label">Default resume</label>
            <select
              className="input"
              value={form.resumeId}
              onChange={(e) => setForm({ ...form, resumeId: e.target.value })}
            >
              <option value="">None</option>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Title keywords (strong signal, comma-separated)</label>
            <input
              className="input"
              value={form.titleKeywords}
              onChange={(e) => setForm({ ...form, titleKeywords: e.target.value })}
              placeholder="backend engineer, platform engineer"
            />
          </div>
          <div>
            <label className="label">Keywords (comma-separated)</label>
            <input
              className="input"
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              placeholder="node.js, python, kubernetes, aws"
            />
          </div>
          <div>
            <label className="label">Exclude keywords (hard filter)</label>
            <input
              className="input"
              value={form.excludeKeywords}
              onChange={(e) => setForm({ ...form, excludeKeywords: e.target.value })}
              placeholder="intern, unpaid, clearance required"
            />
          </div>
          <div>
            <label className="label">Locations (empty = anywhere)</label>
            <input
              className="input"
              value={form.locations}
              onChange={(e) => setForm({ ...form, locations: e.target.value })}
              placeholder="Tel Aviv, Israel"
            />
          </div>
          <div>
            <label className="label">Suggestion threshold: {form.minScore}</label>
            <input
              type="range"
              min={0}
              max={100}
              className="w-full accent-sky-400"
              value={form.minScore}
              onChange={(e) => setForm({ ...form, minScore: Number(e.target.value) })}
            />
          </div>
          <label className="flex items-center gap-2 pt-5 text-sm">
            <input
              type="checkbox"
              checked={form.remoteOk}
              onChange={(e) => setForm({ ...form, remoteOk: e.target.checked })}
            />
            Remote roles are acceptable
          </label>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy}>
            {editingId ? "Save changes" : "Create profile"}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {profiles.length === 0 && (
          <p className="text-sm text-slate-400">No profiles yet — create one so the war room knows what to hunt for.</p>
        )}
        {profiles.map((p) => (
          <div key={p.id} className={`card ${p.active ? "" : "opacity-50"}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white">{p.name}</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {p.matchCount} match{p.matchCount === 1 ? "" : "es"} · threshold {p.minScore} ·{" "}
                  {p.remoteOk ? "remote ok" : "on-site"}
                </p>
              </div>
              <button
                className={`text-xs font-semibold ${p.active ? "text-emerald-400" : "text-slate-500"}`}
                onClick={() => toggleActive(p)}
              >
                {p.active ? "● active" : "○ paused"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.titleKeywords.map((k) => (
                <span key={`t-${k}`} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                  {k}
                </span>
              ))}
              {p.keywords.map((k) => (
                <span key={`k-${k}`} className="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-slate-300">
                  {k}
                </span>
              ))}
              {p.excludeKeywords.map((k) => (
                <span key={`x-${k}`} className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-300 line-through">
                  {k}
                </span>
              ))}
            </div>
            {p.locations.length > 0 && (
              <p className="mt-2 text-xs text-slate-400">📍 {p.locations.join(", ")}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button className="btn py-1 text-xs" onClick={() => startEdit(p)}>
                Edit
              </button>
              <button className="btn btn-danger py-1 text-xs" onClick={() => remove(p)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
