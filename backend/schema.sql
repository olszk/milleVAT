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

// Widok do wyliczania współczynnika WSS (na podstawie nowej tabeli fx_transactions)
// WSS = (Sprzedaż dająca prawo do odliczenia) / (Sprzedaż całkowita)
CREATE OR REPLACE VIEW v_wss_calculation AS
SELECT 
    -- Sumujemy przeliczone kwoty PLN z raportu (można zmienić na audit_pln_... w przyszłości)
    SUM(COALESCE(report_pln_amount_leg1_ccy1, 0) + COALESCE(report_pln_amount_leg1_ccy2, 0) + COALESCE(report_pln_amount_leg2_ccy1, 0) + COALESCE(report_pln_amount_leg2_ccy2, 0)) as total_turnover,
    
    -- Tutaj placeholder dla "opodatkowanej" - na razie zakładamy, że to suma wszystkiego
    -- W przyszłości trzeba dodać logikę is_eligible_for_wss
    SUM(COALESCE(report_turnover_vat, 0)) as turnover_with_deduction, 
    
    CASE 
        WHEN SUM(COALESCE(report_pln_amount_leg1_ccy1, 0)) > 0 
        THEN ROUND(SUM(COALESCE(report_turnover_vat, 0)) / SUM(COALESCE(report_pln_amount_leg1_ccy1, 0)) * 100, 2)
        ELSE 0 
    END as wss_percentage
FROM fx_transactions;
