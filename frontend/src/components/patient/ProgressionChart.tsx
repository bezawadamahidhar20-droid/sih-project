import { useMemo } from 'react';
import { Box, Card, Typography, Stack, Chip } from '@mui/material';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import { Prediction } from '../../types';
import { tokens } from '../../theme';

interface ProgressionChartProps {
  history: Prediction[];
  patientId: string;
}

export function ProgressionChart({ history, patientId }: ProgressionChartProps) {
  // Sort history chronologically
  const sorted = useMemo(() => {
    return [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [history]);

  if (sorted.length < 2) {
    return (
      <Card sx={{ p: 3, borderRadius: 3, bgcolor: tokens.surfaceDark, border: `1px solid ${tokens.surfaceBorder}` }}>
        <Typography variant="subtitle1" sx={{ color: tokens.textPrimary, fontWeight: 700, mb: 1 }}>
          Longitudinal Disease Progression Tracker
        </Typography>
        <Typography variant="body2" color="text.secondary">
          At least 2 historical scans are required to plot AI disease progression trends for patient {patientId}.
        </Typography>
      </Card>
    );
  }

  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const deltaConfidence = Number(((latest.confidence - previous.confidence) * 100).toFixed(1));
  const isImproving = latest.predicted_class === 'Normal' || deltaConfidence < 0;

  return (
    <Card sx={{ p: 3, borderRadius: 4, bgcolor: tokens.surfaceDark, border: `1px solid ${tokens.surfaceBorder}` }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
              Longitudinal Disease Progression Index
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Serial radiological AI confidence tracking over time ({sorted.length} studies)
            </Typography>
          </Box>
          <Chip
            icon={isImproving ? <TrendingDownRoundedIcon style={{ color: tokens.confidenceHigh }} /> : <TrendingUpRoundedIcon style={{ color: tokens.critical }} />}
            label={`${deltaConfidence > 0 ? '+' : ''}${deltaConfidence}% Delta Severity`}
            size="small"
            sx={{
              bgcolor: isImproving ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: isImproving ? tokens.confidenceHigh : tokens.critical,
              border: `1px solid ${isImproving ? tokens.confidenceHigh : tokens.critical}`,
              fontWeight: 700,
            }}
          />
        </Stack>

        {/* Time Series SVG Graph */}
        <Box
          sx={{
            height: 180,
            width: '100%',
            position: 'relative',
            borderRadius: 3,
            bgcolor: '#04080D',
            p: 2,
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            {/* Grid lines */}
            <line x1="0" y1="20%" x2="100%" y2="20%" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
            <line x1="0" y1="80%" x2="100%" y2="80%" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />

            {/* Connecting Trend Line */}
            {sorted.map((item, idx) => {
              if (idx === 0) return null;
              const prevItem = sorted[idx - 1];
              const x1 = `${(idx - 1) * (100 / (sorted.length - 1))}%`;
              const y1 = `${100 - prevItem.confidence * 80}%`;
              const x2 = `${idx * (100 / (sorted.length - 1))}%`;
              const y2 = `${100 - item.confidence * 80}%`;
              return (
                <line
                  key={idx}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={tokens.cyan}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {/* Render Interactive Data Nodes */}
          <Stack direction="row" sx={{ width: '100%', justifyContent: 'space-between', zIndex: 2, position: 'relative' }}>
            {sorted.map((item) => (
              <Box key={item.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Chip
                  label={`${(item.confidence * 100).toFixed(0)}%`}
                  size="small"
                  sx={{
                    mb: 1,
                    fontSize: '0.68rem',
                    bgcolor: tokens.cyan,
                    color: '#070C12',
                    fontWeight: 700,
                  }}
                />
                <Typography variant="caption" sx={{ color: tokens.textSecondary, fontSize: '0.7rem' }}>
                  {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Typography>
                <Typography variant="caption" sx={{ color: tokens.textPrimary, fontWeight: 700, fontSize: '0.68rem' }}>
                  {item.predicted_class}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Card>
  );
}

export default ProgressionChart;
