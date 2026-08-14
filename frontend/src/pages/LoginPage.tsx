import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Box,
  Card,
  Grid,
  TextField,
  Button,
  Typography,
  Stack,
  IconButton,
  InputAdornment,
  Alert,
  Checkbox,
  FormControlLabel,
  Chip,
  CircularProgress,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import ManageSearchRoundedIcon from '@mui/icons-material/ManageSearchRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import MedicalServicesRoundedIcon from '@mui/icons-material/MedicalServicesRounded';
import LocalHospitalRoundedIcon from '@mui/icons-material/LocalHospitalRounded';
import { ShinyText } from '../components/common/ShinyText';
import { LoginCanvas } from '../components/common/LoginCanvas';
import { TiltCard } from '../components/common/TiltCard';
import { ThreeDMedicalScene } from '../components/common/ThreeDMedicalScene';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { HealthResponse } from '../types';
import { tokens } from '../theme';

const FEATURES = [
  {
    icon: PsychologyRoundedIcon,
    title: 'AI Neural Classifier',
    desc: 'Deep learning diagnostic assistant trained on 100k+ clinical scans',
  },
  {
    icon: ManageSearchRoundedIcon,
    title: 'Grad-CAM Attention',
    desc: 'Interactive visual heatmaps pin-pointing anatomical regions of interest',
  },
  {
    icon: MonitorHeartRoundedIcon,
    title: 'Clinical Safety Protocol',
    desc: 'Mandatory review routing for low-confidence or high-risk cases',
  },
];

