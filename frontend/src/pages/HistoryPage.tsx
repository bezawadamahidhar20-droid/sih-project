import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Search,
  RefreshCw,
  History,
  SlidersHorizontal,
  ExternalLink,
  Flag,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Prediction, HistoryFilters } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { FindingBadge, ConfidenceBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { TableRowSkeleton } from '../components/LoadingSkeleton';

const DEFAULT_CLASSES = ['Normal', 'Pneumonia'];

function fromDateFor(recency?: string): string | undefined {
  if (!recency || recency === 'all') return undefined;
  const days = Number(recency);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function HistoryPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [filters, setFilters] = useState<HistoryFilters>({});
  const [availableClasses, setAvailableClasses] = useState<string[]>(DEFAULT_CLASSES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const isDoctor = hasRole(['doctor', 'radiologist']);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getPredictions({
        page: page + 1,
        page_size: pageSize,
        patient_id: filters.patientId || undefined,
        predicted_class: filters.predictedClass || undefined,
        min_confidence: filters.minConfidence,
        flagged:
          filters.flagged === 'flagged'
            ? true
            : filters.flagged === 'unflagged'
            ? false
            : undefined,
        from_date: fromDateFor(filters.recency),
      });
      setPredictions(response.predictions);
      setTotal(response.total);
      setAvailableClasses((prev) =>
        Array.from(
          new Set([
            ...DEFAULT_CLASSES,
            ...prev,
            ...response.predictions.map((p) => p.predicted_class),
          ])
        )
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load prediction history.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!isDoctor) {
    return <Navigate to="/" replace />;
  }

  const totalPages = Math.ceil(total / pageSize);

  const updateFilter = (patch: Partial<HistoryFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(0);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Scan History</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            All analyzed scans with anonymized patient identifiers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all ${
              showFilters
                ? 'border-blue-200 bg-blue-50 text-blue-600'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-all"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Patient ID search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Patient ID"
              value={filters.patientId ?? ''}
              onChange={(e) => updateFilter({ patientId: e.target.value || undefined })}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          {/* Finding class */}
          <select
            value={filters.predictedClass ?? ''}
            onChange={(e) => updateFilter({ predictedClass: e.target.value || undefined })}
            className="py-2 px-3 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">All findings</option>
            {availableClasses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Confidence */}
          <select
            value={filters.minConfidence ?? ''}
            onChange={(e) =>
              updateFilter({
                minConfidence: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            className="py-2 px-3 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">Any confidence</option>
            <option value="0.9">High (≥90%)</option>
            <option value="0.7">Moderate+ (≥70%)</option>
            <option value="0.5">All ≥50%</option>
          </select>

          {/* Recency */}
          <select
            value={filters.recency ?? 'all'}
            onChange={(e) =>
              updateFilter({ recency: e.target.value as HistoryFilters['recency'] })
            }
            className="py-2 px-3 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="all">Any time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>

          {/* Flag status */}
          <select
            value={filters.flagged ?? 'all'}
            onChange={(e) =>
              updateFilter({ flagged: e.target.value as HistoryFilters['flagged'] })
            }
            className="py-2 px-3 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="all">Any flag status</option>
            <option value="flagged">Flagged</option>
            <option value="unflagged">Not flagged</option>
          </select>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Total count */}
      {!loading && (
        <p className="text-xs text-slate-400">
          {total} prediction{total === 1 ? '' : 's'} found
        </p>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {[
                  'Date',
                  'Patient ID',
                  'Scan File',
                  'Engine',
                  'Finding',
                  'Confidence',
                  'Flags',
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
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={8} />
                ))}

              {!loading && predictions.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={History}
                      title="No predictions match the current filters"
                      description="Try adjusting or clearing the filters to see results."
                    />
                  </td>
                </tr>
              )}

              {!loading &&
                predictions.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/results/${p.scan_id}`)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span>
                          {new Date(p.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(p.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      {p.scan?.anonymized_patient_id ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(
                              `/patient/${encodeURIComponent(p.scan!.anonymized_patient_id!)}`
                            );
                          }}
                          className="font-mono text-xs text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          {p.scan.anonymized_patient_id}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-700 max-w-[150px] truncate">
                        {p.scan?.original_filename ?? '—'}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-slate-500">
                        {p.model_architecture}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <FindingBadge predictedClass={p.predicted_class} />
                    </td>

                    <td className="px-4 py-3">
                      <ConfidenceBadge confidence={p.confidence} />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.is_low_confidence && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Low conf.
                          </span>
                        )}
                        {p.is_high_risk && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            High risk
                          </span>
                        )}
                        {p.is_flagged && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                            <Flag className="w-2.5 h-2.5" />
                            Flagged
                          </span>
                        )}
                        {!p.is_low_confidence && !p.is_high_risk && !p.is_flagged && (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/results/${p.scan_id}`);
                        }}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        View
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-400">
              Page {page + 1} of {totalPages} · {total} total
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
