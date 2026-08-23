require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./src/config/db');
const routes = require('./src/routes');
const { errorHandler, notFound } = require('./src/middleware/error');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', routes);
app.use('/api', notFound);

// Production/single-port mode: serve the built frontend with an SPA fallback.
const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use(errorHandler);

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
      app.listen(port, '0.0.0.0', () => console.log(`Mundra Portal on :${port}`));
    })
    .catch((e) => { console.error('DB connection failed:', e.message); process.exit(1); });
}

module.exports = app;
