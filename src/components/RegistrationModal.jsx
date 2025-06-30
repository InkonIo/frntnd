import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
/* import Map from "./Map"; */ // Закомментировано, так как компонент Map, вероятно, импортируется в App.jsx или другой родительский компонент
import './RegistrationModal.css';

export default function RegistrationModal({ onClose, onSuccess }) {
  const [email, setEmail] = useState("");
  const [login, setLogin] = useState(""); // Используется для имени пользователя при регистрации
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(false); // true для входа, false для регистрации
  const [isRecovering, setIsRecovering] = useState(false); // Режим восстановления пароля
  const [recoveryStep, setRecoveryStep] = useState(0); // 0: ввод email, 1: ввод кода, 2: новый пароль
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatNewPassword, setRepeatNewPassword] = useState("");
  const [keepMeLoggedIn, setKeepMeLoggedIn] = useState(false);

  const navigate = useNavigate();

  // Проверка токена при загрузке компонента
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsRegistered(true);
      // Если пользователь уже зарегистрирован и вошел, можно сразу вызвать onSuccess
      // onSuccess?.(); // Возможно, это не нужно, если навигация происходит извне
    }

    // Инициализация частиц для анимации фона
    const container = document.querySelector('.registration-modal');
    if (!container) return;

    const particles = [];
    for (let i = 0; i < 50; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.top = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 20 + 's';
      particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
      container.appendChild(particle);
      particles.push(particle);
    }

    // Очистка частиц при размонтировании компонента
    return () => {
      particles.forEach(p => p.remove());
    };
  }, []); // Пустой массив зависимостей означает, что эффект выполнится один раз при монтировании

  // Функция для сброса полей формы
  const resetFormFields = () => {
    setEmail("");
    setLogin("");
    setPassword("");
    setConfirmPassword("");
    setAgree(false);
    setError("");
    setRecoveryCode("");
    setNewPassword("");
    setRepeatNewPassword("");
  };

  // Обработчик переключения вкладок
  const handleTabClick = (mode) => {
    setIsLoginMode(mode);
    setIsRecovering(false); // Выход из режима восстановления при переключении
    setRecoveryStep(0); // Сброс шага восстановления
    resetFormFields(); // Очистка всех полей формы
    // Убрана строка setEmail(email); чтобы email тоже очищался
  };

  async function handleRegister(e) {
    e.preventDefault();
    setError("");

    if (!login.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Пожалуйста, заполните все поля");
      return;
    }

    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    if (!agree) {
      setError("Необходимо согласиться с обработкой персональных данных");
      return;
    }

    try {
      const response = await fetch('https://newback-production-aa83.up.railway.app/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: login, email, password })
      });

      const result = await response.text();
      if (!response.ok) {
        setError(result || "Ошибка регистрации");
        return;
      }

      setError("Успешная регистрация! Теперь войдите в систему.");
      handleTabClick(true); // Переключаемся на режим входа и очищаем поля
      // Оставьте email, если хотите, чтобы он был заполнен для входа.
      // Если хотите, чтобы email тоже очищался после регистрации, удалите строку ниже:
      // setEmail(email); 
    } catch (err) {
      console.error("Ошибка регистрации:", err);
      setError("Сервер не отвечает");
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Введите email и пароль");
      return;
    }

    try {
      const response = await fetch("https://newback-production-aa83.up.railway.app/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          password: password
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "Ошибка входа");
        return;
      }

      if (data.token) {
        localStorage.setItem('token', data.token);
      }

      setIsRegistered(true);
      onSuccess?.(); // Вызов коллбэка для родительского компонента
    } catch (err) {
      console.error("Ошибка авторизации:", err);
      setError("Ошибка подключения к серверу");
    }
  }

  async function handleRecoverPassword(e) {
    e.preventDefault();
    setError("");

    if (recoveryStep === 1) { // Шаг проверки кода
      if (!recoveryCode.trim()) {
        setError("Введите код восстановления");
        return;
      }
      try {
        const response = await fetch("https://newback-production-aa83.up.railway.app/api/v1/recovery/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: recoveryCode })
        });

        if (!response.ok) {
          const data = await response.text();
          setError(data || "Неверный код");
          return;
        }

        setError("Код подтверждён. Теперь введите новый пароль.");
        setRecoveryStep(2); // Переход к шагу установки нового пароля
      } catch (err) {
        console.error("Ошибка верификации кода:", err);
        setError("Сервер недоступен");
      }
    } else if (recoveryStep === 2) { // Шаг установки нового пароля
      if (!newPassword || !repeatNewPassword) {
        setError("Введите новый пароль и повторите его");
        return;
      }
      if (newPassword !== repeatNewPassword) {
        setError("Пароли не совпадают");
        return;
      }

      try {
        const response = await fetch("https://newback-production-aa83.up.railway.app/api/v1/recovery/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, newPassword })
        });

        if (!response.ok) {
          const data = await response.text();
          setError(data || "Ошибка смены пароля");
          return;
        }

        // Заменяем alert на console.log или передаем showToast
        console.log("Пароль успешно обновлён!"); 
        setError("Пароль успешно обновлён! Вы можете войти.");
        setIsRecovering(false); // Выход из режима восстановления
        setRecoveryStep(0); // Сброс шага
        handleTabClick(true); // Переключаемся на вход и очищаем поля, но сохраняем email
        setEmail(email); 

      } catch (err) {
        console.error("Ошибка смены пароля:", err);
        setError("Сервер недоступен");
      }
    }
  }

  async function startRecovery() {
    setError("");

    if (!email.trim()) {
      setError("Введите email для восстановления");
      return;
    }

    try {
      const response = await fetch("https://newback-production-aa83.up.railway.app/api/v1/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const data = await response.text();
        setError(data || "Ошибка при отправке письма");
        return;
      }

      // Заменяем alert на console.log
      console.log("Код восстановления отправлен на почту.");
      setError("Код восстановления отправлен на почту. Проверьте ваш email.");
      setIsRecovering(true);
      setRecoveryStep(1); // Переход к шагу ввода кода
    } catch (err) {
      console.error("Ошибка восстановления:", err);
      setError("Сервер недоступен");
    }
  }

  // Если пользователь зарегистрирован, то мы не отображаем модальное окно
  // Предполагается, что App.jsx или другой родительский компонент будет управлять навигацией
  if (isRegistered) {
      // Здесь можно добавить навигацию, если onSuccess не ведет к ней напрямую
      // navigate('/dashboard'); // Пример навигации
      return null; // Не отображать модальное окно, если пользователь вошел
  }

  return (
    <div className="registration-modal">
      <div className="modal-overlay" onClick={onClose}></div> {/* Закрытие модального окна по клику на оверлей */}
      <div className="registration-wrapper">
        <div className="registration-content">
          {!isRecovering && (
            <div className="auth-tabs">
              <div className={`auth-tab ${!isLoginMode ? "active" : ""}`} onClick={() => handleTabClick(false)}>SIGN UP</div>
              <div className={`auth-tab ${isLoginMode ? "active" : ""}`} onClick={() => handleTabClick(true)}>SIGN IN</div>
            </div>
          )}

          {!isLoginMode && !isRecovering && (
            <form className="registration-form" onSubmit={handleRegister}>
              <div className="input-group">
                <input type="text" placeholder="Username" value={login} onChange={(e) => setLogin(e.target.value)} required />
              </div>
              <div className="input-group">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="input-group">
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="input-group">
                <input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <label className="checkbox-label">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span className="checkmark"></span> I agree to the processing of personal data
              </label>
              {error && <div className="error">{error}</div>}
              <button type="submit" className="submit-btn">SIGN UP</button>
            </form>
          )}

          {isLoginMode && !isRecovering && (
            <form className="registration-form" onSubmit={handleLogin}>
              <div className="input-group">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="input-group">
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <label className="checkbox-label">
                <input type="checkbox" checked={keepMeLoggedIn} onChange={(e) => setKeepMeLoggedIn(e.target.checked)} />
                <span className="checkmark"></span> Keep me logged in
              </label>
              <div className="forgot-password" onClick={startRecovery} style={{ cursor: 'pointer', color: '#007bff', marginTop: '8px' }}> {/* Цвет изменен на синий для лучшей видимости */}
                Forgot password?
              </div>
              {error && <div className="error">{error}</div>}
              <button type="submit" className="submit-btn">LOGIN</button>
            </form>
          )}

          {isRecovering && (
            <form className="registration-form" onSubmit={handleRecoverPassword}>
              <h2 style={{ textAlign: 'center', color: '#333' }}>Password Recovery</h2>
              {recoveryStep === 0 && ( // Шаг 0: ввод email (только если startRecovery не был вызван)
                <div className="input-group">
                  <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  <button type="button" className="submit-btn" onClick={startRecovery} style={{ marginTop: '15px' }}>
                    Send Recovery Code
                  </button>
                </div>
              )}
              {recoveryStep === 1 && ( // Шаг 1: ввод кода
                <div className="input-group">
                  <input type="text" placeholder="Code from email" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} required />
                </div>
              )}
              {recoveryStep === 2 && ( // Шаг 2: установка нового пароля
                <>
                  <div className="input-group">
                    <input type="password" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                  </div>
                  <div className="input-group">
                    <input type="password" placeholder="Repeat New Password" value={repeatNewPassword} onChange={(e) => setRepeatNewPassword(e.target.value)} required />
                  </div>
                </>
              )}
              {error && <div className="error">{error}</div>}
              {recoveryStep > 0 && ( // Кнопка "Verify Code" или "Set New Password"
                <button type="submit" className="submit-btn">
                  {recoveryStep === 1 ? 'Verify Code' : 'Set New Password'}
                </button>
              )}
              <button type="button" className="cancel-btn" onClick={() => { setIsRecovering(false); setRecoveryStep(0); resetFormFields(); }} style={{ marginTop: '10px' }}>
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
