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

  // Новый контейнер для списка лобби
  const lobbyListDiv = document.createElement('div');
  lobbyListDiv.id = 'lobby-list';
  lobbyListDiv.style = 'margin-top: 20px; border: 1px solid #ccc; padding: 10px; max-height: 200px; overflow-y: auto;';
  lobbyListDiv.innerHTML = '<h3>Доступные лобби</h3><div id="lobby-items"></div>';
  sectionDice.querySelector('#dice-lobby-creation').insertAdjacentElement('afterend', lobbyListDiv);
  const lobbyItemsDiv = document.getElementById('lobby-items');

  // Переменные состояния
  let currentUser = null;
  let lobby = null; // { id, betAmount, maxPlayers, players: [{id, username, roll}], rollsDoneCount, gameStarted }
  let channel = null;
  let lobbyListChannel = null;
  let hasRolled = false;

  // Список открытых лобби
  let lobbyList = [];

  // Инициализация
  (async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
      alert('Пожалуйста, войдите в систему, чтобы играть в кости');
      return;
    }
    currentUser = await loadUserProfile(session.user.id);
    showDiceScreen();

    // Подписка на общий канал списка лобби
    lobbyListChannel = supabaseClient.channel('public:dice_lobby_list');

    lobbyListChannel.on('broadcast', { event: 'lobby_created' }, ({ payload }) => {
      addLobbyToList(payload.lobby);
    });

    lobbyListChannel.on('broadcast', { event: 'lobby_closed' }, ({ payload }) => {
      removeLobbyFromList(payload.lobbyId);
    });

    await lobbyListChannel.subscribe();

    // Загрузка текущих открытых лобби из БД
    await loadOpenLobbies();
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

  // Добавить лобби в список и отобразить
  function addLobbyToList(newLobby) {
    if (!lobbyList.find(l => l.id === newLobby.id)) {
      lobbyList.push(newLobby);
      renderLobbyList();
    }
  }

  // Удалить лобби из списка
  function removeLobbyFromList(lobbyId) {
    lobbyList = lobbyList.filter(l => l.id !== lobbyId);
    renderLobbyList();
  }

  // Отобразить список лобби в UI
  function renderLobbyList() {
    lobbyItemsDiv.innerHTML = '';
    if (lobbyList.length === 0) {
      lobbyItemsDiv.textContent = 'Нет доступных лобби';
      return;
    }
    lobbyList.forEach(l => {
      const div = document.createElement('div');
      div.classList.add('lobby-item');
      div.style = 'margin-bottom: 8px; padding: 6px; border: 1px solid #888; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;';
      div.textContent = `Лобби ${l.id} | Ставка: ${l.betAmount} | Игроков: ${l.players ? l.players.length : 0}/${l.maxPlayers}`;

      const joinBtn = document.createElement('button');
      joinBtn.textContent = 'Присоединиться';
      joinBtn.style = 'margin-left: 12px; padding: 4px 8px; cursor: pointer;';
      joinBtn.disabled = lobby !== null; // нельзя присоединяться, если вы уже в лобби
      joinBtn.addEventListener('click', () => joinLobby(l.id));

      div.appendChild(joinBtn);
      lobbyItemsDiv.appendChild(div);
    });
  }

  // Загрузить открытые лобби из БД
  async function loadOpenLobbies() {
    // Теперь из rounds с фильтром game_type='dice' и ended_at IS NULL
    const { data: rounds, error: roundsError } = await supabaseClient
      .from('rounds')
      .select('id, bet_amount, max_players')
      .eq('game_type', 'dice')
      .is('ended_at', null);

    if (roundsError) {
      console.error('Ошибка загрузки раундов:', roundsError.message);
      return;
    }

    // Для каждого раунда загрузим игроков из bets + users
    lobbyList = [];

    for (const round of rounds) {
      const { data: bets, error: betsError } = await supabaseClient
        .from('bets')
        .select('user_id, roll_value, users(username)')
        .eq('round_id', round.id);

      if (betsError) {
        console.error('Ошибка загрузки игроков для раунда', round.id, betsError.message);
        continue;
      }

      const players = bets.map(b => ({
        id: b.user_id,
        username: b.users.username,
        roll: b.roll_value ?? null
      }));

      lobbyList.push({
        id: round.id,
        betAmount: round.bet_amount,
        maxPlayers: round.max_players,
        players
      });
    }

    renderLobbyList();
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
      betAmount,
      maxPlayers,
      players: [{
        id: currentUser.id,
        username: currentUser.username,
        roll: null
      }],
      rollsDoneCount: 0,
      gameStarted: false
    };

    await connectToLobbyChannel(lobby.id);

    const { error: betError } = await supabaseClient.rpc('place_bet_dice');

    if (betError) {
      alert('Ошибка размещения ставки: ' + betError.message);
      await channel.unsubscribe();
      channel = null;
      lobby = null;
      resetUI();
      return;
    }

    // Отправляем событие в общий канал списка лобби
    if (lobbyListChannel) {
      lobbyListChannel.send({
        type: 'broadcast',
        event: 'lobby_created',
        payload: { lobby }
      });
    }

    // Добавляем в локальный список и обновляем UI
    addLobbyToList(lobby);

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

  async function handlePlayerJoined({ payload }) {
    const player = payload.player;
    if (!lobby.players.find(p => p.id === player.id)) {
      const { error: betError } = await supabaseClient.rpc('place_bet_dice');

      if (betError) {
        console.error('Ошибка размещения ставки для игрока', player.username, betError.message);
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

        // Убираем лобби из общего списка
        if (lobbyListChannel) {
          lobbyListChannel.send({
            type: 'broadcast',
            event: 'lobby_closed',
            payload: { lobbyId: lobby.id }
          });
        }
        removeLobbyFromList(lobby.id);
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

  // Игрок бросил кости
  rollDiceBtn.addEventListener('click', async () => {
    if (hasRolled || !lobby) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    hasRolled = true;

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
  });

  function handlePlayerRolled({ payload }) {
    const { playerId, roll } = payload;

    const player = lobby.players.find(p => p.id === playerId);
    if (player) {
      player.roll = roll;
    }

    updateDiceResultsUI();

    lobby.rollsDoneCount = lobby.players.filter(p => p.roll !== null).length;

    if (lobby.rollsDoneCount === lobby.players.length) {
      gameMessageDiv.textContent = 'Все бросили. Ожидаем результат...';
    }
  }

  function handleGameEnded({ payload }) {
    const { winner, rolls } = payload;

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

  function updateLobbyPlayersUI() {
    lobbyPlayersList.innerHTML = '';
    lobby.players.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p.username + (p.id === currentUser.id ? ' (Вы)' : '');
      lobbyPlayersList.appendChild(li);
    });
  }

  function updateDiceResultsUI() {
    diceResultsDiv.innerHTML = '';
    lobby.players.forEach(p => {
      const div = document.createElement('div');
      div.textContent = `${p.username}: ${p.roll === null ? 'не бросал' : p.roll}`;
      diceResultsDiv.appendChild(div);
    });
  }

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

  exitGameBtn.addEventListener('click', async () => {
    if (!lobby) return;

    await channel.unsubscribe();
    channel = null;
    lobby = null;

    resetUI();
  });

  // Присоединение к существующему лобби
  async function joinLobby(lobbyId) {
    if (lobby) {
      alert('Вы уже в лобби');
      return;
    }

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

    // Удаляем лобби из списка открытых, т.к. вы в нем
    removeLobbyFromList(lobbyId);
  }
});
