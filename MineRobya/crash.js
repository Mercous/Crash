
function initCrashGame(getCurrentUser) {
const supabaseClient = window.supabaseClient;
 
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


  let currentMultiplier = 1.0;
  let gameAnimationFrame;
  let isPlaying = false;
  let crashPoint = null;
  let betValue = 0;
  let startTime = null;
  let cashedOut = false;
  let currentRound = null;

  const BETTING_PERIOD_MS = 10 * 1000;
  let bettingCountdownInterval = null;
  let currentX = 0;
  const speed = 100;

  

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

      const emoji = '🚀';
      ctx.font = '28px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#4af';
      ctx.shadowBlur = 10;
      ctx.fillText(emoji, pointX, pointY);
      ctx.shadowBlur = 0;
    } else {
      ctx.beginPath();
      ctx.strokeStyle = '#f44';
      ctx.lineWidth = 5;
      ctx.moveTo(width, height);
      ctx.lineTo(width, 0);
      ctx.stroke();
    }
  }

  function animateGame(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = (timestamp - startTime) / 1000;
    currentMultiplier = 1 + elapsed * 0.5;
    currentX = elapsed * speed;

    if (!crashPoint) {
      endGame();
      return;
    }

    if (currentMultiplier >= crashPoint) {
      currentMultiplier = crashPoint;
      multiplierDisplay.textContent = currentMultiplier.toFixed(2) + 'x';
      drawGraph(currentMultiplier, crashPoint);
      endGame();
      return;
    }
    multiplierDisplay.textContent = currentMultiplier.toFixed(2) + 'x';
    drawGraph(currentMultiplier, crashPoint);
    gameAnimationFrame = requestAnimationFrame(animateGame);
  }

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

  function startBettingCountdown(startedAt) {
    clearInterval(bettingCountdownInterval);
    function updateTimer() {
      const now = Date.now();
      const elapsed = now - startedAt;
      const remaining = BETTING_PERIOD_MS - elapsed;
      if (remaining <= 0) {
        clearInterval(bettingCountdownInterval);
        bettingTimer.textContent = '';
        startAnimationIfNeeded();
      } else {
        bettingTimer.textContent = `Приём ставок: ${(remaining / 1000).toFixed(1)} сек.`;
      }
    }
    updateTimer();
    bettingCountdownInterval = setInterval(updateTimer, 100);
  }

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

  async function subscribeToRealtime() {
    const roundsChannel = supabaseClient.channel('public:rounds')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, payload => {
        if (payload.eventType === 'DELETE') {
          if (currentRound && payload.old.id === currentRound.id) {
            currentRound = null;
            crashPoint = null;
            endGame();
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

    const betsChannel = supabaseClient.channel('public:bets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, payload => {
        loadCurrentPlayersBets();
      });
    await betsChannel.subscribe();
  }

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


  startBetBtn.addEventListener('click', async () => {
    if (isPlaying) return;
    const val = betAmount.value.trim();
    betValue = parseInt(val, 10);
    if (isNaN(betValue) || betValue < 1) {
      alert('Введите корректную ставку (минимум 1 алмаз)');
      return;
    }
    if (betValue > getCurrentUser().balance) {
      alert('Недостаточно алмазов на балансе!');
      return;
    }
    startBetBtn.disabled = true;
    betAmount.disabled = true;
    const { data, error } = await supabaseClient.rpc('place_bet', { bet_amount: betValue });
    if (error) {
      alert('Ошибка старта ставки: ' + error.message);
      startBetBtn.disabled = false;
      betAmount.disabled = false;
      return;
    }
    getCurrentUser().balance = data[0].new_balance;
    balanceDisplay.textContent = getCurrentUser().balance;
  
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
      getCurrentUser().balance = newBalance;
      balanceDisplay.textContent = newBalance;
      cashedOut = true;
      showNotification(`Вы забрали ${profit} алмазов (${currentMultiplier.toFixed(2)}x)`);
    } catch (e) {
      alert('Ошибка при выводе выигрыша: ' + e.message);
      cashOutBtn.disabled = false;
      return;
    }
  });

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
    playersBetsList.innerHTML = '<div>Раунд завершён</div>';
    await loadBetHistory();
    await loadCurrentPlayersBets();
  }

  function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  function renderRecentBets(bets) {
  recentBetsContainer.innerHTML = '';
  bets.slice(0, 5).forEach(bet => {
    const betElement = document.createElement('div');
    betElement.className = 'recent-bet';

 
    const multiplierValue = (bet.multiplier != null) ? bet.multiplier : 0;
    const multiplier = document.createElement('span');
    multiplier.textContent = multiplierValue.toFixed(2) + 'x';
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


  function updateProfileStats(bets) {
  const user = getCurrentUser();
  profileUsername.textContent = user.email || user.username || 'Игрок';
  balanceDisplay.textContent = user.balance;

  if (bets.length > 0) {
   
    const validMultipliers = bets
      .map(bet => bet.multiplier)
      .filter(m => m != null);

    const maxMultiplier = validMultipliers.length > 0 ? Math.max(...validMultipliers) : 0;
    profileMaxMultiplier.textContent = maxMultiplier.toFixed(2) + 'x';
  } else {
    profileMaxMultiplier.textContent = '0x';
  }

  profileTotalGames.textContent = bets.length;
}


  async function loadBetHistory() {
    const user = getCurrentUser();
    if (!user) return;
    const { data: bets, error } = await supabaseClient
      .from('bets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      console.error('Ошибка загрузки истории:', error);
      return;
    }
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
    const finishedBets = bets.filter(bet => roundsMap[bet.round_id] !== null && roundsMap[bet.round_id] !== undefined);
    renderRecentBets(finishedBets);
    updateProfileStats(finishedBets);
  }


  subscribeToRealtime();


  drawGraph(1, 10);
}

window.initCrashGame = initCrashGame;

