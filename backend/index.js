const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const db = require('./db');
require('dotenv').config({ path: '../.env' });

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Prosty middleware do autoryzacji
const authMiddleware = (req, res, next) => {
  const user = req.headers['x-user'];
  const pass = req.headers['x-password'];

  // Hardcoded fallback for production if .env is missing on server
  const APP_USER = process.env.APP_USER || 'admin';
  const APP_PASSWORD = process.env.APP_PASSWORD || 'millennium_secret_2026';

  if (user === APP_USER && pass === APP_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Publiczny endpoint logowania
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const APP_USER = process.env.APP_USER || 'admin';
  const APP_PASSWORD = process.env.APP_PASSWORD || 'millennium_secret_2026';

  if (username === APP_USER && password === APP_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Zabezpieczamy pozostałe endpointy
app.use('/api', authMiddleware);

const upload = multer({ dest: 'uploads/' });

// Test endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'milleVAT API is running' });
});

// Endpoint do pobierania transakcji
app.get('/api/transactions', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM raw_transactions ORDER BY transaction_date DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Endpoint do wyliczania WSS
app.get('/api/wss', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM v_wss_calculation');
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Endpoint do pobierania konfiguracji
app.get('/api/configs', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM report_configurations');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Endpoint do zapisywania nowej konfiguracji
app.post('/api/configs', async (req, res) => {
  const { name, mapping } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO report_configurations (name, mapping) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET mapping = $2 RETURNING *',
      [name, mapping]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Zmodyfikowany endpoint do wgrywania raportu
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  const { configName } = req.body;
  if (!configName) return res.status(400).json({ error: 'Mapping configuration name is required' });

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rawDataRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Pobierz konfigurację
    const configResult = await db.query('SELECT mapping FROM report_configurations WHERE name = $1', [configName]);
    if (configResult.rows.length === 0) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    const mapping = configResult.rows[0].mapping;

    // Utwórz wpis o raporcie
    const reportResult = await db.query(
      'INSERT INTO transaction_reports (filename, report_type, status) VALUES ($1, $2, $3) RETURNING id',
      [req.file.originalname, configName, 'processing']
    );
    const reportId = reportResult.rows[0].id;

    // Przetwarzaj wiersze
    for (const row of rawDataRows) {
      const transaction_date = row[mapping.transaction_date];
      const net_amount = parseFloat(row[mapping.net_amount]);
      const transaction_description = row[mapping.transaction_description] || '';
      const vat_code = row[mapping.vat_code] || '';
      const is_eligible_for_wss = row[mapping.is_eligible_for_wss] === 'true' || row[mapping.is_eligible_for_wss] === true;

      await db.query(
        `INSERT INTO raw_transactions 
        (report_id, transaction_date, net_amount, transaction_description, vat_code, is_eligible_for_wss, raw_data) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [reportId, transaction_date, net_amount, transaction_description, vat_code, is_eligible_for_wss, JSON.stringify(row)]
      );
    }
    
    await db.query('UPDATE transaction_reports SET status = $1 WHERE id = $2', ['completed', reportId]);

    res.json({ message: 'File processed successfully', reportId, rowsProcessed: rawDataRows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Processing error: ' + err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
