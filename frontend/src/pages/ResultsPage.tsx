import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  Flag,
  RefreshCw,
  ScanLine,
  Clock,
  User,
  FileText,
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle,
  Cpu,
  Layers,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Scan, PredictResponse } from '../types';
import { ScanViewer } from '../components/ScanViewer';
import { ConfidenceMeter } from '../components/ConfidenceMeter';
import { ClinicalSafetyBanner } from '../components/ClinicalSafetyBanner';
import { FindingBadge } from '../components/StatusBadge';

type PageStatus = 'loading' | 'processing' | 'ready' | 'error';

const PROCESSING_STEPS = [
  'Decrypting and validating scan…',
  'Normalizing image data…',
  'Running AI inference…',
  'Generating Grad-CAM heatmap…',
  'Preparing clinical decision-support result…',
];

export function ResultsPage() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const [status, setStatus] = useState<PageStatus>('loading');
  const [scan, setScan] = useState<Scan | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState('');
  const [processingStep, setProcessingStep] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDoctor = hasRole(['doctor', 'radiologist']);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  const startStepAnimation = useCallback(() => {
    setProcessingStep(0);
    stepTimerRef.current = setInterval(() => {
      setProcessingStep((s) => Math.min(s + 1, PROCESSING_STEPS.length - 1));
    }, 1800);
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
        if (err.response?.status === 409) {
          let attempts = 0;
          pollRef.current = setInterval(async () => {
            attempts += 1;
            try {
              const s = await api.getScan(id);
              if (s.status === 'completed') {
                stopPolling();
                const res = await api.predict(id);
                setResult(res);
                setScan(res.scan);
                setStatus('ready');
              } else if (s.status === 'failed') {
                stopPolling();
                setError(
                  'Analysis failed for this scan. It may be an unsupported or corrupted image.'
                );
                setStatus('error');
              } else if (attempts > 20) {
                stopPolling();
                setError('Analysis is taking longer than expected. Please try again.');
                setStatus('error');
              }
            } catch {
              stopPolling();
              setError('Failed to reach the analysis service.');
              setStatus('error');
            }
          }, 2000);
        } else {
          stopPolling();
          setError(err.response?.data?.detail || err.message || 'Analysis failed.');
          setStatus('error');
        }
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
      const updated = await api.flagPrediction(
        result.prediction.id,
        !result.prediction.is_flagged
      );
      setResult((prev) => (prev ? { ...prev, prediction: updated } : prev));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not update flag.');
    }
  };

  const pred = result?.prediction;

  // Determine safety banner variant
  let safetyVariant: 'normal' | 'low-confidence' | 'flagged' | 'critical' = 'normal';
  if (pred?.is_flagged) safetyVariant = 'flagged';
  else if (pred?.is_high_risk) safetyVariant = 'critical';
  else if (pred?.is_low_confidence) safetyVariant = 'low-confidence';

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Diagnostic Result</h2>
            <p className="text-xs text-slate-500">
              {scan?.original_filename ?? 'Loading scan…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm hover:bg-slate-50 transition-all"
          >
            <Upload className="w-4 h-4" />
            New scan
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button
            onClick={() => runPrediction(Number(scanId))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-all flex-shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Processing state */}
      {(status === 'loading' || status === 'processing') && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-blue-100" />
            <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-blue-600 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Cpu className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="text-center space-y-2 max-w-sm">
            <p className="text-base font-semibold text-slate-800">
              {status === 'loading' ? 'Loading scan…' : 'Analyzing scan…'}
            </p>
            {status === 'processing' && (
              <>
                <p className="text-sm text-slate-500">
                  {PROCESSING_STEPS[processingStep]}
                </p>
                <div className="flex items-center justify-center gap-1 mt-2">
                  {PROCESSING_STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 rounded-full transition-all duration-500 ${
                        i <= processingStep ? 'bg-blue-600 w-6' : 'bg-slate-200 w-3'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Ready state */}
      {status === 'ready' && result && pred && (
        <>
          {/* Safety banner */}
          <ClinicalSafetyBanner variant={safetyVariant} />

          {/* Main 3-column layout */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Image viewer — 5 cols */}
            <div className="xl:col-span-5" style={{ minHeight: 500 }}>
              <ScanViewer
                originalUrl={result.original_image_url}
                overlayUrl={result.gradcam_overlay_url}
                filename={scan?.original_filename}
              />
            </div>

            {/* AI Result panel — 4 cols */}
            <div className="xl:col-span-4 space-y-4">
              {/* Prediction */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" />
                    AI Analysis
                  </h3>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                    Decision-support result
                  </span>
                </div>

                {/* Finding */}
                <div className="p-4 rounded-lg border border-slate-100 bg-slate-50 mb-4">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">
                    AI-Assisted Finding
                  </p>
                  <div className="flex items-center gap-3">
                    <FindingBadge predictedClass={pred.predicted_class} size="md" />
                  </div>
                  {result.warning && (
                    <div className="flex items-start gap-2 mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {result.warning}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-2 italic">
                    Requires clinical review
                  </p>
                </div>

                {/* Confidence meter */}
                <ConfidenceMeter
                  confidence={pred.confidence}
                  probabilities={pred.all_probabilities}
                  showTable={true}
                />
              </div>

              {/* Review workflow — doctors/radiologists only */}
              {isDoctor && (
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Flag className="w-4 h-4 text-blue-500" />
                    Review Workflow
                  </h3>

                  {pred.is_flagged && pred.flagged_at && (
                    <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
                      Flagged on {new Date(pred.flagged_at).toLocaleString()} for
                      clinical review.
                    </div>
                  )}

                  <button
                    onClick={handleFlagToggle}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                      pred.is_flagged
                        ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    <Flag className="w-4 h-4" />
                    {pred.is_flagged ? 'Unflag for review' : 'Flag for review'}
                  </button>
                </div>
              )}

              {!isDoctor && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 flex items-start gap-2">
                  <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400" />
                  Only doctors and radiologists can flag results for review.
                </div>
              )}
            </div>

            {/* Scan metadata — 3 cols */}
            <div className="xl:col-span-3 space-y-4">
              {/* Scan info */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <ScanLine className="w-4 h-4 text-slate-400" />
                  Scan Information
                </h3>
                <dl className="space-y-2.5">
                  {[
                    {
                      icon: User,
                      label: 'Patient ID',
                      value: scan?.anonymized_patient_id ?? '—',
                      mono: true,
                    },
                    {
                      icon: FileText,
                      label: 'File',
                      value: scan?.original_filename ?? '—',
                    },
                    {
                      icon: ScanLine,
                      label: 'Modality',
                      value: scan?.modality ?? '—',
                    },
                    {
                      icon: Activity,
                      label: 'Body part',
                      value: scan?.body_part ?? '—',
                    },
                    {
                      icon: Clock,
                      label: 'Study date',
                      value: scan?.study_date
                        ? new Date(scan.study_date).toLocaleDateString()
                        : '—',
                    },
                    {
                      icon: Clock,
                      label: 'Inference time',
                      value:
                        pred.processing_time_ms != null
                          ? `${Math.round(pred.processing_time_ms)} ms`
                          : '—',
                    },
                    {
                      icon: Cpu,
                      label: 'Engine',
                      value: pred.model_architecture,
                      mono: true,
                    },
                    {
                      icon: Shield,
                      label: 'Model version',
                      value: pred.model_version,
                      mono: true,
                    },
                  ].map((row) => {
                    const Icon = row.icon;
                    return (
                      <div key={row.label} className="flex items-start gap-2">
                        <Icon className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs text-slate-400">{row.label}</p>
                          <p
                            className={`text-xs font-medium text-slate-700 truncate ${
                              row.mono ? 'font-mono' : ''
                            }`}
                          >
                            {row.value}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </dl>
              </div>

              {/* Status chips */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">
                  Clinical Flags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {pred.is_low_confidence && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border font-medium bg-amber-50 text-amber-700 border-amber-200">
                      <AlertTriangle className="w-3 h-3" />
                      Low confidence
                    </span>
                  )}
                  {pred.is_high_risk && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border font-medium bg-red-50 text-red-700 border-red-200">
                      <AlertTriangle className="w-3 h-3" />
                      High risk finding
                    </span>
                  )}
                  {pred.is_flagged && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border font-medium bg-blue-50 text-blue-700 border-blue-200">
                      <Flag className="w-3 h-3" />
                      Flagged for review
                    </span>
                  )}
                  {!pred.is_low_confidence && !pred.is_high_risk && !pred.is_flagged && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
                      <CheckCircle className="w-3 h-3" />
                      No flags
                    </span>
                  )}
                </div>
              </div>

              {/* Logged as */}
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-400">
                  Accessed by{' '}
                  <span className="font-medium text-slate-600">
                    {user?.full_name || user?.username}
                  </span>{' '}
                  ({user?.role}) ·{' '}
                  {user?.role === 'staff'
                    ? 'Staff view: history restricted to own uploads.'
                    : 'Full diagnostic access.'}
                </p>
              </div>
            </div>
          </div>

          {/* Explainability section */}
          {result.gradcam_overlay_url && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-slate-800">
                  Why did the AI predict this?
                </h3>
                <span className="text-xs text-slate-400 ml-auto">
                  Grad-CAM Explainability
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div>
                  <p className="text-sm text-slate-600 leading-relaxed mb-4">
                    The heatmap below visualizes which regions of the scan the AI
                    model considered most significant when making its prediction.
                    Higher-attention areas appear in warmer colors (red/yellow),
                    while lower-attention areas appear cooler (blue/green).
                  </p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    This is a{' '}
                    <span className="font-medium">decision-support finding</span>{' '}
                    based on{' '}
                    <span className="font-medium">
                      {pred.predicted_class}
                    </span>{' '}
                    with{' '}
                    <span className="font-medium">
                      {Math.round(pred.confidence * 100)}% confidence
                    </span>
                    . A qualified clinician should review these highlighted regions
                    before any clinical action.
                  </p>

                  {/* Legend */}
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Attention Legend
                    </p>
                    <div className="flex items-center gap-3">
                      {[
                        { color: '#3b82f6', label: 'Low attention' },
                        { color: '#22c55e', label: 'Moderate' },
                        { color: '#f59e0b', label: 'High' },
                        { color: '#ef4444', label: 'Peak attention' },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-1.5">
                          <div
                            className="w-3 h-3 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-xs text-slate-500">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="h-64 bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <ScanViewer
                    originalUrl={result.original_image_url}
                    overlayUrl={result.gradcam_overlay_url}
                    filename={null}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
