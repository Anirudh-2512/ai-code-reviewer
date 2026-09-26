# Sentinel — AI Code Reviewer

A web application that reviews **GitHub pull requests** and **pasted code diffs** with AI, with a security-first lens.

Paste a public PR URL (or a unified diff), and Sentinel analyzes the change with **Groq** — flagging injection risks, leaked secrets, XSS vectors, auth gaps — then shows each finding with severity, file/line attribution, an explanation, and a suggested fix.

---

## Features

- **PR review by URL** — accepts any public GitHub PR: `https://github.com/owner/repo/pull/123`
- **Raw diff review** — paste a unified diff for instant review, no repo required
- **Security-first findings** — SQL/NoSQL injection, XSS, hardened secrets, command injection, path traversal, SSRF, insecure deserialization, auth/authz gaps, weak crypto
- **Also reviews** — correctness bugs and high-impact performance issues (N+1, unbounded loops), not just security
- **Structured output** — verdict (`safe` / `needs-work` / `blocked`), summary, and per-finding severity/category/file/line + code fix
- **API-key isolation** — Groq and GitHub tokens stay on the server; the browser never sees them
- **Free-tier resilient** — large diffs are automatically split into token-budgeted chunks, reviewed sequentially with rate-limit backoff, and merged
- **Cinematic UI** — falling green matrix code rain + WebGL starfield/orb (React Three Fiber), film-grain + vignette overlays
- **Mobile-ready** — responsive layout, 16px inputs (no iOS zoom-jump), GPU settings tuned down automatically on small screens
- **Accessible & responsible motion** — `prefers-reduced-motion` renders a static frame instead of animated rain
- **Zero cost** — Groq free tier + GitHub REST API + Vercel free hosting

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router, route handlers) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + custom CSS variables |
| AI | Groq (`openai/gpt-oss-120b`, fallback `openai/gpt-oss-20b`) |
| Source of diffs | GitHub REST API (`application/vnd.github.v3.diff`) |
| 3D / visuals | React Three Fiber + Drei ("three"), 2D canvas (matrix rain) |
| Deployment | Vercel |

---

## How it works

```
Browser                     Next.js server                     External
───────                     ──────────────                     ────────
paste PR URL / diff  ──►  POST /api/review
                           ├─ parse URL (regex)
                           ├─ GET github.com PR meta  ───────►  GitHub API
                           ├─ GET PR as .diff materialization ► GitHub API
                           ├─ truncate > 80k chars
                           ├─ chunk to token budget (≈15k chars)
                           ├─ review each chunk        ───────► Groq (json_mode)
                           │    └─ 429 → backoff & retry
                           ├─ merge verdicts + findings
                           ◄── JSON { summary, verdict, findings } ──┘
display verdict cards ◄──  (API keys never reach the client)
```

1. **Parser** (`src/lib/parse-pr-url.ts`) validates the PR URL and extracts `owner/repo/number`.
2. **GitHub fetch** (`src/lib/github.ts`) downloads PR metadata + the diff in GitHub's `.diff` materialization, truncating at 80k characters.
3. **Chunker + reviewer** (`src/lib/groq.ts`) sizes requests to fit Groq's free-tier ~8,000 tokens-per-minute budget: small diffs get a single call; large diffs are split at hunk boundaries and each chunk is reviewed with the same security prompt. Findings and summaries from all parts are merged, and the worst verdict wins.
4. **Prompt** (`src/lib/prompt.ts`) instructs the model to return **strict JSON** with a fixed schema and to not invent files/lines that aren't in the diff.
5. **UI** (`src/components/`) renders the verdict and finding cards — no markdown, just typed React props.

---

## Project structure

```
src/
├── app/
│   ├── globals.css                 # theme variables, grain/vignette, base styles
│   ├── layout.tsx                  # fonts (next/font), metadata, overlays
│   ├── page.tsx                    # hero + review studio composition
│   └── api/
│       └── review/
│           └── route.ts            # POST handler (nodejs runtime, 60s cap)
├── components/
│   ├── scene/
│   │   ├── MatrixRain.tsx          # 2d-canvas green code rain (background)
│   │   ├── CinematicCanvas.tsx     # R3F canvas wrapper (mobile-aware)
│   │   ├── Starfield.tsx           # seeded particle field
│   │   └── CoreOrb.tsx             # distorted icosahedron hero object
│   ├── review/
│   │   ├── ReviewStudio.tsx        # form + live elapsed-time feedback
│   │   └── ReviewResults.tsx       # verdict + finding cards
│   └── ui/
│       └── SeverityBadge.tsx       # colored severity chips
└── lib/
    ├── config.ts                   # app name/tagline (one place)
    ├── types.ts                    # Severity, ReviewFinding, ReviewResult
    ├── parse-pr-url.ts             # PR URL → {owner, repo, number}
    ├── github.ts                   # fetch PR diff from GitHub API
    ├── prompt.ts                   # security-review system prompt
    └── groq.ts                     # Groq client, chunking, model fallback
```

