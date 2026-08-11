import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';

const MAX_SOURCE_DIMENSION = 4096;
const MAX_AVATAR_DIMENSION = 512;

type AvatarCropModalProps = {
  file: File;
  language: string;
  onCancel: () => void;
  onSave: (file: File) => Promise<void> | void;
};

async function normaliseImage(file: File): Promise<string> {
  // createImageBitmap applies the phone's EXIF orientation before the cropper
  // sees the image. The canvas also keeps very large camera photos manageable.
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SOURCE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (blob) return URL.createObjectURL(blob);
  }

  return URL.createObjectURL(file);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to prepare image'));
    image.src = source;
  });
}

export default function AvatarCropModal({ file, language, onCancel, onSave }: AvatarCropModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [prepareError, setPrepareError] = useState('');
  const isRussian = language === 'ru';

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    normaliseImage(file)
      .then(result => {
        url = result;
        if (active) setImageUrl(result);
        else URL.revokeObjectURL(result);
      })
      .catch(() => active && setPrepareError(isRussian ? 'Не удалось обработать изображение' : 'Unable to prepare the image'));

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, isRussian]);

  const handleCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!imageUrl || !croppedAreaPixels) return;
    setIsSaving(true);
    setPrepareError('');

    try {
      const image = await loadImage(imageUrl);
      const size = Math.max(1, Math.min(MAX_AVATAR_DIMENSION, Math.round(Math.min(croppedAreaPixels.width, croppedAreaPixels.height))));
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        size,
        size,
      );
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
      if (!blob) throw new Error('Unable to create avatar');
      await onSave(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    } catch (error) {
      setPrepareError(error instanceof Error ? error.message : (isRussian ? 'Не удалось подготовить аватар' : 'Unable to prepare avatar'));
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-md sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={isRussian ? 'Настройте фото' : 'Adjust photo'}>
      <div className="w-full max-w-lg rounded-t-3xl border border-white/20 bg-gradient-to-br from-slate-800/95 via-purple-950/95 to-slate-900/95 p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <h2 className="text-center text-xl font-semibold text-white">{isRussian ? 'Настройте фото' : 'Adjust photo'}</h2>
        <p className="mt-1 text-center text-sm text-purple-200">{isRussian ? 'Перемещайте фото и выберите нужную область' : 'Move and zoom to choose the visible area'}</p>

        <div className="relative mx-auto mt-5 aspect-square w-full max-w-[min(78vh,420px)] overflow-hidden rounded-3xl bg-slate-950/80 touch-none">
          {imageUrl ? (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              minZoom={1}
              maxZoom={4}
              zoomSpeed={0.12}
              restrictPosition
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-purple-200">{prepareError || (isRussian ? 'Подготавливаем фото…' : 'Preparing photo…')}</div>
          )}
        </div>

        <label className="mt-5 block text-sm font-medium text-purple-100">
          {isRussian ? 'Масштаб' : 'Zoom'}
          <input
            type="range"
            min="1"
            max="4"
            step="0.01"
            value={zoom}
            onChange={event => setZoom(Number(event.target.value))}
            disabled={!imageUrl || isSaving}
            className="mt-3 w-full accent-pink-500 disabled:opacity-50"
          />
        </label>
        {prepareError && imageUrl && <p className="mt-3 text-center text-sm text-red-300">{prepareError}</p>}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} disabled={isSaving} className="flex-1 rounded-xl bg-white/10 px-4 py-3 font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">
            {isRussian ? 'Отмена' : 'Cancel'}
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={!imageUrl || !croppedAreaPixels || isSaving} className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-3 font-semibold text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? (isRussian ? 'Сохранение…' : 'Saving…') : (isRussian ? 'Сохранить' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
