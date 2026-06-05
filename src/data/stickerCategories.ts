export const stickerCategories = {
  ru: [
    { id: 'all', name: 'Все' },
    { id: 'smiles', name: '😀 Смайлы' },
    { id: 'animals', name: '🐶 Животные' },
    { id: 'food', name: '🍕 Еда' },
    { id: 'hearts', name: '❤️ Сердца' },
    { id: 'gestures', name: '👋 Жесты' },
    { id: 'objects', name: '🎁 Предметы' },
    { id: 'transport', name: '🚗 Транспорт' },
    { id: 'sports', name: '⚽ Спорт' },
    { id: 'holidays', name: '🎄 Праздники' },
  ],
  en: [
    { id: 'all', name: 'All' },
    { id: 'smiles', name: '😀 Smiles' },
    { id: 'animals', name: '🐶 Animals' },
    { id: 'food', name: '🍕 Food' },
    { id: 'hearts', name: '❤️ Hearts' },
    { id: 'gestures', name: '👋 Gestures' },
    { id: 'objects', name: '🎁 Objects' },
    { id: 'transport', name: '🚗 Transport' },
    { id: 'sports', name: '⚽ Sports' },
    { id: 'holidays', name: '🎄 Holidays' },
  ],
};

export type StickerCategoryKey = keyof typeof stickerCategories;