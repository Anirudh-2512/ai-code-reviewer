"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { Starfield } from "./Starfield";
import { CoreOrb } from "./CoreOrb";

function Lights() {
  return (
    <>
      <fog attach="fog" args={["#05060a", 9, 28]} />
      <ambientLight intensity={0.22} />
      <pointLight position={[4, 6, 4]} intensity={18} color="#9bd4ff" />
      <pointLight position={[-6, -2, -4]} intensity={10} color="#e8c07a" />
    </>
  );
}

export function CinematicCanvas() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 7.5], fov: 42 }}
        dpr={isMobile ? [1, 1.25] : [1, 1.75]}
        gl={{ alpha: true, antialias: !isMobile, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <Lights />
        <Starfield count={isMobile ? 700 : 1800} />
        <CoreOrb />
      </Canvas>
    </div>
  );
}
