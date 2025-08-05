const express = require('express');
const cors = require('cors');
const createCheckoutSession = require('./api/create-checkout-session');
const confirmPayment = require('./api/confirm-payment');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.post('/api/create-checkout-session', createCheckoutSession);
app.post('/api/confirm-payment', confirmPayment);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 