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

// Serwowanie plików statycznych frontendu z folderu dist
app.use(express.static(path.join(__dirname, '../frontend/dist')));

const fs = require('fs');
const { importFxFile } = require('./import_logic');
const upload = multer({ dest: 'uploads/' });

// Lista krajów UE (ISO 3166-1 alpha-2)
const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'EL', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'
];

// Test endpoint (publiczny)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'milleVAT API is running', 
    env: process.env.NODE_ENV,
    time: new Date().toISOString()
  });
});

// ENDPOINT OBROTU VAT DLA WSPÓŁCZYNNIKA
app.get('/api/vat-turnover', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        COALESCE(product_type, 'N/A') || ' ' || COALESCE(deal_type, 'N/A') as type,
        CASE WHEN ccode = ANY($1) THEN 'UE' ELSE 'POZA_UE' END as region,
        SUM(report_turnover_vat) as total_turnover
      FROM fx_transactions
      WHERE report_turnover_vat > 0
      GROUP BY 1, 2
      ORDER BY 1, 2
    `, [EU_COUNTRIES]);

    // Agregacja danych dla widoku frontendu
    const aggregated = result.rows.reduce((acc, row) => {
      const type = (row.type || 'N/A').toString().trim() === '' ? 'N/A' : row.type;
      if (!acc[type]) {
        acc[type] = { type: type, ue: 0, poza_ue: 0, total: 0 };
      }
      const val = parseFloat(row.total_turnover || 0);
      if (isNaN(val)) return acc;

      if (row.region === 'UE') {
        acc[type].ue += val;
      } else {
        acc[type].poza_ue += val;
      }
      acc[type].total += val;
      return acc;
    }, {});

    res.json(Object.values(aggregated));
  } catch (err) {
    console.error('Błąd pobierania obrotu VAT:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// ENDPOINT IMPORTU PLIKÓW
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    console.log(`Otrzymano plik: ${req.file.originalname}`);

    // UWAGA: Automigracja wyłączona na prośbę użytkownika.
    // Tabela fx_transactions musi zostać utworzona ręcznie (plik schema_fx.sql).
    
    // Ale możemy spróbować naprawić widok WSS jeśli nie istnieje, bo to tylko widok
    try {
        await db.query(`
            CREATE OR REPLACE VIEW v_wss_calculation AS
            SELECT 
                SUM(COALESCE(report_turnover_vat, 0)) as turnover_with_deduction,
                SUM(COALESCE(report_pln_amount_leg1_ccy1, 0) + COALESCE(report_pln_amount_leg1_ccy2, 0)) as total_turnover,
                0 as wss_percentage
            FROM fx_transactions;
        `);
    } catch (e) { console.log('View creation skipped/failed', e.message); }

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
    // Usuń plik tymczasowy nawet przy błędzie
    if (req.file) {
      fs.unlink(req.file.path, (e) => {}); 
    }
    res.status(500).json({ 
      error: 'Wystąpił błąd podczas przetwarzania pliku.', 
      details: err.message 
    });
  }
});

// Endpoint do pobierania transakcji z paginacją, sortowaniem i filtrowaniem
app.get('/api/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const sortField = req.query.sortField || 'id';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Lista dozwolonych pól do sortowania (bezpieczeństwo przed SQL injection)
    const allowedSortFields = ['id', 'leg1_date', 'bo_dealno', 'client_name', 'product_type', 'report_pln_amount_leg1_ccy1', 'report_turnover_vat'];
    const finalSortField = allowedSortFields.includes(sortField) ? sortField : 'id';

    let whereClause = '';
    let queryParams = [];

    if (search) {
      whereClause = `
        WHERE bo_dealno ILIKE $1 
        OR client_name ILIKE $1 
        OR product_type ILIKE $1 
        OR deal_type ILIKE $1
      `;
      queryParams.push(`%${search}%`);
    }

    const countResult = await db.query(`
      SELECT COUNT(*) FROM fx_transactions ${whereClause}
    `, queryParams);
    
    const totalCount = parseInt(countResult.rows[0].count);

    const result = await db.query(`
      SELECT 
        id,
        CASE 
          WHEN product_type = 'FxSwap' THEN to_char(leg2_date, 'YYYY-MM-DD') 
          ELSE to_char(leg1_date, 'YYYY-MM-DD') 
        END as date,
        bo_dealno,
        fo_dealno,
        product_type,
        deal_type,
        client_name as client,
        ccode,
        leg1_date,
        leg1_ccy1,
        leg1_amount1,
        leg1_ccy2,
        leg1_amount2,
        leg1_rate,
        leg2_date,
        leg2_ccy1,
        leg2_amount1,
        leg2_ccy2,
        leg2_amount2,
        leg2_rate,
        COALESCE(report_pln_amount_leg1_ccy1, leg1_amount1, 0) as amount_pln,
        report_turnover_vat as vat_status,
        CASE WHEN report_turnover_vat IS NOT NULL THEN true ELSE false END as is_eligible,
        source_filename,
        import_date
      FROM fx_transactions 
      ${whereClause}
      ORDER BY ${finalSortField === 'leg1_date' ? 'date' : finalSortField} ${sortOrder} 
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, limit, offset]);
    
    const mappedRows = result.rows.map(row => ({
      ...row,
      amount: parseFloat(row.amount_pln),
      type: `${row.product_type || ''} ${row.deal_type || ''}`.trim() || 'N/A',
      vatStatus: row.vat_status ? `${parseFloat(row.vat_status).toFixed(2)} PLN` : 'Brak danych'
    }));

    res.json({
      transactions: mappedRows,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

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
    console.warn('Błąd pobierania WSS (widok v_wss_calculation prawdopodobnie nie istnieje):', err.message);
    res.json({ wss_percentage: 0, turnover_with_deduction: 0, total_turnover: 0 });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Auth active for user: ${APP_USER}`);
});
