import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from './../lib/redux/hooks';
import { fetchMe } from './../lib/redux/slices/userSlice';
import { useEffect, useRef } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import ChatList from './components/ChatList';
import ChatRoom from './components/ChatRoom';
import LoadingScreen from './components/LoadingScreen';

function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="mb-8">
          <div
            className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-xl cursor-pointer"
            onClick={() => navigate('/')}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="40" 
              height="40" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="white" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-white text-center mb-4">
          QueenChat
        </h1>

        <p className="text-lg md:text-xl text-purple-200 text-center max-w-md mb-12">
          Простой мессенджер в реальном времени. Общайтесь с друзьями без ограничений.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => navigate('/login')}
            className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-105 text-center cursor-pointer"
          >
            Войти
          </button>
          <button
            onClick={() => navigate('/register')}
            className="px-8 py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-300 hover:scale-105 text-center cursor-pointer"
          >
            Зарегистрироваться
          </button>
        </div>

        <p className="mt-12 text-purple-300/50 text-sm">
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

  if (loading) {
    return <LoadingScreen />;
  }

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const isHomePage = location.pathname === '/';
  
  if (!user && !isAuthPage && !isHomePage) {
    return <Navigate to="/login" replace />;
  }

  if (user && (isAuthPage || isHomePage)) {
    return <Navigate to="/chat" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/chat" element={<ChatList />} />
      <Route path="/chat/:id" element={<ChatRoom />} />
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