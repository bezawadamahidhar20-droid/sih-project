import React, { useEffect, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  Chip,
  Stack,
  Divider,
  Grid,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import {
  RefreshOutlined,
  SaveOutlined,
  ShieldOutlined,
  MemoryOutlined,
  LockOutlined,
  FingerprintOutlined,
  ScienceOutlined,
  BadgeOutlined,
  MailOutlineOutlined,
  PersonOutlineOutlined,
  LogoutOutlined,
} from '@mui/icons-material'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { HealthResponse } from '../types'

export function SettingsPage() {
  const { user, refreshUser, logout } = useAuth()
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [profileMsg, setProfileMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState('')

  useEffect(() => {
    setFullName(user?.full_name ?? '')
    setEmail(user?.email ?? '')
  }, [user])

  const fetchHealth = async () => {
    setHealthError('')
    try {
      const h = await api.healthCheck()
      setHealth(h)
    } catch (err: any) {
      setHealthError(err.response?.data?.detail || 'Backend health check failed.')
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setProfileMsg(null)
    try {
      await api.updateMe({ full_name: fullName, email })
      await refreshUser()
      setProfileMsg({ kind: 'success', text: 'Profile updated.' })
    } catch (err: any) {
      setProfileMsg({ kind: 'error', text: err.response?.data?.detail || 'Could not update profile.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
        Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Account, system status, and compliance information
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={6}>
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Profile
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1.5, mb: 2 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 1,
                      backgroundColor: '#12507E',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.25rem',
                      fontWeight: 600,
                    }}
                  >
                    {(user?.full_name || user?.username || 'U')[0].toUpperCase()}
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {user?.full_name || user?.username}
                    </Typography>
                    <Chip size="small" label={user?.role} variant="outlined" sx={{ mt: 0.25 }} />
                  </Box>
                </Box>

                <form onSubmit={handleSaveProfile}>
                  <TextField
                    label="Full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    fullWidth
                    size="small"
                    margin="normal"
                    InputProps={{ startAdornment: <PersonOutlineOutlined sx={{ mr: 1, color: 'text.secondary' }} /> }}
                  />
                  <TextField
                    label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    fullWidth
                    size="small"
                    margin="normal"
                    type="email"
                    InputProps={{ startAdornment: <MailOutlineOutlined sx={{ mr: 1, color: 'text.secondary' }} /> }}
                  />
                  <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                    <Button type="submit" variant="contained" startIcon={<SaveOutlined />} disabled={saving}>
                      {saving ? 'Saving…' : 'Save changes'}
                    </Button>
                    <Button variant="outlined" color="inherit" startIcon={<LogoutOutlined />} onClick={logout}>
                      Sign out
                    </Button>
                  </Box>
                </form>

                {profileMsg && (
                  <Alert severity={profileMsg.kind} sx={{ mt: 2 }} onClose={() => setProfileMsg(null)}>
                    {profileMsg.text}
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="overline" color="text.secondary">
                    Inference system
                  </Typography>
                  <Tooltip title="Refresh status">
                    <IconButton size="small" onClick={fetchHealth}>
                      <RefreshOutlined />
                    </IconButton>
                  </Tooltip>
                </Box>

                {healthError && <Alert severity="error" sx={{ mt: 1.5 }}>{healthError}</Alert>}

                {health && (
                  <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BadgeOutlined sx={{ color: 'text.secondary', fontSize: 20 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ width: 130 }}>Service status</Typography>
                      <Chip size="small" label={health.status} color={health.status === 'healthy' ? 'success' : 'error'} variant="outlined" />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <MemoryOutlined sx={{ color: 'text.secondary', fontSize: 20 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ width: 130 }}>Inference engine</Typography>
                      <Typography variant="body2">{health.engine}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ScienceOutlined sx={{ color: 'text.secondary', fontSize: 20 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ width: 130 }}>Trained model</Typography>
                      <Typography variant="body2">{health.model_loaded ? 'Loaded' : 'Not loaded (baseline engine active)'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <MemoryOutlined sx={{ color: 'text.secondary', fontSize: 20 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ width: 130 }}>Compute device</Typography>
                      <Typography variant="body2">{health.device}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BadgeOutlined sx={{ color: 'text.secondary', fontSize: 20 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ width: 130 }}>API version</Typography>
                      <Typography variant="body2">{health.version}</Typography>
                    </Box>
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Security &amp; privacy
              </Typography>
              <List dense disablePadding sx={{ mt: 1 }}>
                {[
                  { icon: <FingerprintOutlined />, title: 'PHI anonymization', sub: 'DICOM metadata (patient name, ID, age, institution) is stripped before any processing or logging.' },
                  { icon: <LockOutlined />, title: 'Encryption at rest', sub: 'Uploaded scans are encrypted with AES-256 (Fernet) before storage; decryption happens only in memory during inference.' },
                  { icon: <ShieldOutlined />, title: 'Role-based access', sub: 'Doctors/radiologists see full diagnostic history; staff can upload and review only their own scans.' },
                  { icon: <ScienceOutlined />, title: 'Clinical thresholds', sub: 'Predictions below the 70% confidence threshold are flagged for manual review instead of being hidden.' },
                  { icon: <MemoryOutlined />, title: 'Audit logging', sub: 'Every prediction is logged without PHI for audit and clinical validation.' },
                ].map((item) => (
                  <ListItem key={item.title} sx={{ px: 0, alignItems: 'flex-start' }}>
                    <ListItemIcon sx={{ minWidth: 36, mt: 0.25, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>{item.title}</Typography>}
                      secondary={<Typography variant="caption" color="text.secondary">{item.sub}</Typography>}
                    />
                  </ListItem>
                ))}
              </List>

              <Divider sx={{ my: 2 }} />

              <Alert severity="info" icon={<ShieldOutlined />}>
                <Typography variant="caption">
                  AI output is decision-support only and is not a final diagnosis. All findings must be confirmed by a
                  qualified clinician. In a real deployment this system is designed to run behind HTTPS/TLS and a HIPAA-aligned
                  infrastructure review.
                </Typography>
              </Alert>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
