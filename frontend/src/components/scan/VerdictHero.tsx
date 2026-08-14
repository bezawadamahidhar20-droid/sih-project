import { useEffect } from 'react';
import { Box, Typography, Stack, Chip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { motion, useSpring, useTransform, useReducedMotion } from 'motion/react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ReportRoundedIcon from '@mui/icons-material/ReportRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import { theme } from '../../theme';
import type { PredictionFinding } from '../../types';

interface VerdictHeroProps {
  predictedClass: string;
  confidence: number;
  isLowConfidence: boolean;
  isHighRisk: boolean;
  isFlagged: boolean;
  decisionThreshold?: number | null;
  normalClass?: string;
  findings?: PredictionFinding[];
}

// Radial gauge: sweeps the arc to the confidence value with a critically
// damped spring, then reveals the percentage. Interruptible and reduced-motion
// safe (jumps straight to the final value when reduced motion is on).
function ConfidenceArc({ value, color }: { value: number; color: string }) {
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const reduced = useReducedMotion();
  const spring = useSpring(0, { bounce: 0, duration: reduced ? 0 : 0.9 });
  const pct = useTransform(spring, (v) => Math.round(v * 100));
  const dashOffset = useTransform(spring, (v) => CIRC * (1 - v));
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return (
    <Box sx={{ position: 'relative', width: 148, height: 148, flexShrink: 0 }}>
      <svg width={148} height={148} viewBox="0 0 148 148" role="img" aria-label={`${Math.round(value * 100)} percent confidence`}>
        {/* Track */}
        <circle cx={74} cy={74} r={R} fill="none" stroke="rgba(15,36,48,0.08)" strokeWidth={10} />
        {/* Value arc — spring-driven, never jumps */}
        <motion.circle
          cx={74}
          cy={74}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          transform="rotate(-90 74 74)"
          strokeDasharray={CIRC}
          style={{ strokeDashoffset: dashOffset }}
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h3" sx={{ color, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
          <motion.span>{pct}</motion.span>
          <Typography component="span" variant="h5" sx={{ color, fontWeight: 600 }}>
            %
          </Typography>
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
          confidence
        </Typography>
      </Box>
    </Box>
  );
}

export function VerdictHero({
  predictedClass,
  confidence,
  isLowConfidence,
  isHighRisk,
  isFlagged,
  decisionThreshold,
  normalClass = 'Normal',
  findings,
}: VerdictHeroProps) {
  const isNoFindings = predictedClass.toLowerCase().includes('no significant findings') || predictedClass === normalClass;
  const isCoOccurring = predictedClass.toLowerCase().includes('co-occurring');
  const abnormal = !isNoFindings;

  const tone = isFlagged
    ? { color: theme.palette.info.main, soft: theme.palette.info.light, icon: ScienceRoundedIcon, label: 'Flagged for review' }
    : isHighRisk || isCoOccurring
    ? { color: theme.palette.error.main, soft: theme.palette.error.light, icon: ReportRoundedIcon, label: isCoOccurring ? 'Co-occurring findings' : 'High-priority finding' }
    : abnormal
    ? { color: theme.palette.warning.main, soft: theme.palette.warning.light, icon: WarningAmberRoundedIcon, label: 'Abnormal finding' }
    : { color: theme.palette.success.main, soft: theme.palette.success.light, icon: CheckCircleRoundedIcon, label: 'No significant findings' };

  const Icon = tone.icon;
  const pct = Math.round(confidence * 100);

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 4,
        border: '1.5px solid',
        borderColor: alpha(tone.color, 0.35),
        bgcolor: tone.soft,
        p: { xs: 3, md: 3.5 },
        transition: 'box-shadow .3s cubic-bezier(0.4,0,0.2,1)',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 5,
          background: `linear-gradient(90deg, ${tone.color} 0%, ${alpha(tone.color, 0.55)} 100%)`,
        },
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={3}
        sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
      >
        {/* Verdict text */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 1 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2.5,
                bgcolor: alpha(tone.color, 0.14),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon sx={{ color: tone.color, fontSize: 22 }} />
            </Box>
            <Chip
              size="small"
              label={tone.label}
              sx={{
                bgcolor: alpha(tone.color, 0.12),
                color: tone.color,
                border: `1px solid ${alpha(tone.color, 0.3)}`,
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}
            />
          </Stack>

          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
            AI-assisted multi-label finding
          </Typography>
          <Typography
            variant="h2"
            sx={{
              mt: 0.25,
              color: 'text.primary',
              fontSize: { xs: '1.9rem', md: '2.4rem' },
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
            }}
          >
            {predictedClass}
          </Typography>

          {/* Multi-label findings chips */}
          {findings && findings.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
              {findings.map((f) => (
                <Chip
                  key={f.condition}
                  size="small"
                  label={`${f.condition}: ${Math.round(f.confidence * 100)}%`}
                  color={f.confidence >= 0.75 ? 'error' : f.confidence >= 0.4 ? 'warning' : 'default'}
                  variant={f.confidence >= 0.4 ? 'filled' : 'outlined'}
                  sx={{ fontWeight: 600 }}
                />
              ))}
            </Stack>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, maxWidth: 560, lineHeight: 1.7 }}>
            {isLowConfidence
              ? `Confidence (${pct}%) is below the 70% clinical threshold — treat this as indeterminate and confirm with a qualified clinician before any action.`
              : abnormal
              ? `The model found evidence consistent with ${predictedClass.toLowerCase()}. This is a decision-support result that requires clinical review.`
              : `No abnormal pattern was detected by the model. This is a decision-support result and does not replace a radiologist's interpretation.`}
          </Typography>

          {decisionThreshold != null && !isLowConfidence && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5, flexWrap: 'wrap' }}>
              <AutoAwesomeRoundedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                Calibrated decision threshold: <strong>{Math.round(decisionThreshold * 100)}%</strong> — the abnormal class is
                reported only above this boundary to limit false positives.
              </Typography>
            </Stack>
          )}
        </Box>

        {/* Confidence gauge */}
        <ConfidenceArc value={confidence} color={tone.color} />
      </Stack>
    </Box>
  );
}

export default VerdictHero;
