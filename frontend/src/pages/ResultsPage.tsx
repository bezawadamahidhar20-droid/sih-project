import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import {
  Box,
  Grid,
  Card,
  Typography,
  Stack,
  Button,
  Alert,
  Divider,
  Chip,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import OutlinedFlagRoundedIcon from '@mui/icons-material/OutlinedFlagRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import ScannerRoundedIcon from '@mui/icons-material/ScannerRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import TagRoundedIcon from '@mui/icons-material/TagRounded';
import { alpha } from '@mui/material/styles';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PredictResponse, Scan } from '../types';
import { ScanViewer } from '../components/scan/ScanViewer';
import { ConfidenceMeter } from '../components/scan/ConfidenceMeter';
import { ClinicalSafetyBanner, BannerVariant } from '../components/common/ClinicalSafetyBanner';
import { ClinicalFlagsRow } from '../components/common/StatusChip';

const PROCESSING_STEPS = [
  'Decrypting scan…',
  'Running inference…',
  'Computing Grad-CAM attention map…',
  'Finalizing diagnostic result…',
];

export function ResultsPage() {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [status, setStatus] = useState<'loading' | 'processing' | 'ready' | 'error'>('loading');
  const [scan, setScan] = useState<Scan | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState('');
  const [processingStep, setProcessingStep] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDoctor = hasRole(['doctor', 'radiologist']);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    pollRef.current = null;
    stepTimerRef.current = null;
  }, []);

  const startStepAnimation = useCallback(() => {
    setProcessingStep(0);
    stepTimerRef.current = setInterval(() => {
      setProcessingStep((s) => Math.min(s + 1, PROCESSING_STEPS.length - 1));
    }, 900);
  }, []);

  const runPrediction = useCallback(
    async (id: number) => {
      setStatus('processing');
      setError('');
      startStepAnimation();
      try {
        const res = await api.predict(id);
        stopPolling();
        setResult(res);
        setScan(res.scan);
        setStatus('ready');
      } catch (err: any) {
        stopPolling();
        setError(err.response?.data?.detail || err.message || 'Analysis failed.');
        setStatus('error');
      }
    },
    [stopPolling, startStepAnimation]
  );

  useEffect(() => {
    let active = true;
    const id = Number(scanId);
    if (!Number.isFinite(id)) {
      setError('Invalid scan reference.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    api
      .getScan(id)
      .then((s) => {
        if (!active) return;
        setScan(s);
        void runPrediction(id);
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err.response?.data?.detail || 'Scan not found.');
        setStatus('error');
      });
    return () => {
      active = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  const handleFlagToggle = async () => {
    if (!result) return;
    try {
      const updated = await api.flagPrediction(result.prediction.id, !result.prediction.is_flagged);
      setResult((prev) => (prev ? { ...prev, prediction: updated } : prev));
      enqueueSnackbar(updated.is_flagged ? 'Result flagged for review' : 'Flag removed', { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.detail || 'Could not update flag.', { variant: 'error' });
    }
  };

  const pred = result?.prediction;

  let safetyVariant: BannerVariant = 'normal';
  if (pred?.is_flagged) safetyVariant = 'flagged';
  else if (pred?.is_high_risk) safetyVariant = 'critical';
  else if (pred?.is_low_confidence) safetyVariant = 'low-confidence';

  return (
    <Stack spacing={3}>
      {/* Print-only report header (hidden on screen, shown when printing) */}
      <Box className="print-only report-header" sx={{ display: 'none' }}>
        <Typography variant="h5">MediScan AI — Diagnostic Report</Typography>
        <Typography variant="body2">
          Scan #{scan?.id ?? '—'} · {scan?.original_filename ?? ''}
          {scan?.anonymized_patient_id ? ` · Patient ${scan.anonymized_patient_id}` : ''}
          {pred ? ` · ${pred.predicted_class} (${Math.round(pred.confidence * 100)}% confidence)` : ''}
        </Typography>
        <Typography variant="caption">
          Generated {new Date().toLocaleString()} · Decision-support output — must be reviewed by a qualified clinician.
        </Typography>
      </Box>

      <Box>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
          <Box>
            <Typography variant="h2">Diagnostic Result</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {scan?.original_filename ?? 'Loading scan…'}
            </Typography>
          </Box>
          {status === 'ready' && result && (
            <Button
              className="no-print"
              variant="outlined"
              startIcon={<PrintRoundedIcon />}
              onClick={() => window.print()}
            >
              Print Report
            </Button>
          )}
        </Stack>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {(status === 'loading' || status === 'processing') && (
        <Card sx={{ borderRadius: 3, p: 6 }}>
          <Stack spacing={2.5} sx={{ alignItems: 'center' }}>
            <CircularProgress size={48} />
            <Typography variant="subtitle1">{status === 'loading' ? 'Loading scan…' : 'Analyzing scan…'}</Typography>
            {status === 'processing' && (
              <>
                <Typography variant="body2" color="text.secondary">
                  {PROCESSING_STEPS[processingStep]}
                </Typography>
                <Box sx={{ width: 280 }}>
                  <LinearProgress
                    variant="determinate"
                    value={((processingStep + 1) / PROCESSING_STEPS.length) * 100}
                  />
                </Box>
              </>
            )}
          </Stack>
        </Card>
      )}

      {status === 'ready' && result && pred && (
        <Stack spacing={3}>
          <ClinicalSafetyBanner variant={safetyVariant} subMessage={result.warning ?? undefined} />

          <Grid container spacing={3}>
            {/* Image viewer */}
            <Grid size={{ xs: 12, lg: 7 }}>
              <Box sx={{ height: { xs: 480, md: 600 } }}>
                <ScanViewer
                  originalUrl={result.original_image_url}
                  overlayUrl={result.gradcam_overlay_url}
                  filename={scan?.original_filename}
                />
              </Box>
            </Grid>

            {/* AI result panel */}
            <Grid size={{ xs: 12, lg: 5 }}>
              <Stack spacing={2.5}>
                <Card
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    position: 'relative',
                    overflow: 'hidden',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 4,
                      background: 'linear-gradient(90deg, #0f5c8c 0%, #0f9c8f 100%)',
                    },
                  }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 2,
                        bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <PsychologyRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                    </Box>
                    <Box>
                      <Typography variant="h5">AI Analysis</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Decision-support result
                      </Typography>
                    </Box>
                  </Stack>

                  <Box sx={{ mt: 2.5 }}>
                    <Typography variant="overline" color="text.secondary">AI-Assisted Finding</Typography>
                    <Typography variant="h3" sx={{ mt: 0.25 }}>{pred.predicted_class}</Typography>
                    <Chip size="small" label="Requires clinical review" sx={{ mt: 1 }} variant="outlined" />
                  </Box>

                  <Divider sx={{ my: 2.5 }} />
                  <ConfidenceMeter confidence={pred.confidence} probabilities={pred.all_probabilities} />
                </Card>

                {isDoctor ? (
                  <Card sx={{ p: 3, borderRadius: 3 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                      <FlagRoundedIcon fontSize="small" color="action" />
                      <Typography variant="subtitle1">Review Workflow</Typography>
                    </Stack>
                    {pred.is_flagged && pred.flagged_at && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                        Flagged on {new Date(pred.flagged_at).toLocaleString()} for clinical review.
                      </Typography>
                    )}
                    <Button
                      fullWidth
                      variant={pred.is_flagged ? 'outlined' : 'contained'}
                      color={pred.is_flagged ? 'inherit' : 'info'}
                      startIcon={pred.is_flagged ? <OutlinedFlagRoundedIcon /> : <FlagRoundedIcon />}
                      onClick={handleFlagToggle}
                    >
                      {pred.is_flagged ? 'Remove Flag' : 'Flag for Review'}
                    </Button>
                  </Card>
                ) : (
                  <Alert severity="info" variant="outlined">
                    Only doctors and radiologists can flag results for review.
                  </Alert>
                )}

                <Card sx={{ p: 3, borderRadius: 3 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.75 }}>
                    <DescriptionRoundedIcon fontSize="small" color="action" />
                    <Typography variant="subtitle1">Scan Information</Typography>
                  </Stack>
                  <Stack spacing={1.5}>
                    {[
                      { icon: TagRoundedIcon, label: 'Scan ID', value: scan?.id != null ? `#${scan.id}` : '—', mono: true },
                      { icon: PersonRoundedIcon, label: 'Patient ID', value: scan?.anonymized_patient_id ?? '—', mono: true },
                      { icon: DescriptionRoundedIcon, label: 'File', value: scan?.original_filename ?? '—' },
                      { icon: ScannerRoundedIcon, label: 'Modality', value: scan?.modality ?? '—' },
                      { icon: MonitorHeartRoundedIcon, label: 'Body part', value: scan?.body_part ?? '—' },
                      {
                        icon: AccessTimeRoundedIcon,
                        label: 'Study date',
                        value: scan?.study_date ? new Date(scan.study_date).toLocaleDateString() : '—',
                      },
                      {
                        icon: AccessTimeRoundedIcon,
                        label: 'Analyzed at',
                        value: pred.created_at ? new Date(pred.created_at).toLocaleString() : '—',
                      },
                      {
                        icon: AccessTimeRoundedIcon,
                        label: 'Inference time',
                        value: pred.processing_time_ms != null ? `${Math.round(pred.processing_time_ms)} ms` : '—',
                      },
                      { icon: MemoryRoundedIcon, label: 'Engine', value: pred.model_architecture, mono: true },
                      { icon: ShieldRoundedIcon, label: 'Model version', value: pred.model_version, mono: true },
                    ].map((row) => (
                      <Stack key={row.label} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                        <row.icon sx={{ fontSize: 17, color: 'grey.500' }} />
                        <Typography variant="caption" color="text.secondary" sx={{ width: 100, flexShrink: 0 }}>
                          {row.label}
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: row.mono ? 'monospace' : undefined }} noWrap>
                          {row.value}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Card>

                <Card sx={{ p: 3, borderRadius: 3 }}>
                  <Typography variant="subtitle1" sx={{ mb: 1.5 }}>Clinical Flags</Typography>
                  <ClinicalFlagsRow isLowConfidence={pred.is_low_confidence} isHighRisk={pred.is_high_risk} isFlagged={pred.is_flagged} />
                </Card>

                <Typography variant="caption" color="text.secondary">
                  Accessed by <strong>{user?.full_name || user?.username}</strong> ({user?.role}) ·{' '}
                  {user?.role === 'staff' ? 'Staff view: history restricted to own uploads.' : 'Full diagnostic access.'}
                </Typography>
              </Stack>
            </Grid>
          </Grid>

          {/* Explainability section */}
          {result.gradcam_overlay_url && (
            <Card sx={{ p: 3.5, borderRadius: 3 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                <LightbulbRoundedIcon color="warning" />
                <Typography variant="h5">Why did the AI predict this?</Typography>
              </Stack>
              <Typography variant="overline" color="text.secondary">Grad-CAM Explainability</Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, maxWidth: 760, lineHeight: 1.8 }}>
                The heatmap visualizes which regions of the scan the AI model considered most significant when
                making its prediction. Higher-attention areas appear in warmer colors (red/yellow), while
                lower-attention areas appear cooler (blue/green). This is a{' '}
                <strong>decision-support finding</strong> based on <strong>{pred.predicted_class}</strong> with{' '}
                <strong>{Math.round(pred.confidence * 100)}% confidence</strong>. A qualified clinician should
                review these highlighted regions before any clinical action.
              </Typography>

              <Stack direction="row" spacing={1.5} sx={{ mt: 2.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary" sx={{ width: '100%', mb: 0.5 }}>
                  Attention Legend
                </Typography>
                {[
                  { color: '#2f6fa8', label: 'Low attention' },
                  { color: '#1d8a5e', label: 'Moderate' },
                  { color: '#b7791f', label: 'High' },
                  { color: '#c0362c', label: 'Peak attention' },
                ].map((item) => (
                  <Stack key={item.label} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: item.color }} />
                    <Typography variant="caption">{item.label}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Card>
          )}
        </Stack>
      )}

      {status === 'error' && (
        <Button variant="outlined" onClick={() => navigate('/history')}>
          Back to Scan History
        </Button>
      )}
    </Stack>
  );
}
