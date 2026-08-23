/* Excel / PDF / CSV export helpers used by masters, registers and the report
 * library. Inside the published demo artifact plain downloads are sandboxed,
 * so saving goes through the viewer's downloads runtime when it is present
 * (xlsx falls back to csv there — the runtime's allow-list has no xlsx). */
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const cellValue = (row, col) => {
  const v = typeof col.value === 'function' ? col.value(row) : row[col.key];
  return v === null || v === undefined ? '' : v;
};

async function saveBytes(filename, data, mime) {
  if (typeof window.claude?.use === 'function') {
    try {
      const downloads = await window.claude.use('downloads');
      if (downloads) {
        try {
          await downloads.save({ filename, data });
        } catch (e) {
          if (e?.code === 'extension_not_enabled' || e?.code === 'rejected_extension') {
            await downloads.save({ filename: filename.replace(/\.[a-z]+$/, '.txt'), data: typeof data === 'string' ? data : 'Export not supported in the shared demo — use the deployed portal.' });
          }
        }
        return;
      }
    } catch { /* fall through */ }
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function exportExcel({ name, sheets }) {
  // sheets: [{ name, columns:[{key|value,label}], rows }]
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const data = [s.columns.map((c) => c.label), ...s.rows.map((r) => s.columns.map((c) => cellValue(r, c)))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = s.columns.map((c) => ({ wch: Math.min(42, Math.max(10, String(c.label).length + 6)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 28));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  await saveBytes(`${name}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export async function exportPdf({ name, title, subtitle, sections, landscape = false }) {
  // sections: [{ heading, columns, rows }]
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  // branded masthead
  doc.setFillColor(10, 34, 57);
  doc.rect(0, 0, pageW, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Mundra Port — Operations Portal', 40, 28);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(title || name, 40, 46);
  doc.setFontSize(8); doc.setTextColor(200, 214, 226);
  doc.text(`Generated ${new Date().toLocaleString('en-IN', { hour12: false })} IST · demo data`, pageW - 40, 46, { align: 'right' });
  let y = 84;
  if (subtitle) {
    doc.setTextColor(90, 107, 120); doc.setFontSize(9.5);
    doc.text(String(subtitle), 40, y); y += 16;
  }
  for (const s of sections) {
    if (s.heading) {
      doc.setTextColor(10, 34, 57); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text(s.heading, 40, y + 6); y += 14;
    }
    autoTable(doc, {
      startY: y,
      head: [s.columns.map((c) => c.label)],
      body: s.rows.map((r) => s.columns.map((c) => String(cellValue(r, c)))),
      margin: { left: 40, right: 40 },
      styles: { fontSize: 7.5, cellPadding: 3, textColor: [40, 55, 66] },
      headStyles: { fillColor: [11, 116, 176], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 248, 250] },
      columnStyles: Object.fromEntries(s.columns.map((c, i) => [i, c.align === 'right' ? { halign: 'right' } : {}])),
      didDrawPage: () => {},
    });
    y = doc.lastAutoTable.finalY + 22;
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 48; }
  }
  const blob = doc.output('blob');
  await saveBytes(`${name}.pdf`, blob, 'application/pdf');
}

export function toCsv(rows, columns) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(cellValue(r, c))).join(','))].join('\n');
}

export async function exportCsv({ name, columns, rows }) {
  await saveBytes(`${name}.csv`, toCsv(rows, columns), 'text/csv;charset=utf-8');
}
