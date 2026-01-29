const express = require('express');
const tokenRoutes = require('./routes/tokenRoutes');

const app = express();

app.use(express.json());

app.use('/api', tokenRoutes);

// Simple health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Basic error handler
app.use((err, _req, res, _next) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

module.exports = app;
