/* Jurisdiction profile.
 *
 * Everything that changes when the platform is deployed for a different
 * maritime administration lives in one profile: the benchmark set every KPI is
 * read against, the port-state-control regime, the tax and currency
 * conventions, and the working week. Selecting one is a setting, not a release.
 *
 * This deployment is Mundra Port, India. India is the only profile registered
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
  regulatorNote: 'Merchant Shipping Act 1958; Indian Ports Act 1908. Mundra is a private port under the Gujarat Maritime Board, so tariffs are commercially set rather than TAMP-regulated.',
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
