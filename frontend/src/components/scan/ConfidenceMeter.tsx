import { useEffect } from 'react';
import { Box, Typography, LinearProgress, Stack, Divider } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { motion, useSpring, useTransform } from 'motion/react';
import { confidenceColor, confidenceSoftColor } from '../../theme';

interface ConfidenceMeterProps {
  confidence: number;
  probabilities?: Record<string, number>;
  showTable?: boolean;
  lowThreshold?: number;
  highThreshold?: number;
  /** Calibrated decision boundary for the abnormal class (0.5 = argmax). */
  decisionThreshold?: number | null;
}

// Count-up percentage driven by a critically-damped spring (no overshoot)
function AnimatedPercent({ value }: { value: number }) {
  const spring = useSpring(0, { bounce: 0, duration: 0.8 });
  const display = useTransform(spring, (v) => Math.round(v));
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return <motion.span style={{ fontVariantNumeric: 'tabular-nums' }}>{display}</motion.span>;
}

export function ConfidenceMeter({
  confidence,
  probabilities,
  showTable = true,
  lowThreshold = 70,
  highThreshold = 85,
  decisionThreshold,
}: ConfidenceMeterProps) {
  const pct = Math.round(confidence * 100);
  const color = confidenceColor(confidence);
  const soft = confidenceSoftColor(confidence);
  const label = pct >= highThreshold ? 'High confidence' : pct >= lowThreshold ? 'Moderate confidence' : 'Low confidence';

  return (
    <Box>
      <Box
        sx={{
          p: 2,
          borderRadius: 2.5,
          bgcolor: soft,
          border: '1px solid',
          borderColor: color,
        }}
      >
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
            <Typography variant="subtitle2" sx={{ color, fontWeight: 700 }}>
              {label}
            </Typography>
          </Stack>
          <Typography variant="h3" sx={{ color }}>
            <AnimatedPercent value={pct} />%
          </Typography>
        </Stack>

        <Box sx={{ position: 'relative', mt: 2 }}>
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{
              height: 10,
              borderRadius: 6,
              bgcolor: 'rgba(0,0,0,0.06)',
              '& .MuiLinearProgress-bar': {
                bgcolor: color,
                borderRadius: 6,
                transition: 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
              },
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: -3,
              left: `${lowThreshold}%`,
              width: 2,
              height: 16,
              bgcolor: 'text.secondary',
              opacity: 0.4,
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: -3,
              left: `${highThreshold}%`,
              width: 2,
              height: 16,
              bgcolor: 'text.secondary',
              opacity: 0.4,
            }}
          />
        </Box>
        <Stack direction="row" sx={{ mt: 0.5, justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">0%</Typography>
          <Typography variant="caption" color="text.secondary">{lowThreshold}%</Typography>
          <Typography variant="caption" color="text.secondary">{highThreshold}%</Typography>
          <Typography variant="caption" color="text.secondary">100%</Typography>
        </Stack>
      </Box>

      {decisionThreshold != null && decisionThreshold > 0 && decisionThreshold < 1 && (
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            mt: 1.5,
            p: 1.5,
            borderRadius: 2,
            bgcolor: 'grey.50',
            border: '1px solid',
            borderColor: 'divider',
            alignItems: 'flex-start',
          }}
        >
          <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', mt: 0.15 }} />
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            Decision threshold: <strong>{Math.round(decisionThreshold * 100)}%</strong>. The model reports the abnormal
            class only when its probability reaches this calibrated boundary — predictions below it are treated as
            normal to avoid false positives.
          </Typography>
        </Stack>
      )}

      {pct < lowThreshold && (
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            mt: 1.5,
            p: 1.5,
            borderRadius: 2,
            bgcolor: 'error.light',
            border: '1px solid',
            borderColor: 'error.main',
          }}
        >
          <WarningAmberRoundedIcon color="error" fontSize="small" />
          <Box>
            <Typography variant="body2" color="error.dark" sx={{ fontWeight: 700 }}>
              Clinical review recommended
            </Typography>
            <Typography variant="caption" color="error.dark">
              Results below {lowThreshold}% confidence should be treated as indeterminate.
            </Typography>
          </Box>
        </Stack>
      )}

      {showTable && probabilities && Object.keys(probabilities).length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Divider sx={{ mb: 1.5 }} />
          <Typography variant="overline" color="text.secondary">
            Class probabilities
          </Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {Object.entries(probabilities)
              .sort((a, b) => b[1] - a[1])
              .map(([cls, prob]) => {
                const p = Math.round(prob * 100);
                return (
                  <Stack key={cls} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ width: 130, flexShrink: 0 }} noWrap>
                      {cls}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={p}
                      sx={{
                        flex: 1,
                        height: 6,
                        borderRadius: 4,
                        bgcolor: 'rgba(0,0,0,0.06)',
                        '& .MuiLinearProgress-bar': { bgcolor: 'primary.main', borderRadius: 4 },
                      }}
                    />
                    <Typography variant="caption" sx={{ width: 34, textAlign: 'right' }}>
                      {p}%
                    </Typography>
                  </Stack>
                );
              })}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
