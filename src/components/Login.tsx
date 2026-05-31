import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from './../../lib/redux/hooks';
import { setUser } from './../../lib/redux/slices/userSlice';

export default function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const apiUrl = import.meta.env.VITE_API_URL;

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      
      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        dispatch(setUser(data.user));
        navigate('/chat');
      } else {
        alert(data.error || 'Ошибка входа');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Не удалось подключиться к серверу');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-xl mx-auto mb-4 cursor-pointer"
            onClick={() => navigate('/')}
          >
            <span className="text-3xl">💬</span>
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
  );
}