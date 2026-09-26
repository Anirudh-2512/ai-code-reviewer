# Decisions

- Temperament: inferred (high confidence) from product domain — security tooling wants an authoritative, precise, slightly futuristic identity. Did not interrupt the user.
- 3D verdict: justified as the cinematic landing shell per explicit project spec (build doc). 3D touches ONLY the hero canvas + backdrop; the review studio (the actual product) stays clean, static, functional.
- Model change: spec said llama-3.3-70b-versatile, but Groq returned model_not_found on 2026-09-26. Live model list check showed meta Llama models retired; openai/gpt-oss-120b + json_mode is the current quality option. Implemented a two-model fallback chain (120b -> 20b) in src/lib/groq.ts.
- Fonts: replaced manual <link> tags with next/font (Cormorant Garamond, IBM Plex Sans) to satisfy @next/next/no-page-custom-font and gain self-hosted font loading.
- Starfield randomness: replaced Math.random() inside useMemo with a seeded LCG PRNG to satisfy the react-hooks/purity lint rule (deterministic geometry, SSR-safe).
- Secrets: GROQ_API_KEY + GITHUB_TOKEN live only in .env.local (git-ignored, verified) and are read server-side in route handlers. Keys never cross to the client bundle.
- next/font + Turbopack root warning: harmless dev warning about package-lock.json outside repo; ignored.
