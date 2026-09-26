import Groq from "groq-sdk";
import { SYSTEM_PROMPT, COMPACT_PROMPT } from "./prompt";
import type { ReviewFinding, ReviewResult } from "./types";

const MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

// Free-tier Groq ("on_demand") enforces ~8000 tokens-per-minute for these models.
// We size requests so each single call fits the budget, and split larger diffs
// into chunks that are reviewed sequentially and then merged.
const CHARS_PER_TOKEN = 4;
const TPM_BUDGET = 8_000;
const PROMPT_TOKENS = Math.ceil(SYSTEM_PROMPT.length / CHARS_PER_TOKEN) + 400;
const OUTPUT_RESERVE_TOKENS = 1_200;

const SINGLE_SHOT_CHARS = Math.floor(
  (TPM_BUDGET - PROMPT_TOKENS - OUTPUT_RESERVE_TOKENS) * CHARS_PER_TOKEN
);
const MAX_CHUNK_CHARS = 15_000;
const MAX_CHUNKS = 6;

const VERDICT_RANK: Record<ReviewResult["verdict"], number> = {
  safe: 0,
  "needs-work": 1,
  blocked: 2,
};

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Under the free tier's 8k TPM we can usually only complete 2-3 large parts
// per request — so review the risky chunks first (secrets, SQL, auth, exec).
function chunkPriority(chunk: string): number {
  const signals: [RegExp, number][] = [
    [/(\.env[:\s]|credential|secret|token|password|api_key|apikey)/i, 6],
    [/(exec|spawn|eval\(|subprocess|shell|command)/i, 5],
    [/(SELECT\s|INSERT\s|UPDATE\s|DELETE\s|DROP\s|execute\(|\.query\()/i, 4],
    [/(auth|login|logout|session|jwt|cookie|permission|role|admin)/i, 4],
    [/(\.sql|\.db|migration|schema)/i, 3],
    [/\.md|README|CHANGELOG|package-lock/i, -3],
    [/license/i, -4],
  ];
  let score = 0;
  for (const [re, weight] of signals) if (re.test(chunk)) score += weight;
  return score;
}

function chunkDiff(diff: string): string[] {
  const lines = diff.split("\n");
  const chunks: string[] = [];
  let cur: string[] = [];
  let size = 0;

  const flush = () => {
    if (cur.length) {
      chunks.push(cur.join("\n"));
      cur = [];
      size = 0;
    }
  };

  for (const line of lines) {
    const len = line.length + 1;
    if (line.startsWith("@@") && size + len > MAX_CHUNK_CHARS / 2) {
      flush();
    }
    if (size + len > MAX_CHUNK_CHARS) {
      flush();
      if (len > MAX_CHUNK_CHARS) {
        for (let i = 0; i < line.length; i += MAX_CHUNK_CHARS) {
          chunks.push(line.slice(i, i + MAX_CHUNK_CHARS));
        }
        continue;
      }
    }
    cur.push(line);
    size += len;
  }
  flush();

  return chunks;
}

function normalize(parsed: Partial<ReviewResult>): ReviewResult {
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  return {
    summary: parsed.summary || "Review completed.",
    verdict:
      parsed.verdict === "safe" || parsed.verdict === "blocked"
        ? parsed.verdict
        : "needs-work",
    findings,
  };
}

function getRateLimitResetMs(err: unknown): number {
  const headers = (err as {
    headers?: Record<string, string | undefined> | Headers;
  }).headers;
  if (!headers) return 0;
  const get = (k: string): string | undefined => {
    if (typeof headers === "object" && !("get" in headers)) {
      return headers[k.toLowerCase()] ?? headers[k];
    }
    try {
      return (headers as Headers).get(k) ?? undefined;
    } catch {
      return undefined;
    }
  };
  const resetTokens = get("x-ratelimit-reset-tokens");
  if (resetTokens) {
    const ms = Number(resetTokens);
    if (Number.isFinite(ms) && ms > 0) return Math.min(ms + 1_000, 45_000);
  }
  const retryAfter = get("retry-after");
  if (retryAfter) {
    const sec = Number(retryAfter);
    if (Number.isFinite(sec) && sec > 0) return Math.min(sec * 1_000, 45_000);
  }
  return 0;
}

function deadlineHit(deadline?: number): boolean {
  return deadline !== undefined && Date.now() > deadline;
}

async function chat(
  groq: Groq,
  model: string,
  user: string,
  deadline?: number,
  systemPrompt: string = SYSTEM_PROMPT,
  useJsonFormat: boolean = true,
  temperature: number = 0.1
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (deadlineHit(deadline)) {
      throw new Error("DEADLINE_EXCEEDED");
    }
    try {
      const completion = await groq.chat.completions.create({
        model,
        temperature,
        // Keep the model's hidden reasoning from eating the output budget
        // (produces empty final content and json_validate errors otherwise).
        reasoning_effort: "low",
        max_tokens: 8_192,
        ...(useJsonFormat
          ? { response_format: { type: "json_object" as const } }
          : {}),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: user },
        ],
      });
      return completion.choices[0]?.message?.content ?? "{}";
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number }).status;
      if (status === 429 || message.includes("rate_limit_exceeded")) {
        if (attempt < 2) {
          const wait =
            getRateLimitResetMs(err) || 15_000 * attempt; // header-driven, else 15s
          if (deadlineHit(Date.now() + wait)) {
            throw new Error("DEADLINE_EXCEEDED");
          }
          await sleep(wait);
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Groq call failed.");
}

async function reviewText(
  groq: Groq,
  user: string,
  deadline?: number,
  systemPrompt: string = SYSTEM_PROMPT,
  useJsonFormatAttempt0: boolean = true
): Promise<ReviewResult> {
  let lastError: unknown;
  for (const model of MODELS) {
    // Two attempts per model: JSON-mode generations occasionally fail
    // validation transiently; a retry usually produces valid output.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (deadlineHit(deadline)) {
        throw new Error("DEADLINE_EXCEEDED");
      }
      try {
        const raw = await chat(
          groq,
          model,
          user,
          deadline,
          systemPrompt,
          attempt === 0 && useJsonFormatAttempt0,
          attempt === 0 ? 0.1 : 0.5
        );
        const parsed = JSON.parse(extractJson(raw)) as Partial<ReviewResult>;
        return normalize(parsed);
      } catch (err) {
        const desc =
          err instanceof Error ? err.message : String(err).slice(0, 120);
        console.error(
          `[groq] part attempt failed (model=${model}, attempt=${attempt}): ${desc.slice(0, 160)}`
        );
        if (err instanceof SyntaxError || !(err instanceof Error)) {
          // JSON.parse / extractJson failure — retryable, stay on this model.
          lastError = err;
          continue;
        }
        const message = err.message;
        if (message.includes("json_validate_failed")) {
          lastError = err;
          continue;
        }
        // Try the next model on missing model OR rate limit (different models
        // have independent TPM buckets on Groq). Anything else propagates.
        if (
          !message.includes("model_not_found") &&
          !message.includes("rate_limit_exceeded")
        ) {
          throw err;
        }
        lastError = err;
        break;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Groq review failed.");
}

function buildUserMessage(
  parts: { title?: string; body?: string },
  diffText: string,
  chunkIndex: number,
  chunkCount: number
): string {
  const header = [
    parts.title ? `PR title: ${parts.title}` : null,
    parts.body ? `PR description:\n${parts.body}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const chunkNote =
    chunkCount > 1
      ? `This is chunk ${chunkIndex}/${chunkCount} of a large diff. Only report issues visible in this chunk; files outside it are reviewed separately.`
      : null;

  return [
    header || null,
    chunkNote,
    "Diff:\n```diff\n" + diffText + "\n```",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function reviewWithGroq(input: {
  title?: string;
  body?: string;
  diff: string;
}): Promise<ReviewResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing. Set it in .env.local and Vercel.");
  }

  // Hard-bound every model request so hung connections can't blow past the
  // Vercel cap; SDK-internal retries off (our own retry logic handles it).
  const groq = new Groq({
    apiKey,
    timeout: 40_000,
    maxRetries: 0,
  });

  // Stay well under the 240s Vercel cap: finish what we can, return partial
  // results with a clear note instead of dying mid-request.
  const deadline = Date.now() + 170_000;

  if (input.diff.length <= SINGLE_SHOT_CHARS) {
    return reviewText(
      groq,
      buildUserMessage(input, input.diff, 1, 1),
      deadline
    );
  }

  const chunks = chunkDiff(input.diff);
  // Under the free tier's 8k TPM we can usually only complete 2-3 large parts
  // per request — so review the risky chunks first (secrets, SQL, auth, exec).
  chunks.sort((a, b) => chunkPriority(b) - chunkPriority(a));
  const finishedChars = chunks
    .slice(0, MAX_CHUNKS)
    .reduce((acc, c) => acc + c.length + 1, 0);
  const truncated = finishedChars < input.diff.length;
  const MIN_PART_RESERVE = 35_000;

  const results: ReviewResult[] = [];
  const count = Math.min(chunks.length, MAX_CHUNKS);
  const notes: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i > 0 && Date.now() + MIN_PART_RESERVE > deadline) {
      notes.push(
        ` Parts ${i + 1}-${count} were skipped to stay within the server time limit. Review these parts again from a fresh run.`
      );
      break;
    }
    try {
      results.push(
        await reviewText(
          groq,
          buildUserMessage(input, chunks[i], i + 1, count),
          deadline,
          COMPACT_PROMPT
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("DEADLINE_EXCEEDED")) {
        console.error(`[groq] chunk ${i + 1}: deadline hit, stopping early`);
        notes.push(
          ` Stopped early to return results within the server time limit; re-run later for the remaining parts.`
        );
        break;
      }
      if (message.includes("rate_limit_exceeded") || message.includes("429")) {
        notes.push(
          ` Part ${i + 1} hit the free-tier rate limit; keep trying any time for a complete review.`
        );
      } else {
        // Even unexpected failures must not 500 the whole review — skip the
        // part with a note so earlier results still count.
        console.error(
          `[groq] chunk ${i + 1}: skipped: ${message.slice(0, 160)}`
        );
        notes.push(
          ` Part ${i + 1} could not be completed (${message.slice(0, 80)}); re-run it later.`
        );
      }
    }
  }

  if (results.length === 0) {
    throw new Error(
      "Groq review failed. " +
        (notes.join(" ") ||
          "The free tier is rate-limiting this account; try again in a minute.")
    );
  }

  const worst = results.reduce<ReviewResult["verdict"]>(
    (acc, r) => (VERDICT_RANK[r.verdict] > VERDICT_RANK[acc] ? r.verdict : acc),
    "safe"
  );

  const findings: ReviewFinding[] = results.flatMap((r) => r.findings);

  let summary = results
    .map((r, i) => (count > 1 ? `Part ${i + 1}: ${r.summary}` : r.summary))
    .join(" ");
  if (count > 1 && results.length < count) {
    summary += ` [Partial review: ${results.length}/${count} parts completed.]`;
  }
  summary += notes.join(" ");
  if (truncated) {
    summary += " [Note: diff too large — later portions were not reviewed to stay within the free-tier token limit.]";
  }

  return { summary, verdict: worst, findings };
}
