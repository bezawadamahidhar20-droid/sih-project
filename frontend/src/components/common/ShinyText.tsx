import { useRef, useState, type CSSProperties } from 'react';
import { motion, useMotionValue, useAnimationFrame, useTransform, useReducedMotion } from 'motion/react';

/**
 * ShinyText — metallic sheen that sweeps across text.
 * Adapted from react-bits (https://github.com/DavidHDev/react-bits, MIT+Commons Clause).
 * Uses the `motion` library already present in this project; no extra dependencies.
 */
interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  /** Full cycle length in seconds (sweep + brief hold). Higher = slower sheen. */
  speed?: number;
  className?: string;
  /** Base text color (also the color the text settles into). */
  color?: string;
  /** Color of the sweeping highlight. */
  shineColor?: string;
  /** Gradient angle in degrees. */
  spread?: number;
  /** Pause the sweep while the pointer is over the text. */
  pauseOnHover?: boolean;
}

export function ShinyText({
  text,
  disabled = false,
  speed = 3,
  className = '',
  color = '#ffffff',
  shineColor = '#8fc4e6',
  spread = 120,
  pauseOnHover = false,
}: ShinyTextProps) {
  const [isPaused, setIsPaused] = useState(false);
  const progress = useMotionValue(0);
  const elapsedRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  // All hooks above — conditional render below is safe.
  useAnimationFrame((time) => {
    if (reduceMotion || disabled || isPaused) {
      lastTimeRef.current = null;
      return;
    }
    if (lastTimeRef.current === null) {
      lastTimeRef.current = time;
      return;
    }
    const delta = time - lastTimeRef.current;
    lastTimeRef.current = time;
    elapsedRef.current += delta;

    // Sweep 0 -> 100 over the first 80% of the cycle, then hold off-screen.
    const cycleDuration = speed * 1000;
    const cycleTime = elapsedRef.current % cycleDuration;
    const sweepDuration = cycleDuration * 0.8;
    if (cycleTime < sweepDuration) {
      progress.set((cycleTime / sweepDuration) * 100);
    }
    // else: hold — don't touch progress (stays at 100, shine off-screen)
  });

  // p=0 -> 150% (shine off right), p=100 -> -50% (shine off left)
  const backgroundPosition = useTransform(progress, (p) => `${150 - p * 2}% center`);

  const gradientStyle: CSSProperties = {
    backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  // Respect prefers-reduced-motion: render static text in the base color.
  if (reduceMotion || disabled) {
    return (
      <span className={className} style={{ color }}>
        {text}
      </span>
    );
  }

  return (
    <motion.span
      className={className}
      style={{ ...gradientStyle, backgroundPosition }}
      onMouseEnter={pauseOnHover ? () => setIsPaused(true) : undefined}
      onMouseLeave={pauseOnHover ? () => setIsPaused(false) : undefined}
    >
      {text}
    </motion.span>
  );
}
