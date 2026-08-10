import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { MotionConfig } from 'motion/react';
import { theme } from './theme';
import { AuthProvider } from './context/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { UploadPage } from './pages/UploadPage';
import { ResultsPage } from './pages/ResultsPage';
import { HistoryPage } from './pages/HistoryPage';
import { PatientsPage } from './pages/PatientsPage';
import { PatientHistoryPage } from './pages/PatientHistoryPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* Apple-style motion: springs everywhere, but honor prefers-reduced-motion */}
      <MotionConfig reducedMotion="user">
      <SnackbarProvider maxSnack={4} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} autoHideDuration={3500}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
              <Route path="/upload" element={<PrivateRoute><UploadPage /></PrivateRoute>} />
              <Route path="/results/:scanId" element={<PrivateRoute><ResultsPage /></PrivateRoute>} />
              <Route path="/history" element={<PrivateRoute><HistoryPage /></PrivateRoute>} />
              <Route path="/patients" element={<PrivateRoute><PatientsPage /></PrivateRoute>} />
              <Route path="/patients/:patientId" element={<PrivateRoute><PatientHistoryPage /></PrivateRoute>} />
              <Route path="/review" element={<PrivateRoute><ReviewQueuePage /></PrivateRoute>} />
              <Route path="/audit-logs" element={<PrivateRoute><AuditLogsPage /></PrivateRoute>} />
              <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </SnackbarProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
