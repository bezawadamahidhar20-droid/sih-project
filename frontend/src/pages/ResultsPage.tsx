import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Chip,
  Divider,
  Grid,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material'
import {
  ArrowBackOutlined,
  UploadOutlined,
  FlagOutlined,
  FlagCircleOutlined,
  RefreshOutlined,
  MedicalInformationOutlined,
  TimelineOutlined,
  MemoryOutlined,
  ScheduleOutlined,
  PersonOutlineOutlined,
  DescriptionOutlined,
  ScienceOutlined,
  ShieldOutlined,
  WarningAmberOutlined,
  ErrorOutlineOutlined,
} from '@mui/icons-material'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Scan, PredictResponse } from '../types'
import { ScanViewer } from '../components/ScanViewer'
import { ConfidenceBar } from '../components/ConfidenceBar'

type PageStatus = 'loading' | 'processing' | 'ready' | 'error'

export function ResultsPage() {
  const { scanId } = useParams<{ scanId: string }>()
  const navigate = useNavigate()
  const { user, hasRole } = useAuth()
  const [status, setStatus] = useState<PageStatus>('loading')
  const [scan, setScan] = useState<Scan | null>(null)
  const [result, setResult] = useState<PredictResponse | null>(null)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isDoctor = hasRole(['doctor', 'radiologist'])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const runPrediction = useCallback(
    async (id: number) => {
      setStatus('processing')
      setError('')
      try {
        const res = await api.predict(id)
        setResult(res)
        setScan(res.scan)
        setStatus('ready')
      } catch (err: any) {
        if (err.response?.status === 409) {
          // Another job is already processing this scan — poll until done.
          let attempts = 0
          pollRef.current = setInterval(async () => {
            attempts += 1
            try {
              const s = await api.getScan(id)
              if (s.status === 'completed') {
                stopPolling()
                const res = await api.predict(id)
                setResult(res)
                setScan(res.scan)
                setStatus('ready')
              } else if (s.status === 'failed') {
                stopPolling()
                setError('Analysis failed for this scan. It may be an unsupported or corrupted image.')
                setStatus('error')
              } else if (attempts > 20) {
                stopPolling()
                setError('Analysis is taking longer than expected. Please try again.')
                setStatus('error')
              }
            } catch {
              stopPolling()
              setError('Failed to reach the analysis service.')
              setStatus('error')
            }
          }, 2000)
        } else {
          setError(err.response?.data?.detail || err.message || 'Analysis failed')
          setStatus('error')
        }
      }
    },
    [stopPolling]
  )

  useEffect(() => {
    let active = true
    const id = Number(scanId)
    if (!Number.isFinite(id)) {
      setError('Invalid scan reference.')
      setStatus('error')
      return
    }
    setStatus('loading')
    api
      .getScan(id)
      .then((s) => {
        if (!active) return
        setScan(s)
        if (s.status === 'completed' || s.status === 'uploaded' || s.status === 'failed') {
          void runPrediction(id)
        } else {
          setStatus('processing')
        }
      })
      .catch((err: any) => {
        if (!active) return
        setError(err.response?.data?.detail || 'Scan not found.')
        setStatus('error')
      })
    return () => {
      active = false
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId])

  const handleFlagToggle = async () => {
    if (!result) return
    try {
      const updated = await api.flagPrediction(result.prediction.id, !result.prediction.is_flagged)
      setResult((prev) => (prev ? { ...prev, prediction: updated } : prev))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not update flag.')
    }
  }

  const findingIsAbnormal = result?.prediction.predicted_class !== 'Normal'

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowBackOutlined />
          </IconButton>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Diagnostic Result
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {scan?.original_filename ?? 'Loading scan…'}
            </Typography>
          </Box>
        </Box>
        <Button variant="outlined" startIcon={<UploadOutlined />} onClick={() => navigate('/upload')}>
          New scan
        </Button>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" startIcon={<RefreshOutlined />} onClick={() => runPrediction(Number(scanId))}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {status === 'ready' && result && (
        <Grid container spacing={3}>
          {/* Viewer */}
          <Grid item xs={12} lg={8}>
            <Card>
              <CardContent>
                <ScanViewer
                  originalUrl={result.original_image_url}
                  overlayUrl={result.gradcam_overlay_url}
                  filename={scan?.original_filename}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Findings panel */}
          <Grid item xs={12} lg={4}>
            <Stack spacing={2}>
              <Card>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Predicted finding
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                    <Chip
                      icon={findingIsAbnormal ? <MedicalInformationOutlined /> : <ShieldOutlined />}
                      label={result.prediction.predicted_class}
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.9375rem',
                        color: findingIsAbnormal ? '#B3261E' : '#1E7B45',
                        backgroundColor: findingIsAbnormal ? '#FDF4F3' : '#F0F8F3',
                        border: `1px solid ${findingIsAbnormal ? '#E5B8B5' : '#B7D9C3'}`,
                      }}
                    />
                    <Chip
                      size="small"
                      label={result.prediction.model_architecture}
                      variant="outlined"
                      title="Inference engine"
                    />
                  </Box>

                  <Box sx={{ mt: 2 }}>
                    <ConfidenceBar
                      confidence={result.prediction.confidence}
                      probabilities={result.prediction.all_probabilities}
                      showProbabilityTable
                    />
                  </Box>

                  {result.warning && (
                    <Alert severity={result.prediction.is_high_risk ? 'error' : 'warning'} sx={{ mt: 2 }} icon={result.prediction.is_high_risk ? <ErrorOutlineOutlined /> : <WarningAmberOutlined />}>
                      {result.warning}
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="overline" color="text.secondary">
                      Review workflow
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    {isDoctor ? (
                      <Button
                        variant={result.prediction.is_flagged ? 'outlined' : 'contained'}
                        color={result.prediction.is_flagged ? 'primary' : 'primary'}
                        startIcon={result.prediction.is_flagged ? <FlagCircleOutlined /> : <FlagOutlined />}
                        fullWidth
                        onClick={handleFlagToggle}
                      >
                        {result.prediction.is_flagged ? 'Unflag for review' : 'Flag for review'}
                      </Button>
                    ) : (
                      <Tooltip title="Only doctors and radiologists can flag results for review.">
                        <span style={{ width: '100%' }}>
                          <Button variant="outlined" disabled fullWidth startIcon={<FlagOutlined />}>
                            Flag for review
                          </Button>
                        </span>
                      </Tooltip>
                    )}
                  </Stack>
                  {result.prediction.is_flagged && (
                    <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5, color: '#12507E' }}>
                      <FlagCircleOutlined fontSize="inherit" />
                      Flagged on {result.prediction.flagged_at ? new Date(result.prediction.flagged_at).toLocaleString() : 'recently'} for clinical review.
                    </Typography>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Scan information
                  </Typography>
                  <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                    {[
                      { icon: <PersonOutlineOutlined fontSize="small" />, label: 'Patient ID', value: scan?.anonymized_patient_id ?? '—' },
                      { icon: <DescriptionOutlined fontSize="small" />, label: 'File', value: scan?.original_filename ?? '—' },
                      { icon: <MedicalInformationOutlined fontSize="small" />, label: 'Modality', value: scan?.modality ?? '—' },
                      { icon: <ScienceOutlined fontSize="small" />, label: 'Body part', value: scan?.body_part ?? '—' },
                      { icon: <ScheduleOutlined fontSize="small" />, label: 'Study date', value: scan?.study_date ? new Date(scan.study_date).toLocaleDateString() : '—' },
                      { icon: <TimelineOutlined fontSize="small" />, label: 'Inference time', value: result.prediction.processing_time_ms != null ? `${Math.round(result.prediction.processing_time_ms)} ms` : '—' },
                      { icon: <MemoryOutlined fontSize="small" />, label: 'Engine', value: result.prediction.model_architecture },
                      { icon: <ShieldOutlined fontSize="small" />, label: 'Model version', value: result.prediction.model_version },
                    ].map((row) => (
                      <Box key={row.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{row.icon}</Box>
                        <Typography variant="caption" color="text.secondary" sx={{ width: 96, flexShrink: 0 }}>
                          {row.label}
                        </Typography>
                        <Typography variant="body2" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.value}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {result.prediction.is_low_confidence && (
                      <Chip icon={<WarningAmberOutlined />} label="Below clinical threshold" size="small" sx={{ color: '#9A6700', backgroundColor: '#FBF5E9', border: '1px solid #D9BE8A' }} />
                    )}
                    {result.prediction.is_high_risk && (
                      <Chip icon={<ErrorOutlineOutlined />} label="High-risk finding" size="small" sx={{ color: '#B3261E', backgroundColor: '#FDF4F3', border: '1px solid #E5B8B5' }} />
                    )}
                    {result.prediction.is_flagged && (
                      <Chip icon={<FlagOutlined />} label="Flagged for review" size="small" sx={{ color: '#12507E', backgroundColor: '#EAF2FA', border: '1px solid #9DB8CF' }} />
                    )}
                  </Box>

                  <Alert severity="info" icon={<ShieldOutlined />} sx={{ mt: 2 }}>
                    <Typography variant="caption">
                      This AI output is decision-support only and does not constitute a final diagnosis.
                      Findings should be confirmed by a qualified clinician.
                    </Typography>
                  </Alert>
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      )}

      {status === 'processing' && (
        <Card>
          <CardContent>
            <ScanViewer filename={scan?.original_filename} loading loadingLabel="Running diagnostic model…" />
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Step 1/2 — Decrypting and normalizing scan… <span role="img" aria-hidden>✓</span>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Step 2/2 — Running inference and generating Grad-CAM heatmap…
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {status === 'loading' && (
        <Card>
          <CardContent>
            <ScanViewer loading loadingLabel="Loading scan…" />
          </CardContent>
        </Card>
      )}

      {status === 'error' && !error && (
        <Card>
          <CardContent>
            <Typography color="text.secondary">Unable to load this scan.</Typography>
          </CardContent>
        </Card>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        Logged in as {user?.full_name || user?.username} ({user?.role}) · {user?.role === 'staff' ? 'Staff view: history restricted to your own uploads.' : 'Full diagnostic access.'}
      </Typography>
    </Box>
  )
}
