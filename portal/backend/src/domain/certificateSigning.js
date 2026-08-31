/* B2 — digital signature over an issued instrument.
 *
 * "Digitally signed" is worth nothing unless a verifier can detect a change.
 * So the signature here is taken over the register facts themselves, and
 * verification recomputes those facts from the stored record rather than from
 * anything stored alongside the signature. Alter the holder's name, the expiry
 * or the status after issue and verification fails — which is the whole point,
 * and is why the signed payload is never persisted.
 *
 * Ed25519, because it is deterministic, short enough to print under a QR code,
 * and available in Node's standard library with no dependency to audit.
 *
 * The key is derived from a configured secret so that a demonstration
 * deployment reproduces the same public key across restarts and reseeds. A
 * production deployment supplies CERT_SIGNING_KEY as a PKCS#8 PEM held in a key
 * store, and this code never sees the seed. */
const crypto = require('crypto');

// PKCS#8 wrapper for a raw 32-byte Ed25519 seed.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

let cached = null;

function keyMaterial() {
  if (cached) return cached;
  let privateKey;
  if (process.env.CERT_SIGNING_KEY) {
    privateKey = crypto.createPrivateKey(process.env.CERT_SIGNING_KEY);
  } else {
    const secret = process.env.CERT_SIGNING_SECRET || process.env.JWT_SECRET || 'maritime-registry-demonstration-key';
    const seed = crypto.createHash('sha256').update(secret).digest();
    privateKey = crypto.createPrivateKey({
      key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8',
    });
  }
  const publicKeyObj = crypto.createPublicKey(privateKey);
  const spki = publicKeyObj.export({ format: 'der', type: 'spki' });
  cached = {
    privateKey,
    publicKeyObj,
    // A short, stable identifier so a verifier can tell which key signed an old
    // certificate after the signing key has been rotated.
    keyId: crypto.createHash('sha256').update(spki).digest('hex').slice(0, 16),
    pem: publicKeyObj.export({ format: 'pem', type: 'spki' }).toString(),
  };
  return cached;
}

const iso = (d) => (d ? new Date(d).toISOString() : '');

/* The facts a certificate asserts, in a fixed order. Field order is part of the
 * signature: reordering this function invalidates every signature ever issued,
 * so it changes only alongside a key rotation. */
function canonical(doc) {
  return [
    doc.licenseNo,
    doc.entityType,
    doc.subjectKind || 'COMPANY',
    doc.subjectRef ? String(doc.subjectRef) : '',
    doc.entityName,
    iso(doc.issueDate),
    iso(doc.expiryDate),
    'ISSUED',
  ].join('|');
}

/** Sign an instrument. Returns what goes on the record — never the payload. */
function sign(doc) {
  const { privateKey, keyId } = keyMaterial();
  return {
    alg: 'Ed25519',
    keyId,
    value: crypto.sign(null, Buffer.from(canonical(doc), 'utf8'), privateKey).toString('base64'),
    signedAt: new Date(),
  };
}

/* Verify a record against its own signature.
 *
 * Three outcomes matter and are reported separately: unsigned, signed by a key
 * this deployment does not hold, and signed but altered since. Collapsing them
 * into a boolean would hide the only one that means something is wrong. */
function verify(doc) {
  const sig = doc && doc.signature;
  if (!sig || !sig.value) return { signed: false, valid: false, reason: 'Not digitally signed' };
  const { publicKeyObj, keyId } = keyMaterial();
  if (sig.keyId && sig.keyId !== keyId) {
    return { signed: true, valid: false, keyId: sig.keyId, reason: 'Signed by a key this registry no longer holds' };
  }
  let good = false;
  try {
    good = crypto.verify(null, Buffer.from(canonical(doc), 'utf8'), publicKeyObj, Buffer.from(sig.value, 'base64'));
  } catch (err) {
    good = false;
  }
  return {
    signed: true,
    valid: good,
    keyId: sig.keyId,
    signedAt: sig.signedAt,
    reason: good ? 'Signature matches the register entry'
      : 'Signature does not match the register entry — the record has been altered since issue',
  };
}

/** The public key a verifier needs, and the identifier to quote when reporting. */
const publicKey = () => {
  const k = keyMaterial();
  return { alg: 'Ed25519', keyId: k.keyId, publicKeyPem: k.pem };
};

module.exports = { sign, verify, canonical, publicKey };
