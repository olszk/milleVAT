DROP TABLE IF EXISTS fx_transactions;

CREATE TABLE fx_transactions (
    id SERIAL PRIMARY KEY,
    
    -- Metadane pliku źródłowego
    source_filename TEXT NOT NULL,
    import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    import_batch_id UUID, -- do grupowania jednego wgrania
    
    -- Identyfikacja transakcji
    fo_dealno TEXT,          -- K_DEALNO (SWAP) / FO_DEALNO (FWD)
    bo_dealno TEXT,          -- KTP_DEALNO (SWAP/FWD)
    product_type TEXT,       -- 'FxSwap', 'Forward', 'Spot'
    deal_type TEXT,          -- 'Buy Fwd', 'Sell Fwd'
    client_name TEXT,        -- CUSTOMER / Cpty_ShortName
    
    -- Kraj kontrahenta
    ccode TEXT,              -- CCODE (SWAP) / Countries_Name (FWD)
    uccode TEXT,             -- UCCODE (SWAP)
    
    -- NOGA 1 (Initial / Near Leg / Settlement dla Spot/Fwd)
    leg1_date DATE,
    leg1_ccy1 TEXT,
    leg1_amount1 DECIMAL(20, 4),
    leg1_ccy2 TEXT,
    leg1_amount2 DECIMAL(20, 4),
    leg1_rate DECIMAL(20, 8), -- kurs transakcyjny
    
    -- NOGA 2 (Maturity / Far Leg - NULL dla Spot/Fwd)
    leg2_date DATE,
    leg2_ccy1 TEXT,
    leg2_amount1 DECIMAL(20, 4),
    leg2_ccy2 TEXT,
    leg2_amount2 DECIMAL(20, 4),
    leg2_rate DECIMAL(20, 8), -- kurs transakcyjny
    
    -- --- SEKCJA PODATKOWA (dane z raportu) ---
    -- Kursy NBP z raportu (T-1)
    report_nbp_rate_leg1_ccy1 DECIMAL(20, 8), -- SPOTRATE_T_1_CCY1_INITIAL / SPOTRATE_T_1_CCY
    report_nbp_rate_leg1_ccy2 DECIMAL(20, 8), -- SPOTRATE_T_1_CCY2_INITIAL / SPOTRATE_T_1_CRTCCY
    report_nbp_rate_leg2_ccy1 DECIMAL(20, 8), -- SPOTRATE_T_1_CCY1_MATURITY (tylko SWAP)
    report_nbp_rate_leg2_ccy2 DECIMAL(20, 8), -- SPOTRATE_T_1_CCY2_MATURITY (tylko SWAP)
    
    -- Kwoty przeliczone na PLN wg kursu z raportu
    report_pln_amount_leg1_ccy1 DECIMAL(20, 2), -- Wyliczone: leg1_amount1 * report_nbp_rate_leg1_ccy1
    report_pln_amount_leg1_ccy2 DECIMAL(20, 2), -- Wyliczone: leg1_amount2 * report_nbp_rate_leg1_ccy2
    report_pln_amount_leg2_ccy1 DECIMAL(20, 2), -- Wyliczone: leg2_amount1 * report_nbp_rate_leg2_ccy1
    report_pln_amount_leg2_ccy2 DECIMAL(20, 2), -- Wyliczone: leg2_amount2 * report_nbp_rate_leg2_ccy2
    
    report_turnover_vat DECIMAL(20, 2), -- TURNOVER_VAT z pliku
    
    -- --- SEKCJA AUDYTU PODATKOWEGO (wyliczane przez system) ---
    -- Kursy NBP pobrane z API/Bazy systemowej (T-1)
    audit_nbp_rate_leg1_ccy1 DECIMAL(20, 8),
    audit_nbp_rate_leg1_ccy2 DECIMAL(20, 8),
    audit_nbp_rate_leg2_ccy1 DECIMAL(20, 8),
    audit_nbp_rate_leg2_ccy2 DECIMAL(20, 8),
    
    -- Kwoty przeliczone na PLN wg kursu systemowego
    audit_pln_amount_leg1_ccy1 DECIMAL(20, 2),
    audit_pln_amount_leg1_ccy2 DECIMAL(20, 2),
    audit_pln_amount_leg2_ccy1 DECIMAL(20, 2),
    audit_pln_amount_leg2_ccy2 DECIMAL(20, 2),
    
    audit_turnover_vat DECIMAL(20, 2), -- Wyliczony przez system TURNOVER_VAT
    
    diff_turnover_vat DECIMAL(20, 2), -- Różnica (Raport - Audyt)
    
    -- Flagi weryfikacji
    is_audit_ok BOOLEAN DEFAULT NULL, -- Czy wyliczenia systemowe zgadzają się z raportem
    audit_discrepancy_details TEXT -- Opis różnic, jeśli występują
);

-- Indeksy
CREATE INDEX idx_fx_fo_dealno ON fx_transactions(fo_dealno);
CREATE INDEX idx_fx_dates ON fx_transactions(leg1_date, leg2_date);
CREATE INDEX idx_fx_client ON fx_transactions(client_name);
