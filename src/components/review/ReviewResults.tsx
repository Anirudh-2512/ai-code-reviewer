"use client";

import type { ReviewResult } from "@/lib/types";
import { SeverityBadge } from "../ui/SeverityBadge";

export function ReviewResults({
  title,
  source,
  review,
}: {
  title?: string;
  source: string;
  review: ReviewResult;
}) {
  return (
    <div className="font-ui mt-10 space-y-6" role="status" aria-live="polite">
      <div className="rounded-2xl border border-white/10 bg-black/45 p-6 backdrop-blur-md">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--gold)]">
          Verdict · {review.verdict}
        </p>
        {title ? (
          <h3 className="mt-2 font-serif text-2xl text-white">{title}</h3>
        ) : null}
        <p className="mt-3 text-sm leading-relaxed text-[#c5d0ea]">
          {review.summary}
        </p>
        <p className="mt-3 truncate text-xs text-zinc-500">{source}</p>
      </div>

      {review.findings.length === 0 ? (
        <p className="text-sm text-[var(--ok)]">No material issues found.</p>
      ) : (
        review.findings.map((f) => (
          <article
            key={f.id}
            className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-md"
          >
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={f.severity} />
              <span className="text-[11px] uppercase tracking-widest text-zinc-400">
                {f.category}
              </span>
            </div>
            <h4 className="mt-3 text-lg text-white">{f.title}</h4>
            {(f.file || f.line) && (
              <p className="mt-1 text-xs text-[var(--ice)]">
                {f.file ?? "unknown file"}
                {f.line ? `:${f.line}` : ""}
              </p>
            )}
            <p className="mt-3 text-sm leading-relaxed text-[#c5d0ea]">
              {f.explanation}
            </p>
            {f.suggestion ? (
              <p className="mt-3 text-sm text-[var(--gold)]">{f.suggestion}</p>
            ) : null}
            {f.codeFix ? (
              <pre className="mt-4 overflow-x-auto rounded-xl bg-[#0a0d16] p-4 text-xs text-[#d7e3ff]">
                <code>{f.codeFix}</code>
              </pre>
            ) : null}
          </article>
        ))
      )}
    </div>
  );
}
