import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../lib/api';
import Logo from './Logo';
import PhoneInput from './PhoneInput';
import CodeInput from './CodeInput';
import Captcha from './Captcha';
import { translations } from '../lib/locales';
import { useAppSelector } from '../lib/redux/hooks';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'code' | 'password'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  
  const language = useAppSelector(state => state.user.language);
  const t = translations[language as keyof typeof translations];

  const closeModal = () => {
    const wasSuccess = modal.title === 'Успешно';
    setModal({ isOpen: false, title: '', message: '' });
    if (wasSuccess) {
      navigate('/login');
    }
  };

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !captchaToken) return;
    
    setLoading(true);
    const apiUrl = import.meta.env.VITE_API_URL;

    try {
      const response = await fetchWithAuth(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        body: JSON.stringify({ phone, captcha_token: captchaToken }),
      });
      
      if (response.ok) {
        setStep('code');
      } else {
        const data = await response.json();
        setModal({
          isOpen: true,
          title: 'Ошибка',
          message: data.detail || 'Не удалось отправить код',
        });
        setCaptchaToken(''); // Сбросить капчу
      }
    } catch (error) {
      console.error('Send code error:', error);
      setModal({
        isOpen: true,
        title: t.connectionError,
        message: t.connectionErrorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (enteredCode: string) => {
    setCode(enteredCode);
    setLoading(true);
    const apiUrl = import.meta.env.VITE_API_URL;
    
    try {
      const response = await fetchWithAuth(`${apiUrl}/auth/verify-reset-code`, {
        method: 'POST',
        body: JSON.stringify({ phone, code: enteredCode }),
      });
      
      if (response.ok) {
        setStep('password');
      } else {
        const data = await response.json();
        setModal({
          isOpen: true,
          title: 'Ошибка',
          message: data.detail || 'Неверный код',
        });
      }
    } catch (error) {
      console.error('Verify code error:', error);
      setModal({
        isOpen: true,
        title: t.connectionError,
        message: t.connectionErrorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (newPassword !== confirmPassword) {
      setModal({
        isOpen: true,
        title: 'Ошибка',
        message: 'Пароли не совпадают',
      });
      return;
    }
    
    if (newPassword.length < 6) {
      setModal({
        isOpen: true,
        title: 'Ошибка',
        message: 'Пароль должен быть не менее 6 символов',
      });
      return;
    }
    
    setLoading(true);
    const apiUrl = import.meta.env.VITE_API_URL;
    
    try {
      const response = await fetchWithAuth(`${apiUrl}/auth/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ phone, code, new_password: newPassword }),
      });
      
      if (response.ok) {
        setModal({
          isOpen: true,
          title: 'Успешно',
          message: 'Пароль успешно изменен. Войдите с новым паролем.',
        });
      } else {
        const data = await response.json();
        setModal({
          isOpen: true,
          title: 'Ошибка',
          message: data.detail || 'Не удалось сбросить пароль',
        });
      }
    } catch (error) {
      console.error('Reset error:', error);
      setModal({
        isOpen: true,
        title: t.connectionError,
        message: t.connectionErrorMessage,
      });
    } finally {
      setLoading(false);
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
            <h1 className="text-3xl font-bold text-white">Восстановление пароля</h1>
            <p className="text-purple-200 mt-2">
              {step === 'phone' && 'Введите номер телефона'}
              {step === 'code' && 'Введите код из SMS'}
              {step === 'password' && 'Придумайте новый пароль'}
            </p>
          </div>

          {step === 'phone' && (
            <form onSubmit={sendCode} className="space-y-4">
              <PhoneInput
                value={phone}
                onChange={setPhone}
              />
              <Captcha
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken('')}
              />
              <button
                type="submit"
                disabled={loading || !phone || !captchaToken}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Отправка...' : 'Получить код'}
              </button>
            </form>
          )}

          {step === 'code' && (
            <div className="space-y-6">
              <CodeInput
                length={6}
                onComplete={verifyCode}
              />
              <p className="text-purple-300 text-sm text-center">
                Код отправлен на {phone}
              </p>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="w-full py-2 text-purple-300 hover:text-white transition-colors duration-300 cursor-pointer"
              >
                Назад
              </button>
            </div>
          )}

          {step === 'password' && (
            <div className="space-y-4">
              <div>
                <input
                  type="password"
                  placeholder="Новый пароль"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all duration-300"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Подтвердите пароль"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all duration-300"
                />
              </div>
              <button
                onClick={resetPassword}
                disabled={loading || !newPassword || newPassword !== confirmPassword}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Сброс...' : 'Сбросить пароль'}
              </button>
              <button
                type="button"
                onClick={() => setStep('code')}
                className="w-full py-2 text-purple-300 hover:text-white transition-colors duration-300 cursor-pointer"
              >
                Назад
              </button>
            </div>
          )}

          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/login')}
              className="text-purple-300 hover:text-white transition-colors duration-300 cursor-pointer"
            >
              Вернуться ко входу
            </button>
          </div>
        </div>
      </div>

      {modal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`bg-gradient-to-br rounded-2xl p-6 w-full max-w-md mx-4 ${
            modal.title === 'Успешно' 
              ? 'from-green-800 to-green-900' 
              : 'from-slate-800 to-purple-900'
          }`}>
            <div className="text-center mb-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${
                modal.title === 'Успешно' 
                  ? 'bg-green-500/20' 
                  : 'bg-red-500/20'
              }`}>
                {modal.title === 'Успешно' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="green" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                ) : (
                  <span className="text-3xl">⚠️</span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-white">{modal.title}</h2>
              <p className="text-purple-200 mt-2">{modal.message}</p>
            </div>
            <button
              onClick={closeModal}
              className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition"
            >
              {t.ok}
            </button>
          </div>
        </div>
      )}
    </>
  );
}