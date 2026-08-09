import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  User,
  Clock,
  AlertTriangle,
  Activity,
  Flag,
  CheckCircle,
  ExternalLink,
  ScanLine,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Prediction, HistoryFilters } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { FindingBadge, ConfidenceBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { ConfidenceMeter } from '../components/ConfidenceMeter';

export function PatientHistoryPage() {
  const { patientId = '' } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [all, setAll] = useState<Prediction[]>([]);
  const [filters] = useState<HistoryFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Prediction | null>(null);

  const isDoctor = hasRole(['doctor', 'radiologist']);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.getPatientHistory(decodeURIComponent(patientId));
      setAll(list);
      if (list.length > 0) setSelected(list[0]);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load patient history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const filtered = useMemo(() => {
    return all.filter((p) => {
      if (filters.predictedClass && p.predicted_class !== filters.predictedClass)
        return false;
      if (filters.minConfidence != null && p.confidence < filters.minConfidence)
        return false;
      return true;
    });
  }, [all, filters]);

  if (!isDoctor) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/history')}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
          aria-label="Back to history"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-800">Patient History</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <code className="text-sm font-mono font-semibold text-blue-600">
              {decodeURIComponent(patientId)}
            </code>
            {all.length > 0 && (
              <span className="text-xs text-slate-400">
                · {all.length} scan{all.length > 1 ? 's' : ''} in history
              </span>
            )}
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-all"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading patient history…</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={User}
          title="No history found"
          description="This patient has no recorded scan history."
          action={
            <button
              onClick={() => navigate('/history')}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all"
            >
              Back to History
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Timeline */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Scan Timeline ({filtered.length})
                </p>
              </div>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-7 top-0 bottom-0 w-px bg-slate-100" />

                <div className="divide-y divide-slate-50">
                  {filtered.map((p, idx) => {
                    const isSelected = selected?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all hover:bg-slate-50 ${
                          isSelected ? 'bg-blue-50 hover:bg-blue-50' : ''
                        }`}
                      >
                        {/* Timeline node */}
                        <div className="relative z-10 flex-shrink-0 mt-1">
                          <div
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-colors ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : p.is_high_risk
                                ? 'border-red-400 bg-red-50 text-red-600'
                                : p.is_flagged
                                ? 'border-amber-400 bg-amber-50 text-amber-600'
                                : 'border-slate-200 bg-white text-slate-400'
                            }`}
                          >
                            {idx + 1}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <FindingBadge predictedClass={p.predicted_class} />
                            <ConfidenceBadge confidence={p.confidence} />
                          </div>
                          <p className="text-xs text-slate-500 truncate">
                            {p.scan?.original_filename ?? `Scan #${p.scan_id}`}
                          </p>
                          <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(p.created_at), {
                              addSuffix: true,
                            })}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="space-y-4">
                {/* Prediction summary */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-500" />
                      AI Analysis Result
                    </h3>
                    <button
                      onClick={() => navigate(`/results/${selected.scan_id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-all"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View full analysis
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Finding</p>
                      <FindingBadge predictedClass={selected.predicted_class} size="md" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Date</p>
                      <p className="text-sm font-medium text-slate-700">
                        {new Date(selected.created_at).toLocaleDateString(undefined, {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Scan file</p>
                      <p className="text-xs font-mono text-slate-600 truncate">
                        {selected.scan?.original_filename ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">AI Engine</p>
                      <p className="text-xs font-mono text-slate-600">
                        {selected.model_architecture}
                      </p>
                    </div>
                  </div>

                  <ConfidenceMeter
                    confidence={selected.confidence}
                    probabilities={selected.all_probabilities}
                    showTable={true}
                  />
                </div>

                {/* Clinical flags */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Flag className="w-4 h-4 text-slate-400" />
                    Clinical Status
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selected.is_flagged && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-medium">
                        <Flag className="w-3.5 h-3.5" />
                        Flagged for review
                        {selected.flagged_at && (
                          <span className="text-blue-400 ml-1">
                            · {new Date(selected.flagged_at).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    )}
                    {selected.is_low_confidence && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Low confidence — clinical review recommended
                      </span>
                    )}
                    {selected.is_high_risk && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        High-risk finding
                      </span>
                    )}
                    {!selected.is_flagged &&
                      !selected.is_low_confidence &&
                      !selected.is_high_risk && (
                        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          No clinical flags
                        </span>
                      )}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={ScanLine}
                title="Select a scan from the timeline"
                description="Click on a scan entry to view its detailed analysis."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
