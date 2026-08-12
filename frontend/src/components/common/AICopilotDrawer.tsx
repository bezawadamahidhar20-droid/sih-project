import { useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Stack,
  IconButton,
  Button,
  Chip,
  Card,
  Divider,
  CircularProgress,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { tokens } from '../../theme';

interface AICopilotDrawerProps {
  open: boolean;
  onClose: () => void;
  predictedClass?: string;
  confidenceScore?: number;
  patientName?: string;
}

export function AICopilotDrawer({
  open,
  onClose,
  predictedClass = 'Pneumonia (Right Lower Lobe)',
  confidenceScore = 0.94,
  patientName = 'John Doe (PAT-8921)',
}: AICopilotDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [reportDraft, setReportDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [listening, setListening] = useState(false);

  const generateReport = () => {
    setLoading(true);
    setTimeout(() => {
      setReportDraft(
        `CLINICAL RADIOLOGY REPORT DRAFT\n` +
        `----------------------------------------\n` +
        `Patient: ${patientName}\n` +
        `Primary AI Impression: ${predictedClass}\n` +
        `Confidence Level: ${(confidenceScore * 100).toFixed(1)}%\n\n` +
        `FINDINGS:\n` +
        `1. Focal opacity in right lower zone consistent with airspace consolidation.\n` +
        `2. No overt pleural effusion or pneumothorax identified.\n` +
        `3. Cardiac size and vascularity remain within normal limits.\n\n` +
        `IMPRESSION & DIFFERENTIAL DIAGNOSIS:\n` +
        `- Primary: Bacterial Pneumonia (ICD-10 J18.9)\n` +
        `- Secondary Differential: Atelectasis (ICD-10 J98.11), Pulmonary Edema\n\n` +
        `RECOMMENDATIONS:\n` +
        `- Clinical correlation with sputum culture and inflammatory markers.\n` +
        `- Follow-up chest X-ray in 4-6 weeks post-antibiotic therapy.`
      );
      setLoading(false);
    }, 600);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(reportDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 460 },
            bgcolor: tokens.surfaceDark,
            borderLeft: `1px solid ${tokens.surfaceBorder}`,
            p: 3,
          },
        },
      }}
    >
      <Stack spacing={3} sx={{ height: '100%' }}>
        {/* Header */}
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2.5,
                bgcolor: 'rgba(0, 180, 216, 0.15)',
                color: tokens.cyan,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AutoAwesomeRoundedIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
                AI Clinical Co-Pilot
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Real-time differential diagnosis & report generator
              </Typography>
            </Box>
          </Stack>
          <IconButton onClick={onClose} size="small">
            <CloseRoundedIcon />
          </IconButton>
        </Stack>

        <Divider />

        {/* Current Active Case Card */}
        <Card
          sx={{
            p: 2,
            borderRadius: 3,
            bgcolor: 'rgba(7, 12, 18, 0.6)',
            border: `1px solid ${tokens.surfaceBorder}`,
          }}
        >
          <Stack spacing={1}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Active Scan Assessment
              </Typography>
              <Chip
                label={`${(confidenceScore * 100).toFixed(0)}% Confidence`}
                size="small"
                sx={{ bgcolor: 'rgba(16, 185, 129, 0.15)', color: tokens.confidenceHigh }}
              />
            </Stack>
            <Typography variant="subtitle1" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
              {predictedClass}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Subject: {patientName}
            </Typography>
          </Stack>
        </Card>

        {/* Quick Action Tools */}
        <Stack spacing={1.5}>
          <Typography variant="subtitle2" sx={{ color: tokens.textPrimary }}>
            AI Assistant Workflows
          </Typography>

          <Button
            fullWidth
            variant="contained"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <DescriptionRoundedIcon />}
            onClick={generateReport}
            disabled={loading}
            sx={{ py: 1.2 }}
          >
            {loading ? 'Drafting Clinical Report…' : 'Generate Automated Radiology Report'}
          </Button>

          <Button
            fullWidth
            variant="outlined"
            startIcon={<MicRoundedIcon style={{ color: listening ? tokens.critical : tokens.cyan }} />}
            onClick={() => setListening((l) => !l)}
            sx={{
              borderColor: listening ? tokens.critical : tokens.surfaceBorder,
              color: listening ? tokens.critical : tokens.textPrimary,
            }}
          >
            {listening ? 'Voice Dictation Active (Listening…)' : 'Start Voice Dictation'}
          </Button>
        </Stack>

        {/* Generated Report Output Box */}
        {reportDraft && (
          <Card
            sx={{
              p: 2.5,
              borderRadius: 3,
              bgcolor: '#04080D',
              border: `1px solid ${tokens.surfaceBorder}`,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ overflowY: 'auto', pr: 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" sx={{ color: tokens.cyan, fontWeight: 700, fontFamily: 'monospace' }}>
                  AI RADIOLOGY DRAFT GENERATED
                </Typography>
                <IconButton size="small" onClick={handleCopy}>
                  {copied ? <CheckRoundedIcon fontSize="small" style={{ color: tokens.confidenceHigh }} /> : <ContentCopyRoundedIcon fontSize="small" />}
                </IconButton>
              </Stack>
              <Typography
                component="pre"
                variant="caption"
                sx={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  whiteSpace: 'pre-wrap',
                  color: tokens.textPrimary,
                  fontSize: '0.78rem',
                  lineHeight: 1.55,
                }}
              >
                {reportDraft}
              </Typography>
            </Box>

            <Button
              fullWidth
              size="small"
              variant="outlined"
              onClick={handleCopy}
              sx={{ mt: 2, borderColor: tokens.surfaceBorder, color: tokens.textPrimary }}
            >
              {copied ? 'Copied to Clipboard' : 'Copy Report to EMR / EHR System'}
            </Button>
          </Card>
        )}
      </Stack>
    </Drawer>
  );
}

export default AICopilotDrawer;