const ROLES = [
  { id: 'doctor', title: 'Doctor (Dr. Sarah Chen)', username: 'doctor', roleDesc: 'Chief Physician', icon: LocalHospitalRoundedIcon },
  { id: 'radiologist', title: 'Radiologist (Dr. James Okafor)', username: 'radiologist', roleDesc: 'Imaging Specialist', icon: MedicalServicesRoundedIcon },
  { id: 'staff', title: 'Staff (Maya Patel)', username: 'staff', roleDesc: 'Clinical Assistant', icon: PersonRoundedIcon },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState(() => localStorage.getItem('mediscan_remember_username') ?? 'doctor');
  const [password, setPassword] = useState('DemoPass123!');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem('mediscan_remember_username')));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Real engine metrics from the public /api/v1/health endpoint — never
  // fabricated numbers. When the backend is unreachable, neutral text is
  // shown instead of invented performance claims.
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    api
      .healthCheck()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (!rememberMe) localStorage.removeItem('mediscan_remember_username');
  }, [rememberMe]);

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (rememberMe) localStorage.setItem('mediscan_remember_username', username);
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid credentials. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const quickFillRole = (u: string) => {
    setUsername(u);
    setPassword('DemoPass123!');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: tokens.bgDark, position: 'relative', overflow: 'hidden' }}>
      {/* Interactive Neural Mesh Particle Canvas */}
      <LoginCanvas />

      {/* Ambient background glowing orbs */}
      <Box
        sx={{
          position: 'absolute',
          top: '-15%',
          left: '-10%',
          width: '650px',
          height: '650px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${tokens.cyanDark}33 0%, transparent 70%)`,
          pointerEvents: 'none',
          filter: 'blur(70px)',
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '-15%',
          right: '-10%',
          width: '700px',
          height: '700px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${tokens.cyan}22 0%, transparent 70%)`,
          pointerEvents: 'none',
          filter: 'blur(80px)',
          zIndex: 0,
        }}
      />

      {/* Main Grid Layout */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
        }}
      >
        {/* Left Hero Section */}
        <Box
          sx={{
            display: { xs: 'none', lg: 'flex' },
            flex: 1.2,
            p: 6,
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRight: `1px solid ${tokens.surfaceBorder}`,
            bgcolor: 'rgba(4, 8, 13, 0.65)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Box>
            {/* Header Brand */}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 3 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 3,
                  bgcolor: 'rgba(0, 180, 216, 0.15)',
                  color: tokens.cyan,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${tokens.cyan}`,
                }}
              >
                <PsychologyRoundedIcon fontSize="medium" />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: tokens.textPrimary }}>
                <ShinyText text="MediScan AI" disabled={false} speed={3} className="" />
              </Typography>
            </Stack>

            <Typography variant="h2" sx={{ color: tokens.textPrimary, mb: 1.5, fontWeight: 700 }}>
              Clinical Diagnostic Co-Pilot
            </Typography>
            <Typography variant="body1" sx={{ color: tokens.textSecondary, maxWidth: 520, mb: 3, lineHeight: 1.7 }}>
              Deep learning decision support for radiological imaging. Real-time 3D volumetric analysis & Grad-CAM visual heatmaps.
            </Typography>

            {/* AI Generated MediScan Medical Hologram Showcase */}
            <Box
              sx={{
                my: 2,
                height: 250,
                width: '100%',
                maxWidth: 580,
                borderRadius: 4,
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid rgba(0, 180, 216, 0.3)',
                boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(0, 180, 216, 0.15)',
                background: '#04080D',
              }}
            >
              <Box
                component="img"
                src="/mediscan_hero_ai.png"
                alt="MediScan AI Diagnostic Hologram"
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: 'contrast(105%) brightness(95%)',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  background: 'linear-gradient(180deg, rgba(7,12,18,0) 60%, rgba(7,12,18,0.85) 100%)',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0.45,
                  pointerEvents: 'none',
                }}
              >
                <ThreeDMedicalScene />
              </Box>
            </Box>

            {/* 3D Tilt Feature Showcase Cards */}
            <Stack spacing={2} sx={{ mt: 3, maxWidth: 580 }}>
              {FEATURES.map((f, idx) => {
                const IconComp = f.icon;
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1, duration: 0.5 }}
                  >
                    <TiltCard maxTilt={8} scale={1.02}>
                      <Card
                        sx={{
                          p: 2,
                          bgcolor: 'rgba(13, 21, 32, 0.75)',
                          backdropFilter: 'blur(16px)',
                          border: `1px solid ${tokens.surfaceBorder}`,
                          borderRadius: 3,
                          '&:hover': {
                            borderColor: tokens.cyan,
                          },
                        }}
                      >
                        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              borderRadius: 2.5,
                              bgcolor: 'rgba(0, 180, 216, 0.12)',
                              color: tokens.cyan,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <IconComp fontSize="small" />
                          </Box>
                          <Box>
                            <Typography variant="subtitle2" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
                              {f.title}
                            </Typography>
                            <Typography variant="caption" sx={{ color: tokens.textSecondary }}>
                              {f.desc}
                            </Typography>
                          </Box>
                        </Stack>
                      </Card>
                    </TiltCard>
                  </motion.div>
                );
              })}
            </Stack>
          </Box>

          {/* Live Telemetry Footer — real values from /api/v1/health only */}
          <Stack direction="row" spacing={3} sx={{ justifyContent: 'space-between', alignItems: 'center', pt: 3 }}>
            <Box>
              <Typography variant="caption" sx={{ color: tokens.textSecondary, display: 'block' }}>
                Model Performance
              </Typography>
              <Typography variant="subtitle2" sx={{ color: tokens.confidenceHigh, fontFamily: 'monospace' }}>
                {health?.model_metrics?.auc != null
                  ? `${(health.model_metrics.auc * 100).toFixed(1)}% ROC-AUC (hold-out)`
                  : 'Decision support only'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: tokens.textSecondary, display: 'block' }}>
                Inference Engine
              </Typography>
              <Typography variant="subtitle2" sx={{ color: tokens.cyan, fontFamily: 'monospace' }}>
                {health ? `${health.engine}${health.device ? ' · ' + health.device : ''}` : '—'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: tokens.textSecondary, display: 'block' }}>
                Security Controls
              </Typography>
              <Typography variant="subtitle2" sx={{ color: tokens.textPrimary, fontFamily: 'monospace' }}>
                JWT · RBAC · AES-256
              </Typography>
            </Box>
          </Stack>
        </Box>

        {/* Right Panel — Workstation Sign In */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: { xs: 3, sm: 6 },
          }}
        >
          <TiltCard maxTilt={6} scale={1.01} sx={{ width: '100%', maxWidth: 480 }}>
            <Card
              sx={{
                p: { xs: 3.5, sm: 4.5 },
                borderRadius: 5,
                bgcolor: 'rgba(13, 21, 32, 0.85)',
                backdropFilter: 'blur(24px)',
                border: `1px solid ${tokens.surfaceBorder}`,
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              }}
            >
              <Stack spacing={3}>
                <Box>
                  <Typography variant="h3" sx={{ color: tokens.textPrimary, mb: 0.5, fontWeight: 700 }}>
                    Workstation Sign In
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Select your clinical role or enter credentials.
                  </Typography>
                </Box>

                {/* 1-Click Role Quick Fill Demo Buttons */}
                <Box>
                  <Typography variant="caption" sx={{ color: tokens.textSecondary, fontWeight: 600, mb: 1, display: 'block' }}>
                    HACKATHON DEMO — 1-CLICK ROLE QUICK FILL:
                  </Typography>
                  <Grid container spacing={1}>
                    {ROLES.map((r) => {
                      const RoleIcon = r.icon;
                      const isSelected = username === r.username;
                      return (
                        <Grid key={r.id} size={{ xs: 4 }}>
                          <Button
                            fullWidth
                            size="small"
                            variant={isSelected ? 'contained' : 'outlined'}
                            onClick={() => quickFillRole(r.username)}
                            startIcon={<RoleIcon style={{ fontSize: 16 }} />}
                            sx={{
                              py: 1.2,
                              px: 1,
                              fontSize: '0.72rem',
                              flexDirection: 'column',
                              gap: 0.5,
                              borderColor: tokens.surfaceBorder,
                              color: isSelected ? '#070C12' : tokens.textPrimary,
                              bgcolor: isSelected ? tokens.cyan : 'rgba(7, 12, 18, 0.4)',
                            }}
                          >
                            {r.title.split(' ')[0]}
                          </Button>
                        </Grid>
                      );
                    })}
                  </Grid>
                </Box>

                {error && <Alert severity="error">{error}</Alert>}

                <form onSubmit={handleSubmit}>
                  <Stack spacing={2.5}>
                    <TextField
                      fullWidth
                      label="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <PersonRoundedIcon sx={{ color: tokens.textSecondary }} />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />

                    <TextField
                      fullWidth
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockRoundedIcon sx={{ color: tokens.textSecondary }} />
                            </InputAdornment>
                          ),
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton onClick={() => setShowPassword((s) => !s)} edge="end">
                                {showPassword ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />

                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            size="small"
                            sx={{ color: tokens.cyan }}
                          />
                        }
                        label={<Typography variant="caption" color="text.secondary">Remember workstation</Typography>}
                      />
                      <Chip
                        icon={<ShieldRoundedIcon style={{ fontSize: 14, color: tokens.confidenceHigh }} />}
                        label="256-bit Encrypted"
                        size="small"
                        variant="outlined"
                        sx={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: tokens.confidenceHigh }}
                      />
                    </Stack>

                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={loading}
                      endIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ArrowForwardRoundedIcon />}
                      sx={{
                        py: 1.4,
                        fontSize: '0.95rem',
                        fontWeight: 700,
                      }}
                    >
                      {loading ? 'Authenticating…' : 'Enter Diagnostic Workstation'}
                    </Button>
                  </Stack>
                </form>
              </Stack>
            </Card>
          </TiltCard>
        </Box>
      </Box>
    </Box>
  );
}

export default LoginPage;
