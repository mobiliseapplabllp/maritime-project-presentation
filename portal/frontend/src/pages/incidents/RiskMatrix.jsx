import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Box, Typography, Skeleton, Stack, ButtonGroup, Button, Tooltip } from '@mui/material';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageHeader from '../../components/common/PageHeader';

/* 5x5 likelihood x consequence risk matrix — initial risk (as reported) next
 * to residual risk (after response/closure), the classic HSE heatmap. */

const CONSEQ = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
const LIKELY = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];

function bandColor(l, c) {
  const score = l * c;
  if (score >= 15) return '#B3452E';
  if (score >= 8) return '#C77B2E';
  if (score >= 4) return '#C7A62E';
  return '#3D8361';
}

function Matrix({ title, cells, days }) {
  const navigate = useNavigate();
  const byKey = Object.fromEntries(cells.map((c) => [`${c.likelihood}:${c.consequence}`, c]));
  return (
    <Card sx={{ p: 2.5, height: '100%' }}>
      <Typography variant="h6" sx={{ fontSize: 15, mb: 0.5 }}>{title}</Typography>
      <Typography variant="caption" color="text.secondary">Cases from the last {days} days</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '92px repeat(5, 1fr)', mt: 2.5, gap: '3px' }}>
        <Box />
        {CONSEQ.map((c) => (
          <Typography key={c} sx={{ fontSize: 9.5, fontWeight: 700, textAlign: 'center', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{c}</Typography>
        ))}
        {[5, 4, 3, 2, 1].map((l) => (
          <Fragment key={l}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.secondary', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 1 }}>
              {LIKELY[l - 1]}
            </Typography>
            {[1, 2, 3, 4, 5].map((c) => {
              const cell = byKey[`${l}:${c}`];
              const n = cell ? cell.count : 0;
              return (
                <Tooltip key={c} title={cell ? cell.sample.map((s) => `${s.number} — ${s.title}`).join('\n') : 'No cases'}>
                  <Box onClick={() => cell && cell.sample[0] && navigate(`/incidents/${cell.sample[0]._id}`)}
                    sx={{
                      bgcolor: bandColor(l, c), opacity: n ? 1 : 0.18, borderRadius: '5px',
                      minHeight: 46, display: 'grid', placeItems: 'center', cursor: n ? 'pointer' : 'default',
                      transition: 'transform .12s', '&:hover': n ? { transform: 'scale(1.04)' } : {},
                    }}>
                    {n > 0 && <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{n}</Typography>}
                  </Box>
                </Tooltip>
              );
            })}
          </Fragment>
        ))}
      </Box>
    </Card>
  );
}

export default function RiskMatrix() {
  const dispatch = useDispatch();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(180);

  useEffect(() => {
    api.get('/incidents/risk-matrix', { params: { days } }).then((r) => setData(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [dispatch, days]);

  if (!data) return <><PageHeader icon={GridViewRoundedIcon} iconColor="#B3452E" title="Risk Matrix" sub="Loading…" /><Skeleton variant="rounded" height={420} /></>;

  return (
    <>
      <PageHeader
        icon={GridViewRoundedIcon} iconColor="#B3452E"
        title="Risk Matrix"
        sub={`${data.total} incidents scored by likelihood (priority) × consequence (severity)`}
        actions={(
          <ButtonGroup size="small" variant="outlined">
            {[90, 180, 365].map((d) => (
              <Button key={d} variant={days === d ? 'contained' : 'outlined'} onClick={() => setDays(d)}>{d === 365 ? '1 year' : `${d} days`}</Button>
            ))}
          </ButtonGroup>
        )}
      />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Box sx={{ flex: 1 }}><Matrix title="Initial risk" cells={data.initial} days={days} /></Box>
        <Box sx={{ flex: 1 }}><Matrix title="Residual risk (after response)" cells={data.residual} days={days} /></Box>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Likelihood is derived from case priority (P1 highest), consequence from severity. Residual risk steps down one band
        on each axis once a case is resolved or closed. Click a populated cell to open a sample case.
      </Typography>
    </>
  );
}
