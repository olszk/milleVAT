import React, { useState, useEffect } from 'react';
import axios from 'axios';
import logoM from './assets/logo-m.png';
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
  PieChart
} from 'lucide-react';

const ReportCard = ({ title, description, icon: Icon, onUpload }) => {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div 
      className={`relative group bg-white p-6 rounded-2xl shadow-sm border-2 border-dashed transition-all duration-300 flex flex-col items-center text-center cursor-pointer
        ${isDragging ? 'border-millennium bg-millennium-light scale-[1.02]' : 'border-gray-100 hover:border-millennium hover:shadow-md'}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); onUpload(e.dataTransfer.files[0]); }}
      onClick={() => document.getElementById(`upload-${title}`).click()}
    >
      <input 
        type="file" 
        id={`upload-${title}`} 
        className="hidden" 
        onChange={(e) => onUpload(e.target.files[0])}
      />
      <div className={`p-4 rounded-full mb-4 transition-colors duration-300 ${isDragging ? 'bg-white text-millennium' : 'bg-gray-50 text-gray-400 group-hover:bg-millennium-light group-hover:text-millennium'}`}>
        <Icon size={32} strokeWidth={1.5} />
      </div>
      <h3 className="font-bold text-gray-900 mb-1 text-sm tracking-wide uppercase">{title}</h3>
      <p className="text-xs text-gray-500 line-clamp-2">{description}</p>
      
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
      <h3 className={`text-2xl font-bold ${colorClass}`}>{value}</h3>
      {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
    </div>
    <div className={`p-2 rounded-lg bg-gray-50 text-gray-400`}>
      <Icon size={20} />
    </div>
  </div>
);

function App() {
  const [transactions, setTransactions] = useState([]);
  const [wssData, setWssData] = useState({ percentage: 0, turnover: 0, total: 0 });
  const [isUploading, setIsUploading] = useState(false);

  const reportTypes = [
    { 
      title: 'FX FX FORWARD', 
      description: 'Raporty transakcji walutowych typu forward oraz spot.',
      icon: ArrowRightLeft 
    },
    { 
      title: 'FX SWAP', 
      description: 'Dane dotyczące swapów walutowych i wymiany terminowej.',
      icon: Coins 
    },
    { 
      title: 'INTERBANK DEPOSITS', 
      description: 'Zestawienia lokat międzybankowych i depozytów rynkowych.',
      icon: Building2 
    },
    { 
      title: 'IRS CIRS', 
      description: 'Swapy stóp procentowych oraz swapy walutowo-procentowe.',
      icon: PieChart 
    }
  ];

  const handleUpload = (file, type) => {
    if (!file) return;
    setIsUploading(true);
    // Symulacja uploadu
    setTimeout(() => {
      setIsUploading(false);
      alert(`Pomyślnie załadowano raport ${type}: ${file.name}`);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#F9F9F9] font-sans text-gray-900 pb-20">
      {/* Top Bar / Navigation */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoM} alt="Millennium Logo" className="h-10 w-auto object-contain" />
            <span className="text-xl font-bold tracking-tight text-gray-900">mille<span className="text-millennium">VAT</span></span>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium text-gray-500">
            <a href="#" className="hover:text-millennium transition-colors">Dashboard</a>
            <a href="#" className="hover:text-millennium transition-colors">Historia Raportów</a>
            <a href="#" className="hover:text-millennium transition-colors">Konfiguracja</a>
            <div className="h-6 w-px bg-gray-100 mx-2"></div>
            <button className="flex items-center gap-2 text-gray-700 hover:text-millennium">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs">JK</div>
              Jan Kowalski
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 mt-8">
        {/* Hero Section */}
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Kalkulator WSS VAT</h1>
          <p className="text-gray-500">Zarządzaj raportami i wyliczaj współczynnik struktury sprzedaży dla Banku Millennium.</p>
        </div>

        {/* Upload Cards Grid */}
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

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <StatCard 
            label="Współczynnik WSS" 
            value={`${wssData.percentage}%`} 
            subValue="Kalkulacja za bieżący okres"
            icon={BarChart3}
            colorClass="text-millennium"
          />
          <StatCard 
            label="Obrót opodatkowany" 
            value={`${wssData.turnover.toLocaleString()} PLN`} 
            subValue="Podstawa do odliczenia"
            icon={CheckCircle2}
            colorClass="text-green-600"
          />
          <StatCard 
            label="Obrót całkowity" 
            value={`${wssData.total.toLocaleString()} PLN`} 
            subValue="Suma wszystkich transakcji"
            icon={Download}
            colorClass="text-gray-800"
          />
        </div>

        {/* Transactions Table Section */}
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
                <input 
                  type="text" 
                  placeholder="Szukaj transakcji..." 
                  className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-millennium/20 focus:border-millennium transition-all w-64"
                />
              </div>
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                <Download size={16} />
                Eksportuj
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FDFDFD] text-gray-400 text-[11px] uppercase tracking-[0.1em] font-bold">
                  <th className="px-6 py-4 border-b border-gray-100">Data waluty</th>
                  <th className="px-6 py-4 border-b border-gray-100">Instrument</th>
                  <th className="px-6 py-4 border-b border-gray-100">Kontrahent</th>
                  <th className="px-6 py-4 border-b border-gray-100 text-right">Kwota (PLN)</th>
                  <th className="px-6 py-4 border-b border-gray-100">Status VAT</th>
                  <th className="px-6 py-4 border-b border-gray-100 text-center">WSS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-20 text-center">
                      <div className="flex flex-col items-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
                          <FileText size={32} />
                        </div>
                        <p className="text-gray-500 font-medium">Brak danych do wyświetlenia</p>
                        <p className="text-gray-400 text-sm mt-1">Wgraj jeden z powyższych raportów, aby rozpocząć kalkulację.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  transactions.map((t, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4 text-sm text-gray-600 font-medium">{t.date}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[10px] font-bold uppercase">{t.type}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-semibold">{t.client}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-mono text-right">{t.amount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <div className={`w-1.5 h-1.5 rounded-full ${t.isEligible ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                          {t.vatStatus}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {t.isEligible ? (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-50 text-green-600">
                            <CheckCircle2 size={14} />
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-50 text-gray-300">
                            <Clock size={14} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex justify-center">
             <button className="text-sm font-semibold text-millennium hover:text-millennium-hover flex items-center gap-1">
               Pokaż więcej <ChevronRight size={16} />
             </button>
          </div>
        </div>
      </main>

      {/* Global Loading Overlay */}
      {isUploading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center transition-all">
          <div className="w-12 h-12 border-4 border-gray-100 border-t-millennium rounded-full animate-spin mb-4"></div>
          <p className="font-bold text-gray-900">Przetwarzanie raportu...</p>
          <p className="text-gray-500 text-sm mt-1">To może zająć kilka sekund.</p>
        </div>
      )}
    </div>
  );
}

export default App;
