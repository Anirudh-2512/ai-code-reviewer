"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReviewResult } from "@/lib/types";
import { ReviewResults } from "./ReviewResults";

type Payload = {
  source: string;
  title?: string;
  review: ReviewResult;
};

export function ReviewStudio() {
  const [prUrl, setPrUrl] = useState("");
  const [diff, setDiff] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);

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
    setPayload(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prUrl, diff }),
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
      if (!res.ok) throw new Error(data.error || `Review failed (${res.status})`);
      if (!data.review || !data.source) throw new Error("Unexpected response from server.");
      setPayload({
        source: data.source,
        title: data.title,
        review: data.review,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setLoading(false);
    }
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
        <p className="font-ui mt-3 text-xs text-[var(--muted)]" aria-live="polite">
          Large PRs are split into parts and rate-limited on Groq&apos;s free tier —
          this can take 2–5 minutes. Keeping the tab open is safe; results appear here when done.
        </p>
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
