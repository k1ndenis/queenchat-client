// components/CodeInput.tsx
import { useState, useRef, useEffect } from 'react';

interface CodeInputProps {
  length?: number;
  onComplete: (code: string) => void;
  className?: string;
}

export default function CodeInput({ length = 6, onComplete, className = '' }: CodeInputProps) {
  const [code, setCode] = useState<string[]>(Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Фокус на первый инпут при монтировании
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    
    // Переход к следующему полю
    if (value && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Проверка на заполнение всех полей
    if (newCode.every(c => c !== '')) {
      onComplete(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').slice(0, length);
    const chars = pasted.split('');
    const newCode = [...code];
    
    for (let i = 0; i < chars.length && i < length; i++) {
      if (/\d/.test(chars[i])) {
        newCode[i] = chars[i];
      }
    }
    
    setCode(newCode);
    
    if (newCode.every(c => c !== '')) {
      onComplete(newCode.join(''));
    }
    
    // Фокус на последнее заполненное поле
    const lastFilled = Math.min(chars.length, length) - 1;
    if (lastFilled >= 0) {
      inputRefs.current[lastFilled]?.focus();
    }
  };

  const setRef = (index: number) => (el: HTMLInputElement | null) => {
    inputRefs.current[index] = el;
  };

  return (
    <div className={`flex gap-2 justify-center ${className}`} onPaste={handlePaste}>
      {code.map((digit, index) => (
        <input
          key={index}
          ref={setRef(index)}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className="w-12 h-12 sm:w-14 sm:h-14 text-center text-xl font-semibold bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all duration-300"
        />
      ))}
    </div>
  );
}