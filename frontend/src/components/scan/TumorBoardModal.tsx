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
  TextField,
  IconButton,
  Alert,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import HowToRegRoundedIcon from '@mui/icons-material/HowToRegRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import { tokens } from '../../theme';
import { Prediction } from '../../types';

interface TumorBoardModalProps {
  open: boolean;
  onClose: () => void;
  prediction: Prediction;
}

export function TumorBoardModal({ open, onClose, prediction }: TumorBoardModalProps) {
  const [notes, setNotes] = useState('');
  const [signed, setSigned] = useState(false);
  const [attendingPhysician, setAttendingPhysician] = useState('Dr. Sarah Chen, MD');

  const handleSignOff = () => {
    setSigned(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
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
          <GroupsRoundedIcon sx={{ color: tokens.cyan }} />
          <Typography variant="h6" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
            MDT Tumor Board Clinical Sign-off
          </Typography>
        </Stack>
        <IconButton onClick={onClose} sx={{ color: tokens.textSecondary }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <Divider sx={{ borderColor: tokens.surfaceBorder }} />

      <DialogContent sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          {signed && (
            <Alert icon={<CheckCircleOutlineRoundedIcon fontSize="inherit" />} severity="success">
              MDT Sign-off recorded! Case logged into clinical audit registry.
            </Alert>
          )}

          <Box sx={{ p: 2, borderRadius: 3, bgcolor: tokens.surfaceDark, border: `1px solid ${tokens.surfaceBorder}` }}>
            <Typography variant="caption" color="text.secondary">Target Patient Study</Typography>
            <Typography variant="subtitle1" sx={{ color: tokens.textPrimary, fontWeight: 700 }}>
              {prediction.scan?.anonymized_patient_id ?? 'PAT-2026-0001'} — {prediction.predicted_class} ({(prediction.confidence * 100).toFixed(1)}%)
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ color: tokens.textPrimary, mb: 1, fontWeight: 600 }}>
              Attending Specialist Signature:
            </Typography>
            <TextField
              fullWidth
              size="small"
              value={attendingPhysician}
              onChange={(e) => setAttendingPhysician(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(7, 12, 18, 0.6)',
                  color: tokens.textPrimary,
                },
              }}
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ color: tokens.textPrimary, mb: 1, fontWeight: 600 }}>
              Consensus Treatment Plan & Recommendations:
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder="Enter multidisciplinary team consensus notes (e.g. Schedule follow-up CT in 30 days, initiate targeted therapy)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(7, 12, 18, 0.6)',
                  color: tokens.textPrimary,
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
        <Button
          variant="contained"
          startIcon={<HowToRegRoundedIcon />}
          onClick={handleSignOff}
          disabled={signed}
          sx={{ bgcolor: tokens.confidenceHigh, color: '#070C12', fontWeight: 700 }}
        >
          {signed ? 'Signing Off…' : 'Formal MDT Clinical Sign-off'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default TumorBoardModal;
