import type { Message } from '../types/message';

type Language = 'ru' | 'en';
type PreviewOptions = { includeDuration?: boolean; noMessagesLabel?: string; deletedLabel?: string };
type PreviewMessage = Partial<Pick<Message, 'content' | 'deleted_at' | 'is_image' | 'images' | 'is_sticker' | 'media'>>;

const labels = {
  ru: { voice: '🎤 Голосовое сообщение', video: '◉ Видеосообщение', image: '📷 Фото', sticker: 'Стикер', deleted: 'Сообщение удалено', empty: 'Нет сообщений' },
  en: { voice: '🎤 Voice message', video: '◉ Video message', image: '📷 Photo', sticker: 'Sticker', deleted: 'Message deleted', empty: 'No messages' },
} as const;
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function getMessagePreview(message: PreviewMessage | null | undefined, language: Language, options: PreviewOptions = {}) {
  const text = labels[language];
  if (!message) return options.noMessagesLabel ?? text.empty;
  if (message.deleted_at) return options.deletedLabel ?? text.deleted;
  if (message.media?.type === 'voice' || message.media?.type === 'video_note') {
    const label = message.media.type === 'voice' ? text.voice : text.video;
    const duration = message.media.duration;
    return options.includeDuration && Number.isFinite(duration) && duration > 0 ? `${label} · ${formatDuration(duration)}` : label;
  }
  const content = (message.content || '').trim();
  const legacyImageContent = content.startsWith('/uploads/') || content.startsWith('["/uploads/');
  if (content && !(message.is_image && legacyImageContent)) return content;
  if (message.is_image || (Array.isArray(message.images) && message.images.length > 0)) return text.image;
  if (message.is_sticker) return text.sticker;
  return options.noMessagesLabel ?? text.empty;
}
