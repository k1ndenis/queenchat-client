import { useState, useEffect } from 'react';

interface ImageViewerProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export default function ImageViewer({ images, initialIndex, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [currentImage, setCurrentImage] = useState(images[initialIndex]);

  const goToNext = () => {
    if (currentIndex < images.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      setCurrentImage(images[newIndex]);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      setCurrentImage(images[newIndex]);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images]);

  return (
    <div 
      className="fixed inset-0 z-[100001] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && currentIndex > 0 && (
          <button
            onClick={goToPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 transition bg-black/50 rounded-full w-12 h-12 flex items-center justify-center cursor-pointer"
          >
            ‹
          </button>
        )}
        
        <img 
          src={currentImage} 
          alt="Preview" 
          className="max-w-full max-h-[90vh] object-contain rounded-lg cursor-pointer"
        />
        
        {images.length > 1 && currentIndex < images.length - 1 && (
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 transition bg-black/50 rounded-full w-12 h-12 flex items-center justify-center cursor-pointer"
          >
            ›
          </button>
        )}
        
        {images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
            {currentIndex + 1} / {images.length}
          </div>
        )}
        
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-4xl hover:text-gray-300 transition cursor-pointer"
        >
          ×
        </button>
      </div>
    </div>
  );
}