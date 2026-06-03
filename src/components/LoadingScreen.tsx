import Logo from './Logo';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl animate-ping"></div>
        <div className="relative animate-pulse">
          <Logo variant="full" />
        </div>
      </div>
    </div>
  );
}