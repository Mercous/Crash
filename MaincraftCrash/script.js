 // Подключение к Supabase
const supabaseUrl = 'https://agbbllrqsdwgougtehhc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnYmJsbHJxc2R3Z291Z3RlaGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5Mjg4ODQsImV4cCI6MjA2OTUwNDg4NH0.XCPzNuwVbtO-2UCYyOpoYzUUQYnq0HjZEJwEEHxbGNU';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// ==================== DOM ЭЛЕМЕНТЫ ====================
const authScreen = document.getElementById('auth-screen');
const gameScreen = document.getElementById('game-screen');

// Авторизация
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');

const regEmailInput = document.getElementById('reg-email');
const regPasswordInput = document.getElementById('reg-password');
const registerBtn = document.getElementById('register-btn');

// Вкладки переключения формы логина и регистрации
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutBtn = document.getElementById('logout-btn');

// Игровой интерфейс
const betAmount = document.getElementById('bet-amount');
const startBetBtn = document.getElementById('start-bet');
const cashOutBtn = document.getElementById('cash-out');
const multiplierDisplay = document.getElementById('multiplier');
const balanceDisplay = document.getElementById('profile-balance');
const playersBetsList = document.getElementById('players-bets-list');
const recentBetsContainer = document.getElementById('recent-bets');
const profileUsername = document.getElementById('profile-username');
const profileMaxMultiplier = document.getElementById('profile-max-multiplier');
const profileTotalGames = document.getElementById('profile-total-games');
const graphCanvas = document.getElementById('graph');
const ctx = graphCanvas.getContext('2d');
const bettingTimer = document.getElementById('betting-timer');

// ==================== ПЕРЕМЕННЫЕ ИГРЫ ====================
let currentMultiplier = 1.0;
let gameAnimationFrame;
let isPlaying = false;
let crashPoint = null;
let betValue = 0;
let startTime = null;
let cashedOut = false; // <--- Добавлено: флаг кэш-аута
let currentRound = null; // текущий активный раунд

// Таймер приёма ставок
let bettingCountdownInterval = null;
const BETTING_PERIOD_MS = 10 * 1000; // 10 секунд

// ==================== ФУНКЦИИ ====================

// Рисуем плавный график с логарифмической кривой
let currentX = 0; // текущая позиция по X в пикселях
const speed = 100; // скорость движения по X (пикселей в секунду)

function drawGraph(multiplier, crash) {
  ctx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);

  const width = graphCanvas.width;
  const height = graphCanvas.height;

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#4af';
  ctx.beginPath();

  ctx.moveTo(0, height);

  const maxX = Math.min(currentX, width);

  for (let x = 0; x <= maxX; x++) {
    const progress = x / width;
    const y = height - (Math.log(1 + progress * (crash - 1)) / Math.log(crash)) * height;
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  if (multiplier <= crash) {
    const pointX = Math.min(currentX, width);
    const pointProgress = pointX / width;
    const pointY = height - (Math.log(1 + pointProgress * (crash - 1)) / Math.log(crash)) * height;

    // Рисуем эмодзи вместо круга
    const emoji = '🚀'; // Можно поставить '💎' или любой другой эмодзи

    ctx.font = '28px serif'; // Размер эмодзи, можно подкорректировать
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Добавляем свечение
    ctx.shadowColor = '#4af';
    ctx.shadowBlur = 10;

    ctx.fillText(emoji, pointX, pointY);

    ctx.shadowBlur = 0; // Отключаем тень после рисования эмодзи
  } else {
    ctx.beginPath();
    ctx.strokeStyle = '#f44';
    ctx.lineWidth = 5;
    ctx.moveTo(width, height);
    ctx.lineTo(width, 0);
    ctx.stroke();
  }
}


