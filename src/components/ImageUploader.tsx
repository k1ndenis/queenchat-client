import { useRef, useState } from 'react';
import { fetchWithAuth } from '../lib/api';

interface ImageUploaderProps {
  chatId: string;
  onImageSent: (message: any) => void;
  onError: (error: string) => void;
}

export default function ImageUploader({ chatId, onImageSent, onError }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiUrl = import.meta.env.VITE_API_URL;

  const sendImage = async (file: File) => {
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadResponse = await fetchWithAuth(`${apiUrl}/files/upload-image/${chatId}`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.detail || 'Failed to upload image');
      }

      const { url } = await uploadResponse.json();

      const messageResponse = await fetchWithAuth(`${apiUrl}/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: url, is_image: true }),
      });

      if (!messageResponse.ok) throw new Error('Failed to send image');

      const data = await messageResponse.json();
      onImageSent(data);

    } catch (error) {
      console.error('Error sending image:', error);
      onError(error instanceof Error ? error.message : 'Не удалось отправить изображение');
    } finally {
      setIsUploading(false);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onError('Можно отправлять только изображения');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      onError('Изображение не должно превышать 10MB');
      return;
    }

    setPreview(URL.createObjectURL(file));
    sendImage(file);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex-shrink-0 w-10 h-10 bg-white/10 rounded-xl hover:bg-white/20 transition flex items-center justify-center"
        title="Изображение"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          className="text-white"
        >
          <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="2.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
      />

      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setPreview(null)}>
          <div className="max-w-[90%] max-h-[90%]" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="Preview" className="max-w-full max-h-[80vh] rounded-lg" />
            <div className="flex justify-center gap-3 mt-4">
              <button
                onClick={() => sendImage(fileInputRef.current?.files?.[0]!)}
                disabled={isUploading}
                className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition"
              >
                {isUploading ? 'Отправка...' : 'Отправить'}
              </button>
              <button
                onClick={() => setPreview(null)}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}