import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { Sidebar, SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from './Sidebar';
import { TopBar } from './TopBar';
import { AICopilotDrawer } from '../common/AICopilotDrawer';
import { api } from '../../services/api';
import { tokens } from '../../theme';

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiOnline, setAiOnline] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api
      .healthCheck()
      .then((h) => setAiOnline(h.status === 'ok' || !!h.model_loaded || !!h.engine))
      .catch(() => setAiOnline(false));
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const check = () => setDemoMode(api.isDemoMode());
    check();
    const id = window.setInterval(check, 5000);
    return () => window.clearInterval(id);
  }, []);

  // Listen for Ctrl+K hotkey to trigger AI Co-Pilot drawer anywhere in app
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCopilotOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: tokens.bgDark, position: 'relative', overflow: 'hidden' }}>
      {/* Refined ambient background lighting */}
      <Box
        sx={{
          position: 'fixed',
          top: '-20%',
          right: '-10%',
          width: 700,
          height: 700,
          borderRadius: '50%',
          pointerEvents: 'none',
          background: `radial-gradient(circle, ${tokens.cyanDark}18 0%, transparent 70%)`,
          filter: 'blur(70px)',
          zIndex: 0,
        }}
      />

      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} aiOnline={aiOnline} />
      <Sidebar
        collapsed={false}
        onToggle={() => {}}
        aiOnline={aiOnline}
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          ml: { xs: 0, md: `${width}px` },
          transition: 'margin-left .25s',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <TopBar
          onMenuToggle={() => setMobileOpen((o) => !o)}
          aiOnline={aiOnline}
          pathname={location.pathname}
          onOpenCopilot={() => setCopilotOpen(true)}
        />
        {demoMode && (
          <Box
            role="alert"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.25,
              px: 2,
              py: 1,
              bgcolor: 'rgba(245, 158, 11, 0.12)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <WarningAmberRoundedIcon sx={{ fontSize: 17, flexShrink: 0, color: tokens.confidenceLow }} />
            <Typography variant="body2" sx={{ fontWeight: 700, textAlign: 'center', color: tokens.confidenceLow }}>
              DEMO MODE — backend unreachable. Showing simulated data. All results are fabricated
              and must NOT be used for any clinical decision.
            </Typography>
          </Box>
        )}
        <Box
          component="main"
          sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, width: '100%', mx: 'auto' }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', bounce: 0, duration: 0.38 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </Box>
      </Box>

      {/* Global AI Clinical Co-Pilot Drawer */}
      <AICopilotDrawer open={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </Box>
  );
}

export default AppShell;
