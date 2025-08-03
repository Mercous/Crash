const supabaseUrl = 'https://agbbllrqsdwgougtehhc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnYmJsbHJxc2R3Z291Z3RlaGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5Mjg4ODQsImV4cCI6MjA2OTUwNDg4NH0.XCPzNuwVbtO-2UCYyOpoYzUUQYnq0HjZEJwEEHxbGNU';

window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
window.currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  // Переключение вкладок меню (Банк / Торговля / Краш)
  const buttons = document.querySelectorAll('nav.menu-left button[data-screen]');
  const screens = document.querySelectorAll('main .screen');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.screen;

      // Убираем active у всех вкладок и кнопок
      screens.forEach(screen => screen.classList.remove('active'));
      buttons.forEach(btn => btn.classList.remove('active'));

      // Добавляем active к выбранной вкладке и кнопке
      document.getElementById(targetId).classList.add('active');
      button.classList.add('active');
    });
  });

  // Элементы управления модалкой аутентификации
  const authModal = document.getElementById('auth-modal');
  const btnLogin = document.querySelector('.btn-login');
  const btnRegister = document.querySelector('.btn-register');
  const modalClose = document.getElementById('modal-close');

  btnLogin.addEventListener('click', () => openAuthModal('login'));
  btnRegister.addEventListener('click', () => openAuthModal('register'));
  modalClose.addEventListener('click', closeAuthModal);

  function openAuthModal(tab) {
    authModal.classList.add('active');
    showAuthTab(tab);
  }

  function closeAuthModal() {
    authModal.classList.remove('active');
  }

  // Переключение вкладок формы аутентификации
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  tabLogin.addEventListener('click', () => showAuthTab('login'));
  tabRegister.addEventListener('click', () => showAuthTab('register'));

  function showAuthTab(tab) {
    if (tab === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      loginForm.style.display = 'flex';
      registerForm.style.display = 'none';
    } else {
      tabLogin.classList.remove('active');
      tabRegister.classList.add('active');
      loginForm.style.display = 'none';
      registerForm.style.display = 'flex';
    }
  }

  // Обработка формы Вход
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      alert('Ошибка входа: ' + error.message);
    } else {
      closeAuthModal();
      await onUserLogin(data.user);
    }
  });

  // Обработка формы Регистрация
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    const { data, error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
      alert('Ошибка регистрации: ' + error.message);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabaseClient
        .from('users')
        .insert([{ id: data.user.id, username, balance: 0 }]);

      if (profileError) {
        alert('Ошибка создания профиля: ' + profileError.message);
        return;
      }

      alert('Регистрация прошла успешно! Проверьте почту для подтверждения.');
      closeAuthModal();
    }
  });

  // Кнопка входа через Discord OAuth
  const discordLoginBtn = document.getElementById('discord-login');
  if (discordLoginBtn) {
    discordLoginBtn.addEventListener('click', async () => {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'discord',
      });

      if (error) {
        alert('Ошибка входа через Discord: ' + error.message);
      }
    });
  }

  // Элементы управления UI пользователя и гостя
  const guestControls = document.getElementById('guest-controls');
  const userControls = document.getElementById('user-controls');
  const userNameSpan = document.getElementById('user-name');
  const userBalanceSpan = document.getElementById('user-balance');
  const btnLogout = document.getElementById('btn-logout');

  btnLogout.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    onUserLogout();
  });

  function showGuestUI() {
    guestControls.style.display = 'flex';
    userControls.style.display = 'none';
    userNameSpan.textContent = '';
    userBalanceSpan.textContent = '';
  }

  async function showUserUI(user) {
    guestControls.style.display = 'none';
    userControls.style.display = 'flex';

    if (!window.currentUser) {
      userNameSpan.textContent = user.email || 'Игрок';
      userBalanceSpan.textContent = '?';
      return;
    }

    userNameSpan.textContent = window.currentUser.username;
    userBalanceSpan.textContent = window.currentUser.balance;
  }

  // Логика после входа пользователя
  async function onUserLogin(user) {
    console.log('Пользователь вошёл:', user);

    // Получаем профиль из таблицы users
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, username, balance')
      .eq('id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Если профиль отсутствует — создаём
      const username = user.user_metadata?.user_name || user.email.split('@')[0];
      await supabaseClient.from('users').insert([{ id: user.id, username, balance: 0 }]);
      window.currentUser = { id: user.id, username, balance: 0 };
    } else if (!error) {
      window.currentUser = data;
    } else {
      // Ошибка — fallback
      window.currentUser = { id: user.id, username: user.email || 'Игрок', balance: 0 };
    }

    await showUserUI(user);
    alert(`Добро пожаловать, ${user.email || user.user_metadata?.user_name || 'игрок'}!`);

    // ВАЖНО: вызываем инициализацию краш-игры, передавая функцию получения текущего пользователя
    if (window.initCrashGame) {
      window.initCrashGame(() => window.currentUser);
    }
  }

  // Логика выхода
  function onUserLogout() {
    console.log('Пользователь вышел');
    window.currentUser = null;
    showGuestUI();
  }

  // Проверка сессии при загрузке страницы
  async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      await onUserLogin(session.user);
    } else {
      onUserLogout();
    }
  }

  checkSession();
});
