import { useEffect, useMemo, useState } from 'react';
import { Box, Card, Typography, Stack, Divider, Chip } from '@mui/material';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import { api } from '../services/api';
import { Prediction, Scan } from '../types';
import { EmptyState } from '../components/common/EmptyState';
import { TableRowSkeleton } from '../components/common/Skeletons';

type LogType = 'upload' | 'prediction' | 'flag';

interface LogEntry {
  id: string;
  type: LogType;
  timestamp: string;
  details: string;
  patientId?: string | null;
  isHighRisk?: boolean;
  isFlagged?: boolean;
}

const typeConfig: Record<LogType, { icon: typeof CloudUploadRoundedIcon; label: string; color: string }> = {
  upload: { icon: CloudUploadRoundedIcon, label: 'Scan Upload', color: '#0f5c8c' },
  prediction: { icon: PsychologyRoundedIcon, label: 'AI Prediction', color: '#0f9c8f' },
  flag: { icon: FlagRoundedIcon, label: 'Flag Action', color: '#2f6fa8' },
};

export function AuditLogsPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getScans({ page_size: 200 }), api.getPredictions({ page_size: 200 })])
      .then(([s, p]) => {
        setScans(s.scans);
        setPredictions(p.predictions);
      })
      .finally(() => setLoading(false));
  }, []);

  const entries: LogEntry[] = useMemo(() => {
    const list: LogEntry[] = [];
    scans.forEach((s) =>
      list.push({
        id: `upload-${s.id}`,
        type: 'upload',
        timestamp: s.created_at,
        details: `Scan "${s.original_filename}" uploaded (${s.modality ?? 'unknown modality'})`,
        patientId: s.anonymized_patient_id,
      })
    );
    predictions.forEach((p) => {
      list.push({
        id: `prediction-${p.id}`,
        type: 'prediction',
        timestamp: p.created_at,
        details: `Prediction "${p.predicted_class}" at ${Math.round(p.confidence * 100)}% confidence (${p.model_architecture})`,
        patientId: p.scan?.anonymized_patient_id,
        isHighRisk: p.is_high_risk,
      });
      if (p.is_flagged && p.flagged_at) {
        list.push({
          id: `flag-${p.id}`,
          type: 'flag',
          timestamp: p.flagged_at,
          details: `Prediction #${p.id} flagged for clinical review`,
          patientId: p.scan?.anonymized_patient_id,
          isFlagged: true,
        });
      }
    });
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [scans, predictions]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h2">Audit Logs</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Structured activity log — uploads, predictions, and flags. No PHI is recorded.
        </Typography>
      </Box>

      {loading ? (
        <Card sx={{ borderRadius: 3 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <TableRowSkeleton key={i} cols={4} />
          ))}
        </Card>
      ) : entries.length === 0 ? (
        <Card sx={{ borderRadius: 3 }}>
          <EmptyState icon={AccessTimeRoundedIcon} title="No activity yet" description="Uploads, predictions and flags will appear here." />
        </Card>
      ) : (
        <Card sx={{ borderRadius: 3 }}>
          <Box sx={{ px: 2.5, py: 1.5 }}>
            <Typography variant="caption" color="text.secondary">{entries.length} log entries</Typography>
          </Box>
          <Divider />
          <Stack divider={<Divider />}>
            {entries.map((entry) => {
              const config = typeConfig[entry.type];
              return (
                <Stack key={entry.id} direction="row" spacing={2} sx={{ alignItems: 'flex-start', p: 2.25 }}>
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 2,
                      bgcolor: `${config.color}1a`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <config.icon sx={{ fontSize: 17, color: config.color }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{config.label}</Typography>
                      {entry.isHighRisk && <Chip size="small" label="High Risk" color="error" variant="outlined" />}
                      {entry.isFlagged && <Chip size="small" label="Flagged" color="info" variant="outlined" />}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{entry.details}</Typography>
                    {entry.patientId && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        Patient: {entry.patientId}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </Typography>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
