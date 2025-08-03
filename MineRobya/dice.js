document.addEventListener('DOMContentLoaded', () => {
  const supabaseClient = window.supabaseClient;

  // UI элементы
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

  // Контейнер для списка лобби
  const lobbyListDiv = document.createElement('div');
  lobbyListDiv.id = 'lobby-list';
  lobbyListDiv.style = 'margin-top: 20px; border: 1px solid #ccc; padding: 10px; max-height: 200px; overflow-y: auto;';
  lobbyListDiv.innerHTML = '<h3>Доступные лобби</h3><div id="lobby-items"></div>';
  sectionDice.querySelector('#dice-lobby-creation').insertAdjacentElement('afterend', lobbyListDiv);
  const lobbyItemsDiv = document.getElementById('lobby-items');

  // Состояния
  let currentUser = null;
  let lobby = null;
  let channel = null;
  let lobbyListChannel = null;
  let hasRolled = false;
  let refreshInterval = null;

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

    lobbyListChannel = supabaseClient.channel('public:dice_lobby_list');

    lobbyListChannel.on('broadcast', { event: 'lobby_created' }, ({ payload }) => {
      addLobbyToList(payload.lobby);
    });

    lobbyListChannel.on('broadcast', { event: 'lobby_closed' }, ({ payload }) => {
      removeLobbyFromList(payload.lobbyId);
    });

    await lobbyListChannel.subscribe();
    await loadOpenLobbies();
  })();

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

  function showDiceScreen() {
    document.querySelectorAll('main .screen').forEach(s => s.classList.remove('active'));
    sectionDice.classList.add('active');
    lobby = null;
    hasRolled = false;
    resetUI();
  }

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

    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function addLobbyToList(newLobby) {
    if (!lobbyList.find(l => l.id === newLobby.id)) {
      lobbyList.push(newLobby);
      renderLobbyList();
    }
  }

  function removeLobbyFromList(lobbyId) {
    lobbyList = lobbyList.filter(l => l.id !== lobbyId);
    renderLobbyList();
  }

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
      joinBtn.disabled = lobby !== null;
      joinBtn.addEventListener('click', () => joinLobby(l.id));

      div.appendChild(joinBtn);
      lobbyItemsDiv.appendChild(div);
    });
  }

  async function loadOpenLobbies() {
    const { data: rounds, error: roundsError } = await supabaseClient
      .from('rounds')
      .select('id, bet_amount, max_players')
      .eq('game_type', 'dice')
      .eq('game_started', false)
      .is('ended_at', null);

    if (roundsError) {
      console.error('Ошибка загрузки раундов:', roundsError.message);
      return;
    }

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
        players,
        gameStarted: false,
        rollsDoneCount: 0
      });
    }

    renderLobbyList();
  }

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

    const { error: betError } = await supabaseClient.rpc('place_bet_dice', {
      p_round_id: newRound.id,
      p_player_id: currentUser.id,
      p_bet_amount: betAmount
    });
    if (betError) {
      alert('Ошибка размещения ставки: ' + betError.message);
      return;
    }

    const { data: roundData, error: roundError } = await supabaseClient
      .from('rounds')
      .select('id, bet_amount, max_players, game_started')
      .eq('id', newRound.id)
      .single();

    if (roundError) {
      alert('Ошибка загрузки данных раунда: ' + roundError.message);
      return;
    }

    const { data: bets, error: betsError } = await supabaseClient
      .from('bets')
      .select('user_id, roll_value, users(username)')
      .eq('round_id', newRound.id);

    if (betsError) {
      alert('Ошибка загрузки игроков: ' + betsError.message);
      return;
    }

    const players = bets.map(b => ({
      id: b.user_id,
      username: b.users.username,
      roll: b.roll_value ?? null
    }));

    lobby = {
      id: roundData.id,
      betAmount: roundData.bet_amount,
      maxPlayers: roundData.max_players,
      players,
      rollsDoneCount: players.filter(p => p.roll !== null).length,
      gameStarted: roundData.game_started,
      ended: false
    };

    await connectToLobbyChannel(lobby.id);

    if (lobbyListChannel) {
      lobbyListChannel.send({
        type: 'broadcast',
        event: 'lobby_created',
        payload: { lobby }
      });
    }

    addLobbyToList(lobby);

    createLobbyForm.style.display = 'none';
    lobbyWaitingDiv.style.display = 'block';
    updateLobbyPlayersUI();

    if (lobby.gameStarted) {
      handleStartGame({ payload: { lobby } });
    }
  });

  async function connectToLobbyChannel(lobbyId) {
    if (channel) {
      await channel.unsubscribe();
      channel = null;
    }

    channel = supabaseClient.channel('public:dice_lobby_' + lobbyId);

    await refreshLobbyState(lobbyId);

    channel.on('broadcast', { event: 'lobby_created' }, handleLobbyCreated);
    channel.on('broadcast', { event: 'player_joined' }, handlePlayerJoined);
    channel.on('broadcast', { event: 'player_left' }, handlePlayerLeft);
    channel.on('broadcast', { event: 'start_game' }, handleStartGame);
    channel.on('broadcast', { event: 'player_rolled' }, handlePlayerRolled);
    channel.on('broadcast', { event: 'game_ended' }, handleGameEnded);

    channel.on('postgres_changes', {
      event: 'update',
      schema: 'public',
      table: 'rounds',
      filter: `id=eq.${lobbyId}`
    }, async ({ new: updatedRound }) => {
      if (!lobby) return;
      if (updatedRound.ended_at && !lobby.ended) {
        lobby.ended = true;
        await handleGameEnded();
      }
    });

    channel.on('postgres_changes', {
      event: 'update',
      schema: 'public',
      table: 'bets',
      filter: `round_id=eq.${lobbyId}`
    }, async ({ new: updatedBet }) => {
      if (!lobby) return;
      if (updatedBet.roll_value === null) return;

      const player = lobby.players.find(p => p.id === updatedBet.user_id);
      if (player) {
        player.roll = updatedBet.roll_value;
        lobby.rollsDoneCount = lobby.players.filter(p => p.roll !== null).length;
        updateDiceResultsUI();

        if (lobby.rollsDoneCount === lobby.players.length && !lobby.ended) {
          gameMessageDiv.textContent = 'Все бросили. Определяем победителя...';
          
          setTimeout(async () => {
            const { error } = await supabaseClient.rpc('finish_dice_round', {
              p_round_id: lobby.id
            });
            
            if (error) {
              console.error('Ошибка завершения раунда:', error.message);
              return;
            }
            
            await refreshLobbyState(lobby.id);
          }, 2000);
        }
      }
    });

    await channel.subscribe();

    refreshInterval = setInterval(async () => {
      if (lobby && !lobby.gameStarted) {
        await refreshLobbyState(lobby.id);
      }
    }, 3000);
  }

  async function refreshLobbyState(lobbyId) {
    const { data: roundData, error: roundError } = await supabaseClient
      .from('rounds')
      .select('id, bet_amount, max_players, game_started, ended_at')
      .eq('id', lobbyId)
      .single();

    if (roundError) {
      console.error('Ошибка загрузки данных раунда:', roundError.message);
      return;
    }

    const { data: bets, error: betsError } = await supabaseClient
      .from('bets')
      .select('user_id, roll_value, users(username), profit, crashed')
      .eq('round_id', lobbyId);

    if (betsError) {
      console.error('Ошибка загрузки ставок:', betsError.message);
      return;
    }

    const players = bets.map(b => ({
      id: b.user_id,
      username: b.users.username,
      roll: b.roll_value ?? null,
      profit: b.profit,
      crashed: b.crashed
    }));

    if (!lobby) {
      lobby = {
        id: roundData.id,
        betAmount: roundData.bet_amount,
        maxPlayers: roundData.max_players,
        players,
        rollsDoneCount: players.filter(p => p.roll !== null).length,
        gameStarted: roundData.game_started,
        ended: !!roundData.ended_at
      };
    } else {
      Object.assign(lobby, {
        id: roundData.id,
        betAmount: roundData.bet_amount,
        maxPlayers: roundData.max_players,
        gameStarted: roundData.game_started,
        ended: !!roundData.ended_at
      });

      players.forEach(newPlayer => {
        const existingPlayer = lobby.players.find(p => p.id === newPlayer.id);
        if (existingPlayer) {
          Object.assign(existingPlayer, newPlayer);
        } else {
          lobby.players.push(newPlayer);
        }
      });

      lobby.players = lobby.players.filter(p => players.find(np => np.id === p.id));
      lobby.rollsDoneCount = players.filter(p => p.roll !== null).length;
    }

    updateLobbyPlayersUI();
    updateDiceResultsUI();

    if (lobby.ended && gameDiv.style.display !== 'none') {
      await handleGameEnded();
    }
  }

  async function handleGameEnded() {
    if (!lobby) return;

    // Находим максимальное значение броска
    const maxRoll = Math.max(...lobby.players.map(p => p.roll || 0));
    
    // Получаем список победителей (игроков с максимальным броском)
    const winners = lobby.players.filter(p => p.roll === maxRoll);
    
    if (winners.length === 0) {
      gameMessageDiv.textContent = 'Игра завершилась ничьей (нет бросков)';
    } else if (winners.length === 1) {
      gameMessageDiv.textContent = `Победитель: ${winners[0].username}! Выигрыш: ${winners[0].profit}`;
    } else {
      const winnerNames = winners.map(w => w.username).join(', ');
      gameMessageDiv.textContent = `Ничья между: ${winnerNames}. Выигрыш: ${winners[0].profit} каждому`;
    }

    exitGameBtn.style.display = 'inline-block';
    rollDiceBtn.disabled = true;

    // Обновляем баланс если текущий пользователь победил
    if (winners.some(w => w.id === currentUser.id)) {
      currentUser = await loadUserProfile(currentUser.id);
    }
  }

  function handleLobbyCreated({ payload }) {
    if (!lobby) {
      lobby = payload.lobby;
    } else {
      Object.assign(lobby, payload.lobby);

      payload.lobby.players.forEach(newPlayer => {
        const existingPlayer = lobby.players.find(p => p.id === newPlayer.id);
        if (existingPlayer) {
          Object.assign(existingPlayer, newPlayer);
        } else {
          lobby.players.push(newPlayer);
        }
      });
    }
    updateLobbyPlayersUI();
    updateDiceResultsUI();
  }

  async function handlePlayerJoined({ payload }) {
    const player = payload.player;

    if (lobby.players.find(p => p.id === player.id)) return;

    if (player.id === currentUser.id) {
      const { error: betError } = await supabaseClient.rpc('place_bet_dice', {
        p_round_id: lobby.id,
        p_player_id: player.id,
        p_bet_amount: lobby.betAmount
      });
      if (betError) {
        console.error('Ошибка размещения ставки для игрока', player.username, betError.message);
        return;
      }
    }

    lobby.players.push({ ...player, roll: null });
    updateLobbyPlayersUI();

    if (lobby.players.length === lobby.maxPlayers && !lobby.gameStarted) {
      const { error: startError } = await supabaseClient.rpc('start_dice_round', { p_round_id: lobby.id });
      if (startError) {
        console.error('Ошибка запуска игры:', startError.message);
        return;
      }

      lobby.gameStarted = true;

      channel.send({
        type: 'broadcast',
        event: 'start_game',
        payload: { lobby }
      });

      if (currentUser.id === lobby.players[0].id) {
        handleStartGame({ payload: { lobby } });
      }

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

  async function handlePlayerLeft({ payload }) {
    const playerId = payload.playerId;

    try {
      await supabaseClient
        .from('bets')
        .delete()
        .eq('round_id', lobby.id)
        .eq('user_id', playerId);
    } catch (e) {
      console.error('Ошибка удаления ставки игрока при выходе:', e.message);
    }

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

  function handlePlayerRolled({ payload }) {
    const playerId = payload.playerId ?? payload.player_id;
    const roll = payload.roll ?? payload.roll_value;

    const player = lobby.players.find(p => p.id === playerId);
    if (player) {
      player.roll = roll;
      lobby.rollsDoneCount = lobby.players.filter(p => p.roll !== null).length;
      updateDiceResultsUI();

      if (lobby.rollsDoneCount === lobby.players.length && !lobby.ended) {
        gameMessageDiv.textContent = 'Все бросили. Ожидаем результат...';
      }
    }
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

  rollDiceBtn.addEventListener('click', async () => {
    if (hasRolled || !lobby || lobby.ended) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    hasRolled = true;

    const { data: rollResult, error } = await supabaseClient.rpc('player_roll_dice', {
      p_round_id: lobby.id,
      p_player_id: currentUser.id,
      p_roll_value: roll
    });

    if (error) {
      alert('Ошибка при броске кости: ' + error.message);
      hasRolled = false;
      return;
    }

    const player = lobby.players.find(p => p.id === currentUser.id);
    if (player) {
      player.roll = roll;
    }
    updateDiceResultsUI();

    channel.send({
      type: 'broadcast',
      event: 'player_rolled',
      payload: {
        playerId: currentUser.id,
        roll_value: roll,
        username: currentUser.username
      }
    });

    gameMessageDiv.textContent = `Вы бросили: ${roll}. Ждите остальных игроков...`;
    rollDiceBtn.disabled = true;
  });

  leaveLobbyBtn.addEventListener('click', async () => {
    if (!lobby) return;

    try {
      await supabaseClient
        .from('bets')
        .delete()
        .eq('round_id', lobby.id)
        .eq('user_id', currentUser.id);
    } catch (e) {
      console.error('Ошибка удаления ставки при выходе из лобби:', e.message);
    }

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

  async function joinLobby(lobbyId) {
    if (lobby) {
      alert('Вы уже в лобби');
      return;
    }

    await connectToLobbyChannel(lobbyId);

    const { data: roundData, error: roundError } = await supabaseClient
      .from('rounds')
      .select('id, bet_amount, max_players, game_started')
      .eq('id', lobbyId)
      .single();

    if (roundError) {
      alert('Ошибка загрузки данных лобби: ' + roundError.message);
      return;
    }

    const { data: bets, error: betsError } = await supabaseClient
      .from('bets')
      .select('user_id, roll_value, users(username)')
      .eq('round_id', lobbyId);

    if (betsError) {
      alert('Ошибка загрузки игроков лобби: ' + betsError.message);
      return;
    }

    const players = bets.map(b => ({
      id: b.user_id,
      username: b.users.username,
      roll: b.roll_value ?? null
    }));

    lobby = {
      id: roundData.id,
      betAmount: roundData.bet_amount,
      maxPlayers: roundData.max_players,
      players,
      rollsDoneCount: players.filter(p => p.roll !== null).length,
      gameStarted: roundData.game_started,
      ended: false
    };

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

    removeLobbyFromList(lobbyId);

    updateLobbyPlayersUI();
  }
});
