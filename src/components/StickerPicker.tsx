import { useState } from 'react';
import { stickers } from '../data/stickers';
import { stickerCategories } from '../data/stickerCategories';
import { getStickerName } from '../data/stickerNames';
import { useAppSelector } from '../lib/redux/hooks';
import { translations } from '../lib/locales';

interface StickerPickerProps {
  onSelectSticker: (stickerId: string, emoji: string) => void;
  onClose: () => void;
}

export default function StickerPicker({ onSelectSticker, onClose }: StickerPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('all');
  const language = useAppSelector(state => state.user.language);
  const t = translations[language as keyof typeof translations];
  const categories = stickerCategories[language as keyof typeof stickerCategories];

  const filteredStickers = stickers.filter(sticker => {
    const stickerName = getStickerName(sticker.name, language);
    const matchesSearch = stickerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sticker.emoji.includes(searchTerm);
    
    if (category === 'all') return matchesSearch;
    
    const categoriesMap: Record<string, number[]> = {
      smiles: Array.from({ length: 110 }, (_, i) => i + 1),
      animals: Array.from({ length: 80 }, (_, i) => i + 111),
      food: Array.from({ length: 90 }, (_, i) => i + 191),
      hearts: Array.from({ length: 20 }, (_, i) => i + 281),
      gestures: Array.from({ length: 46 }, (_, i) => i + 301),
      objects: Array.from({ length: 80 }, (_, i) => i + 347),
      transport: Array.from({ length: 38 }, (_, i) => i + 426),
      sports: Array.from({ length: 55 }, (_, i) => i + 464),
      holidays: Array.from({ length: 23 }, (_, i) => i + 519),
    };
    
    const categoryIds = categoriesMap[category] || [];
    return matchesSearch && categoryIds.includes(parseInt(sticker.id));
  });

  return (
    <div className="absolute bottom-16 left-4 right-4 sm:left-4 sm:right-auto sm:w-96 bg-white/10 backdrop-blur-lg rounded-2xl p-4 shadow-xl z-50">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-white text-sm font-semibold">{t.stickers}</h3>
        <button onClick={onClose} className="text-purple-300 hover:text-white">
          ✕
        </button>
      </div>
      
      <input
        type="text"
        placeholder={t.searchStickers}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 mb-3 bg-white/10 border border-purple-300/30 rounded-lg text-white text-sm placeholder-purple-300/50 focus:outline-none focus:border-purple-500"
      />
      
      <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition ${
              category === cat.id
                ? 'bg-purple-500 text-white'
                : 'bg-white/10 text-purple-300 hover:bg-white/20'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>
      
      <div className="grid grid-cols-6 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
        {filteredStickers.map((sticker) => (
          <button
            key={sticker.id}
            onClick={() => onSelectSticker(sticker.id, sticker.emoji)}
            className="text-3xl hover:scale-110 transition-transform p-2 hover:bg-white/10 rounded-xl"
            title={getStickerName(sticker.name, language)}
          >
            {sticker.emoji}
          </button>
        ))}
      </div>
      
      {filteredStickers.length === 0 && (
        <p className="text-center text-purple-300 text-sm py-4">{t.noStickersFound}</p>
      )}
    </div>
  );
}