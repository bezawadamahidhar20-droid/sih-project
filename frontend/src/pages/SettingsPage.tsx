import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  Typography,
  Stack,
  Tabs,
  Tab,
  Avatar,
  Chip,
  Divider,
  Alert,
  Grid,
} from '@mui/material';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import FingerprintRoundedIcon from '@mui/icons-material/FingerprintRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import ClipboardRoundedIcon from '@mui/icons-material/AssignmentRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { HealthResponse } from '../types';
import { StatCardSkeleton } from '../components/common/Skeletons';

const SECURITY_ITEMS = [
  {
    icon: ShieldRoundedIcon,
    title: 'PHI Anonymization',
    description: 'DICOM metadata (patient name, ID, age, institution) is stripped before any processing or logging.',
    status: 'Active',
    color: 'success' as const,
  },
  {
    icon: LockRoundedIcon,
    title: 'Encryption at Rest',
    description: 'Uploaded scans are encrypted with AES-256 (Fernet) before storage. Decryption happens only in memory.',
    status: 'Active',
    color: 'success' as const,
  },
  {
    icon: FingerprintRoundedIcon,
    title: 'Role-Based Access Control',
    description: 'Doctors and radiologists have full diagnostic access. Staff can only upload and view their own scans.',
    status: 'Active',
    color: 'success' as const,
  },
  {
    icon: VisibilityRoundedIcon,
    title: 'Clinical Confidence Thresholds',
    description: 'Predictions below 70% confidence are automatically flagged for manual review instead of being shown silently.',
    status: '70% threshold',
    color: 'info' as const,
  },
  {
    icon: ClipboardRoundedIcon,
    title: 'Structured Audit Logging',
    description: 'Every prediction, upload, and flag is logged with anonymized identifiers for audit and clinical validation.',
    status: 'Active',
    color: 'success' as const,
  },
];

