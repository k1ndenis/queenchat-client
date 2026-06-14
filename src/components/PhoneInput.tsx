import { useState, useEffect } from 'react';

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

  useEffect(() => {
    const matched = countryCodes.find(c => value.startsWith(c.code));
    if (matched) {
      setSelectedCountry(matched);
    }
  }, [value]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = countryCodes.find(c => c.code === e.target.value);
    if (newCountry) {
      setSelectedCountry(newCountry);
      onChange(newCountry.code);
    }
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
      <select
        value={selectedCountry.code}
        onChange={handleCodeChange}
        className="w-20 flex-shrink-0 px-2 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center focus:outline-none focus:border-purple-500"
      >
        {countryCodes.map((country, index) => (
          <option key={`${country.code}-${index}`} value={country.code}>
            {country.flag} {country.code}
          </option>
        ))}
      </select>
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