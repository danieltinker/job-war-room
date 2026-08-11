const STYLES: Record<string, string> = {
  APPLIED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  IN_REVIEW: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  ASSESSMENT: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  INTERVIEW: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  OFFER: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  REJECTED: "bg-red-500/15 text-red-300 border-red-500/30",
  WITHDRAWN: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  GHOSTED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  SUGGESTED: "bg-accent/15 text-accent border-accent/30",
  DISMISSED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  SUCCESS: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  FAILED: "bg-red-500/15 text-red-300 border-red-500/30",
  RUNNING: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${style}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
