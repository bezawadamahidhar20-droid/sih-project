import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Skeleton } from '@mui/material';

// Export tokens & helpers as provided in upgrade spec
export { tokens, confidenceColor, buildTheme } from '../../theme';

// ---------------------------------------------------------------------------
// Error boundary — catches WebGL/Three.js render failures gracefully
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
    console.warn('3D scene failed to render, falling back to static panel.', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            minHeight: 320,
            borderRadius: 3,
            background: 'linear-gradient(135deg, #13294B 0%, #0F6E6E 100%)',
          }}
        />
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// 3D scene (lazy-loaded to keep Three.js bundle out of initial page load)
// ---------------------------------------------------------------------------
const HeroScene = lazy(async () => {
  const [{ Canvas, useFrame }, { Icosahedron }, THREE] = await Promise.all([
    import('@react-three/fiber'),
    import('@react-three/drei'),
    import('three'),
  ]);

  function ScanVolume() {
    const meshRef = useRef<any>(null);
    const sweepRef = useRef<any>(null);

    useFrame((state, delta) => {
      if (meshRef.current) {
        meshRef.current.rotation.y += delta * 0.15;
        meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.15;
      }
      if (sweepRef.current) {
        sweepRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 1.1;
      }
    });

    return (
      <group>
        <Icosahedron ref={meshRef} args={[1.6, 1]}>
          <meshBasicMaterial color="#3D9A9A" wireframe transparent opacity={0.55} />
        </Icosahedron>
        <mesh ref={sweepRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0, 1.9, 48]} />
          <meshBasicMaterial color="#C77B2E" transparent opacity={0.12} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  function OrbitDot({
    radius,
    speed,
    offset,
    color,
  }: {
    radius: number;
    speed: number;
    offset: number;
    color: string;
  }) {
    const ref = useRef<any>(null);
    useFrame((state) => {
      if (ref.current) {
        const t = state.clock.elapsedTime * speed + offset;
        ref.current.position.set(Math.cos(t) * radius, Math.sin(t * 0.6) * 0.4, Math.sin(t) * radius);
      }
    });
    return (
      <mesh ref={ref}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    );
  }

  function SceneInner() {
    const dots = useMemo(
      () => [
        { radius: 2.1, speed: 0.4, offset: 0, color: '#3D9A9A' },
        { radius: 2.4, speed: 0.25, offset: 2, color: '#C77B2E' },
        { radius: 1.9, speed: 0.55, offset: 4, color: '#2E7D5B' },
      ],
      []
    );

    return (
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.6} />
        <ScanVolume />
        {dots.map((d, i) => (
          <OrbitDot key={i} {...d} />
        ))}
      </Canvas>
    );
  }

  return { default: SceneInner };
});

function StaticFallback() {
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 320,
        borderRadius: 3,
        background: 'linear-gradient(135deg, #13294B 0%, #0F6E6E 100%)',
      }}
    />
  );
}

export function HeroSceneLazy() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (reducedMotion) return <StaticFallback />;

  return (
    <SceneErrorBoundary>
      <Suspense
        fallback={<Skeleton variant="rounded" width="100%" height="100%" sx={{ minHeight: 320 }} />}
      >
        <HeroScene />
      </Suspense>
    </SceneErrorBoundary>
  );
}

export default HeroSceneLazy;
