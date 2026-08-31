import { Chip } from '@mui/material';

export default function StatusChip({ value, map, size = 'small' }) {
  const meta = map[value] || { label: value || '—', color: 'default' };
  return <Chip size={size} label={meta.label} color={meta.color} variant={meta.color === 'default' ? 'outlined' : 'filled'}
    sx={{ fontSize: 11.5, height: 22, '& .MuiChip-label': { px: 1 } }} />;
}
