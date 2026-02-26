const xlsx = require('xlsx');
const db = require('./db');

/**
 * Parsuje datę z formatu Excel (liczba dni od 1900 roku) lub stringa 'YYYY-MM-DD'
 */
function parseDate(value) {
  if (!value) return null;
  
  // Jeśli to liczba (Excel serial date)
  if (typeof value === 'number') {
    // Excel date to JS Date: (value - 25569) * 86400 * 1000
    // Ale xlsx library często robi to za nas, jeśli używamy cellDates: true.
    // Tutaj zakładamy surową wartość.
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }
  
  // Jeśli string
  if (typeof value === 'string') {
    // Próba parsowania "YYYY-MM-DD"
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  return null;
}

/**
 * Główna funkcja importująca pliki FX
 */
async function importFxFile(filePath, originalFilename) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  
  // Logika wykrywania typu raportu na podstawie nazwy pliku lub nagłówków
  // Tutaj uproszczona: sprawdzamy czy nazwa zawiera "SWAP" czy "FORWARD"
  const filename = originalFilename.toUpperCase();
  let type = 'UNKNOWN';
  
  if (filename.includes('SWAP')) type = 'SWAP';
  else if (filename.includes('FORWARD')) type = 'FORWARD';
  
  console.log(`Rozpoznano typ pliku: ${type}`);
  
  // Pobieramy dane z arkusza "Data" (lub pierwszego, jeśli nie ma "Data")
  let sheet = workbook.Sheets['Data'];
  if (!sheet) sheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Inteligentne wykrywanie wiersza nagłówkowego
  // Szukamy wiersza, który zawiera kluczowe kolumny (np. DEALNO, PRODUCT)
  // Pobieramy surowe dane (array of arrays) aby znaleźć nagłówek
  const rawMatrix = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rawMatrix.length, 20); i++) {
    const rowStr = JSON.stringify(rawMatrix[i] || []).toUpperCase();
    // Szukamy słów kluczowych w wierszu
    if ((rowStr.includes('DEALNO') || rowStr.includes('K_DEALNO') || rowStr.includes('FO_DEALNO')) && rowStr.includes('PRODUCT')) {
      headerRowIndex = i;
      console.log(`Znaleziono nagłówek w wierszu: ${i}`);
      break;
    }
  }
  
  // Wczytujemy dane ponownie, zaczynając od wykrytego wiersza nagłówka
  const rawData = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex });
  
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Generujemy ID wgrania (batch)
    const batchRes = await client.query('SELECT gen_random_uuid() as uuid');
    const batchId = batchRes.rows[0].uuid;
    
    let processedCount = 0;
    
    for (const row of rawData) {
      // Pomiń puste wiersze
      if (!row['PRODUCT'] && !row['Product']) continue;
      
      const transaction = mapRowToTransaction(row, type);
      
      // Dodaj metadane
      transaction.source_filename = originalFilename;
      transaction.import_batch_id = batchId;
      
      await insertTransaction(client, transaction);
      processedCount++;
    }
    
    await client.query('COMMIT');
    console.log(`Zaimportowano ${processedCount} transakcji.`);
    return { success: true, count: processedCount, batchId };
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Błąd importu:', err);
    throw err;
  } finally {
    client.release();
  }
}

