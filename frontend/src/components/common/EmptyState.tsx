import { Box, Typography, SvgIconProps } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon: React.ComponentType<SvgIconProps>;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py: 8,
        px: 3,
      }}
    >
      <Box
        sx={{
          width: 68,
          height: 68,
          borderRadius: '20px',
          bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
          border: '1px dashed',
          borderColor: (t) => alpha(t.palette.primary.main, 0.28),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 2.5,
          transition: 'transform .2s ease',
        }}
      >
        <Icon sx={{ fontSize: 30, color: (t) => alpha(t.palette.primary.main, 0.7) }} />
      </Box>
      <Typography variant="subtitle1" color="text.primary">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 380 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 3 }}>{action}</Box>}
    </Box>
  );
}
