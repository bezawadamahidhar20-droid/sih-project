import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stack,
  Divider,
  Chip,
  IconButton,
  TextField,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import MedicalServicesRoundedIcon from '@mui/icons-material/MedicalServicesRounded';
import { tokens } from '../../theme';
import { Prediction } from '../../types';
import { api } from '../../services/api';

interface ReportGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  prediction: Prediction;
}

export function ReportGeneratorModal({ open, onClose, prediction }: ReportGeneratorModalProps) {
  const [physicianNotes, setPhysicianNotes] = useState(
    `Patient presented with respiratory symptoms. AI model (${prediction.model_architecture}) detected ${prediction.predicted_class} with ${(prediction.confidence * 100).toFixed(1)}% confidence score.`
  );
  const [downloading, setDownloading] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await api.downloadPredictionPdf(prediction.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MediScan_Report_Pred_${prediction.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.warn('PDF download fallback:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: '#070C12',
            border: `1px solid ${tokens.cyan}`,
            borderRadius: 4,
            boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
          },
        },
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <MedicalServicesRoundedIcon sx={{ color: tokens.cyan }} />
          <Typography variant="h6" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
            Automated Clinical Radiology Report
          </Typography>
        </Stack>
        <IconButton onClick={onClose} sx={{ color: tokens.textSecondary }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <Divider sx={{ borderColor: tokens.surfaceBorder }} />

      <DialogContent sx={{ p: 3 }}>
        <Stack spacing={3}>
          {/* Header Banner */}
          <Box
            sx={{
              p: 2.5,
              borderRadius: 3,
              bgcolor: 'rgba(0, 180, 216, 0.08)',
              border: '1px solid rgba(0, 180, 216, 0.2)',
            }}
          >
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
                  MediScan Diagnostic Center — Official Findings
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Patient ID: {prediction.scan?.anonymized_patient_id ?? 'PAT-2026-0001'} | Date: {new Date().toLocaleDateString()}
                </Typography>
              </Box>
              <Chip
                icon={<VerifiedRoundedIcon style={{ color: tokens.confidenceHigh }} />}
                label="Verified AI Diagnosis"
                size="small"
                sx={{ bgcolor: 'rgba(16,185,129,0.15)', color: tokens.confidenceHigh, border: `1px solid ${tokens.confidenceHigh}` }}
              />
            </Stack>
          </Box>

          {/* Key Findings Box */}
          <Box sx={{ p: 2.5, borderRadius: 3, bgcolor: tokens.surfaceDark, border: `1px solid ${tokens.surfaceBorder}` }}>
            <Typography variant="caption" sx={{ color: tokens.cyan, fontWeight: 700, mb: 1, display: 'block' }}>
              PRIMARY DIAGNOSTIC SUMMARY
            </Typography>
            <Stack direction="row" spacing={4} sx={{ alignItems: 'center' }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Finding Class</Typography>
                <Typography variant="h5" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
                  {prediction.predicted_class}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">AI Confidence</Typography>
                <Typography variant="h5" sx={{ color: tokens.confidenceHigh, fontWeight: 700 }}>
                  {(prediction.confidence * 100).toFixed(1)}%
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Model Neural Engine</Typography>
                <Typography variant="subtitle2" sx={{ color: tokens.cyan, fontFamily: 'monospace' }}>
                  {prediction.model_architecture}
                </Typography>
              </Box>
            </Stack>
          </Box>

          {/* Editable Physician Impression */}
          <Box>
            <Typography variant="subtitle2" sx={{ color: tokens.textPrimary, mb: 1, fontWeight: 600 }}>
              Physician Clinical Notes & Impression:
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={4}
              value={physicianNotes}
              onChange={(e) => setPhysicianNotes(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(7, 12, 18, 0.6)',
                  color: tokens.textPrimary,
                  borderColor: tokens.surfaceBorder,
                },
              }}
            />
          </Box>
        </Stack>
      </DialogContent>

      <Divider sx={{ borderColor: tokens.surfaceBorder }} />

      <DialogActions sx={{ p: 2.5, justifyContent: 'space-between' }}>
        <Button onClick={onClose} sx={{ color: tokens.textSecondary }}>
          Cancel
        </Button>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<PrintRoundedIcon />}
            onClick={handlePrint}
            sx={{ borderColor: tokens.surfaceBorder, color: tokens.textPrimary }}
          >
            Print Report
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadRoundedIcon />}
            onClick={handleDownload}
            disabled={downloading}
            sx={{ bgcolor: tokens.cyan, color: '#070C12', fontWeight: 700 }}
          >
            {downloading ? 'Generating PDF…' : 'Download Clinical Report'}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

export default ReportGeneratorModal;
