import { Alert, AlertTitle, Typography } from '@mui/material';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ReportRoundedIcon from '@mui/icons-material/ReportRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import type { ReactElement } from 'react';

export type BannerVariant = 'normal' | 'low-confidence' | 'flagged' | 'critical' | 'info';

const config: Record<
  BannerVariant,
  { severity: 'success' | 'warning' | 'info' | 'error'; icon: ReactElement; title: string }
> = {
  normal: {
    severity: 'success',
    icon: <CheckCircleRoundedIcon />,
    title: 'AI result available for clinical review.',
  },
  'low-confidence': {
    severity: 'warning',
    icon: <WarningAmberRoundedIcon />,
    title: 'AI confidence is below the configured 70% threshold.',
  },
  flagged: {
    severity: 'info',
    icon: <FlagRoundedIcon />,
    title: 'This result has been flagged for additional review.',
  },
  critical: {
    severity: 'error',
    icon: <ReportRoundedIcon />,
    title: 'High-priority finding requires clinical attention.',
  },
  info: {
    severity: 'info',
    icon: <InfoRoundedIcon />,
    title: 'AI output is decision-support only and does not constitute a final diagnosis.',
  },
};

export function ClinicalSafetyBanner({
  variant,
  message,
  subMessage,
}: {
  variant: BannerVariant;
  message?: string;
  subMessage?: string;
}) {
  const c = config[variant];
  return (
    <Alert
      severity={c.severity}
      icon={c.icon}
      variant="outlined"
      sx={{
        borderRadius: 2,
        alignItems: 'flex-start',
        bgcolor: (theme) =>
          c.severity === 'error'
            ? theme.palette.error.light
            : c.severity === 'warning'
            ? theme.palette.warning.light
            : c.severity === 'success'
            ? theme.palette.success.light
            : theme.palette.info.light,
        '& .MuiAlert-message': { width: '100%' },
      }}
    >
      <AlertTitle sx={{ fontWeight: 700, mb: subMessage ? 0.25 : 0 }}>
        {message ?? c.title}
      </AlertTitle>
      {subMessage && <Typography variant="body2">{subMessage}</Typography>}
    </Alert>
  );
}
