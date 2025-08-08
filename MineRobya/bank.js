// bank.js
// Здесь нужно либо повторно инициализировать supabaseClient, либо получить из script.js
// Для простоты повторим инициализацию (используйте те же URL и KEY)

const supabaseClient = window.supabaseClient;

document.addEventListener('DOMContentLoaded', () => {
  const transferForm = document.getElementById('transfer-form');
  const transferRecipientInput = document.getElementById('transfer-recipient');
  const transferAmountInput = document.getElementById('transfer-amount');
  const userBalanceSpan = document.getElementById('balance-value');
  const userNameSpan = document.getElementById('user-name');
  const topList = document.getElementById('top-list');

  let currentUser = null;

  // Получить текущего пользователя и показать баланс
  async function loadUser() {
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser();

    if (error || !user) {
      currentUser = null;
      userNameSpan.textContent = '';
      userBalanceSpan.textContent = '0';
      return;
    }

    currentUser = user;

    // Получить профиль из таблицы users
    const { data, error: profileError } = await supabaseClient
      .from('users')
      .select('username, balance')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Ошибка получения профиля:', profileError.message);
      userNameSpan.textContent = user.email || 'Игрок';
      userBalanceSpan.textContent = '?';
    } else {
      userNameSpan.textContent = data.username;
      userBalanceSpan.textContent = data.balance;
    }
  }

  // Обработчик формы перевода
  transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentUser) {
      alert('Пожалуйста, войдите в систему, чтобы переводить кристаллы');
      return;
    }

    const recipientName = transferRecipientInput.value.trim();
    const amount = parseInt(transferAmountInput.value, 10);

    if (!recipientName) {
      alert('Введите имя получателя');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      alert('Введите корректную сумму');
      return;
    }

    // Вызов RPC-функции transfer_crystals
    const { error } = await supabaseClient.rpc('transfer_crystals', {
      sender: currentUser.id,
      recipient_name: recipientName,
      amount,
    });

    if (error) {
      alert('Ошибка перевода: ' + error.message);
    } else {
      alert(`Успешно переведено ${amount} кристаллов игроку ${recipientName}`);
      // Очистить форму
      transferRecipientInput.value = '';
      transferAmountInput.value = '';
      // Обновить баланс
      await loadUser();
      // Обновить топ
      await loadTopBalance();
    }
  });

  // Загрузка топа игроков по балансу
  async function loadTopBalance() {
    const { data, error } = await supabaseClient
      .from('users')
      .select('username, balance')
      .order('balance', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Ошибка загрузки топа:', error.message);
      topList.innerHTML = '<li>Ошибка загрузки топа</li>';
      return;
    }

    if (!data || data.length === 0) {
      topList.innerHTML = '<li>Пока нет игроков</li>';
      return;
    }

    topList.innerHTML = data
      .map(
        (user, index) =>
          `<li>${index + 1}. ${user.username} — ${user.balance} 💎</li>`
      )
      .join('');
  }

  // При загрузке страницы
  (async () => {
    await loadUser();
    await loadTopBalance();
  })();
});
