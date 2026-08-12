import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Skeleton } from '@mui/material';
import { tokens } from '../../theme';

// ---------------------------------------------------------------------------
// Error boundary — catches WebGL rendering failures gracefully
// ---------------------------------------------------------------------------
export class SceneErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: unknown) {
    console.warn('3D scene WebGL fallback active:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            minHeight: 280,
            borderRadius: 3,
            background: `radial-gradient(circle at center, ${tokens.cyanDark} 0%, ${tokens.bgDark} 100%)`,
          }}
        />
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// 3D Scene Lazy Loader
// ---------------------------------------------------------------------------
const MedicalHologramScene = lazy(async () => {
  const [{ Canvas, useFrame }, { OrbitControls, Torus, Sphere }] = await Promise.all([
    import('@react-three/fiber'),
    import('@react-three/drei'),
  ]);

  function DiagnosticOrganCore() {
    const meshRef = useRef<any>(null);
    const ringRef1 = useRef<any>(null);
    const ringRef2 = useRef<any>(null);

    useFrame((state, delta) => {
      if (meshRef.current) {
        meshRef.current.rotation.y += delta * 0.25;
        meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.2;
      }
      if (ringRef1.current) {
        ringRef1.current.rotation.z += delta * 0.4;
        ringRef1.current.rotation.x += delta * 0.15;
      }
      if (ringRef2.current) {
        ringRef2.current.rotation.z -= delta * 0.5;
        ringRef2.current.rotation.y += delta * 0.2;
      }
    });

    return (
      <group>
        {/* Core Volumetric Organ Sphere Mesh */}
        <Sphere ref={meshRef} args={[1.35, 24, 24]}>
          <meshStandardMaterial
            color={tokens.cyan}
            wireframe
            transparent
            opacity={0.45}
            emissive={tokens.cyanDark}
            emissiveIntensity={0.6}
          />
        </Sphere>

        {/* Inner Anomaly Core Node */}
        <Sphere args={[0.5, 16, 16]}>
          <meshStandardMaterial
            color={tokens.confidenceHigh}
            transparent
            opacity={0.7}
            emissive={tokens.confidenceHigh}
            emissiveIntensity={0.8}
          />
        </Sphere>

        {/* Dynamic Holographic Scan Rings */}
        <Torus ref={ringRef1} args={[2.0, 0.02, 16, 100]}>
          <meshBasicMaterial color={tokens.cyanLight} transparent opacity={0.65} />
        </Torus>

        <Torus ref={ringRef2} args={[2.4, 0.015, 16, 100]}>
          <meshBasicMaterial color={tokens.confidenceHigh} transparent opacity={0.5} />
        </Torus>
      </group>
    );
  }

  function OrbitingScanParticles() {
    const groupRef = useRef<any>(null);

    const particles = useMemo(() => {
      const p = [];
      for (let i = 0; i < 30; i++) {
        const radius = 1.8 + Math.random() * 1.2;
        const angle = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * 2;
        p.push({ radius, angle, y, speed: 0.2 + Math.random() * 0.5, color: i % 2 === 0 ? tokens.cyanLight : tokens.confidenceHigh });
      }
      return p;
    }, []);

    useFrame((state) => {
      if (groupRef.current) {
        groupRef.current.rotation.y = state.clock.elapsedTime * 0.15;
      }
    });

    return (
      <group ref={groupRef}>
        {particles.map((pt, i) => (
          <mesh key={i} position={[Math.cos(pt.angle) * pt.radius, pt.y, Math.sin(pt.angle) * pt.radius]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshBasicMaterial color={pt.color} />
          </mesh>
        ))}
      </group>
    );
  }

  function SceneInner() {
    return (
      <Canvas camera={{ position: [0, 0, 5.2], fov: 45 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
        <ambientLight intensity={0.7} />
        <pointLight position={[10, 10, 10]} intensity={1.2} color={tokens.cyanLight} />
        <pointLight position={[-10, -10, -10]} intensity={0.8} color={tokens.confidenceHigh} />
        <DiagnosticOrganCore />
        <OrbitingScanParticles />
        <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.8} maxPolarAngle={Math.PI / 1.5} minPolarAngle={Math.PI / 3} />
      </Canvas>
    );
  }

  return { default: SceneInner };
});

export function ThreeDMedicalScene() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (reducedMotion) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          minHeight: 280,
          borderRadius: 3,
          background: `radial-gradient(circle at center, ${tokens.cyanDark} 0%, ${tokens.bgDark} 100%)`,
        }}
      />
    );
  }

  return (
    <SceneErrorBoundary>
      <Suspense fallback={<Skeleton variant="rounded" width="100%" height="100%" sx={{ minHeight: 280 }} />}>
        <MedicalHologramScene />
      </Suspense>
    </SceneErrorBoundary>
  );
}

export default ThreeDMedicalScene;