// Анимация игры, синхронизированная с серверным раундом
function animateGame(timestamp) {
  if (!startTime) startTime = timestamp;
  const elapsed = (timestamp - startTime) / 1000;

  currentMultiplier = 1 + elapsed * 0.5;
  currentX = elapsed * speed;

  if (!crashPoint) {
    endGame(false);
    return;
  }

  if (currentMultiplier >= crashPoint) {
    currentMultiplier = crashPoint;
    multiplierDisplay.textContent = currentMultiplier.toFixed(2) + 'x';
    drawGraph(currentMultiplier, crashPoint);
    // Анимация завершилась — раунд крашнул
    endGame(false);
    return;
  }

  multiplierDisplay.textContent = currentMultiplier.toFixed(2) + 'x';
  drawGraph(currentMultiplier, crashPoint);

  gameAnimationFrame = requestAnimationFrame(animateGame);
}

// Сброс состояния при новом раунде
function resetGameStateForNewRound() {
  isPlaying = false;
  cashOutBtn.disabled = true;
  startBetBtn.disabled = false;
  betAmount.disabled = false;
  multiplierDisplay.textContent = '1.00x';
  currentMultiplier = 1.0;
  startTime = null;
  currentX = 0;

  drawGraph(1, crashPoint || 10);

  bettingTimer.textContent = '';
  clearInterval(bettingCountdownInterval);

  loadCurrentPlayersBets();
  loadBetHistory();
}

// Запуск таймера приёма ставок
function startBettingCountdown(startedAt) {
  clearInterval(bettingCountdownInterval);

  function updateTimer() {
    const now = Date.now();
    const elapsed = now - startedAt;
    const remaining = BETTING_PERIOD_MS - elapsed;

    if (remaining <= 0) {
      clearInterval(bettingCountdownInterval);
      bettingTimer.textContent = '';
      // Запускаем игру (анимацию)
      startAnimationIfNeeded();
    } else {
      bettingTimer.textContent = `Приём ставок: ${(remaining / 1000).toFixed(1)} сек.`;
    }
  }

  updateTimer();
  bettingCountdownInterval = setInterval(updateTimer, 100);
}

// Запуск анимации, если раунд есть и не играет
function startAnimationIfNeeded() {
  if (!isPlaying && crashPoint && currentRound && !currentRound.ended_at) {
    isPlaying = true;
    if (!startTime) startTime = performance.now();
    currentMultiplier = 1.0;
    cashOutBtn.disabled = false;
    startBetBtn.disabled = true;
    betAmount.disabled = true;
    bettingTimer.textContent = '';
    gameAnimationFrame = requestAnimationFrame(animateGame);
  }
}

// ==================== ПОДПИСКИ НА REALTIME ====================

async function subscribeToRealtime() {
  // Подписка на изменения в таблице rounds
  const roundsChannel = supabaseClient.channel('public:rounds')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, payload => {
      console.log('Realtime изменение раунда:', payload);
      if (payload.eventType === 'DELETE') {
        if (currentRound && payload.old.id === currentRound.id) {
          currentRound = null;
          crashPoint = null;
          endGame(false);
        }
        return;
      }

      if (payload.new) {
        currentRound = payload.new;
        crashPoint = currentRound.crash_multiplier;
        resetGameStateForNewRound();

        if (currentRound.betting_started_at) {
          const startedAt = new Date(currentRound.betting_started_at).getTime();
          const now = Date.now();
          const elapsedMs = now - startedAt;

          if (elapsedMs < BETTING_PERIOD_MS) {
            startBettingCountdown(startedAt);
            multiplierDisplay.textContent = 'Ожидание ставок...';
            drawGraph(1, crashPoint);
            cashOutBtn.disabled = true;
            startBetBtn.disabled = false;
            betAmount.disabled = false;
          } else {
            bettingTimer.textContent = '';
            startTime = performance.now() - elapsedMs;
            startAnimationIfNeeded();
          }
        } else {
          bettingTimer.textContent = 'Ожидание первой ставки...';
          multiplierDisplay.textContent = '1.00x';
          drawGraph(1, crashPoint);
          cashOutBtn.disabled = true;
          startBetBtn.disabled = false;
          betAmount.disabled = false;
        }
      }
    });

  await roundsChannel.subscribe();

  // Подписка на изменения в таблице bets
  const betsChannel = supabaseClient.channel('public:bets')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, payload => {
      console.log('Realtime ставка:', payload);
      loadCurrentPlayersBets();
    });

  await betsChannel.subscribe();
}

