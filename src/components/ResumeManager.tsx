"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface ResumeRow {
  id: string;
  name: string;
  label: string;
  fileName: string;
  sizeBytes: number;
  notes: string;
  updatedAt: string;
  applicationCount: number;
}

export function ResumeManager({ resumes }: { resumes: ResumeRow[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("choose a file");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    form.set("name", name);
    form.set("label", label);
    form.set("notes", notes);
    const res = await fetch("/api/resumes", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "upload failed");
      return;
    }
    setName("");
    setLabel("");
    setNotes("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function remove(r: ResumeRow) {
    if (!confirm(`Delete resume "${r.name}"?`)) return;
    await fetch(`/api/resumes/${r.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={upload} className="card space-y-4">
        <h2 className="font-semibold text-white">Upload a resume</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">Display name *</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Backend-focused v3"
              required
            />
          </div>
          <div>
            <label className="label">Type / label</label>
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Backend · Fullstack · Management…"
            />
          </div>
          <div>
            <label className="label">File (PDF / Word / txt, max 10 MB) *</label>
            <input ref={fileRef} type="file" className="input" accept=".pdf,.doc,.docx,.txt" required />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {resumes.length === 0 && (
          <p className="text-sm text-slate-400">
            No resumes yet — upload the variants you use (backend, fullstack, management…).
          </p>
        )}
        {resumes.map((r) => (
          <div key={r.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-white">{r.name}</h3>
                <span className="mt-1 inline-block rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                  {r.label}
                </span>
              </div>
              <span className="text-2xl">📄</span>
            </div>
            <p className="mt-2 truncate text-xs text-slate-400" title={r.fileName}>
              {r.fileName} · {(r.sizeBytes / 1024).toFixed(0)} KB
            </p>
            {r.notes && <p className="mt-1 text-xs text-slate-400">{r.notes}</p>}
            <p className="mt-1 text-xs text-slate-500">
              Used in {r.applicationCount} application{r.applicationCount === 1 ? "" : "s"}
            </p>
            <div className="mt-4 flex gap-2">
              <a className="btn py-1 text-xs" href={`/api/resumes/${r.id}`} download>
                Download
              </a>
              <button className="btn btn-danger py-1 text-xs" onClick={() => remove(r)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
