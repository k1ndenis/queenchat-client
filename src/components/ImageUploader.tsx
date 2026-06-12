import { useRef, useState } from 'react';
import { fetchWithAuth } from '../lib/api';

interface ImageUploaderProps {
  chatId: string;
  onImagesUploaded: (urls: string[]) => void;
  onError: (error: string) => void;
}

export default function ImageUploader({ chatId, onImagesUploaded, onError }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiUrl = import.meta.env.VITE_API_URL;

  const uploadImages = async (files: File[]) => {
    setIsUploading(true);

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const uploadResponse = await fetchWithAuth(`${apiUrl}/files/upload-images`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.detail || 'Failed to upload images');
      }

      const { urls, errors } = await uploadResponse.json();
      
      if (errors) {
        console.warn('Upload errors:', errors);
      }
      
      if (urls.length > 0) {
        onImagesUploaded(urls);
      }

    } catch (error) {
      console.error('Error uploading images:', error);
      onError(error instanceof Error ? error.message : 'Не удалось отправить изображения');
    } finally {
      setIsUploading(false);
      setPreviews([]);
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    if (files.length > 10) {
      onError('Можно отправить не более 10 изображений за раз');
      return;
    }
    
    const validFiles: File[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        onError(`Файл ${file.name} не является изображением`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        onError(`Файл ${file.name} превышает 10MB`);
        continue;
      }
      validFiles.push(file);
    }
    
    if (validFiles.length === 0) return;
    
    const newPreviews = validFiles.map(file => URL.createObjectURL(file));
    setPreviews(newPreviews);
    setSelectedFiles(validFiles);
  };

  const confirmSend = () => {
    if (selectedFiles.length > 0) {
      uploadImages(selectedFiles);
    }
  };

  const cancelPreview = () => {
    setPreviews([]);
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="flex-shrink-0 w-10 h-10 bg-white/10 rounded-xl hover:bg-white/20 transition flex items-center justify-center disabled:opacity-50"
        title="Изображения"
      >
        {isUploading ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="2.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageSelect}
        className="hidden"
      />

      {previews.length > 0 && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={cancelPreview}>
          <div className="max-w-[90%] max-h-[90%] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
              {previews.map((preview, idx) => (
                <img 
                  key={idx}
                  src={preview} 
                  alt={`Preview ${idx + 1}`} 
                  className="w-32 h-32 object-cover rounded-lg"
                />
              ))}
            </div>
            <div className="flex justify-center gap-3 mt-4">
              <button
                onClick={confirmSend}
                disabled={isUploading}
                className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition"
              >
                {isUploading ? 'Отправка...' : `Отправить (${previews.length})`}
              </button>
              <button
                onClick={cancelPreview}
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