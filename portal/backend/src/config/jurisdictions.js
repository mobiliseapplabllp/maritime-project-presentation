/* F5 — jurisdiction profiles.
 *
 * Everything that changes when the platform is deployed for a different
 * maritime administration lives here: the benchmark set every KPI is read
 * against, the port-state-control regime, the tax and currency conventions, and
 * the working week. Selecting a profile is a setting, not a release.
 *
 * Provenance matters more than completeness. Each figure carries its source,
 * and any figure we have not been able to source is marked `confirmed: false`
 * so it surfaces as unverified rather than passing silently as fact. Nothing
 * unconfirmed should be quoted in a client-facing document without checking it.
 */

const INDIA = {
  code: 'IN',
  name: 'India',
  authority: 'Directorate General of Shipping',
  regulatorNote: 'Merchant Shipping Act 1958; Indian Ports Act 1908; Major Port Authorities Act 2021',
  pscRegime: { code: 'IOMOU', name: 'Indian Ocean MoU' },
  currency: { code: 'INR', symbol: '₹', locale: 'en-IN', grouping: 'lakh-crore' },
  tax: { name: 'GST', ratePct: 18, registrationLabel: 'GSTIN', invoicePrefix: 'MUN/INV' },
  workingWeek: { weekend: ['Sunday'], note: 'Sunday weekend; national and state holidays from the holiday master' },
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

const UAE = {
  code: 'AE',
  name: 'United Arab Emirates',
  authority: 'Federal maritime administration',
  regulatorNote: 'Federal Decree-Law 43/2023 (Maritime Law); ISPS Statement of Compliance issued with ICP',
  pscRegime: { code: 'RIYADHMOU', name: 'Riyadh MoU' },
  currency: { code: 'AED', symbol: 'AED', locale: 'en-AE', grouping: 'western' },
  tax: { name: 'VAT', ratePct: 5, registrationLabel: 'TRN', invoicePrefix: 'INV' },
  workingWeek: { weekend: ['Friday', 'Saturday'], note: 'Per the RFP definition, a working day excludes Friday, Saturday and UAE public holidays' },
  benchmarks: {
    // Global and regional figures we can source stand as they are. UAE-specific
    // operational statistics are not published on the same basis as India's IPA
    // series, so they are carried unconfirmed until the Client supplies them
    // during scoping — deliberately visible rather than quietly assumed.
    turnaroundHours: { value: 36.0, confirmed: false,
      source: 'PLACEHOLDER — indicative Gulf container terminal turnaround. Confirm against Client operational data before use' },
    outputPerShipBerthDayMt: { value: 22000, confirmed: false,
      source: 'PLACEHOLDER — indicative for deep-draft Gulf terminals. Confirm against Client operational data before use' },
    preBerthingWaitHours: { value: 4.0, confirmed: false,
      source: 'PLACEHOLDER — confirm the measurement basis (port account vs total anchorage) with the Client' },
    idleTimeAtBerthPct: { value: 15.0, confirmed: false,
      source: 'PLACEHOLDER — confirm against Client operational data' },
    pscDetentionRatePct: { value: null, confirmed: false,
      source: 'Riyadh MoU annual report figure to be obtained. Not populated rather than guessed' },
    berthOccupancyHealthyPct: { value: [40, 70], confirmed: true,
      source: 'UNCTAD guidance band — global, applies regardless of jurisdiction' },
    collectionEfficiencyPct: { value: 95, confirmed: true,
      source: 'Standard commercial port receivables collection target (industry norm)' },
  },
};

const PROFILES = { IN: INDIA, AE: UAE };
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
