-- Tabela przechowująca metadane o wgranych raportach
CREATE TABLE IF NOT EXISTS transaction_reports (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    report_type TEXT, -- np. "Wyciąg bankowy", "Raport sprzedaży"
    status TEXT DEFAULT 'pending' -- pending, completed, error
);

-- Tabela przechowująca konfiguracje mapowania dla różnych typów raportów
CREATE TABLE IF NOT EXISTS report_configurations (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL, -- nazwa konfiguracji, np. "Standardowy_CSV_Bank_X"
    mapping JSONB NOT NULL -- obiekt mapujący: { "db_column": "file_column_name" }
);

-- Tabela przechowująca znormalizowane transakcje
CREATE TABLE IF NOT EXISTS raw_transactions (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES transaction_reports(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    net_amount DECIMAL(15, 2) NOT NULL,
    vat_amount DECIMAL(15, 2) DEFAULT 0,
    gross_amount DECIMAL(15, 2),
    transaction_description TEXT,
    vat_code TEXT, -- np. "23%", "8%", "zw", "np"
    is_eligible_for_wss BOOLEAN DEFAULT FALSE, -- czy daje prawo do odliczenia (mianownik/licznik)
    raw_data JSONB -- wszystkie pozostałe kolumny z oryginalnego pliku
);

-- Widok do wyliczania współczynnika WSS
-- WSS = (Sprzedaż dająca prawo do odliczenia) / (Sprzedaż całkowita)
-- Uwaga: Logika w widoku może być później doprecyzowana
CREATE OR REPLACE VIEW v_wss_calculation AS
SELECT 
    SUM(CASE WHEN is_eligible_for_wss = TRUE THEN net_amount ELSE 0 END) as turnover_with_deduction,
    SUM(net_amount) as total_turnover,
    CASE 
        WHEN SUM(net_amount) > 0 
        THEN ROUND(SUM(CASE WHEN is_eligible_for_wss = TRUE THEN net_amount ELSE 0 END) / SUM(net_amount) * 100, 2)
        ELSE 0 
    END as wss_percentage
FROM raw_transactions;
