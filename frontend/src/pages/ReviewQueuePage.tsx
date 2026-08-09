import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Flag,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Prediction } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { FindingBadge, ConfidenceBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { TableRowSkeleton } from '../components/LoadingSkeleton';

type QueueTab = 'flagged' | 'low-confidence' | 'high-risk';

export function ReviewQueuePage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<QueueTab>('flagged');
  const [resolving, setResolving] = useState<number | null>(null);

  const isDoctor = hasRole(['doctor', 'radiologist']);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getPredictions({ page_size: 200 });
      setPredictions(response.predictions);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load review queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!isDoctor) return <Navigate to="/" replace />;

  const flagged = predictions.filter((p) => p.is_flagged);
  const lowConf = predictions.filter((p) => p.is_low_confidence && !p.is_flagged);
  const highRisk = predictions.filter((p) => p.is_high_risk && !p.is_flagged);

  const displayed =
    tab === 'flagged' ? flagged : tab === 'low-confidence' ? lowConf : highRisk;

  const handleUnflag = async (id: number) => {
    setResolving(id);
    try {
      await api.flagPrediction(id, false);
      setPredictions((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, is_flagged: false, flagged_at: null, flagged_by: null } : p
        )
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not resolve flag.');
    } finally {
      setResolving(null);
    }
  };

  const tabs = [
    {
      key: 'flagged' as QueueTab,
      label: 'Flagged Cases',
      count: flagged.length,
      icon: Flag,
      color: 'text-blue-600',
      activeBg: 'border-blue-600 text-blue-700',
    },
    {
      key: 'low-confidence' as QueueTab,
      label: 'Low Confidence',
      count: lowConf.length,
      icon: AlertTriangle,
      color: 'text-amber-600',
      activeBg: 'border-amber-600 text-amber-700',
    },
    {
      key: 'high-risk' as QueueTab,
      label: 'High Risk',
      count: highRisk.length,
      icon: AlertTriangle,
      color: 'text-red-600',
      activeBg: 'border-red-600 text-red-700',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Review Queue</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Flagged cases, low-confidence results, and high-risk findings requiring
            clinical attention.
          </p>
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

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`bg-white border rounded-xl p-4 text-left hover:shadow-sm transition-all ${
                tab === t.key ? 'border-blue-200 bg-blue-50' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${t.color}`} />
                <span className="text-xs font-medium text-slate-600">{t.label}</span>
              </div>
              <p
                className={`text-3xl font-bold ${
                  t.count > 0 ? t.color : 'text-slate-300'
                }`}
              >
                {loading ? '—' : t.count}
              </p>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Tab strip */}
      <div className="border-b border-slate-200">
        <div className="flex items-center gap-0">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                  tab === t.key
                    ? t.activeBg
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {!loading && t.count > 0 && (
                  <span
                    className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                      tab === t.key ? 'bg-current/10' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <table className="w-full">
            <tbody>
              <TableRowSkeleton cols={7} />
              <TableRowSkeleton cols={7} />
              <TableRowSkeleton cols={7} />
            </tbody>
          </table>
        ) : displayed.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title={
              tab === 'flagged'
                ? 'No flagged cases'
                : tab === 'low-confidence'
                ? 'No low-confidence results'
                : 'No high-risk findings'
            }
            description="All cases have been reviewed or cleared."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {[
                    'Patient / Scan',
                    'Finding',
                    'Confidence',
                    'Priority',
                    'Flagged',
                    'Status',
                    'Actions',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayed.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      p.is_high_risk ? 'border-l-2 border-l-red-400' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono font-semibold text-blue-600">
                        {p.scan?.anonymized_patient_id ?? '—'}
                      </p>
                      <p className="text-xs text-slate-400 truncate max-w-[130px]">
                        {p.scan?.original_filename ?? `Scan #${p.scan_id}`}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <FindingBadge predictedClass={p.predicted_class} />
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceBadge confidence={p.confidence} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border font-medium ${
                          p.is_high_risk
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : p.is_low_confidence
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {p.is_high_risk
                          ? 'CRITICAL'
                          : p.is_low_confidence
                          ? 'HIGH'
                          : 'NORMAL'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.flagged_at ? (
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(p.flagged_at), {
                            addSuffix: true,
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded border font-medium ${
                          p.is_flagged
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}
                      >
                        {p.is_flagged ? 'Flagged' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/results/${p.scan_id}`)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Review
                        </button>
                        {p.is_flagged && (
                          <button
                            onClick={() => handleUnflag(p.id)}
                            disabled={resolving === p.id}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-600 font-medium disabled:opacity-50"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
