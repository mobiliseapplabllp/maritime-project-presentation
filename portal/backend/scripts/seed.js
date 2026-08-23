/* Deterministic sample dataset — Adani Mundra Port (INMUN). All data fictional. */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDB } = require('../src/config/db');
const M = require('../src/models');
const { buildInvoiceLines, computeTotals } = require('../src/domain/invoiceMath');
const { GST_RATE, ALL_PERMISSIONS } = require('../src/config/constants');

// --- deterministic PRNG ---
let s0 = 20260823;
const rnd = () => { s0 |= 0; s0 = (s0 + 0x6D2B79F5) | 0; let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const H = 3600 * 1000, D = 24 * H;

const NOW = new Date();
const yearOf = (d) => new Date(d).getFullYear();

async function run() {
  await connectDB();
  console.log('connected — dropping database');
  await mongoose.connection.dropDatabase();

  // ---------- settings ----------
  await M.Setting.create({ key: 'org', value: {
    portName: 'Mundra Port', operator: 'Adani Ports & SEZ Ltd (demo)', unlocode: 'INMUN',
    address: 'Mundra, Kutch District, Gujarat 370421, India',
    gstin: '24XXXXX0000X1Z5 (sample)', currency: 'INR', timezone: 'Asia/Kolkata',
    contactEmail: 'ops@mundraport.example.in', contactPhone: '+91 2838 000000',
  }});

  // ---------- roles & users ----------
  const P = (...ps) => ps;
  const roles = await M.Role.insertMany([
    { name: 'Super Admin', description: 'Full access to every module', permissions: ['*'], system: true },
    { name: 'Harbour Master', description: 'Marine operations — port calls, berthing, cargo', system: true,
      permissions: P('dashboard.view','vessels.view','vessels.create','vessels.edit','certificates.view',
        'portcalls.view','portcalls.create','portcalls.edit','portcalls.delete','portcalls.transition',
        'cargo.manage','inspections.view','invoices.view','tariffs.view','masters.view') },
    { name: 'Marine Surveyor', description: 'Inspections, certificates and vessel compliance', system: true,
      permissions: P('dashboard.view','vessels.view','certificates.view','certificates.manage',
        'portcalls.view','inspections.view','inspections.create','inspections.edit','inspections.close','masters.view') },
    { name: 'Finance Officer', description: 'Tariffs, invoicing and collections', system: true,
      permissions: P('dashboard.view','portcalls.view','vessels.view','invoices.view','invoices.create',
        'invoices.issue','invoices.pay','invoices.delete','tariffs.view','tariffs.manage','masters.view') },
    { name: 'Shipping Agent', description: 'External agent — announce calls, track invoices', system: true,
      permissions: P('dashboard.view','vessels.view','portcalls.view','portcalls.create','invoices.view') },
  ]);
  const roleByName = Object.fromEntries(roles.map((r) => [r.name, r._id]));
  const hash = await bcrypt.hash('Mundra@2026', 10);
  await M.User.insertMany([
    { name: 'Ashish Sharma', email: 'admin@mundraport.in', passwordHash: hash, role: roleByName['Super Admin'], designation: 'Port Administrator' },
    { name: 'Capt. R. Nair', email: 'harbour@mundraport.in', passwordHash: hash, role: roleByName['Harbour Master'], designation: 'Harbour Master' },
    { name: 'Cdr. S. Patel', email: 'surveyor@mundraport.in', passwordHash: hash, role: roleByName['Marine Surveyor'], designation: 'Chief Marine Surveyor' },
    { name: 'M. Iyer', email: 'finance@mundraport.in', passwordHash: hash, role: roleByName['Finance Officer'], designation: 'Manager — Billing' },
    { name: 'K. Bhatt (Kutch Shipping)', email: 'agent@mundraport.in', passwordHash: hash, role: roleByName['Shipping Agent'], designation: 'Boarding Agent' },
    { name: 'V. Menon', email: 'ops2@mundraport.in', passwordHash: hash, role: roleByName['Harbour Master'], designation: 'Dy. Harbour Master' },
  ]);

  // ---------- lookups ----------
  const lk = (category, code, label, meta = {}) => ({ category, code, label, meta });
  await M.Lookup.insertMany([
    lk('vesselType','CONT','Container Ship'), lk('vesselType','BULK','Bulk Carrier'),
    lk('vesselType','TANK','Tanker'), lk('vesselType','GEN','General Cargo'),
    lk('vesselType','RORO','Ro-Ro / Car Carrier'), lk('vesselType','OSV','Offshore Support Vessel'),
    lk('cargoType','CONTAINERS','Containers', { group: 'container', unit: 'TEU', mtFactor: 12 }),
    lk('cargoType','COAL','Thermal Coal', { group: 'dryBulk', unit: 'MT', mtFactor: 1 }),
    lk('cargoType','CRUDE','Crude Oil', { group: 'liquid', unit: 'MT', mtFactor: 1 }),
    lk('cargoType','POL','POL Products', { group: 'liquid', unit: 'MT', mtFactor: 1 }),
    lk('cargoType','FERT','Fertilizer', { group: 'dryBulk', unit: 'MT', mtFactor: 1 }),
    lk('cargoType','GRAIN','Foodgrain (Wheat)', { group: 'dryBulk', unit: 'MT', mtFactor: 1 }),
    lk('cargoType','STEEL','Steel Coils', { group: 'breakBulk', unit: 'MT', mtFactor: 1 }),
    lk('cargoType','EDIBLE','Edible Oil', { group: 'liquid', unit: 'MT', mtFactor: 1 }),
    lk('cargoType','AUTO','Automobiles', { group: 'roro', unit: 'UNITS', mtFactor: 1.5 }),
    lk('cargoType','PROJ','Project Cargo', { group: 'breakBulk', unit: 'MT', mtFactor: 1 }),
    lk('port','CNSHA','Shanghai', { country: 'China' }), lk('port','SGSIN','Singapore', { country: 'Singapore' }),
    lk('port','AEJEA','Jebel Ali', { country: 'UAE' }), lk('port','SAJED','Jeddah', { country: 'Saudi Arabia' }),
    lk('port','MYPKG','Port Klang', { country: 'Malaysia' }), lk('port','LKCMB','Colombo', { country: 'Sri Lanka' }),
    lk('port','NLRTM','Rotterdam', { country: 'Netherlands' }), lk('port','KWKWI','Kuwait', { country: 'Kuwait' }),
    lk('port','IQBSR','Basrah', { country: 'Iraq' }), lk('port','IDJKT','Jakarta', { country: 'Indonesia' }),
    lk('port','AUHPT','Hay Point', { country: 'Australia' }), lk('port','ZADUR','Durban', { country: 'South Africa' }),
    lk('port','INNSA','Nhava Sheva', { country: 'India' }), lk('port','INCOK','Kochi', { country: 'India' }),
    lk('agent','KSA','Kutch Shipping Agency', { address: 'Port User Building, Mundra 370421', gstin: '24XXXXX1111X1Z2 (sample)' }),
    lk('agent','BMS','Bharat Marine Services', { address: 'Adipur, Kutch 370205', gstin: '24XXXXX2222X1Z9 (sample)' }),
    lk('agent','OAP','Oceanic Agencies Pvt Ltd', { address: 'Gandhidham 370201', gstin: '24XXXXX3333X1Z6 (sample)' }),
    lk('agent','WCM','WestCoast Maritime Services', { address: 'Bhuj Road, Mundra', gstin: '24XXXXX4444X1Z3 (sample)' }),
    lk('agent','SSL','Seven Seas Logistics', { address: 'SEZ Zone-4, Mundra', gstin: '24XXXXX5555X1Z0 (sample)' }),
    lk('agent','TMA','Trident Marine Agencies', { address: 'Mandvi Road, Mundra', gstin: '24XXXXX6666X1Z7 (sample)' }),
    lk('deficiencyCode','01101','Ship certificates — missing / expired', { category: 'Certificates & Documentation' }),
    lk('deficiencyCode','04103','Emergency generator inoperative', { category: 'Emergency Systems' }),
    lk('deficiencyCode','07105','Fire-fighting equipment defective', { category: 'Fire Safety' }),
    lk('deficiencyCode','10111','Nautical charts / publications not updated', { category: 'Safety of Navigation' }),
    lk('deficiencyCode','11101','Lifeboat launching arrangement defective', { category: 'Life Saving Appliances' }),
    lk('deficiencyCode','13101','Main engine — abnormal operation', { category: 'Propulsion & Machinery' }),
    lk('deficiencyCode','14104','Oily-water separator / 15ppm alarm defective', { category: 'MARPOL Annex I' }),
    lk('deficiencyCode','18203','Crew rest hours records incomplete', { category: 'MLC — Working Conditions' }),
    lk('actionCode','10','Deficiency rectified', {}), lk('actionCode','15','Rectify at next port', {}),
    lk('actionCode','16','Rectify within 14 days', {}), lk('actionCode','17','Rectify before departure', {}),
    lk('actionCode','30','Detainable deficiency — ship detained', {}), lk('actionCode','99','Other (specify)', {}),
  ]);

  // ---------- tariffs ----------
  await M.TariffItem.insertMany([
    { code: 'PD',  name: 'Port dues', category: 'MARINE', unit: 'per GRT', rate: 12.5 },
    { code: 'BH',  name: 'Berth hire', category: 'MARINE', unit: 'per GRT per day', rate: 4.2 },
    { code: 'PIL', name: 'Pilotage (in/out)', category: 'MARINE', unit: 'per movement', rate: 85000 },
    { code: 'TUG', name: 'Tug assistance', category: 'MARINE', unit: 'per tug-movement', rate: 62000 },
    { code: 'ANC', name: 'Anchorage charges', category: 'MARINE', unit: 'per day', rate: 25000 },
    { code: 'WFC', name: 'Wharfage — containers', category: 'CARGO', unit: 'per TEU', rate: 950 },
    { code: 'WFB', name: 'Wharfage — dry bulk / break bulk', category: 'CARGO', unit: 'per MT', rate: 118 },
    { code: 'WFL', name: 'Wharfage — liquid bulk', category: 'CARGO', unit: 'per MT', rate: 96 },
    { code: 'WFR', name: 'Wharfage — ro-ro units', category: 'CARGO', unit: 'per unit', rate: 1450 },
    { code: 'WTR', name: 'Fresh water supply', category: 'MISC', unit: 'per MT', rate: 260 },
    { code: 'GBG', name: 'Garbage reception (MARPOL)', category: 'MISC', unit: 'per call', rate: 18000 },
  ]);

  // ---------- checklist templates ----------
  const tpl = await M.ChecklistTemplate.insertMany([
    { name: 'PSC Initial Inspection', inspectionType: 'PSC', items: [
      'Ship certificates and documents verified', 'Crew certificates match safe manning document',
      'Navigation bridge equipment operational', 'Fire doors and dampers close properly',
      'Lifeboats and davits — condition and launching', 'Emergency generator starts on load',
      'Oily-water separator and 15ppm alarm test', 'Garbage management plan and record book',
      'Crew accommodation hygiene', 'Mooring arrangement condition',
    ].map((t, i) => ({ seq: i + 1, text: t, category: i < 2 ? 'Documentation' : i < 5 ? 'Safety' : 'Machinery & MARPOL' })) },
    { name: 'Pre-Berthing Safety Check', inspectionType: 'FSI', items: [
      'Arrival draft within berth limit', 'Dangerous goods declaration reviewed',
      'Mooring plan agreed with pilot', 'Gangway and access arrangement safe', 'Bunker operations notified',
    ].map((t, i) => ({ seq: i + 1, text: t, category: 'Pre-berthing' })) },
    { name: 'MLC On-board Conditions', inspectionType: 'MLC', items: [
      'Seafarer employment agreements available', 'Wage records up to date', 'Rest hour records maintained',
      'Food and catering standard', 'Medical chest inventory complete',
    ].map((t, i) => ({ seq: i + 1, text: t, category: 'MLC' })) },
  ]);

  // ---------- berths ----------
  const berthDefs = [
    ['CT1-A','Container Terminal 1 — Berth A','Container Terminal 1','CONTAINER',350,16],
    ['CT1-B','Container Terminal 1 — Berth B','Container Terminal 1','CONTAINER',350,16],
    ['CT2-A','Container Terminal 2 — Berth A','Container Terminal 2','CONTAINER',360,16.5],
    ['CT2-B','Container Terminal 2 — Berth B','Container Terminal 2','CONTAINER',360,16.5],
    ['CT3-A','Container Terminal 3 — Berth A','Container Terminal 3','CONTAINER',380,17],
    ['CT3-B','Container Terminal 3 — Berth B','Container Terminal 3','CONTAINER',380,17],
    ['CT4-A','Container Terminal 4 — Berth A','Container Terminal 4','CONTAINER',400,17.5],
    ['MP-1','Multipurpose Berth 1','Multipurpose Terminal','MULTIPURPOSE',250,14],
    ['MP-2','Multipurpose Berth 2','Multipurpose Terminal','MULTIPURPOSE',250,14],
    ['MP-3','Multipurpose Berth 3','Multipurpose Terminal','MULTIPURPOSE',250,14],
    ['MP-4','Multipurpose Berth 4','Multipurpose Terminal','MULTIPURPOSE',250,14],
    ['CB-1','Coal Berth 1 (West Basin)','Coal Terminal','COAL',300,17],
    ['CB-2','Coal Berth 2 (West Basin)','Coal Terminal','COAL',300,17],
    ['LB-1','Liquid Berth 1','Liquid Terminal','LIQUID',280,15],
    ['LB-2','Liquid Berth 2','Liquid Terminal','LIQUID',280,15],
    ['SPM-1','Single Point Mooring 1','SPM','SPM',340,32],
    ['RR-1','Ro-Ro Berth 1','Ro-Ro Terminal','RORO',230,12],
  ];
  const berths = await M.Berth.insertMany(berthDefs.map(([code, name, terminal, berthType, loaMax, draftMax]) => ({
    code, name, terminal, berthType, loaMax, draftMax,
    status: code === 'MP-4' ? 'MAINTENANCE' : 'OPERATIONAL',
    remarks: code === 'MP-4' ? 'Fender replacement — expected back in service next month' : '',
  })));
  const berthsByType = (t) => berths.filter((b) => b.berthType === t && b.status === 'OPERATIONAL');

  // ---------- vessels ----------
  const flags = ['India','Panama','Liberia','Marshall Islands','Singapore','Malta','Hong Kong'];
  const classes = ['IRS','LR','DNV','ABS','NK','BV'];
  const agents = ['KSA','BMS','OAP','WCM','SSL','TMA'];
  const agentNames = { KSA: 'Kutch Shipping Agency', BMS: 'Bharat Marine Services', OAP: 'Oceanic Agencies Pvt Ltd', WCM: 'WestCoast Maritime Services', SSL: 'Seven Seas Logistics', TMA: 'Trident Marine Agencies' };
  const vdefs = [
    ['MV Kutch Emerald','CONT',48000,52000,334],['MV Saurashtra Glory','CONT',52000,58000,347],
    ['MV Mundra Express','CONT',41000,45000,300],['MV Arabian Crest','CONT',95000,101000,366],
    ['MV Malabar Horizon','CONT',68000,74000,352],['MV Indus Fortune','CONT',36000,40000,285],
    ['MV Gulf of Kutch','BULK',33000,58000,229],['MV Konkan Breeze','BULK',36000,63000,235],
    ['MV Coromandel Trader','BULK',31000,55000,225],['MV Vindhya Pride','BULK',44000,82000,289],
    ['MV Narmada Spirit','BULK',34000,61000,229],['MV Deccan Voyager','BULK',42000,76000,275],
    ['MT Kandla Jyoti','TANK',62000,113000,250],['MT Gujarat Star','TANK',81000,150000,274],
    ['MT Bhuj Radiance','TANK',30000,47000,183],['MT Sagar Ratna','TANK',160000,300000,333],
    ['MV Coastal Karavan','GEN',19000,28000,180],['MV Porbandar Breeze','GEN',22000,32000,190],
    ['MV Dwarka Wave','RORO',56000,21000,200],['MV Somnath Carrier','RORO',60000,22500,200],
  ];
  const certTypes = ['Certificate of Registry','Classification Certificate','Safety Management Certificate',
    'International Ship Security Certificate','IOPP Certificate','Load Line Certificate','Maritime Labour Certificate'];
  const vessels = await M.Vessel.insertMany(vdefs.map(([name, type, grt, dwt, loa], i) => {
    const certs = certTypes.map((certType, j) => {
      let expiry = new Date(NOW.getTime() + (120 + ((i * 7 + j * 97) % 700)) * D);
      if (i === 2 && j === 2) expiry = new Date(NOW.getTime() + 11 * D);      // SMC expiring
      if (i === 7 && j === 4) expiry = new Date(NOW.getTime() + 24 * D);      // IOPP expiring
      if (i === 12 && j === 5) expiry = new Date(NOW.getTime() + 18 * D);     // Load line expiring
      if (i === 9 && j === 6) expiry = new Date(NOW.getTime() - 12 * D);      // MLC expired
      if (i === 16 && j === 3) expiry = new Date(NOW.getTime() - 40 * D);     // ISSC expired
      return {
        certType, number: `${certType.split(' ').map((w) => w[0]).join('')}-${9100 + i * 13 + j}`,
        issuer: j === 1 ? pick(classes) : 'DG Shipping / RO',
        issueDate: new Date(expiry.getTime() - 5 * 365 * D), expiryDate: expiry,
      };
    });
    return {
      name, imo: String(9700001 + i), mmsi: String(419000100 + i), callSign: `AT${String.fromCharCode(65 + (i % 26))}${2200 + i}`,
      flag: i % 3 === 0 ? 'India' : pick(flags), type, built: 2005 + (i % 17), dwt, grt, loa,
      beam: Math.round(loa / 6.8), maxDraft: type === 'TANK' ? 17 + (i % 5) : 11 + (i % 5),
      owner: `${name.replace(/^M[VT] /, '')} Shipping Ltd`, agent: agents[i % agents.length],
      classSociety: classes[i % classes.length], certificates: certs,
    };
  }));
  const vByType = (t) => vessels.filter((v) => v.type === t);

  // ---------- port call history (12 months, SAILED) ----------
  const cargoFor = (vt) => {
    if (vt === 'CONT') return { cargoType: 'CONTAINERS', unit: 'TEU', qty: ri(900, 3600), mtFactor: 12 };
    if (vt === 'BULK') { const c = pick(['COAL','COAL','FERT','GRAIN','STEEL']); return { cargoType: c, unit: 'MT', qty: c === 'COAL' ? ri(30000, 85000) : ri(12000, 45000), mtFactor: 1 }; }
    if (vt === 'TANK') { const c = pick(['CRUDE','POL','EDIBLE']); return { cargoType: c, unit: 'MT', qty: c === 'CRUDE' ? ri(80000, 140000) : ri(15000, 45000), mtFactor: 1 }; }
    if (vt === 'RORO') return { cargoType: 'AUTO', unit: 'UNITS', qty: ri(700, 2400), mtFactor: 1.5 };
    return { cargoType: pick(['STEEL','PROJ','GRAIN']), unit: 'MT', qty: ri(8000, 26000), mtFactor: 1 };
  };
  const berthFor = (vt, cargo) => {
    if (vt === 'CONT') return pick(berthsByType('CONTAINER'));
    if (vt === 'TANK') return cargo === 'CRUDE' ? berthsByType('SPM')[0] : pick(berthsByType('LIQUID'));
    if (vt === 'RORO') return berthsByType('RORO')[0];
    if (cargo === 'COAL') return pick(berthsByType('COAL'));
    return pick(berthsByType('MULTIPURPOSE'));
  };
  const durFor = (vt) => (vt === 'CONT' ? ri(20, 40) : vt === 'TANK' ? ri(30, 60) : vt === 'RORO' ? ri(16, 30) : ri(48, 92));
  const portsArr = ['CNSHA — Shanghai','SGSIN — Singapore','AEJEA — Jebel Ali','SAJED — Jeddah','MYPKG — Port Klang','LKCMB — Colombo','KWKWI — Kuwait','IQBSR — Basrah','AUHPT — Hay Point','ZADUR — Durban','INNSA — Nhava Sheva','INCOK — Kochi'];

  const seq = { 2025: 0, 2026: 0 };
  const vcnFor = (d) => { const y = yearOf(d); seq[y] = (seq[y] || 0) + 1; return `MUN-${y}-${String(seq[y]).padStart(4, '0')}`; };
  const callDocs = [];
  const mkServices = (vt, waitedH) => {
    const svcs = [
      { type: 'PILOTAGE', tariffCode: 'PIL', description: 'Pilot in + out', qty: 2, unit: 'movement' },
      { type: 'TUGS', tariffCode: 'TUG', description: `${vt === 'CONT' || vt === 'TANK' ? 2 : 2} tugs x 2 movements`, qty: 4, unit: 'tug-movement' },
    ];
    if (rnd() < 0.4) svcs.push({ type: 'FRESH_WATER', tariffCode: 'WTR', description: 'Fresh water at berth', qty: ri(40, 160), unit: 'MT' });
    if (rnd() < 0.5) svcs.push({ type: 'GARBAGE', tariffCode: 'GBG', description: 'MARPOL garbage reception', qty: 1, unit: 'call' });
    if (waitedH > 24) svcs.push({ type: 'ANCHORAGE', tariffCode: 'ANC', description: 'Anchorage stay', qty: Math.ceil(waitedH / 24), unit: 'day' });
    return svcs;
  };

  for (let mBack = 11; mBack >= 0; mBack--) {
    const mStart = new Date(NOW.getFullYear(), NOW.getMonth() - mBack, 1);
    const daysInM = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0).getDate();
    const n = ri(9, 12);
    const monthCalls = [];
    for (let k = 0; k < n; k++) {
      const v = pick(vessels);
      const cargo = cargoFor(v.type);
      const berth = berthFor(v.type, cargo.cargoType);
      const ata = new Date(mStart.getTime() + (rnd() * (daysInM - 5) + 1) * D + ri(0, 23) * H);
      if (ata > new Date(NOW.getTime() - 3 * D)) continue;              // keep history clear of "now"
      const waitedH = ri(3, 30);
      const atb = new Date(ata.getTime() + waitedH * H);
      const atd = new Date(atb.getTime() + durFor(v.type) * H);
      const isLoad = rnd() < 0.35;
      const ops = [{ cargoType: cargo.cargoType, operation: isLoad ? 'LOAD' : 'DISCHARGE', qty: cargo.qty, unit: cargo.unit,
        qtyMT: Math.round(cargo.qty * cargo.mtFactor), gangs: ri(2, 6), startedAt: new Date(atb.getTime() + 2 * H), completedAt: new Date(atd.getTime() - 3 * H) }];
      if (v.type === 'CONT' && rnd() < 0.6) {
        const q2 = ri(500, 1800);
        ops.push({ cargoType: 'CONTAINERS', operation: isLoad ? 'DISCHARGE' : 'LOAD', qty: q2, unit: 'TEU', qtyMT: q2 * 12, gangs: ri(2, 4), startedAt: new Date(atb.getTime() + 4 * H), completedAt: new Date(atd.getTime() - 2 * H) });
      }
      monthCalls.push({ v, berth, ata, atb, atd, ops, waitedH });
    }
    monthCalls.sort((a, b) => a.ata - b.ata);
    for (const c of monthCalls) {
      callDocs.push({
        vcn: vcnFor(c.ata), vessel: c.v._id, agentCode: c.v.agent, agentName: agentNames[c.v.agent],
        purpose: c.ops[0].operation === 'LOAD' ? 'Loading' : 'Discharge', status: 'SAILED',
        eta: new Date(c.ata.getTime() - 6 * H), etb: c.atb, etd: c.atd,
        ata: c.ata, atb: c.atb, atd: c.atd, berth: c.berth._id,
        prevPort: pick(portsArr), nextPort: pick(portsArr),
        draftArrival: Math.round((c.v.maxDraft - rnd() * 3) * 10) / 10,
        draftDeparture: Math.round((c.v.maxDraft - rnd() * 4) * 10) / 10,
        crew: { count: ri(18, 26), master: pick(['Capt. A. Singh','Capt. J. Fernandes','Capt. L. Chen','Capt. M. Rao','Capt. O. Petrov','Capt. T. Nguyen']) },
        services: mkServices(c.v.type, c.waitedH), cargoOps: c.ops,
        statusHistory: [
          { from: '', to: 'ANNOUNCED', at: new Date(c.ata.getTime() - 4 * D), by: 'seed', note: 'Call announced' },
          { from: 'ANNOUNCED', to: 'CONFIRMED', at: new Date(c.ata.getTime() - 2 * D), by: 'seed', note: '' },
          { from: 'CONFIRMED', to: 'AT_ANCHORAGE', at: c.ata, by: 'seed', note: '' },
          { from: 'AT_ANCHORAGE', to: 'BERTHED', at: c.atb, by: 'seed', note: '' },
          { from: 'BERTHED', to: 'SAILED', at: c.atd, by: 'seed', note: '' },
        ],
        createdAt: new Date(c.ata.getTime() - 4 * D), updatedAt: c.atd,
      });
    }
  }

  // ---------- current snapshot ----------
  const activeDocs = [];
  const used = new Set();
  const pickVessel = (t) => {
    const v = vByType(t).find((x) => !used.has(String(x._id))) || vessels.find((x) => !used.has(String(x._id)));
    used.add(String(v._id)); return v;
  };
  const berthedPlan = [
    ['CONT','CT1-A'],['CONT','CT2-B'],['CONT','CT4-A'],['BULK','CB-1'],['TANK','LB-1'],['TANK','SPM-1'],
  ];
  for (const [vt, bcode] of berthedPlan) {
    const v = pickVessel(vt);
    const b = berths.find((x) => x.code === bcode);
    const cargo = cargoFor(vt);
    const atb = new Date(NOW.getTime() - ri(8, 30) * H);
    const ata = new Date(atb.getTime() - ri(4, 18) * H);
    const etd = new Date(NOW.getTime() + ri(10, 34) * H);
    activeDocs.push({
      vcn: vcnFor(ata), vessel: v._id, agentCode: v.agent, agentName: agentNames[v.agent],
      purpose: 'Discharge', status: 'BERTHED', eta: new Date(ata.getTime() - 5 * H), etb: atb, etd,
      ata, atb, berth: b._id, prevPort: pick(portsArr), nextPort: pick(portsArr),
      draftArrival: Math.round((v.maxDraft - rnd() * 2) * 10) / 10,
      crew: { count: ri(18, 26), master: pick(['Capt. A. Singh','Capt. D. Kumar','Capt. E. Silva']) },
      services: mkServices(vt, 6),
      cargoOps: [{ cargoType: cargo.cargoType, operation: 'DISCHARGE', qty: cargo.qty, unit: cargo.unit,
        qtyMT: Math.round(cargo.qty * cargo.mtFactor), gangs: ri(3, 6), startedAt: new Date(atb.getTime() + 2 * H) }],
      statusHistory: [
        { from: '', to: 'ANNOUNCED', at: new Date(ata.getTime() - 3 * D), by: 'seed', note: '' },
        { from: 'ANNOUNCED', to: 'CONFIRMED', at: new Date(ata.getTime() - 1 * D), by: 'seed', note: '' },
        { from: 'CONFIRMED', to: 'AT_ANCHORAGE', at: ata, by: 'seed', note: '' },
        { from: 'AT_ANCHORAGE', to: 'BERTHED', at: atb, by: 'seed', note: '' },
      ],
      createdAt: new Date(ata.getTime() - 3 * D), updatedAt: atb,
    });
  }
  for (let i = 0; i < 4; i++) {
    const v = pickVessel(pick(['CONT','BULK','BULK','GEN']));
    const ata = new Date(NOW.getTime() - ri(5, 40) * H);
    activeDocs.push({
      vcn: vcnFor(ata), vessel: v._id, agentCode: v.agent, agentName: agentNames[v.agent],
      purpose: 'Awaiting berth', status: 'AT_ANCHORAGE', eta: new Date(ata.getTime() - 4 * H),
      etb: new Date(NOW.getTime() + ri(4, 28) * H), ata,
      prevPort: pick(portsArr), crew: { count: ri(18, 24), master: 'Capt. on file' },
      statusHistory: [
        { from: '', to: 'ANNOUNCED', at: new Date(ata.getTime() - 3 * D), by: 'seed', note: '' },
        { from: 'ANNOUNCED', to: 'CONFIRMED', at: new Date(ata.getTime() - 1 * D), by: 'seed', note: '' },
        { from: 'CONFIRMED', to: 'AT_ANCHORAGE', at: ata, by: 'seed', note: '' },
      ],
      createdAt: new Date(ata.getTime() - 3 * D), updatedAt: ata,
    });
  }
  for (let i = 0; i < 3; i++) {
    const v = pickVessel(pick(['CONT','TANK','BULK']));
    const eta = new Date(NOW.getTime() + ri(6, 66) * H);
    activeDocs.push({
      vcn: vcnFor(NOW), vessel: v._id, agentCode: v.agent, agentName: agentNames[v.agent],
      purpose: pick(['Discharge','Loading']), status: 'CONFIRMED', eta, etd: new Date(eta.getTime() + 3 * D),
      prevPort: pick(portsArr),
      statusHistory: [
        { from: '', to: 'ANNOUNCED', at: new Date(NOW.getTime() - 2 * D), by: 'seed', note: '' },
        { from: 'ANNOUNCED', to: 'CONFIRMED', at: new Date(NOW.getTime() - 8 * H), by: 'seed', note: '' },
      ],
      createdAt: new Date(NOW.getTime() - 2 * D), updatedAt: NOW,
    });
  }
  for (let i = 0; i < 3; i++) {
    const v = pickVessel(pick(['GEN','RORO','CONT']));
    const eta = new Date(NOW.getTime() + ri(3, 7) * D);
    activeDocs.push({
      vcn: vcnFor(NOW), vessel: v._id, agentCode: v.agent, agentName: agentNames[v.agent],
      purpose: 'Discharge', status: 'ANNOUNCED', eta, prevPort: pick(portsArr),
      statusHistory: [{ from: '', to: 'ANNOUNCED', at: new Date(NOW.getTime() - 6 * H), by: 'seed', note: 'Announced by agent' }],
      createdAt: new Date(NOW.getTime() - 6 * H), updatedAt: NOW,
    });
  }
  { // one cancelled last week
    const v = pickVessel('BULK');
    const at = new Date(NOW.getTime() - 6 * D);
    activeDocs.push({
      vcn: vcnFor(at), vessel: v._id, agentCode: v.agent, agentName: agentNames[v.agent],
      purpose: 'Discharge', status: 'CANCELLED', eta: new Date(at.getTime() + 2 * D), prevPort: pick(portsArr),
      statusHistory: [
        { from: '', to: 'ANNOUNCED', at, by: 'seed', note: '' },
        { from: 'ANNOUNCED', to: 'CANCELLED', at: new Date(at.getTime() + 1 * D), by: 'seed', note: 'Charterer diverted vessel to Kandla' },
      ],
      createdAt: at, updatedAt: at,
    });
  }
  const allCalls = await M.PortCall.insertMany([...callDocs, ...activeDocs], { timestamps: false });
  const sailed = allCalls.filter((c) => c.status === 'SAILED');
  console.log(`port calls: ${allCalls.length} (${sailed.length} sailed)`);

  // ---------- invoices ----------
  const tariffDocs = await M.TariffItem.find().lean();
  const tariffs = Object.fromEntries(tariffDocs.map((t) => [t.code, t]));
  const vMap = Object.fromEntries(vessels.map((v) => [String(v._id), v]));
  const invDocs = [];
  const invSeq = {};
  for (const call of sailed) {
    if (rnd() > 0.9) continue; // a few never billed
    const v = vMap[String(call.vessel)];
    const lines = buildInvoiceLines({ vessel: v, services: call.services, cargoOps: call.cargoOps }, tariffs);
    if (!lines.length) continue;
    const totals = computeTotals(lines, GST_RATE);
    const issuedAt = new Date(call.atd.getTime() + 2 * D);
    const y = yearOf(issuedAt);
    invSeq[y] = (invSeq[y] || 0) + 1;
    const ageD = (NOW - issuedAt) / D;
    const status = ageD > 45 ? 'PAID' : ageD > 5 ? (rnd() < 0.6 ? 'PAID' : 'ISSUED') : 'DRAFT';
    invDocs.push({
      number: `MUN/INV/${y}/${String(invSeq[y]).padStart(4, '0')}`,
      portCall: call._id, vessel: call.vessel,
      billTo: { name: call.agentName, address: 'Mundra, Kutch, Gujarat', gstin: '24XXXXX0000X1Z5 (sample)' },
      lines: totals.lines, subtotal: totals.subtotal, gstRate: GST_RATE, gstAmount: totals.gstAmount, total: totals.total,
      status, issuedAt: status === 'DRAFT' ? undefined : issuedAt,
      paidAt: status === 'PAID' ? new Date(issuedAt.getTime() + ri(7, 30) * D) : undefined,
      paymentRef: status === 'PAID' ? `NEFT-${ri(100000, 999999)}` : '',
      createdAt: issuedAt, updatedAt: issuedAt,
    });
  }
  await M.Invoice.insertMany(invDocs, { timestamps: false });
  console.log(`invoices: ${invDocs.length}`);

  // ---------- inspections ----------
  const insDocs = [];
  let insSeqN = { 2025: 0, 2026: 0 };
  const defCodes = ['01101','04103','07105','10111','11101','13101','14104','18203'];
  const pastForIns = sailed.filter((_, i) => i % 5 === 2).slice(0, 20);
  pastForIns.forEach((call, idx) => {
    const type = rnd() < 0.55 ? 'PSC' : rnd() < 0.5 ? 'FSI' : pick(['ISM','MLC']);
    const template = tpl.find((t) => t.inspectionType === type) || tpl[0];
    const startedAt = new Date(call.atb.getTime() + 5 * H);
    const detained = idx === 4 || idx === 13;
    const nFind = detained ? ri(3, 5) : rnd() < 0.5 ? 0 : ri(1, 3);
    const findings = Array.from({ length: nFind }, (_, i2) => {
      const code = defCodes[(idx + i2 * 3) % defCodes.length];
      const closed = !detained && rnd() < 0.8;
      return {
        deficiencyCode: code, description: `Observed during ${type} inspection — see code ${code}`,
        actionCode: detained && i2 === 0 ? '30' : pick(['10','15','16','17']),
        dueDate: new Date(startedAt.getTime() + 14 * D),
        status: closed ? 'CLOSED' : 'OPEN', closedAt: closed ? new Date(startedAt.getTime() + ri(1, 12) * D) : undefined,
      };
    });
    const y = yearOf(startedAt);
    insSeqN[y] = (insSeqN[y] || 0) + 1;
    insDocs.push({
      number: `INS-${y}-${String(insSeqN[y]).padStart(3, '0')}`,
      vessel: call.vessel, portCall: call._id, type,
      inspector: pick(['Cdr. S. Patel','Lt. R. Joshi','Surveyor N. Shah']),
      plannedAt: startedAt, startedAt, closedAt: new Date(startedAt.getTime() + 9 * H),
      status: 'CLOSED', result: detained ? 'DETAINED' : nFind ? 'DEFICIENCIES' : 'SATISFACTORY',
      detention: detained,
      checklist: template.items.map((i2) => ({ seq: i2.seq, text: i2.text, category: i2.category, answer: rnd() < 0.9 ? 'YES' : 'NO', note: '' })),
      findings, createdAt: startedAt, updatedAt: startedAt,
    });
  });
  // open inspections now
  const berthedNow = allCalls.filter((c) => c.status === 'BERTHED');
  [0, 1].forEach((i) => {
    const call = berthedNow[i];
    const y = yearOf(NOW); insSeqN[y] = (insSeqN[y] || 0) + 1;
    insDocs.push({
      number: `INS-${y}-${String(insSeqN[y]).padStart(3, '0')}`,
      vessel: call.vessel, portCall: call._id, type: i === 0 ? 'PSC' : 'MLC',
      inspector: 'Cdr. S. Patel', plannedAt: new Date(NOW.getTime() - 4 * H), startedAt: new Date(NOW.getTime() - 3 * H),
      status: 'IN_PROGRESS',
      checklist: (tpl.find((t) => t.inspectionType === (i === 0 ? 'PSC' : 'MLC')) || tpl[0]).items
        .map((i2, ix) => ({ seq: i2.seq, text: i2.text, category: i2.category, answer: ix < 4 ? 'YES' : '', note: '' })),
      findings: i === 0 ? [{ deficiencyCode: '10111', description: 'Passage-plan charts not corrected to latest Notices to Mariners', actionCode: '17', dueDate: new Date(NOW.getTime() + 1 * D), status: 'OPEN' }] : [],
      createdAt: new Date(NOW.getTime() - 4 * H), updatedAt: NOW,
    });
  });
  { // planned on an expected arrival
    const conf = allCalls.find((c) => c.status === 'CONFIRMED');
    const y = yearOf(NOW); insSeqN[y] = (insSeqN[y] || 0) + 1;
    insDocs.push({
      number: `INS-${y}-${String(insSeqN[y]).padStart(3, '0')}`,
      vessel: conf.vessel, portCall: conf._id, type: 'FSI', inspector: 'Lt. R. Joshi',
      plannedAt: conf.eta, status: 'PLANNED',
      checklist: tpl[1].items.map((i2) => ({ seq: i2.seq, text: i2.text, category: i2.category, answer: '', note: '' })),
      findings: [], createdAt: NOW, updatedAt: NOW,
    });
  }
  await M.Inspection.insertMany(insDocs, { timestamps: false });
  console.log(`inspections: ${insDocs.length}`);

  // ---------- notifications ----------
  const nDocs = [
    { title: 'MV Mundra Express — SMC expires in 11 days', body: 'Safety Management Certificate expiry approaching. Plan renewal audit.', severity: 'warning', link: '/certificates', audiencePerm: 'certificates.view' },
    { title: 'MLC certificate EXPIRED — MV Vindhya Pride', body: 'Maritime Labour Certificate lapsed 12 days ago. Vessel must not be accepted without dispensation.', severity: 'error', link: '/certificates', audiencePerm: 'certificates.view' },
    { title: 'Berth MP-4 under maintenance', body: 'Fender replacement in progress — excluded from allocation.', severity: 'info', link: '/berth-board', audiencePerm: 'portcalls.view' },
    { title: 'Overdue invoices pending collection', body: 'Issued invoices older than 30 days need follow-up with agents.', severity: 'warning', link: '/invoices', audiencePerm: 'invoices.view' },
  ];
  await M.Notification.insertMany(nDocs);

  // ---------- synthesized audit trail ----------
  const actors = [
    { id: 'seed1', name: 'Capt. R. Nair', email: 'harbour@mundraport.in' },
    { id: 'seed2', name: 'Cdr. S. Patel', email: 'surveyor@mundraport.in' },
    { id: 'seed3', name: 'M. Iyer', email: 'finance@mundraport.in' },
    { id: 'seed4', name: 'Ashish Sharma', email: 'admin@mundraport.in' },
  ];
  const auditDocs = [];
  const recent = allCalls.filter((c) => ['BERTHED', 'AT_ANCHORAGE', 'CONFIRMED', 'ANNOUNCED'].includes(c.status));
  recent.slice(0, 8).forEach((c, i) => {
    const last = c.statusHistory[c.statusHistory.length - 1];
    auditDocs.push({ actor: actors[i % 2], action: last.from ? 'TRANSITION' : 'CREATE', entity: 'PortCall',
      entityId: String(c._id), entityLabel: last.from ? `${c.vcn}: ${last.from} -> ${last.to}` : c.vcn,
      at: last.at, ip: '10.20.4.11' });
  });
  const recentInv = invDocs.filter((x) => x.status === 'ISSUED').slice(-4);
  recentInv.forEach((x, i) => auditDocs.push({ actor: actors[2], action: 'ISSUE', entity: 'Invoice',
    entityId: '', entityLabel: x.number, at: new Date(NOW.getTime() - (i + 2) * 3 * H), ip: '10.20.4.31' }));
  auditDocs.push(
    { actor: actors[1], action: 'FINDING_ADD', entity: 'Inspection', entityLabel: 'INS-2026-012 — 10111', at: new Date(NOW.getTime() - 3 * H), ip: '10.20.4.22' },
    { actor: actors[3], action: 'UPDATE', entity: 'Berth', entityLabel: 'MP-4', at: new Date(NOW.getTime() - 26 * H),
      before: { status: 'OPERATIONAL' }, after: { status: 'MAINTENANCE', remarks: 'Fender replacement' }, ip: '10.20.4.2' },
    { actor: actors[3], action: 'UPDATE', entity: 'Role', entityLabel: 'Shipping Agent', at: new Date(NOW.getTime() - 50 * H), ip: '10.20.4.2' },
    { actor: actors[0], action: 'LOGIN', entity: 'User', entityLabel: 'harbour@mundraport.in', at: new Date(NOW.getTime() - 1 * H), ip: '10.20.4.11' },
  );
  auditDocs.sort((a, b) => a.at - b.at);
  await M.AuditLog.insertMany(auditDocs);

  const counts = {
    roles: await M.Role.countDocuments(), users: await M.User.countDocuments(),
    berths: await M.Berth.countDocuments(), lookups: await M.Lookup.countDocuments(),
    tariffs: await M.TariffItem.countDocuments(), vessels: await M.Vessel.countDocuments(),
    portCalls: await M.PortCall.countDocuments(), inspections: await M.Inspection.countDocuments(),
    invoices: await M.Invoice.countDocuments(), templates: await M.ChecklistTemplate.countDocuments(),
  };
  console.log('SEED COMPLETE', JSON.stringify(counts));
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
