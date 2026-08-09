import { Box, Card, Skeleton, Stack } from '@mui/material';

export function StatCardSkeleton() {
  return (
    <Card sx={{ p: 2.5, borderRadius: 3 }}>
      <Skeleton variant="rounded" width={40} height={40} sx={{ mb: 2, borderRadius: 2 }} />
      <Skeleton variant="text" width="60%" height={16} />
      <Skeleton variant="text" width="40%" height={32} />
    </Card>
  );
}

export function ScanCardSkeleton() {
  return (
    <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Skeleton variant="rectangular" height={150} />
      <Box sx={{ p: 2 }}>
        <Skeleton variant="text" width="70%" height={22} />
        <Skeleton variant="text" width="45%" height={16} />
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Skeleton variant="rounded" width={70} height={22} />
          <Skeleton variant="rounded" width={70} height={22} />
        </Stack>
      </Box>
    </Card>
  );
}

export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <Stack direction="row" spacing={2} sx={{ py: 1.5, px: 2, alignItems: 'center' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} variant="text" width={`${100 / cols}%`} height={20} />
      ))}
    </Stack>
  );
}

export function TimelineItemSkeleton() {
  return (
    <Stack direction="row" spacing={2} sx={{ py: 2 }}>
      <Skeleton variant="circular" width={14} height={14} sx={{ mt: 0.5 }} />
      <Box sx={{ flex: 1 }}>
        <Skeleton variant="text" width="30%" height={18} />
        <Skeleton variant="rounded" width="100%" height={64} sx={{ mt: 1, borderRadius: 2 }} />
      </Box>
    </Stack>
  );
}
