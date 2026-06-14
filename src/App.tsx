import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from './lib/redux/hooks';
import { fetchMe } from './lib/redux/slices/userSlice';
import { useEffect, useRef } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import ChatList from './components/ChatList';
import ChatRoom from './components/ChatRoom';
import LoadingScreen from './components/LoadingScreen';
import Logo from './components/Logo';
import Profile from './components/Profile';
import Settings from './components/Settings';
import UserProfile from './components/UserProfile';
import ForgotPassword from './components/ForgotPassword';
import {
  requestFCMToken,
  onFCMListener
} from './lib/firebase';

function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="mb-8">
          <Logo variant="full" />
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white text-center mb-4 tracking-tight">
          QueenChat
        </h1>

        <p className="text-base md:text-lg lg:text-xl text-purple-200 text-center max-w-md mb-12 px-4">
          Простой мессенджер в реальном времени. Общайтесь с друзьями без ограничений.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 md:px-8 md:py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-105 text-center cursor-pointer"
          >
            Войти
          </button>
          <button
            onClick={() => navigate('/register')}
            className="px-6 py-2.5 md:px-8 md:py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-300 hover:scale-105 text-center cursor-pointer"
          >
            Зарегистрироваться
          </button>
        </div>

        <p className="mt-12 text-purple-300/50 text-xs md:text-sm">
          Бесплатно • Без рекламы • В реальном времени
        </p>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAppSelector(state => state.user);
  const location = useLocation();
  const dispatch = useAppDispatch();
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      dispatch(fetchMe());
    }
  }, [dispatch]);

  const fcmInitialized = useRef(false);

  useEffect(() => {
    const initFCM = async () => {
      if (!user) return;
      if (fcmInitialized.current) return;

      fcmInitialized.current = true;

      try {
        await requestFCMToken();
        onFCMListener();
      } catch (e) {
        console.error("FCM init error:", e);
      }
    };

    initFCM();
  }, [user]);

  if (loading) {
    return <LoadingScreen />;
  }

  // Добавляем forgot-password в список публичных страниц
  const isPublicPage = location.pathname === '/' || 
                       location.pathname === '/login' || 
                       location.pathname === '/register' ||
                       location.pathname === '/forgot-password';  // ← добавляем сюда
  
  if (!user && !isPublicPage) {
    return <Navigate to="/login" replace />;
  }

  if (user && (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register')) {
    return <Navigate to="/chat" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/chat" element={<ChatList />} />
      <Route path="/chat/:id" element={<ChatRoom />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/user/:userId" element={<UserProfile />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;