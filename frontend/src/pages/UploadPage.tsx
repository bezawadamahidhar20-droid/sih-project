import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { Box, Grid, Card, Typography, Stack, Button, Divider, Chip } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import { UploadDropzone } from '../components/upload/UploadDropzone';
import { Scan } from '../types';

export function UploadPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [lastScan, setLastScan] = useState<Scan | null>(null);

  const handleUploaded = (scan: Scan) => {
    setLastScan(scan);
    enqueueSnackbar(`${scan.original_filename} uploaded successfully`, { variant: 'success' });
  };

  const handleError = (message: string) => {
    enqueueSnackbar(message, { variant: 'error' });
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h2">Upload Medical Scan</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Chest X-ray or CT scan (JPEG, PNG, DICOM) — PHI is stripped automatically before processing.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Stack spacing={2.5}>
            {lastScan && (
              <Card
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  bgcolor: 'success.light',
                  border: '1px solid',
                  borderColor: 'success.main',
                }}
              >
                <CheckCircleRoundedIcon color="success" sx={{ fontSize: 28 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography color="success.dark" sx={{ fontWeight: 700 }}>
                    {lastScan.original_filename} uploaded
                  </Typography>
                  <Typography variant="body2" color="success.dark">
                    PHI stripped and file encrypted at rest. Ready for AI analysis.
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  color="success"
                  endIcon={<ArrowForwardRoundedIcon />}
                  onClick={() => navigate(`/results/${lastScan.id}`)}
                >
                  Analyze Now
                </Button>
              </Card>
            )}

            <Card sx={{ p: 3, borderRadius: 3 }}>
              <UploadDropzone onUploaded={handleUploaded} onError={handleError} />
            </Card>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={2.5}>
            <Card sx={{ p: 2.5, borderRadius: 3 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                <DescriptionRoundedIcon fontSize="small" color="primary" />
                <Typography variant="subtitle1">Accepted Formats</Typography>
              </Stack>
              <Stack spacing={1.25}>
                {[
                  { fmt: 'JPEG / PNG', desc: 'Standard image files' },
                  { fmt: 'DICOM (.dcm)', desc: 'Medical imaging standard' },
                ].map((item) => (
                  <Stack key={item.fmt} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2">{item.desc}</Typography>
                    <Chip size="small" label={item.fmt} variant="outlined" sx={{ fontFamily: 'monospace' }} />
                  </Stack>
                ))}
              </Stack>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary">
                Maximum 50 MB per file
              </Typography>
            </Card>

            <Card sx={{ p: 2.5, borderRadius: 3 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                <LightbulbRoundedIcon fontSize="small" color="warning" />
                <Typography variant="subtitle1">Image Guidelines</Typography>
              </Stack>
              <Stack spacing={1}>
                {[
                  'Chest X-rays — PA/AP views preferred',
                  'CT scans — lung window settings',
                  'DICOM files with intact pixel data',
                  'Correct orientation (no rotation)',
                ].map((tip) => (
                  <Stack key={tip} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'grey.400', mt: 0.9, flexShrink: 0 }} />
                    <Typography variant="body2" color="text.secondary">{tip}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Card>

            <Card sx={{ p: 2.5, borderRadius: 3, bgcolor: 'info.light', border: '1px solid', borderColor: 'info.main' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                <ShieldRoundedIcon fontSize="small" color="info" />
                <Typography variant="subtitle1" color="info.dark">Privacy & Security</Typography>
              </Stack>
              <Stack spacing={1.25}>
                {[
                  { icon: ShieldRoundedIcon, text: 'PHI stripped from DICOM metadata before any processing' },
                  { icon: LockRoundedIcon, text: 'Files encrypted at rest (AES-256) after upload' },
                  { icon: InfoRoundedIcon, text: 'Diagnostic results are decision-support only' },
                ].map((item, i) => (
                  <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <item.icon sx={{ fontSize: 15, color: 'info.dark', mt: 0.3 }} />
                    <Typography variant="body2" color="info.dark">{item.text}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
