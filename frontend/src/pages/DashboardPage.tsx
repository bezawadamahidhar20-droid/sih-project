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
} from '@mui/material';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import { alpha } from '@mui/material/styles';

import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Prediction, Scan } from '../types';
import { StatusChip, ConfidenceBadge, FindingChip } from '../components/common/StatusChip';
import { EmptyState } from '../components/common/EmptyState';
import { StatCardSkeleton } from '../components/common/Skeletons';
import { ClinicalSafetyBanner } from '../components/common/ClinicalSafetyBanner';
import { CountUp } from '../components/common/CountUp';
import { SplitText } from '../components/common/SplitText';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.getScans({ page_size: 100 }), api.getPredictions({ page_size: 100 })])
      .then(([scansRes, predictionsRes]) => {
        if (!active) return;
        setScans(scansRes.scans);
        setPredictions(predictionsRes.predictions);
      })
      .catch((err) => active && setError(err.response?.data?.detail || 'Failed to load dashboard data.'))
      .finally(() => active && setLoading(false));
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
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Box>
          <Typography variant="h2" component="div">
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Here's your diagnostic workspace for today.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<CloudUploadRoundedIcon />} onClick={() => navigate('/upload')}>
          Upload Scan
        </Button>
      </Stack>

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
                    // No stagger delay for reduced-motion users — instant fade
                    delay: prefersReducedMotion ? 0 : idx * 0.06,
                  }}
                  style={{ height: '100%' }}
                >
                <Card
                  sx={{
                    p: 2.5,
                    borderRadius: 3,
                    height: '100%',
                    '&:hover': {
                      boxShadow: '0 14px 28px -10px rgba(15,36,48,0.18)',
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 2,
                      bgcolor: alpha(kpi.color, 0.1),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 1.75,
                      transition: 'transform .2s ease',
                    }}
                  >
                    <kpi.icon sx={{ color: kpi.color, fontSize: 22 }} />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {kpi.label}
                  </Typography>
                  <Typography variant="h2" sx={{ mt: 0.25, fontVariantNumeric: 'tabular-nums' }}>
                    <CountUp to={kpi.value} duration={1.4} />
                  </Typography>
                </Card>
                </motion.div>
              </Grid>
            ))}
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
