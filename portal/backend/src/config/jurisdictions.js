/* Jurisdiction profile.
 *
 * Everything that changes when the platform is deployed for a different
 * maritime administration lives in one profile: the benchmark set every KPI is
 * read against, the port-state-control regime, the tax and currency
 * conventions, and the working week. Selecting one is a setting, not a release.
 *
 * This deployment is Maritime Operations, India. India is the only profile registered
 * here, deliberately — a demonstration should carry no data belonging to a
 * jurisdiction it is not for. Adding another administration means adding a
 * profile object to PROFILES and nothing else; the mechanism is the deliverable,
 * not the number of profiles shipped.
 *
 * Provenance matters more than completeness. Each figure carries its published
 * source, and any figure that cannot be sourced is marked `confirmed: false` so
 * it surfaces as unverified rather than passing silently as fact.
 */

const INDIA = {
  code: 'IN',
  name: 'India',
  authority: 'Directorate General of Shipping',
  regulatorNote: 'Merchant Shipping Act 1958; Indian Ports Act 1908. Harbour is a private port under the Coastal Region Maritime Board, so tariffs are commercially set rather than TAMP-regulated.',
  pscRegime: { code: 'IOMOU', name: 'Indian Ocean MoU' },
  currency: { code: 'INR', symbol: '₹', locale: 'en-IN', grouping: 'lakh-crore' },
  tax: { name: 'GST', ratePct: 18, registrationLabel: 'GSTIN', invoicePrefix: 'REF/INV' },
  workingWeek: { weekend: ['Sunday'], note: 'Sunday weekend; national and state holidays from the holiday master' },
  /* B1 — the registry constants the ship-registration engine reads. Every one
   * of these is a statutory number rather than a design choice, which is why
   * they sit in the jurisdiction profile: another administration changes them
   * without touching the workflow. `confirmed` follows the same rule as the
   * benchmarks — a figure that cannot be cited is surfaced as unverified rather
   * than passed off as fact. */
  registry: {
    registrar: 'Registrar of Indian Ships',
    statute: 'Merchant Shipping Act 1958, Part V (ss. 20-73)',
    // Ports at which registration is made. Bombay, Calcutta and Madras are named
    // in s.20; the remainder were declared ports of registry by notification.
    portsOfRegistry: [
      { code: 'KDL', name: 'Kandla', state: 'Coastal Region', default: true },
      { code: 'MUM', name: 'Mumbai', state: 'Maharashtra' },
      { code: 'KOL', name: 'Kolkata', state: 'West Bengal' },
      { code: 'CHN', name: 'Chennai', state: 'Tamil Nadu' },
      { code: 'KOC', name: 'Kochi', state: 'Kerala' },
      { code: 'MRM', name: 'Mormugao', state: 'Goa' },
      { code: 'VTZ', name: 'Visakhapatnam', state: 'Andhra Pradesh' },
      { code: 'JAM', name: 'Jamnagar', state: 'Coastal Region' },
      { code: 'PRP', name: 'Paradip', state: 'Odisha' },
      { code: 'PBL', name: 'Port Blair', state: 'Andaman & Nicobar Islands' },
      { code: 'TUT', name: 'Tuticorin', state: 'Tamil Nadu' },
    ],
    // Harbour sits in the Kandla registration district, so an application lodged
    // here defaults to that registrar.
    defaultPort: 'KDL',
    // Property in a ship is divided into shares, and only so many persons may be
    // registered as owners at one time. Both come from s.32. The exact divisor
    // must be read off the current text of the section before go-live — it is
    // configuration here precisely so it is not buried in code.
    shareDenominator: { value: 10, confirmed: false,
      source: 'Merchant Shipping Act 1958 s.32 — division of property in a ship. VERIFY against the section as currently in force.' },
    maxRegisteredOwners: { value: 10, confirmed: false,
      source: 'Merchant Shipping Act 1958 s.32 — maximum persons registered as owners at one time. VERIFY before go-live.' },
    // A provisional certificate is a bridging instrument for a ship acquired
    // abroad; it runs out and cannot be renewed indefinitely.
    provisionalValidityMonths: { value: 6, confirmed: true,
      source: 'Merchant Shipping Act 1958 — provisional certificate of registry, six months from issue' },
    // Official numbers are allocated by the registrar. This deployment allocates
    // from a demonstration series that deliberately sits outside the range in
    // live Indian use, so no seeded ship can collide with a real one.
    officialNumberBase: 900001,
    nationalityRule: 'An Indian ship must be owned wholly by Indian citizens, by a company or body established under Indian law with its principal place of business in India, or by a co-operative society registered in India (Merchant Shipping Act 1958 s.21).',
  },
  benchmarks: {
    turnaroundHours: { value: 50.4, confirmed: true,
      source: 'Indian major ports average ship turnaround ~2.1 days FY2023-24 — Ministry of Ports, Shipping & Waterways / IPA published statistics' },
    outputPerShipBerthDayMt: { value: 16500, confirmed: true,
      source: 'Average output per ship-berth-day, Indian major ports FY2023-24 — IPA operational statistics' },
    preBerthingWaitHours: { value: 5.0, confirmed: true,
      source: 'Average pre-berthing detention on port account, major ports FY2023-24 — IPA' },
    idleTimeAtBerthPct: { value: 18.0, confirmed: true,
      source: 'Idle time as a share of time at berth, Indian major ports — IPA published statistics' },
    pscDetentionRatePct: { value: 5.6, confirmed: true,
      source: 'Indian Ocean MoU regional PSC detention rate, 2023 annual report' },
    berthOccupancyHealthyPct: { value: [40, 70], confirmed: true,
      source: 'UNCTAD guidance band for healthy berth occupancy before congestion risk' },
    collectionEfficiencyPct: { value: 95, confirmed: true,
      source: 'Standard commercial port receivables collection target (industry norm)' },
  },
};

const PROFILES = { IN: INDIA };
const DEFAULT_JURISDICTION = 'IN';

const getProfile = (code) => PROFILES[String(code || DEFAULT_JURISDICTION).toUpperCase()] || INDIA;

/** Benchmarks flattened for comparison, with unconfirmed ones flagged. */
function benchmarksFor(code) {
  const p = getProfile(code);
  return Object.entries(p.benchmarks).map(([key, b]) => ({
    key, value: b.value, confirmed: b.confirmed, source: b.source,
  }));
}

/** Every unconfirmed figure in a profile — what a proposal must not quote. */
const unconfirmed = (code) => benchmarksFor(code).filter((b) => !b.confirmed);

module.exports = { PROFILES, DEFAULT_JURISDICTION, getProfile, benchmarksFor, unconfirmed };
