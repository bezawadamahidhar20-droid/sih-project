import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { Sidebar, SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from './Sidebar';
import { TopBar } from './TopBar';
import { api } from '../../services/api';

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiOnline, setAiOnline] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
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

  // Demo mode can switch on mid-session (e.g. backend drops mid-use), so poll
  // rather than reading a one-time snapshot. The banner must be unmissable:
  // all data shown while demo mode is active is simulated.
  useEffect(() => {
    const check = () => setDemoMode(api.isDemoMode());
    check();
    const id = window.setInterval(check, 5000);
    return () => window.clearInterval(id);
  }, []);

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
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
        }}
      >
        <TopBar onMenuToggle={() => setMobileOpen((o) => !o)} aiOnline={aiOnline} pathname={location.pathname} />
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
              bgcolor: 'warning.main',
              color: 'warning.contrastText',
            }}
          >
            <WarningAmberRoundedIcon sx={{ fontSize: 18, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ fontWeight: 700, textAlign: 'center' }}>
              DEMO MODE — backend unreachable. Showing simulated data. All results are fabricated
              and must NOT be used for any clinical decision.
            </Typography>
          </Box>
        )}
        <Box
          component="main"
          sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, width: '100%', mx: 'auto' }}
        >
          {/* Critically-damped spring page transition (damping 1.0, no bounce).
              popLayout mounts the next page immediately and floats the exiting
              one out — no blank gap while waiting for exit. */}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', bounce: 0, duration: 0.38 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </Box>
      </Box>
    </Box>
  );
}