// ==================== ОБНОВЛЕНИЕ ТЕКУЩИХ СТАВОК ====================

async function loadCurrentPlayersBets() {
  if (!currentRound) {
    playersBetsList.innerHTML = '<div>Раунд не активен</div>';
    return;
  }

  const { data: bets, error } = await supabaseClient
    .from('bets')
    .select(`
      bet_amount,
      multiplier,
      profit,
      crashed,
      created_at,
      user:users(username)
    `)
    .eq('round_id', currentRound.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Ошибка загрузки текущих ставок:', error);
    return;
  }

  playersBetsList.innerHTML = '';

  bets.forEach(bet => {
    const div = document.createElement('div');
    div.className = 'player-bet';
    div.innerHTML = `<span class="name">${bet.user?.username || 'Игрок'}</span><span class="amount">${bet.bet_amount}◆</span>`;
    playersBetsList.appendChild(div);
  });
}

// ==================== ПОДПИСКА НА АКТИВНЫЙ РАУНД ====================
// (оставляем для начальной загрузки, но подписка теперь в subscribeToRealtime, вызывается из onUserLogin)

async function subscribeToRealtime() {
  const roundsChannel = supabaseClient.channel('public:rounds')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, payload => {
      console.log('Round event:', payload);
      handleRoundChange(payload);
    });

  const betsChannel = supabaseClient.channel('public:bets')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, payload => {
      console.log('Bet event:', payload);
      loadCurrentPlayersBets();
    });

  await roundsChannel.subscribe();
  await betsChannel.subscribe();
}

function handleRoundChange(payload) {
  const round = payload.new || payload.old;

  if (!round) return;

  currentRound = round;
  crashPoint = round.crash_multiplier;

  resetGameStateForNewRound();

  if (round.betting_started_at) {
    const startedAt = new Date(round.betting_started_at).getTime();
    const now = Date.now();
    const elapsedMs = now - startedAt;

    if (elapsedMs < BETTING_PERIOD_MS) {
      startBettingCountdown(startedAt);
      multiplierDisplay.textContent = 'Ожидание ставок...';
      drawGraph(1, crashPoint);
      cashOutBtn.disabled = true;
      startBetBtn.disabled = false;
      betAmount.disabled = false;
    } else {
      bettingTimer.textContent = '';
      startTime = performance.now() - elapsedMs;
      startAnimationIfNeeded();
    }
  } else {
    bettingTimer.textContent = 'Ожидание первой ставки...';
    multiplierDisplay.textContent = '1.00x';
    drawGraph(1, crashPoint);
    cashOutBtn.disabled = true;
    startBetBtn.disabled = false;
    betAmount.disabled = false;
  }
}

// ==================== ОБРАБОТКА СТАВОК ====================

// Старт ставки — вызывает RPC place_bet на сервере
startBetBtn.addEventListener('click', async () => {
  if (isPlaying) return;

  const val = betAmount.value.trim();
  betValue = parseInt(val, 10);

  if (isNaN(betValue) || betValue < 1) {
    alert('Введите корректную ставку (минимум 1 алмаз)');
    return;
  }
  if (betValue > window.currentUser.balance) {
    alert('Недостаточно алмазов на балансе!');
    return;
  }

  startBetBtn.disabled = true;
  betAmount.disabled = true;

  const { data, error } = await supabaseClient.rpc('place_bet', { 
    bet_amount: betValue
  });

  if (error) {
    alert('Ошибка старта ставки: ' + error.message);
    startBetBtn.disabled = false;
    betAmount.disabled = false;
    return;
  }

  window.currentUser.balance = data[0].new_balance;
  balanceDisplay.textContent = window.currentUser.balance;

  // Обновляем текущий активный раунд
  const { data: activeRound, error: roundError } = await supabaseClient
    .from('rounds')
    .select('*')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (!roundError && activeRound) {
    currentRound = activeRound;
    crashPoint = currentRound.crash_multiplier;

    resetGameStateForNewRound();

    if (currentRound.betting_started_at) {
      const startedAt = new Date(currentRound.betting_started_at).getTime();
      const now = Date.now();
      const elapsedMs = now - startedAt;

      if (elapsedMs < BETTING_PERIOD_MS) {
        startBettingCountdown(startedAt);
        multiplierDisplay.textContent = 'Ожидание ставок...';
        drawGraph(1, crashPoint);
        cashOutBtn.disabled = true;
        startBetBtn.disabled = true;
        betAmount.disabled = true;
      } else {
        bettingTimer.textContent = '';
        startTime = performance.now() - elapsedMs;
        startAnimationIfNeeded();
      }
    }
  }

  showNotification(`Ставка ${betValue}◆ принята в раунд #${currentRound?.id || '?'}`);
});

