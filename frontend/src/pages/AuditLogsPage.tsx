import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  ClipboardList,
  RefreshCw,
  AlertTriangle,
  Clock,
  Upload,
  Brain,
  Flag,
  Shield,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { EmptyState } from '../components/EmptyState';

interface AuditEntry {
  id: number;
  type: 'upload' | 'prediction' | 'flag';
  timestamp: string;
  scanId?: number;
  finding?: string;
  confidence?: number;
  patientId?: string;
  details: string;
  isHighRisk?: boolean;
  isFlagged?: boolean;
}

export function AuditLogsPage() {
  const { hasRole } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isDoctor = hasRole(['doctor', 'radiologist']);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // Derive audit log from predictions (no PHI)
      const res = await api.getPredictions({ page_size: 200 });
      const logs: AuditEntry[] = [];

      for (const p of res.predictions) {
        // Upload entry (derived from scan)
        if (p.scan) {
          logs.push({
            id: p.scan.id * 10,
            type: 'upload',
            timestamp: p.scan.created_at,
            scanId: p.scan_id,
            patientId: p.scan.anonymized_patient_id ?? undefined,
            details: `Scan uploaded: ${p.scan.original_filename} (${
              p.scan.modality ?? 'unknown modality'
            })`,
          });
        }

        // Prediction entry
        logs.push({
          id: p.id * 10 + 1,
          type: 'prediction',
          timestamp: p.created_at,
          scanId: p.scan_id,
          finding: p.predicted_class,
          confidence: p.confidence,
          patientId: p.scan?.anonymized_patient_id ?? undefined,
          details: `AI inference: ${p.predicted_class} (${Math.round(
            p.confidence * 100
          )}%) — engine: ${p.model_architecture}`,
          isHighRisk: p.is_high_risk,
        });

        // Flag entry
        if (p.is_flagged && p.flagged_at) {
          logs.push({
            id: p.id * 10 + 2,
            type: 'flag',
            timestamp: p.flagged_at,
            scanId: p.scan_id,
            finding: p.predicted_class,
            patientId: p.scan?.anonymized_patient_id ?? undefined,
            details: `Flagged for clinical review: ${p.predicted_class}`,
            isFlagged: true,
          });
        }
      }

      // Sort by most recent
      logs.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setEntries(logs);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load audit data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (!isDoctor) return <Navigate to="/" replace />;

  const typeConfig = {
    upload: {
      icon: Upload,
      label: 'Upload',
      bg: 'bg-blue-50',
      iconColor: 'text-blue-500',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    prediction: {
      icon: Brain,
      label: 'AI Inference',
      bg: 'bg-purple-50',
      iconColor: 'text-purple-500',
      badge: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    flag: {
      icon: Flag,
      label: 'Flag',
      bg: 'bg-amber-50',
      iconColor: 'text-amber-500',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
    },
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Audit Logs</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Structured audit trail of uploads, predictions, and flags — no PHI stored.
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

      {/* Privacy note */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-slate-200 bg-slate-50">
        <Shield className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Audit records contain anonymized patient IDs only. No personally
          identifiable information (PHI) is stored in the audit log.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl border border-slate-200 bg-white animate-pulse"
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No audit records"
          description="Upload and analyze scans to generate audit entries."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">
              {entries.length} log entries
            </p>
          </div>

          <div className="divide-y divide-slate-50">
            {entries.map((entry) => {
              const config = typeConfig[entry.type];
              const Icon = config.icon;

              return (
                <div
                  key={entry.id}
                  className={`flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors ${
                    entry.isHighRisk ? 'border-l-2 border-l-red-400' : ''
                  }`}
                >
                  {/* Icon */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bg}`}
                  >
                    <Icon className={`w-4 h-4 ${config.iconColor}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${config.badge}`}
                      >
                        {config.label}
                      </span>
                      {entry.isHighRisk && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase bg-red-50 text-red-700 border-red-200">
                          High Risk
                        </span>
                      )}
                      {entry.isFlagged && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase bg-blue-50 text-blue-700 border-blue-200">
                          Flagged
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700">{entry.details}</p>
                    {entry.patientId && (
                      <p className="text-xs font-mono text-slate-400 mt-0.5">
                        Patient: {entry.patientId}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="flex-shrink-0 text-right">
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(entry.timestamp), {
                        addSuffix: true,
                      })}
                    </div>
                    <p className="text-[10px] text-slate-300 mt-0.5">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
