import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Box,
  Divider,
  Menu,
  MenuItem,
  Avatar,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  DashboardOutlined,
  UploadOutlined,
  HistoryOutlined,
  SettingsOutlined,
  LogoutOutlined,
  MenuOutlined,
  ChevronLeftOutlined,
  MedicalInformationOutlined,
  ShieldOutlined,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

const drawerWidth = 250;

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[];
}

const navigationItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <DashboardOutlined />, roles: ['doctor', 'radiologist', 'staff'] },
  { path: '/upload', label: 'Upload Scan', icon: <UploadOutlined />, roles: ['doctor', 'radiologist', 'staff'] },
  { path: '/history', label: 'History', icon: <HistoryOutlined />, roles: ['doctor', 'radiologist'] },
  { path: '/settings', label: 'Settings', icon: <SettingsOutlined />, roles: ['doctor', 'radiologist', 'staff'] },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { user, hasRole, logout } = useAuth();
  const navigate = useNavigate();

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleProfileMenuClose = () => setAnchorEl(null);
  const handleLogout = () => {
    logout();
    handleProfileMenuClose();
    navigate('/login');
  };

  const filteredNavItems = navigationItems.filter((item) => hasRole(item.roles));

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ gap: 1.25 }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: 1,
            border: '1px solid #DCE1E7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'primary.main',
          }}
        >
          <MedicalInformationOutlined sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            MediScan AI
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2, display: 'block' }}>
            Diagnostic workstation
          </Typography>
        </Box>
        <IconButton onClick={handleDrawerToggle} sx={{ display: isMobile ? 'flex' : 'none' }} aria-label="Close menu">
          <ChevronLeftOutlined />
        </IconButton>
      </Toolbar>
      <Divider />
      <List sx={{ flex: 1, px: 1.25, py: 1.25 }}>
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            style={{ textDecoration: 'none' }}
          >
            {({ isActive }) => (
              <ListItem
                button
                sx={{
                  borderRadius: 0.5,
                  mb: 0.5,
                  px: 1.5,
                  backgroundColor: isActive ? '#EAF2FA' : 'transparent',
                  color: isActive ? 'primary.main' : 'text.secondary',
                  fontWeight: isActive ? 600 : 500,
                  '&:hover': { backgroundColor: isActive ? '#EAF2FA' : '#F4F6F8' },
                  borderLeft: isActive ? '3px solid #12507E' : '3px solid transparent',
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: isActive ? 'primary.main' : 'text.secondary' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: isActive ? 600 : 500 }}
                />
              </ListItem>
            )}
          </NavLink>
        ))}
      </List>
      <Divider />
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ShieldOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary">
          Version 1.0.0 · HIPAA-aligned design
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="inherit"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          backgroundColor: 'background.paper',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
            aria-label="open menu"
          >
            <MenuOutlined />
          </IconButton>
          <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
            {user ? `Signed in as ${user.full_name || user.username} · ${user.role}` : ''}
          </Typography>
          <Tooltip title={`${user?.full_name || user?.username} (${user?.role})`}>
            <IconButton onClick={handleProfileMenuOpen} sx={{ ml: 1 }} aria-label="Account menu">
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
                {user?.full_name?.[0] || user?.username?.[0] || 'U'}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }} aria-label="main navigation">
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          width: { md: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        <Box sx={{ flexGrow: 1, p: 3, backgroundColor: 'background.default' }}>{children}</Box>
        <Box
          sx={{
            px: 3,
            py: 1.25,
            borderTop: '1px solid #DCE1E7',
            backgroundColor: 'background.paper',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <ShieldOutlined sx={{ fontSize: 15, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            AI output is decision-support only and is not a final diagnosis. Findings must be confirmed by a qualified clinician.
          </Typography>
        </Box>
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem
          onClick={() => {
            handleProfileMenuClose();
            navigate('/settings');
          }}
        >
          <ListItemIcon><SettingsOutlined fontSize="small" /></ListItemIcon>
          Settings
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogoutOutlined fontSize="small" color="error" /></ListItemIcon>
          <Typography color="error">Logout</Typography>
        </MenuItem>
      </Menu>
    </Box>
  );
}
