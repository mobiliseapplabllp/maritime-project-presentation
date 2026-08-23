import { useEffect, useState } from 'react';
import { Box, Card, Typography, Skeleton } from '@mui/material';
import api from '../../api/client';

const TONE = { default: 'text.primary', success: 'success.main', warning: 'warning.main', error: 'error.main' };

/** Compact per-page stat strip. Pass a stats `scope` (fetched from /stats/:scope)
 *  or ready-made `cards`. `refreshKey` refetches after CRUD actions. */
export default function PageStats({ scope, cards: given, refreshKey = 0 }) {
  const [cards, setCards] = useState(given || null);
  useEffect(() => {
    if (given) { setCards(given); return; }
    let on = true;
    api.get(`/stats/${scope}`).then((r) => { if (on) setCards(r.data.cards); }).catch(() => { if (on) setCards([]); });
    return () => { on = false; };
  }, [scope, refreshKey, given]);

  if (cards && cards.length === 0) return null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, gap: 1.5, mb: 2 }}>
      {(cards || Array.from({ length: 4 })).map((c, i) => (
        <Card key={c ? c.label : i} sx={{ px: 1.75, py: 1.25 }}>
          {c ? (
            <>
              <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 20, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', color: TONE[c.tone] || 'text.primary' }}>
                {c.value}
              </Typography>
              <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mt: 0.25 }}>
                {c.label}
              </Typography>
              {c.sub && <Typography sx={{ fontSize: 11, color: 'text.secondary' }} noWrap>{c.sub}</Typography>}
            </>
          ) : <Skeleton height={52} />}
        </Card>
      ))}
    </Box>
  );
}
