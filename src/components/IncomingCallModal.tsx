import { useAppSelector } from '../lib/redux/hooks';
import { translations } from '../lib/locales';

interface IncomingCallModalProps {
  isOpen: boolean;
  callerName: string;
  callerAvatar?: string;
  onAccept: () => void;
  onDecline: () => void;
}

export default function IncomingCallModal({
  isOpen,
  callerName,
  callerAvatar,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  const language = useAppSelector(state => state.user.language);
  const t = translations[language as keyof typeof translations];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100]">
      <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-3xl p-8 w-full max-w-sm mx-4 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-4">
            {callerAvatar ? (
              <img 
                src={callerAvatar} 
                alt={callerName}
                className="w-full h-full rounded-full object-cover border-4 border-purple-500"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center border-4 border-purple-500">
                <span className="text-3xl text-white font-bold">
                  {callerName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-slate-900 animate-pulse" />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-1">{callerName}</h2>
          <p className="text-purple-300 text-sm mb-6">{t.incomingVideoCall}</p>
          
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={onDecline}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 transition-all duration-200 flex items-center justify-center shadow-lg shadow-red-500/30 hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </button>
            
            <button
              onClick={onAccept}
              className="w-16 h-16 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 transition-all duration-200 flex items-center justify-center shadow-lg shadow-green-500/30 hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
