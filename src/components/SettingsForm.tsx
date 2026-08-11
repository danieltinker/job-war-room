"use client";

import { useEffect, useState } from "react";

type SettingInfo = { value: string | null; secret: boolean; set: boolean };
type SettingsMap = Record<string, SettingInfo>;

const K = {
  liAt: "linkedin.li_at",
  imapHost: "imap.host",
  imapPort: "imap.port",
  imapUser: "imap.user",
  imapPassword: "imap.password",
  imapMailbox: "imap.mailbox",
  waTarget: "whatsapp.target",
  waNotify: "whatsapp.notifyMatches",
  scrapeCron: "schedule.scrapeCron",
  digestCron: "schedule.digestCron",
  emailMinutes: "schedule.emailSyncMinutes",
};

export function SettingsForm() {
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  if (!settings) return <p className="text-sm text-slate-400">Loading settings…</p>;

  const val = (key: string) => draft[key] ?? settings[key]?.value ?? "";
  const setVal = (key: string, v: string) => {
    setDraft((d) => ({ ...d, [key]: v }));
    setSaved(false);
  };
  const secretPlaceholder = (key: string) =>
    settings[key]?.set ? "•••••• (stored — type to replace)" : "";

  async function save() {
    setBusy(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    setSaved(true);
    setDraft({});
    const fresh = await fetch("/api/settings").then((r) => r.json());
    setSettings(fresh);
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <h2 className="font-semibold text-white">🔗 LinkedIn</h2>
        <p className="text-sm text-slate-400">
          Scraping works logged-out by default. Optionally paste your <code>li_at</code> cookie
          (DevTools → Application → Cookies on linkedin.com) to attach your account session for
          better reliability. It is encrypted at rest.
        </p>
        <div>
          <label className="label">li_at cookie (optional)</label>
          <input
            className="input font-mono"
            type="password"
            value={draft[K.liAt] ?? ""}
            placeholder={secretPlaceholder(K.liAt)}
            onChange={(e) => setVal(K.liAt, e.target.value)}
          />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold text-white">📬 Email tracking (IMAP)</h2>
        <p className="text-sm text-slate-400">
          The worker polls this mailbox, spots application emails (received / assessment /
          interview / offer / rejection) and moves your pipeline automatically. For Gmail: host{" "}
          <code>imap.gmail.com</code>, port 993, and an{" "}
          <a
            className="text-accent hover:underline"
            href="https://support.google.com/accounts/answer/185833"
            target="_blank"
          >
            app password
          </a>
          .
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">IMAP host</label>
            <input className="input" value={val(K.imapHost)} placeholder="imap.gmail.com" onChange={(e) => setVal(K.imapHost, e.target.value)} />
          </div>
          <div>
            <label className="label">Port</label>
            <input className="input" value={val(K.imapPort)} placeholder="993" onChange={(e) => setVal(K.imapPort, e.target.value)} />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" value={val(K.imapUser)} placeholder="you@gmail.com" onChange={(e) => setVal(K.imapUser, e.target.value)} />
          </div>
          <div>
            <label className="label">Password / app password</label>
            <input
              className="input"
              type="password"
              value={draft[K.imapPassword] ?? ""}
              placeholder={secretPlaceholder(K.imapPassword)}
              onChange={(e) => setVal(K.imapPassword, e.target.value)}
            />
          </div>
          <div>
            <label className="label">Mailbox</label>
            <input className="input" value={val(K.imapMailbox)} placeholder="INBOX" onChange={(e) => setVal(K.imapMailbox, e.target.value)} />
          </div>
          <div>
            <label className="label">Poll every (minutes)</label>
            <input className="input" value={val(K.emailMinutes)} placeholder="10" onChange={(e) => setVal(K.emailMinutes, e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold text-white">⏰ Schedules</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">Daily scrape (cron)</label>
            <input className="input font-mono" value={val(K.scrapeCron)} placeholder="0 7 * * *" onChange={(e) => setVal(K.scrapeCron, e.target.value)} />
          </div>
          <div>
            <label className="label">Daily WhatsApp digest (cron)</label>
            <input className="input font-mono" value={val(K.digestCron)} placeholder="30 7 * * *" onChange={(e) => setVal(K.digestCron, e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Times use the server timezone (TZ env, default Asia/Jerusalem in docker-compose).
        </p>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold text-white">💬 WhatsApp digest target</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">Send digests to (international format)</label>
            <input className="input" value={val(K.waTarget)} placeholder="972501234567" onChange={(e) => setVal(K.waTarget, e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pt-5 text-sm">
            <input
              type="checkbox"
              checked={val(K.waNotify) === "true"}
              onChange={(e) => setVal(K.waNotify, e.target.checked ? "true" : "false")}
            />
            Instant alert when a scrape finds new matches
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={busy || Object.keys(draft).length === 0}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved ✓</span>}
      </div>
    </div>
  );
}
