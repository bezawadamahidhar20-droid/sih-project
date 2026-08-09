import { useEffect, useState } from 'react';
import {
  User,
  Mail,
  Shield,
  Lock,
  Cpu,
  CheckCircle,
  RefreshCw,
  Save,
  LogOut,
  AlertTriangle,
  Server,
  Fingerprint,
  Eye,
  ClipboardList,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { HealthResponse } from '../types';

type TabKey = 'account' | 'security' | 'ai-config' | 'system';

export function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const [tab, setTab] = useState<TabKey>('account');
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [profileMsg, setProfileMsg] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');

  useEffect(() => {
    setFullName(user?.full_name ?? '');
    setEmail(user?.email ?? '');
  }, [user]);

  const fetchHealth = async () => {
    setHealthLoading(true);
    setHealthError('');
    try {
      const h = await api.healthCheck();
      setHealth(h);
    } catch (err: any) {
      setHealthError(err.response?.data?.detail || 'Backend health check failed.');
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProfileMsg(null);
    try {
      await api.updateMe({ full_name: fullName, email });
      await refreshUser();
      setProfileMsg({ kind: 'success', text: 'Profile updated successfully.' });
    } catch (err: any) {
      setProfileMsg({
        kind: 'error',
        text: err.response?.data?.detail || 'Could not update profile.',
      });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { key: 'account' as TabKey, label: 'Account', icon: User },
    { key: 'security' as TabKey, label: 'Security & Privacy', icon: Shield },
    { key: 'ai-config' as TabKey, label: 'AI Configuration', icon: Cpu },
    { key: 'system' as TabKey, label: 'System Status', icon: Server },
  ];

  const initials = user
    ? (user.full_name || user.username)
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Settings</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Account, security, and system configuration
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Tab sidebar */}
        <div className="md:w-48 flex-shrink-0">
          <nav className="space-y-0.5">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                    tab === t.key
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${tab === t.key ? 'text-blue-600' : 'text-slate-400'}`} />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Account tab */}
          {tab === 'account' && (
            <>
              {/* Profile card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-700">
                    {initials}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-slate-800">
                      {user?.full_name || user?.username}
                    </p>
                    <p className="text-sm text-slate-500">{user?.email}</p>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded mt-1 inline-block ${
                        user?.role === 'doctor'
                          ? 'bg-blue-100 text-blue-700'
                          : user?.role === 'radiologist'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {user?.role}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">
                      Full name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        placeholder="Your full name"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>

                  {profileMsg && (
                    <div
                      className={`flex items-center gap-2 rounded-lg px-4 py-3 border text-sm ${
                        profileMsg.kind === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}
                    >
                      {profileMsg.kind === 'success' ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <AlertTriangle className="w-4 h-4" />
                      )}
                      {profileMsg.text}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        window.location.href = '/login';
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-all"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          {/* Security tab */}
          {tab === 'security' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">
                Security & Privacy
              </h3>
              <div className="space-y-4">
                {[
                  {
                    icon: Shield,
                    title: 'PHI Anonymization',
                    description:
                      'DICOM metadata (patient name, ID, age, institution) is stripped before any processing or logging. Real patient identity is never stored.',
                    status: 'Active',
                    statusColor: 'emerald',
                  },
                  {
                    icon: Lock,
                    title: 'Encryption at Rest',
                    description:
                      'Uploaded scans are encrypted with AES-256 (Fernet) before storage. Decryption happens only in memory during inference.',
                    status: 'Active',
                    statusColor: 'emerald',
                  },
                  {
                    icon: Fingerprint,
                    title: 'Role-Based Access Control',
                    description:
                      'Doctors and radiologists have full diagnostic access. Staff can only upload and view their own scans.',
                    status: 'Active',
                    statusColor: 'emerald',
                  },
                  {
                    icon: Eye,
                    title: 'Clinical Confidence Thresholds',
                    description:
                      'Predictions below 70% confidence are automatically flagged for manual review instead of being shown silently.',
                    status: '70% threshold',
                    statusColor: 'blue',
                  },
                  {
                    icon: ClipboardList,
                    title: 'Structured Audit Logging',
                    description:
                      'Every prediction, upload, and flag is logged with anonymized identifiers for audit and clinical validation.',
                    status: 'Active',
                    statusColor: 'emerald',
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="flex items-start gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50"
                    >
                      <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-slate-800">
                            {item.title}
                          </p>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold bg-${item.statusColor}-50 text-${item.statusColor}-700 border border-${item.statusColor}-200`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 p-4 rounded-lg border border-amber-100 bg-amber-50">
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">Clinical notice:</span> AI output
                  is decision-support only and is not a final diagnosis. All findings
                  must be confirmed by a qualified clinician. In production, this
                  system is designed to run behind HTTPS/TLS with a HIPAA-aligned
                  infrastructure review.
                </p>
              </div>
            </div>
          )}

          {/* AI Config tab */}
          {tab === 'ai-config' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-800">
                  AI Engine Configuration
                </h3>
                <button
                  onClick={fetchHealth}
                  disabled={healthLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {healthError && (
                <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-4">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{healthError}</p>
                </div>
              )}

              {healthLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : health ? (
                <div className="space-y-3">
                  {[
                    {
                      label: 'Service status',
                      value: health.status,
                      highlight: health.status === 'ok' ? 'emerald' : 'red',
                    },
                    {
                      label: 'Inference engine',
                      value: health.engine,
                      mono: true,
                    },
                    {
                      label: 'Trained model',
                      value: health.model_loaded
                        ? 'Loaded (CNN active)'
                        : 'Not loaded (baseline heuristic active)',
                      highlight: health.model_loaded ? 'emerald' : 'amber',
                    },
                    {
                      label: 'Compute device',
                      value: health.device,
                      mono: true,
                    },
                    {
                      label: 'API version',
                      value: health.version,
                      mono: true,
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0"
                    >
                      <p className="text-sm text-slate-500">{row.label}</p>
                      <span
                        className={`text-sm font-medium ${
                          row.mono ? 'font-mono text-slate-700' : ''
                        } ${
                          row.highlight === 'emerald'
                            ? 'text-emerald-700'
                            : row.highlight === 'amber'
                            ? 'text-amber-700'
                            : row.highlight === 'red'
                            ? 'text-red-700'
                            : 'text-slate-700'
                        }`}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 p-4 rounded-lg border border-blue-100 bg-blue-50">
                <p className="text-xs text-blue-700">
                  The AI uses a trained CNN when a model state dict is present at
                  <code className="mx-1 font-mono">MODEL_PATH</code>, and falls back to a
                  deterministic baseline heuristic otherwise. The{' '}
                  <code className="font-mono">/api/v1/health</code> endpoint reports the
                  current engine status.
                </p>
              </div>
            </div>
          )}

          {/* System Status tab */}
          {tab === 'system' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-800">
                  System Status
                </h3>
                <button
                  onClick={fetchHealth}
                  disabled={healthLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="space-y-3">
                {[
                  {
                    label: 'API Backend',
                    status: health ? 'Online' : healthError ? 'Offline' : 'Checking…',
                    ok: !!health && !healthError,
                  },
                  {
                    label: 'AI Engine',
                    status: health
                      ? `${health.engine} (${health.status})`
                      : healthError
                      ? 'Unavailable'
                      : 'Checking…',
                    ok: health?.status === 'ok',
                  },
                  {
                    label: 'Model loaded',
                    status: health
                      ? health.model_loaded
                        ? 'Yes — CNN active'
                        : 'No — baseline heuristic'
                      : '—',
                    ok: health?.model_loaded ?? false,
                  },
                  {
                    label: 'Authentication',
                    status: 'JWT + refresh tokens',
                    ok: true,
                  },
                  {
                    label: 'Encryption',
                    status: 'AES-256 (Fernet) at rest',
                    ok: true,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between py-3 px-4 rounded-lg border border-slate-100 bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          healthLoading
                            ? 'bg-slate-300 animate-pulse'
                            : row.ok
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'
                        }`}
                      />
                      <p className="text-sm text-slate-600">{row.label}</p>
                    </div>
                    <p className="text-sm font-medium text-slate-700 text-right">
                      {row.status}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