export function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');

  useEffect(() => {
    api
      .healthCheck()
      .then(setHealth)
      .catch((err) => setHealthError(err.response?.data?.detail || 'Could not reach the API.'))
      .finally(() => setHealthLoading(false));
  }, []);

  const initials = (user?.full_name || user?.username || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h2">Settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Account, security & system status
        </Typography>
      </Box>

      <Card sx={{ borderRadius: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider', '& .MuiTabs-flexContainer': { flexWrap: { xs: 'wrap', sm: 'nowrap' } } }}
        >
          <Tab icon={<PersonRoundedIcon fontSize="small" />} iconPosition="start" label="Account" />
          <Tab icon={<ShieldRoundedIcon fontSize="small" />} iconPosition="start" label="Security" />
          <Tab icon={<MemoryRoundedIcon fontSize="small" />} iconPosition="start" label="AI Engine" />
          <Tab icon={<MonitorHeartRoundedIcon fontSize="small" />} iconPosition="start" label="System Status" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {tab === 0 && (
            <Stack spacing={3}>
              <Stack direction="row" spacing={2.5} sx={{ alignItems: 'center' }}>
                <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: 22, fontWeight: 700 }}>
                  {initials}
                </Avatar>
                <Box>
                  <Typography variant="h4">{user?.full_name || user?.username}</Typography>
                  <Typography variant="body2" color="text.secondary">{user?.email}</Typography>
                  <Chip size="small" label={user?.role} sx={{ mt: 1, textTransform: 'capitalize' }} color="primary" variant="outlined" />
                </Box>
              </Stack>
              <Divider />
              <Grid container spacing={2}>
                {[
                  { label: 'Username', value: user?.username },
                  { label: 'Role', value: user?.role },
                  { label: 'Account created', value: user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—' },
                  { label: 'Last login', value: user?.last_login ? new Date(user.last_login).toLocaleString() : '—' },
                ].map((row) => (
                  <Grid key={row.label} size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">{row.label}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{row.value}</Typography>
                  </Grid>
                ))}
              </Grid>
            </Stack>
          )}

          {tab === 1 && (
            <Stack spacing={2.5}>
              <Typography variant="h5">Security & Privacy</Typography>
              <Grid container spacing={2}>
                {SECURITY_ITEMS.map((item) => (
                  <Grid key={item.title} size={{ xs: 12, md: 6 }}>
                    <Card variant="outlined" sx={{ p: 2.25, borderRadius: 2.5, height: '100%' }}>
                      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 1 }}>
                        <item.icon fontSize="small" color="action" />
                        <Typography variant="subtitle2" sx={{ flex: 1 }}>{item.title}</Typography>
                        <Chip size="small" label={item.status} color={item.color} variant="outlined" />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">{item.description}</Typography>
                    </Card>
                  </Grid>
                ))}
              </Grid>
              <Alert severity="info" variant="outlined">
                Clinical notice: AI output is decision-support only and is not a final diagnosis. All findings
                must be confirmed by a qualified clinician. In production, this system runs behind HTTPS/TLS
                with a HIPAA-aligned infrastructure review.
              </Alert>
            </Stack>
          )}

          {tab === 2 && (
            <Stack spacing={2.5}>
              <Typography variant="h5">AI Engine Configuration</Typography>
              {healthError && <Alert severity="error">{healthError}</Alert>}
              {healthLoading ? (
                <Grid container spacing={2}>
                  {[1, 2, 3, 4].map((i) => (
                    <Grid key={i} size={{ xs: 12, sm: 6 }}>
                      <StatCardSkeleton />
                    </Grid>
                  ))}
                </Grid>
              ) : health ? (
                <Stack spacing={1.5}>
                  {[
                    { label: 'Service status', value: health.status, highlight: health.status === 'ok' ? 'success' : 'error' },
                    { label: 'Inference engine', value: health.engine, mono: true },
                    {
                      label: 'Trained model',
                      value: health.model_loaded ? 'Loaded (CNN active)' : 'Not loaded (baseline heuristic active)',
                      highlight: health.model_loaded ? 'success' : 'warning',
                    },
                    { label: 'Compute device', value: health.device, mono: true },
                    { label: 'API version', value: health.version, mono: true },
                  ].map((row) => (
                    <Stack
                      key={row.label}
                      direction="row"
                      sx={{ justifyContent: 'space-between', alignItems: 'center', p: 1.75, borderRadius: 2, bgcolor: 'grey.50' }}
                    >
                      <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                      {row.highlight ? (
                        <Chip size="small" label={row.value} color={row.highlight as any} />
                      ) : (
                        <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: row.mono ? 'monospace' : undefined }}>
                          {row.value}
                        </Typography>
                      )}
                    </Stack>
                  ))}
                </Stack>
              ) : null}
              <Alert severity="info" variant="outlined">
                The AI uses a trained CNN when a model state dict is present at <code>MODEL_PATH</code>, and
                falls back to a deterministic baseline heuristic otherwise. The <code>/api/v1/health</code>{' '}
                endpoint reports the current engine status.
              </Alert>
            </Stack>
          )}

          {tab === 3 && (
            <Stack spacing={2.5}>
              <Typography variant="h5">System Health</Typography>
              <Stack spacing={1.5}>
                {[
                  { label: 'API Backend', status: health ? 'Online' : healthError ? 'Offline' : 'Checking…', ok: !!health && !healthError },
                  {
                    label: 'AI Engine',
                    status: health ? `${health.engine} (${health.status})` : healthError ? 'Unavailable' : 'Checking…',
                    ok: health?.status === 'ok',
                  },
                  {
                    label: 'Model loaded',
                    status: health ? (health.model_loaded ? 'Yes — CNN active' : 'No — baseline heuristic') : '—',
                    ok: health?.model_loaded ?? false,
                  },
                  { label: 'Authentication', status: 'JWT + refresh tokens', ok: true },
                  { label: 'Encryption', status: 'AES-256 (Fernet) at rest', ok: true },
                ].map((row) => (
                  <Stack
                    key={row.label}
                    direction="row"
                    sx={{ justifyContent: 'space-between', alignItems: 'center', p: 1.75, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.label}</Typography>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      {row.ok ? (
                        <CheckCircleRoundedIcon fontSize="small" color="success" />
                      ) : (
                        <ErrorRoundedIcon fontSize="small" color="warning" />
                      )}
                      <Typography variant="body2" color="text.secondary">{row.status}</Typography>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          )}
        </Box>
      </Card>
    </Stack>
  );
}
