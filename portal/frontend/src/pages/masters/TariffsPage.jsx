import CrudPage from '../../components/common/CrudPage';
import { fmtINR } from '../../utils/format';

const CATS = ['MARINE', 'CARGO', 'MISC'].map((c) => ({ value: c, label: c }));

export default function TariffsPage() {
  return (
    <CrudPage
      title="Tariff master" sub="Rates applied when invoices are generated from a port call"
      entityName="tariff item" endpoint="/tariffs" permBase="tariffs" defaultSort="code"
      perms={{ create: 'tariffs.manage', edit: 'tariffs.manage', del: 'tariffs.manage' }}
      searchPlaceholder="Search code or name…"
      columns={[
        { key: 'code', label: 'Code', mono: true, sortable: true },
        { key: 'name', label: 'Charge' },
        { key: 'category', label: 'Category' },
        { key: 'unit', label: 'Unit' },
        { key: 'rate', label: 'Rate', align: 'right', render: (r) => fmtINR(r.rate), mono: true },
        { key: 'active', label: 'Active', render: (r) => (r.active ? 'Yes' : 'No') },
      ]}
      filters={[{ name: 'category', label: 'Category', options: CATS }]}
      formFields={[
        { name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Charge name', required: true },
        { name: 'category', label: 'Category', type: 'select', required: true, options: CATS },
        { name: 'unit', label: 'Unit', required: true, placeholder: 'per GRT / per TEU / per movement' },
        { name: 'rate', label: 'Rate (₹)', type: 'number', required: true },
        { name: 'active', label: 'Active', type: 'switch' },
      ]}
      defaults={{ category: 'MARINE', active: true }}
    />
  );
}
