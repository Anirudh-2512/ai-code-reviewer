"use client";

import { APP } from "@/lib/config";
import { MatrixRain } from "@/components/scene/MatrixRain";
import { CinematicCanvas } from "@/components/scene/CinematicCanvas";
import { ReviewStudio } from "@/components/review/ReviewStudio";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      <MatrixRain />
      <CinematicCanvas />
      <header className="relative z-10 flex min-h-[70vh] flex-col items-center justify-center px-4 text-center sm:px-6">
        <p className="font-ui text-[10px] uppercase tracking-[0.3em] text-[var(--gold)] sm:text-xs sm:tracking-[0.45em]">
          {APP.tagline}
        </p>
        <h1 className="mt-4 text-4xl sm:mt-5 sm:text-6xl md:text-7xl">
          {APP.name}
        </h1>
        <p className="font-ui mx-auto mt-4 max-w-xl text-sm text-[var(--muted)] sm:mt-6 md:text-base">
          {APP.description}
        </p>
        <a
          href="#studio"
          className="font-ui mt-8 w-full max-w-xs rounded-full border border-[var(--gold)]/50 px-6 py-3 text-sm text-[var(--gold)] sm:mt-10 sm:w-auto sm:max-w-none"
        >
          Open review studio
        </a>
      </header>
      <ReviewStudio />
      <footer className="relative z-10 pb-12 text-center text-xs text-zinc-500">
        Next.js · Groq · GitHub API · React Three Fiber · Vercel free tier
      </footer>
    </main>
  );
}
