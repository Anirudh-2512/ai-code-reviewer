"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReviewResult } from "@/lib/types";
import { ReviewResults } from "./ReviewResults";

type Payload = {
  source: string;
  title?: string;
  review: ReviewResult;
};

const VERDICT_RANK = { safe: 0, "needs-work": 1, blocked: 2 } as const;

export function ReviewStudio() {
  const [prUrl, setPrUrl] = useState("");
  const [diff, setDiff] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [stage, setStage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => {
      clearInterval(t);
      setElapsed(0);
    };
  }, [loading]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStage(null);
    setPayload(null);
    try {
      let merged: Payload | null = null;
      let resume = 0;
      // Auto-resume: large diffs are reviewed in allotments under the free
      // tier's token budget; keep fetching the remaining chunks and merge.
      for (let pass = 0; (pass === 0 || resume > 0) && pass < 3; pass++) {
        // One retry per pass: a fully rate-limited pass (503) usually clears
        // within a minute as the free-tier token window resets.
        for (let attempt = 0; ; attempt++) {
          const res = await fetch("/api/review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prUrl, diff, resumeFrom: resume }),
          });
          const raw = await res.text();
          let data: {
            error?: string;
            source?: string;
            title?: string;
            review?: ReviewResult;
          };
          try {
            data = JSON.parse(raw);
          } catch {
            throw new Error(
              res.status === 408 || res.status === 504
                ? "Review timed out on the server. Try a smaller PR or paste a shorter diff."
                : "The server returned an error page instead of a review. Try again — large PRs may need a smaller diff."
            );
          }
          if (!res.ok) {
            if (res.status === 503 && attempt === 0) {
              setStage(
                `Rate limited by the free tier — waiting 45s, then retrying the remaining parts…`
              );
              await new Promise((r) => setTimeout(r, 45_000));
              continue;
            }
            throw new Error(
              data.error || `Review failed (${res.status})`
            );
          }
          if (!data.review || !data.source)
            throw new Error("Unexpected response from server.");
        if (merged === null) {
          merged = {
            source: data.source,
            title: data.title,
            review: data.review,
          };
        } else {
          const prev: Payload = { ...merged };
          merged = {
            source: prev.source,
            title: data.title ?? prev.title,
            review: mergeReviews(prev.review, data.review),
          };
        }
        setPayload(merged);
        const next = data.review.resumeIndex;
        if (next != null && pass < 2) {
          setStage(
            `Reviewed — automatically reviewing the remaining parts (pass ${pass + 2}/3). Findings below update as each pass completes.`
          );
        }
        resume = next != null ? next : 0;
        break;
        }
      }
      // Final pass done (or no more chunks): drop the resume marker so the
      // results read as complete, and clear the progress stage.
      if (merged) {
        merged = { ...merged, review: { ...merged.review, resumeIndex: undefined } };
      }
      setPayload(merged);
      setStage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setLoading(false);
    }
  }

  function mergeReviews(prev: ReviewResult, next: ReviewResult): ReviewResult {
    const seen = new Set(
      prev.findings.map((f) => `${f.file ?? ""}:${f.line ?? ""}:${f.title}`)
    );
    // A newer pass supersedes the previous pass's bookkeeping notes (partial
    // counts, skip notices) — only part texts and fresh notes remain.
    const stripNotes = (s: string) =>
      s
        .replace(/\s*\[Partial review[^.\]]*\.\]/g, " ")
        .replace(/\s*Parts \d+-\d+ were skipped to stay within the server time limit\.\s*/g, " ")
        .replace(/\s*Stopped early to return results within the server time limit\.\s*/g, " ")
        .replace(/\s*\(Resumed from part \d+\)\s*/g, " ")
        .replace(/ {2,}/g, " ")
        .trim();
    return {
      verdict:
        VERDICT_RANK[next.verdict] > VERDICT_RANK[prev.verdict]
          ? next.verdict
          : prev.verdict,
      findings: [
        ...prev.findings,
        ...next.findings.filter(
          (f) => !seen.has(`${f.file ?? ""}:${f.line ?? ""}:${f.title}`)
        ),
      ],
      summary: `${stripNotes(prev.summary)} ${stripNotes(next.summary)}`,
      resumeIndex: next.resumeIndex,
    };
  }

  return (
    <section id="studio" className="relative z-10 mx-auto max-w-3xl px-4 pb-32 sm:px-6">
      <p className="font-ui text-xs uppercase tracking-[0.35em] text-[var(--gold)]">
        Review studio
      </p>
      <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl">
        Paste a PR or a diff. Get security-first findings.
      </h2>
      <p className="font-ui mt-4 max-w-xl text-sm text-[var(--muted)]">
        Public GitHub PR URL or unified diff. API keys never leave the server.
      </p>

      <form onSubmit={onSubmit} className="font-ui mt-8 space-y-4">
        <label className="block text-xs uppercase tracking-widest text-zinc-400">
          GitHub PR URL
          <input
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/42"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-[var(--gold)]"
          />
        </label>
        <label className="block text-xs uppercase tracking-widest text-zinc-400">
          Or paste a diff
          <textarea
            value={diff}
            onChange={(e) => setDiff(e.target.value)}
            rows={8}
            placeholder={"--- a/app.py\n+++ b/app.py\n@@ ..."}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-xs text-white outline-none focus:border-[var(--gold)]"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-[var(--gold)] px-6 py-3 text-sm font-semibold text-black disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
        >
          {loading ? `Reviewing… ${elapsed}s` : "Run AI review"}
        </button>
      </form>

      {loading && elapsed > 20 ? (
        <>
          {stage ? (
            <p className="font-ui mt-3 text-xs text-[var(--gold)]" aria-live="polite">
              {stage}
            </p>
          ) : null}
          <p className="font-ui text-xs text-[var(--muted)]" aria-live="polite">
            Large PRs are split into parts and rate-limited on Groq&apos;s free
            tier — this can take 2–8 minutes total. Keeping the tab open is
            safe; results appear below as each part completes.
          </p>
        </>
      ) : null}

      {error ? (
        <p className="font-ui mt-6 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {payload ? (
        <ReviewResults
          title={payload.title}
          source={payload.source}
          review={payload.review}
        />
      ) : null}
    </section>
  );
}
