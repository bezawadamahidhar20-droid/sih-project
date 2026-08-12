import { useState } from 'react';
import { Box, Typography, Stack, Button, Chip } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import NotificationImportantRoundedIcon from '@mui/icons-material/NotificationImportantRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { tokens } from '../../theme';

interface CriticalTriageBarProps {
  findingName?: string;
  patientName?: string;
  confidenceScore?: number;
}

export function CriticalTriageBar({
  findingName = 'High-Risk Pneumothorax / Massive Effusion',
  patientName = 'Patient PAT-8921',
  confidenceScore = 0.94,
}: CriticalTriageBarProps) {
  const [dispatched, setDispatched] = useState(false);

  return (
    <Box
      sx={{
        width: '100%',
        p: 2,
        borderRadius: 3,
        bgcolor: 'rgba(239, 68, 68, 0.12)',
        border: '1px solid rgba(239, 68, 68, 0.35)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              bgcolor: 'rgba(239, 68, 68, 0.2)',
              color: tokens.critical,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WarningAmberRoundedIcon />
          </Box>
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Chip
                label="CRITICAL STAT TRIAGE"
                size="small"
                sx={{ bgcolor: tokens.critical, color: '#FFFFFF', fontWeight: 800, fontSize: '0.68rem', height: 20 }}
              />
              <Typography variant="caption" sx={{ color: tokens.critical, fontFamily: 'monospace', fontWeight: 700 }}>
                Escalation Target: &lt; 15 min
              </Typography>
            </Stack>
            <Typography variant="subtitle2" sx={{ color: tokens.textPrimary, fontWeight: 700, mt: 0.2 }}>
              {findingName} — {patientName} ({(confidenceScore * 100).toFixed(0)}% Score)
            </Typography>
          </Box>
        </Stack>

        <Button
          size="small"
          variant="contained"
          onClick={() => setDispatched(true)}
          disabled={dispatched}
          startIcon={dispatched ? <CheckCircleRoundedIcon /> : <NotificationImportantRoundedIcon />}
          sx={{
            bgcolor: dispatched ? tokens.confidenceHigh : tokens.critical,
            color: '#FFFFFF',
            px: 2.5,
            py: 1,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            '&:hover': {
              bgcolor: dispatched ? tokens.confidenceHigh : '#DC2626',
            },
          }}
        >
          {dispatched ? 'Specialist Dispatched via SMS/Pager' : 'Dispatch Emergency Specialist'}
        </Button>
      </Stack>
    </Box>
  );
}

export default CriticalTriageBar;
