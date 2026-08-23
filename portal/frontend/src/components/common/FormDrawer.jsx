import { Drawer, Box, Typography, IconButton, Divider, Button } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

/**
 * The standard add/edit slide-over: covers 75% of the viewport from the right,
 * deliberately leaving the module side menu and a slice of context visible.
 */
export default function FormDrawer({ open, title, subtitle, onClose, onSubmit, busy, submitLabel = 'Save', children, width = '75vw', disabled }) {
  return (
    <Drawer
      anchor="right" open={open} onClose={() => !busy && onClose()}
      slotProps={{ paper: { sx: { width, maxWidth: 'calc(100vw - 236px)', minWidth: 340 } } }}
    >
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6">{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
        <IconButton onClick={onClose} disabled={busy}><CloseRoundedIcon /></IconButton>
      </Box>
      <Divider />
      <Box sx={{ p: 3, flex: 1, overflowY: 'auto' }}>{children}</Box>
      {onSubmit && (
        <>
          <Divider />
          <Box sx={{ p: 2, px: 3, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button color="inherit" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="contained" onClick={onSubmit} disabled={busy || disabled}>{submitLabel}</Button>
          </Box>
        </>
      )}
    </Drawer>
  );
}
