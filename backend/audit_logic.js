const db = require('./db');

// Cache for NBP rates to avoid hitting API repeatedly for the same date/currency
const rateCache = new Map();

async function getNbpRate(currency, dateStr) {
  if (!currency || currency === 'PLN') return 1.0;
  
  // Normalize date string just in case
  const dateObj = new Date(dateStr);
  const normalizedDateStr = dateObj.toISOString().split('T')[0];
  
  // Check cache first (cache key: "EUR_2026-01-20")
  // Note: we cache the requested date, pointing to the effective rate found
  const cacheKey = `${currency}_${normalizedDateStr}`;
  if (rateCache.has(cacheKey)) {
    return rateCache.get(cacheKey);
  }

  // Loop back up to 10 days to find a working day rate
  // Start from T-1 (yesterday relative to the transaction date)
  for (let i = 1; i <= 10; i++) {
    const targetDate = new Date(dateObj);
    targetDate.setDate(dateObj.getDate() - i);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    // URL for NBP API table A (mid rates)
    const url = `http://api.nbp.pl/api/exchangerates/rates/a/${currency}/${targetDateStr}/?format=json`;
    
    try {
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const rate = data.rates[0].mid;
        
        // Cache the result
        rateCache.set(cacheKey, rate);
        return rate;
      }
    } catch (e) {
      // Just continue to previous day if fetch failed (404/400 usually means no rate for that day)
    }
  }
  
  console.warn(`Could not find NBP rate for ${currency} for date ${normalizedDateStr} (looked back 10 days)`);
  return null;
}

async function performAudit() {
  const client = await db.pool.connect();
  let processedCount = 0;
  let stats = {
    processed: 0,
    ok: 0,
    nok: 0,
    totalDiff: 0
  };
  
  try {
    await client.query('BEGIN');
    
    // Fetch all transactions. 
    // Optimization: We could filter for only those needing audit, 
    // but for now re-running audit on everything ensures consistency.
    // If table is huge, we should paginate or filter.
    // Let's filter for those where is_audit_ok is NULL or updated recently.
    // For this task, "audit all" seems implied by the button "AUDYTUJ WYNIK".
    const res = await client.query('SELECT * FROM fx_transactions');
    const transactions = res.rows;
    
    console.log(`Starting audit for ${transactions.length} transactions...`);

    for (const tx of transactions) {
      const updates = {};
      
      // 1. Audit Rates & Amounts for Leg 1
      if (tx.leg1_date) {
        updates.audit_nbp_rate_leg1_ccy1 = await getNbpRate(tx.leg1_ccy1, tx.leg1_date);
        updates.audit_nbp_rate_leg1_ccy2 = await getNbpRate(tx.leg1_ccy2, tx.leg1_date);
        
        updates.audit_pln_amount_leg1_ccy1 = tx.leg1_amount1 !== null && updates.audit_nbp_rate_leg1_ccy1 !== null
          ? Number(tx.leg1_amount1) * updates.audit_nbp_rate_leg1_ccy1
          : 0;
          
        updates.audit_pln_amount_leg1_ccy2 = tx.leg1_amount2 !== null && updates.audit_nbp_rate_leg1_ccy2 !== null
          ? Number(tx.leg1_amount2) * updates.audit_nbp_rate_leg1_ccy2
          : 0;
      } else {
        updates.audit_nbp_rate_leg1_ccy1 = null;
        updates.audit_nbp_rate_leg1_ccy2 = null;
        updates.audit_pln_amount_leg1_ccy1 = 0;
        updates.audit_pln_amount_leg1_ccy2 = 0;
      }

      // 2. Audit Rates & Amounts for Leg 2 (if exists)
      if (tx.leg2_date) {
        updates.audit_nbp_rate_leg2_ccy1 = await getNbpRate(tx.leg2_ccy1, tx.leg2_date);
        updates.audit_nbp_rate_leg2_ccy2 = await getNbpRate(tx.leg2_ccy2, tx.leg2_date);
        
        updates.audit_pln_amount_leg2_ccy1 = tx.leg2_amount1 !== null && updates.audit_nbp_rate_leg2_ccy1 !== null
          ? Number(tx.leg2_amount1) * updates.audit_nbp_rate_leg2_ccy1
          : 0;
          
        updates.audit_pln_amount_leg2_ccy2 = tx.leg2_amount2 !== null && updates.audit_nbp_rate_leg2_ccy2 !== null
          ? Number(tx.leg2_amount2) * updates.audit_nbp_rate_leg2_ccy2
          : 0;
      } else {
        updates.audit_nbp_rate_leg2_ccy1 = null;
        updates.audit_nbp_rate_leg2_ccy2 = null;
        updates.audit_pln_amount_leg2_ccy1 = 0;
        updates.audit_pln_amount_leg2_ccy2 = 0;
      }

      // 3. Total Audit Turnover VAT
      // Sum of all 4 PLN amounts
      updates.audit_turnover_vat = 
        (updates.audit_pln_amount_leg1_ccy1 || 0) +
        (updates.audit_pln_amount_leg1_ccy2 || 0) +
        (updates.audit_pln_amount_leg2_ccy1 || 0) +
        (updates.audit_pln_amount_leg2_ccy2 || 0);

      // 4. Difference and Validation
      const reportTurnover = Number(tx.report_turnover_vat || 0);
      updates.diff_turnover_vat = updates.audit_turnover_vat - reportTurnover;
      
      // Check if difference is negligible (e.g. within 0.05 PLN due to rounding)
      updates.is_audit_ok = Math.abs(updates.diff_turnover_vat) < 0.05;

      // Update stats
      stats.processed++;
      if (updates.is_audit_ok) {
        stats.ok++;
      } else {
        stats.nok++;
        stats.totalDiff += updates.diff_turnover_vat;
      }

      // Update in DB
      await client.query(
        `UPDATE fx_transactions SET
          audit_nbp_rate_leg1_ccy1 = $1,
          audit_nbp_rate_leg1_ccy2 = $2,
          audit_nbp_rate_leg2_ccy1 = $3,
          audit_nbp_rate_leg2_ccy2 = $4,
          audit_pln_amount_leg1_ccy1 = $5,
          audit_pln_amount_leg1_ccy2 = $6,
          audit_pln_amount_leg2_ccy1 = $7,
          audit_pln_amount_leg2_ccy2 = $8,
          audit_turnover_vat = $9,
          diff_turnover_vat = $10,
          is_audit_ok = $11
         WHERE id = $12`,
        [
          updates.audit_nbp_rate_leg1_ccy1,
          updates.audit_nbp_rate_leg1_ccy2,
          updates.audit_nbp_rate_leg2_ccy1,
          updates.audit_nbp_rate_leg2_ccy2,
          updates.audit_pln_amount_leg1_ccy1,
          updates.audit_pln_amount_leg1_ccy2,
          updates.audit_pln_amount_leg2_ccy1,
          updates.audit_pln_amount_leg2_ccy2,
          updates.audit_turnover_vat,
          updates.diff_turnover_vat,
          updates.is_audit_ok,
          tx.id
        ]
      );
    }
    
    await client.query('COMMIT');
    return stats;
    
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("Audit failed:", e);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { performAudit };
