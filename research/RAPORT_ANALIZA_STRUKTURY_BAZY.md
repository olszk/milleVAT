# Raport Analizy Struktury Raportów FX i Propozycja Bazy Danych (Zaktualizowany v2)

## 1. Założenia Ogólne
Tabela `fx_transactions` w bazie PostgreSQL integruje dane z raportów FX SWAP i FX FORWARD.
Kluczowe identyfikatory zostały ujednolicone:
*   `FO_DEALNO`: Numer dealu Front Office (źródło: `K_DEALNO` dla SWAP, `FO_DEALNO` dla FWD).
*   `BO_DEALNO`: Numer dealu Back Office (źródło: `KTP_DEALNO` dla obu).
*   `CCODE`: Kod kraju kontrahenta (źródło: `CCODE` dla SWAP, `Countries_Name` dla FWD).
*   `UCCODE`: Kod kraju UBO (źródło: `UCCODE` dla SWAP).

---

## 2. Schemat Bazy Danych (Tabela `fx_transactions`)

### Identyfikacja i Kontrahent
| Kolumna DB | Źródło (SWAP) | Źródło (FWD) |
|---|---|---|
| `fo_dealno` | `K_DEALNO` | `FO_DEALNO` |
| `bo_dealno` | `KTP_DEALNO` | `KTP_DEALNO` |
| `product_type` | `PRODUCT` | `PRODUCT` |
| `deal_type` | `DEALTYPE` | `DealType` |
| `client_name` | `CUSTOMER` | `Cpty_ShortName` |
| `ccode` | `CCODE` | `Countries_Name` |
| `uccode` | `UCCODE` | *NULL* |

### Sekcja Podatkowa (Dane z Raportu)
Wartości w tej sekcji pochodzą bezpośrednio z pliku Excel. Kwoty PLN są przeliczane na podstawie kursów (`SPOTRATE`) zawartych w raporcie.

| Kolumna DB | Opis | Źródło / Logika |
|---|---|---|
| `report_nbp_rate_leg1_ccy1` | Kurs NBP z raportu (Leg1 Ccy1) | `SPOTRATE_T_1_CCY1_INITIAL` / `SPOTRATE_T_1_CCY` |
| `report_nbp_rate_leg1_ccy2` | Kurs NBP z raportu (Leg1 Ccy2) | `SPOTRATE_T_1_CCY2_INITIAL` / `SPOTRATE_T_1_CRTCCY` |
| `report_nbp_rate_leg2_ccy1` | Kurs NBP z raportu (Leg2 Ccy1) | `SPOTRATE_T_1_CCY1_MATURITY` / *NULL* |
| `report_nbp_rate_leg2_ccy2` | Kurs NBP z raportu (Leg2 Ccy2) | `SPOTRATE_T_1_CCY2_MATURITY` / *NULL* |
| `report_pln_amount_leg1_ccy1` | Kwota 1 w PLN (Raport) | `leg1_amount1` * `report_nbp_rate_leg1_ccy1` |
| `report_pln_amount_leg1_ccy2` | Kwota 2 w PLN (Raport) | `leg1_amount2` * `report_nbp_rate_leg1_ccy2` |
| `report_pln_amount_leg2_ccy1` | Kwota 1 w PLN (Raport) | `leg2_amount1` * `report_nbp_rate_leg2_ccy1` |
| `report_pln_amount_leg2_ccy2` | Kwota 2 w PLN (Raport) | `leg2_amount2` * `report_nbp_rate_leg2_ccy2` |
| `report_turnover_vat` | Obrót VAT z raportu | `TURNOVER_VAT` |

### Sekcja Audytu Podatkowego (System MilleVAT)
Wartości w tej sekcji są wyliczane przez system na podstawie niezależnych tabel kursowych NBP.

| Kolumna DB | Opis | Logika |
|---|---|---|
| `audit_nbp_rate_...` | Kursy NBP z bazy systemowej | Pobierane z tabeli kursowej dla T-1 |
| `audit_pln_amount_...` | Kwoty przeliczone przez system | `amount` * `audit_nbp_rate` |
| `audit_turnover_vat` | Obrót VAT wyliczony przez system | Wyliczany wg algorytmu WSS |
| `diff_turnover_vat` | Różnica (Raport vs Audyt) | `report_turnover_vat` - `audit_turnover_vat` |
| `is_audit_ok` | Status weryfikacji | `TRUE` jeśli różnica = 0 (z tolerancją) |

---

## 3. Logika Importu
System automatycznie rozpoznaje typ pliku i stosuje odpowiednie mapowanie kolumn oraz wykonuje przeliczenia walutowe dla sekcji `report_...` w trakcie importu.
