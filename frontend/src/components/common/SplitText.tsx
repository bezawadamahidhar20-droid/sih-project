import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { gsap } from 'gsap';
import { SplitText as GSAPSplitText } from 'gsap/SplitText';

gsap.registerPlugin(GSAPSplitText);

/**
 * SplitText — splits text into characters/words for a staggered entrance.
 * Adapted from react-bits (https://github.com/DavidHDev/react-bits, MIT+Commons Clause).
 * Animates on mount (after fonts load) rather than on scroll, so it stays
 * robust inside the app's AnimatePresence page transitions.
 * Respects prefers-reduced-motion.
 */
interface SplitTextProps {
  text: string;
  className?: string;
  /** Delay between elements in ms. */
  delay?: number;
  /** Animation duration in seconds. */
  duration?: number;
  ease?: string;
  splitType?: 'chars' | 'words' | 'lines' | 'words, chars';
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
  textAlign?: CSSProperties['textAlign'];
  onLetterAnimationComplete?: () => void;
}

export function SplitText({
  text,
  className = '',
  delay = 50,
  duration = 1.25,
  ease = 'power3.out',
  splitType = 'chars',
  from = { opacity: 0, y: 40 },
  to = { opacity: 1, y: 0 },
  tag = 'p',
  textAlign = 'center',
  onLetterAnimationComplete,
}: SplitTextProps) {
  const ref = useRef<HTMLElement>(null);
  const animationCompletedRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // Split only after fonts are ready so the split doesn't measure stale glyph widths.
  useEffect(() => {
    let mounted = true;
    if (document.fonts.status === 'loaded') {
      setFontsLoaded(true);
    } else {
      document.fonts.ready.then(() => {
        if (mounted) setFontsLoaded(true);
      });
    }
    return () => {
      mounted = false;
    };
  }, []);

  // All hooks above — conditional render below is safe.
  useEffect(() => {
    if (reduceMotion) return;
    if (!ref.current || !text || !fontsLoaded || animationCompletedRef.current) return;

    const el = ref.current;
    let tweens: gsap.core.Tween[] = [];

    const splitInstance = new GSAPSplitText(el, {
      type: splitType,
      smartWrap: true,
      autoSplit: splitType === 'lines',
      linesClass: 'split-line',
      wordsClass: 'split-word',
      charsClass: 'split-char',
      reduceWhiteSpace: false,
      onSplit: (self: GSAPSplitText) => {
        let targets: Element[] = [];
        if (splitType.includes('chars') && self.chars.length) targets = self.chars;
        if (!targets.length && splitType.includes('words') && self.words.length) targets = self.words;
        if (!targets.length && splitType.includes('lines') && self.lines.length) targets = self.lines;
        if (!targets.length) targets = self.chars || self.words || self.lines;

        const tween = gsap.fromTo(
          targets,
          { ...from },
          {
            ...to,
            duration,
            ease,
            stagger: delay / 1000,
            onComplete: () => {
              animationCompletedRef.current = true;
              onLetterAnimationComplete?.();
            },
            willChange: 'transform, opacity',
            force3D: true,
          }
        );
        tweens.push(tween);
      },
    });

    return () => {
      tweens.forEach((t) => t.kill());
      try {
        splitInstance.revert();
      } catch {
        /* no-op */
      }
      animationCompletedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay, duration, ease, splitType, fontsLoaded]);

  const style: CSSProperties = {
    textAlign,
    overflow: 'hidden',
    display: 'inline-block',
    whiteSpace: 'normal',
    wordWrap: 'break-word',
    willChange: 'transform, opacity',
  };
  const Tag = (tag || 'p') as 'p';

  if (reduceMotion) {
    return (
      <Tag ref={ref as React.RefObject<HTMLParagraphElement>} className={className}>
        {text}
      </Tag>
    );
  }

  return (
    <Tag ref={ref as React.RefObject<HTMLParagraphElement>} style={style} className={`split-parent ${className}`}>
      {text}
    </Tag>
  );
}
