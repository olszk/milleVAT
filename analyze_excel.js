const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const files = [
    'research/DPD_FX SWAP_202601.xlsx',
    'research/DPD_FX FX FORWARD_202601.xlsx'
];

console.log('--- RAPORT ANALIZY PLIKÓW EXCEL ---\n');

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
            // Pobierz 5 wierszy z każdego arkusza
            const rows = xlsx.utils.sheet_to_json(ws, { header: 1, range: 0, raw: false }).slice(0, 5);
            rows.forEach((row, i) => console.log(`Row ${i}:`, JSON.stringify(row)));
        });
    } catch (error) {
        console.error(`Błąd podczas przetwarzania pliku ${file}:`, error.message);
    }
});