function mapRowToTransaction(row, type) {
  const tx = {};
  
  if (type === 'SWAP') {
    // Mapowanie dla FX SWAP
    tx.fo_dealno = row['K_DEALNO'];
    tx.bo_dealno = row['KTP_DEALNO'];
    tx.product_type = row['PRODUCT']; // 'FxSwap'
    tx.deal_type = row['DEALTYPE'];
    tx.client_name = row['CUSTOMER'];
    
    tx.ccode = row['CCODE'];
    tx.uccode = row['UCCODE'];
    
    // Noga 1 (Initial)
    tx.leg1_date = parseDate(row['VDATE_INITIAL']);
    tx.leg1_ccy1 = row['CCY1'];
    tx.leg1_amount1 = row['CCY1AMT_INITIAL'];
    tx.leg1_ccy2 = row['CCY2'];
    tx.leg1_amount2 = row['CCY2AMT_INITIAL'];
    
    // Noga 2 (Maturity)
    tx.leg2_date = parseDate(row['VDATE_MATURITY']);
    tx.leg2_ccy1 = row['CCY1']; // Te same waluty
    tx.leg2_amount1 = row['CCY1AMT_MATURITY'];
    tx.leg2_ccy2 = row['CCY2'];
    tx.leg2_amount2 = row['CCY2AMT_MATURITY'];
    
    // Dane Raportowe - Kursy
    tx.report_nbp_rate_leg1_ccy1 = row['SPOTRATE_T_1_CCY1_INITIAL'];
    tx.report_nbp_rate_leg1_ccy2 = row['SPOTRATE_T_1_CCY2_INITIAL'];
    tx.report_nbp_rate_leg2_ccy1 = row['SPOTRATE_T_1_CCY1_MATURITY'];
    tx.report_nbp_rate_leg2_ccy2 = row['SPOTRATE_T_1_CCY2_MATURITY'];
    
    // Dane Raportowe - Przeliczenia na PLN (z raportu - tj. wyliczone wg kursów raportowych)
    tx.report_pln_amount_leg1_ccy1 = (tx.leg1_amount1 && tx.report_nbp_rate_leg1_ccy1) ? (tx.leg1_amount1 * tx.report_nbp_rate_leg1_ccy1) : null;
    tx.report_pln_amount_leg1_ccy2 = (tx.leg1_amount2 && tx.report_nbp_rate_leg1_ccy2) ? (tx.leg1_amount2 * tx.report_nbp_rate_leg1_ccy2) : null;
    tx.report_pln_amount_leg2_ccy1 = (tx.leg2_amount1 && tx.report_nbp_rate_leg2_ccy1) ? (tx.leg2_amount1 * tx.report_nbp_rate_leg2_ccy1) : null;
    tx.report_pln_amount_leg2_ccy2 = (tx.leg2_amount2 && tx.report_nbp_rate_leg2_ccy2) ? (tx.leg2_amount2 * tx.report_nbp_rate_leg2_ccy2) : null;
    
    tx.report_turnover_vat = row['TURNOVER_VAT'];
    
  } else if (type === 'FORWARD') {
    // Mapowanie dla FX FORWARD
    tx.fo_dealno = row['FO_DEALNO'] || row['KTP_DEALNO']; // Fallback jeśli FO_DEALNO puste
    tx.bo_dealno = row['KTP_DEALNO'];
    tx.product_type = row['PRODUCT']; // 'Forward'
    tx.deal_type = row['DealType'];
    tx.client_name = row['Cpty_ShortName'];
    
    tx.ccode = row['Countries_Name']; // Mapowanie kraju z kolumny Countries_Name
    tx.uccode = null; // Brak w pliku Forward
    
    // Noga 1 (Settlement)
    tx.leg1_date = parseDate(row['ValueDate']);
    tx.leg1_ccy1 = row['Currency1'];
    tx.leg1_amount1 = row['PrincipalCur1'];
    tx.leg1_ccy2 = row['Currency2'];
    tx.leg1_amount2 = row['PrincipalCur2'];
    
    // Noga 2 (NULL)
    tx.leg2_date = null;
    tx.leg2_ccy1 = null;
    tx.leg2_amount1 = null;
    tx.leg2_ccy2 = null;
    tx.leg2_amount2 = null;
    
    // Dane Raportowe (Tylko dla Nogi 1)
    tx.report_nbp_rate_leg1_ccy1 = row['SPOTRATE_T_1_CCY'];
    tx.report_nbp_rate_leg1_ccy2 = row['SPOTRATE_T_1_CRTCCY'];
    tx.report_nbp_rate_leg2_ccy1 = null;
    tx.report_nbp_rate_leg2_ccy2 = null;
    
    // Dane Raportowe - Przeliczenia na PLN (z raportu)
    tx.report_pln_amount_leg1_ccy1 = (tx.leg1_amount1 && tx.report_nbp_rate_leg1_ccy1) ? (tx.leg1_amount1 * tx.report_nbp_rate_leg1_ccy1) : null;
    tx.report_pln_amount_leg1_ccy2 = (tx.leg1_amount2 && tx.report_nbp_rate_leg1_ccy2) ? (tx.leg1_amount2 * tx.report_nbp_rate_leg1_ccy2) : null;
    tx.report_pln_amount_leg2_ccy1 = null;
    tx.report_pln_amount_leg2_ccy2 = null;
    
    tx.report_turnover_vat = row['TURNOVER_VAT'];
  }
  
  return tx;
}

async function insertTransaction(client, tx) {
  const query = `
    INSERT INTO fx_transactions (
      source_filename, import_batch_id,
      fo_dealno, bo_dealno, product_type, deal_type, client_name,
      ccode, uccode,
      leg1_date, leg1_ccy1, leg1_amount1, leg1_ccy2, leg1_amount2,
      leg2_date, leg2_ccy1, leg2_amount1, leg2_ccy2, leg2_amount2,
      report_nbp_rate_leg1_ccy1, report_nbp_rate_leg1_ccy2,
      report_nbp_rate_leg2_ccy1, report_nbp_rate_leg2_ccy2,
      report_pln_amount_leg1_ccy1, report_pln_amount_leg1_ccy2,
      report_pln_amount_leg2_ccy1, report_pln_amount_leg2_ccy2,
      report_turnover_vat
    ) VALUES (
      $1, $2,
      $3, $4, $5, $6, $7,
      $8, $9,
      $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19,
      $20, $21, $22, $23,
      $24, $25, $26, $27, $28
    )
  `;
  
  const values = [
    tx.source_filename, tx.import_batch_id,
    tx.fo_dealno, tx.bo_dealno, tx.product_type, tx.deal_type, tx.client_name,
    tx.ccode, tx.uccode,
    tx.leg1_date, tx.leg1_ccy1, tx.leg1_amount1, tx.leg1_ccy2, tx.leg1_amount2,
    tx.leg2_date, tx.leg2_ccy1, tx.leg2_amount1, tx.leg2_ccy2, tx.leg2_amount2,
    tx.report_nbp_rate_leg1_ccy1, tx.report_nbp_rate_leg1_ccy2,
    tx.report_nbp_rate_leg2_ccy1, tx.report_nbp_rate_leg2_ccy2,
    tx.report_pln_amount_leg1_ccy1, tx.report_pln_amount_leg1_ccy2,
    tx.report_pln_amount_leg2_ccy1, tx.report_pln_amount_leg2_ccy2,
    tx.report_turnover_vat
  ];
  
  await client.query(query, values);
}

module.exports = { importFxFile };
