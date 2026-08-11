import { useRef } from 'react';
import { useAppSelector } from '../lib/redux/hooks';
import { translations } from '../lib/locales';

interface ImageUploaderProps {
  isUploading: boolean;
  selectedCount: number;
  onImagesSelected: (files: File[], previews: string[]) => void;
  onError: (error: string) => void;
}

export default function ImageUploader({ isUploading, selectedCount, onImagesSelected, onError }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const language = useAppSelector(state => state.user.language);
  const t = translations[language as keyof typeof translations];

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (selectedCount + files.length > 10) {
      onError(t.maxTenImages);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const validFiles: File[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        onError(`${t.filePrefix} ${file.name} ${t.notAnImage}`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        onError(`${t.filePrefix} ${file.name} ${t.exceedsSize}`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      onImagesSelected(validFiles, validFiles.map(file => URL.createObjectURL(file)));
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="flex-shrink-0 w-10 h-10 bg-white/10 rounded-xl hover:bg-white/20 transition flex items-center justify-center disabled:opacity-50"
        title={t.images}
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
    </>
  );
}
