import { Grid, TextField, MenuItem, FormControlLabel, Switch, Autocomplete } from '@mui/material';

/**
 * Config-driven form renderer.
 * field: { name, label, type: text|number|select|multiline|date|datetime|switch|autocomplete,
 *          options: [{value,label}], required, cols (1-12), disabled, placeholder, helper }
 */
export default function FormFields({ fields, values, onChange, errors = {} }) {
  const set = (name, v) => onChange({ ...values, [name]: v });
  return (
    <Grid container spacing={2}>
      {fields.map((f) => {
        const v = values[f.name] ?? '';
        const common = {
          fullWidth: true, size: 'small', label: f.label, required: f.required,
          disabled: f.disabled, error: !!errors[f.name], helperText: errors[f.name] || f.helper,
        };
        let el;
        if (f.type === 'select') {
          el = (
            <TextField {...common} select value={v} onChange={(e) => set(f.name, e.target.value)}>
              {!f.required && <MenuItem value=""><em>—</em></MenuItem>}
              {(f.options || []).map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          );
        } else if (f.type === 'autocomplete') {
          const opts = f.options || [];
          el = (
            <Autocomplete
              options={opts} size="small"
              value={opts.find((o) => o.value === v) || null}
              onChange={(_, o) => set(f.name, o ? o.value : '')}
              renderInput={(params) => <TextField {...params} {...common} />}
            />
          );
        } else if (f.type === 'switch') {
          el = <FormControlLabel control={<Switch checked={!!values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />} label={f.label} />;
        } else if (f.type === 'multiline') {
          el = <TextField {...common} multiline minRows={f.rows || 2} value={v} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} />;
        } else {
          el = (
            <TextField
              {...common}
              type={f.type === 'datetime' ? 'datetime-local' : f.type || 'text'}
              value={v}
              onChange={(e) => set(f.name, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
              InputLabelProps={['date', 'datetime'].includes(f.type) ? { shrink: true } : undefined}
              placeholder={f.placeholder}
            />
          );
        }
        return <Grid item xs={12} sm={f.cols || 6} key={f.name}>{el}</Grid>;
      })}
    </Grid>
  );
}
