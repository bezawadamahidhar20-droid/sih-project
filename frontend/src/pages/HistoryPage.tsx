import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  Typography,
  Stack,
  TextField,
  MenuItem,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  Grid,
  Chip,
  IconButton,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import TableRowsRoundedIcon from '@mui/icons-material/TableRowsRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { api } from '../services/api';
import { Prediction } from '../types';
import { StatusChip, ConfidenceBadge, FindingChip } from '../components/common/StatusChip';
import { EmptyState } from '../components/common/EmptyState';
import { ScanCardSkeleton } from '../components/common/Skeletons';
import { AuthImage } from '../components/common/AuthImage';

// Renders the thumbnail only when the card scrolls near the viewport, so a
// 200-row history does not fire 200 authenticated image downloads at once.
function LazyThumb({ src, alt }: { src?: string | null; alt: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Box ref={ref} sx={{ height: '100%' }}>
      {inView ? <AuthImage src={src} alt={alt} objectFit="cover" /> : null}
    </Box>
  );
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [flagFilter, setFlagFilter] = useState('all');
  const [view, setView] = useState<'grid' | 'table'>('grid');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getPredictions({ page_size: 200 })
      .then((res) => active && setPredictions(res.predictions))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const classes = useMemo(() => Array.from(new Set(predictions.map((p) => p.predicted_class))), [predictions]);

  const filtered = useMemo(() => {
    return predictions.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const hay = `${p.scan?.anonymized_patient_id ?? ''} ${p.scan?.original_filename ?? ''} ${p.predicted_class}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (classFilter !== 'all' && p.predicted_class !== classFilter) return false;
      if (flagFilter === 'flagged' && !p.is_flagged) return false;
      if (flagFilter === 'low-confidence' && !p.is_low_confidence) return false;
      if (flagFilter === 'high-risk' && !p.is_high_risk) return false;
      return true;
    });
  }, [predictions, search, classFilter, flagFilter]);

  const columns: GridColDef<Prediction>[] = [
    {
      field: 'patient',
      headerName: 'Patient ID',
      flex: 1,
      valueGetter: (_, row) => row.scan?.anonymized_patient_id ?? '—',
    },
    {
      field: 'original_filename',
      headerName: 'File',
      flex: 1.4,
      valueGetter: (_, row) => row.scan?.original_filename ?? `Scan #${row.scan_id}`,
    },
    {
      field: 'predicted_class',
      headerName: 'Finding',
      flex: 1,
      renderCell: (params) => <FindingChip predictedClass={params.row.predicted_class} />,
    },
    {
      field: 'confidence',
      headerName: 'Confidence',
      flex: 1,
      renderCell: (params) => <ConfidenceBadge confidence={params.row.confidence} />,
    },
    {
      field: 'status',
      headerName: 'Status',
      flex: 1,
      renderCell: (params) => <StatusChip status={params.row.is_flagged ? 'flagged' : 'completed'} />,
    },
    {
      field: 'created_at',
      headerName: 'Date',
      flex: 1,
      valueGetter: (_, row) => new Date(row.created_at).toLocaleDateString(),
    },
    {
      field: 'actions',
      headerName: '',
      width: 60,
      sortable: false,
      renderCell: (params) => (
        <IconButton size="small" onClick={() => navigate(`/results/${params.row.scan_id}`)}>
          <VisibilityRoundedIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h2">Scan History</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {filtered.length} of {predictions.length} predictions
          </Typography>
        </Box>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
          <ToggleButton value="grid"><GridViewRoundedIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="table"><TableRowsRoundedIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Card sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            size="small"
            placeholder="Search by patient ID, filename, finding…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField size="small" select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="all">All findings</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </TextField>
          <TextField size="small" select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="all">All statuses</MenuItem>
            <MenuItem value="flagged">Flagged</MenuItem>
            <MenuItem value="low-confidence">Low confidence</MenuItem>
            <MenuItem value="high-risk">High risk</MenuItem>
          </TextField>
        </Stack>
      </Card>

      {loading ? (
        <Grid container spacing={2.5}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <ScanCardSkeleton />
            </Grid>
          ))}
        </Grid>
      ) : filtered.length === 0 ? (
        <Card sx={{ borderRadius: 3 }}>
          <EmptyState icon={ImageRoundedIcon} title="No matching scans" description="Try adjusting your search or filters." />
        </Card>
      ) : view === 'table' ? (
        <Card sx={{ borderRadius: 3, p: 1 }}>
          <DataGrid
            autoHeight
            rows={filtered}
            columns={columns}
            disableRowSelectionOnClick
            onRowClick={(params) => navigate(`/results/${params.row.scan_id}`)}
            sx={{ border: 'none', '& .MuiDataGrid-row': { cursor: 'pointer' } }}
            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            pageSizeOptions={[10, 25, 50]}
          />
        </Card>
      ) : (
        <Grid container spacing={2.5}>
          {filtered.map((p) => (
            <Grid key={p.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Card
                sx={{
                  borderRadius: 3,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'box-shadow .2s, transform .2s',
                  '&:hover': {
                    boxShadow: '0 14px 28px -10px rgba(15,36,48,0.2)',
                    transform: 'translateY(-3px)',
                  },
                  border: p.is_flagged ? '1.5px solid' : undefined,
                  borderColor: p.is_flagged ? 'info.main' : undefined,
                }}
                onClick={() => navigate(`/results/${p.scan_id}`)}
              >
                <Box sx={{ height: 140, bgcolor: '#0b1620', backgroundImage: 'linear-gradient(135deg, #0b1620 0%, #12283a 100%)' }}>
                  <LazyThumb src={p.gradcam_url} alt={p.predicted_class} />
                </Box>
                <Box sx={{ p: 2 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                      {p.scan?.anonymized_patient_id ?? 'Unknown patient'}
                    </Typography>
                    <StatusChip status={p.is_flagged ? 'flagged' : 'completed'} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.25 }}>
                    {p.scan?.original_filename ?? `Scan #${p.scan_id}`}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                    <FindingChip predictedClass={p.predicted_class} />
                    <ConfidenceBadge confidence={p.confidence} />
                  </Stack>
                  {(p.is_low_confidence || p.is_high_risk) && (
                    <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap' }}>
                      {p.is_low_confidence && <Chip size="small" label="Low confidence" color="warning" variant="outlined" />}
                      {p.is_high_risk && <Chip size="small" label="High risk" color="error" variant="outlined" />}
                    </Stack>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
