const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const db = require('./db');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Konfiguracja dostępowa - Hardcoded fallback dla pewności
const APP_USER = process.env.APP_USER || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || 'Millennium2026';

// Publiczny endpoint logowania (musi być PRZED middleware auth)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log(`Próba logowania: ${username}`);
  
  if (username === APP_USER && password === APP_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Middleware do autoryzacji pozostałych ścieżek
const authMiddleware = (req, res, next) => {
  const user = req.headers['x-user'];
  const pass = req.headers['x-password'];

  if (user === APP_USER && pass === APP_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Zabezpieczamy wszystkie pozostałe ścieżki /api
app.use('/api', authMiddleware);

// Serwowanie plików statycznych frontendu (opcjonalne, jeśli backend ma obsługiwać wszystko)
app.use(express.static(path.join(__dirname, '../')));

// Test endpoint (publiczny)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'milleVAT API is running', 
    env: process.env.NODE_ENV,
    time: new Date().toISOString()
  });
});

app.get('/api/transactions', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM raw_transactions ORDER BY transaction_date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/wss', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM v_wss_calculation');
    res.json(result.rows[0] || { wss_percentage: 0, turnover_with_deduction: 0, total_turnover: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Auth active for user: ${APP_USER}`);
});
