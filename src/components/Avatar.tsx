// components/Avatar.tsx
import React from 'react';

interface AvatarProps {
  name?: string;        // username для отображения буквы
  userId?: string;      // user_id для генерации цвета
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: (e?: React.MouseEvent) => void;
  src?: string;
  isGroup?: boolean;
  isChannel?: boolean;
}

const sizeClasses = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-6 h-6 text-xs',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl'
};

// SVG иконка для группы
const GroupIcon = ({ size = 24 }: { size?: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className="text-white"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

// SVG иконка для канала
const ChannelIcon = ({ size = 24 }: { size?: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className="text-white"
  >
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

export default function Avatar({ 
  name, 
  userId,
  size = 'md', 
  className = '', 
  onClick, 
  src, 
  isGroup,
  isChannel 
}: AvatarProps) {
  // Если есть src, показываем изображение
  if (src) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        className={`rounded-full object-cover ${sizeClasses[size]} ${className}`}
        onClick={onClick ? (e) => onClick(e) : undefined}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      />
    );
  }

  // Для групп показываем иконку группы
  if (isGroup) {
    const iconSize = size === 'xs' ? 16 : size === 'sm' ? 18 : size === 'lg' ? 28 : 24;
    return (
      <div 
        className={`rounded-full bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center shadow-md overflow-hidden flex-shrink-0 ${sizeClasses[size]} ${className}`}
        onClick={onClick ? (e) => onClick(e) : undefined}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        <GroupIcon size={iconSize} />
      </div>
    );
  }

  // Для каналов показываем иконку канала
  if (isChannel) {
    const iconSize = size === 'xs' ? 16 : size === 'sm' ? 18 : size === 'lg' ? 28 : 24;
    return (
      <div 
        className={`rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center shadow-md overflow-hidden flex-shrink-0 ${sizeClasses[size]} ${className}`}
        onClick={onClick ? (e) => onClick(e) : undefined}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        <ChannelIcon size={iconSize} />
      </div>
    );
  }

  // Для пользователей с аватаркой по умолчанию (без фото)
  const getInitial = () => {
    if (!name) return '?';
    // Берем первую букву username, а не UUID
    const firstChar = name.trim().charAt(0).toUpperCase();
    return firstChar;
  };

  // Используем userId для генерации цвета (стабильно)
  const getRandomGradient = (seed: string) => {
    const gradients = [
      'from-pink-500 to-rose-500',
      'from-purple-500 to-indigo-500',
      'from-blue-500 to-cyan-500',
      'from-green-500 to-emerald-500',
      'from-red-500 to-pink-500',
      'from-teal-500 to-green-500',
      'from-indigo-500 to-purple-500',
      'from-violet-500 to-fuchsia-500',
      'from-cyan-500 to-blue-500',
      'from-amber-500 to-yellow-500',
      'from-lime-500 to-green-500',
      'from-rose-500 to-pink-500',
    ];
    
    let hash = 0;
    // Используем userId для seed, если нет то name
    const str = seed || name || 'default';
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return gradients[Math.abs(hash) % gradients.length];
  };

  // Для цвета используем userId (стабильный идентификатор)
  const gradient = getRandomGradient(userId || name);

  return (
    <div 
      className={`rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md overflow-hidden flex-shrink-0 ${sizeClasses[size]} ${className}`}
      onClick={onClick ? (e) => onClick(e) : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <span className="text-white font-bold">{getInitial()}</span>
    </div>
  );
}