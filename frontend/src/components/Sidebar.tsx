import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  History,
  Users,
  Flag,
  ClipboardList,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
  badge?: number;
}

const navItems: NavItem[] = [
  {
    path: '/',
    label: 'Overview',
    icon: LayoutDashboard,
    roles: ['doctor', 'radiologist', 'staff'],
  },
  {
    path: '/upload',
    label: 'New Scan',
    icon: Upload,
    roles: ['doctor', 'radiologist', 'staff'],
  },
  {
    path: '/history',
    label: 'Scan History',
    icon: History,
    roles: ['doctor', 'radiologist'],
  },
  {
    path: '/patients',
    label: 'Patients',
    icon: Users,
    roles: ['doctor', 'radiologist'],
  },
  {
    path: '/review',
    label: 'Review Queue',
    icon: Flag,
    roles: ['doctor', 'radiologist'],
  },
  {
    path: '/audit',
    label: 'Audit Logs',
    icon: ClipboardList,
    roles: ['doctor', 'radiologist'],
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    roles: ['doctor', 'radiologist', 'staff'],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  aiOnline: boolean;
}

const roleLabel: Record<UserRole, string> = {
  doctor: 'Physician',
  radiologist: 'Radiologist',
  staff: 'Clinical Staff',
};

const roleBgClass: Record<UserRole, string> = {
  doctor: 'bg-blue-100 text-blue-700',
  radiologist: 'bg-purple-100 text-purple-700',
  staff: 'bg-slate-100 text-slate-600',
};

export function Sidebar({ collapsed, onToggle, aiOnline }: SidebarProps) {
  const { user, hasRole, logout } = useAuth();
  const navigate = useNavigate();

  const visibleNavItems = navItems.filter((item) => hasRole(item.roles));

  const initials = user
    ? (user.full_name || user.username)
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo area */}
      <div
        className={`flex items-center h-16 border-b border-slate-200 px-4 flex-shrink-0 ${
          collapsed ? 'justify-center' : 'gap-3'
        }`}
      >
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Stethoscope className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-slate-800 leading-tight">
              MediScan AI
            </p>
            <p className="text-[10px] text-slate-500 leading-tight whitespace-nowrap">
              Clinical Intelligence Platform
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-0.5 px-2">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                    }`
                  }
                  title={collapsed ? item.label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`w-5 h-5 flex-shrink-0 transition-colors ${
                          isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                      {!collapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                      {collapsed && (
                        <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                          {item.label}
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-600 rounded-r" />
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* System status */}
      <div className="border-t border-slate-200 px-4 py-3 flex-shrink-0">
        {collapsed ? (
          <div
            className={`w-2 h-2 rounded-full mx-auto ${
              aiOnline ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            title={aiOnline ? 'AI Engine Online' : 'AI Engine Offline'}
          />
        ) : (
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                aiOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="text-xs text-slate-500">
              {aiOnline ? 'AI Engine Online' : 'AI Engine Offline'}
            </span>
          </div>
        )}
      </div>

      {/* User section */}
      <div className="border-t border-slate-200 p-3 flex-shrink-0">
        {collapsed ? (
          <div className="flex justify-center">
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              title={`${user?.full_name || user?.username} — Click to sign out`}
            >
              {initials}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-slate-800 truncate leading-tight">
                {user?.full_name || user?.username}
              </p>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  roleBgClass[user?.role ?? 'staff']
                }`}
              >
                {roleLabel[user?.role ?? 'staff']}
              </span>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all flex-shrink-0"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all z-10"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5" />
        )}
      </button>
    </aside>
  );
}
