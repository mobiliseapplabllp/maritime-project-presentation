import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Menu, MenuItem, ListItemIcon, CircularProgress } from '@mui/material';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';
import GridOnRoundedIcon from '@mui/icons-material/GridOnRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import { notify } from '../../store/uiSlice';
import { exportExcel, exportPdf, exportCsv } from '../../utils/exportUtils';

/* Export dropdown for any register/master: Excel · PDF · CSV.
 * getRows loads the full (unpaginated) dataset when the user picks a format. */
export default function ExportMenu({ name, title, columns, getRows, landscape = true, size = 'small' }) {
  const [anchor, setAnchor] = useState(null);
  const [busy, setBusy] = useState(false);
  const dispatch = useDispatch();

  const run = async (kind) => {
    setAnchor(null); setBusy(true);
    try {
      const rows = await getRows();
      const cols = columns.filter((c) => !c.noExport);
      if (kind === 'xlsx') await exportExcel({ name, sheets: [{ name: title || name, columns: cols, rows }] });
      if (kind === 'pdf') await exportPdf({ name, title: title || name, sections: [{ columns: cols, rows }], landscape });
      if (kind === 'csv') await exportCsv({ name, columns: cols, rows });
      dispatch(notify(`${kind.toUpperCase()} export ready — ${rows.length} rows`));
    } catch (e) {
      dispatch(notify({ message: e.message || 'Export failed', severity: 'error' }));
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button size={size} variant="outlined" startIcon={busy ? <CircularProgress size={14} /> : <IosShareRoundedIcon sx={{ fontSize: 16 }} />}
        onClick={(e) => setAnchor(e.currentTarget)} disabled={busy}>
        Export
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => run('xlsx')}><ListItemIcon><GridOnRoundedIcon fontSize="small" /></ListItemIcon>Excel (.xlsx)</MenuItem>
        <MenuItem onClick={() => run('pdf')}><ListItemIcon><PictureAsPdfRoundedIcon fontSize="small" /></ListItemIcon>PDF</MenuItem>
        <MenuItem onClick={() => run('csv')}><ListItemIcon><DescriptionRoundedIcon fontSize="small" /></ListItemIcon>CSV</MenuItem>
      </Menu>
    </>
  );
}
