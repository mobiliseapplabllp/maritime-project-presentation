const { ApiError } = require('../utils/respond');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = 500;
  let message = 'Something went wrong on the server';
  if (err instanceof ApiError) { status = err.status; message = err.message; }
  else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join('; ');
  } else if (err.name === 'CastError') { status = 400; message = `Invalid value for ${err.path}`; }
  else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || { value: 1 })[0];
    message = `A record with this ${field} already exists`;
  } else { console.error(err); }
  res.status(status).json({ success: false, message });
}

const notFound = (_req, res) => res.status(404).json({ success: false, message: 'API route not found' });

module.exports = { errorHandler, notFound };
