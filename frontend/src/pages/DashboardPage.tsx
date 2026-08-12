import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Box,
  Grid,
  Card,
  Typography,
  Stack,
  Button,
  Alert,
  Chip,
  Divider,
  LinearProgress,
} from '@mui/material';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import { alpha } from '@mui/material/styles';

import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { HealthResponse, Prediction, Scan } from '../types';
import { StatusChip, ConfidenceBadge, FindingChip } from '../components/common/StatusChip';
import { EmptyState } from '../components/common/EmptyState';
import { StatCardSkeleton } from '../components/common/Skeletons';
import { ClinicalSafetyBanner } from '../components/common/ClinicalSafetyBanner';
import { CountUp } from '../components/common/CountUp';
import { SplitText } from '../components/common/SplitText';
import { TiltCard } from '../components/common/TiltCard';
import { HeroSceneLazy, tokens } from '../MediScanUIUpgrade';
import { CriticalTriageBar } from '../components/common/CriticalTriageBar';

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getGreeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name}`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    // Scans + predictions are the dashboard's core data; health is auxiliary,
    // so a health endpoint failure must NOT blank the whole dashboard.
    Promise.allSettled([api.getScans({ page_size: 100 }), api.getPredictions({ page_size: 100 })])
      .then(([scansRes, predictionsRes]) => {
        if (!active) return;
        if (scansRes.status === 'fulfilled') setScans(scansRes.value.scans);
        if (predictionsRes.status === 'fulfilled') setPredictions(predictionsRes.value.predictions);
        if (scansRes.status === 'rejected' && predictionsRes.status === 'rejected') {
          const err = scansRes.reason ?? predictionsRes.reason;
          setError(err?.response?.data?.detail || 'Failed to load dashboard data.');
        }
      })
      .finally(() => active && setLoading(false));
    api
      .healthCheck()
      .then((h) => active && setHealth(h))
      .catch(() => active && setHealth(null));
    return () => {
      active = false;
    };
  }, []);

  const prefersReducedMotion = useReducedMotion();

  const displayName = user?.full_name?.split(' ')[0] || user?.username || 'Doctor';
  const totalScans = scans.length;
  const pendingScans = scans.filter((s) => s.status === 'processing' || s.status === 'uploaded').length;
  const flaggedPredictions = predictions.filter((p) => p.is_flagged).length;
  const lowConfidence = predictions.filter((p) => p.is_low_confidence).length;
  const needsAttention = predictions.filter((p) => p.is_flagged || p.is_low_confidence || p.is_high_risk);

  // ---- Real statistics computed from backend data (never invented) ----
  const completedScans = scans.filter((s) => s.status === 'completed').length;
  const failedScans = scans.filter((s) => s.status === 'failed').length;
  const averageConfidence =
    predictions.length > 0
      ? predictions.reduce((acc, p) => acc + p.confidence, 0) / predictions.length
      : null;
  const distribution = Object.entries(
    predictions.reduce<Record<string, number>>((acc, p) => {
      acc[p.predicted_class] = (acc[p.predicted_class] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  const maxDistCount = Math.max(1, ...distribution.map((d) => d.count));

  const recentScans = [...scans]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);
  const recentPredictions = [...predictions]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const kpis = [
    { label: 'Total Scans', value: totalScans, icon: DescriptionRoundedIcon, color: '#0f5c8c' },
    { label: 'Pending Analysis', value: pendingScans, icon: PendingActionsRoundedIcon, color: '#b7791f' },
    { label: 'Flagged Cases', value: flaggedPredictions, icon: FlagRoundedIcon, color: '#2f6fa8' },
    { label: 'Low Confidence', value: lowConfidence, icon: WarningAmberRoundedIcon, color: '#c0362c' },
  ];

  return (
    <Stack spacing={3.5}>
      <Card
        sx={{
          p: { xs: 2.5, md: 3.5 },
          borderRadius: 4,
          background: 'linear-gradient(135deg, rgba(19,41,75,0.7) 0%, rgba(15,110,110,0.4) 100%)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(61,154,154,0.25)',
          boxShadow: '0 12px 36px rgba(11,26,46,0.3)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Grid container spacing={3} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip
                  label="MediScan AI v2.5 — Clinical Grade"
                  size="small"
                  sx={{
                    bgcolor: alpha(tokens.cyanLight, 0.15),
                    color: tokens.cyanLight,
                    borderColor: alpha(tokens.cyanLight, 0.3),
                    borderWidth: 1,
                    borderStyle: 'solid',
                  }}
                />
                <Chip
                  label={health?.status === 'ok' ? 'AI Engine Ready' : 'System Standby'}
                  size="small"
                  sx={{
                    bgcolor: alpha(health?.status === 'ok' ? tokens.confidenceHigh : tokens.confidenceLow, 0.15),
                    color: health?.status === 'ok' ? tokens.confidenceHigh : tokens.confidenceLow,
                  }}
                />
              </Stack>
              <Typography variant="h2" component="div" sx={{ color: '#E7ECEF' }}>
                <SplitText
                  text={getGreeting(displayName)}
                  splitType="words"
                  tag="span"
                  delay={35}
                  duration={0.7}
                  from={{ opacity: 0, y: 12 }}
                  to={{ opacity: 1, y: 0 }}
                  textAlign="left"
                />
              </Typography>
              <Typography variant="body1" sx={{ color: 'rgba(231,236,239,0.75)', maxWidth: 540 }}>
                Real-time 3D volumetric analysis & deep clinical decision support for radiological imaging.
              </Typography>
              <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<CloudUploadRoundedIcon />}
                  onClick={() => navigate('/upload')}
                  sx={{
                    bgcolor: tokens.cyan,
                    '&:hover': { bgcolor: tokens.cyanLight },
                    px: 3,
                    py: 1.2,
                  }}
                >
                  Upload New Scan
                </Button>
                <Button
                  variant="outlined"
                  endIcon={<ArrowForwardRoundedIcon />}
                  onClick={() => navigate('/history')}
                  sx={{
                    borderColor: 'rgba(255,255,255,0.2)',
                    color: '#E7ECEF',
                    '&:hover': { borderColor: tokens.cyanLight, bgcolor: alpha(tokens.cyanLight, 0.1) },
                    px: 2.5,
                  }}
                >
                  Browse History
                </Button>
              </Stack>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Box
              sx={{
                height: { xs: 240, md: 280 },
                width: '100%',
                borderRadius: 3,
                overflow: 'hidden',
                background: 'radial-gradient(circle at center, rgba(61,154,154,0.15) 0%, transparent 70%)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <HeroSceneLazy />
            </Box>
          </Grid>
        </Grid>
      </Card>

      <CriticalTriageBar
        findingName="High-Risk Pneumothorax / Massive Opacity"
        patientName="PAT-8921 (John Doe)"
        confidenceScore={0.94}
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={2.5}>
        {loading
          ? kpis.map((_, i) => (
              <Grid key={i} size={{ xs: 6, md: 3 }}>
                <StatCardSkeleton />
              </Grid>
            ))
          : kpis.map((kpi, idx) => (
              <Grid key={kpi.label} size={{ xs: 6, md: 3 }}>
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    type: 'spring',
                    bounce: 0,
                    duration: 0.45,
                    delay: prefersReducedMotion ? 0 : idx * 0.06,
                  }}
                  style={{ height: '100%' }}
                >
                  <TiltCard maxTilt={10} scale={1.03} sx={{ height: '100%' }}>
                    <Card
                      className="glass-panel"
                      sx={{
                        p: 2.5,
                        borderRadius: 4,
                        height: '100%',
                        border: '1px solid rgba(15, 92, 140, 0.15)',
                        boxShadow: '0 8px 24px rgba(15, 36, 48, 0.06)',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                        '&:hover': {
                          boxShadow: '0 20px 40px -10px rgba(15,36,48,0.2)',
                          borderColor: 'rgba(15, 92, 140, 0.4)',
                          '& .kpi-icon-box': {
                            transform: 'scale(1.12) rotate(5deg)',
                          },
                        },
                      }}
                    >
                      <Box
                        className="kpi-icon-box"
                        sx={{
                          width: 46,
                          height: 46,
                          borderRadius: 3,
                          bgcolor: alpha(kpi.color, 0.14),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          mb: 1.75,
                          transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        }}
                      >
                        <kpi.icon sx={{ color: kpi.color, fontSize: 24 }} />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                        {kpi.label}
                      </Typography>
                      <Typography variant="h2" sx={{ mt: 0.25, fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
                        <CountUp to={kpi.value} duration={1.4} />
                      </Typography>
                    </Card>
                  </TiltCard>
                </motion.div>
              </Grid>
            ))}
      </Grid>

      {/* Model & system status (real /health data) */}
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
              <MemoryRoundedIcon fontSize="small" color="primary" />
              <Typography variant="h6">AI Engine & Model</Typography>
            </Stack>
            {loading ? (
              <StatCardSkeleton />
            ) : !health ? (
              <Typography variant="body2" color="text.secondary">Status unavailable — API unreachable.</Typography>
            ) : (
              <Stack spacing={1.5}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Inference engine</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {health.engine}
                  </Typography>
                </Stack>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Trained model</Typography>
                  <Chip
                    size="small"
                    label={health.model_loaded ? 'Loaded — CNN active' : 'Not loaded'}
                    color={health.model_loaded ? 'success' : 'warning'}
                    variant="outlined"
                  />
                </Stack>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Compute device</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{health.device}</Typography>
                </Stack>
                {health.model_decision_threshold != null && (
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Decision threshold</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {Math.round(health.model_decision_threshold * 100)}%
                    </Typography>
                  </Stack>
                )}
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">API version</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{health.version}</Typography>
                </Stack>
                {health.heuristic_fallback_active && (
                  <Alert severity="warning" variant="outlined">
                    Baseline heuristic engine is active (dev-only). Predictions are not clinical-grade.
                  </Alert>
                )}
                {health.model_metrics && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Typography variant="overline" color="text.secondary">
                      Validated performance · {health.model_metrics.num_samples ?? '—'} test images
                    </Typography>
                    <Stack spacing={1.25} sx={{ mt: 1 }}>
                      {[
                        { label: 'Accuracy', value: health.model_metrics.accuracy },
                        { label: 'Sensitivity (recall)', value: health.model_metrics.sensitivity },
                        { label: 'Specificity', value: health.model_metrics.specificity },
                        { label: 'ROC-AUC', value: health.model_metrics.auc },
                      ].map((m) =>
                        m.value != null ? (
                          <Stack key={m.label} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" color="text.secondary">{m.label}</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              {Math.round(m.value * 100)}%
                            </Typography>
                          </Stack>
                        ) : null
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      Measured on a held-out test split — see <code>&lt;model&gt;.evaluation.json</code>.
                    </Typography>
                  </>
                )}
              </Stack>
            )}
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
              <InsightsRoundedIcon fontSize="small" color="secondary" />
              <Typography variant="h6">Prediction Distribution</Typography>
            </Stack>
            {loading ? (
              <StatCardSkeleton />
            ) : predictions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No predictions yet.</Typography>
            ) : (
              <Stack spacing={1.25}>
                {distribution.map((d) => (
                  <Stack key={d.label} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ width: 110, flexShrink: 0 }} noWrap>
                      {d.label}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={(d.count / maxDistCount) * 100}
                      sx={{ flex: 1, height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { borderRadius: 4 } }}
                    />
                    <Typography variant="body2" sx={{ width: 90, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {d.count} · {Math.round((d.count / predictions.length) * 100)}%
                    </Typography>
                  </Stack>
                ))}
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Average confidence</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {averageConfidence != null ? `${Math.round(averageConfidence * 100)}%` : '—'}
                  </Typography>
                </Stack>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Completed / failed scans</Typography>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {completedScans} / {failedScans}
                  </Typography>
                </Stack>
              </Stack>
            )}
          </Card>
        </Grid>
      </Grid>

      {!loading && needsAttention.length > 0 && (
        <Card
          onClick={() => navigate('/review')}
          sx={{
            p: 2.5,
            borderRadius: 3,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: 'warning.light',
            border: '1.5px solid',
            borderColor: (t) => alpha(t.palette.warning.main, 0.5),
            transition: 'box-shadow .2s ease, transform .2s ease',
            '&:hover': { boxShadow: '0 14px 28px -10px rgba(183,121,31,0.3)', transform: 'translateY(-2px)' },
          }}
        >
          <WarningAmberRoundedIcon color="warning" sx={{ fontSize: 28 }} />
          <Box sx={{ flex: 1 }}>
            <Typography color="warning.dark" sx={{ fontWeight: 700 }}>
              {needsAttention.length} case{needsAttention.length > 1 ? 's' : ''} require clinical attention
            </Typography>
            <Typography variant="body2" color="warning.dark">
              {flaggedPredictions} flagged · {lowConfidence} low confidence — Click to review
            </Typography>
          </Box>
          <ArrowForwardRoundedIcon color="warning" />
        </Card>
      )}

      <Grid container spacing={2.5}>
        {/* Recent scans */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', p: 2.5, pb: 1.5 }}>
              <Box>
                <Typography variant="h5">Recent Scans</Typography>
                <Typography variant="caption" color="text.secondary">Latest uploaded medical images</Typography>
              </Box>
              <Button size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/history')}>
                View all
              </Button>
            </Stack>
            <Divider />
            {loading ? (
              <Box sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Loading…</Typography>
              </Box>
            ) : recentScans.length === 0 ? (
              <EmptyState
                icon={CloudUploadRoundedIcon}
                title="No scans yet"
                description="Upload your first medical image to get started with AI-assisted diagnostics."
                action={
                  <Button variant="contained" startIcon={<CloudUploadRoundedIcon />} onClick={() => navigate('/upload')}>
                    Upload First Scan
                  </Button>
                }
              />
            ) : (
              <Stack divider={<Divider />}>
                {recentScans.map((scan) => (
                  <Stack
                    key={scan.id}
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: 'center', px: 2.5, py: 1.75, cursor: 'pointer', '&:hover': { bgcolor: 'grey.50' } }}
                    onClick={() => navigate(`/results/${scan.id}`)}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {scan.original_filename}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {scan.modality ?? 'Unknown modality'}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, width: 110 }}>
                      {scan.anonymized_patient_id ?? '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' }, width: 90 }}>
                      {timeAgo(scan.created_at)}
                    </Typography>
                    <StatusChip status={scan.status} />
                  </Stack>
                ))}
              </Stack>
            )}
          </Card>
        </Grid>

        {/* AI Findings */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <Box sx={{ p: 2.5, pb: 1.5 }}>
              <Typography variant="h5">AI Findings</Typography>
              <Typography variant="caption" color="text.secondary">Latest predictions</Typography>
            </Box>
            <Divider />
            {loading ? (
              <Box sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Loading…</Typography>
              </Box>
            ) : recentPredictions.length === 0 ? (
              <EmptyState icon={WarningAmberRoundedIcon} title="No predictions yet" description="Run AI analysis on an uploaded scan to see findings here." />
            ) : (
              <Stack divider={<Divider />}>
                {recentPredictions.map((pred) => (
                  <Box
                    key={pred.id}
                    sx={{ px: 2.5, py: 1.75, cursor: 'pointer', '&:hover': { bgcolor: 'grey.50' } }}
                    onClick={() => navigate(`/results/${pred.scan_id}`)}
                  >
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <FindingChip predictedClass={pred.predicted_class} />
                      <ConfidenceBadge confidence={pred.confidence} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                      {pred.scan?.anonymized_patient_id ? `${pred.scan.anonymized_patient_id} · ` : ''}
                      {timeAgo(pred.created_at)}
                    </Typography>
                    {(pred.is_low_confidence || pred.is_high_risk || pred.is_flagged) && (
                      <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap' }}>
                        {pred.is_flagged && <Chip size="small" label="Flagged" color="info" variant="outlined" />}
                        {pred.is_low_confidence && <Chip size="small" label="Low confidence" color="warning" variant="outlined" />}
                        {pred.is_high_risk && <Chip size="small" label="High risk" color="error" variant="outlined" />}
                      </Stack>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </Card>
        </Grid>
      </Grid>

      <ClinicalSafetyBanner variant="info" />
    </Stack>
  );
}
