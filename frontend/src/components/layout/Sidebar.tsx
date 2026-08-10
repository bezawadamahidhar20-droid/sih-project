import { NavLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  Divider,
  Tooltip,
  IconButton,
} from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import LocalHospitalRoundedIcon from '@mui/icons-material/LocalHospitalRounded';
import CircleIcon from '@mui/icons-material/Circle';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';

export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_WIDTH_COLLAPSED = 72;

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: <DashboardRoundedIcon /> },
  { label: 'Upload Scan', to: '/upload', icon: <CloudUploadRoundedIcon /> },
  { label: 'Scan History', to: '/history', icon: <HistoryRoundedIcon /> },
  { label: 'Patients', to: '/patients', icon: <GroupRoundedIcon />, roles: ['doctor', 'radiologist'] },
  { label: 'Review Queue', to: '/review', icon: <FlagRoundedIcon />, roles: ['doctor', 'radiologist'] },
  { label: 'Audit Logs', to: '/audit-logs', icon: <FactCheckRoundedIcon />, roles: ['doctor', 'radiologist'] },
  { label: 'Settings', to: '/settings', icon: <SettingsRoundedIcon /> },
];

const roleLabel: Record<UserRole, string> = {
  doctor: 'Doctor',
  radiologist: 'Radiologist',
  staff: 'Staff',
};

export function Sidebar({
  collapsed,
  onToggle,
  aiOnline,
  variant = 'permanent',
  open = true,
  onClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  aiOnline: boolean;
  variant?: 'permanent' | 'temporary';
  open?: boolean;
  onClose?: () => void;
}) {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const width = collapsed && variant === 'permanent' ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH;
  const initials = (user?.full_name || user?.username || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const items = NAV_ITEMS.filter((item) => !item.roles || hasRole(item.roles));

  const content = (
    <Box
      sx={{
        width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#0b2338',
        backgroundImage: 'linear-gradient(180deg, rgba(15,92,140,0.18) 0%, rgba(11,35,56,0) 32%)',
        color: '#cfe0ea',
        transition: 'width .25s',
        overflow: 'hidden',
      }}
    >
      {/* Brand */}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: 'center',
          justifyContent: collapsed && variant === 'permanent' ? 'center' : 'flex-start',
          px: collapsed && variant === 'permanent' ? 1.5 : 2.5,
          py: 2.5,
          minHeight: 72,
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            bgcolor: 'primary.main',
            backgroundImage: 'linear-gradient(135deg, #3d80a8 0%, #0a3f60 100%)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <LocalHospitalRoundedIcon sx={{ color: '#fff', fontSize: 20 }} />
        </Box>
        {!(collapsed && variant === 'permanent') && (
          <Box sx={{ overflow: 'hidden' }}>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2, fontFamily: 'Figtree, sans-serif' }} noWrap>
              MediScan AI
            </Typography>
            <Typography sx={{ color: '#7d93a3', fontSize: 11 }} noWrap>
              Clinical Intelligence
            </Typography>
          </Box>
        )}
      </Stack>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Nav */}
      <List sx={{ flex: 1, px: 1.25, py: 1.5 }}>
        {items.map((item) => (
          <Tooltip
            key={item.to}
            title={collapsed && variant === 'permanent' ? item.label : ''}
            placement="right"
          >
            <ListItemButton
              component={NavLink}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              sx={{
                position: 'relative',
                borderRadius: 2,
                mb: 0.5,
                minHeight: 42,
                justifyContent: collapsed && variant === 'permanent' ? 'center' : 'flex-start',
                color: '#a9bece',
                transition: 'background-color .18s, color .18s',
                // Active indicator bar
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%) scaleY(0)',
                  width: 3,
                  height: 22,
                  borderRadius: '0 3px 3px 0',
                  bgcolor: '#6fb3e0',
                  transition: 'transform .2s',
                },
                '&.active': {
                  bgcolor: 'rgba(61,128,168,0.25)',
                  color: '#fff',
                  '&::before': { transform: 'translateY(-50%) scaleY(1)' },
                  '& .MuiListItemIcon-root': { color: '#6fb3e0' },
                },
                '&:hover': { bgcolor: 'rgba(255,255,255,0.07)', color: '#e6f1f7' },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: collapsed && variant === 'permanent' ? 0 : 1.5,
                  color: 'inherit',
                  justifyContent: 'center',
                  '& svg': { fontSize: 21 },
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!(collapsed && variant === 'permanent') && (
                <Typography
                  variant="body2"
                  sx={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'inherit' }}
                  noWrap
                >
                  {item.label}
                </Typography>
              )}
            </ListItemButton>
          </Tooltip>
        ))}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* AI engine status */}
      <Box sx={{ px: collapsed && variant === 'permanent' ? 1 : 2, py: 1.5 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', justifyContent: collapsed && variant === 'permanent' ? 'center' : 'flex-start' }}
        >
          <Box sx={{ position: 'relative', display: 'flex' }}>
            <CircleIcon sx={{ fontSize: 9, color: aiOnline ? '#3ddc84' : '#e0574b' }} />
            {aiOnline && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: -3,
                  borderRadius: '50%',
                  border: '1.5px solid rgba(61,220,132,0.55)',
                  animation: 'pulse 2s ease-out infinite',
                  '@keyframes pulse': {
                    '0%': { transform: 'scale(0.6)', opacity: 0.9 },
                    '100%': { transform: 'scale(1.6)', opacity: 0 },
                  },
                }}
              />
            )}
          </Box>
          {!(collapsed && variant === 'permanent') && (
            <Typography variant="caption" sx={{ color: '#8fa4b3' }}>
              {aiOnline ? 'AI Engine Online' : 'AI Engine Offline'}
            </Typography>
          )}
        </Stack>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* User */}
      <Box sx={{ p: collapsed && variant === 'permanent' ? 1 : 2 }}>
        <Stack
          direction="row"
          spacing={1.25}
          onClick={() => navigate('/settings')}
          sx={{ alignItems: 'center', justifyContent: collapsed && variant === 'permanent' ? 'center' : 'flex-start', cursor: 'pointer' }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              bgcolor: 'secondary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 12.5,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {initials}
          </Box>
          {!(collapsed && variant === 'permanent') && (
            <Box sx={{ overflow: 'hidden' }}>
              <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }} noWrap>
                {user?.full_name || user?.username}
              </Typography>
              <Typography variant="caption" sx={{ color: '#7d93a3' }} noWrap>
                {roleLabel[user?.role ?? 'staff']}
              </Typography>
            </Box>
          )}
        </Stack>
      </Box>

      {variant === 'permanent' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', pb: 1.5 }}>
          <IconButton size="small" onClick={onToggle} sx={{ color: '#7d93a3', bgcolor: 'rgba(255,255,255,0.05)' }}>
            {collapsed ? <ChevronRightRoundedIcon fontSize="small" /> : <ChevronLeftRoundedIcon fontSize="small" />}
          </IconButton>
        </Box>
      )}
    </Box>
  );

  if (variant === 'temporary') {
    return (
      <Drawer open={open} onClose={onClose} variant="temporary" ModalProps={{ keepMounted: true }}>
        {content}
      </Drawer>
    );
  }

  return (
    <Box
      component="nav"
      sx={{
        width,
        flexShrink: 0,
        transition: 'width .25s',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 1200,
        display: { xs: 'none', md: 'block' },
      }}
    >
      {content}
    </Box>
  );
}
