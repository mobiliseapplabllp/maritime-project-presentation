require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./src/config/db');
const routes = require('./src/routes');
const { sanitizeRequest } = require('./src/middleware/sanitize');
const { errorHandler, notFound } = require('./src/middleware/error');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // first hop only (nginx) — keeps req.ip honest for rate limiting

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      // MUI/emotion injects style tags at runtime; Google Fonts serves the faces
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'self'"],
      // TLS redirection is nginx's job; leaving this in breaks plain-HTTP
      // demos on a LAN address by force-upgrading same-origin asset loads
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS: same-origin in production (UI is served by this process / nginx);
// CORS_ORIGIN narrows it explicitly, e.g. "https://portal.example.in"
app.use(cors(process.env.CORS_ORIGIN
  ? { origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) }
  : {}));

app.use(express.json({ limit: '2mb' }));
app.use(sanitizeRequest);

// Rate limits: a tight lid on credential endpoints, a broad one on the API.
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, message: 'Too many attempts — please wait a few minutes' },
});
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, limit: 1500, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, message: 'Rate limit exceeded — slow down and retry shortly' },
});
if (process.env.NODE_ENV !== 'test') {
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/refresh', authLimiter);
  app.use('/api', apiLimiter);
}

app.use('/api', routes);
app.use('/api', notFound);

// Production/single-port mode: serve the built frontend with an SPA fallback.
const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use(errorHandler);

// Audit-log retention — the window is admin-configurable (admin module settings)
// and enforced at boot plus once a day.
function purgeAuditLogs() {
  const settings = require('./src/config/settingsCache');
  const AuditLog = require('./src/models/AuditLog');
  const days = (settings.isReady() && settings.moduleGet('admin').auditRetentionDays) || 730;
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  AuditLog.deleteMany({ at: { $lt: cutoff } })
    .then((r) => { if (r.deletedCount) console.log(`audit retention: purged ${r.deletedCount} entries older than ${days} days`); })
    .catch((e) => console.error('audit retention purge failed:', e.message));
}

if (require.main === module) {
  const port = process.env.PORT || 5200;
  connectDB()
    .then(async () => {
      if (process.env.SEED_IF_EMPTY === '1') {
        const User = require('./src/models/User');
        if ((await User.countDocuments()) === 0) {
          console.log('Empty database — seeding Mundra sample data…');
          execFileSync(process.execPath, [path.join(__dirname, 'scripts', 'seed.js')], { stdio: 'inherit' });
        }
      }
      await require('./src/config/settingsCache').init();
      purgeAuditLogs();
      setInterval(purgeAuditLogs, 24 * 3600 * 1000).unref();
      app.listen(port, '0.0.0.0', () => console.log(`Mundra Portal on :${port}`));
    })
    .catch((e) => { console.error('DB connection failed:', e.message); process.exit(1); });
}

module.exports = app;
