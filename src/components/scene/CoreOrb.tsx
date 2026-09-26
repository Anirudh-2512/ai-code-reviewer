"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

export function CoreOrb() {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!mesh.current) return;
    mesh.current.rotation.y = t * 0.15;
    mesh.current.rotation.x = Math.sin(t * 0.2) * 0.15;
  });

  return (
    <Float speed={1.3} rotationIntensity={0.35} floatIntensity={0.5}>
      <mesh ref={mesh} scale={1.2}>
        <icosahedronGeometry args={[1.3, 10]} />
        <MeshDistortMaterial
          color="#7aa2ff"
          emissive="#14284f"
          roughness={0.25}
          metalness={0.7}
          distort={0.4}
          speed={1.5}
        />
      </mesh>
      <mesh scale={1.55}>
        <icosahedronGeometry args={[1.3, 1]} />
        <meshBasicMaterial color="#e8c07a" wireframe transparent opacity={0.2} />
      </mesh>
    </Float>
  );
}
