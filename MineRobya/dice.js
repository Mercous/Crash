document.addEventListener('DOMContentLoaded', () => {
  const supabaseClient = window.supabaseClient;

  // Элементы UI
  const sectionDice = document.getElementById('dice');
  const createLobbyForm = document.getElementById('create-lobby-form');
  const lobbyBetInput = document.getElementById('lobby-bet-amount');
  const lobbyPlayerCountSelect = document.getElementById('lobby-player-count');

  const lobbyWaitingDiv = document.getElementById('dice-lobby-waiting');
  const lobbyPlayersList = document.getElementById('lobby-players-list');
  const leaveLobbyBtn = document.getElementById('leave-lobby-btn');

  const gameDiv = document.getElementById('dice-game');
  const diceResultsDiv = document.getElementById('dice-results');
  const rollDiceBtn = document.getElementById('roll-dice-btn');
  const gameMessageDiv = document.getElementById('game-message');
  const exitGameBtn = document.getElementById('exit-game-btn');

  // Переменные состояния
  let currentUser = null;
  let lobby = null; // { id, betAmount, maxPlayers, players: [{id, username, roll}], rollsDoneCount, gameStarted }
  let channel = null;
  let hasRolled = false;

  // Инициализация
  (async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
      alert('Пожалуйста, войдите в систему, чтобы играть в кости');
      return;
    }
    currentUser = await loadUserProfile(session.user.id);
    showDiceScreen();
  })();

  // Загрузка профиля пользователя из БД
  async function loadUserProfile(userId) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, username, balance')
      .eq('id', userId)
      .single();
    if (error) {
      alert('Ошибка загрузки профиля: ' + error.message);
      return null;
    }
    return data;
  }

  // Показать экран игры в кости
  function showDiceScreen() {
    document.querySelectorAll('main .screen').forEach(s => s.classList.remove('active'));
    sectionDice.classList.add('active');
    lobby = null;
    hasRolled = false;
    resetUI();
  }

  // Сброс UI к начальному состоянию
  function resetUI() {
    createLobbyForm.style.display = 'block';
    lobbyWaitingDiv.style.display = 'none';
    gameDiv.style.display = 'none';

    lobbyPlayersList.innerHTML = '';
    diceResultsDiv.innerHTML = '';
    gameMessageDiv.textContent = '';

    rollDiceBtn.disabled = true;
    exitGameBtn.style.display = 'none';

    hasRolled = false;
  }

  // Создание лобби — теперь вызываем RPC create_new_dice_round
  createLobbyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const betAmount = parseInt(lobbyBetInput.value, 10);
    const maxPlayers = parseInt(lobbyPlayerCountSelect.value, 10);

    if (isNaN(betAmount) || betAmount < 1) {
      alert('Введите корректную сумму ставки');
      return;
    }
    if (![2,3,4,5].includes(maxPlayers)) {
      alert('Выберите корректное количество игроков');
      return;
    }

    if (currentUser.balance < betAmount) {
      alert('Недостаточно баланса для ставки');
      return;
    }

    // Вызов RPC для создания раунда с типом dice
    const { data: newRound, error } = await supabaseClient.rpc('create_new_dice_round', {
  p_bet_amount: betAmount,
  p_max_players: maxPlayers
});


    if (error) {
      alert('Ошибка создания раунда: ' + error.message);
      return;
    }

    lobby = {
      id: newRound.id,
      betAmount: betAmount,
      maxPlayers: maxPlayers,
      players: [{
        id: currentUser.id,
        username: currentUser.username,
        roll: null
      }],
      rollsDoneCount: 0,
      gameStarted: false
    };

    // Подключаемся к каналу Supabase для этого лобби
    await connectToLobbyChannel(lobby.id);

    // Размещаем ставку текущего игрока через RPC
    const { error: betError } = await supabaseClient.rpc('place_bet_dice');


    if (betError) {
      alert('Ошибка размещения ставки: ' + betError.message);
      // Можно отписаться и выйти
      await channel.unsubscribe();
      channel = null;
      lobby = null;
      resetUI();
      return;
    }

    // Отправляем сообщение о создании лобби (для других игроков)
    channel.send({
      type: 'broadcast',
      event: 'lobby_created',
      payload: {
        lobby
      }
    });

    createLobbyForm.style.display = 'none';
    lobbyWaitingDiv.style.display = 'block';
    updateLobbyPlayersUI();
  });

  // Подключение к каналу Supabase Realtime для лобби
  async function connectToLobbyChannel(lobbyId) {
    if (channel) {
      await channel.unsubscribe();
      channel = null;
    }

    channel = supabaseClient.channel('public:dice_lobby_' + lobbyId);

    channel.on('broadcast', { event: 'lobby_created' }, handleLobbyCreated);
    channel.on('broadcast', { event: 'player_joined' }, handlePlayerJoined);
    channel.on('broadcast', { event: 'player_left' }, handlePlayerLeft);
    channel.on('broadcast', { event: 'start_game' }, handleStartGame);
    channel.on('broadcast', { event: 'player_rolled' }, handlePlayerRolled);
    channel.on('broadcast', { event: 'game_ended' }, handleGameEnded);

    await channel.subscribe();
  }

  // Обработчики событий канала

  function handleLobbyCreated({ payload }) {
    lobby = payload.lobby;
    updateLobbyPlayersUI();
  }

  // Игрок присоединился — вызываем place_bet_dice RPC и рассылаем событие
  async function handlePlayerJoined({ payload }) {
    const player = payload.player;
    if (!lobby.players.find(p => p.id === player.id)) {
      // Вызываем RPC для размещения ставки новым игроком
      const { error: betError } = await supabaseClient.rpc('place_bet_dice');

      if (error) {
        console.error('Ошибка размещения ставки для игрока', player.username, error.message);
        return;
      }

      lobby.players.push({ ...player, roll: null });
      updateLobbyPlayersUI();

      if (lobby.players.length === lobby.maxPlayers && !lobby.gameStarted) {
        lobby.gameStarted = true;
        channel.send({
          type: 'broadcast',
          event: 'start_game',
          payload: { lobby }
        });
      }
    }
  }

  function handlePlayerLeft({ payload }) {
    const playerId = payload.playerId;
    lobby.players = lobby.players.filter(p => p.id !== playerId);
    updateLobbyPlayersUI();

    if (lobby.gameStarted && lobby.players.length < 2) {
      gameMessageDiv.textContent = 'Игра прервана — недостаточно игроков.';
      rollDiceBtn.disabled = true;
    }
  }

  function handleStartGame({ payload }) {
    lobby = payload.lobby;
    createLobbyForm.style.display = 'none';
    lobbyWaitingDiv.style.display = 'none';
    gameDiv.style.display = 'block';

    diceResultsDiv.innerHTML = '';
    gameMessageDiv.textContent = 'Игра началась! Бросьте кости.';

    rollDiceBtn.disabled = false;
    exitGameBtn.style.display = 'none';
    hasRolled = false;
  }

  // Игрок бросил кости — отправляем RPC для сохранения результата и проверяем завершение
  rollDiceBtn.addEventListener('click', async () => {
    if (hasRolled || !lobby) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    hasRolled = true;

    // Отправляем RPC, чтобы сохранить бросок и проверить игру
    const { data, error } = await supabaseClient.rpc('player_roll_dice', {
      round_id: lobby.id,
      player_id: currentUser.id,
      roll_value: roll
    });

    if (error) {
      alert('Ошибка при броске кости: ' + error.message);
      hasRolled = false;
      return;
    }

    gameMessageDiv.textContent = `Вы бросили: ${roll}. Ждите остальных игроков...`;
    rollDiceBtn.disabled = true;
    // Сервер через Realtime оповестит всех игроков о бросках и завершении
  });

  // Обработка события броска игрока
  function handlePlayerRolled({ payload }) {
    const { playerId, roll } = payload;

    const player = lobby.players.find(p => p.id === playerId);
    if (player) {
      player.roll = roll;
    }

    updateDiceResultsUI();

    lobby.rollsDoneCount = lobby.players.filter(p => p.roll !== null).length;

    if (lobby.rollsDoneCount === lobby.players.length) {
      // Все бросили — победитель уже определён на сервере, ждём событие game_ended
      gameMessageDiv.textContent = 'Все бросили. Ожидаем результат...';
    }
  }

  // Игра завершена — сервер присылает победителя и результаты
  function handleGameEnded({ payload }) {
    const { winner, rolls } = payload;

    // Обновляем броски игроков
    lobby.players.forEach(p => {
      const playerRoll = rolls.find(r => r.player_id === p.id);
      p.roll = playerRoll ? playerRoll.roll : null;
    });
    updateDiceResultsUI();

    if (winner) {
      gameMessageDiv.textContent = `Победитель: ${winner.username}! Выигрыш зачислен на счёт.`;
    } else {
      gameMessageDiv.textContent = 'Игра завершилась ничьей.';
    }

    rollDiceBtn.disabled = true;
    exitGameBtn.style.display = 'inline-block';
  }

  // Обновление списка игроков в лобби
  function updateLobbyPlayersUI() {
    lobbyPlayersList.innerHTML = '';
    lobby.players.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p.username + (p.id === currentUser.id ? ' (Вы)' : '');
      lobbyPlayersList.appendChild(li);
    });
  }

  // Обновление результатов бросков
  function updateDiceResultsUI() {
    diceResultsDiv.innerHTML = '';
    lobby.players.forEach(p => {
      const div = document.createElement('div');
      div.textContent = `${p.username}: ${p.roll === null ? 'не бросал' : p.roll}`;
      diceResultsDiv.appendChild(div);
    });
  }

  // Выход из лобби до старта игры
  leaveLobbyBtn.addEventListener('click', async () => {
    if (!lobby) return;

    channel.send({
      type: 'broadcast',
      event: 'player_left',
      payload: { playerId: currentUser.id }
    });

    await channel.unsubscribe();
    channel = null;
    lobby = null;

    resetUI();
  });

  // Выход из игры после завершения
  exitGameBtn.addEventListener('click', async () => {
    if (!lobby) return;

    await channel.unsubscribe();
    channel = null;
    lobby = null;

    resetUI();
  });

  // Присоединение к существующему лобби (если реализуете)
  async function joinLobby(lobbyId) {
    await connectToLobbyChannel(lobbyId);

    channel.send({
      type: 'broadcast',
      event: 'player_joined',
      payload: {
        player: {
          id: currentUser.id,
          username: currentUser.username
        }
      }
    });

    createLobbyForm.style.display = 'none';
    lobbyWaitingDiv.style.display = 'block';
  }

});
