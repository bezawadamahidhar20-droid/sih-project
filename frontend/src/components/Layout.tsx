import { useState, useEffect, ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { api } from '../services/api';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiOnline, setAiOnline] = useState(false);

  useEffect(() => {
    api
      .healthCheck()
      .then((h) => setAiOnline(h.status === 'ok' || !!h.model_loaded || !!h.engine))
      .catch(() => setAiOnline(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          aiOnline={aiOnline}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="md:hidden">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              aiOnline={aiOnline}
            />
          </div>
        </>
      )}

      {/* Main content area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          collapsed ? 'md:ml-16' : 'md:ml-64'
        }`}
      >
        <TopBar
          onMenuToggle={() => setMobileOpen((o) => !o)}
          aiOnline={aiOnline}
        />
        <main className="flex-1 overflow-auto">
          <div className="p-6 max-w-screen-2xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
