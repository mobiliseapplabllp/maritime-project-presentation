require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./src/config/db');
const routes = require('./src/routes');
const { errorHandler, notFound } = require('./src/middleware/error');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', routes);
app.use('/api', notFound);
app.use(errorHandler);

if (require.main === module) {
  const port = process.env.PORT || 5200;
  connectDB()
    .then(() => app.listen(port, () => console.log(`Mundra Portal API on :${port}`)))
    .catch((e) => { console.error('DB connection failed:', e.message); process.exit(1); });
}

module.exports = app;