---

## Run locally

```bash
npm install
cp .env.example .env.local
# then fill in values (see below)
npm run dev
```

Open http://localhost:3000.

### Environment variables

`.env.local` (never committed — already covered by `.gitignore`):

```
GROQ_API_KEY=gsk_...      # required — from https://console.groq.com/keys
GITHUB_TOKEN=ghp_...      # optional — classic token, public_repo scope.
                          # Without it the GitHub API is limited to 60 requests/hour
                          # per IP; with it, 5,000/hour.
```

`.env.example` is committed with empty values as a template for other developers.

### Try it

**Pasted diff (should return `blocked` with a critical SQL-injection finding):**

```diff
--- a/query.py
+++ b/query.py
@@ -1,3 +1,4 @@
 def get_user(db, user_id):
-    return db.execute("SELECT * FROM users WHERE id = %s", (user_id,))
+    return db.execute("SELECT * FROM users WHERE id = '%s'" % user_id)
```

**Real PR examples (public):**

- `https://github.com/vercel/next.js/pull/99269`
- any public PR URL copied from a repo's *Pull requests* tab

---

## API reference

`POST /api/review` — `Content-Type: application/json`

| Field  | Type   | Notes                                    |
|--------|--------|------------------------------------------|
| prUrl  | string | optional; full GitHub PR URL             |
| diff   | string | optional; unified diff text              |

At least one is required; if both are given, the PR URL wins.

**Success response:**

```json
{
  "source": "https://github.com/owner/repo/pull/123",
  "title": "PR title (only for PR URLs)",
  "review": {
    "summary": "…",
    "verdict": "safe | needs-work | blocked",
    "findings": [
      {
        "id": "F1",
        "severity": "critical | high | medium | low | info",
        "category": "sql-injection | xss | secrets | command-injection | auth | correctness | performance | other",
        "title": "short title",
        "file": "path in the diff",
        "line": 12,
        "explanation": "why this matters",
        "suggestion": "how to fix",
        "codeFix": "corrected snippet (optional)"
      }
    ]
  }
}
```

**Errors:** `400` for empty/invalid input or a banned URL, `404`-mirroring message when the PR doesn't exist or the repo is private, `500` with the upstream reason otherwise.

---

## Verdict semantics

| Verdict      | Meaning                                  |
|--------------|------------------------------------------|
| `blocked`    | critical or high security issue present |
| `needs-work` | medium issues or real correctness bugs  |
| `safe`       | no material issues                      |

For multi-chunk (large) diffs the final verdict is the worst among all chunks.

---

## Deploy to Vercel (free)

1. Push the repo to GitHub.
2. https://vercel.com/new → import the repository.
3. **Environment Variables** for *Production* and *Preview*:
   - `GROQ_API_KEY` — required
   - `GITHUB_TOKEN` — optional (recommended; raises GitHub quota)
4. Deploy.

Notes:
- Route handlers run with `runtime = "nodejs"` and `maxDuration = 240` (Fluid compute Hobby tier), giving large multi-chunk reviews headroom; the client degrades gracefully with a clear message if a review still times out.

---

## Design & accessibility decisions

- **Model choice** — Groq's Llama models were retired from the platform mid-build; the reviewer now uses `openai/gpt-oss-120b` with automatic fallback to `gpt-oss-20b` if a model disappears again.
- **`Math.random()` inside `useMemo`** fails React's purity rule — the starfield uses a seeded LCG PRNG (deterministic star positions, SSR-stable).
- **Fonts** load through `next/font` (self-hosted, no layout shift) instead of Google-hosted `<link>` tags.
- **Reduced motion** users get a static randomized-but-frozen code frame instead of falling rain.
- **Rate-limit UX** — large reviews take minutes on the free tier, so the submit button shows a live elapsed timer and explains the wait rather than appearing frozen.

---

## Limitations (honest scope)

- Only **public** repositories work (a `public_repo`-scoped token doesn't unlock private repos).
- Very large PRs are chunked, not fully exhaustive — later portions beyond 6 chunks are skipped and marked in the summary.
- The model can still miss things or produce false positives; findings are advisory, not proof of safety.
- Line numbers are the model's best effort against the diff context, not an exact anchor.

---

Technology summary for interviewers: *Next.js App Router keeps both provider keys server-side in route handlers, a prompt-engineering pipeline turns PR diffs into strict-JSON security findings, and the client presents severity-ranked results with suggested fixes. The free-tier token limits are handled with diff chunking and rate-limit backoff. The landing page adds a cinematic WebGL hero without touching the functional studio.*
