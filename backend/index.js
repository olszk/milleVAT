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

const fs = require('fs');
const { importFxFile } = require('./import_logic');
const upload = multer({ dest: 'uploads/' });

// Test endpoint (publiczny)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'milleVAT API is running', 
    env: process.env.NODE_ENV,
    time: new Date().toISOString()
  });
});

// ENDPOINT IMPORTU PLIKÓW
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    console.log(`Otrzymano plik: ${req.file.originalname}`);

    // UWAGA: Automigracja wyłączona na prośbę użytkownika.
    // Tabela fx_transactions musi zostać utworzona ręcznie (plik schema_fx.sql).

    // Uruchom import z dedykowaną logiką
    const result = await importFxFile(req.file.path, req.file.originalname);
    
    // Usuń plik tymczasowy po udanym imporcie
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Błąd usuwania pliku tymczasowego:', err);
    });

    res.json({ 
      success: true, 
      message: 'Plik został pomyślnie przetworzony.', 
      rowsProcessed: result.count,
      batchId: result.batchId
    });

  } catch (err) {
    console.error('Błąd przetwarzania uploadu:', err);
    res.status(500).json({ 
      error: 'Wystąpił błąd podczas przetwarzania pliku.', 
      details: err.message 
    });
  }
});

// Endpoint do pobierania transakcji
app.get('/api/transactions', async (req, res) => {
  try {
    // 1. Sprawdź czy nowa tabela istnieje
    try {
      const result = await db.query(`
        SELECT 
          id,
          to_char(leg1_date, 'YYYY-MM-DD') as date,
          product_type || ' ' || deal_type as type,
          client_name as client,
          COALESCE(report_pln_amount_leg1_ccy1, leg1_amount1, 0) as amount,
          report_turnover_vat as vat_status,
          CASE WHEN report_turnover_vat IS NOT NULL THEN true ELSE false END as is_eligible
        FROM fx_transactions 
        ORDER BY id DESC 
        LIMIT 100
      `);
      
      const mappedRows = result.rows.map(row => ({
        id: row.id,
        date: row.date,
        type: row.type || 'N/A',
        client: row.client || 'N/A',
        amount: parseFloat(row.amount),
        vatStatus: row.vat_status ? `${parseFloat(row.vat_status).toFixed(2)} PLN` : 'Brak danych',
        isEligible: row.is_eligible
      }));

      return res.json(mappedRows);
    } catch (newTableErr) {
      console.warn('Nowa tabela fx_transactions błąd:', newTableErr.message);
    }

    // 2. Fallback do starej tabeli raw_transactions
    const oldResult = await db.query('SELECT * FROM raw_transactions ORDER BY transaction_date DESC LIMIT 50');
    return res.json(oldResult.rows.map(row => ({
      id: row.id,
      date: row.transaction_date,
      type: 'Stary format',
      client: 'Nieznany',
      amount: parseFloat(row.net_amount),
      vatStatus: row.vat_code,
      isEligible: row.is_eligible_for_wss
    })));

  } catch (err) {
    console.error('Błąd pobierania transakcji:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
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
