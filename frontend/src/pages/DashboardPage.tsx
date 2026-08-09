import React, { useEffect, useState } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Alert,
  Button,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  UploadOutlined,
  MedicalInformationOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ErrorOutlined,
  RefreshOutlined,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Scan, Prediction, ScanStatus } from '../types';
import { formatDistanceToNow } from 'date-fns';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  trend?: string;
}

function StatCard({ title, value, icon, color, trend }: StatCardProps) {
  const theme = useTheme();
  const c = theme.palette[color];
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
              {value}
            </Typography>
            {trend && <Typography variant="caption" color={c.main}>{trend}</Typography>}
          </Box>
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              backgroundColor: `${c.light}20`,
              color: c.main,
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalScans: 0,
    completedScans: 0,
    processingScans: 0,
    abnormalFindings: 0,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [scansRes, predictionsRes] = await Promise.all([
        api.getScans({ page_size: 100 }),
        api.getPredictions({ page_size: 100 }),
      ]);
      setScans(scansRes.scans);
      setPredictions(predictionsRes.predictions);

      const totalScans = scansRes.total;
      const completedScans = scansRes.scans.filter(s => s.status === 'completed').length;
      const processingScans = scansRes.scans.filter(s => s.status === 'processing').length;
      const abnormalFindings = predictionsRes.predictions.filter(
        p => p.predicted_class !== 'Normal' && p.confidence > 0.5
      ).length;

      setStats({ totalScans, completedScans, processingScans, abnormalFindings });
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getStatusColor = (status: ScanStatus) => {
    switch (status) {
      case 'completed': return 'success';
      case 'processing': return 'warning';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: ScanStatus) => {
    switch (status) {
      case 'completed': return <CheckCircleOutlined fontSize="small" />;
      case 'processing': return <CircularProgress size={16} thickness={3} />;
      case 'failed': return <ErrorOutlined fontSize="small" />;
      default: return <MedicalInformationOutlined fontSize="small" />;
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  const recentScans = scans.slice(0, 5);
  const recentPredictions = predictions.slice(0, 5);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Overview of scans and predictions
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} disabled={loading}>
            <RefreshOutlined />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            title="Total Scans"
            value={stats.totalScans}
            icon=<MedicalInformationOutlined fontSize="large" />
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            title="Completed"
            value={stats.completedScans}
            icon=<CheckCircleOutlined fontSize="large" />
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            title="Processing"
            value={stats.processingScans}
            icon=<CircularProgress size={24} thickness={3} color="warning" />
            color="warning"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            title="Abnormal Findings"
            value={stats.abnormalFindings}
            icon=<WarningOutlined fontSize="large" />
            color="error"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ pb: 0 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>
                  Recent Scans
                </Typography>
                <Button
                  size="small"
                  startIcon={<UploadOutlined />}
                  onClick={() => navigate('/upload')}
                >
                  Upload New
                </Button>
              </Box>
              {recentScans.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <UploadOutlined sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="body1" color="text.secondary" gutterBottom>
                    No scans uploaded yet
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<UploadOutlined />}
                    onClick={() => navigate('/upload')}
                  >
                    Upload First Scan
                  </Button>
                </Box>
              ) : (
                <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {recentScans.map((scan) => (
                    <Box
                      key={scan.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 2,
                        borderBottom: 1,
                        borderColor: 'divider',
                        '&:last-child': { borderBottom: 0 },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {scan.original_filename}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {scan.anonymized_patient_id ? `Patient: ${scan.anonymized_patient_id}` : 'No patient ID'}
                          {' | '}
                          {formatDistanceToNow(new Date(scan.created_at), { addSuffix: true })}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
                        <Chip
                          icon={getStatusIcon(scan.status)}
                          label={scan.status}
                          size="small"
                          color={getStatusColor(scan.status)}
                          variant="outlined"
                        />
                        {scan.status === 'completed' && (
                          <Button
                            size="small"
                            onClick={() => navigate(`/results/${scan.id}`)}
                          >
                            View
                          </Button>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ pb: 0 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Recent Predictions
              </Typography>
              {recentPredictions.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <MedicalInformationOutlined sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="body1" color="text.secondary">
                    No predictions available yet
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {recentPredictions.map((pred) => (
                    <Box
                      key={pred.id}
                      sx={{
                        p: 2,
                        borderBottom: 1,
                        borderColor: 'divider',
                        '&:last-child': { borderBottom: 0 },
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {pred.predicted_class}
                        </Typography>
                        <Chip
                          label={`${(pred.confidence * 100).toFixed(1)}%`}
                          size="small"
                          color={
                            pred.confidence >= 0.9 ? 'success' :
                            pred.confidence >= 0.7 ? 'primary' :
                            pred.confidence >= 0.5 ? 'warning' : 'error'
                          }
                          variant="outlined"
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {formatDistanceToNow(new Date(pred.created_at), { addSuffix: true })}
                        {pred.is_low_confidence && ' • Low confidence'}
                        {pred.is_high_risk && ' • High risk'}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}