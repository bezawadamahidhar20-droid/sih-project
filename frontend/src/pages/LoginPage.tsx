import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  {
    icon: PsychologyRoundedIcon,
    title: 'AI-Powered Analysis',
    desc: 'Deep learning classifier with Grad-CAM heatmap visualization',
  },
  {
    icon: ManageSearchRoundedIcon,
    title: 'Full Explainability',
    desc: 'See exactly where the model focused its attention',
  },
  {
    icon: MonitorHeartRoundedIcon,
    title: 'Clinical Safety UX',
    desc: 'Low-confidence results flagged for mandatory review',
  },
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
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#fff' }}>
      {/* Left branding panel */}
      <Box
        sx={{
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '50%',
          p: 7,
          background: 'linear-gradient(160deg,#081a29 0%,#0b2338 55%,#0a3f60 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'url(/images/login-hero.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.22,
          }}
        />
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', position: 'relative' }}>
          <Box sx={{ width: 44, height: 44, borderRadius: 2.5, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LocalHospitalRoundedIcon sx={{ color: '#fff' }} />
          </Box>
          <Box>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>MediScan AI</Typography>
            <Typography sx={{ color: '#93a9ba', fontSize: 12 }}>Clinical Intelligence Platform</Typography>
          </Box>
        </Stack>

        <Stack spacing={4} sx={{ position: 'relative' }}>
          <Stack spacing={2}>
            <Chip
              size="small"
              label="AI-Assisted Diagnostics"
              sx={{ alignSelf: 'flex-start', bgcolor: 'rgba(61,128,168,0.2)', color: '#8fc4e6', border: '1px solid rgba(61,128,168,0.4)' }}
            />
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 34, lineHeight: 1.2 }}>
              Clinical-grade AI for medical imaging
            </Typography>
            <Typography sx={{ color: '#93a9ba', fontSize: 15, maxWidth: 420, lineHeight: 1.7 }}>
              Upload chest X-rays and CT scans. Receive AI-powered diagnostic support with Grad-CAM
              explainability, confidence scoring, and clinical review workflows.
            </Typography>
          </Stack>

          <Stack spacing={2.5}>
            {FEATURES.map((f) => (
              <Stack key={f.title} direction="row" spacing={1.75} sx={{ alignItems: 'flex-start' }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: 'rgba(61,128,168,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <f.icon sx={{ fontSize: 18, color: '#8fc4e6' }} />
                </Box>
                <Box>
                  <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{f.title}</Typography>
                  <Typography sx={{ color: '#7d93a3', fontSize: 12.5, mt: 0.25 }}>{f.desc}</Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Stack>

        <Box sx={{ position: 'relative' }}>
          <Box sx={{ height: '1px', bgcolor: 'rgba(255,255,255,0.1)', mb: 2 }} />
          <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
            {[
              { icon: ShieldRoundedIcon, text: 'Secure clinical access' },
              { icon: LockRoundedIcon, text: 'Role-based access control' },
              { icon: VerifiedUserRoundedIcon, text: 'Protected diagnostic data' },
            ].map((item) => (
              <Stack key={item.text} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <item.icon sx={{ fontSize: 15, color: '#5d7386' }} />
                <Typography sx={{ color: '#5d7386', fontSize: 12 }}>{item.text}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Box>

      {/* Right form panel */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 4, bgcolor: 'background.default' }}>
        <Box sx={{ width: '100%', maxWidth: 380 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 5, display: { lg: 'none' } }}>
            <Box sx={{ width: 42, height: 42, borderRadius: 2.5, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LocalHospitalRoundedIcon sx={{ color: '#fff' }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 17 }}>MediScan AI</Typography>
              <Typography variant="caption" color="text.secondary">Clinical Intelligence Platform</Typography>
            </Box>
          </Stack>

          <Typography variant="h2" sx={{ mb: 0.5 }}>Sign in</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Access your clinical diagnostic workspace
          </Typography>

          <Paper variant="outlined" sx={{ p: 3.5, borderRadius: 3 }}>
            <form onSubmit={handleSubmit}>
              <Stack spacing={2.5}>
                {error && <Alert severity="error">{error}</Alert>}

                <TextField
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  fullWidth
                  autoFocus
                  required
                  disabled={loading}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonRoundedIcon fontSize="small" color="action" />
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
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockRoundedIcon fontSize="small" color="action" />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowPassword((s) => !s)} edge="end">
                            {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />

                <FormControlLabel
                  control={<Checkbox size="small" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />}
                  label={<Typography variant="body2">Remember username</Typography>}
                />

                <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </Stack>
            </form>
          </Paper>

          <Stack spacing={1} sx={{ mt: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              Demo accounts (password: DemoPass123!)
            </Typography>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              {['doctor', 'radiologist', 'staff'].map((u) => (
                <Chip key={u} label={u} size="small" variant="outlined" onClick={() => quickFill(u)} sx={{ cursor: 'pointer' }} />
              ))}
            </Stack>
          </Stack>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
            Decision-support tool only. Not a substitute for professional clinical judgment.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
