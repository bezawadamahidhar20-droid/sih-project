import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { AppShell } from './layout/AppShell';

export function PrivateRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">
            Loading MediScan AI…
          </Typography>
        </Stack>
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell>{children}</AppShell>;
}