// Забрать выигрыш — вызывает RPC cash_out на сервере
cashOutBtn.addEventListener('click', async () => {
  if (!isPlaying) return;

  cashOutBtn.disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc('cash_out', { 
      multiplier: currentMultiplier,
      p_round_id: currentRound?.id
    });

    if (error) throw error;

    const profit = data[0].profit_amount;
    const newBalance = data[0].new_balance;

    window.currentUser.balance = newBalance;
    balanceDisplay.textContent = newBalance;

    cashedOut = true;

    showNotification(`Вы забрали ${profit} алмазов (${currentMultiplier.toFixed(2)}x)`);

  } catch (e) {
    alert('Ошибка при выводе выигрыша: ' + e.message);
    cashOutBtn.disabled = false;
    return;
  }
});

// Завершение игры
async function endGame() {
  cancelAnimationFrame(gameAnimationFrame);
  isPlaying = false;
  cashOutBtn.disabled = true;
  startBetBtn.disabled = false;
  betAmount.disabled = false;

  if (betValue > 0) {
    if (cashedOut) {
      showNotification(`Краш на ${crashPoint?.toFixed(2)}x. Вы забрали ставку.`);
    } else {
      showNotification(`Краш! Вы проиграли ${betValue} алмазов (краш на ${crashPoint?.toFixed(2)}x)`);
    }
  }

  multiplierDisplay.textContent = '1.00x';
  drawGraph(1, 10);

  betValue = 0;
  cashedOut = false;

  clearInterval(bettingCountdownInterval);
  bettingTimer.textContent = '';

  try {
    const { data, error } = await supabaseClient.rpc('finish_crash_round');
    if (error) console.error('Ошибка завершения раунда:', error);
  } catch (e) {
    console.error('Ошибка вызова finish_crash_round:', e);
  }

  currentRound = null;
  crashPoint = null;

  await loadBetHistory();
  await loadCurrentPlayersBets();
}

// Уведомления
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// Отрисовка последних ставок в профиле
function renderRecentBets(bets) {
  recentBetsContainer.innerHTML = '';

  bets.slice(0, 5).forEach(bet => {
    const betElement = document.createElement('div');
    betElement.className = 'recent-bet';

    const multiplier = document.createElement('span');
    multiplier.textContent = bet.multiplier.toFixed(2) + 'x';
    multiplier.style.color = bet.crashed ? '#f44' : '#4CAF50';

    const profit = document.createElement('span');
    profit.textContent = (bet.profit > 0 ? '+' : '') + bet.profit + '◆';
    profit.style.color = bet.profit > 0 ? '#4CAF50' : '#f44';
    profit.style.fontWeight = 'bold';

    betElement.appendChild(multiplier);
    betElement.appendChild(profit);

    recentBetsContainer.appendChild(betElement);
  });
}

// Обновление статистики профиля
function updateProfileStats(bets) {
  profileUsername.textContent = window.currentUser.email || window.currentUser.username || 'Игрок';
  balanceDisplay.textContent = window.currentUser.balance;

  if (bets.length > 0) {
    const maxMultiplier = Math.max(...bets.map(bet => bet.multiplier));
    profileMaxMultiplier.textContent = maxMultiplier.toFixed(2) + 'x';
  } else {
    profileMaxMultiplier.textContent = '0x';
  }

  profileTotalGames.textContent = bets.length;
}

