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
// History spans Jan 2023 through now, so dashboards/trends read like a mature
// multi-year operation rather than one seeded year.
const HIST_START = new Date(2023, 0, 1);
const HIST_MONTHS = (NOW.getFullYear() - HIST_START.getFullYear()) * 12 + (NOW.getMonth() - HIST_START.getMonth());
const HIST_DAYS = Math.floor((NOW - HIST_START) / D);

async function run() {
  await connectDB();
  console.log('connected — dropping database');
  await mongoose.connection.dropDatabase();

  // ---------- settings ----------
  await M.Setting.create({ key: 'org', value: {
    portName: 'Mundra Port', operator: 'Adani Ports and Special Economic Zone Ltd (APSEZ) — demo instance', unlocode: 'INMUN',
    address: 'Navinal Island, Mundra, Kutch District, Gujarat 370421, India',
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
        'cargo.manage','inspections.view','invoices.view','tariffs.view','masters.view',
        'nmc.view','risk.view','seafarers.view','legislation.view','facilities.view','ai.use','reports.view',
        'incidents.view','incidents.create','incidents.manage') },
    { name: 'Marine Surveyor', description: 'Inspections, certificates and vessel compliance', system: true,
      permissions: P('dashboard.view','vessels.view','certificates.view','certificates.manage',
        'portcalls.view','inspections.view','inspections.create','inspections.edit','inspections.close','masters.view',
        'seafarers.view','seafarers.create','seafarers.edit','risk.view','legislation.view','legislation.manage','facilities.view','ai.use','reports.view',
        'incidents.view','incidents.create','incidents.manage','incidents.close') },
    { name: 'Finance Officer', description: 'Tariffs, invoicing and collections', system: true,
      permissions: P('dashboard.view','portcalls.view','vessels.view','invoices.view','invoices.create',
        'invoices.issue','invoices.pay','invoices.delete','tariffs.view','tariffs.manage','masters.view',
        'legislation.view','facilities.view','ai.use','reports.view','incidents.view') },
    { name: 'Shipping Agent', description: 'External agent — announce calls, track invoices', system: true,
      permissions: P('dashboard.view','vessels.view','portcalls.view','portcalls.create','invoices.view','legislation.view','ai.use') },
    { name: 'NMC Duty Officer', description: 'Surveillance centre — traffic picture, incidents, SAR', system: true,
      permissions: P('dashboard.view','nmc.view','nmc.manage','risk.view','vessels.view','portcalls.view','inspections.view','legislation.view','ai.use','reports.view',
        'incidents.view','incidents.create','incidents.manage','incidents.close') },
    { name: 'Terminal Supervisor', description: 'Terminal shift operations — cargo work and berth activity',
      permissions: P('dashboard.view','portcalls.view','cargo.manage','vessels.view','incidents.view','incidents.create','masters.view','ai.use') },
    { name: 'HSE Officer', description: 'Health, safety & environment — incident response and closure',
      permissions: P('dashboard.view','incidents.view','incidents.create','incidents.manage','incidents.close','inspections.view','legislation.view','reports.view','ai.use') },
    { name: 'Billing Clerk', description: 'Invoice preparation and collections follow-up',
      permissions: P('dashboard.view','invoices.view','invoices.create','tariffs.view','portcalls.view','vessels.view','ai.use') },
    { name: 'Security Officer', description: 'ISPS and gate security — watchkeeping and incident reporting',
      permissions: P('dashboard.view','nmc.view','incidents.view','incidents.create','legislation.view','ai.use') },
    { name: 'Port Pilot', description: 'Pilotage — vessel movements and schedules',
      permissions: P('dashboard.view','portcalls.view','vessels.view','legislation.view','ai.use') },
    { name: 'Management Viewer', description: 'Read-only management view across modules',
      permissions: P('dashboard.view','portcalls.view','vessels.view','incidents.view','inspections.view','invoices.view','legislation.view','facilities.view','reports.view','nmc.view','risk.view','seafarers.view','ai.use') },
  ]);
  const roleByName = Object.fromEntries(roles.map((r) => [r.name, r._id]));
  const hash = await bcrypt.hash('Mundra@2026', 10);
  const mkPhone = (i) => `+91 98${String(79210000 + i * 3517).slice(0, 8)}`;
  const loginUsers = [
    ['Ashish Sharma', 'admin@mundraport.in', 'Super Admin', 'Port Administrator'],
    ['Capt. Rajiv Nair', 'harbour@mundraport.in', 'Harbour Master', 'Harbour Master'],
    ['Cdr. Suresh Patel', 'surveyor@mundraport.in', 'Marine Surveyor', 'Chief Marine Surveyor'],
    ['Meenakshi Iyer', 'finance@mundraport.in', 'Finance Officer', 'Manager — Billing'],
    ['Kalpesh Bhatt (Kutch Shipping)', 'agent@mundraport.in', 'Shipping Agent', 'Boarding Agent'],
    ['Vinod Menon', 'ops2@mundraport.in', 'Harbour Master', 'Dy. Harbour Master'],
    ['Lt. Aditi Rathore', 'nmc@mundraport.in', 'NMC Duty Officer', 'Duty Officer — Surveillance Centre'],
  ];
  const staffDefs = [
    ['Capt. Pradeep Chauhan', 'Dock Master — West Basin', 'Harbour Master'],
    ['Capt. Meera Krishnan', 'Senior Pilot', 'Harbour Master'],
    ['Capt. Arjun Jadeja', 'Pilot', 'Harbour Master'],
    ['Capt. Farooq Bukhari', 'Pilot', 'Harbour Master'],
    ['Capt. Devraj Sodha', 'Dy. Conservator', 'Harbour Master'],
    ['Nilesh Gohil', 'Berth Planner', 'Harbour Master'],
    ['Ketan Maheshwari', 'Terminal Duty Manager — CT-3', 'Harbour Master'],
    ['Ravindra Ahir', 'Jetty Supervisor — Liquid Terminal', 'Harbour Master'],
    ['Prakash Koli', 'Foreman — Multipurpose', 'Harbour Master'],
    ['Heena Chudasama', 'Marine Control Room Operator', 'NMC Duty Officer'],
    ['Lt. Vikram Solanki', 'Duty Officer — Surveillance', 'NMC Duty Officer'],
    ['Harshad Mange', 'PFSO Office — ISPS', 'NMC Duty Officer'],
    ['Dr. Kavita Raval', 'Chief — HSE & Fire', 'Marine Surveyor'],
    ['Jaydeep Rathod', 'HSE Officer', 'Marine Surveyor'],
    ['Bhavna Joshi', 'Environment Officer', 'Marine Surveyor'],
    ['Sanjay Vaghela', 'Fire Station Officer', 'Marine Surveyor'],
    ['Narendra Shah', 'Surveyor', 'Marine Surveyor'],
    ['Lt. Rakesh Joshi', 'Asst. Surveyor', 'Marine Surveyor'],
    ['Deepa Krishnamurthy', 'Asst. Manager — Billing', 'Finance Officer'],
    ['Rohan Trivedi', 'Collections Officer', 'Finance Officer'],
    ['Nikita Parmar', 'MIS Analyst', 'Finance Officer'],
  ];
  const emailOf = (n) => `${n.toLowerCase().replace(/\(.*\)/, '').replace(/^(capt|cdr|lt|dr)\.? /, '').trim().replace(/[^a-z]+/g, '.')}@mundraport.in`;
  const users = await M.User.insertMany([
    ...loginUsers.map(([name, email, role, designation], i) => ({
      name, email, passwordHash: hash, role: roleByName[role], designation, phone: mkPhone(i),
      lastLoginAt: new Date(NOW.getTime() - ri(1, 40) * H),
    })),
    ...staffDefs.map(([name, designation, role], i) => ({
      name, email: emailOf(name), passwordHash: hash, role: roleByName[role], designation, phone: mkPhone(i + 10),
      lastLoginAt: rnd() < 0.7 ? new Date(NOW.getTime() - ri(1, 160) * H) : undefined,
    })),
  ]);
  const userByName = Object.fromEntries(users.map((u) => [u.name, u]));
  // ---- extended staff directory: ~100 generated Indian-named users across departments ----
  const FIRST = ['Amit','Bhavesh','Chirag','Darshan','Falguni','Gaurav','Hardik','Ilesh','Jignesh','Kalpana','Lalit','Mahesh',
    'Naresh','Om','Parth','Rajan','Sanjana','Tejas','Umesh','Vandana','Yash','Zarna','Ankit','Bhumika','Chetan','Dhruv',
    'Esha','Firoz','Gopal','Hetal','Ishita','Jay','Kiran','Lakshmi','Mitali','Nirav','Pooja','Rasik','Snehal','Tarun',
    'Urvashi','Vipul','Alpesh','Bharti','Dinesh','Hansa','Jatin','Kamlesh','Mayur','Nita','Pankaj','Rekha'];
  const LAST = ['Patel','Shah','Chauhan','Gohil','Jadeja','Rathod','Solanki','Vaghela','Parmar','Chudasama','Ahir','Rabari',
    'Maheshwari','Trivedi','Joshi','Dave','Mehta','Bhatt','Vyas','Raval','Thakkar','Gandhi','Koli','Manek','Sama','Baraiya',
    'Jethwa','Gadhvi','Mistry','Tandel','Chavda','Makwana','Zala','Dodiya','Sarvaiya','Vala'];
  const DEPTS = [
    ['Marine Operations', [['Asst. Harbour Master','Harbour Master'],['Berth Planner','Harbour Master'],['Marine Officer','Harbour Master'],['VTS Operator','NMC Duty Officer']], 12],
    ['Pilotage', [['Pilot','Port Pilot']], 6],
    ['HSE & Fire', [['HSE Officer','HSE Officer'],['Fire Officer','HSE Officer'],['Environment Officer','HSE Officer'],['Safety Steward','HSE Officer']], 12],
    ['Terminal Operations', [['Terminal Supervisor','Terminal Supervisor'],['Shift In-charge','Terminal Supervisor'],['Yard Planner','Terminal Supervisor'],['Tally In-charge','Terminal Supervisor']], 22],
    ['Engineering & Maintenance', [['Maintenance Engineer','Terminal Supervisor'],['Electrical Engineer','Terminal Supervisor'],['Crane Technician','Terminal Supervisor']], 10],
    ['Finance & Billing', [['Billing Clerk','Billing Clerk'],['Accounts Officer','Finance Officer'],['Collections Executive','Billing Clerk']], 8],
    ['Commercial & Marketing', [['Commercial Executive','Management Viewer'],['Key Account Manager','Management Viewer']], 5],
    ['Security & ISPS', [['Security Officer','Security Officer'],['Gate Supervisor','Security Officer'],['CISF Liaison','Security Officer']], 10],
    ['Surveys & Compliance', [['Surveyor','Marine Surveyor'],['Compliance Auditor','Marine Surveyor']], 6],
    ['IT & Systems', [['Systems Engineer','Management Viewer']], 3],
    ['Human Resources', [['HR Executive','Management Viewer']], 3],
    ['Stores & Procurement', [['Stores Officer','Management Viewer']], 3],
  ];
  const usedEmails = new Set(users.map((u) => u.email));
  const genDocs = [];
  let gi = 0;
  for (const [dept, desigs, count] of DEPTS) {
    for (let k = 0; k < count; k++) {
      const name = `${FIRST[gi % FIRST.length]} ${LAST[(gi * 7 + Math.floor(gi / FIRST.length)) % LAST.length]}`;
      let email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@mundraport.in`;
      let n2 = 2;
      while (usedEmails.has(email)) { email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${n2}@mundraport.in`; n2 += 1; }
      usedEmails.add(email);
      const [designation, roleName] = desigs[k % desigs.length];
      genDocs.push({
        name, email, passwordHash: hash, role: roleByName[roleName], designation, department: dept,
        phone: mkPhone(40 + gi), active: gi % 23 !== 22,
        lastLoginAt: rnd() < 0.65 ? new Date(NOW.getTime() - ri(1, 400) * H) : undefined,
      });
      gi += 1;
    }
  }
  await M.User.insertMany(genDocs);
  // stamp departments on the named staff too
  const namedDept = { 'Capt. Rajiv Nair': 'Marine Operations', 'Vinod Menon': 'Marine Operations', 'Capt. Pradeep Chauhan': 'Marine Operations',
    'Capt. Meera Krishnan': 'Pilotage', 'Capt. Arjun Jadeja': 'Pilotage', 'Capt. Farooq Bukhari': 'Pilotage', 'Capt. Devraj Sodha': 'Marine Operations',
    'Nilesh Gohil': 'Marine Operations', 'Ketan Maheshwari': 'Terminal Operations', 'Ravindra Ahir': 'Terminal Operations', 'Prakash Koli': 'Terminal Operations',
    'Heena Chudasama': 'Marine Operations', 'Lt. Vikram Solanki': 'Marine Operations', 'Harshad Mange': 'Security & ISPS',
    'Dr. Kavita Raval': 'HSE & Fire', 'Jaydeep Rathod': 'HSE & Fire', 'Bhavna Joshi': 'HSE & Fire', 'Sanjay Vaghela': 'HSE & Fire',
    'Narendra Shah': 'Surveys & Compliance', 'Lt. Rakesh Joshi': 'Surveys & Compliance',
    'Deepa Krishnamurthy': 'Finance & Billing', 'Rohan Trivedi': 'Finance & Billing', 'Nikita Parmar': 'Finance & Billing',
    'Cdr. Suresh Patel': 'Surveys & Compliance', 'Meenakshi Iyer': 'Finance & Billing', 'Ashish Sharma': 'IT & Systems', 'Lt. Aditi Rathore': 'Marine Operations' };
  for (const [nm, dept] of Object.entries(namedDept)) {
    if (userByName[nm]) await M.User.updateOne({ _id: userByName[nm]._id }, { $set: { department: dept } });
  }

  const hseOfficers = ['Dr. Kavita Raval', 'Jaydeep Rathod', 'Bhavna Joshi', 'Sanjay Vaghela'].map((n) => userByName[n]);
  const dutyOfficers = ['Lt. Aditi Rathore', 'Lt. Vikram Solanki', 'Heena Chudasama', 'Harshad Mange'].map((n) => userByName[n]);
  const marineOfficers = ['Capt. Rajiv Nair', 'Vinod Menon', 'Capt. Pradeep Chauhan', 'Capt. Devraj Sodha'].map((n) => userByName[n]);

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
    lk('port','NLRTM','Rotterdam', { country: 'Netherlands' }), lk('port','KWKWI','Mina Al Ahmadi', { country: 'Kuwait' }), lk('port','SARTA','Ras Tanura', { country: 'Saudi Arabia' }), lk('port','AEFJR','Fujairah', { country: 'UAE' }), lk('port','IDSMD','Samarinda', { country: 'Indonesia' }), lk('port','ZARCB','Richards Bay', { country: 'South Africa' }), lk('port','ARROS','Rosario', { country: 'Argentina' }),
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

  // ---------- v6 configuration masters (geography · units · assets · org structure) ----------
  await M.Lookup.insertMany([
    // countries (trade-lane + registry set)
    ...[['IN','India'],['CN','China'],['SG','Singapore'],['AE','United Arab Emirates'],['SA','Saudi Arabia'],['MY','Malaysia'],
       ['LK','Sri Lanka'],['NL','Netherlands'],['ID','Indonesia'],['AU','Australia'],['ZA','South Africa'],['AR','Argentina'],
       ['IQ','Iraq'],['KW','Kuwait'],['PA','Panama'],['LR','Liberia'],['MT','Malta'],['HK','Hong Kong SAR'],['MH','Marshall Islands'],['JP','Japan']]
      .map(([c, l2]) => lk('country', c, l2)),
    // states of India (operational footprint)
    ...[['GJ','Gujarat'],['MH2','Maharashtra'],['KL','Kerala'],['TN','Tamil Nadu'],['KA','Karnataka'],['GA','Goa'],
       ['AP','Andhra Pradesh'],['WB','West Bengal'],['OD','Odisha'],['DL','Delhi (NCT)'],['RJ','Rajasthan'],['HR','Haryana']]
      .map(([c, l2]) => lk('state', c, l2, { country: 'IN' })),
    // cities (Kutch cluster + gateway cities)
    ...[['MUNDRA','Mundra','GJ'],['BHUJ','Bhuj','GJ'],['GDM','Gandhidham','GJ'],['ADIPUR','Adipur','GJ'],['MANDVI','Mandvi','GJ'],
       ['ANJAR','Anjar','GJ'],['AMD','Ahmedabad','GJ'],['BOM','Mumbai','MH2'],['MAA','Chennai','TN'],['COK','Kochi','KL'],
       ['CCU','Kolkata','WB'],['VTZ','Visakhapatnam','AP'],['NDLS','New Delhi','DL'],['JPR','Jaipur','RJ'],['FBD','Faridabad','HR']]
      .map(([c, l2, st]) => lk('city', c, l2, { state: st, country: 'IN' })),
    // units of measure
    ...[['MT','Metric Tonne'],['TEU','Twenty-foot Equivalent Unit'],['UNITS','Units (vehicles/pieces)'],['KL','Kilolitre'],
       ['CBM','Cubic Metre'],['MOVE','Crane Move'],['TUGMOV','Tug Movement'],['DAY','Day'],['HR','Hour'],['CALL','Per Call'],
       ['NM','Nautical Mile'],['KN','Knot'],['M','Metre'],['GRT','Gross Register Tonnage']]
      .map(([c, l2]) => lk('uom', c, l2)),
    // currencies
    ...[['INR','Indian Rupee', { symbol: '₹', base: true }],['USD','US Dollar', { symbol: '$' }],['EUR','Euro', { symbol: '€' }],
       ['AED','UAE Dirham', { symbol: 'د.إ' }],['SGD','Singapore Dollar', { symbol: 'S$' }]]
      .map(([c, l2, m2]) => lk('currency', c, l2, m2 || {})),
    // equipment types
    ...[['STS','Ship-to-Shore Crane'],['RTG','Rubber-Tyred Gantry'],['MHC','Harbour Mobile Crane'],['RS','Reach Stacker'],
       ['CONV','Conveyor Stream'],['SL','Shiploader'],['GU','Grab Unloader'],['FL','Forklift'],['TT','Terminal Tractor'],
       ['BOOM','Oil Containment Boom'],['SKIM','Oil Skimmer'],['GWY','Shore Gangway']]
      .map(([c, l2]) => lk('equipmentType', c, l2)),
    // equipment & assets register (used by incident and maintenance flows)
    ...[['STS-01','STS Crane 1 — CT3-1','STS','CT-3 AICTPL (Adani–MSC JV)','OPERATIONAL','ZPMC'],
       ['STS-02','STS Crane 2 — CT3-1','STS','CT-3 AICTPL (Adani–MSC JV)','OPERATIONAL','ZPMC'],
       ['STS-03','STS Crane 3 — CT3-2','STS','CT-3 AICTPL (Adani–MSC JV)','OPERATIONAL','ZPMC'],
       ['STS-04','STS Crane 4 — CT4-1','STS','CT-4 ACMTPL (Adani–CMA CGM JV)','OPERATIONAL','Liebherr'],
       ['STS-05','STS Crane 5 — MICT-1','STS','MICT (DP World)','OPERATIONAL','ZPMC'],
       ['RTG-01','RTG 1 — CT3 Yard Block A','RTG','CT-3 AICTPL (Adani–MSC JV)','OPERATIONAL','Konecranes'],
       ['RTG-02','RTG 2 — CT3 Yard Block B','RTG','CT-3 AICTPL (Adani–MSC JV)','OPERATIONAL','Konecranes'],
       ['RTG-03','RTG 3 — CT4 Yard','RTG','CT-4 ACMTPL (Adani–CMA CGM JV)','MAINTENANCE','Konecranes'],
       ['MHC-01','Harbour Mobile Crane 1 — MP','MHC','Multipurpose Terminal','OPERATIONAL','Liebherr LHM 550'],
       ['MHC-02','Harbour Mobile Crane 2 — MP','MHC','Multipurpose Terminal','OPERATIONAL','Liebherr LHM 550'],
       ['GU-01','Grab Unloader 1 — WB-1','GU','West Basin Coal Terminal','OPERATIONAL','ThyssenKrupp'],
       ['GU-02','Grab Unloader 2 — WB-2','GU','West Basin Coal Terminal','OPERATIONAL','ThyssenKrupp'],
       ['CONV-W1','Coal Conveyor Stream 1','CONV','West Basin Coal Terminal','OPERATIONAL','—'],
       ['CONV-W2','Coal Conveyor Stream 2','CONV','West Basin Coal Terminal','OPERATIONAL','—'],
       ['SL-01','Shiploader — Bulk Export','SL','Multipurpose Terminal','OPERATIONAL','—'],
       ['RS-01','Reach Stacker 1','RS','CT-3 AICTPL (Adani–MSC JV)','OPERATIONAL','Kalmar'],
       ['RS-02','Reach Stacker 2','RS','CT-4 ACMTPL (Adani–CMA CGM JV)','OPERATIONAL','Kalmar'],
       ['BOOM-A','Containment Boom Set A (400 m)','BOOM','Liquid Terminal','OPERATIONAL','—'],
       ['SKIM-1','Disc Skimmer Unit 1','SKIM','Liquid Terminal','OPERATIONAL','—'],
       ['GWY-L1','Shore Gangway — LB-1','GWY','Liquid Terminal','OPERATIONAL','—']]
      .map(([c, l2, t, term, st, make]) => lk('equipment', c, l2, { type: t, terminal: term, status: st, make })),
    // departments & designations
    ...[['MAR','Marine Operations'],['PIL','Pilotage'],['HSE','HSE & Fire'],['TER','Terminal Operations'],
       ['ENG','Engineering & Maintenance'],['FIN','Finance & Billing'],['COM','Commercial & Marketing'],
       ['SEC','Security & ISPS'],['SUR','Surveys & Compliance'],['IT','IT & Systems'],['HR2','Human Resources'],['STO','Stores & Procurement']]
      .map(([c, l2]) => lk('department', c, l2)),
    ...[['AHM','Asst. Harbour Master','Marine Operations'],['BP','Berth Planner','Marine Operations'],['MO','Marine Officer','Marine Operations'],
       ['VTS','VTS Operator','Marine Operations'],['PLT','Pilot','Pilotage'],['HSO','HSE Officer','HSE & Fire'],
       ['FO','Fire Officer','HSE & Fire'],['EO','Environment Officer','HSE & Fire'],['TS','Terminal Supervisor','Terminal Operations'],
       ['SIC','Shift In-charge','Terminal Operations'],['YP','Yard Planner','Terminal Operations'],['ME','Maintenance Engineer','Engineering & Maintenance'],
       ['EE','Electrical Engineer','Engineering & Maintenance'],['CT','Crane Technician','Engineering & Maintenance'],
       ['BC','Billing Clerk','Finance & Billing'],['AO','Accounts Officer','Finance & Billing'],['CE','Collections Executive','Finance & Billing'],
       ['CX','Commercial Executive','Commercial & Marketing'],['SO','Security Officer','Security & ISPS'],['GS','Gate Supervisor','Security & ISPS'],
       ['SV','Surveyor','Surveys & Compliance'],['CA','Compliance Auditor','Surveys & Compliance'],['SE','Systems Engineer','IT & Systems'],
       ['HRX','HR Executive','Human Resources']]
      .map(([c, l2, d2]) => lk('designation', c, l2, { department: d2 })),
    // shifts
    ...[['A','Shift A (0600–1400)', { start: '06:00', end: '14:00' }],['B','Shift B (1400–2200)', { start: '14:00', end: '22:00' }],
       ['C','Shift C (2200–0600)', { start: '22:00', end: '06:00' }],['G','General (0900–1800)', { start: '09:00', end: '18:00' }]]
      .map(([c, l2, m2]) => lk('shift', c, l2, m2)),
    // document types (incident & compliance attachments)
    ...[['REPORT','Report'],['PHOTO','Photographs'],['STATEMENT','Statement'],['SAMPLE','Sample / Analysis'],
       ['PERMIT','Permit to Work'],['CCTV','CCTV Footage'],['MANIFEST','Cargo Manifest'],['SURVEY','Survey Report'],
       ['NOTICE','Notice / Letter'],['OTHER','Other']]
      .map(([c, l2]) => lk('documentType', c, l2)),
    // incident locations
    ...[['APPCH','Approach channel'],['ANCH-A1','Outer anchorage A1'],['FWY','Fairway buoy sector'],['GATE','Gate complex'],
       ['CT3YD','CT-3 container yard'],['CT4YD','CT-4 container yard'],['WBSY','West Basin stockyard'],['TANKF','Liquid terminal tank farm'],
       ['SEZ2','SEZ Zone-2'],['RAILY','Railway sidings'],['WSHOP','Engineering workshop']]
      .map(([c, l2]) => lk('incidentArea', c, l2)),
    // holiday calendar 2026 (port runs 24×365 — flags restricted gate/office working)
    ...[['REP26','Republic Day', '2026-01-26'],['HOLI26','Holi (Dhuleti)', '2026-03-04'],['GDFR26','Good Friday', '2026-04-03'],
       ['IDU26','Idul Fitr', '2026-03-21'],['IND26','Independence Day', '2026-08-15'],['GAN26','Ganesh Chaturthi', '2026-09-14'],
       ['GJ26','Gandhi Jayanti', '2026-10-02'],['DUS26','Dussehra', '2026-10-20'],['DIW26','Diwali', '2026-11-08'],
       ['BHAI26','Bhai Dooj', '2026-11-11'],['XMAS26','Christmas Day', '2026-12-25']]
      .map(([c, l2, d2]) => lk('holiday', c, l2, { date: d2, working: '24×365 marine ops — office & gate restricted' })),
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
    ].map((t, i) => ({ seq: i + 1, text: t, category: i < 2 ? 'Documentation' : i < 5 ? 'Safety' : 'Machinery & MARPOL',
      answerType: 'YES_NO_NA', weight: i < 2 ? 3 : 2, critical: i === 0 || i === 5,
      guidance: i === 0 ? 'Verify originals on board; check endorsements and validity dates.' : '' })),
      description: 'Initial PSC boarding checklist aligned to Tokyo/Indian Ocean MoU practice.', passScorePct: 85 },
    { name: 'Pre-Berthing Safety Check', inspectionType: 'FSI', items: [
      'Arrival draft within berth limit', 'Dangerous goods declaration reviewed',
      'Mooring plan agreed with pilot', 'Gangway and access arrangement safe', 'Bunker operations notified',
    ].map((t, i) => ({ seq: i + 1, text: t, category: 'Pre-berthing', answerType: 'YES_NO_NA', weight: 2, critical: i === 0 })),
      description: 'Marine pre-berthing verification run by the duty berth planner.', passScorePct: 100 },
    { name: 'MLC On-board Conditions', inspectionType: 'MLC', items: [
      'Seafarer employment agreements available', 'Wage records up to date', 'Rest hour records maintained',
      'Food and catering standard', 'Medical chest inventory complete',
    ].map((t, i) => ({ seq: i + 1, text: t, category: 'MLC', answerType: 'YES_NO_NA', weight: 2, critical: i === 2 })),
      description: 'On-board living and working condition verification under MLC 2006.', passScorePct: 80 },
    { name: 'HSE Walkabout — Terminal', inspectionType: 'HSE', passScorePct: 80,
      description: 'Weekly HSE walkabout of a working terminal — housekeeping, PPE, permits, emergency readiness.',
      items: [
        ['PPE worn by all personnel in cargo areas', 'PPE & People', 3, true],
        ['Toolbox talk record available for the shift', 'PPE & People', 2, false],
        ['Walkways and quay apron clear of obstructions', 'Housekeeping', 2, false],
        ['Spill kits stocked and accessible', 'Emergency readiness', 3, false],
        ['Fire extinguishers in date and unobstructed', 'Emergency readiness', 3, true],
        ['Hot-work permits displayed at worksites', 'Permits', 3, true],
        ['Working-at-height controls in place on lashing bridges', 'Permits', 2, false],
        ['Lighting adequate in working areas (night shift)', 'Housekeeping', 2, false],
        ['Waste segregation bins not overflowing', 'Housekeeping', 1, false],
        ['Emergency assembly point signage visible', 'Emergency readiness', 1, false],
      ].map(([text, category, weight, critical], i) => ({ seq: i + 1, text, category, weight, critical, answerType: 'YES_NO_NA' })) },
    { name: 'Terminal Safety Audit — Equipment', inspectionType: 'TERMINAL', passScorePct: 85,
      description: 'Quarterly audit of terminal cargo-handling equipment and operator competency.',
      items: [
        ['Crane daily inspection log up to date', 'Cranes', 3, true],
        ['Limit switches and anti-collision tested', 'Cranes', 3, true],
        ['Wire ropes within discard criteria', 'Cranes', 3, false],
        ['RTG/ITV seat belts and cameras functional', 'Yard equipment', 2, false],
        ['Operators hold valid competency cards', 'People', 3, true],
        ['Fuelling area bunded and signed', 'Yard', 2, false],
        ['Reefer towers earthed and guarded', 'Yard', 2, false],
        ['Conveyor emergency pull-cords tested', 'Bulk stream', 3, true],
      ].map(([text, category, weight, critical], i) => ({ seq: i + 1, text, category, weight, critical, answerType: 'YES_NO_NA' })) },
  ]);

  // ---------- berths ----------
  const berthDefs = [
    // 12 container berths across the five researched facilities (~7.5M TEU capacity)
    ['MICT-1','MICT Berth 1','MICT (DP World)','CONTAINER',350,15.5],
    ['MICT-2','MICT Berth 2','MICT (DP World)','CONTAINER',350,15.5],
    ['AMCT-1','AMCT Berth 1','AMCT (Adani)','CONTAINER',315,15],
    ['AMCT-2','AMCT Berth 2','AMCT (Adani)','CONTAINER',316,15],
    ['AMC2-1','AMCT-2 Berth 1','AMCT-2 (Adani)','CONTAINER',392,16.5],
    ['AMC2-2','AMCT-2 Berth 2','AMCT-2 (Adani)','CONTAINER',393,16.5],
    ['CT3-1','CT-3 Berth 1','CT-3 AICTPL (Adani–MSC JV)','CONTAINER',365,17.5],
    ['CT3-2','CT-3 Berth 2','CT-3 AICTPL (Adani–MSC JV)','CONTAINER',365,17.5],
    ['CT3-3','CT-3 Berth 3','CT-3 AICTPL (Adani–MSC JV)','CONTAINER',365,17.5],
    ['CT3-4','CT-3 Berth 4','CT-3 AICTPL (Adani–MSC JV)','CONTAINER',365,17.5],
    ['CT4-1','CT-4 Berth 1','CT-4 ACMTPL (Adani–CMA CGM JV)','CONTAINER',325,16.5],
    ['CT4-2','CT-4 Berth 2','CT-4 ACMTPL (Adani–CMA CGM JV)','CONTAINER',325,16.5],
    // West Basin — world's largest fully mechanised coal import terminal (60 MTPA)
    ['WB-1','West Basin Coal Berth 1','West Basin Coal Terminal','COAL',330,18],
    ['WB-2','West Basin Coal Berth 2','West Basin Coal Terminal','COAL',330,18],
    // multipurpose / break-bulk (fertilizer, steel, project, grain)
    ['MP-1','Multipurpose Berth 1','Multipurpose Terminal','MULTIPURPOSE',260,14],
    ['MP-2','Multipurpose Berth 2','Multipurpose Terminal','MULTIPURPOSE',260,14],
    ['MP-3','Multipurpose Berth 3','Multipurpose Terminal','MULTIPURPOSE',260,14],
    ['MP-4','Multipurpose Berth 4','Multipurpose Terminal','MULTIPURPOSE',260,14],
    // liquid terminal — edible oil, POL, chemicals (tank farms + pipelines)
    ['LB-1','Liquid Berth 1','Liquid Terminal','LIQUID',290,15],
    ['LB-2','Liquid Berth 2','Liquid Terminal','LIQUID',290,15],
    ['LB-3','Liquid Berth 3','Liquid Terminal','LIQUID',290,15],
    // single point moorings — crude for refinery pipelines; VLCC-capable
    ['SPM-1','Single Point Mooring 1 (crude)','SPM Crude','SPM',345,24],
    ['SPM-2','Single Point Mooring 2 (crude)','SPM Crude','SPM',345,24],
    // dedicated Ro-Ro — India's largest automobile export hub
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
    // container (calls MICT/AMCT/CT-3/CT-4) — parcel sizes 2.5k–14k TEU
    ['MV Kutch Emerald','CONT',48000,52000,334],['MV Saurashtra Glory','CONT',95000,101000,366],
    ['MV Mundra Express','CONT',41000,45000,300],['MV Arabian Crest','CONT',141000,148000,397],
    ['MV Malabar Horizon','CONT',68000,74000,352],['MV Indus Fortune','CONT',36000,40000,285],
    ['MV Gulf Pearl','CONT',110000,118000,366],['MV Kandla Spirit','CONT',52000,58000,347],
    // dry bulk — capesize/panamax coal into West Basin, fertilizer/grain at MP
    ['MV Gulf of Kutch','BULK',92000,180000,289],['MV Konkan Breeze','BULK',36000,63000,225],
    ['MV Coromandel Trader','BULK',44000,82000,229],['MV Vindhya Pride','BULK',88000,176000,292],
    ['MV Narmada Spirit','BULK',34000,61000,225],['MV Deccan Voyager','BULK',42000,76000,235],
    // tankers — VLCC crude at SPM, product/edible at LB (MT Bangus: real record parcel)
    ['MT Kandla Jyoti','TANK',160000,300000,333],['MT Gujarat Star','TANK',157000,299000,330],
    ['MT Bhuj Radiance','TANK',30000,47000,183],['MT Sagar Ratna','TANK',62000,113000,250],
    ['MT Bangus','TANK',42000,73000,228],
    // general / project
    ['MV Coastal Karavan','GEN',19000,28000,180],['MV Porbandar Breeze','GEN',22000,32000,190],
    // car carriers — Maruti Suzuki / Toyota exports via dedicated Ro-Ro
    ['MV Dwarka Wave','RORO',59000,21000,200],['MV Somnath Carrier','RORO',61000,22500,200],
  ];
  // Documented Mundra callers (public berthing reports / carrier schedules) — kept with clean
  // compliance records; incidents, detentions and billing stay on the demo fleet above.
  const realDefs = [
    ['MSC Anna','CONT',192000,199000,399, 19224, 'MSC Mediterranean Shipping Company'],   // largest boxship to call Mundra
    ['APL Raffles','CONT',153000,151000,397, 17292, 'APL / CMA CGM Group'],
    ['MSC Al Rawdah','CONT',153000,149000,366, 14336, 'MSC Mediterranean Shipping Company'],
    ['Maersk Kensington','CONT',74642,83700,300, 6478, 'Maersk Line'],
    ['Maersk Chicago','CONT',74642,83700,300, 6478, 'Maersk Line'],
    ['CMA CGM Ural','CONT',140872,148992,366, 13344, 'CMA CGM'],
    ['ESL Wafa','CONT',88586,101000,334, 8464, 'Emirates Shipping Line'],
    ['Folk Jazan','CONT',27100,34800,222, 2556, 'Folk Maritime'],
  ];
  const certTypes = ['Certificate of Registry','Classification Certificate','Safety Management Certificate',
    'International Ship Security Certificate','IOPP Certificate','Load Line Certificate','Maritime Labour Certificate'];
  const operators = ['Sagarmala Coastal Lines', 'Bharat Ocean Carriers', 'Hind Levant Shipping', 'Malabar Navigation Co', 'GreatIndia Shipping LLP'];
  const managers = ['Fleetwise Ship Management, Mumbai', 'Samudra Ship Management, Kochi', 'Arya Marine Services, Chennai', 'Westline Shipmanagement, Gandhidham'];
  const piClubs = ['IndOcean P&I Mutual', 'Sagar Shield P&I', 'Coromandel P&I Association'];
  const yards = ['Cochin Shipyard, Kochi', 'Hyundai HI, Ulsan', 'Imabari Shipbuilding, Japan', 'Jiangnan Shipyard, Shanghai', 'Hanwha Ocean, Geoje'];
  const engines = [['MAN B&W', '6G70ME-C', 21840], ['WinGD', 'X72-B', 24700], ['Wärtsilä', 'RT-flex68-D', 18460], ['MAN B&W', '7S60ME-C', 15820]];
  const registries = { India: ['Mumbai', 'Kolkata', 'Kochi'], Panama: ['Panama City'], Liberia: ['Monrovia'], 'Marshall Islands': ['Majuro'], Singapore: ['Singapore'], Malta: ['Valletta'], 'Hong Kong': ['Hong Kong'] };
  const vessels = await M.Vessel.insertMany([
    ...vdefs.map(([name, type, grt, dwt, loa], i) => {
      const certs = certTypes.map((certType, j) => {
        let expiry = new Date(NOW.getTime() + (120 + ((i * 7 + j * 97) % 700)) * D);
        if (i === 2 && j === 2) expiry = new Date(NOW.getTime() + 11 * D);      // SMC expiring
        if (i === 7 && j === 4) expiry = new Date(NOW.getTime() + 24 * D);      // IOPP expiring
        if (i === 12 && j === 5) expiry = new Date(NOW.getTime() + 18 * D);     // Load line expiring
        if (i === 11 && j === 6) expiry = new Date(NOW.getTime() - 12 * D);     // MLC expired (MV Vindhya Pride — matches the seeded alert)
        if (i === 16 && j === 3) expiry = new Date(NOW.getTime() - 40 * D);     // ISSC expired
        return {
          certType, number: `${certType.split(' ').map((w) => w[0]).join('')}-${9100 + i * 13 + j}`,
          issuer: j === 1 ? pick(classes) : 'DG Shipping / RO',
          issueDate: new Date(expiry.getTime() - 5 * 365 * D), expiryDate: expiry,
        };
      });
      const flag = i % 3 === 0 ? 'India' : pick(flags);
      const eng = engines[i % engines.length];
      const ldd = new Date(NOW.getTime() - ri(200, 850) * D);
      return {
        name, imo: String(9700001 + i), mmsi: String(419000100 + i), callSign: `AT${String.fromCharCode(65 + (i % 26))}${2200 + i}`,
        flag, type, built: 2005 + (i % 17), dwt, grt, loa,
        beam: Math.round(loa / 6.8), maxDraft: type === 'TANK' ? 17 + (i % 5) : 11 + (i % 5),
        owner: `${name.replace(/^M[VT] /, '')} Shipping Ltd`,
        operator: operators[i % operators.length], manager: managers[i % managers.length],
        agent: agents[i % agents.length],
        classSociety: classes[i % classes.length], piClub: piClubs[i % piClubs.length],
        portOfRegistry: pick(registries[flag] || ['—']),
        yard: yards[i % yards.length],
        engine: { maker: eng[0], model: eng[1], powerKW: eng[2] },
        serviceSpeedKn: type === 'CONT' ? ri(19, 23) : type === 'RORO' ? ri(17, 19) : ri(12, 15),
        teuCapacity: type === 'CONT' ? Math.round(dwt / 11) : undefined,
        lastDryDock: ldd, nextDryDock: new Date(ldd.getTime() + 2.5 * 365 * D),
        certificates: certs,
      };
    }),
    ...realDefs.map(([name, type, grt, dwt, loa, teu, operator], k) => {
      const i = vdefs.length + k;
      const certs = certTypes.map((certType, j) => ({
        certType, number: `${certType.split(' ').map((w) => w[0]).join('')}-${9100 + i * 13 + j}`,
        issuer: j === 1 ? 'DNV' : 'Flag administration / RO',
        issueDate: new Date(NOW.getTime() - 2 * 365 * D),
        expiryDate: new Date(NOW.getTime() + (200 + ((i * 13 + j * 61) % 800)) * D),  // clean records
      }));
      const eng = engines[i % engines.length];
      return {
        name, imo: String(9700001 + i), mmsi: String(419000100 + i), callSign: `LN${String.fromCharCode(65 + (i % 26))}${2200 + i}`,
        flag: pick(['Panama', 'Liberia', 'Malta', 'Singapore']), type, built: 2010 + (k % 12), dwt, grt, loa,
        beam: Math.round(loa / 6.9), maxDraft: 15 + (k % 3),
        owner: operator, operator, manager: operator,
        agent: agents[i % agents.length],
        classSociety: pick(['DNV', 'LR', 'ABS']), piClub: 'IG member club',
        portOfRegistry: '—', yard: yards[i % yards.length],
        engine: { maker: eng[0], model: eng[1], powerKW: eng[2] },
        serviceSpeedKn: 22, teuCapacity: teu,
        certificates: certs, liner: true,
      };
    }),
  ]);
  const demoFleet = vessels.slice(0, vdefs.length);          // fictional fleet — carries incidents & billing
  const linerFleet = vessels.slice(vdefs.length);            // documented callers — schedule realism only
  const vByType = (t) => demoFleet.filter((v) => v.type === t);

  // ---------- port call history (12 months, SAILED) ----------
  const cargoFor = (vt, vessel) => {
    if (vt === 'CONT') { // 2.5k–9.5k TEU exchanges; CT-3 marquee calls to 14k
      const big = vessel && vessel.grt > 100000;
      return { cargoType: 'CONTAINERS', unit: 'TEU', qty: big ? ri(7000, 14000) : ri(2500, 7500), mtFactor: 12 };
    }
    if (vt === 'BULK') {
      const cape = vessel && vessel.dwt > 120000;
      const c = cape ? 'COAL' : pick(['COAL','FERT','GRAIN','STEEL']);
      return { cargoType: c, unit: 'MT', qty: c === 'COAL' ? (cape ? ri(120000, 165000) : ri(55000, 75000)) : ri(28000, 55000), mtFactor: 1 };
    }
    if (vt === 'TANK') {
      const vlcc = vessel && vessel.dwt > 200000;
      if (vlcc) return { cargoType: 'CRUDE', unit: 'MT', qty: ri(180000, 265000), mtFactor: 1 };
      const c = pick(['POL','EDIBLE','POL']);
      return { cargoType: c, unit: 'MT', qty: c === 'EDIBLE' ? ri(18000, 52000) : ri(25000, 45000), mtFactor: 1 };
    }
    if (vt === 'RORO') return { cargoType: 'AUTO', unit: 'UNITS', qty: ri(1800, 4800), mtFactor: 1.5 };
    return { cargoType: pick(['STEEL','PROJ','GRAIN']), unit: 'MT', qty: ri(9000, 28000), mtFactor: 1 };
  };
  const berthFor = (vt, cargo) => {
    if (vt === 'CONT') return pick(berthsByType('CONTAINER'));
    if (vt === 'TANK') return cargo === 'CRUDE' ? berthsByType('SPM')[0] : pick(berthsByType('LIQUID'));
    if (vt === 'RORO') return berthsByType('RORO')[0];
    if (cargo === 'COAL') return pick(berthsByType('COAL'));
    return pick(berthsByType('MULTIPURPOSE'));
  };
  const durFor = (vt) => (vt === 'CONT' ? ri(14, 30) : vt === 'TANK' ? ri(28, 56) : vt === 'RORO' ? ri(14, 26) : ri(55, 110));
  const portsArr = ['CNSHA — Shanghai','SGSIN — Singapore','AEJEA — Jebel Ali','SAJED — Jeddah','MYPKG — Port Klang','LKCMB — Colombo','NLRTM — Rotterdam','IQBSR — Basrah','SARTA — Ras Tanura','AEFJR — Fujairah','IDSMD — Samarinda','AUHPT — Hay Point','ZARCB — Richards Bay','IDDUM — Dumai','ARROS — Rosario','INNSA — Nhava Sheva'];
  const lanesFor = { CONT: ['CNSHA — Shanghai','SGSIN — Singapore','AEJEA — Jebel Ali','MYPKG — Port Klang','LKCMB — Colombo','NLRTM — Rotterdam','SAJED — Jeddah'],
    COAL: ['IDSMD — Samarinda','AUHPT — Hay Point','ZARCB — Richards Bay'],
    CRUDE: ['SARTA — Ras Tanura','IQBSR — Basrah','AEFJR — Fujairah','KWKWI — Kuwait'],
    LIQ: ['IDDUM — Dumai','ARROS — Rosario','AEFJR — Fujairah','MYPKG — Port Klang'],
    OTHER: ['AEJEA — Jebel Ali','SGSIN — Singapore','SAJED — Jeddah','ZARCB — Richards Bay','INNSA — Nhava Sheva'] };
  const laneFor = (vt, cargo) => {
    const list = vt === 'CONT' ? lanesFor.CONT : cargo === 'COAL' ? lanesFor.COAL
      : cargo === 'CRUDE' ? lanesFor.CRUDE : ['POL','EDIBLE'].includes(cargo) ? lanesFor.LIQ : lanesFor.OTHER;
    return list[Math.floor(rnd() * list.length)];
  };

  const seq = {};
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

  for (let mBack = HIST_MONTHS; mBack >= 0; mBack--) {
    const mStart = new Date(NOW.getFullYear(), NOW.getMonth() - mBack, 1);
    const daysInM = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0).getDate();
    // traffic ramps from ri(18,24)/mo at the back of history (2023) to today's ri(30,36)/mo —
    // a growing port, not a flat plateau, and matches current density exactly at mBack=0
    const growth = 1 - mBack / HIST_MONTHS;
    const n = ri(Math.round(18 + growth * 12), Math.round(24 + growth * 12));
    const monthCalls = [];
    for (let k = 0; k < n; k++) {
      const v = pick(vessels);
      const cargo = cargoFor(v.type, v);
      const berth = berthFor(v.type, cargo.cargoType);
      const ata = new Date(mStart.getTime() + (rnd() * (daysInM - 5) + 1) * D + ri(0, 23) * H);
      if (ata > new Date(NOW.getTime() - 3 * D)) continue;              // keep history clear of "now"
      // Cyclone Biparjoy — berths vacated and arrivals suspended (PORT-N-02/2023)
      if (ata >= new Date(2023, 5, 12) && ata < new Date(2023, 5, 17)) continue;
      const waitedH = ri(3, 30);
      const atb = new Date(ata.getTime() + waitedH * H);
      const atd = new Date(atb.getTime() + durFor(v.type) * H);
      if (atd > new Date(NOW.getTime() - 2 * H)) continue;              // a SAILED record must be fully in the past
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
        prevPort: laneFor(c.v.type, c.ops[0].cargoType), nextPort: laneFor(c.v.type, c.ops[0].cargoType),
        draftArrival: Math.round((c.v.maxDraft - rnd() * 3) * 10) / 10,
        draftDeparture: Math.round((c.v.maxDraft - rnd() * 4) * 10) / 10,
        crew: { count: ri(18, 26), master: pick(['Capt. Amarjit Singh','Capt. Joseph Fernandes','Capt. Mohan Rao','Capt. Harish Ambani','Capt. Zubin Contractor','Capt. Nitin Palekar']) },
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
    ['CONT','CT3-1'],['CONT','MICT-1'],['CONT','CT4-1'],['CONT','AMC2-1'],['BULK','WB-1'],['TANK','LB-1'],['TANK','SPM-1'],['RORO','RR-1'],
  ];
  for (const [vt, bcode] of berthedPlan) {
    const v = pickVessel(vt);
    const b = berths.find((x) => x.code === bcode);
    const cargo = cargoFor(vt, v);
    const atb = new Date(NOW.getTime() - ri(8, 30) * H);
    const ata = new Date(atb.getTime() - ri(4, 18) * H);
    const etd = new Date(NOW.getTime() + ri(10, 34) * H);
    activeDocs.push({
      vcn: vcnFor(ata), vessel: v._id, agentCode: v.agent, agentName: agentNames[v.agent],
      purpose: 'Discharge', status: 'BERTHED', eta: new Date(ata.getTime() - 5 * H), etb: atb, etd,
      ata, atb, berth: b._id, prevPort: pick(portsArr), nextPort: pick(portsArr),
      draftArrival: Math.round((v.maxDraft - rnd() * 2) * 10) / 10,
      crew: { count: ri(18, 26), master: pick(['Capt. Amarjit Singh','Capt. Dinesh Kumar','Capt. Elias D\'Souza']) },
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
      prevPort: pick(portsArr), crew: { count: ri(18, 24), master: pick(['Capt. Mohan Rao','Capt. Nitin Palekar','Capt. Dinesh Kumar']) },
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
  { // MT Bangus — India's largest single edible-oil discharge (66,800 MT DSBO), kept as a marquee historical record
    const v = vessels.find((x) => x.name === 'MT Bangus');
    const b = berths.find((x) => x.code === 'LB-2');
    const ata = new Date(NOW.getFullYear(), NOW.getMonth() - 5, 9, 4, 0);
    const atb = new Date(ata.getTime() + 9 * H);
    const atd = new Date(atb.getTime() + 88 * H);
    callDocs.push({
      vcn: vcnFor(ata), vessel: v._id, agentCode: v.agent, agentName: agentNames[v.agent],
      purpose: 'Discharge', status: 'SAILED', eta: new Date(ata.getTime() - 6 * H), etb: atb, etd: atd,
      ata, atb, atd, berth: b._id, prevPort: 'ARROS — Rosario', nextPort: 'SGSIN — Singapore',
      draftArrival: 12.8, draftDeparture: 8.2,
      crew: { count: 24, master: 'Capt. Joseph Fernandes' },
      services: mkServices('TANK', 9),
      cargoOps: [{ cargoType: 'EDIBLE', operation: 'DISCHARGE', qty: 66800, unit: 'MT', qtyMT: 66800, gangs: 2,
        startedAt: new Date(atb.getTime() + 2 * H), completedAt: new Date(atd.getTime() - 3 * H),
        remarks: "India's largest-ever single-vessel edible oil parcel — 66,800 MT degummed soybean oil" }],
      remarks: 'Record parcel: largest single edible-oil discharge handled at an Indian port.',
      statusHistory: [
        { from: '', to: 'ANNOUNCED', at: new Date(ata.getTime() - 4 * D), by: 'seed', note: '' },
        { from: 'ANNOUNCED', to: 'CONFIRMED', at: new Date(ata.getTime() - 2 * D), by: 'seed', note: '' },
        { from: 'CONFIRMED', to: 'AT_ANCHORAGE', at: ata, by: 'seed', note: '' },
        { from: 'AT_ANCHORAGE', to: 'BERTHED', at: atb, by: 'seed', note: '' },
        { from: 'BERTHED', to: 'SAILED', at: atd, by: 'seed', note: '' },
      ],
      createdAt: new Date(ata.getTime() - 4 * D), updatedAt: atd,
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
    if (v && v.liner) continue;              // documented callers stay out of demo billing
    const lines = buildInvoiceLines({ vessel: v, services: call.services, cargoOps: call.cargoOps }, tariffs);
    if (!lines.length) continue;
    const totals = computeTotals(lines, GST_RATE);
    const issuedAt = new Date(call.atd.getTime() + 2 * D);
    const y = yearOf(issuedAt);
    invSeq[y] = (invSeq[y] || 0) + 1;
    const ageD = (NOW - issuedAt) / D;
    // an invoice can only be PAID once its payment lag has actually elapsed
    const payLag = ri(7, 30);
    const status = ageD > 45 ? 'PAID' : ageD > payLag ? (rnd() < 0.6 ? 'PAID' : 'ISSUED') : ageD > 5 ? 'ISSUED' : 'DRAFT';
    invDocs.push({
      number: `MUN/INV/${y}/${String(invSeq[y]).padStart(4, '0')}`,
      portCall: call._id, vessel: call.vessel,
      billTo: { name: call.agentName, address: 'Mundra, Kutch, Gujarat', gstin: '24XXXXX0000X1Z5 (sample)' },
      lines: totals.lines, subtotal: totals.subtotal, gstRate: GST_RATE, gstAmount: totals.gstAmount, total: totals.total,
      status, issuedAt: status === 'DRAFT' ? undefined : issuedAt,
      paidAt: status === 'PAID' ? new Date(issuedAt.getTime() + payLag * D) : undefined,
      paymentRef: status === 'PAID' ? `NEFT-${ri(100000, 999999)}` : '',
      createdAt: issuedAt, updatedAt: issuedAt,
    });
  }
  await M.Invoice.insertMany(invDocs, { timestamps: false });
  console.log(`invoices: ${invDocs.length}`);

  // ---------- inspections ----------
  const insDocs = [];
  let insSeqN = {};
  const defCodes = ['01101','04103','07105','10111','11101','13101','14104','18203'];
  const linerIds = new Set(linerFleet.map((v) => String(v._id)));
  // spread ~20/yr across the whole history (chronological order preserved) instead of
  // taking the first 20 matches, which would all land in 2023 once the pool triples
  const eligibleForIns = sailed.filter((c) => !linerIds.has(String(c.vessel)));
  const N_INS_HIST = Math.round(20 * HIST_DAYS / 360);
  const strideIns = Math.max(1, Math.floor(eligibleForIns.length / N_INS_HIST));
  const pastForIns = eligibleForIns.filter((_, i) => i % strideIns === 0).slice(0, N_INS_HIST);
  pastForIns.forEach((call, idx) => {
    const type = rnd() < 0.55 ? 'PSC' : rnd() < 0.5 ? 'FSI' : pick(['ISM','MLC']);
    const template = tpl.find((t) => t.inspectionType === type) || tpl[0];
    const startedAt = new Date(call.atb.getTime() + 5 * H);
    const detained = idx % 10 === 4;
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
      inspector: pick(['Cdr. Suresh Patel','Lt. Rakesh Joshi','Narendra Shah']),
      plannedAt: startedAt, startedAt, closedAt: new Date(startedAt.getTime() + 9 * H),
      status: 'CLOSED', result: detained ? 'DETAINED' : nFind ? 'DEFICIENCIES' : 'SATISFACTORY',
      detention: detained,
      checklist: template.items.map((i2) => ({ seq: i2.seq, text: i2.text, category: i2.category, answer: rnd() < 0.9 ? 'YES' : 'NO', note: '' })),
      findings, createdAt: startedAt, updatedAt: startedAt,
    });
  });
  // open inspections now
  const berthedNow = allCalls.filter((c) => c.status === 'BERTHED' && !linerIds.has(String(c.vessel)));
  [0, 1].forEach((i) => {
    const call = berthedNow[i];
    const y = yearOf(NOW); insSeqN[y] = (insSeqN[y] || 0) + 1;
    insDocs.push({
      number: `INS-${y}-${String(insSeqN[y]).padStart(3, '0')}`,
      vessel: call.vessel, portCall: call._id, type: i === 0 ? 'PSC' : 'MLC',
      inspector: 'Cdr. Suresh Patel', plannedAt: new Date(NOW.getTime() - 4 * H), startedAt: new Date(NOW.getTime() - 3 * H),
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
      vessel: conf.vessel, portCall: conf._id, type: 'FSI', inspector: 'Lt. Rakesh Joshi',
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

  // ---------- seafarers ----------
  const sfNames = [['Rajesh Verma','Master'],['Anil Deshmukh','Chief Officer'],['S. Krishnan','Chief Engineer'],
    ['Mohammed Rafi','Second Engineer'],['P. Chakraborty','Second Officer'],['Gurpreet Singh','Third Officer'],
    ['Vikas Yadav','Electro-Technical Officer'],['Ramesh Solanki','Bosun'],['Dinesh Kumar','Able Seaman'],
    ['Suresh Nair','Able Seaman'],['Manoj Tiwari','Oiler'],['Arjun Pillai','Fitter'],['Joseph D\'Souza','Cook'],
    ['Rahul Meena','Deck Cadet'],['Sandeep Rana','Engine Cadet'],['K. Balasubramanian','Chief Engineer'],
    ['Imran Shaikh','Second Officer'],['Tenzin Dorjee','Ordinary Seaman']];
  const sfCertPlan = ['Certificate of Competency','GMDSS GOC','Medical Fitness (ILO/MLC)','STCW Basic Safety Training','Advanced Fire Fighting'];
  const seafarers = await M.Seafarer.insertMany(sfNames.map(([name, rank], i) => {
    const certs = sfCertPlan.slice(0, rank.includes('Cadet') || rank.includes('Seaman') ? 3 : 5).map((certType, j) => {
      let expiry = new Date(NOW.getTime() + (90 + ((i * 11 + j * 71) % 900)) * D);
      if (i === 3 && j === 2) expiry = new Date(NOW.getTime() + 14 * D);   // medical expiring
      if (i === 7 && j === 3) expiry = new Date(NOW.getTime() - 20 * D);   // BST expired
      return { certType, grade: certType === 'Certificate of Competency' ? (rank.includes('Engineer') ? 'MEO Class ' + (rank.startsWith('Chief') ? '1' : '2') : rank === 'Master' ? 'Master (FG)' : 'Class ' + (2 + (i % 2))) : '',
        number: `${certType.split(' ').map((w) => w[0]).join('')}-${20100 + i * 17 + j}`, issuer: 'DG Shipping, India',
        // MLC A1.2 / STCW A-I/9: seafarer medical certificates run 2 years max
        issueDate: new Date(expiry.getTime() - (certType.startsWith('Medical') ? 2 : 5) * 365 * D), expiryDate: expiry };
    });
    // walk backward contract-by-contract until service history actually reaches
    // HIST_START, rather than a fixed 2-4 stint count that only sometimes got there
    const svc = [];
    let cursor = NOW.getTime() - (30 + ri(0, 60)) * D;
    for (let k = 0; k < 12 && cursor > HIST_START.getTime(); k++) {
      const to = new Date(cursor);
      const from = new Date(to.getTime() - ri(120, 260) * D);
      // service records stay on the fictional demo fleet (never the documented
      // liner callers), and carry that vessel's own IMO
      const served = pick(demoFleet);
      svc.push({ vesselName: served.name, imo: served.imo, rank, from, to, verified: rnd() < 0.7,
        remarks: k === 0 ? 'Verified against crew list and movement records' : '' });
      cursor = from.getTime() - ri(20, 90) * D;
    }
    return {
      cdcNo: `MUM-${String(52000 + i * 37)}`, indosNo: `${8}INL${3200 + i * 13}`, name, rank,
      dob: new Date(1968 + (i % 30), (i * 5) % 12, 3 + (i % 25)), nationality: i === 17 ? 'Nepal' : 'India',
      phone: `+91 98${String(20000000 + i * 991177).slice(0, 8)}`,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@crew.example.in`,
      status: i % 6 === 5 ? 'SHORE_LEAVE' : i % 9 === 8 ? 'SIGNED_OFF' : 'ACTIVE',
      currentVessel: i % 3 === 0 ? pick(demoFleet)._id : undefined,
      certificates: certs, seaService: svc,
    };
  }));
  console.log(`seafarers: ${seafarers.length}`);

  // ---------- legislation & circulars (real instruments + demo circulars) ----------
  await M.Instrument.insertMany([
    { refNo: 'MSA-1958', title: 'Merchant Shipping Act, 1958 (as amended)', type: 'ACT', category: 'Principal legislation',
      status: 'IN_FORCE', issuedBy: 'Parliament of India', issuedDate: new Date('1958-10-30'), effectiveDate: new Date('1960-01-01'),
      summary: 'Principal Indian statute governing merchant shipping — registration, certification, safety, crew and liability.',
      tags: ['statute', 'registration', 'crew'] },
    { refNo: 'SOLAS-74', title: 'International Convention for the Safety of Life at Sea (SOLAS), 1974', type: 'CONVENTION', category: 'Safety',
      status: 'IN_FORCE', issuedBy: 'IMO', issuedDate: new Date('1974-11-01'), effectiveDate: new Date('1980-05-25'),
      summary: 'Core IMO convention on ship safety — construction, fire protection, life-saving, radio, navigation.', tags: ['imo', 'safety'] },
    { refNo: 'MARPOL-73/78', title: 'International Convention for the Prevention of Pollution from Ships (MARPOL)', type: 'CONVENTION', category: 'Environment',
      status: 'IN_FORCE', issuedBy: 'IMO', issuedDate: new Date('1973-11-02'), effectiveDate: new Date('1983-10-02'),
      summary: 'Annexes I–VI: oil, chemicals, packaged goods, sewage, garbage and air emissions from ships.', tags: ['imo', 'environment'] },
    { refNo: 'MS-STCW-2014', title: 'Merchant Shipping (Standards of Training, Certification and Watchkeeping) Rules, 2014', type: 'RULES', category: 'Crew',
      status: 'IN_FORCE', issuedBy: 'Ministry of Ports, Shipping and Waterways', issuedDate: new Date('2014-06-20'),
      summary: 'Indian implementation of STCW 2010 (Manila amendments) — competency, certification and watchkeeping.', tags: ['stcw', 'crew'] },
    { refNo: 'PORT-N-07/2026', title: 'Monsoon working restrictions — West Basin and outer anchorage', type: 'NOTICE', category: 'Port operations',
      status: 'IN_FORCE', issuedBy: 'Harbour Master, Mundra', issuedDate: new Date(NOW.getTime() - 70 * D), effectiveDate: new Date(NOW.getTime() - 60 * D),
      summary: 'Cape vessels to maintain 20% additional UKC at WB berths during SW monsoon; bunkering suspended at outer anchorage above sea state 5.',
      body: 'During the South-West monsoon period, all capesize vessels berthing at WB-1/WB-2 shall maintain an additional 20% under-keel clearance over the declared minimum. Bunker barge operations at the outer anchorage stand suspended whenever sea state exceeds 5 or wind exceeds 25 knots sustained. Masters shall confirm compliance on the pre-arrival checklist.',
      tags: ['monsoon', 'ukc', 'bunkering'], ackRequired: true },
    { refNo: 'CIRC-12/2026', title: 'Electronic port clearance — mandatory FAL declarations via portal', type: 'CIRCULAR', category: 'Port operations',
      status: 'IN_FORCE', issuedBy: 'Port Operations, Mundra', issuedDate: new Date(NOW.getTime() - 40 * D), effectiveDate: new Date(NOW.getTime() - 10 * D),
      summary: 'All agents to submit FAL 1–7 declarations electronically; paper submissions cease from effective date.',
      body: 'Pursuant to the FAL Convention (2022 amendments), all shipping agents shall lodge General Declaration, Cargo Declaration, Ship Stores, Crew Effects, Crew List, Passenger List and Dangerous Goods declarations through the port community interface. Paper declarations will not be accepted after the effective date except for declared system outages.',
      tags: ['fal', 'single-window'], ackRequired: true },
    { refNo: 'CIRC-09/2026', title: 'Revised garbage reception fees under MARPOL Annex V', type: 'CIRCULAR', category: 'Tariff',
      status: 'IN_FORCE', issuedBy: 'Finance, Mundra', issuedDate: new Date(NOW.getTime() - 120 * D),
      summary: 'Garbage reception charge revised; segregation certificate required from vessels landing >2 m³.', tags: ['marpol', 'tariff'] },
    { refNo: 'CIRC-04/2025', title: 'Anchorage allocation policy — priority matrix', type: 'CIRCULAR', category: 'Port operations',
      status: 'SUPERSEDED', issuedBy: 'Harbour Master, Mundra', issuedDate: new Date(NOW.getTime() - 400 * D),
      summary: 'Superseded by PORT-N-07/2026 for monsoon months.', supersedes: '', tags: ['anchorage'] },
    { refNo: 'ISPS-ADV-02/2026', title: 'Security level 1 in force — access control reminders', type: 'ORDER', category: 'Security',
      status: 'IN_FORCE', issuedBy: 'PFSO, Mundra', issuedDate: new Date(NOW.getTime() - 15 * D),
      summary: 'MARSEC Level 1 continues; dock passes to be displayed; crew shore leave via Gate 3 only.', tags: ['isps', 'security'], ackRequired: false },
    { refNo: 'PORT-N-02/2023', title: 'Cyclone Biparjoy — contingency berthing restrictions, Kutch coast', type: 'NOTICE', category: 'Port operations',
      status: 'WITHDRAWN', issuedBy: 'Harbour Master, Mundra', issuedDate: new Date('2023-06-12'), effectiveDate: new Date('2023-06-13'),
      summary: 'Precautionary berthing suspension and vessel evacuation to sea ahead of Very Severe Cyclonic Storm Biparjoy making landfall near Jakhau, Kutch.',
      body: 'Following IMD tracking of Very Severe Cyclonic Storm Biparjoy, all vessels alongside shall complete cargo operations and vacate berths by 1800 hrs on 14 June 2023, proceeding to open sea or a designated safe anchorage. Port operations will remain suspended until an all-clear survey of berths, cranes and navigational aids is completed after landfall.',
      tags: ['cyclone', 'contingency', 'weather'], ackRequired: false },
    { refNo: 'CIRC-03/2023', title: 'Pre-arrival notification format revised — IMO FAL forms', type: 'CIRCULAR', category: 'Port operations',
      status: 'SUPERSEDED', issuedBy: 'Port Operations, Mundra', issuedDate: new Date('2023-09-04'),
      summary: 'Interim paper/email FAL format ahead of the portal single-window rollout. Superseded by CIRC-12/2026.',
      supersedes: '', tags: ['fal', 'pre-arrival'] },
    { refNo: 'CIRC-07/2024', title: 'Container VGM verification procedure at the gate', type: 'CIRCULAR', category: 'Port operations',
      status: 'IN_FORCE', issuedBy: 'Port Operations, Mundra', issuedDate: new Date('2024-03-18'), effectiveDate: new Date('2024-04-01'),
      summary: 'Verified Gross Mass to be declared and weighed at the terminal gate for all export containers per SOLAS Ch VI reg 2.',
      body: 'Shipping agents and CHAs shall submit VGM via Method 1 (weighing the packed container) at the terminal gate weighbridge; Method 2 (calculated) declarations must carry the shipper\'s certified weighing procedure on file. Containers without a VGM record on file will not be permitted to load.',
      tags: ['solas', 'vgm', 'container'], ackRequired: true },
  ]);
  console.log('instruments: 12');

  // ---------- facilities & companies (licences) ----------
  const licDefs = [
    ['Kutch Shipping Agency', 'SHIPPING_AGENCY', 'ISSUED', 4.5], ['Bharat Marine Services', 'SHIPPING_AGENCY', 'ISSUED', 4],
    ['Oceanic Agencies Pvt Ltd', 'SHIPPING_AGENCY', 'ISSUED', 3.5], ['Saurashtra Bunkers LLP', 'BUNKER_SUPPLIER', 'ISSUED', 3],
    ['Gulf Marine Repairs', 'REPAIR_YARD', 'ISSUED', 4], ['Navinal Ship Chandlers', 'SHIP_CHANDLER', 'ISSUED', 3.5],
    ['WestCoast Manning Services', 'MANNING_AGENCY', 'ISSUED', 4], ['Kandla Marine Surveyors', 'MARINE_SURVEYOR', 'ISSUED', 4.5],
    ['Mundra Maritime Academy', 'TRAINING_INSTITUTE', 'ISSUED', 4], ['Adipur Stevedores Co-op', 'STEVEDORE', 'SUSPENDED', 2],
    ['BlueDepth Diving Works', 'DIVING_CONTRACTOR', 'UNDER_REVIEW', 0], ['Seven Seas Logistics', 'SHIPPING_AGENCY', 'APPLIED', 0],
  ];
  const licDocs = licDefs.map(([entityName, entityType, status, rating], i) => {
    // established operators' licences spread across the full 2023-now window;
    // pending/new applications stay recent so they don't look stalled for years
    const established = status === 'ISSUED' || status === 'SUSPENDED';
    const applied = established
      ? new Date(NOW.getTime() - ri(380, HIST_DAYS) * D)
      : new Date(NOW.getTime() - ri(20, 180) * D);
    const issued = ['ISSUED', 'SUSPENDED'].includes(status) ? new Date(applied.getTime() + 30 * D) : undefined;
    // licences run on 2-year renewal cycles — roll the current term forward so a
    // licence first issued in 2023 shows a live expiry, not one years in the past
    let termStart = issued;
    const renewals = [];
    while (termStart && termStart.getTime() + 2 * 365 * D < NOW.getTime()) {
      termStart = new Date(termStart.getTime() + 2 * 365 * D);
      renewals.push(termStart);
    }
    const history = [{ from: '', to: 'APPLIED', at: applied, by: 'seed', note: 'Application received' }];
    if (status !== 'APPLIED') history.push({ from: 'APPLIED', to: 'UNDER_REVIEW', at: new Date(applied.getTime() + 10 * D), by: 'seed', note: '' });
    if (issued) history.push({ from: 'UNDER_REVIEW', to: 'ISSUED', at: issued, by: 'seed', note: 'Licence issued' });
    for (const r of renewals) history.push({ from: 'ISSUED', to: 'ISSUED', at: r, by: 'seed', note: 'Licence renewed for a further two years' });
    if (status === 'SUSPENDED') history.push({ from: 'ISSUED', to: 'SUSPENDED', at: new Date(NOW.getTime() - 20 * D), by: 'seed', note: 'Repeated stevedoring safety violations — gear certification lapsed' });
    return {
      entityName, entityType, status,
      contactPerson: pick(['R. Shah', 'M. Khan', 'P. Joshi', 'S. Ahuja', 'D. Chauhan']),
      phone: '+91 2838 2' + String(10000 + i * 731).slice(0, 5), email: `office@${entityName.toLowerCase().replace(/[^a-z]+/g, '')}.example.in`,
      address: pick(['Port User Complex, Mundra', 'Adipur 370205', 'Gandhidham 370201', 'SEZ Zone-2, Mundra']),
      gstin: `24XXXXX${1000 + i}X1Z${i % 10} (sample)`,
      appliedDate: applied, issueDate: issued,
      expiryDate: termStart ? new Date(termStart.getTime() + 2 * 365 * D) : undefined,
      conditions: status === 'ISSUED' ? 'Valid for Mundra port limits; subject to annual safety audit.' : '',
      performanceRating: rating,
      audits: issued ? [{ date: new Date(NOW.getTime() - 90 * D), auditor: 'Cdr. Suresh Patel', result: rating >= 4 ? 'SATISFACTORY' : rating >= 3 ? 'OBSERVATIONS' : 'NON_CONFORMITY', remarks: 'Annual audit' }] : [],
      history,
    };
  });
  // number chronologically within each application year, like every other series
  const licSeqByYear = {};
  licDocs.sort((a, b) => a.appliedDate - b.appliedDate).forEach((d) => {
    const y = yearOf(d.appliedDate);
    licSeqByYear[y] = (licSeqByYear[y] || 0) + 1;
    d.licenseNo = `LIC-${y}-${String(licSeqByYear[y]).padStart(4, '0')}`;
  });
  await M.License.insertMany(licDocs);
  console.log('licenses: 12');

  // ---------- port companies directory ----------
  const companyDefs = [
    // documented terminal operators (public JV structure) — flagged real
    ['MICT', 'DP World Mundra (MICT)', 'TERMINAL_OPERATOR', ['TERMINAL_OPERATOR'], true, 4.5],
    ['AICT', 'Adani International Container Terminal (CT-3)', 'TERMINAL_OPERATOR', ['TERMINAL_OPERATOR'], true, 4.5],
    ['ACMT', 'Adani CMA Mundra Terminal (CT-4)', 'TERMINAL_OPERATOR', ['TERMINAL_OPERATOR'], true, 4.5],
    // demo service companies (fictional)
    ['KSA', 'Kutch Shipping Agency', 'AGENCY', ['SHIPPING_AGENCY'], false, 4.5],
    ['BMS', 'Bharat Marine Services', 'AGENCY', ['SHIPPING_AGENCY'], false, 4.0],
    ['OAP', 'Oceanic Agencies Pvt Ltd', 'AGENCY', ['SHIPPING_AGENCY'], false, 3.5],
    ['WCM', 'WestCoast Maritime Services', 'AGENCY', ['SHIPPING_AGENCY'], false, 3.5],
    ['SSL', 'Seven Seas Logistics', 'AGENCY', ['SHIPPING_AGENCY'], false, 3.0],
    ['TMA', 'Trident Marine Agencies', 'AGENCY', ['SHIPPING_AGENCY'], false, 4.0],
    ['SBL', 'Saurashtra Bunkers LLP', 'SUPPLIER', ['BUNKER_SUPPLIER'], false, 3.0],
    ['GMR', 'Gulf Marine Repairs', 'SERVICE_PROVIDER', ['REPAIR_YARD'], false, 4.0],
    ['NSC', 'Navinal Ship Chandlers', 'SUPPLIER', ['SHIP_CHANDLER'], false, 3.5],
    ['WMS', 'WestCoast Manning Services', 'SERVICE_PROVIDER', ['MANNING_AGENCY'], false, 4.0],
    ['KMS', 'Kandla Marine Surveyors', 'SERVICE_PROVIDER', ['MARINE_SURVEYOR'], false, 4.5],
    ['MMA', 'Mundra Maritime Academy', 'INSTITUTE', ['TRAINING_INSTITUTE'], false, 4.0],
    ['ASC', 'Adipur Stevedores Co-op', 'SERVICE_PROVIDER', ['STEVEDORE'], false, 2.0],
    ['BDW', 'BlueDepth Diving Works', 'SERVICE_PROVIDER', ['DIVING_CONTRACTOR'], false, 3.0],
    ['SGT', 'Sagar Tank Cleaning Services', 'SERVICE_PROVIDER', ['STEVEDORE'], false, 3.5],
  ];
  await M.Company.insertMany(companyDefs.map(([code, name, category, types, real, rating], i) => ({
    code, name, category, types, real, rating,
    contactPerson: real ? '—' : pick(['Ramesh Shah', 'Mukhtar Khan', 'Priti Joshi', 'Sunil Ahuja', 'Dilip Chauhan', 'Kavita Mehta']),
    phone: real ? '' : '+91 2838 2' + String(20000 + i * 613).slice(0, 5),
    email: real ? '' : `office@${name.toLowerCase().replace(/[^a-z]+/g, '')}.example.in`,
    address: real ? 'Mundra Port, Navinal Island' : pick(['Port User Complex, Mundra', 'Adipur 370205', 'Gandhidham 370201', 'SEZ Zone-2, Mundra', 'Mundra-Bhuj Road']),
    city: 'Mundra', state: 'Gujarat',
    gstin: real ? '' : `24XXXXX${2000 + i}X1Z${i % 10} (sample)`,
    pan: real ? '' : `AAxCx${1000 + i}x (sample)`,
    status: name === 'Adipur Stevedores Co-op' ? 'SUSPENDED' : 'ACTIVE',
    onboardedAt: new Date(NOW.getTime() - ri(200, 2400) * D),
    remarks: real ? 'Terminal joint-venture operator — public record' : '',
  })));
  console.log(`companies: ${companyDefs.length}`);

  // ---------- marine resources (tugs · pilot launches · mooring boats · pilots) ----------
  // Fleet mirrors the researched Mundra marine craft mix: 5 tugs (2 above 50 T BP),
  // 5 pilot launches, 2 mooring boats — with an Indian pilot roster.
  const resourceDefs = [
    ['TUG-01', 'Mundra Shakti', 'TUG', 'ASD tug — 52 T bollard pull, FiFi-1', 'Sarang Mistry', 'VHF Ch 12'],
    ['TUG-02', 'Mundra Veer', 'TUG', 'ASD tug — 52 T bollard pull, FiFi-1', 'Iqbal Sama', 'VHF Ch 12'],
    ['TUG-03', 'Kutch Sahas', 'TUG', 'ASD tug — 40 T bollard pull', 'Bharat Rabari', 'VHF Ch 12'],
    ['TUG-04', 'Kutch Bal', 'TUG', 'Conventional tug — 36 T bollard pull', 'Mansukh Gadhvi', 'VHF Ch 12'],
    ['TUG-05', 'Samudra Tez', 'TUG', 'ASD tug — 45 T bollard pull, oil-spill kit', 'Jethabhai Chavda', 'VHF Ch 12'],
    ['PLT-01', 'Mundra P-1', 'PILOT_LAUNCH', 'Pilot launch — 12 kn', 'Vasant Baraiya', 'VHF Ch 14'],
    ['PLT-02', 'Mundra P-2', 'PILOT_LAUNCH', 'Pilot launch — 12 kn', 'Hamir Jethwa', 'VHF Ch 14'],
    ['PLT-03', 'Mundra P-3', 'PILOT_LAUNCH', 'Pilot launch — 11 kn', 'Kanji Ahir', 'VHF Ch 14'],
    ['PLT-04', 'Mundra P-4', 'PILOT_LAUNCH', 'Pilot launch — 7 kn', 'Noor Mohammad Theba', 'VHF Ch 14'],
    ['PLT-05', 'Mundra P-5', 'PILOT_LAUNCH', 'Pilot launch — 7 kn', 'Ramji Maheshwari', 'VHF Ch 14'],
    ['MB-01', 'Navinal-1', 'MOORING_BOAT', 'Mooring boat — line handling', 'Bhima Koli', 'VHF Ch 68'],
    ['MB-02', 'Navinal-2', 'MOORING_BOAT', 'Mooring boat — line handling', 'Deva Manek', 'VHF Ch 68'],
    ['PIL-01', 'Capt. Meera Krishnan', 'PILOT', 'Senior pilot — unrestricted, VLCC endorsed', '', '+91 98792 41210'],
    ['PIL-02', 'Capt. Arjun Jadeja', 'PILOT', 'Pilot — unrestricted', '', '+91 98792 41211'],
    ['PIL-03', 'Capt. Farooq Bukhari', 'PILOT', 'Pilot — unrestricted', '', '+91 98792 41212'],
    ['PIL-04', 'Capt. Devraj Sodha', 'PILOT', 'Pilot — restricted to 250 m LOA', '', '+91 98792 41213'],
    ['SVL-01', 'Bocha Survey-1', 'SURVEY_LAUNCH', 'Hydrographic survey launch', 'Jayesh Tandel', 'VHF Ch 71'],
  ];
  const berthedForRes = allCalls.filter((c) => c.status === 'BERTHED');
  await M.Resource.insertMany(resourceDefs.map(([code, name, type, spec, master, contact], i) => {
    let status = 'AVAILABLE'; let currentTask = '';
    if (code === 'TUG-04') { status = 'MAINTENANCE'; }
    else if (code === 'PLT-05') { status = 'OFF_DUTY'; }
    else if (['TUG-01', 'PLT-01', 'PIL-02'].includes(code) && berthedForRes[i % berthedForRes.length]) {
      status = 'TASKED';
      const c = berthedForRes[i % berthedForRes.length];
      currentTask = `${c.vcn} — ${type === 'PILOT' ? 'pilotage' : 'assist'} in progress`;
    }
    return { code, name, type, spec, status, currentTask, master, contact,
      remarks: code === 'TUG-04' ? 'Annual survey — gearbox overhaul at Gulf Marine Repairs' : '' };
  }));
  console.log(`resources: ${resourceDefs.length}`);

  // ---------- incident management (12-month case history + live cases) ----------
  const BERTH_POS_MAP = {
    'MICT-1': [22.7495, 69.7065], 'MICT-2': [22.7502, 69.7085], 'AMCT-1': [22.7511, 69.7105], 'AMCT-2': [22.7518, 69.7124],
    'AMC2-1': [22.7526, 69.7145], 'AMC2-2': [22.7533, 69.7165], 'CT3-1': [22.7541, 69.7188], 'CT3-2': [22.7548, 69.7208],
    'CT3-3': [22.7555, 69.7228], 'CT3-4': [22.7562, 69.7248], 'CT4-1': [22.7570, 69.7270], 'CT4-2': [22.7577, 69.7290],
    'WB-1': [22.7370, 69.6870], 'WB-2': [22.7360, 69.6895],
    'MP-1': [22.7435, 69.6990], 'MP-2': [22.7442, 69.7008], 'MP-3': [22.7449, 69.7026], 'MP-4': [22.7456, 69.7044],
    'LB-1': [22.7405, 69.6940], 'LB-2': [22.7412, 69.6958], 'LB-3': [22.7419, 69.6976],
    'SPM-1': [22.6350, 69.6250], 'SPM-2': [22.6280, 69.6420], 'RR-1': [22.7480, 69.7315],
  };
  const berthedNowCalls = allCalls.filter((c) => c.status === 'BERTHED');
  const berthCodesOp = berths.filter((b) => b.status === 'OPERATIONAL').map((b) => b.code);
  const berthByCode = Object.fromEntries(berths.map((b) => [b.code, b]));
  const reporters = ['Jetty supervisor — Ravindra Ahir', 'Berth foreman — Prakash Koli', 'Terminal duty manager — Ketan Maheshwari',
    'Master via agent', 'VHF Ch 16 watch', 'ISPS patrol — Gate 3', 'Crane operator', 'Marine control room', 'Stevedore gang leader',
    'Pilot — Capt. Arjun Jadeja', 'Tug master — Sarang Mistry', 'CISF post — Gate 1'];
  const commPool = [
    ['VHF', 'IN', 'Master confirms situation under control; no assistance required at this time.'],
    ['VHF', 'IN', 'Tug master reports on scene; commencing assessment.'],
    ['VHF', 'OUT', 'Marine control to all stations: restrict small-craft movement near the affected berth until further notice.'],
    ['PHONE', 'OUT', 'Informed Coast Guard Station Okha; reference number logged in the register.'],
    ['PHONE', 'OUT', 'GPCB regional office informed as a precaution; sampling arranged.'],
    ['PHONE', 'IN', 'Agent confirms P&I correspondent has been notified and surveyor is en route.'],
    ['EMAIL', 'OUT', 'Preliminary incident notification circulated to HM, HSE and terminal management.'],
    ['EMAIL', 'IN', 'Master\'s statement and crew list received from the agent.'],
    ['PORTAL', 'INTERNAL', 'First responders logged on scene; area cordoned as per SOP.'],
    ['PORTAL', 'INTERNAL', 'Boom deployed as a precaution; skimmer on standby.'],
    ['PORTAL', 'INTERNAL', 'Work resumed after toolbox talk and equipment inspection.'],
    ['PORTAL', 'INTERNAL', 'CCTV footage of the period secured for review.'],
    ['PHONE', 'IN', 'G.K. General Hospital confirms the injured person is stable.'],
    ['VHF', 'IN', 'Pilot reports vessel all fast; no further damage observed.'],
    ['EMAIL', 'OUT', 'Corrective action plan requested from the contractor within 48 hours.'],
  ];
  const docPool = [
    ['first-information-report.pdf', 'REPORT'], ['site-photographs.zip', 'PHOTO'], ['masters-statement.pdf', 'STATEMENT'],
    ['water-sample-analysis.pdf', 'SAMPLE'], ['cctv-clip-gate3.mp4', 'CCTV'], ['crane-maintenance-log.pdf', 'REPORT'],
    ['boom-deployment-photos.zip', 'PHOTO'], ['injury-medical-report.pdf', 'REPORT'], ['permit-to-work-scan.pdf', 'PERMIT'],
    ['damage-survey-report.pdf', 'REPORT'], ['toolbox-talk-record.pdf', 'REPORT'], ['line-failure-analysis.pdf', 'REPORT'],
  ];
  const taskPool = ['Deploy containment boom', 'Collect water samples for analysis', 'Obtain master\'s statement via agent',
    'Arrange ambulance and first aid', 'Isolate equipment and tag out', 'Notify GPCB regional office', 'Notify Coast Guard Station Okha',
    'Review CCTV footage of the period', 'Arrange diver inspection of hull/fender', 'File P&I / insurance notification',
    'Conduct toolbox talk with the stevedore gang', 'Civil team to inspect fender and cope line', 'Restrict berth until survey clears'];
  const rcaPool = [
    ['Mooring line worn beyond discard criteria', 'Equipment', 'Line renewed from ship\'s stores; full mooring inspection done', 'Quarterly mooring-line audit added to the berth checklist'],
    ['SOP not followed during hose disconnection', 'Procedure', 'Operation stopped; hose crew re-briefed and drip trays repositioned', 'Hose-handling refresher training for all jetty crews'],
    ['Hydraulic hose fatigue on the crane boom circuit', 'Equipment', 'Hose replaced; adjacent circuits pressure-tested', 'Hose replacement interval halved in the PM plan'],
    ['Inadequate lighting at the work site', 'Human factor', 'Portable mast lighting positioned; work rescheduled to day shift', 'Lux survey of all cargo work areas each quarter'],
    ['Sudden squall — weather within forecast limits', 'Weather', 'Additional lines run; tug held on standby until wind eased', 'Pre-monsoon mooring standard raised for cape vessels'],
    ['Third-party craft error in the fairway', 'External', 'Craft escorted clear; owner advised through the fisheries association', 'Joint awareness drive with the fishing harbour association'],
    ['Lashing gear failure under dynamic load', 'Equipment', 'Damaged units quarantined; batch inspection completed', 'Supplier batch certificates now verified at the gate'],
  ];
  const incTemplates = [
    { cat: 'ENVIRONMENT', type: 'OIL_SPILL', sev: ['MEDIUM', 'MEDIUM', 'HIGH'], w: 8, tier: 1, berth: true,
      title: (x) => `Oil sheen observed at ${x.berth} during ${x.p(['bunkering', 'hose disconnection', 'ballast operations', 'sludge transfer'])}` },
    { cat: 'ENVIRONMENT', type: 'POLLUTION', sev: ['LOW', 'MEDIUM'], w: 6, berth: true,
      title: (x) => `${x.p(['Floating debris', 'Garbage overflow from a skip', 'Coal dust plume beyond the sprinkler line', 'Grey-water discharge observed'])} near ${x.berth}` },
    { cat: 'PERSONNEL', type: 'PERSONNEL_INJURY', sev: ['MEDIUM', 'MEDIUM', 'HIGH'], w: 12, injuries: 1, berth: true,
      title: (x) => `Stevedore ${x.p(['hand injury during lashing', 'ankle injury on the quay apron', 'fall from a container stack ladder', 'struck by a swinging sling load'])} at ${x.berth}` },
    { cat: 'PERSONNEL', type: 'MEDICAL_EVAC', sev: ['HIGH'], w: 5, vessel: true,
      title: (x) => `Medical evacuation — crew member with ${x.p(['chest pain', 'suspected appendicitis', 'severe dehydration', 'crush injury to the hand'])} on ${x.vessel}` },
    { cat: 'MARINE', type: 'MOORING_FAILURE', sev: ['MEDIUM', 'HIGH'], w: 7, berth: true, vessel: true,
      title: (x) => `Mooring line parted during ${x.p(['a squall', 'spring tide', 'passing-vessel surge'])} — ${x.vessel} at ${x.berth}` },
    { cat: 'MARINE', type: 'COLLISION', sev: ['HIGH', 'CRITICAL'], w: 3, berth: true, vessel: true,
      title: (x) => `Heavy contact with the fender while berthing — ${x.vessel} at ${x.berth}` },
    { cat: 'MARINE', type: 'NEAR_MISS', sev: ['LOW', 'LOW', 'MEDIUM'], w: 11, berth: true,
      title: (x) => `Near miss — ${x.p(['pilot ladder step gave way', 'crane hook swung over the gangway', 'tug line slipped off the bitt', 'forklift reversed towards the gang', 'container twist-lock found unsecured'])} at ${x.berth}` },
    { cat: 'MARINE', type: 'SAR', sev: ['HIGH', 'CRITICAL'], w: 4,
      title: (x) => `Fishing boat ${x.p(['adrift with engine failure', 'taking water', 'with a fouled propeller', 'reported overdue'])} ${x.n(3, 9)} nm ${x.p(['SW', 'SE', 'S'])} of the fairway buoy` },
    { cat: 'SECURITY', type: 'SECURITY_BREACH', sev: ['LOW', 'MEDIUM'], w: 7,
      title: (x) => `${x.p(['Unauthorised drone sighting', 'Tailgating attempt', 'Unidentified small craft in the security zone', 'Dock pass reported lost', 'Perimeter fence damage found'])} — ${x.p(['CT-3 yard', 'Gate 3', 'West Basin approach', 'ISPS Zone B', 'Gate 1 truck lane'])}` },
    { cat: 'EQUIPMENT', type: 'EQUIPMENT_FAILURE', sev: ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH'], w: 13, berth: true,
      title: (x) => `${x.p(['STS crane boom-limit fault', 'Shore gangway hydraulic failure', 'Quay crane gearbox over-temperature', 'Mooring winch brake slip', 'Conveyor belt tear on the coal stream', 'Harbour mobile crane outrigger alarm'])} at ${x.berth}` },
    { cat: 'CARGO', type: 'CARGO_DAMAGE', sev: ['LOW', 'MEDIUM'], w: 9, berth: true,
      title: (x) => `${x.p(['Container dropped during lashing', 'Torn fertiliser bags on the stack', 'Wet-damaged steel coils found', 'Reefer power interruption on the yard', 'Project cargo shifted on the trailer'])} at ${x.berth}` },
    { cat: 'NAVIGATION', type: 'NAV_HAZARD', sev: ['MEDIUM'], w: 4,
      title: (x) => `${x.p(['Drifting container reported in the approach channel', 'Unlit fishing-net marker in the channel', 'Channel buoy No. 7 light reported unlit', 'Dredger pipeline marker adrift'])}` },
    { cat: 'HSE', type: 'FIRE', sev: ['HIGH', 'CRITICAL'], w: 4, berth: true,
      title: (x) => `${x.p(['Small fire in the conveyor gallery', 'Engine-room fire alarm', 'Hot-work spark ignition on the lashing bridge', 'Transformer room smoke detected'])} — ${x.berth}` },
    { cat: 'MARINE', type: 'GROUNDING', sev: ['CRITICAL'], w: 1,
      title: (x) => `Bunker barge touched bottom near ${x.p(['Bocha Island shallows', 'channel edge marker 7'])} — refloated on the rising tide` },
  ];
  const wPool = incTemplates.flatMap((t) => Array.from({ length: t.w }, () => t));
  const sevHours = { LOW: [4, 30], MEDIUM: [8, 72], HIGH: [4, 48], CRITICAL: [3, 24] };
  const sevPriority = { LOW: 'P4', MEDIUM: 'P3', HIGH: 'P2', CRITICAL: 'P1' };
  const incidentDocs = [];
  const incSeqByYear = {};
  const incNumberFor = (d) => { const y = yearOf(d); incSeqByYear[y] = (incSeqByYear[y] || 0) + 1; return `INC-${y}-${String(incSeqByYear[y]).padStart(4, '0')}`; };
  // flat ~108/yr rate held across the full 2023-now window (kept flat deliberately —
  // no narrative implication that the port got safer or less safe over time)
  const N_INC = Math.round(108 * HIST_DAYS / 360);
  const incTimes = Array.from({ length: N_INC }, () => new Date(NOW.getTime() - Math.floor(rnd() * (HIST_DAYS - 2) + 2) * D - ri(0, 23) * H)).sort((a, b) => a - b);
  for (let k = 0; k < N_INC; k++) {
    const t = pick(wPool);
    const reportedAt = incTimes[k];
    const helpers = { p: pick, n: ri };
    if (t.berth) helpers.berth = pick(berthCodesOp);
    if (t.vessel) helpers.vessel = pick(demoFleet).name;
    const severity = pick(t.sev);
    const officerPool = ['SECURITY', 'NAVIGATION', 'MARINE'].includes(t.cat) ? [...dutyOfficers, ...marineOfficers] : hseOfficers;
    const officer = pick(officerPool);
    const ageD = (NOW - reportedAt) / D;
    // lifecycle by age: old cases are closed; the recent tail is a live pipeline
    let status;
    if (ageD > 30) status = rnd() < 0.94 ? 'CLOSED' : 'RESOLVED';
    else if (ageD > 7) status = pick(['CLOSED', 'CLOSED', 'CLOSED', 'RESOLVED', 'RESOLVED', 'MONITORING']);
    else status = pick(['OPEN', 'ACKNOWLEDGED', 'RESPONDING', 'RESPONDING', 'MONITORING', 'RESOLVED']);
    const ackAt = new Date(reportedAt.getTime() + ri(4, 55) * 60000);
    const respAt = new Date(ackAt.getTime() + ri(10, 90) * 60000);
    const sevWin = sevHours[severity];
    const resolvedAt = new Date(respAt.getTime() + ri(sevWin[0], sevWin[1]) * H);
    const closedAt = new Date(resolvedAt.getTime() + ri(18, 90) * H);
    const history = [{ from: '', to: 'OPEN', at: reportedAt, by: 'Marine control room', note: 'Incident logged' }];
    const log = [{ at: reportedAt, by: 'Marine control room', entry: 'Incident logged in the portal; duty officer paged' }];
    const reach = { OPEN: 0, ACKNOWLEDGED: 1, RESPONDING: 2, MONITORING: 2, RESOLVED: 3, CLOSED: 4 }[status];
    if (reach >= 1) history.push({ from: 'OPEN', to: 'ACKNOWLEDGED', at: ackAt, by: officer.name, note: '' });
    if (reach >= 2) history.push({ from: 'ACKNOWLEDGED', to: 'RESPONDING', at: respAt, by: officer.name, note: 'Response initiated' });
    if (status === 'MONITORING') history.push({ from: 'RESPONDING', to: 'MONITORING', at: new Date(respAt.getTime() + ri(2, 10) * H), by: officer.name, note: 'Situation contained — monitoring' });
    const rca = pick(rcaPool);
    if (reach >= 3) history.push({ from: 'RESPONDING', to: 'RESOLVED', at: resolvedAt, by: officer.name, note: rca[2] });
    if (reach >= 4) history.push({ from: 'RESOLVED', to: 'CLOSED', at: closedAt, by: 'Dr. Kavita Raval', note: 'RCA reviewed and case closed' });
    for (const h of history.slice(1)) log.push({ at: h.at, by: h.by, entry: `Status moved to ${h.to}${h.note ? ` — ${h.note}` : ''}` });
    const nComms = ri(2, 6);
    const comms = Array.from({ length: nComms }, (_, ci) => {
      const cp = pick(commPool);
      return { at: new Date(reportedAt.getTime() + (ci + 1) * ri(20, 200) * 60000), by: ci % 2 ? officer.name : pick(reporters).split(' — ')[0], channel: cp[0], direction: cp[1], message: cp[2] };
    });
    const docs = Array.from({ length: ri(0, 4) }, () => {
      const dp = pick(docPool);
      return { name: dp[0], docType: dp[1], sizeKB: ri(80, 8200), uploadedBy: officer.name, at: new Date(reportedAt.getTime() + ri(2, 40) * H), note: '' };
    });
    const tasks = Array.from({ length: ri(0, 4) }, () => {
      const done = reach >= 3 || rnd() < 0.5;
      const due = new Date(reportedAt.getTime() + ri(1, 5) * D);
      return { title: pick(taskPool), assignee: pick([...hseOfficers, ...dutyOfficers]).name, due, status: done ? 'DONE' : 'OPEN', doneAt: done ? new Date(due.getTime() - ri(2, 20) * H) : undefined };
    });
    const berthDoc = helpers.berth ? berthByCode[helpers.berth] : null;
    const vesselDoc = helpers.vessel ? demoFleet.find((v) => v.name === helpers.vessel) : null;
    const posOfBerth = berthDoc ? (BERTH_POS_MAP[berthDoc.code] || [22.74, 69.7]) : null;
    incidentDocs.push({
      number: incNumberFor(reportedAt),
      category: t.cat, type: t.type, severity, priority: sevPriority[severity], status,
      title: t.title(helpers),
      description: 'Logged from the first information report; see the communications thread and documents for the working record.',
      vessel: vesselDoc ? vesselDoc._id : undefined,
      vesselName: vesselDoc ? '' : (t.type === 'SAR' ? `FV ${pick(['Jal Pari', 'Dariya Sathi', 'Matsya Kanya', 'Sagar Putra'])} (IND-GJ-04-MM-${ri(1000, 1999)})` : ''),
      berth: berthDoc ? berthDoc._id : undefined,
      location: { area: helpers.berth || pick(['Approach channel', 'Outer anchorage A1', 'Fairway buoy sector', 'Gate complex']),
        lat: posOfBerth ? posOfBerth[0] : 22.6 + rnd() * 0.1, lon: posOfBerth ? posOfBerth[1] : 69.55 + rnd() * 0.2 },
      reportedAt, reportedBy: pick(reporters), source: pick(['VHF', 'PHONE', 'PORTAL', 'PATROL', 'CCTV']),
      assignedTo: { userId: String(officer._id), name: officer.name },
      assets: t.type === 'SAR' ? ['Tug Mundra Shakti', 'Pilot launch Mundra P-2'] : t.tier ? ['Boom crew A', 'Tug Samudra Tez (spill kit)'] : [],
      injuries: t.injuries && rnd() < 0.9 ? t.injuries : 0,
      pollutionTier: t.tier && reach >= 2 ? t.tier : 0,
      weather: { windKn: ri(6, 26), seaState: ri(1, 5) },
      comms, documents: docs, tasks, log, statusHistory: history,
      rca: reach >= 3 ? { rootCause: rca[0], category: rca[1], correctiveAction: rca[2], preventiveAction: rca[3] } : { rootCause: '', category: '', correctiveAction: '', preventiveAction: '' },
      acknowledgedAt: reach >= 1 ? ackAt : undefined,
      resolvedAt: reach >= 3 ? resolvedAt : undefined,
      closedAt: reach >= 4 ? closedAt : undefined,
      outcome: reach >= 3 ? rca[2] : '',
      createdAt: reportedAt, updatedAt: history[history.length - 1].at,
    });
  }
  // live marquee cases
  incidentDocs.push({
    number: incNumberFor(new Date(NOW.getTime() - 5 * H)),
    category: 'MARINE', type: 'SAR', severity: 'HIGH', priority: 'P2', status: 'RESPONDING',
    title: 'Fishing vessel adrift with a fouled propeller, 6 nm SW of the fairway buoy',
    description: 'VHF Ch 16 distress relay; six crew on board, vessel drifting SW at 1.2 kn. Tow arranged.',
    vesselName: 'FV Jal Pari (IND-GJ-04-MM-1287)',
    location: { area: 'Fairway buoy sector', lat: 22.62, lon: 69.58 },
    reportedAt: new Date(NOW.getTime() - 5 * H), reportedBy: 'VHF Ch 16 watch', source: 'VHF',
    assignedTo: { userId: String(userByName['Lt. Aditi Rathore']._id), name: 'Lt. Aditi Rathore' },
    assets: ['Tug Mundra Shakti', 'Pilot launch Mundra P-2'], injuries: 0, pollutionTier: 0,
    weather: { windKn: 18, seaState: 3 },
    comms: [
      { at: new Date(NOW.getTime() - 4.8 * H), by: 'Lt. Aditi Rathore', channel: 'VHF', direction: 'IN', message: 'Distress relay received; position plotted; boat drifting SW at 1.2 kn.' },
      { at: new Date(NOW.getTime() - 4.4 * H), by: 'Lt. Aditi Rathore', channel: 'PHONE', direction: 'OUT', message: 'Coast Guard Station Okha informed; reference number logged.' },
      { at: new Date(NOW.getTime() - 2 * H), by: 'Sarang Mistry', channel: 'VHF', direction: 'IN', message: 'Tow connected; proceeding to the fishing harbour; all six crew safe.' },
    ],
    documents: [{ name: 'distress-relay-log.pdf', docType: 'REPORT', sizeKB: 240, uploadedBy: 'Lt. Aditi Rathore', at: new Date(NOW.getTime() - 4 * H), note: '' }],
    tasks: [
      { title: 'Notify Coast Guard Station Okha', assignee: 'Lt. Aditi Rathore', due: new Date(NOW.getTime() - 4 * H), status: 'DONE', doneAt: new Date(NOW.getTime() - 4.4 * H) },
      { title: 'Escort tow to the fishing harbour', assignee: 'Sarang Mistry', due: new Date(NOW.getTime() + 2 * H), status: 'OPEN' },
    ],
    log: [
      { at: new Date(NOW.getTime() - 5 * H), by: 'Marine control room', entry: 'Incident logged; duty officer paged' },
      { at: new Date(NOW.getTime() - 4.6 * H), by: 'Lt. Aditi Rathore', entry: 'Tug Mundra Shakti tasked; ETA 45 min' },
    ],
    statusHistory: [
      { from: '', to: 'OPEN', at: new Date(NOW.getTime() - 5 * H), by: 'Marine control room', note: 'Incident logged' },
      { from: 'OPEN', to: 'ACKNOWLEDGED', at: new Date(NOW.getTime() - 4.9 * H), by: 'Lt. Aditi Rathore', note: '' },
      { from: 'ACKNOWLEDGED', to: 'RESPONDING', at: new Date(NOW.getTime() - 4.6 * H), by: 'Lt. Aditi Rathore', note: 'Tug tasked' },
    ],
    acknowledgedAt: new Date(NOW.getTime() - 4.9 * H),
    createdAt: new Date(NOW.getTime() - 5 * H), updatedAt: new Date(NOW.getTime() - 2 * H),
  });
  incidentDocs.push({
    number: incNumberFor(new Date(NOW.getTime() - 90 * 60000)),
    category: 'ENVIRONMENT', type: 'OIL_SPILL', severity: 'MEDIUM', priority: 'P3', status: 'OPEN',
    title: 'Light sheen observed near LB-2 during edible-oil hose disconnection',
    description: 'Sheen approximately 15 m × 40 m reported alongside during hose disconnection. Tier-1 response readied.',
    vessel: berthedNowCalls[5] ? berthedNowCalls[5].vessel : undefined,
    berth: berthByCode['LB-2'] ? berthByCode['LB-2']._id : undefined,
    location: { area: 'LB-2', lat: 22.7412, lon: 69.6958 },
    reportedAt: new Date(NOW.getTime() - 90 * 60000), reportedBy: 'Jetty supervisor — Ravindra Ahir', source: 'PHONE',
    assignedTo: { userId: String(userByName['Bhavna Joshi']._id), name: 'Bhavna Joshi' },
    assets: ['Boom crew A'], injuries: 0, pollutionTier: 1,
    weather: { windKn: 9, seaState: 2 },
    comms: [{ at: new Date(NOW.getTime() - 85 * 60000), by: 'Bhavna Joshi', channel: 'PORTAL', direction: 'INTERNAL', message: 'Tier-1 response activated; boom deployed as a precaution; sample taken for analysis.' }],
    documents: [], tasks: [
      { title: 'Collect water samples for analysis', assignee: 'Bhavna Joshi', due: new Date(NOW.getTime() + 4 * H), status: 'OPEN' },
      { title: 'Obtain master\'s statement via agent', assignee: 'Jaydeep Rathod', due: new Date(NOW.getTime() + 24 * H), status: 'OPEN' },
    ],
    log: [{ at: new Date(NOW.getTime() - 88 * 60000), by: 'Marine control room', entry: 'Incident logged; HSE environment officer paged' }],
    statusHistory: [{ from: '', to: 'OPEN', at: new Date(NOW.getTime() - 90 * 60000), by: 'Marine control room', note: 'Incident logged' }],
    createdAt: new Date(NOW.getTime() - 90 * 60000), updatedAt: new Date(NOW.getTime() - 85 * 60000),
  });
  await M.Incident.insertMany(incidentDocs, { timestamps: false });
  console.log(`incidents: ${incidentDocs.length}`);

  // ---------- simulated AIS picture ----------
  const BERTH_POS = {
    'MICT-1': [22.7495, 69.7065], 'MICT-2': [22.7502, 69.7085], 'AMCT-1': [22.7511, 69.7105], 'AMCT-2': [22.7518, 69.7124],
    'AMC2-1': [22.7526, 69.7145], 'AMC2-2': [22.7533, 69.7165], 'CT3-1': [22.7541, 69.7188], 'CT3-2': [22.7548, 69.7208],
    'CT3-3': [22.7555, 69.7228], 'CT3-4': [22.7562, 69.7248], 'CT4-1': [22.7570, 69.7270], 'CT4-2': [22.7577, 69.7290],
    'WB-1': [22.7370, 69.6870], 'WB-2': [22.7360, 69.6895],
    'MP-1': [22.7435, 69.6990], 'MP-2': [22.7442, 69.7008], 'MP-3': [22.7449, 69.7026], 'MP-4': [22.7456, 69.7044],
    'LB-1': [22.7405, 69.6940], 'LB-2': [22.7412, 69.6958], 'LB-3': [22.7419, 69.6976],
    'SPM-1': [22.6350, 69.6250], 'SPM-2': [22.6280, 69.6420], 'RR-1': [22.7480, 69.7315],
  };
  const posDocs = [];
  const berthByIdPos = Object.fromEntries(berths.map((b) => [String(b._id), BERTH_POS[b.code]]));
  for (const c of allCalls.filter((x) => x.status === 'BERTHED')) {
    const p = berthByIdPos[String(c.berth)] || [22.745, 69.705];
    posDocs.push({ vessel: c.vessel, lat: p[0], lon: p[1], course: 210, speed: 0, navStatus: 'MOORED', destination: 'INMUN', receivedAt: new Date(NOW.getTime() - ri(1, 4) * 60000) });
  }
  allCalls.filter((x) => x.status === 'AT_ANCHORAGE').forEach((c, i) => {
    posDocs.push({ vessel: c.vessel, lat: 22.648 + (i % 3) * 0.014, lon: 69.760 + Math.floor(i / 3) * 0.02, course: 320, speed: 0.1, navStatus: 'AT_ANCHOR', destination: 'INMUN', receivedAt: new Date(NOW.getTime() - ri(2, 6) * 60000) });
  });
  allCalls.filter((x) => x.status === 'CONFIRMED').forEach((c, i) => {
    posDocs.push({ vessel: c.vessel, lat: 22.520 - i * 0.05, lon: 69.520 - i * 0.06, course: 38, speed: ri(9, 13), navStatus: 'UNDERWAY', destination: 'INMUN', receivedAt: new Date(NOW.getTime() - ri(1, 3) * 60000) });
  });
  // transiting traffic not bound for Mundra
  const others = demoFleet.filter((v) => !posDocs.some((p) => String(p.vessel) === String(v._id))).slice(0, 3);
  others.forEach((v, i) => {
    posDocs.push({ vessel: v._id, lat: 22.44 + i * 0.06, lon: 69.30 + i * 0.11, course: i === 1 ? 255 : 82, speed: ri(10, 14), navStatus: 'UNDERWAY', destination: i === 1 ? 'AEJEA' : 'INNSA', receivedAt: new Date(NOW.getTime() - ri(1, 5) * 60000) });
  });
  await M.Position.insertMany(posDocs);
  const gapVessel = others[0];
  await M.MdaAlert.insertMany([
    { type: 'AIS_GAP', severity: 'warning', vessel: gapVessel._id, vesselName: gapVessel.name, note: 'No AIS transmission for 42 min in covered sector; last SOG 11.5 kn', at: new Date(NOW.getTime() - 40 * 60000) },
    { type: 'SPEED_IN_CHANNEL', severity: 'warning', vesselName: posDocs.length ? demoFleet[2].name : 'Unknown', vessel: demoFleet[2]._id, note: '11.8 kn in approach channel (limit 8 kn)', at: new Date(NOW.getTime() - 3 * H) },
    { type: 'ANCHOR_DRIFT', severity: 'error', vessel: allCalls.find((x) => x.status === 'AT_ANCHORAGE') ? allCalls.find((x) => x.status === 'AT_ANCHORAGE').vessel : demoFleet[8]._id, vesselName: '', note: 'Position moved 0.28 nm from anchor drop point; wind 22 kn', at: new Date(NOW.getTime() - 55 * 60000) },
    { type: 'ZONE_ENTRY', severity: 'info', vessel: others[1] ? others[1]._id : demoFleet[10]._id, vesselName: others[1] ? others[1].name : '', note: 'Entered port limits without pre-arrival notification on file', at: new Date(NOW.getTime() - 6 * H) },
  ]);
  console.log(`positions: ${posDocs.length}, alerts: 4`);

  await M.Setting.create({ key: 'riskWeights', value: {} });

  // ---------- synthesized audit trail ----------
  const actors = [
    { id: 'seed1', name: 'Capt. Rajiv Nair', email: 'harbour@mundraport.in' },
    { id: 'seed2', name: 'Cdr. Suresh Patel', email: 'surveyor@mundraport.in' },
    { id: 'seed3', name: 'Meenakshi Iyer', email: 'finance@mundraport.in' },
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
    incidents: await M.Incident.countDocuments(), resources: await M.Resource.countDocuments(),
    companies: await M.Company.countDocuments(),
  };
  console.log('SEED COMPLETE', JSON.stringify(counts));
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
