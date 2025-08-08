const supabaseUrl = 'https://agbbllrqsdwgougtehhc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnYmJsbHJxc2R3Z291Z3RlaGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5Mjg4ODQsImV4cCI6MjA2OTUwNDg4NH0.XCPzNuwVbtO-2UCYyOpoYzUUQYnq0HjZEJwEEHxbGNU';

window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
window.currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
 
  const buttons = document.querySelectorAll('nav.menu-left button[data-screen]');
  const screens = document.querySelectorAll('main .screen');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.screen;


      screens.forEach(screen => screen.classList.remove('active'));
      buttons.forEach(btn => btn.classList.remove('active'));

   
      document.getElementById(targetId).classList.add('active');
      button.classList.add('active');
    });
  });


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

function animateEffect(button, screenType) {
  const btnRect = button.getBoundingClientRect();

  if (screenType === 'bank') {
 
    const coinContainer = document.createElement('div');
    coinContainer.style.position = 'fixed';
    coinContainer.style.left = btnRect.left + 'px';
    coinContainer.style.top = btnRect.top + 'px';
    coinContainer.style.width = btnRect.width + 'px';
    coinContainer.style.height = btnRect.height + 'px';
    coinContainer.style.pointerEvents = 'none';
    coinContainer.style.overflow = 'visible';
    coinContainer.style.zIndex = 1000;
    document.body.appendChild(coinContainer);

    const createCoin = () => {
      const coin = document.createElement('span');
      coin.textContent = '💰';
      coin.style.position = 'absolute';
      coin.style.left = Math.random() * btnRect.width + 'px';
      coin.style.top = '0px';
      coin.style.fontSize = '18px';
      coin.style.opacity = '0.9';
      coin.style.transition = 'transform 1.5s linear, opacity 1.5s linear';
      coinContainer.appendChild(coin);

      requestAnimationFrame(() => {
        coin.style.transform = `translateY(${btnRect.height + 30}px) rotate(${Math.random()*360}deg)`;
        coin.style.opacity = '0';
      });

      coin.addEventListener('transitionend', () => {
        coin.remove();
      });
    };

  
    let coinsCount = 10;
    let interval = setInterval(() => {
      if (coinsCount <= 0) {
        clearInterval(interval);
        setTimeout(() => coinContainer.remove(), 1600);
        return;
      }
      createCoin();
      coinsCount--;
    }, 100);

  } else if (screenType === 'trade') {
 
    const items = ['⛏️', '🪓', '⚔️'];
    for (let i = 0; i < 10; i++) {
      const item = document.createElement('span');
      item.textContent = items[Math.floor(Math.random() * items.length)];
      item.style.position = 'fixed';
      item.style.left = (btnRect.left + btnRect.width / 2) + 'px';
      item.style.top = (btnRect.top + btnRect.height / 2) + 'px';
      item.style.fontSize = '20px';
      item.style.pointerEvents = 'none';
      item.style.userSelect = 'none';
      item.style.zIndex = 1000;
      item.style.transition = 'transform 0.8s ease-out, opacity 0.8s ease-out';

      document.body.appendChild(item);

      const angle = Math.random() * 2 * Math.PI;
      const distance = 80 + Math.random() * 40;

      requestAnimationFrame(() => {
        item.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0.5)`;
        item.style.opacity = '0';
      });

      item.addEventListener('transitionend', () => {
        item.remove();
      });
    }

  } else if (screenType === 'crash') {
   
    for (let i = 0; i < 10; i++) {
      const diamond = document.createElement('span');
      diamond.textContent = '💎';
      diamond.style.position = 'fixed';
      diamond.style.left = (btnRect.left + btnRect.width / 2) + 'px';
      diamond.style.top = (btnRect.top + btnRect.height / 2) + 'px';
      diamond.style.fontSize = '20px';
      diamond.style.pointerEvents = 'none';
      diamond.style.userSelect = 'none';
      diamond.style.zIndex = 1000;
      diamond.style.transition = 'transform 0.8s ease-out, opacity 0.8s ease-out';

      document.body.appendChild(diamond);

      const angle = Math.random() * 2 * Math.PI;
      const distance = 80 + Math.random() * 40;

      requestAnimationFrame(() => {
        diamond.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0.5)`;
        diamond.style.opacity = '0';
      });

      diamond.addEventListener('transitionend', () => {
        diamond.remove();
      });
    }
  }
}


document.querySelectorAll('.menu-btn').forEach(button => {
  button.addEventListener('click', () => {
    
    const screenType = button.dataset.screen;

  
    animateEffect(button, screenType);

    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

  
    setTimeout(() => {
      document.querySelectorAll('main .screen').forEach(screen => screen.classList.remove('active'));
      const targetScreen = document.getElementById(screenType);
      if (targetScreen) targetScreen.classList.add('active');
    }, 800);
  });
});


  
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


  async function onUserLogin(user) {
    console.log('Пользователь вошёл:', user);

    
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, username, balance')
      .eq('id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      
      const username = user.user_metadata?.user_name || user.email.split('@')[0];
      await supabaseClient.from('users').insert([{ id: user.id, username, balance: 0 }]);
      window.currentUser = { id: user.id, username, balance: 0 };
    } else if (!error) {
      window.currentUser = data;
    } else {
     
      window.currentUser = { id: user.id, username: user.email || 'Игрок', balance: 0 };
    }

    await showUserUI(user);
    alert(`Добро пожаловать, ${user.email || user.user_metadata?.user_name || 'игрок'}!`);

    
    if (window.initCrashGame) {
      window.initCrashGame(() => window.currentUser);
    }
  }


  function onUserLogout() {
    console.log('Пользователь вышел');
    window.currentUser = null;
    showGuestUI();
  }
document.addEventListener('DOMContentLoaded', () => {
  const btnOperations = document.getElementById('btn-operations');
  const btnTop = document.getElementById('btn-top');
  const operationsContent = document.getElementById('operations-content');
  const topContent = document.getElementById('top-content');

  btnOperations.addEventListener('click', () => {
    btnOperations.classList.add('active');
    btnTop.classList.remove('active');
    operationsContent.classList.add('active');
    topContent.classList.remove('active');
  });

  btnTop.addEventListener('click', () => {
    btnTop.classList.add('active');
    btnOperations.classList.remove('active');
    topContent.classList.add('active');
    operationsContent.classList.remove('active');
  });

  
  const coinContainer = document.querySelector('.coin-animation');

  function createCoin() {
    const coin = document.createElement('div');
    coin.classList.add('coin');
    coin.style.left = Math.random() * 140 + 'px';
    coin.style.animationDuration = (3 + Math.random() * 2) + 's';
    coin.style.opacity = 0.8 + Math.random() * 0.2;
    coinContainer.appendChild(coin);

   
    coin.addEventListener('animationend', () => {
      coin.remove();
    });
  }


  setInterval(createCoin, 400);
});

  
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

