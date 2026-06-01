import { useState } from 'react';
import { stickers } from '../data/stickers';

interface StickerPickerProps {
  onSelectSticker: (stickerId: string, emoji: string) => void;
  onClose: () => void;
}

export default function StickerPicker({ onSelectSticker, onClose }: StickerPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('все');

  const categories = [
    { id: 'все', name: 'Все' },
    { id: 'смайлы', name: '😀 Смайлы' },
    { id: 'животные', name: '🐶 Животные' },
    { id: 'еда', name: '🍕 Еда' },
    { id: 'сердца', name: '❤️ Сердца' },
    { id: 'жесты', name: '👋 Жесты' },
    { id: 'предметы', name: '🎁 Предметы' },
    { id: 'транспорт', name: '🚗 Транспорт' },
    { id: 'спорт', name: '⚽ Спорт' },
    { id: 'праздники', name: '🎄 Праздники' },
  ];

  const filteredStickers = stickers.filter(sticker => {
    const matchesSearch = sticker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sticker.emoji.includes(searchTerm);
    
    if (category === 'все') return matchesSearch;
    
    const categoriesMap: Record<string, number[]> = {
      'смайлы': Array.from({ length: 110 }, (_, i) => i + 1),
      'животные': Array.from({ length: 80 }, (_, i) => i + 111),
      'еда': Array.from({ length: 90 }, (_, i) => i + 191),
      'сердца': Array.from({ length: 20 }, (_, i) => i + 281),
      'жесты': Array.from({ length: 46 }, (_, i) => i + 301),
      'предметы': Array.from({ length: 80 }, (_, i) => i + 347),
      'транспорт': Array.from({ length: 38 }, (_, i) => i + 426),
      'спорт': Array.from({ length: 55 }, (_, i) => i + 464),
      'праздники': Array.from({ length: 23 }, (_, i) => i + 519),
    };
    
    const categoryIds = categoriesMap[category] || [];
    return matchesSearch && categoryIds.includes(parseInt(sticker.id));
  });

  return (
    <div className="absolute bottom-16 left-4 bg-white/10 backdrop-blur-lg rounded-2xl p-4 w-96 shadow-xl z-50">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-white text-sm font-semibold">Стикеры</h3>
        <button onClick={onClose} className="text-purple-300 hover:text-white">
          ✕
        </button>
      </div>
      
      <input
        type="text"
        placeholder="Поиск стикеров..."
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
      
      <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto">
        {filteredStickers.map((sticker) => (
          <button
            key={sticker.id}
            onClick={() => onSelectSticker(sticker.id, sticker.emoji)}
            className="text-3xl hover:scale-110 transition-transform p-2 hover:bg-white/10 rounded-xl"
            title={sticker.name}
          >
            {sticker.emoji}
          </button>
        ))}
      </div>
      
      {filteredStickers.length === 0 && (
        <p className="text-center text-purple-300 text-sm py-4">Стикеры не найдены</p>
      )}
    </div>
  );
}