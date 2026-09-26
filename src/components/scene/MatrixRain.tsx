"use client";

import { useEffect, useRef } from "react";

const GLYPHS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789{}[]<>$#_%;=/|\\";

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const fontSize = 14;
    const fade = "rgba(5, 6, 10, 0.14)";

    let raf = 0;
    let columns = 0;
    let drops: number[] = [];
    let last = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.ceil(w / fontSize);
      drops = Array.from({ length: columns }, () =>
        Math.floor((Math.random() * h) / fontSize)
      );
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, w, h);
    };

    const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

    const paintFrame = () => {
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${fontSize}px monospace`;
      ctx.textBaseline = "top";
      for (let i = 0; i < columns; i++) {
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        ctx.fillStyle = Math.random() > 0.96 ? "#e8ffe9" : "#9dffb0";
        ctx.fillText(glyph(), x, y);
        if (y > h && Math.random() > 0.976) drops[i] = 0;
        drops[i]++;
      }
    };

    const staticFrame = () => {
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${fontSize}px monospace`;
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(0, 217, 78, 0.35)";
      for (let i = 0; i < columns; i++) {
        for (let j = 0; j < 14; j++) {
          if (Math.random() > 0.85) {
            ctx.fillText(glyph(), i * fontSize, j * fontSize);
          }
        }
      }
    };

    resize();
    window.addEventListener("resize", resize);

    if (reduced) {
      staticFrame();
    } else {
      const loop = (time: number) => {
        if (time - last >= 33) {
          paintFrame();
          last = time;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 bg-[#05060a]" aria-hidden>
      <canvas
        ref={canvasRef}
        className="h-full w-full opacity-60"
      />
    </div>
  );
}
