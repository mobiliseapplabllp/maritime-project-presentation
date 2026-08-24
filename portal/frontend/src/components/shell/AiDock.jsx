/* In-portal assistant drawer — currently UNWIRED.
 *
 * The floating AI button now hands off to Sagar Drishti (see src/aiPortal.js),
 * which is the richer AI surface. This component is kept because it does
 * something Sagar Drishti does not: it answers from this portal's live records
 * and returns links that navigate straight to the citing screen. To restore it,
 * import it in AppShell.jsx and render <AiDock open={…} onClose={…} /> behind
 * its own trigger.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Drawer, Box, Typography, IconButton, TextField, Chip, Stack, Divider, keyframes,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import api from '../../api/client';
import { ADANI_GRADIENT } from '../../theme';

const blink = keyframes`0%,80%,100%{opacity:.25}40%{opacity:1}`;

/* Minimal safe renderer for the assistant's markdown-ish replies (**bold**, bullets, newlines). */
function Rich({ text }) {
  const lines = String(text).split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? <b key={j}>{p.slice(2, -2)}</b> : p);
        return <Typography key={i} sx={{ fontSize: 13.5, lineHeight: 1.55, minHeight: line ? undefined : 8 }}>{parts}</Typography>;
      })}
    </>
  );
}

export default function AiDock({ open, onClose }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('ai-chat') || 'null') || []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open && !suggestions.length) api.get('/ai/suggestions').then((r) => setSuggestions(r.data)).catch(() => {});
  }, [open]); // eslint-disable-line
  useEffect(() => {
    try { sessionStorage.setItem('ai-chat', JSON.stringify(messages.slice(-30))); } catch { /* ignore */ }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const send = (text) => {
    const message = (text || input).trim();
    if (!message || thinking) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setThinking(true);
    api.post('/ai/chat', { message })
      .then((r) => {
        setMessages((m) => [...m, { role: 'ai', text: r.data.reply, sources: r.data.sources, engine: r.data.engine }]);
        setSuggestions(r.data.suggestions || []);
      })
      .catch((e) => setMessages((m) => [...m, { role: 'ai', text: `Sorry — ${e.message}`, sources: [] }]))
      .finally(() => setThinking(false));
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      slotProps={{ paper: { sx: { width: 420, maxWidth: '100vw', display: 'flex', flexDirection: 'column' } } }}>
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: '9px', background: ADANI_GRADIENT, display: 'grid', placeItems: 'center' }}>
          <AutoAwesomeRoundedIcon sx={{ fontSize: 17, color: '#fff' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>Port Assistant</Typography>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Grounded in live port records — every answer cites its screen</Typography>
        </Box>
        <IconButton onClick={onClose}><CloseRoundedIcon /></IconButton>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {messages.length === 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mb: 1.5 }}>
              Ask about vessels, port calls, berths, certificates, risk, incidents or billing. Try:
            </Typography>
            <Stack spacing={0.75}>
              {suggestions.map((s) => (
                <Chip key={s} label={s} variant="outlined" onClick={() => send(s)}
                  sx={{ justifyContent: 'flex-start', height: 'auto', py: 0.75, '& .MuiChip-label': { whiteSpace: 'normal', fontSize: 12.5 } }} />
              ))}
            </Stack>
          </Box>
        )}
        {messages.map((m, i) => (
          <Box key={i} sx={{ alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '85%' : '100%' }}>
            <Box sx={{
              p: 1.5, borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
              bgcolor: m.role === 'user' ? 'primary.main' : 'action.hover',
              color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
            }}>
              <Rich text={m.text} />
              {m.sources?.length > 0 && (
                <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                  {m.sources.map((s) => (
                    <Chip key={s.link} size="small" icon={<OpenInNewRoundedIcon sx={{ fontSize: 13 }} />} label={s.label}
                      onClick={() => { navigate(s.link); onClose(); }}
                      sx={{ height: 22, fontSize: 11, fontWeight: 600 }} color="primary" variant="outlined" />
                  ))}
                </Stack>
              )}
            </Box>
            {m.engine && <Typography sx={{ fontSize: 9.5, color: 'text.secondary', mt: 0.35, fontFamily: '"IBM Plex Mono",monospace' }}>{m.engine}</Typography>}
          </Box>
        ))}
        {thinking && (
          <Box sx={{ p: 1.5, borderRadius: '4px 14px 14px 14px', bgcolor: 'action.hover', alignSelf: 'flex-start' }}>
            <Stack direction="row" spacing={0.6}>
              {[0, 1, 2].map((d) => (
                <Box key={d} sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'text.secondary', animation: `${blink} 1.2s ${d * 0.2}s infinite` }} />
              ))}
            </Stack>
          </Box>
        )}
        <div ref={bottomRef} />
      </Box>
      {messages.length > 0 && suggestions.length > 0 && !thinking && (
        <Box sx={{ px: 2, pb: 1, display: 'flex', gap: 0.75, overflowX: 'auto' }}>
          {suggestions.slice(0, 3).map((s) => (
            <Chip key={s} size="small" label={s} variant="outlined" onClick={() => send(s)} sx={{ fontSize: 11, flexShrink: 0 }} />
          ))}
        </Box>
      )}
      <Divider />
      <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
        <TextField fullWidth size="small" placeholder="Ask the port assistant…" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <IconButton onClick={() => send()} disabled={!input.trim() || thinking}
          sx={{ background: ADANI_GRADIENT, color: '#fff', borderRadius: 2.5, '&:hover': { background: ADANI_GRADIENT, opacity: 0.88 }, '&.Mui-disabled': { opacity: 0.4, color: '#fff' } }}>
          <SendRoundedIcon sx={{ fontSize: 19 }} />
        </IconButton>
      </Box>
    </Drawer>
  );
}
