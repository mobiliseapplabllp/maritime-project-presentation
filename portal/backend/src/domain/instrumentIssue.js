/* B2 — what has to happen at the moment an instrument is issued, wherever the
 * issue came from.
 *
 * An instrument can be issued two ways: an officer moving a register entry to
 * ISSUED, or the service engine granting an application. Both must produce the
 * same artefact, so the two steps that are easy to forget in one path and not
 * the other live here: the record is signed, and a statutory ship certificate
 * is written onto the ship's own certificate list.
 *
 * That second step is the one that matters operationally. A certificate the
 * registry has issued but the fleet screens cannot see is a certificate the
 * crew will let lapse. */
const { Vessel } = require('../models');
const Sign = require('./certificateSigning');
const St = require('./statutoryCertificates');

/* Copy a statutory certificate onto the ship it was issued against, so it shows
 * up in the certificate expiry views alongside everything else the ship holds.
 * Keyed on the printed certificate name: reissuing replaces the entry rather
 * than adding a second one for the same certificate. */
async function mirrorToVessel(doc) {
  if (doc.subjectKind !== 'VESSEL' || !doc.subjectRef) return null;
  if (!St.isStatutory(doc.entityType)) return null;
  const label = St.CERT_LABEL[doc.entityType];
  if (!label) return null;

  const vessel = await Vessel.findById(doc.subjectRef);
  if (!vessel) return null;
  const entry = {
    certType: label,
    number: doc.licenseNo,
    issuer: doc.issuer || 'Directorate General of Shipping',
    issueDate: doc.issueDate,
    expiryDate: doc.expiryDate,
    remarks: St.nonExpiring(doc.entityType)
      ? `Issued under ${St.CONVENTION[doc.entityType]}. Not renewed on a term — reissued on any change to the ship.`
      : `Issued on the register under ${St.CONVENTION[doc.entityType] || 'the applicable convention'}`,
  };
  const existing = vessel.certificates.find((c) => c.certType === label);
  if (existing) Object.assign(existing, entry);
  else vessel.certificates.push(entry);
  await vessel.save();
  return vessel._id;
}

/** Sign the record and mirror it. Call immediately before saving the issue. */
async function finaliseIssue(doc) {
  doc.signature = Sign.sign(doc);
  const mirrored = await mirrorToVessel(doc);
  return { signed: true, mirroredTo: mirrored };
}

module.exports = { finaliseIssue, mirrorToVessel };
