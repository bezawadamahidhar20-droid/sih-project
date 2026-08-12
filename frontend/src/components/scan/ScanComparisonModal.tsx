import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Stack,
  IconButton,
  Grid,
  Chip,
  Card,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CompareRoundedIcon from '@mui/icons-material/CompareRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import { tokens } from '../../theme';

interface ScanComparisonModalProps {
  open: boolean;
  onClose: () => void;
  currentScanUrl?: string;
  patientName?: string;
}

export function ScanComparisonModal({
  open,
  onClose,
  currentScanUrl,
  patientName = 'John Doe (PAT-8921)',
}: ScanComparisonModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: tokens.surfaceDark,
            border: `1px solid ${tokens.surfaceBorder}`,
            borderRadius: 4,
            p: 1,
          },
        },
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: 'rgba(0, 180, 216, 0.15)',
              color: tokens.cyan,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CompareRoundedIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
              Prior vs Current Scan Longitudinal Comparison
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Subject: {patientName} • Automated delta progression analysis
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose} size="small">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ borderColor: tokens.surfaceBorder, p: 3 }}>
        <Stack spacing={3}>
          {/* Progression Summary Banner */}
          <Card
            sx={{
              p: 2,
              borderRadius: 3,
              bgcolor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <TrendingUpRoundedIcon style={{ color: tokens.confidenceLow }} />
                <Typography variant="subtitle2" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
                  Delta Finding: Right Lower Lobe Opacity increased by +12.4% over 30 days
                </Typography>
              </Stack>
              <Chip
                label="Moderate Progression"
                size="small"
                sx={{ bgcolor: 'rgba(245, 158, 11, 0.2)', color: tokens.confidenceLow, fontWeight: 700 }}
              />
            </Stack>
          </Card>

          {/* Dual Image Comparison Grid */}
          <Grid container spacing={3}>
            {/* Prior Scan */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 2, borderRadius: 3, bgcolor: '#04080D', border: `1px solid ${tokens.surfaceBorder}` }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Chip label="PRIOR SCAN (30 Days Ago)" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: tokens.textSecondary }} />
                    <Typography variant="caption" color="text.secondary">
                      Score: 82% Confidence
                    </Typography>
                  </Stack>
                  <Box
                    sx={{
                      height: 300,
                      borderRadius: 2,
                      bgcolor: '#070C12',
                      border: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundImage: currentScanUrl ? `url(${currentScanUrl})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      filter: 'sepia(30%) contrast(110%)',
                    }}
                  >
                    {!currentScanUrl && (
                      <Typography variant="caption" color="text.secondary">
                        [Prior Chest X-Ray Baseline]
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Initial focal infiltrate noted in RLL (1.8 cm x 1.4 cm).
                  </Typography>
                </Stack>
              </Card>
            </Grid>

            {/* Current Scan */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 2, borderRadius: 3, bgcolor: '#04080D', border: `1px solid ${tokens.cyan}` }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Chip label="CURRENT SCAN (Today)" size="small" sx={{ bgcolor: tokens.cyan, color: '#070C12', fontWeight: 700 }} />
                    <Typography variant="caption" sx={{ color: tokens.cyan, fontWeight: 700 }}>
                      Score: 94% Confidence
                    </Typography>
                  </Stack>
                  <Box
                    sx={{
                      height: 300,
                      borderRadius: 2,
                      bgcolor: '#070C12',
                      border: '1px solid rgba(0, 180, 216, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundImage: currentScanUrl ? `url(${currentScanUrl})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {!currentScanUrl && (
                      <Typography variant="caption" color="text.secondary">
                        [Current Chest X-Ray Analysis]
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ color: tokens.textPrimary }}>
                    Consolidation increased to (2.1 cm x 1.7 cm). Grad-CAM heatmap density confirmed.
                  </Typography>
                </Stack>
              </Card>
            </Grid>
          </Grid>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default ScanComparisonModal;
