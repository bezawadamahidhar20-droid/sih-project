import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  FormControlLabel,
  Checkbox,
  Divider,
} from '@mui/material';
import {
  VisibilityOutlined,
  VisibilityOffOutlined,
  MedicalInformationOutlined,
  PersonOutlineOutlined,
  LockOutlined,
  ShieldOutlined,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

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
    if (!rememberMe) {
      localStorage.removeItem('mediscan_remember_username');
    }
  }, [rememberMe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (rememberMe) {
        localStorage.setItem('mediscan_remember_username', username);
      }
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return <Box>Redirecting…</Box>;
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        p: 2,
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 1,
              border: '1px solid #DCE1E7',
              backgroundColor: 'background.paper',
              mb: 2,
            }}
          >
            <MedicalInformationOutlined sx={{ fontSize: 30, color: 'primary.main' }} />
          </Box>
          <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.primary' }}>
            MediScan AI
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            AI-assisted medical image diagnostics
          </Typography>
        </Box>

        <Card>
          <CardContent sx={{ p: 3.5 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                margin="dense"
                required
                autoComplete="username"
                autoFocus
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineOutlined color="action" />
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="dense"
                required
                autoComplete="current-password"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlined color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        aria-label="toggle password visibility"
                      >
                        {showPassword ? <VisibilityOutlined /> : <VisibilityOffOutlined />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <FormControlLabel
                control={<Checkbox checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />}
                label="Remember my username on this device"
                sx={{ mt: 1, mb: 2 }}
              />

              <Button
                type="submit"
                fullWidth
                size="large"
                variant="contained"
                disabled={loading}
                sx={{ py: 1.25, fontWeight: 600 }}
              >
                {loading ? <CircularProgress size={22} color="inherit" /> : 'Sign in'}
              </Button>
            </form>

            <Divider sx={{ my: 2.5 }} />

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Demo accounts (seeded in development): username <strong>doctor</strong>, <strong>radiologist</strong>, or{' '}
                <strong>staff</strong> — password <strong>DemoPass123!</strong>
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
                <ShieldOutlined sx={{ fontSize: 16 }} />
                <Typography variant="caption">
                  Access is role-based. Staff see only their own uploads.
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
          AI output is decision-support only — not a final diagnosis.
        </Typography>
      </Box>
    </Box>
  );
}
