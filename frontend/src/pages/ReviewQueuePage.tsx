import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { Box, Card, Typography, Stack, Chip, Button, ToggleButtonGroup, ToggleButton, Divider } from '@mui/material';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import ReportRoundedIcon from '@mui/icons-material/ReportRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { api } from '../services/api';
import { Prediction } from '../types';
import { EmptyState } from '../components/common/EmptyState';
import { ScanCardSkeleton } from '../components/common/Skeletons';
import { ConfidenceBadge, FindingChip } from '../components/common/StatusChip';

type FilterKey = 'all' | 'flagged' | 'low-confidence' | 'high-risk';

export function ReviewQueuePage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = () => {
    setLoading(true);
    api
      .getPredictions({ page_size: 300 })
      .then((res) =>
        setPredictions(res.predictions.filter((p) => p.is_flagged || p.is_low_confidence || p.is_high_risk))
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return predictions.filter((p) => {
      if (filter === 'flagged') return p.is_flagged;
      if (filter === 'low-confidence') return p.is_low_confidence;
      if (filter === 'high-risk') return p.is_high_risk;
      return true;
    });
  }, [predictions, filter]);

  const handleFlag = async (p: Prediction) => {
    try {
      await api.flagPrediction(p.id, !p.is_flagged);
      enqueueSnackbar(!p.is_flagged ? 'Flagged for review' : 'Flag removed', { variant: 'success' });
      load();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.detail || 'Action failed', { variant: 'error' });
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h2">Review Queue</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Flagged, low-confidence & high-risk cases requiring clinical attention
        </Typography>
      </Box>

      <ToggleButtonGroup size="small" exclusive value={filter} onChange={(_, v) => v && setFilter(v)}>
        <ToggleButton value="all">All ({predictions.length})</ToggleButton>
        <ToggleButton value="flagged">Flagged ({predictions.filter((p) => p.is_flagged).length})</ToggleButton>
        <ToggleButton value="low-confidence">Low confidence ({predictions.filter((p) => p.is_low_confidence).length})</ToggleButton>
        <ToggleButton value="high-risk">High risk ({predictions.filter((p) => p.is_high_risk).length})</ToggleButton>
      </ToggleButtonGroup>

      {loading ? (
        <Stack spacing={2}>
          {Array.from({ length: 4 }).map((_, i) => (
            <ScanCardSkeleton key={i} />
          ))}
        </Stack>
      ) : filtered.length === 0 ? (
        <Card sx={{ borderRadius: 3 }}>
          <EmptyState icon={CheckCircleRoundedIcon} title="All clear" description="No cases currently require additional clinical review." />
        </Card>
      ) : (
        <Card sx={{ borderRadius: 3 }}>
          <Stack divider={<Divider />}>
            {filtered.map((p) => (
              <Stack
                key={p.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{ p: 2.5, alignItems: { sm: 'center' }, transition: 'background-color .15s', '&:hover': { bgcolor: 'grey.50' } }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {p.scan?.anonymized_patient_id ?? '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {p.scan?.original_filename ?? `Scan #${p.scan_id}`}
                  </Typography>
                </Box>
                <FindingChip predictedClass={p.predicted_class} />
                <ConfidenceBadge confidence={p.confidence} />
                <Chip
                  size="small"
                  icon={p.is_high_risk ? <ReportRoundedIcon sx={{ fontSize: 14 }} /> : undefined}
                  label={p.is_high_risk ? 'CRITICAL' : p.is_low_confidence ? 'HIGH' : 'NORMAL'}
                  color={p.is_high_risk ? 'error' : p.is_low_confidence ? 'warning' : 'default'}
                  variant="outlined"
                />
                <Typography variant="caption" color="text.secondary" sx={{ width: 120 }}>
                  {p.flagged_at ? new Date(p.flagged_at).toLocaleDateString() : '—'}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" startIcon={<VisibilityRoundedIcon />} onClick={() => navigate(`/results/${p.scan_id}`)}>
                    View
                  </Button>
                  <Button
                    size="small"
                    variant={p.is_flagged ? 'outlined' : 'contained'}
                    color="info"
                    startIcon={<FlagRoundedIcon />}
                    onClick={() => handleFlag(p)}
                  >
                    {p.is_flagged ? 'Unflag' : 'Flag'}
                  </Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
