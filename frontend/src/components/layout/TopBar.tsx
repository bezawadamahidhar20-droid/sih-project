import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Box,
  Stack,
  Badge,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  Chip,
} from '@mui/material';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import CircleIcon from '@mui/icons-material/Circle';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { Prediction, UserRole } from '../../types';

const roleLabel: Record<UserRole, string> = {
  doctor: 'Doctor',
  radiologist: 'Radiologist',
  staff: 'Staff',
};

const PAGE_TITLES: { match: RegExp; title: string; subtitle?: string }[] = [
  { match: /^\/$/, title: 'Dashboard', subtitle: 'Diagnostic workspace overview' },
  { match: /^\/upload/, title: 'Upload Scan', subtitle: 'Add a new medical image for AI analysis' },
  { match: /^\/results/, title: 'Diagnostic Result', subtitle: 'AI prediction & Grad-CAM explainability' },
  { match: /^\/history/, title: 'Scan History', subtitle: 'All uploaded scans and predictions' },
  { match: /^\/patients\/.+/, title: 'Patient History', subtitle: 'Longitudinal prediction trend' },
  { match: /^\/patients/, title: 'Patients', subtitle: 'Browse patients with recorded scans' },
  { match: /^\/review/, title: 'Review Queue', subtitle: 'Flagged, low-confidence & high-risk cases' },
  { match: /^\/audit-logs/, title: 'Audit Logs', subtitle: 'Structured activity log (no PHI)' },
  { match: /^\/settings/, title: 'Settings', subtitle: 'Account, security & system status' },
];

export function TopBar({
  onMenuToggle,
  aiOnline,
  pathname,
}: {
  onMenuToggle: () => void;
  aiOnline: boolean;
  pathname: string;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifEl, setNotifEl] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<Prediction[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);

  const page = useMemo(
    () => PAGE_TITLES.find((p) => p.match.test(pathname)) ?? { title: 'MediScan AI', subtitle: '' },
    [pathname]
  );

  useEffect(() => {
    let active = true;
    setNotifLoading(true);
    api
      .getPredictions({ page_size: 100 })
      .then((res) => {
        if (!active) return;
        setNotifications(res.predictions.filter((p) => p.is_flagged || p.is_low_confidence || p.is_high_risk).slice(0, 6));
      })
      .catch(() => {})
      .finally(() => active && setNotifLoading(false));
    return () => {
      active = false;
    };
  }, [pathname]);

  const initials = (user?.full_name || user?.username || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <AppBar
      position="sticky"
      color="inherit"
      sx={{
        bgcolor: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid rgba(255,255,255,0.45)',
        '@media (prefers-reduced-transparency: reduce)': {
          bgcolor: '#ffffff',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          borderBottom: '1px solid',
          borderBottomColor: 'divider',
        },
      }}
    >
      <Toolbar sx={{ gap: 1.5, minHeight: '72px !important' }}>
        <IconButton onClick={onMenuToggle} sx={{ display: { md: 'none' } }}>
          <MenuRoundedIcon />
        </IconButton>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h4" noWrap>
            {page.title}
          </Typography>
          {page.subtitle && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' }, mt: 0.25 }}>
              {page.subtitle}
            </Typography>
          )}
        </Box>

        <Chip
          size="small"
          icon={<CircleIcon sx={{ fontSize: '9px !important', color: aiOnline ? 'success.main' : 'error.main' }} />}
          label={aiOnline ? 'AI Engine Online' : 'AI Engine Offline'}
          variant="outlined"
          sx={{ display: { xs: 'none', md: 'flex' } }}
        />

        <IconButton onClick={(e) => setNotifEl(e.currentTarget)} aria-label="Notifications">
          <motion.span
            key={notifLoading ? 0 : notifications.length}
            initial={{ scale: 0.85 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
            style={{ display: 'inline-flex' }}
          >
            <Badge badgeContent={notifLoading ? 0 : notifications.length} color="error">
              <NotificationsRoundedIcon />
            </Badge>
          </motion.span>
        </IconButton>
        <Menu anchorEl={notifEl} open={!!notifEl} onClose={() => setNotifEl(null)} slotProps={{ paper: { sx: { width: 360, mt: 1 } } }}>
          <Stack direction="row" sx={{ px: 2, py: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">Needs Attention</Typography>
            {!notifLoading && notifications.length > 0 && (
              <Chip size="small" color="error" variant="outlined" label={`${notifications.length}`} sx={{ height: 20, minWidth: 20 }} />
            )}
          </Stack>
          <Divider />
          {notifLoading ? (
            <MenuItem disabled>Loading…</MenuItem>
          ) : notifications.length === 0 ? (
            <Box sx={{ px: 3, py: 3, textAlign: 'center' }}>
              <CheckCircleRoundedIcon sx={{ color: 'success.main', fontSize: 28, mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                All clear — no flagged or low-confidence cases
              </Typography>
            </Box>
          ) : (
            notifications.map((n, idx) => (
              <Box key={n.id}>
                {idx > 0 && <Divider />}
                <MenuItem
                  onClick={() => {
                    setNotifEl(null);
                    navigate(`/results/${n.scan_id}`);
                  }}
                  sx={{ whiteSpace: 'normal', alignItems: 'flex-start', mx: 1, my: 0.5 }}
                >
                  <ListItemIcon sx={{ mt: 0.25 }}>
                    {n.is_flagged ? (
                      <FlagRoundedIcon fontSize="small" color="info" />
                    ) : (
                      <WarningAmberRoundedIcon fontSize="small" color="warning" />
                    )}
                  </ListItemIcon>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {n.predicted_class} · {Math.round(n.confidence * 100)}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {n.scan?.anonymized_patient_id ?? 'Unknown patient'}
                    </Typography>
                  </Box>
                </MenuItem>
              </Box>
            ))
          )}
        </Menu>

        <Stack
          direction="row"
          spacing={1}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ cursor: 'pointer', pl: 0.5, alignItems: 'center' }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {initials}
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {user?.full_name || user?.username}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {roleLabel[user?.role ?? 'staff']}
            </Typography>
          </Box>
        </Stack>
        <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)} slotProps={{ paper: { sx: { mt: 1, minWidth: 200 } } }}>
          <MenuItem onClick={() => { setAnchorEl(null); navigate('/settings'); }}>
            <ListItemIcon><PersonRoundedIcon fontSize="small" /></ListItemIcon>
            My Account
          </MenuItem>
          <MenuItem onClick={() => { setAnchorEl(null); navigate('/settings'); }}>
            <ListItemIcon><SettingsRoundedIcon fontSize="small" /></ListItemIcon>
            Settings
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              logout();
              navigate('/login');
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon><LogoutRoundedIcon fontSize="small" color="error" /></ListItemIcon>
            Sign out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
