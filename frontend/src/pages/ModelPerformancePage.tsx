import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Stack,
  Divider,
  Alert,
  Skeleton,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import { AppShell } from '../components/layout/AppShell';
import { api } from '../services/api';

interface ModelMetrics {
  engine: string;
  num_samples: number;
  class_names: string[];
  positive_class: string;
  metrics: {
    accuracy: number;
    balanced_accuracy: number;
    precision: number;
    sensitivity: number;
    specificity: number;
    f1: number;
    auc: number;
    true_positive: number;
    false_negative: number;
    false_positive: number;
    true_negative: number;
    support: number;
  };
  confusion_matrix: {
    matrix: number[][];
    true_class: string[];
    predicted_class: string[];
  };
}

interface MetricCardProps {
  label: string;
  value: number;
  description: string;
  color?: string;
  threshold?: number;
}

function MetricCard({ label, value, description, color, threshold = 0.85 }: MetricCardProps) {
  const theme = useTheme();
  const pct = Math.round(value * 100);
  const good = value >= threshold;
  const cardColor = color ?? (good ? theme.palette.success.main : theme.palette.warning.main);

  return (
    <Card
      sx={{
        height: '100%',
        background: `linear-gradient(135deg, ${alpha(cardColor, 0.12)} 0%, ${alpha(cardColor, 0.04)} 100%)`,
        border: `1px solid ${alpha(cardColor, 0.3)}`,
        borderRadius: 3,
        transition: 'transform .2s, box-shadow .2s',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 8px 24px ${alpha(cardColor, 0.2)}` },
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            {label}
          </Typography>
          <Tooltip title={description} placement="top" arrow>
            <InfoRoundedIcon sx={{ fontSize: 16, color: 'text.disabled', cursor: 'help' }} />
          </Tooltip>
        </Stack>
        <Typography variant="h3" sx={{ color: cardColor, fontWeight: 800, lineHeight: 1 }}>
          {pct}<Typography component="span" variant="h6" sx={{ color: cardColor, fontWeight: 600, ml: 0.5 }}>%</Typography>
        </Typography>
        <Box sx={{ mt: 1.5, height: 6, borderRadius: 3, bgcolor: alpha(cardColor, 0.15), overflow: 'hidden' }}>
          <Box
            sx={{
              height: '100%',
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${cardColor} 0%, ${alpha(cardColor, 0.7)} 100%)`,
              borderRadius: 3,
              transition: 'width 1s ease-out',
            }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}

function ConfusionMatrix({ matrix, trueClasses, predictedClasses }: {
  matrix: number[][];
  trueClasses: string[];
  predictedClasses: string[];
}) {
  const theme = useTheme();
  const maxVal = Math.max(...matrix.flat());

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">Actual ↓ / Predicted →</Typography>
            </th>
            {predictedClasses.map((cls) => (
              <th key={cls} style={{ padding: '8px 16px', textAlign: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
                  Predicted {cls}
                </Typography>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={trueClasses[i]}>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: theme.palette.secondary.main }}>
                  Actual {trueClasses[i]}
                </Typography>
              </td>
              {row.map((cell, j) => {
                const isCorrect = i === j;
                const intensity = cell / maxVal;
                const bg = isCorrect
                  ? alpha(theme.palette.success.main, 0.15 + intensity * 0.5)
                  : alpha(theme.palette.error.main, 0.08 + intensity * 0.4);
                const textColor = isCorrect ? theme.palette.success.main : theme.palette.error.main;
                return (
                  <td key={j} style={{ padding: '12px 16px', textAlign: 'center', background: bg, border: `1px solid ${alpha('#fff', 0.05)}`, borderRadius: 4 }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: textColor }}>
                      {cell.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" sx={{ color: alpha(textColor, 0.7) }}>
                      {Math.round((cell / (row.reduce((a, b) => a + b, 0))) * 100)}%
                    </Typography>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}

export function ModelPerformancePage() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();

  useEffect(() => {
    api.getModelMetrics()
      .then((data) => setMetrics(data as ModelMetrics))
      .catch(() => setError('Could not load model metrics. Ensure the backend is running and results/model.evaluation.json exists.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, md: 3 }, py: 4 }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" gap={2} mb={1}>
          <Box sx={{
            p: 1.5, borderRadius: 2.5,
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.2)}, ${alpha(theme.palette.secondary.main, 0.2)})`,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`
          }}>
            <MonitorHeartRoundedIcon sx={{ color: theme.palette.primary.main, fontSize: 28 }} />
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
              Model Performance
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ResNet50 Transfer Learning — Hold-Out Clinical Evaluation
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ my: 3, borderColor: alpha('#fff', 0.08) }} />

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {/* Key metrics */}
        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 2, mb: 2, display: 'block' }}>
          📊 Clinical Summary Metrics
        </Typography>
        <Grid container spacing={2} mb={4}>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rounded" height={110} sx={{ borderRadius: 3 }} />
              </Grid>
            ))
          ) : metrics ? (
            <>
              <Grid item xs={12} sm={6} md={4}>
                <MetricCard label="Accuracy" value={metrics.metrics.accuracy} description="Percentage of all samples correctly classified." />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <MetricCard label="ROC AUC" value={metrics.metrics.auc} description="Area under the ROC curve — a threshold-independent measure of discrimination." color={theme.palette.info.main} />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <MetricCard label="Sensitivity (Recall)" value={metrics.metrics.sensitivity} description="True Positive Rate — fraction of actual Pneumonia cases correctly detected. Critical for clinical safety." />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <MetricCard label="Specificity" value={metrics.metrics.specificity} description="True Negative Rate — fraction of Normal cases correctly classified as Normal." />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <MetricCard label="Precision" value={metrics.metrics.precision} description="Fraction of Pneumonia predictions that were actually Pneumonia." />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <MetricCard label="F1 Score" value={metrics.metrics.f1} description="Harmonic mean of Precision and Sensitivity — balanced measure." color={theme.palette.warning.main} />
              </Grid>
            </>
          ) : null}
        </Grid>

        {/* Confusion Matrix */}
        {metrics && (
          <>
            <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 2, mb: 2, display: 'block' }}>
              📉 Confusion Matrix — {metrics.num_samples.toLocaleString()} Test Samples
            </Typography>
            <Card sx={{
              mb: 4, borderRadius: 3,
              background: alpha(theme.palette.background.paper, 0.6),
              border: `1px solid ${alpha('#fff', 0.08)}`,
              backdropFilter: 'blur(12px)',
            }}>
              <CardContent sx={{ p: 3 }}>
                <ConfusionMatrix
                  matrix={metrics.confusion_matrix.matrix}
                  trueClasses={metrics.confusion_matrix.true_class}
                  predictedClasses={metrics.confusion_matrix.predicted_class}
                />
              </CardContent>
            </Card>
          </>
        )}

        {/* Chart images from backend */}
        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 2, mb: 2, display: 'block' }}>
          📈 Visual Analysis Charts
        </Typography>
        <Grid container spacing={3} mb={4}>
          {[
            { name: 'confusion_matrix.png', label: 'Confusion Matrix Heatmap' },
            { name: 'metrics_chart.png', label: 'Clinical Metrics Comparison' },
          ].map(({ name, label }) => (
            <Grid item xs={12} md={6} key={name}>
              <Card sx={{
                borderRadius: 3,
                background: alpha(theme.palette.background.paper, 0.5),
                border: `1px solid ${alpha('#fff', 0.08)}`,
                overflow: 'hidden',
              }}>
                <Box sx={{ px: 2, pt: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1 }}>{label}</Typography>
                </Box>
                <Box
                  component="img"
                  src={`/api/v1/model/metrics/chart/${name}`}
                  alt={label}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }}
                  sx={{ width: '100%', display: 'block', bgcolor: '#0a0f1e', p: 1 }}
                />
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Known Limitations */}
        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 2, mb: 2, display: 'block' }}>
          ⚠️ Known Limitations
        </Typography>
        <Card sx={{
          borderRadius: 3,
          background: alpha(theme.palette.warning.main, 0.06),
          border: `1px solid ${alpha(theme.palette.warning.main, 0.25)}`,
          mb: 2,
        }}>
          <CardContent sx={{ p: 3 }}>
            <Stack spacing={2}>
              {[
                {
                  icon: <ScienceRoundedIcon sx={{ color: theme.palette.warning.main, fontSize: 20 }} />,
                  title: 'Single-Dataset Training',
                  body: 'This model was trained on the Kaggle Chest X-Ray dataset (Pneumonia vs Normal). It has not been validated on images from other institutions, scanner manufacturers, or patient demographics outside this dataset.'
                },
                {
                  icon: <InfoRoundedIcon sx={{ color: theme.palette.info.main, fontSize: 20 }} />,
                  title: 'Decision Support Only',
                  body: 'MediScan AI is a clinical decision support tool. All AI findings must be reviewed and confirmed by a licensed radiologist or physician before any clinical action is taken.'
                },
                {
                  icon: <WarningAmberRoundedIcon sx={{ color: theme.palette.error.main, fontSize: 20 }} />,
                  title: 'Not FDA / CE Cleared',
                  body: 'This system has not received FDA 510(k) clearance or CE medical device certification. It must not be used as a standalone diagnostic device in clinical settings.'
                },
                {
                  icon: <CheckCircleRoundedIcon sx={{ color: theme.palette.success.main, fontSize: 20 }} />,
                  title: 'Requires Clinical Validation Before Deployment',
                  body: 'Before deployment in any clinical environment, this model requires prospective clinical validation studies, bias audits across subpopulations, and review by an institutional ethics board.'
                },
              ].map(({ icon, title, body }) => (
                <Stack key={title} direction="row" gap={2} alignItems="flex-start">
                  <Box sx={{ mt: 0.2, flexShrink: 0 }}>{icon}</Box>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.3 }}>{title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{body}</Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>

        {/* Metadata chips */}
        {metrics && (
          <Stack direction="row" flexWrap="wrap" gap={1} mt={2}>
            <Chip size="small" label={`Engine: ${metrics.engine}`} variant="outlined" />
            <Chip size="small" label={`Test set: ${metrics.num_samples} scans`} variant="outlined" />
            <Chip size="small" label={`Classes: ${metrics.class_names.join(' · ')}`} variant="outlined" />
            <Chip size="small" label="Not FDA/CE cleared" color="warning" variant="outlined" />
            <Chip size="small" label="Decision support only" color="info" variant="outlined" />
          </Stack>
        )}
      </Box>
    </AppShell>
  );
}
