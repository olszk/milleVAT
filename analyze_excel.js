const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const files = [
    'research/DPD_FX SWAP_202601.xlsx',
    'research/DPD_FX FX FORWARD_202601.xlsx'
];

console.log('--- RAPORT ANALIZY PLIKÓW EXCEL ---\n');

// Symulacja logiki wykrywania nagłówka z backendu
function simulateHeaderDetection(ws) {
    const rawMatrix = xlsx.utils.sheet_to_json(ws, { header: 1 });
    console.log(`\n[DEBUG] Próba wykrycia nagłówka (max 20 wierszy):`);
    
    for (let i = 0; i < Math.min(rawMatrix.length, 20); i++) {
        const row = rawMatrix[i] || [];
        const rowStr = JSON.stringify(row).toUpperCase();
        console.log(`Wiersz ${i}: ${rowStr}`);
        
        // Warunek z backendu
        if ((rowStr.includes('DEALNO') || rowStr.includes('K_DEALNO')) && rowStr.includes('PRODUCT')) {
            console.log(`>>> SUKCES: Znaleziono nagłówek w wierszu ${i}`);
            return i;
        }
    }
    console.log(`>>> BŁĄD: Nie znaleziono nagłówka!`);
    return -1;
}

files.forEach(file => {
    try {
        const filePath = path.resolve(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
            console.log(`[BŁĄD] Plik nie istnieje: ${file}`);
            return;
        }

        console.log(`\n### Analiza pliku: ${path.basename(file)}`);
        const workbook = xlsx.readFile(filePath);
        console.log(`Dostępne arkusze: ${workbook.SheetNames.join(', ')}`);
        
        // Sprawdźmy każdy arkusz
        workbook.SheetNames.forEach(name => {
            console.log(`\n--- Arkusz: ${name} ---`);
            const ws = workbook.Sheets[name];
            simulateHeaderDetection(ws);
        });
    } catch (error) {
        console.error(`Błąd podczas przetwarzania pliku ${file}:`, error.message);
    }
});
