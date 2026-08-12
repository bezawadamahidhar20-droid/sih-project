import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Box,
  Paper,
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
import LocalHospitalRoundedIcon from '@mui/icons-material/LocalHospitalRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import VerifiedUserRoundedIcon from '@mui/icons-material/VerifiedUserRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import ManageSearchRoundedIcon from '@mui/icons-material/ManageSearchRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import SparklesRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import { ShinyText } from '../components/common/ShinyText';
import { LoginCanvas } from '../components/common/LoginCanvas';
import { TiltCard } from '../components/common/TiltCard';
import { useAuth } from '../context/AuthContext';

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
  { id: 'doctor', title: 'Doctor', roleDesc: 'Chief Physician' },
  { id: 'radiologist', title: 'Radiologist', roleDesc: 'Imaging Specialist' },
  { id: 'staff', title: 'Staff', roleDesc: 'Clinical Assistant' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState(() => localStorage.getItem('mediscan_remember_username') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem('mediscan_remember_username')));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      setError(err.response?.data?.detail || 'Invalid username or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (u: string) => {
    setUsername(u);
    setPassword('DemoPass123!');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#040d14', position: 'relative', overflow: 'hidden' }}>
      {/* Interactive Neural Mesh Particle Canvas */}
      <LoginCanvas />

      {/* Ambient background glowing orbs */}
      <Box
        className="animate-glow-1"
        sx={{
          position: 'absolute',
          top: '-15%',
          left: '-10%',
          width: '650px',
          height: '650px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(15, 92, 140, 0.45) 0%, rgba(15, 92, 140, 0) 70%)',
          pointerEvents: 'none',
          filter: 'blur(60px)',
          zIndex: 0,
        }}
      />
      <Box
        className="animate-glow-2"
        sx={{
          position: 'absolute',
          bottom: '-15%',
          right: '-10%',
          width: '700px',
          height: '700px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(15, 156, 143, 0.35) 0%, rgba(15, 156, 143, 0) 70%)',
          pointerEvents: 'none',
          filter: 'blur(70px)',
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
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '52%',
            p: 7,
            position: 'relative',
          }}
        >
          {/* Brand Logo Header */}
          <motion.div
            initial={{ opacity: 0, y: -25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: 3,
                  bgcolor: 'primary.main',
                  backgroundImage: 'linear-gradient(135deg, #3d80a8 0%, #0a3f60 100%)',
                  boxShadow: '0 8px 30px rgba(15, 92, 140, 0.5), inset 0 1px 1px rgba(255,255,255,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                }}
              >
                <LocalHospitalRoundedIcon sx={{ color: '#fff', fontSize: 30 }} />
              </Box>
              <Box>
                <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 22, lineHeight: 1.2, letterSpacing: '-0.03em', fontFamily: 'Figtree, sans-serif' }}>
                  MediScan AI
                </Typography>
                <Typography sx={{ color: '#8fa8be', fontSize: 13, fontWeight: 500 }}>
                  Clinical Diagnostic Support System
                </Typography>
              </Box>
            </Stack>
          </motion.div>

          {/* Hero Content with 3D Tilt Cards */}
          <Stack spacing={4} sx={{ my: 'auto', py: 4 }}>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.7, delay: 0.1 }}
            >
              <Stack spacing={2.5}>
                <Chip
                  icon={<SparklesRoundedIcon sx={{ fontSize: '16px !important', color: '#6fb3e0' }} />}
                  label="Next-Gen Medical AI Diagnostics"
                  sx={{
                    alignSelf: 'flex-start',
                    bgcolor: 'rgba(61,128,168,0.25)',
                    color: '#9ecdf0',
                    border: '1px solid rgba(111,179,224,0.4)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    px: 1,
                    py: 0.5,
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 0 20px rgba(111, 179, 224, 0.2)',
                  }}
                />
                <Typography
                  sx={{
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 42,
                    lineHeight: 1.15,
                    fontFamily: 'Figtree, sans-serif',
                    letterSpacing: '-0.03em',
                  }}
                >
                  <ShinyText text="Clinical-grade AI for medical imaging" speed={4} color="#d5e4ee" shineColor="#ffffff" pauseOnHover />
                </Typography>
                <Typography sx={{ color: '#94abbf', fontSize: 16.5, maxWidth: 480, lineHeight: 1.7 }}>
                  Upload chest X-rays and CT scans. Receive real-time diagnostic support with Grad-CAM explainability, confidence scoring, and review workflows.
                </Typography>
              </Stack>
            </motion.div>

            {/* 3D Interactive Feature Cards */}
            <Stack spacing={2}>
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', bounce: 0.1, duration: 0.6, delay: 0.2 + i * 0.1 }}
                >
                  <TiltCard maxTilt={8} scale={1.02}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2.5,
                        borderRadius: 3.5,
                        bgcolor: 'rgba(11, 35, 56, 0.65)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          bgcolor: 'rgba(15, 50, 80, 0.8)',
                          borderColor: 'rgba(111, 179, 224, 0.45)',
                          boxShadow: '0 14px 40px rgba(15, 92, 140, 0.35)',
                        },
                      }}
                    >
                      <Stack direction="row" spacing={2.25} sx={{ alignItems: 'center' }}>
                        <Box
                          sx={{
                            width: 46,
                            height: 46,
                            borderRadius: 3,
                            bgcolor: 'rgba(61,128,168,0.3)',
                            border: '1px solid rgba(111,179,224,0.4)',
                            boxShadow: '0 4px 14px rgba(15,92,140,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <f.icon sx={{ fontSize: 24, color: '#8fc4e6' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 15.5 }}>{f.title}</Typography>
                          <Typography sx={{ color: '#8aa3b8', fontSize: 13.5, mt: 0.3, lineHeight: 1.5 }}>{f.desc}</Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  </TiltCard>
                </motion.div>
              ))}
            </Stack>
          </Stack>

          {/* Footer Badges */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.6 }}>
            <Box>
              <Box sx={{ height: '1px', bgcolor: 'rgba(255,255,255,0.12)', mb: 3 }} />
              <Stack direction="row" spacing={3.5} sx={{ flexWrap: 'wrap' }}>
                {[
                  { icon: SecurityRoundedIcon, text: 'HIPAA & GDPR Compliant Security' },
                  { icon: ShieldRoundedIcon, text: 'Automatic PHI Anonymization' },
                  { icon: VerifiedUserRoundedIcon, text: 'Role-Based Access Control' },
                ].map((item) => (
                  <Stack key={item.text} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <item.icon sx={{ fontSize: 17, color: '#6fb3e0' }} />
                    <Typography sx={{ color: '#8fa8be', fontSize: 13, fontWeight: 600 }}>{item.text}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </motion.div>
        </Box>

        {/* Right Glass Form Section */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: { xs: 3, sm: 6 },
            position: 'relative',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.7, delay: 0.2 }}
            style={{ width: '100%', maxWidth: 440 }}
          >
            {/* NOTE: TiltCard intentionally removed from form — 3D perspective transforms
                cause pointer hit-test misalignment making inputs/buttons unclickable */}
              {/* Mobile Header */}
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 3, display: { lg: 'none' } }}>
                <Box sx={{ width: 44, height: 44, borderRadius: 2.5, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LocalHospitalRoundedIcon sx={{ color: '#fff' }} />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>MediScan AI</Typography>
                  <Typography variant="caption" sx={{ color: '#8fa8be' }}>Clinical Intelligence Platform</Typography>
                </Box>
              </Stack>

              <Box sx={{ mb: 3.5 }}>
                <Typography variant="h2" sx={{ fontWeight: 800, color: '#ffffff', fontSize: '2rem', letterSpacing: '-0.02em' }}>
                  Clinical Sign In
                </Typography>
                <Typography variant="body2" sx={{ color: '#8fa8be', mt: 0.75, fontSize: '0.95rem' }}>
                  Enter your credentials to access your diagnostic workspace
                </Typography>
              </Box>

              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  borderRadius: 4.5,
                  bgcolor: 'rgba(11, 35, 56, 0.75)',
                  backdropFilter: 'blur(30px) saturate(190%)',
                  WebkitBackdropFilter: 'blur(30px) saturate(190%)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4), 0 0 30px rgba(15, 92, 140, 0.2)',
                }}
              >
                <form onSubmit={handleSubmit}>
                  <Stack spacing={3}>
                    {error && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>
                      </motion.div>
                    )}

                    <TextField
                      label="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      fullWidth
                      autoFocus
                      required
                      disabled={loading}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          bgcolor: 'rgba(255, 255, 255, 0.05)',
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                          '&:hover fieldset': { borderColor: '#6fb3e0' },
                          '&.Mui-focused fieldset': { borderColor: '#6fb3e0' },
                        },
                        '& .MuiInputLabel-root': { color: '#8fa8be' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#6fb3e0' },
                      }}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <PersonRoundedIcon fontSize="small" sx={{ color: '#6fb3e0' }} />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />

                    <TextField
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      fullWidth
                      required
                      disabled={loading}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          bgcolor: 'rgba(255, 255, 255, 0.05)',
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                          '&:hover fieldset': { borderColor: '#6fb3e0' },
                          '&.Mui-focused fieldset': { borderColor: '#6fb3e0' },
                        },
                        '& .MuiInputLabel-root': { color: '#8fa8be' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#6fb3e0' },
                      }}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockRoundedIcon fontSize="small" sx={{ color: '#6fb3e0' }} />
                            </InputAdornment>
                          ),
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                size="small"
                                onClick={() => setShowPassword((s) => !s)}
                                edge="end"
                                sx={{ color: '#8fa8be' }}
                              >
                                <motion.span
                                  key={showPassword ? 'off' : 'on'}
                                  initial={{ scale: 0.7, rotate: -45 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  transition={{ type: 'spring', bounce: 0.4, duration: 0.3 }}
                                  style={{ display: 'inline-flex' }}
                                >
                                  {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                </motion.span>
                              </IconButton>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />

                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          sx={{ color: '#6fb3e0', '&.Mui-checked': { color: '#6fb3e0' } }}
                        />
                      }
                      label={<Typography variant="body2" sx={{ color: '#8fa8be', fontWeight: 500 }}>Remember me on this device</Typography>}
                    />

                    <motion.div whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }}>
                      <Button
                        type="submit"
                        variant="contained"
                        size="large"
                        fullWidth
                        disabled={loading}
                        className="btn-shimmer"
                        endIcon={!loading && <ArrowForwardRoundedIcon />}
                        sx={{
                          py: 1.6,
                          borderRadius: 3.5,
                          fontSize: '1.05rem',
                          fontWeight: 800,
                          background: 'linear-gradient(135deg, #0f5c8c 0%, #0f9c8f 100%)',
                          boxShadow: '0 8px 25px rgba(15, 156, 143, 0.4), inset 0 1px 1px rgba(255,255,255,0.4)',
                          color: '#fff',
                        }}
                      >
                        {loading ? (
                          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                            <CircularProgress size={22} color="inherit" />
                            <span>Authenticating…</span>
                          </Stack>
                        ) : (
                          'Sign in to Workspace'
                        )}
                      </Button>
                    </motion.div>
                  </Stack>
                </form>

                {/* Quick Fill Role Selection Pills */}
                <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <Typography variant="caption" sx={{ color: '#8fa8be', display: 'block', textAlign: 'center', mb: 2, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Quick Access Demo Roles
                  </Typography>
                  <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'center' }}>
                    {ROLES.map((r) => {
                      const active = username === r.id;
                      return (
                        <motion.div
                          key={r.id}
                          whileHover={{ scale: 1.08, y: -3 }}
                          whileTap={{ scale: 0.94 }}
                        >
                          <Chip
                            label={r.title}
                            size="medium"
                            onClick={() => quickFill(r.id)}
                            sx={{
                              cursor: 'pointer',
                              fontWeight: 700,
                              px: 1.5,
                              py: 0.75,
                              borderRadius: 3,
                              bgcolor: active ? '#0f5c8c' : 'rgba(255,255,255,0.08)',
                              color: active ? '#ffffff' : '#b0c8db',
                              border: active ? '1px solid #6fb3e0' : '1px solid rgba(255,255,255,0.15)',
                              boxShadow: active ? '0 0 16px rgba(111,179,224,0.4)' : 'none',
                              backdropFilter: 'blur(10px)',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                bgcolor: active ? '#0f5c8c' : 'rgba(255,255,255,0.16)',
                                borderColor: '#6fb3e0',
                              },
                            }}
                          />
                        </motion.div>
                      );
                    })}
                  </Stack>
                </Box>
              </Paper>

            <Typography variant="caption" sx={{ color: '#68849b', display: 'block', textAlign: 'center', mt: 3.5 }}>
              Decision-support system for clinical professionals. Diagnostic findings require physician verification.
            </Typography>
          </motion.div>
        </Box>
      </Box>
    </Box>
  );
}


