import React, { useState, useEffect } from 'react';
import axios from 'axios';

import { 
  Upload, 
  FileText, 
  BarChart3, 
  Table, 
  ChevronRight, 
  Download, 
  Search,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Coins,
  Building2,
  PieChart,
  Lock,
  User,
  LogOut,
  AlertTriangle
} from 'lucide-react';

// Helper to safely format numbers
const formatNumber = (val, options = {}) => {
  const n = parseFloat(val);
  if (isNaN(n)) return '0,00';
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2,
    ...options 
  });
};

const ReportCard = ({ title, description, icon: Icon, onUpload }) => {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div 
      className={`relative group bg-white p-6 rounded-2xl shadow-sm border-2 border-dashed transition-all duration-300 flex flex-col items-center text-center cursor-pointer
        ${isDragging ? 'border-millennium bg-millennium-light scale-[1.02]' : 'border-gray-100 hover:border-millennium hover:shadow-md'}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer && e.dataTransfer.files[0]) onUpload(e.dataTransfer.files[0]); }}
      onClick={() => {
        const input = document.getElementById(`upload-${title}`);
        if (input) input.click();
      }}
    >
      <input 
        type="file" 
        id={`upload-${title}`} 
        className="hidden" 
        onChange={(e) => { if (e.target.files && e.target.files[0]) onUpload(e.target.files[0]); }}
      />
      <div className={`p-4 rounded-full mb-4 transition-colors duration-300 ${isDragging ? 'bg-white text-millennium' : 'bg-gray-50 text-gray-400 group-hover:bg-millennium-light group-hover:text-millennium'}`}>
        {Icon ? <Icon size={32} strokeWidth={1.5} /> : <Upload size={32} strokeWidth={1.5} />}
      </div>
      <h3 className="font-bold text-gray-900 mb-1 text-sm tracking-wide uppercase">{title || 'Raport'}</h3>
      <p className="text-xs text-gray-500 line-clamp-2">{description || ''}</p>
      
      <div className="mt-4 flex items-center text-millennium font-semibold text-xs opacity-0 group-hover:opacity-100 transition-opacity">
        Załaduj plik <ChevronRight size={14} className="ml-1" />
      </div>
    </div>
  );
};

const StatCard = ({ label, value, subValue, icon: Icon, colorClass }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
    <div>
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      <h3 className={`text-2xl font-bold ${colorClass || 'text-gray-900'}`}>{value || '0'}</h3>
      {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
    </div>
    <div className={`p-2 rounded-lg bg-gray-50 text-gray-400`}>
      {Icon ? <Icon size={20} /> : <BarChart3 size={20} />}
    </div>
  </div>
);

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [transactions, setTransactions] = useState([]);
  const [wssData, setWssData] = useState({ percentage: 0, turnover: 0, total: 0 });
  const [vatTurnover, setVatTurnover] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('milleVatUser');
    const savedPass = localStorage.getItem('milleVatPass');
    if (savedUser && savedPass) {
      setIsLoggedIn(true);
      fetchData(savedUser, savedPass);
    }
  }, []);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoginError('');
    setError(null);
    try {
      await axios.post('/api/login', { username, password });
      
      localStorage.setItem('milleVatUser', username);
      localStorage.setItem('milleVatPass', password);
      setIsLoggedIn(true);
      fetchData(username, password);
    } catch (err) {
      console.error("Login error details:", err);
      const msg = err.response?.status === 401 
        ? 'Nieprawidłowy użytkownik lub hasło' 
        : `Błąd połączenia z serwerem (${err.response?.status || err.message})`;
      setLoginError(msg);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('milleVatUser');
    localStorage.removeItem('milleVatPass');
    setIsLoggedIn(false);
    setTransactions([]);
    setVatTurnover([]);
    setWssData({ percentage: 0, turnover: 0, total: 0 });
    setError(null);
  };

  const fetchData = async (user, pass) => {
    if (!user || !pass) return;
    const config = {
      headers: { 'x-user': user, 'x-password': pass }
    };
    try {
      setError(null);
      const results = await Promise.allSettled([
        axios.get('/api/wss', config),
        axios.get('/api/transactions', config),
        axios.get('/api/vat-turnover', config)
      ]);
      
      if (results[0].status === 'fulfilled') {
        const d = results[0].value.data || {};
        setWssData({
          percentage: parseFloat(d.wss_percentage) || 0,
          turnover: parseFloat(d.turnover_with_deduction) || 0,
          total: parseFloat(d.total_turnover) || 0
        });
      }

      if (results[1].status === 'fulfilled') {
        const data = Array.isArray(results[1].value.data) ? results[1].value.data : [];
        setTransactions(data.map(t => {
          if (!t) return { date: 'N/A', type: 'N/A', amount: 0, vatStatus: 'N/A', isEligible: false };
          return {
            ...t,
            amount: t.amount !== undefined ? parseFloat(t.amount) || 0 : 0
          };
        }));
      }

      if (results[2].status === 'fulfilled') {
        const data = Array.isArray(results[2].value.data) ? results[2].value.data : [];
        setVatTurnover(data.map(item => {
          if (!item) return { type: 'N/A', ue: 0, poza_ue: 0, total: 0 };
          return {
            ...item,
            ue: item.ue !== undefined ? parseFloat(item.ue) || 0 : 0,
            poza_ue: item.poza_ue !== undefined ? parseFloat(item.poza_ue) || 0 : 0,
            total: item.total !== undefined ? parseFloat(item.total) || 0 : 0
          };
        }));
      }
      
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        console.warn("Some data could not be fetched", failed);
      }
    } catch (err) {
      console.error("General error fetching data:", err);
      if (err.response?.status === 401) {
        handleLogout();
      } else {
        setError("Wystąpił błąd podczas pobierania danych z serwera.");
      }
    }
  };

  const handleUpload = async (file, type) => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('reportType', type);

    const savedUser = localStorage.getItem('milleVatUser');
    const savedPass = localStorage.getItem('milleVatPass');

    try {
      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-user': savedUser,
          'x-password': savedPass
        }
      });

      alert(`Sukces! Przetworzono ${response.data.rowsProcessed || 0} wierszy.`);
      fetchData(savedUser, savedPass); 
    } catch (err) {
      console.error('Upload error:', err);
      alert(`Błąd: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#F9F9F9] font-sans flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-10">
            <div className="flex flex-col items-center mb-10">
              <div className="h-16 w-16 bg-millennium rounded-2xl flex items-center justify-center text-white text-3xl font-black mb-6 shadow-lg shadow-millennium/20">M</div>
              <h2 className="text-2xl font-bold text-gray-900">Zaloguj się</h2>
              <p className="text-gray-500 text-sm mt-2 text-center">Dostęp do kalkulatora milleVAT wymaga autoryzacji.</p>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Użytkownik</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-millennium/10 focus:border-millennium outline-none transition-all"
                    placeholder="admin"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Hasło</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-millennium/10 focus:border-millennium outline-none transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {loginError && (
                <div className="p-4 bg-red-50 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-medium border border-red-100">
                  <Lock size={16} />
                  {loginError}
                </div>
              )}

              <button 
                type="submit" 
                className="w-full bg-millennium text-white py-4 rounded-2xl font-bold text-lg hover:bg-millennium-hover transition-all shadow-lg shadow-millennium/20 active:scale-[0.98]"
              >
                Wejdź
              </button>
            </form>
          </div>
          <div className="p-6 bg-gray-50 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400 font-medium tracking-tight">System raportowy Bank Millennium &copy; 2026</p>
          </div>
        </div>
      </div>
    );
  }

  const reportTypes = [
    { title: 'FX FX FORWARD', description: 'Raporty transakcji walutowych typu forward oraz spot.', icon: ArrowRightLeft },
    { title: 'FX SWAP', description: 'Dane dotyczące swapów walutowych i wymiany terminowej.', icon: Coins },
    { title: 'INTERBANK DEPOSITS', description: 'Zestawienia lokat międzybankowych i depozytów rynkowych.', icon: Building2 },
    { title: 'IRS CIRS', description: 'Swapy stóp procentowych oraz swapy walutowo-procentowe.', icon: PieChart }
  ];

  return (
    <div className="min-h-screen bg-[#F9F9F9] font-sans text-gray-900 pb-20">
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-millennium rounded-xl flex items-center justify-center text-white text-xl font-black shadow-md shadow-millennium/10">M</div>
            <span className="text-xl font-bold tracking-tight text-gray-900">mille<span className="text-millennium">VAT</span></span>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium text-gray-500">
            <a href="#" className="hover:text-millennium transition-colors">Dashboard</a>
            <a href="#" className="hover:text-millennium transition-colors">Historia</a>
            <div className="h-6 w-px bg-gray-100 mx-2"></div>
            <div className="flex items-center gap-3">
              <span className="text-gray-700 font-semibold">{username}</span>
              <button 
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-millennium hover:bg-millennium-light rounded-lg transition-all"
                title="Wyloguj się"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 mt-8">
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Kalkulator WSS VAT</h1>
          <p className="text-gray-500">Zarządzaj raportami i wyliczaj współczynnik struktury sprzedaży dla Banku Millennium.</p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-800">
            <AlertTriangle className="flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {reportTypes.map((type) => (
            <ReportCard 
              key={type.title}
              title={type.title}
              description={type.description}
              icon={type.icon}
              onUpload={(file) => handleUpload(file, type.title)}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <StatCard 
            label="Współczynnik WSS" 
            value={`${(wssData.percentage || 0).toFixed(2)}%`} 
            subValue="Kalkulacja za bieżący okres" 
            icon={BarChart3} 
            colorClass="text-millennium" 
          />
          <StatCard 
            label="Obrót opodatkowany" 
            value={`${formatNumber(wssData.turnover)} PLN`} 
            subValue="Podstawa do odliczenia" 
            icon={CheckCircle2} 
            colorClass="text-green-600" 
          />
          <StatCard 
            label="Obrót całkowity" 
            value={`${formatNumber(wssData.total)} PLN`} 
            subValue="Suma wszystkich transakcji" 
            icon={Download} 
            colorClass="text-gray-800" 
          />
        </div>

        {/* NOWY MODUŁ: Obrót VAT wg typów i regionów */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-12">
          <div className="p-6 border-b border-gray-100 bg-gray-50/30">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <PieChart size={22} className="text-millennium" />
              Obrót VAT dla współczynnika
            </h2>
            <p className="text-sm text-gray-500 mt-1">Zestawienie sum obrotu VAT (dodatniego) w podziale na UE i poza UE.</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FDFDFD] text-gray-400 text-[11px] uppercase tracking-[0.1em] font-bold">
                  <th className="px-6 py-4 border-b border-gray-100">Typ transakcji</th>
                  <th className="px-6 py-4 border-b border-gray-100 text-right">Sprzedaż UE (PLN)</th>
                  <th className="px-6 py-4 border-b border-gray-100 text-right">Sprzedaż poza UE (PLN)</th>
                  <th className="px-6 py-4 border-b border-gray-100 text-right bg-gray-50/50">Suma Razem (PLN)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!vatTurnover || vatTurnover.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-12 text-center text-gray-400 italic">Brak danych do zestawienia obrotu</td>
                  </tr>
                ) : (
                  <>
                    {vatTurnover.map((item, idx) => {
                      if (!item) return null;
                      return (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-semibold text-gray-800">{item.type || 'N/A'}</td>
                          <td className="px-6 py-4 text-sm text-right font-mono text-blue-600">{formatNumber(item.ue)}</td>
                          <td className="px-6 py-4 text-sm text-right font-mono text-orange-600">{formatNumber(item.poza_ue)}</td>
                          <td className="px-6 py-4 text-sm text-right font-mono font-bold bg-gray-50/30">{formatNumber(item.total)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50/80 font-bold border-t-2 border-gray-100">
                      <td className="px-6 py-4 text-sm uppercase tracking-wider">Suma całkowita</td>
                      <td className="px-6 py-4 text-sm text-right font-mono text-blue-700">
                        {formatNumber((vatTurnover || []).reduce((sum, item) => sum + (item && item.ue ? item.ue : 0), 0))}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-mono text-orange-700">
                        {formatNumber((vatTurnover || []).reduce((sum, item) => sum + (item && item.poza_ue ? item.poza_ue : 0), 0))}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-mono text-gray-900 bg-gray-100/50">
                        {formatNumber((vatTurnover || []).reduce((sum, item) => sum + (item && item.total ? item.total : 0), 0))}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Table size={22} className="text-millennium" />
                Szczegóły transakcji
              </h2>
              <p className="text-sm text-gray-500 mt-1">Podgląd danych źródłowych wykorzystanych do kalkulacji.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input type="text" placeholder="Szukaj..." className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-millennium/20 outline-none w-64 transition-all" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FDFDFD] text-gray-400 text-[11px] uppercase tracking-[0.1em] font-bold">
                  <th className="px-6 py-4 border-b border-gray-100">Data</th>
                  <th className="px-6 py-4 border-b border-gray-100">Instrument</th>
                  <th className="px-6 py-4 border-b border-gray-100 text-right">Kwota (PLN)</th>
                  <th className="px-6 py-4 border-b border-gray-100">Status VAT</th>
                  <th className="px-6 py-4 border-b border-gray-100 text-center">WSS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!transactions || transactions.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-20 text-center text-gray-400">Brak danych</td>
                  </tr>
                ) : (
                  transactions.map((t, idx) => {
                    if (!t) return null;
                    return (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-600 font-medium">{t.date || 'N/A'}</td>
                        <td className="px-6 py-4"><span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[10px] font-bold uppercase">{t.type || 'N/A'}</span></td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-mono text-right">{formatNumber(t.amount, { minimumFractionDigits: 0 })}</td>
                        <td className="px-6 py-4 text-xs text-gray-600">{t.vatStatus || 'N/A'}</td>
                        <td className="px-6 py-4 text-center">{t.isEligible ? <CheckCircle2 size={14} className="text-green-600 mx-auto" /> : <Clock size={14} className="text-gray-300 mx-auto" />}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {isUploading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center transition-all">
          <div className="w-12 h-12 border-4 border-gray-100 border-t-millennium rounded-full animate-spin mb-4"></div>
          <p className="font-bold text-gray-900">Przetwarzanie...</p>
        </div>
      )}
    </div>
  );
}

export default App;
