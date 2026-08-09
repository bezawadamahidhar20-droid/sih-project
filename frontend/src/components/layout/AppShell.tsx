import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { Sidebar, SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from './Sidebar';
import { TopBar } from './TopBar';
import { api } from '../../services/api';

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiOnline, setAiOnline] = useState(false);
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
        <Box component="main" sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, width: '100%', mx: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
