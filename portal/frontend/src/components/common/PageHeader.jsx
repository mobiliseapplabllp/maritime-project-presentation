import { Box, Typography, Breadcrumbs, Link as MuiLink } from '@mui/material';
import { Link } from 'react-router-dom';

export default function PageHeader({ title, sub, crumbs = [], actions }) {
  return (
    <Box sx={{ mb: 2.5, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <Box>
        {crumbs.length > 0 && (
          <Breadcrumbs sx={{ mb: 0.5, '& .MuiTypography-root, & a': { fontSize: 12.5 } }}>
            {crumbs.map((c, i) => c.to
              ? <MuiLink key={i} component={Link} to={c.to} underline="hover" color="text.secondary">{c.label}</MuiLink>
              : <Typography key={i} color="text.primary" fontSize={12.5}>{c.label}</Typography>)}
          </Breadcrumbs>
        )}
        <Typography variant="h5">{title}</Typography>
        {sub && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{sub}</Typography>}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}
