import { Chip, ChipProps, Box, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import HourglassBottomRoundedIcon from '@mui/icons-material/HourglassBottomRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import { ScanStatus } from '../../types';
import { theme } from '../../theme';

const statusConfig: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  uploaded: {
    label: 'Uploaded',
    color: theme.palette.grey[700],
    bg: theme.palette.grey[100],
    icon: <CloudUploadRoundedIcon sx={{ fontSize: 14 }} />,
  },
  processing: {
    label: 'Processing',
    color: theme.palette.warning.dark,
    bg: theme.palette.warning.light,
    icon: <HourglassBottomRoundedIcon sx={{ fontSize: 14 }} />,
  },
  completed: {
    label: 'Predicted',
    color: theme.palette.success.dark,
    bg: theme.palette.success.light,
    icon: <CheckCircleRoundedIcon sx={{ fontSize: 14 }} />,
  },
  failed: {
    label: 'Failed',
    color: theme.palette.error.dark,
    bg: theme.palette.error.light,
    icon: <ErrorRoundedIcon sx={{ fontSize: 14 }} />,
  },
  flagged: {
    label: 'Flagged',
    color: theme.palette.info.dark,
    bg: theme.palette.info.light,
    icon: <FlagRoundedIcon sx={{ fontSize: 14 }} />,
  },
};

export function StatusChip({
  status,
  size = 'small',
}: {
  status: ScanStatus | string;
  size?: ChipProps['size'];
}) {
  const config = statusConfig[status] ?? {
    label: status,
    color: theme.palette.grey[700],
    bg: theme.palette.grey[100],
    icon: null,
  };
  return (
    <Chip
      size={size}
      icon={config.icon as any}
      label={config.label}
      sx={{
        bgcolor: config.bg,
        color: config.color,
        '& .MuiChip-icon': { color: config.color, ml: '6px' },
        border: '1px solid transparent',
      }}
    />
  );
}

export function ConfidenceBadge({
  confidence,
  size = 'small',
}: {
  confidence: number;
  size?: ChipProps['size'];
}) {
  const pct = Math.round(confidence * 100);
  let color = theme.palette.success.dark;
  let bg = theme.palette.success.light;
  if (pct < 70) {
    color = theme.palette.error.dark;
    bg = theme.palette.error.light;
  } else if (pct < 85) {
    color = theme.palette.warning.dark;
    bg = theme.palette.warning.light;
  }
  return (
    <Chip
      size={size}
      label={`${pct}% confidence`}
      sx={{ bgcolor: bg, color, fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

export function FindingChip({
  predictedClass,
  size = 'small',
}: {
  predictedClass: string;
  size?: ChipProps['size'];
}) {
  const isNormal = predictedClass === 'Normal';
  return (
    <Chip
      size={size}
      label={predictedClass}
      variant={isNormal ? 'outlined' : 'filled'}
      sx={
        isNormal
          ? { borderColor: theme.palette.divider, color: theme.palette.text.secondary }
          : { bgcolor: theme.palette.primary.dark, color: '#fff' }
      }
    />
  );
}

export function ClinicalFlagsRow({
  isLowConfidence,
  isHighRisk,
  isFlagged,
}: {
  isLowConfidence?: boolean;
  isHighRisk?: boolean;
  isFlagged?: boolean;
}) {
  if (!isLowConfidence && !isHighRisk && !isFlagged) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <CheckCircleRoundedIcon sx={{ fontSize: 15, color: 'success.main' }} />
        <Typography variant="caption" color="text.secondary">
          No flags
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
      {isFlagged && (
        <Chip size="small" icon={<FlagRoundedIcon sx={{ fontSize: 13 }} />} label="Flagged" color="info" variant="outlined" />
      )}
      {isLowConfidence && (
        <Chip size="small" label="Low confidence" color="warning" variant="outlined" />
      )}
      {isHighRisk && <Chip size="small" label="High risk" color="error" variant="outlined" />}
    </Box>
  );
}
