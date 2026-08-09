import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  Typography,
  Stack,
  Grid,
  IconButton,
  Divider,
  Button,
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ReportRoundedIcon from '@mui/icons-material/ReportRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { api } from '../services/api';
import { Prediction } from '../types';
import { EmptyState } from '../components/common/EmptyState';
import { TimelineItemSkeleton } from '../components/common/Skeletons';
import { ConfidenceBadge, FindingChip } from '../components/common/StatusChip';

export function PatientHistoryPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Prediction | null>(null);

  useEffect(() => {
    if (!patientId) return;
    let active = true;
    setLoading(true);
    api
      .getPatientHistory(patientId)
      .then((data) => {
        if (!active) return;
        const sorted = [...data].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setHistory(sorted);
        setSelected(sorted[sorted.length - 1] ?? null);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [patientId]);

  const chartData = history.map((p) => ({
    date: new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    confidence: Math.round(p.confidence * 100),
    finding: p.predicted_class,
  }));

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <IconButton onClick={() => navigate('/patients')}>
          <ArrowBackRoundedIcon />
        </IconButton>
        <Box>
          <Typography variant="h2">{patientId}</Typography>
          <Typography variant="body2" color="text.secondary">
            Longitudinal prediction history — {history.length} record{history.length === 1 ? '' : 's'}
          </Typography>
        </Box>
      </Stack>

      {loading ? (
        <Stack spacing={0}>
          {[1, 2, 3].map((i) => (
            <TimelineItemSkeleton key={i} />
          ))}
        </Stack>
      ) : history.length === 0 ? (
        <Card sx={{ borderRadius: 3 }}>
          <EmptyState icon={WarningAmberRoundedIcon} title="No history found" description="This patient has no recorded predictions yet." />
        </Card>
      ) : (
        <>
          {chartData.length > 1 && (
            <Card sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>Confidence Trend</Typography>
              <Box sx={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e9ee" />
                    <XAxis dataKey="date" fontSize={12} stroke="#84979f" />
                    <YAxis domain={[0, 100]} fontSize={12} stroke="#84979f" />
                    <ChartTooltip
                      formatter={(value: any, _name, item: any) => [`${value}% (${item.payload.finding})`, 'Confidence']}
                    />
                    <ReferenceLine y={70} stroke="#b7791f" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="confidence" stroke="#0f5c8c" strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Card>
          )}

          <Grid container spacing={3}>
            {/* Timeline */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ p: 3, borderRadius: 3, height: '100%' }}>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>Scan Timeline ({history.length})</Typography>
                <Box sx={{ position: 'relative', pl: 3 }}>
                  <Box sx={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: '2px', bgcolor: 'divider' }} />
                  <Stack spacing={2.5}>
                    {[...history].reverse().map((p) => {
                      const isSelected = selected?.id === p.id;
                      return (
                        <Box key={p.id} sx={{ position: 'relative', cursor: 'pointer' }} onClick={() => setSelected(p)}>
                          <Box
                            sx={{
                              position: 'absolute',
                              left: -24,
                              top: 4,
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              bgcolor: p.is_flagged ? 'info.main' : p.is_high_risk ? 'error.main' : p.is_low_confidence ? 'warning.main' : 'success.main',
                              border: '2px solid #fff',
                              boxShadow: '0 0 0 1px #e2e9ee',
                            }}
                          />
                          <Card
                            variant="outlined"
                            sx={{
                              p: 1.75,
                              borderRadius: 2,
                              bgcolor: isSelected ? 'grey.50' : 'background.paper',
                              borderColor: isSelected ? 'primary.main' : 'divider',
                            }}
                          >
                            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" color="text.secondary">
                                {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </Typography>
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/results/${p.scan_id}`); }}>
                                <VisibilityRoundedIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Stack>
                            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                              <FindingChip predictedClass={p.predicted_class} />
                              <ConfidenceBadge confidence={p.confidence} />
                            </Stack>
                          </Card>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              </Card>
            </Grid>

            {/* Detail panel */}
            <Grid size={{ xs: 12, md: 6 }}>
              {selected && (
                <Card sx={{ p: 3, borderRadius: 3 }}>
                  <Stack spacing={2}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="h4">{selected.predicted_class}</Typography>
                      <ConfidenceBadge confidence={selected.confidence} size="medium" />
                    </Stack>

                    <Divider />

                    <Stack spacing={1.25}>
                      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Date</Typography>
                        <Typography variant="body2">
                          {new Date(selected.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                        </Typography>
                      </Stack>
                      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Scan file</Typography>
                        <Typography variant="body2">{selected.scan?.original_filename ?? '—'}</Typography>
                      </Stack>
                      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">AI Engine</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{selected.model_architecture}</Typography>
                      </Stack>
                    </Stack>

                    <Button variant="contained" onClick={() => navigate(`/results/${selected.scan_id}`)}>
                      View Full Diagnostic Result
                    </Button>

                    <Divider />

                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Clinical Status</Typography>
                      <Stack spacing={1}>
                        {selected.is_flagged && (
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <FlagRoundedIcon fontSize="small" color="info" />
                            <Typography variant="body2">
                              Flagged for review
                              {selected.flagged_at && (
                                <Typography component="span" variant="caption" color="text.secondary">
                                  {' '}· {new Date(selected.flagged_at).toLocaleDateString()}
                                </Typography>
                              )}
                            </Typography>
                          </Stack>
                        )}
                        {selected.is_low_confidence && (
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <WarningAmberRoundedIcon fontSize="small" color="warning" />
                            <Typography variant="body2">Low confidence — clinical review recommended</Typography>
                          </Stack>
                        )}
                        {selected.is_high_risk && (
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <ReportRoundedIcon fontSize="small" color="error" />
                            <Typography variant="body2">High-risk finding</Typography>
                          </Stack>
                        )}
                        {!selected.is_flagged && !selected.is_low_confidence && !selected.is_high_risk && (
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <CheckCircleRoundedIcon fontSize="small" color="success" />
                            <Typography variant="body2">No clinical flags</Typography>
                          </Stack>
                        )}
                      </Stack>
                    </Box>
                  </Stack>
                </Card>
              )}
            </Grid>
          </Grid>
        </>
      )}
    </Stack>
  );
}
