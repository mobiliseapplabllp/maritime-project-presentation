/* Runs a maritime agent over the records it is responsible for.
 *
 * The runner is the only part that touches the database. It gathers the records
 * an agent is meant to look at, hands each to the pure judgement in
 * domain/maritimeAgents, and passes the result to the decision recorder — which
 * is what applies the agent's autonomy level and writes the append-only entry.
 *
 * Nothing here decides whether a conclusion takes effect. That is the whole
 * point of keeping autonomy in one place. */
const {
  Vessel, Seafarer, Company, Inspection, Instrument, License,
  ServiceRequest, ServiceDefinition, Incident,
} = require('../models');
const A = require('../domain/maritimeAgents');
const { record } = require('../controllers/agentController');

// how many subjects one run will look at, so a demonstration run stays bounded
const BATCH = 12;

const started = () => process.hrtime.bigint();
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;

/** Subjects an agent that works case-by-case still has open work on. */
const OPEN_REQUEST = { $in: ['SUBMITTED', 'UNDER_ASSESSMENT', 'INFO_REQUESTED'] };

async function subjectFor(req) {
  if (!req.subjectRef) return null;
  const M = { Vessel, Seafarer, Company }[req.subjectModel];
  return M ? M.findById(req.subjectRef).lean() : null;
}

const RUNNERS = {
  /* A1 — every application with documents still to be trusted */
  async a1_document_intelligence() {
    const reqs = await ServiceRequest.find({ status: OPEN_REQUEST }).limit(BATCH).lean();
    const out = [];
    for (const r of reqs) {
      const t0 = started();
      const def = await ServiceDefinition.findById(r.service).lean();
      const subject = await subjectFor(r);
      const j = A.documentIntelligence(r, def, subject);
      out.push(await record({ ...j, agentId: 'a1_document_intelligence', modelId: 'doc-intelligence', modelVersion: '2026-08', latencyMs: Math.round(ms(t0)) }));
    }
    return out;
  },

  /* A2 — the whole registered fleet, rescored */
  async a2_vessel_compliance() {
    const vessels = await Vessel.find({ status: 'ACTIVE' }).limit(BATCH).lean();
    const out = [];
    for (const v of vessels) {
      const t0 = started();
      const [inspections, instruments] = await Promise.all([
        Inspection.find({ vessel: v._id }).lean(),
        License.find({ subjectRef: v._id, status: 'ISSUED' }).lean(),
      ]);
      const j = A.vesselCompliance(v, { inspections, instruments });
      out.push(await record({ ...j, agentId: 'a2_vessel_compliance', modelId: 'compliance-score', modelVersion: '2026-08', latencyMs: Math.round(ms(t0)) }));
    }
    return out;
  },

  /* A3 — applications waiting on a decision */
  async a3_service_processing() {
    const reqs = await ServiceRequest.find({ status: OPEN_REQUEST }).limit(BATCH).lean();
    const out = [];
    for (const r of reqs) {
      const t0 = started();
      const def = await ServiceDefinition.findById(r.service).lean();
      const subject = await subjectFor(r);
      const priors = await ServiceRequest.countDocuments({
        'applicant.name': r.applicant?.name, _id: { $ne: r._id },
      });
      const holds = [];
      if (subject && subject.status === 'SUSPENDED') holds.push('subject is suspended on the register');
      const j = A.serviceProcessing(r, def, subject, { holds, priorRequests: new Array(priors) });
      out.push(await record({ ...j, agentId: 'a3_service_processing', modelId: 'eligibility', modelVersion: '2026-08', latencyMs: Math.round(ms(t0)) }));
    }
    return out;
  },

  /* A4 — every applicant who would reasonably be asking */
  async a4_customer_guidance() {
    const reqs = await ServiceRequest.find({}).sort({ updatedAt: -1 }).limit(BATCH).lean();
    const out = [];
    for (const r of reqs) {
      const t0 = started();
      const def = await ServiceDefinition.findById(r.service).lean();
      const j = A.customerGuidance(r, def);
      out.push(await record({ ...j, agentId: 'a4_customer_guidance', modelId: 'guidance', modelVersion: '2026-08', latencyMs: Math.round(ms(t0)) }));
    }
    return out;
  },

  /* A5 — boarding targets, chosen before anyone drives out */
  async a5_smart_inspection() {
    const vessels = await Vessel.find({ status: 'ACTIVE' }).limit(BATCH).lean();
    const out = [];
    for (const v of vessels) {
      const t0 = started();
      const [inspections, instruments] = await Promise.all([
        Inspection.find({ vessel: v._id }).lean(),
        License.find({ subjectRef: v._id, status: 'ISSUED' }).lean(),
      ]);
      const j = A.smartInspection(v, { inspections, instruments });
      out.push(await record({ ...j, agentId: 'a5_smart_inspection', modelId: 'inspection-targeting', modelVersion: '2026-08', latencyMs: Math.round(ms(t0)) }));
    }
    return out;
  },

  /* A6 — the instrument library */
  async a6_regulatory_intelligence() {
    const instruments = await Instrument.find({}).lean();
    const services = await ServiceDefinition.find({ active: true }).lean();
    // A6 audits the library as a whole — a conflict between two instruments is
    // only visible if both are in the set being compared, so this agent is not
    // capped at BATCH the way the case-by-case agents are.
    const inForce = instruments.filter((i) => i.status === 'IN_FORCE');
    const out = [];
    for (const i of inForce) {
      const t0 = started();
      const j = A.regulatoryIntelligence(i, { instruments, services });
      out.push(await record({ ...j, agentId: 'a6_regulatory_intelligence', modelId: 'reg-intelligence', modelVersion: '2026-08', latencyMs: Math.round(ms(t0)) }));
    }
    return out;
  },

  /* A7 — one picture, not one per record */
  async a7_maritime_intelligence() {
    const t0 = started();
    const [vessels, incidents, inspections] = await Promise.all([
      Vessel.find({ status: 'ACTIVE' }).lean(),
      Incident.find({}).sort({ createdAt: -1 }).limit(200).lean(),
      Inspection.find({}).sort({ startedAt: -1 }).limit(200).lean(),
    ]);
    const j = A.maritimeIntelligence({ vessels, incidents, inspections });
    return [await record({ ...j, agentId: 'a7_maritime_intelligence', modelId: 'situation', modelVersion: '2026-08', latencyMs: Math.round(ms(t0)) })];
  },
};

const isRunnable = (agentId) => Object.prototype.hasOwnProperty.call(RUNNERS, agentId);

/** Run one agent over its subjects. Returns the decisions it recorded. */
async function run(agentId) {
  if (!isRunnable(agentId)) return null;
  return RUNNERS[agentId]();
}

module.exports = { run, isRunnable, RUNNABLE: Object.keys(RUNNERS) };
