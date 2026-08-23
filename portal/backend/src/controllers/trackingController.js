const { Position, MdaAlert } = require('../models');
const { ApiError, ok } = require('../utils/respond');
const { audit } = require('../utils/audit');

exports.picture = async (_req, res) => {
  const [positions, alerts] = await Promise.all([
    Position.find().populate('vessel', 'name imo type flag status').lean(),
    MdaAlert.find({ acknowledged: false }).sort({ at: -1 }).limit(20).populate('vessel', 'name').lean(),
  ]);
  ok(res, {
    positions: positions.filter((p) => p.vessel),
    alerts,
    generatedAt: new Date().toISOString(),
    coverage: 'Terrestrial AIS (simulated feed) — Gulf of Kutch sector',
  });
};

exports.ackAlert = async (req, res) => {
  const alert = await MdaAlert.findById(req.params.id);
  if (!alert) throw new ApiError(404, 'Alert not found');
  alert.acknowledged = true;
  await alert.save();
  audit(req, { action: 'ALERT_ACK', entity: 'MdaAlert', entityId: alert._id, entityLabel: `${alert.type} — ${alert.vesselName}` });
  ok(res, alert);
};