// Загрузка истории ставок пользователя
async function loadBetHistory() {
  if (!window.currentUser) return;

  // Получаем ставки пользователя
  const { data: bets, error } = await supabaseClient
    .from('bets')
    .select('*')
    .eq('user_id', window.currentUser.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Ошибка загрузки истории:', error);
    return;
  }

  // Получаем раунды по round_id из ставок
  const roundIds = [...new Set(bets.map(bet => bet.round_id).filter(id => id))];

  const { data: rounds, error: roundsError } = await supabaseClient
    .from('rounds')
    .select('id, ended_at')
    .in('id', roundIds);

  if (roundsError) {
    console.error('Ошибка загрузки раундов:', roundsError);
    return;
  }

  const roundsMap = {};
  rounds.forEach(r => {
    roundsMap[r.id] = r.ended_at;
  });

  // Фильтруем ставки по завершённым раундам
  const finishedBets = bets.filter(bet => roundsMap[bet.round_id] !== null && roundsMap[bet.round_id] !== undefined);

  renderRecentBets(finishedBets);
  updateProfileStats(finishedBets);
}



// ==================== АВТОРИЗАЦИЯ ====================

// Регистрация через Supabase Auth
registerBtn.addEventListener('click', async () => {
  const email = regEmailInput.value.trim();
  const password = regPasswordInput.value;
  const username = document.getElementById('reg-username').value.trim();

  if (!email || !password || !username) {
    alert('Заполните все поля!');
    return;
  }

  const maxUsernameLength = 15;
  if (username.length > maxUsernameLength) {
    alert(`Ник не должен превышать ${maxUsernameLength} символов.`);
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  if (error) {
    alert('Ошибка регистрации: ' + error.message);
    return;
  }

  if (!data.user) {
    alert('Ошибка регистрации: пользователь не создан');
    return;
  }

  const { error: insertError } = await supabaseClient
    .from('users')
    .insert([
      {
        id: data.user.id,
        username: username,
        balance: 1
      }
    ]);

  if (insertError) {
    alert('Ошибка создания профиля: ' + insertError.message);
    return;
  }

  if (data.user.email_confirmed_at) {
    alert('Регистрация успешна! Вы можете войти в аккаунт.');
  } else {
    alert('Регистрация успешна! Подтвердите email и войдите в аккаунт.');
  }

  tabLogin.click();
});

// Логин через Supabase Auth
loginBtn.addEventListener('click', async () => {
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  if (!email || !password) {
    alert('Заполните все поля!');
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    alert('Ошибка входа: ' + error.message);
    return;
  }

  await onUserLogin(data.user);
});

// При загрузке страницы проверяем сессию
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session?.user) {
    await onUserLogin(session.user);
  } else {
    showAuthScreen();
  }
}

// Обработка успешного входа
async function onUserLogin(user) {
  let { data: profile, error } = await supabaseClient
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116' || error.message.includes('No rows found')) {
      const { data: newProfile, error: insertError } = await supabaseClient
        .from('users')
        .insert([{ id: user.id, username: user.email.split('@')[0], balance: 1000 }])
        .select()
        .single();

      if (insertError) {
        alert('Ошибка создания профиля: ' + insertError.message);
        return;
      }

      profile = newProfile;
    } else {
      alert('Ошибка загрузки профиля: ' + error.message);
      return;
    }
  }

  window.currentUser = profile;

  showGameScreen();

  profileUsername.textContent = profile.username;
  balanceDisplay.textContent = profile.balance;

  await loadBetHistory();
  await loadCurrentPlayersBets();

  // Подписываемся на realtime обновления раундов и ставок
  await subscribeToRealtime();
}

// Показать экран авторизации
function showAuthScreen() {
  authScreen.classList.add('active');
  gameScreen.classList.remove('active');
}

// Показать игровой экран
function showGameScreen() {
  authScreen.classList.remove('active');
  gameScreen.classList.add('active');
}

// Выход из аккаунта
async function logout() {
  await supabaseClient.auth.signOut();
  window.currentUser = null;
  showAuthScreen();
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
checkSession();

// УБРАН setInterval с loadCurrentPlayersBets(), realtime подписка обновит UI сама
// setInterval(() => {
//   if (window.currentUser) {
//     loadCurrentPlayersBets();
//   }
// }, 1000);
