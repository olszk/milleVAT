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
 * Parsuje liczbę (obsługuje stringi ze spacjami i przecinkami)
 */
function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (!value) return null;
  if (typeof value === 'string') {
    // Usuń spacje, zamień przecinek na kropkę
    const cleaned = value.replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
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
  
  let headerRowIndex = -1;

  // Skanujemy pierwsze 20 wierszy szukając nagłówka
  for (let i = 0; i < Math.min(rawMatrix.length, 20); i++) {
    const row = rawMatrix[i] || [];
    
    // Zliczamy ile komórek zawiera słowa kluczowe
    const keywordCells = row.filter(cell => {
      if (!cell) return false;
      const s = String(cell).toUpperCase();
      return s.includes('DEALNO') || s === 'PRODUCT' || s.includes('CUSTOMER') 
          || s.includes('CPTY') || s.includes('CCY') || s.includes('CURRENCY');
    });
    
    if (keywordCells.length >= 3) {
      headerRowIndex = i;
      console.log(`Znaleziono nagłówek w wierszu: ${i} (${keywordCells.length} komórek kluczowych: ${keywordCells.slice(0,5).join(', ')})`);
      break;
    }
  }

  // Fallback na prośbę użytkownika: jeśli nie znaleziono, a to plik SWAP/FORWARD, spróbuj wiersza 1 (index 1) lub 0
  if (headerRowIndex === -1 && (type === 'SWAP' || type === 'FORWARD')) {
      console.warn('Automatyczna detekcja zawiodła. Próbuję domyślnego wiersza 0.');
      headerRowIndex = 0;
  }

  if (headerRowIndex === -1) {
    console.error('Nie znaleziono wiersza nagłówkowego w pliku!');
    return { success: false, count: 0 };
  }
  
  // const headers = rawMatrix[headerRowIndex].map((cell, idx) => {
  //    const val = cell ? String(cell).trim() : `UNKNOWN_${idx}`;
  //    return val;
  // });
  
  // console.log(`Używam nagłówków z wiersza ${headerRowIndex}:`, headers.slice(0, 5), '...');

  // ZMIANA PODEJŚCIA (OSTATECZNA):
  // Mamy już wczytane całe dane w rawMatrix (z header: 1).
  // Nie ma sensu wołać sheet_to_json drugi raz, bo to może powodować błędy z 'range'.
  // Po prostu bierzemy dane z rawMatrix.
  
  if (!rawMatrix || rawMatrix.length <= headerRowIndex) {
      console.error('Błąd: rawMatrix jest pusty lub headerRowIndex poza zakresem');
      return { success: false, count: 0 };
  }

  // 1. Nagłówki
  const rawHeader = rawMatrix[headerRowIndex] || [];
  const headerCells = rawHeader.map(c => String(c || '').trim().toUpperCase());
  
  console.log(`DEBUG: Używam rawMatrix. headerRowIndex=${headerRowIndex}`);
  console.log('DEBUG: Nagłówki:', headerCells.slice(0, 10)); // Pokaż pierwsze 10
  
  // 2. Dane (wszystko poniżej nagłówka)
  const dataRows = rawMatrix.slice(headerRowIndex + 1);
  
  console.log(`DEBUG: Liczba wierszy danych: ${dataRows.length}`);
  if (dataRows.length > 0) {
      console.log('DEBUG: Pierwszy wiersz danych (raw):', JSON.stringify(dataRows[0]));
  }
  
  // Konwertujemy tablice na obiekty
  const rawData = dataRows.map(row => {
      const obj = {};
      headerCells.forEach((key, idx) => {
          // Ignoruj puste klucze nagłówkowe oraz te zaczynające się od __EMPTY
          if (key && key !== 'UNDEFINED' && key !== 'NULL' && !key.startsWith('__EMPTY')) {
             const val = row[idx];
             if (val !== undefined) {
                 obj[key] = val;
             }
          }
      });
      return obj;
  });
  
  // LOGIKA DODATKOWA:
  // Jeśli po headerRowIndex są jeszcze wiersze nagłówkowe (np. puste, scalone),
  // to rawData może zawierać śmieci na początku.
  // Ale nasza pętla filtruje po `if (!row['PRODUCT']) continue;` więc powinna pominąć śmieci.
  
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Generujemy ID wgrania (batch)
    const batchRes = await client.query('SELECT gen_random_uuid() as uuid');
    const batchId = batchRes.rows[0].uuid;
    
    let processedCount = 0;
    
    // Diagnostyka
    console.log(`Przetwarzam ${rawData.length} zmapowanych obiektów.`);
    if (rawData.length > 0) {
        console.log('DEBUG: Przykładowy zmapowany obiekt[0]:', JSON.stringify(rawData[0]));
    }
    
    for (const row of rawData) {
      // Normalizacja kluczy (już zrobiliśmy przy mapowaniu rawDataArray)
      
      // Sprawdzamy klucz PRODUCT.
      if (!row['PRODUCT']) {
          // Diagnostyka dla odrzuconych
          if (processedCount === 0) { // Loguj tylko pierwszy przypadek
             console.log('DEBUG: Odrzucono (brak PRODUCT):', Object.keys(row));
          }
          continue; 
      }
      
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

// UWAGA: Funkcja mapRowToTransaction ma teraz prościej, bo klucze są już UPPERCASE
// Ale musimy pamiętać, że `row` to teraz obiekt z kluczami, które SĄ W NAGŁÓWKU.
// Jeśli w nagłówku jest literówka, to klucz w `row` też będzie miał literówkę.

function mapRowToTransaction(row, type) {
  const tx = {};
  
  // Pomocnicza funkcja do bezpiecznego pobierania wartości
  // (w razie gdyby klucz miał spacje na końcu w nagłówku, mimo że robiliśmy trim)
  // Ale robiliśmy trim().
  const get = (key) => row[key];
  
  if (type === 'SWAP') {
    // Mapowanie dla FX SWAP
    tx.fo_dealno = get('K_DEALNO');
    tx.bo_dealno = get('KTP_DEALNO');
    tx.product_type = get('PRODUCT'); 
    tx.deal_type = get('DEALTYPE');
    tx.client_name = get('CUSTOMER');
    
    tx.ccode = get('CCODE');
    tx.uccode = get('UCCODE');
    
    // Noga 1 (Initial)
    tx.leg1_date = parseDate(get('VDATE_INITIAL'));
    tx.leg1_ccy1 = get('CCY1');
    tx.leg1_amount1 = parseNumber(get('CCY1AMT_INITIAL'));
    tx.leg1_ccy2 = get('CCY2');
    tx.leg1_amount2 = parseNumber(get('CCY2AMT_INITIAL'));
    
    // Noga 2 (Maturity)
    tx.leg2_date = parseDate(get('VDATE_MATURITY'));
    tx.leg2_ccy1 = get('CCY1'); 
    tx.leg2_amount1 = parseNumber(get('CCY1AMT_MATURITY'));
    tx.leg2_ccy2 = get('CCY2');
    tx.leg2_amount2 = parseNumber(get('CCY2AMT_MATURITY'));
    
    // Dane Raportowe - Kursy
    tx.report_nbp_rate_leg1_ccy1 = parseNumber(get('SPOTRATE_T_1_CCY1_INITIAL'));
    tx.report_nbp_rate_leg1_ccy2 = parseNumber(get('SPOTRATE_T_1_CCY2_INITIAL'));
    tx.report_nbp_rate_leg2_ccy1 = parseNumber(get('SPOTRATE_T_1_CCY1_MATURITY'));
    tx.report_nbp_rate_leg2_ccy2 = parseNumber(get('SPOTRATE_T_1_CCY2_MATURITY'));
    
    // Przeliczenia
    tx.report_pln_amount_leg1_ccy1 = (tx.leg1_amount1 && tx.report_nbp_rate_leg1_ccy1) ? (tx.leg1_amount1 * tx.report_nbp_rate_leg1_ccy1) : null;
    tx.report_pln_amount_leg1_ccy2 = (tx.leg1_amount2 && tx.report_nbp_rate_leg1_ccy2) ? (tx.leg1_amount2 * tx.report_nbp_rate_leg1_ccy2) : null;
    tx.report_pln_amount_leg2_ccy1 = (tx.leg2_amount1 && tx.report_nbp_rate_leg2_ccy1) ? (tx.leg2_amount1 * tx.report_nbp_rate_leg2_ccy1) : null;
    tx.report_pln_amount_leg2_ccy2 = (tx.leg2_amount2 && tx.report_nbp_rate_leg2_ccy2) ? (tx.leg2_amount2 * tx.report_nbp_rate_leg2_ccy2) : null;
    
    tx.report_turnover_vat = parseNumber(get('TURNOVER_VAT'));
    
  } else if (type === 'FORWARD') {
    // Mapowanie dla FX FORWARD
    // Klucze są teraz UPPERCASE!
    tx.fo_dealno = get('FO_DEALNO') || get('KTP_DEALNO'); 
    tx.bo_dealno = get('KTP_DEALNO');
    tx.product_type = get('PRODUCT'); 
    tx.deal_type = get('DEALTYPE'); // Było DealType
    tx.client_name = get('CPTY_SHORTNAME'); // Było Cpty_ShortName
    
    tx.ccode = get('COUNTRIES_NAME'); 
    tx.uccode = null; 
    
    // Noga 1 (Settlement)
    tx.leg1_date = parseDate(get('VALUEDATE')); 
    tx.leg1_ccy1 = get('CURRENCY1'); 
    tx.leg1_amount1 = parseNumber(get('PRINCIPALCUR1'));
    tx.leg1_ccy2 = get('CURRENCY2'); 
    tx.leg1_amount2 = parseNumber(get('PRINCIPALCUR2'));
    
    // Noga 2 (NULL)
    tx.leg2_date = null;
    tx.leg2_ccy1 = null;
    tx.leg2_amount1 = null;
    tx.leg2_ccy2 = null;
    tx.leg2_amount2 = null;
    
    // Dane Raportowe
    tx.report_nbp_rate_leg1_ccy1 = parseNumber(get('SPOTRATE_T_1_CCY'));
    tx.report_nbp_rate_leg1_ccy2 = parseNumber(get('SPOTRATE_T_1_CRTCCY'));
    tx.report_nbp_rate_leg2_ccy1 = null;
    tx.report_nbp_rate_leg2_ccy2 = null;
    
    // Przeliczenia
    tx.report_pln_amount_leg1_ccy1 = (tx.leg1_amount1 && tx.report_nbp_rate_leg1_ccy1) ? (tx.leg1_amount1 * tx.report_nbp_rate_leg1_ccy1) : null;
    tx.report_pln_amount_leg1_ccy2 = (tx.leg1_amount2 && tx.report_nbp_rate_leg1_ccy2) ? (tx.leg1_amount2 * tx.report_nbp_rate_leg1_ccy2) : null;
    tx.report_pln_amount_leg2_ccy1 = null;
    tx.report_pln_amount_leg2_ccy2 = null;
    
    tx.report_turnover_vat = parseNumber(get('TURNOVER_VAT'));
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
