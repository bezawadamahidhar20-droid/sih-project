import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Stethoscope,
  Shield,
  Lock,
  User,
  AlertCircle,
  Loader2,
  CheckCircle,
  Activity,
  Brain,
  FileSearch,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState(
    () => localStorage.getItem('mediscan_remember_username') ?? ''
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () => Boolean(localStorage.getItem('mediscan_remember_username'))
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rememberMe) localStorage.removeItem('mediscan_remember_username');
  }, [rememberMe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (rememberMe) {
        localStorage.setItem('mediscan_remember_username', username);
      }
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(
        err.response?.data?.detail || 'Invalid username or password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-slate-900 p-12">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">MediScan AI</p>
            <p className="text-slate-400 text-xs">Clinical Intelligence Platform</p>
          </div>
        </div>

        {/* Center content */}
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/20 border border-blue-500/30">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-blue-300 text-xs font-medium">AI-Assisted Diagnostics</span>
            </div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              Clinical-grade AI for medical imaging
            </h1>
            <p className="text-slate-400 text-base leading-relaxed max-w-md">
              Upload chest X-rays and CT scans. Receive AI-powered diagnostic
              support with Grad-CAM explainability, confidence scoring, and
              clinical review workflows.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="grid gap-4">
            {[
              {
                icon: Brain,
                title: 'AI-Powered Analysis',
                desc: 'Deep learning classifier with Grad-CAM heatmap visualization',
              },
              {
                icon: FileSearch,
                title: 'Full Explainability',
                desc: 'See exactly where the model focused its attention',
              },
              {
                icon: Activity,
                title: 'Clinical Safety UX',
                desc: 'Low-confidence results flagged for mandatory review',
              },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-4.5 h-4.5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">
                      {feature.title}
                    </p>
                    <p className="text-slate-400 text-xs mt-0.5">{feature.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Security footer */}
        <div className="space-y-3">
          <div className="h-px bg-slate-800" />
          <div className="flex items-center gap-6">
            {[
              { icon: Shield, text: 'Secure clinical access' },
              { icon: Lock, text: 'Role-based access control' },
              { icon: CheckCircle, text: 'Protected diagnostic data' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.text} className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-slate-500 text-xs">{item.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 bg-slate-50">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-slate-800 font-bold text-lg leading-tight">MediScan AI</p>
            <p className="text-slate-500 text-xs">Clinical Intelligence Platform</p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800">Sign in</h2>
            <p className="text-slate-500 text-sm mt-1">
              Access your clinical diagnostic workspace
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="text-sm font-medium text-slate-700"
              >
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
              />
              <label
                htmlFor="remember"
                className="text-sm text-slate-600"
              >
                Remember my username on this device
              </label>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in to MediScan AI'
              )}
            </button>
          </form>

          {/* Demo note */}
          <div className="mt-6 p-4 rounded-lg border border-slate-200 bg-white">
            <p className="text-xs text-slate-500 font-medium mb-2">
              Demo accounts (development environment):
            </p>
            <div className="space-y-1">
              {[
                { user: 'doctor', role: 'Full access' },
                { user: 'radiologist', role: 'Full access' },
                { user: 'staff', role: 'Upload + own scans' },
              ].map((d) => (
                <div key={d.user} className="flex items-center justify-between">
                  <code className="text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                    {d.user}
                  </code>
                  <span className="text-xs text-slate-400">{d.role}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Password: <code className="text-slate-500 font-mono">DemoPass123!</code>
            </p>
          </div>

          {/* Security note */}
          <p className="mt-4 text-center text-xs text-slate-400">
            AI output is decision-support only — not a final clinical diagnosis.
          </p>
        </div>
      </div>
    </div>
  );
}
