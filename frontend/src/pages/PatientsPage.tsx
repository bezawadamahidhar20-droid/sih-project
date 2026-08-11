import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, Typography, Stack, TextField, InputAdornment, Grid, Chip, Avatar } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { api } from '../services/api';
import { Prediction, Scan } from '../types';
import { EmptyState } from '../components/common/EmptyState';
import { ScanCardSkeleton } from '../components/common/Skeletons';

interface PatientSummary {
  patientId: string;
  scanCount: number;
  lastVisit: string;
  flaggedCount: number;
  latestFinding?: string;
}

export function PatientsPage() {
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([api.getScans({ page_size: 300 }), api.getPredictions({ page_size: 300 })])
      .then(([s, p]) => {
        setScans(s.scans);
        setPredictions(p.predictions);
      })
      .catch((err: any) =>
        setError(err?.response?.data?.detail || 'Failed to load patient data.')
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const patients: PatientSummary[] = useMemo(() => {
    const map = new Map<string, PatientSummary>();
    scans.forEach((s) => {
      if (!s.anonymized_patient_id) return;
      const existing = map.get(s.anonymized_patient_id);
      if (!existing) {
        map.set(s.anonymized_patient_id, {
          patientId: s.anonymized_patient_id,
          scanCount: 1,
          lastVisit: s.created_at,
          flaggedCount: 0,
        });
      } else {
        existing.scanCount += 1;
        if (new Date(s.created_at) > new Date(existing.lastVisit)) existing.lastVisit = s.created_at;
      }
    });
    predictions.forEach((p) => {
      const pid = p.scan?.anonymized_patient_id;
      if (!pid || !map.has(pid)) return;
      const entry = map.get(pid)!;
      if (p.is_flagged) entry.flaggedCount += 1;
      if (!entry.latestFinding || new Date(p.created_at) >= new Date(entry.lastVisit)) {
        entry.latestFinding = p.predicted_class;
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime());
  }, [scans, predictions]);

  const filtered = patients.filter((p) => p.patientId.toLowerCase().includes(search.toLowerCase()));

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h2">Patients</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Browse anonymized patients with recorded scans
        </Typography>
      </Box>

      <TextField
        size="small"
        placeholder="Search by patient ID…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }}
        sx={{ maxWidth: 360 }}
      />

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={loadData}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <Grid container spacing={2.5}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <ScanCardSkeleton />
            </Grid>
          ))}
        </Grid>
      ) : error ? (
        <Card sx={{ borderRadius: 3 }}>
          <EmptyState icon={GroupRoundedIcon} title="Couldn't load patients" description="The request failed. Check your connection and try again." />
        </Card>
      ) : filtered.length === 0 ? (
        <Card sx={{ borderRadius: 3 }}>
          <EmptyState icon={GroupRoundedIcon} title="No patients found" description="Upload scans with an anonymized patient ID to see them here." />
        </Card>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary">
            {filtered.length} patient{filtered.length === 1 ? '' : 's'} found
          </Typography>
          <Grid container spacing={2.5}>
            {filtered.map((patient) => (
              <Grid key={patient.patientId} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card
                  sx={{
                    p: 2.5,
                    borderRadius: 3,
                    cursor: 'pointer',
                    transition: 'box-shadow .2s, transform .2s, border-color .2s',
                    '&:hover': {
                      boxShadow: '0 14px 28px -10px rgba(15,36,48,0.18)',
                      transform: 'translateY(-2px)',
                      borderColor: 'primary.light',
                    },
                  }}
                  onClick={() => navigate(`/patients/${patient.patientId}`)}
                >
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Avatar
                      sx={{
                        bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                        color: 'primary.dark',
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {patient.patientId.slice(-2)}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" noWrap>{patient.patientId}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Last visit {new Date(patient.lastVisit).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <ArrowForwardRoundedIcon fontSize="small" color="action" />
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
                    <Chip size="small" label={`${patient.scanCount} scan${patient.scanCount > 1 ? 's' : ''}`} variant="outlined" />
                    {patient.latestFinding && <Chip size="small" label={patient.latestFinding} variant="outlined" />}
                    {patient.flaggedCount > 0 && (
                      <Chip size="small" label={`${patient.flaggedCount} flagged`} color="info" variant="outlined" />
                    )}
                  </Stack>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Stack>
  );
}
