import { useState, useEffect, useRef } from 'react';
import { useAppSelector } from '../lib/redux/hooks';
import { translations } from '../lib/locales';

interface CountryCode {
  code: string;
  flag: string;
  mask: string;
  length: number;
}

const countryCodes: CountryCode[] = [
  { code: '+7', flag: '🇷🇺', mask: 'XXX XXX XX XX', length: 10 },
  { code: '+7', flag: '🇰🇿', mask: 'XXX XXX XX XX', length: 10 },
  { code: '+380', flag: '🇺🇦', mask: 'XX XXX XXXX', length: 9 },
  { code: '+375', flag: '🇧🇾', mask: 'XX XXX XXXX', length: 9 },
  { code: '+998', flag: '🇺🇿', mask: 'XX XXX XXXX', length: 9 },
  { code: '+996', flag: '🇰🇬', mask: 'XXX XXX XXX', length: 9 },
  { code: '+992', flag: '🇹🇯', mask: 'XX XXX XXXX', length: 9 },
  { code: '+993', flag: '🇹🇲', mask: 'XX XXX XXXX', length: 8 },
  { code: '+994', flag: '🇦🇿', mask: 'XX XXX XX XX', length: 9 },
  { code: '+995', flag: '🇬🇪', mask: 'XXX XXX XXX', length: 9 },
  { code: '+373', flag: '🇲🇩', mask: 'XX XXX XXXX', length: 8 },
  { code: '+374', flag: '🇦🇲', mask: 'XX XXX XXXX', length: 8 },
  { code: '+370', flag: '🇱🇹', mask: 'XX XXX XXXX', length: 8 },
  { code: '+371', flag: '🇱🇻', mask: 'XX XXX XXXX', length: 8 },
  { code: '+372', flag: '🇪🇪', mask: 'XXXX XXXX', length: 7 },
  { code: '+44', flag: '🇬🇧', mask: 'XXXX XXX XXX', length: 10 },
  { code: '+49', flag: '🇩🇪', mask: 'XXXX XXX XXXX', length: 11 },
  { code: '+33', flag: '🇫🇷', mask: 'X XX XX XX XX', length: 9 },
  { code: '+34', flag: '🇪🇸', mask: 'XXX XX XX XX', length: 9 },
  { code: '+39', flag: '🇮🇹', mask: 'XXX XXX XXXX', length: 10 },
  { code: '+48', flag: '🇵🇱', mask: 'XXX XXX XXX', length: 9 },
  { code: '+1', flag: '🇺🇸', mask: 'XXX XXX XXXX', length: 10 },
  { code: '+55', flag: '🇧🇷', mask: 'XX XXXXX XXXX', length: 11 },
  { code: '+86', flag: '🇨🇳', mask: 'XXX XXXX XXXX', length: 11 },
  { code: '+81', flag: '🇯🇵', mask: 'XX XXXX XXXX', length: 10 },
  { code: '+82', flag: '🇰🇷', mask: 'XXX XXXX XXXX', length: 10 },
  { code: '+91', flag: '🇮🇳', mask: 'XXXXX XXXXX', length: 10 },
];

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function PhoneInput({ value, onChange, className = '' }: PhoneInputProps) {
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(countryCodes[0]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const language = useAppSelector(state => state.user.language);
  const t = translations[language as keyof typeof translations];

  useEffect(() => {
    const matched = countryCodes.find(c => value.startsWith(c.code));
    if (matched) {
      setSelectedCountry(matched);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCountries = countryCodes.filter(c => 
    c.code.includes(searchQuery) || 
    c.flag.includes(searchQuery)
  );

  const handleSelect = (country: CountryCode) => {
    setSelectedCountry(country);
    onChange(country.code);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (raw.length > selectedCountry.length) {
      raw = raw.slice(0, selectedCountry.length);
    }
    onChange(`${selectedCountry.code}${raw}`);
  };

  const getDisplayValue = () => {
    return value.replace(selectedCountry.code, '');
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      {/* Кастомный выпадающий список */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-24 flex-shrink-0 px-2 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center focus:outline-none focus:border-purple-500 hover:bg-white/20 transition flex items-center justify-between gap-1"
        >
          <span>{selectedCountry.flag} {selectedCountry.code}</span>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="12" 
            height="12" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-white/20 rounded-xl shadow-xl z-50 max-h-64 overflow-hidden">
            <div className="p-2 border-b border-white/10">
              <input
                type="text"
                placeholder={t.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-purple-300/50 focus:outline-none focus:border-purple-500"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-48">
              {filteredCountries.map((country, index) => (
                <button
                  key={`${country.code}-${index}`}
                  type="button"
                  onClick={() => handleSelect(country)}
                  className={`w-full px-3 py-2 text-left text-white hover:bg-white/20 transition flex items-center gap-2 ${
                    selectedCountry.code === country.code ? 'bg-purple-500/30' : ''
                  }`}
                >
                  <span className="text-lg">{country.flag}</span>
                  <span>{country.code}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <input
        type="tel"
        value={getDisplayValue()}
        onChange={handleNumberChange}
        placeholder={selectedCountry.mask}
        className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all duration-300"
      />
    </div>
  );
}
