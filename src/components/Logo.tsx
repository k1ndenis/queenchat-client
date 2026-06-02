import { useNavigate } from 'react-router-dom';

interface LogoProps {
  variant?: 'icon' | 'full';
  className?: string;
}

export default function Logo({ variant = 'full', className = '' }: LogoProps) {
  const navigate = useNavigate();

  const variants = {
    icon: {
      container: 'w-14 h-14',
      image: 'w-12 h-12',
    },
    full: {
      container: 'w-40 h-40 md:w-48 md:h-48',
      image: 'w-32 h-32 md:w-40 md:h-40',
    }
  };

  return (
    <div 
      className={`cursor-pointer ${className}`}
      onClick={() => navigate('/')}
    >
      <div className={`
        ${variants[variant].container}
        bg-white/30 backdrop-blur-sm
        rounded-2xl flex items-center justify-center 
        shadow-lg hover:scale-105 hover:bg-white/40
        transition-all duration-200
        border border-white/40
      `}>
        <img
          src="/logo.png"
          alt="QueenChat"
          className={`${variants[variant].image} object-contain`}
        />
      </div>
    </div>
  );
}