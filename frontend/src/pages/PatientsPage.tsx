import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Users,
  RefreshCw,
  AlertTriangle,
  Search,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Prediction } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { FindingBadge, ConfidenceBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

interface PatientSummary {
  patientId: string;
  scanCount: number;
  lastScan: string;
  latestFinding: string;
  latestConfidence: number;
  hasFlags: boolean;
}

export function PatientsPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const isDoctor = hasRole(['doctor', 'radiologist']);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getPredictions({ page_size: 500 });
      // Group by patient ID
      const map = new Map<string, Prediction[]>();
      for (const p of res.predictions) {
        const pid = p.scan?.anonymized_patient_id ?? '(unassigned)';
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(p);
      }

      const summaries: PatientSummary[] = [];
      for (const [pid, preds] of map.entries()) {
        const sorted = [...preds].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const latest = sorted[0];
        summaries.push({
          patientId: pid,
          scanCount: preds.length,
          lastScan: latest.created_at,
          latestFinding: latest.predicted_class,
          latestConfidence: latest.confidence,
          hasFlags: preds.some((p) => p.is_flagged || p.is_high_risk || p.is_low_confidence),
        });
      }

      summaries.sort(
        (a, b) =>
          new Date(b.lastScan).getTime() - new Date(a.lastScan).getTime()
      );
      setPatients(summaries);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load patients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (!isDoctor) return <Navigate to="/" replace />;

  const filtered = patients.filter((p) =>
    p.patientId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Patients</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Anonymized patient identifiers with scan history
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search patient ID…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
        />
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-200 bg-white animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={searchQuery ? 'No patients match your search' : 'No patients found'}
          description={
            searchQuery
              ? 'Try a different search term.'
              : 'Upload scans with patient IDs to see them here.'
          }
        />
      ) : (
        <>
          <p className="text-xs text-slate-400">
            {filtered.length} patient{filtered.length === 1 ? '' : 's'} found
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((patient) => (
              <button
                key={patient.patientId}
                onClick={() => {
                  if (patient.patientId !== '(unassigned)') {
                    navigate(`/patient/${encodeURIComponent(patient.patientId)}`);
                  }
                }}
                disabled={patient.patientId === '(unassigned)'}
                className={`bg-white border rounded-xl p-5 text-left transition-all hover:shadow-sm ${
                  patient.hasFlags ? 'border-amber-200' : 'border-slate-200'
                } ${
                  patient.patientId === '(unassigned)'
                    ? 'cursor-default opacity-60'
                    : 'hover:border-blue-200 cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-blue-600">
                        {patient.patientId.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <code className="text-sm font-mono font-semibold text-slate-800">
                        {patient.patientId}
                      </code>
                      {patient.hasFlags && (
                        <div className="text-[10px] text-amber-600 font-medium">
                          ⚠ Needs attention
                        </div>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                </div>

                <div className="flex items-center justify-between mb-2">
                  <FindingBadge predictedClass={patient.latestFinding} />
                  <ConfidenceBadge confidence={patient.latestConfidence} />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                  <span>{patient.scanCount} scan{patient.scanCount !== 1 ? 's' : ''}</span>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(patient.lastScan), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
