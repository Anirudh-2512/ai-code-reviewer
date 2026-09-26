import { NextResponse } from "next/server";
import { fetchPrDiff } from "@/lib/github";
import { reviewWithGroq } from "@/lib/groq";
import { parseGithubPrUrl } from "@/lib/parse-pr-url";

export const runtime = "nodejs";
// Fluid-compute Hobby allows up to 300s; large chunked reviews need headroom.
export const maxDuration = 240;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      prUrl?: string;
      diff?: string;
      resumeFrom?: number;
      skipIndexes?: unknown;
    };
    const prUrl = body.prUrl?.trim();
    const pasted = body.diff?.trim();

    if (!prUrl && !pasted) {
      return NextResponse.json(
        { error: "Paste a GitHub PR URL or a code diff." },
        { status: 400 }
      );
    }

    if (prUrl && !parseGithubPrUrl(prUrl) && !pasted) {
      return NextResponse.json(
        { error: "Use a URL like https://github.com/owner/repo/pull/123" },
        { status: 400 }
      );
    }

    let title: string | undefined;
    let description: string | undefined;
    let diff = pasted ?? "";
    let source = "pasted diff";

    if (prUrl && parseGithubPrUrl(prUrl)) {
      const pr = await fetchPrDiff(prUrl);
      title = pr.title;
      description = pr.body;
      diff = pr.diff;
      source = pr.htmlUrl;
    }

    if (diff.length < 8) {
      return NextResponse.json(
        { error: "Diff is empty. Nothing to review." },
        { status: 400 }
      );
    }

    const review = await reviewWithGroq({
      title,
      body: description,
      diff,
      resumeFrom:
        typeof body.resumeFrom === "number" && Number.isFinite(body.resumeFrom)
          ? body.resumeFrom
          : 0,
      skipIndexes: Array.isArray(body.skipIndexes)
        ? (body.skipIndexes.filter(
            (n): n is number => typeof n === "number" && Number.isInteger(n)
          ) as number[])
        : undefined,
    });

    return NextResponse.json({ source, title, review });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review failed.";
    // 503 tells the client this is transient (free-tier rate limit) and
    // retrying the same request after a short wait usually succeeds.
    const status = message.includes("Groq review failed") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
