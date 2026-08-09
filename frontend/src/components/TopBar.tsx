import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, Cpu, Flag, AlertTriangle, Clock, Inbox, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole, Prediction } from '../types';
import { api } from '../services/api';
import { formatDistanceToNow } from 'date-fns';

const routeLabels: Record<string, { title: string; breadcrumb: string[] }> = {
  '/': { title: 'Overview', breadcrumb: ['Dashboard'] },
  '/upload': { title: 'New Scan', breadcrumb: ['Dashboard', 'New Scan'] },
  '/history': { title: 'Scan History', breadcrumb: ['Dashboard', 'Scan History'] },
  '/patients': { title: 'Patients', breadcrumb: ['Dashboard', 'Patients'] },
  '/review': { title: 'Review Queue', breadcrumb: ['Dashboard', 'Review Queue'] },
  '/audit': { title: 'Audit Logs', breadcrumb: ['Dashboard', 'Audit Logs'] },
  '/settings': { title: 'Settings', breadcrumb: ['Dashboard', 'Settings'] },
};

const roleBadge: Record<UserRole, string> = {
  doctor: 'bg-blue-100 text-blue-700',
  radiologist: 'bg-purple-100 text-purple-700',
  staff: 'bg-slate-100 text-slate-600',
};

const roleLabel: Record<UserRole, string> = {
  doctor: 'Physician',
  radiologist: 'Radiologist',
  staff: 'Clinical Staff',
};

interface TopBarProps {
  onMenuToggle: () => void;
  aiOnline: boolean;
}

export function TopBar({ onMenuToggle, aiOnline }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Prediction[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifReqRef = useRef(0);

  // Match route - check for dynamic routes
  const routeKey = Object.keys(routeLabels).find((key) => {
    if (key === '/') return location.pathname === '/';
    return location.pathname.startsWith(key);
  });
  const routeInfo = routeKey
    ? routeLabels[routeKey]
    : { title: 'MediScan AI', breadcrumb: ['Dashboard'] };

  const initials = user
    ? (user.full_name || user.username)
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  // Load real "needs attention" predictions — once on mount so the badge
  // shows immediately, and again whenever the panel opens.
  const loadNotifications = async () => {
    const reqId = ++notifReqRef.current;
    setNotifLoading(true);
    try {
      const res = await api.getPredictions({ page_size: 100 });
      if (reqId !== notifReqRef.current) return; // stale response
      const attention = res.predictions.filter(
        (p) => p.is_flagged || p.is_low_confidence || p.is_high_risk
      );
      setNotifications(attention);
    } catch {
      if (reqId !== notifReqRef.current) return;
      setNotifications([]);
    } finally {
      if (reqId === notifReqRef.current) setNotifLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (notifOpen) void loadNotifications();
  }, [notifOpen]);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, []);

  const openResult = (scanId: number) => {
    setNotifOpen(false);
    navigate(`/results/${scanId}`);
  };

  const notificationIcon = (p: Prediction) => {
    if (p.is_high_risk)
      return { icon: AlertTriangle, cls: 'bg-red-50 text-red-600' };
    if (p.is_flagged) return { icon: Flag, cls: 'bg-blue-50 text-blue-600' };
    return { icon: AlertTriangle, cls: 'bg-amber-50 text-amber-600' };
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 gap-4 flex-shrink-0">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
        aria-label="Toggle navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb + Title */}
      <div className="flex-1 min-w-0">
        <nav aria-label="Breadcrumb" className="mb-0.5">
          <ol className="flex items-center gap-1.5 text-xs text-slate-400">
            {routeInfo.breadcrumb.map((crumb, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-300">/</span>}
                <span
                  className={
                    i === routeInfo.breadcrumb.length - 1
                      ? 'text-slate-600 font-medium'
                      : ''
                  }
                >
                  {crumb}
                </span>
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="text-base font-semibold text-slate-800 leading-tight truncate">
          {routeInfo.title}
        </h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* AI Status */}
        <div
          className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            aiOnline
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{aiOnline ? 'AI Engine Online' : 'AI Engine Offline'}</span>
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              aiOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
            }`}
          />
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
            aria-label={
              notifications.length > 0
                ? `${notifications.length} cases need attention`
                : 'Notifications'
            }
            aria-expanded={notifOpen}
          >
            <Bell className="w-5 h-5" />
            {!notifLoading && notifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Needs Attention
                </p>
                {!notifLoading && notifications.length > 0 && (
                  <span className="text-xs font-mono font-semibold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">
                    {notifications.length}
                  </span>
                )}
              </div>

              {notifLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                  <Inbox className="w-8 h-8 text-slate-200" />
                  <p className="text-sm font-medium text-slate-600">All clear</p>
                  <p className="text-xs text-slate-400">
                    No flagged, low-confidence, or high-risk cases right now.
                  </p>
                </div>
              ) : (
                <ul className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                  {notifications.slice(0, 8).map((p) => {
                    const { icon: Icon, cls } = notificationIcon(p);
                    return (
                      <li key={p.id}>
                        <button
                          onClick={() => openResult(p.scan_id)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-800 truncate">
                                {p.is_high_risk
                                  ? 'High-risk finding'
                                  : p.is_flagged
                                  ? 'Flagged for review'
                                  : 'Low confidence result'}
                              </p>
                              <span className="text-xs font-mono font-semibold text-slate-500 flex-shrink-0">
                                {Math.round(p.confidence * 100)}%
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {p.scan?.anonymized_patient_id
                                ? `${p.scan.anonymized_patient_id} · `
                                : ''}
                              {p.predicted_class}
                            </p>
                            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                              <Clock className="w-3 h-3" />
                              {formatDistanceToNow(new Date(p.created_at), {
                                addSuffix: true,
                              })}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="border-t border-slate-100">
                <button
                  onClick={() => {
                    setNotifOpen(false);
                    navigate('/review');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  View review queue
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User avatar + role */}
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-slate-700 leading-tight">
              {user?.full_name || user?.username}
            </p>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                roleBadge[user?.role ?? 'staff']
              }`}
            >
              {roleLabel[user?.role ?? 'staff']}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
