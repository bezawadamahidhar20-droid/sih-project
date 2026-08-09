import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ScanLine,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Flag,
  Cpu,
  RefreshCw,
  Upload,
  ArrowRight,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Scan, Prediction, ScanStatus, HealthResponse } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { StatusBadge, FindingBadge, ConfidenceBadge } from '../components/StatusBadge';
import { StatCardSkeleton, TableRowSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { ClinicalSafetyBanner } from '../components/ClinicalSafetyBanner';

function getGreeting(name: string) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${greeting}, ${name}.`;
}

interface StatCardProps {
  title: string;
  value: number | string;
  subtext?: string;
  icon: typeof ScanLine;
  iconBg: string;
  iconColor: string;
  loading?: boolean;
}

function StatCard({
  title,
  value,
  subtext,
  icon: Icon,
  iconBg,
  iconColor,
  loading,
}: StatCardProps) {
  if (loading) return <StatCardSkeleton />;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-800 leading-none mb-1">{value}</p>
      {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scans, setScans] = useState<Scan[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [scansRes, predictionsRes, healthRes] = await Promise.all([
        api.getScans({ page_size: 100 }),
        api.getPredictions({ page_size: 100 }),
        api.healthCheck(),
      ]);
      setScans(scansRes.scans);
      setPredictions(predictionsRes.predictions);
      setHealth(healthRes);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const displayName =
    user?.full_name?.split(' ')[0] ||
    user?.username ||
    'Doctor';

  const totalScans = scans.length;
  const pendingScans = scans.filter(
    (s) => s.status === 'processing' || s.status === 'uploaded'
  ).length;
  const flaggedPredictions = predictions.filter((p) => p.is_flagged).length;
  const lowConfidence = predictions.filter((p) => p.is_low_confidence).length;
  const recentScans = [...scans].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 5);

  const needsAttention = predictions.filter(
    (p) => p.is_flagged || p.is_low_confidence || p.is_high_risk
  );

  const getScanStatus = (status: ScanStatus) => status;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {getGreeting(displayName)}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Here's your diagnostic workspace for today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm hover:bg-slate-50 transition-all"
            disabled={loading}
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-all"
          >
            <Upload className="w-4 h-4" />
            <span>New Scan</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Scans"
          value={loading ? '—' : totalScans}
          subtext="All uploaded medical images"
          icon={ScanLine}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          loading={loading}
        />
        <StatCard
          title="Pending Analysis"
          value={loading ? '—' : pendingScans}
          subtext={pendingScans === 0 ? 'No scans awaiting analysis' : 'Awaiting AI inference'}
          icon={Loader2}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          loading={loading}
        />
        <StatCard
          title="Flagged for Review"
          value={loading ? '—' : flaggedPredictions}
          subtext={flaggedPredictions === 0 ? 'No flagged cases' : 'Require clinical review'}
          icon={Flag}
          iconBg="bg-red-50"
          iconColor="text-red-600"
          loading={loading}
        />
        <StatCard
          title="AI Engine Status"
          value={loading ? '—' : health ? (health.status === 'ok' ? 'Online' : 'Degraded') : 'Unknown'}
          subtext={loading ? undefined : health ? `Engine: ${health.engine}` : 'Health check failed'}
          icon={Cpu}
          iconBg={loading || !health ? 'bg-slate-50' : health.status === 'ok' ? 'bg-emerald-50' : 'bg-amber-50'}
          iconColor={loading || !health ? 'text-slate-400' : health.status === 'ok' ? 'text-emerald-600' : 'text-amber-600'}
          loading={loading}
        />
      </div>

      {/* Safety banner if there are flagged / low confidence */}
      {!loading && needsAttention.length > 0 && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-all"
          onClick={() => navigate('/review')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/review')}
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {needsAttention.length} case{needsAttention.length > 1 ? 's' : ''} require clinical attention
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {flaggedPredictions} flagged · {lowConfidence} low confidence — Click to review
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-600" />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent scans table */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Recent Scans</h3>
              <p className="text-xs text-slate-500 mt-0.5">Latest uploaded medical images</p>
            </div>
            <button
              onClick={() => navigate('/history')}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <table className="w-full">
              <tbody>
                <TableRowSkeleton cols={5} />
                <TableRowSkeleton cols={5} />
                <TableRowSkeleton cols={5} />
              </tbody>
            </table>
          ) : recentScans.length === 0 ? (
            <EmptyState
              icon={ScanLine}
              title="No scans yet"
              description="Upload your first scan to begin AI-assisted analysis."
              action={
                <button
                  onClick={() => navigate('/upload')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Upload First Scan
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['File', 'Patient ID', 'Uploaded', 'Status', 'Action'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentScans.map((scan) => (
                    <tr
                      key={scan.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/results/${scan.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <ScanLine className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                          <div>
                            <p className="text-sm text-slate-700 font-medium truncate max-w-[140px]">
                              {scan.original_filename}
                            </p>
                            <p className="text-xs text-slate-400">
                              {scan.modality ?? 'Unknown modality'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-slate-500">
                          {scan.anonymized_patient_id ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(scan.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={getScanStatus(scan.status)} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/results/${scan.id}`);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent predictions */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">AI Findings</h3>
              <p className="text-xs text-slate-500 mt-0.5">Latest predictions</p>
            </div>
            <TrendingUp className="w-4 h-4 text-slate-300" />
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : predictions.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No AI results"
              description="Analyze a scan to see AI findings here."
            />
          ) : (
            <div className="divide-y divide-slate-50">
              {[...predictions]
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime()
                )
                .slice(0, 6)
                .map((pred) => (
                  <div
                    key={pred.id}
                    className="px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/results/${pred.scan_id}`)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <FindingBadge predictedClass={pred.predicted_class} />
                      <ConfidenceBadge confidence={pred.confidence} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {pred.scan?.anonymized_patient_id
                        ? `${pred.scan.anonymized_patient_id} · `
                        : ''}
                      {formatDistanceToNow(new Date(pred.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                    {(pred.is_low_confidence || pred.is_high_risk || pred.is_flagged) && (
                      <div className="flex items-center gap-1 mt-1">
                        {pred.is_flagged && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-1 rounded">
                            Flagged
                          </span>
                        )}
                        {pred.is_low_confidence && (
                          <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-100 px-1 rounded">
                            Low confidence
                          </span>
                        )}
                        {pred.is_high_risk && (
                          <span className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-1 rounded">
                            High risk
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Clinical safety notice */}
      <ClinicalSafetyBanner
        variant="info"
        message="AI output is decision-support only and does not constitute a final diagnosis."
        subMessage="All findings must be confirmed by a qualified clinician before any clinical action."
      />
    </div>
  );
}
