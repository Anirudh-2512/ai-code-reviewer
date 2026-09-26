import { parseGithubPrUrl } from "./parse-pr-url";

const MAX_DIFF_CHARS = 80_000;

export async function fetchPrDiff(prUrl: string): Promise<{
  title: string;
  body: string;
  diff: string;
  htmlUrl: string;
}> {
  const parsed = parseGithubPrUrl(prUrl);
  if (!parsed) throw new Error("Not a valid GitHub pull request URL.");

  const { owner, repo, number } = parsed;
  const token = process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ai-code-reviewer",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const metaRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
    { headers, cache: "no-store" }
  );

  if (metaRes.status === 404) {
    throw new Error("PR not found. Use a public repository.");
  }
  if (!metaRes.ok) {
    throw new Error(`GitHub error (${metaRes.status}). Check URL or token.`);
  }

  const meta = (await metaRes.json()) as {
    title: string;
    body: string | null;
    html_url: string;
  };

  const diffHeaders: Record<string, string> = {
    Accept: "application/vnd.github.v3.diff",
    "User-Agent": "ai-code-reviewer",
  };
  if (token) diffHeaders.Authorization = `Bearer ${token}`;

  const diffRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
    { headers: diffHeaders, cache: "no-store" }
  );

  if (!diffRes.ok) throw new Error("Could not download the PR diff.");

  let diff = await diffRes.text();
  if (diff.length > MAX_DIFF_CHARS) {
    diff =
      diff.slice(0, MAX_DIFF_CHARS) +
      "\n\n[TRUNCATED: diff too large for one review pass]";
  }

  return {
    title: meta.title,
    body: meta.body ?? "",
    diff,
    htmlUrl: meta.html_url,
  };
}
