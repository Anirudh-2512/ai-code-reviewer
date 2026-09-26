import type { Severity } from "@/lib/types";

const MAP: Record<Severity, string> = {
  critical: "bg-[#ff5d73]/20 text-[#ff8b9b] border-[#ff5d73]/40",
  high: "bg-orange-500/15 text-orange-200 border-orange-400/30",
  medium: "bg-amber-400/15 text-amber-100 border-amber-300/30",
  low: "bg-sky-400/10 text-sky-100 border-sky-300/25",
  info: "bg-white/5 text-zinc-300 border-white/15",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`font-ui rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${MAP[severity]}`}
    >
      {severity}
    </span>
  );
}
