// components/ChatAvatarEditor.tsx
import { useState, useRef } from 'react';
import { fetchWithAuth } from '../lib/api';
import { useAppSelector } from '../lib/redux/hooks';
import { translations } from '../lib/locales';
import Avatar from './Avatar';
import ImageViewer from './ImageViewer';

interface ChatAvatarEditorProps {
  chatId: string;
  currentAvatar: string | null;
  chatName: string;
  isGroup: boolean;
  isChannel: boolean;
  onAvatarUpdated: (newAvatarUrl: string) => void;
}

export default function ChatAvatarEditor({
  chatId,
  currentAvatar,
  chatName,
  isGroup,
  isChannel,
  onAvatarUpdated
}: ChatAvatarEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiUrl = import.meta.env.VITE_API_URL;
  const language = useAppSelector(state => state.user.language);
  const t = translations[language as keyof typeof translations];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Проверка типа файла
    if (!file.type.startsWith('image/')) {
      alert(t.chooseImage);
      return;
    }

    // Проверка размера (макс 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert(t.imageTooLarge);
      return;
    }

    // Показываем превью
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
  };

  const uploadAvatar = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Сначала загружаем файл
      const uploadResponse = await fetchWithAuth(`${apiUrl}/files/upload-chat-avatar`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(t.imageUploadFailed);
      }

      const { url } = await uploadResponse.json();

      // Затем обновляем чат с новым аватаром
      const updateResponse = await fetchWithAuth(`${apiUrl}/chats/${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ avatar: url }),
      });

      if (!updateResponse.ok) {
        throw new Error(t.chatAvatarUpdateFailed);
      }

      onAvatarUpdated(url);
      setPreviewUrl(null);
      
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert(t.avatarUploadFailed);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    if (!confirm(t.removeAvatarConfirm)) return;

    setIsUploading(true);
    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/${chatId}`, {
        method: 'PATCH',
        body: JSON.stringify({ avatar: null }),
      });

      if (!response.ok) {
        throw new Error(t.avatarRemoveFailed);
      }

      onAvatarUpdated('');
      
    } catch (error) {
      console.error('Error removing avatar:', error);
      alert(t.avatarRemoveFailed);
    } finally {
      setIsUploading(false);
    }
  };

  const cancelPreview = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="relative group">
      {/* Основной аватар */}
      <div className="relative cursor-pointer" onClick={() => currentAvatar && setViewerImage(currentAvatar)}>
        <Avatar
          isGroup={isGroup}
          isChannel={isChannel}
          name={chatName}
          size="xl"
          src={currentAvatar || undefined}
        />
        
        {/* Кнопка редактирования при наведении */}
        <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="text-white text-sm font-medium"
          >
            {currentAvatar ? t.change : t.upload}
          </button>
        </div>
      </div>

      {/* Скрытый input для выбора файла */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Модалка предпросмотра перед загрузкой */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={cancelPreview}>
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-4">{t.avatarPreview}</h3>
            
            <div className="flex justify-center mb-4">
              <img 
                src={previewUrl} 
                alt={t.preview} 
                className="w-32 h-32 rounded-full object-cover"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={uploadAvatar}
                disabled={isUploading}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {isUploading ? t.loading : t.setAvatar}
              </button>
              <button
                onClick={cancelPreview}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка удаления аватара */}
      {currentAvatar && (
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition pointer-events-none group-hover:pointer-events-auto">
          <button
            onClick={removeAvatar}
            className="bg-red-500 text-white text-xs px-3 py-1 rounded-full hover:bg-red-600 transition whitespace-nowrap"
          >
            {t.removeAvatar}
          </button>
        </div>
      )}

      {/* ImageViewer для просмотра аватара в полный размер */}
      {viewerImage && (
        <ImageViewer
          images={[viewerImage]}
          initialIndex={0}
          onClose={() => setViewerImage(null)}
        />
      )}
    </div>
  );
}
