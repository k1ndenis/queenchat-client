import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../lib/redux/hooks';
import { setUser, fetchMe } from '../../lib/redux/slices/userSlice';
import { fetchWithAuth } from '../../lib/api';
import Logo from './Logo';

export default function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const apiUrl = import.meta.env.VITE_API_URL;

    try {
      const response = await fetchWithAuth(`${apiUrl}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        dispatch(setUser(data.user));
        await dispatch(fetchMe());
        navigate('/chat');
      } else {
        setModal({
          isOpen: true,
          title: 'Ошибка входа',
          message: data.error || 'Неверный email или пароль',
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      setModal({
        isOpen: true,
        title: 'Ошибка подключения',
        message: 'Не удалось подключиться к серверу. Проверьте соединение.',
      });
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Logo variant="full" />
            </div>
            <h1 className="text-3xl font-bold text-white">Добро пожаловать</h1>
            <p className="text-purple-200 mt-2">Войдите в свой аккаунт</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all duration-300"
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all duration-300"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
            >
              Войти
            </button>
          </form>
          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/register')}
              className="text-purple-300 hover:text-white transition-colors duration-300 cursor-pointer"
            >
              Нет аккаунта? Зарегистрироваться
            </button>
          </div>
        </div>
      </div>

      {modal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-bold text-white">{modal.title}</h2>
              <p className="text-purple-200 mt-2">{modal.message}</p>
            </div>
            <button
              onClick={closeModal}
              className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}