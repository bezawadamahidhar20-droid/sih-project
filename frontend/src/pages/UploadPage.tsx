import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Divider,
  Grid,
  Chip,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  ShieldOutlined,
  LockOutlined,
  CheckCircleOutlineOutlined,
  InfoOutlined,
  MedicalInformationOutlined,
  ScheduleOutlined,
} from '@mui/icons-material';
import { UploadZone } from '../components/UploadZone';
import { Scan } from '../types';

export function UploadPage() {
  const navigate = useNavigate();
  const [lastScan, setLastScan] = useState<Scan | null>(null);
  const [notice, setNotice] = useState('');

  const handleUploaded = (scan: Scan) => {
    setLastScan(scan);
    setNotice(`"${scan.original_filename}" uploaded successfully.`);
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
          Upload Medical Scan
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Chest X-ray or CT scan (JPEG, PNG, DICOM) — PHI is stripped automatically
        </Typography>
      </Box>

      {notice && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}

      {lastScan && (
        <Alert severity="info" icon={<ScheduleOutlined />} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2">
              Ready to run the diagnostic model on <strong>{lastScan.original_filename}</strong>?
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<MedicalInformationOutlined />}
              onClick={() => navigate(`/results/${lastScan.id}`)}
            >
              Analyze scan
            </Button>
          </Box>
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="overline" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
                Scan upload
              </Typography>
              <UploadZone
                onUploaded={handleUploaded}
                onError={() => setNotice('')}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
                  Accepted formats
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {['JPEG', 'PNG', 'DICOM'].map((fmt) => (
                    <Chip key={fmt} label={fmt} size="small" variant="outlined" />
                  ))}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                  Maximum 50MB per file. Multiple files allowed.
                </Typography>

                <Divider sx={{ my: 2 }} />

                <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Guidelines
                </Typography>
                <List dense disablePadding>
                  {[
                    'Chest X-rays — PA/AP views preferred',
                    'CT scans — lung window settings',
                    'DICOM files with intact pixel data',
                    'Facing correct orientation (no rotation)',
                  ].map((tip) => (
                    <ListItem key={tip} sx={{ px: 0, py: 0.25 }}>
                      <ListItemIcon sx={{ minWidth: 28, color: 'text.secondary' }}>
                        <CheckCircleOutlineOutlined sx={{ fontSize: 16 }} />
                      </ListItemIcon>
                      <ListItemText primary={<Typography variant="caption" color="text.secondary">{tip}</Typography>} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Privacy
                </Typography>
                <List dense disablePadding>
                  {[
                    { icon: <ShieldOutlined />, text: 'PHI stripped from DICOM metadata before processing' },
                    { icon: <LockOutlined />, text: 'Files encrypted at rest (AES-256) after upload' },
                    { icon: <InfoOutlined />, text: 'Diagnostic results are decision-support only' },
                  ].map((item) => (
                    <ListItem key={item.text} sx={{ px: 0, py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 30, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
                      <ListItemText primary={<Typography variant="caption" color="text.secondary">{item.text}</Typography>} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
