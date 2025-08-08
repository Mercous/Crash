

const supabaseClient = window.supabaseClient;

document.addEventListener('DOMContentLoaded', () => {
  const transferForm = document.getElementById('transfer-form');
  const transferRecipientInput = document.getElementById('transfer-recipient');
  const transferAmountInput = document.getElementById('transfer-amount');
  const userBalanceSpan = document.getElementById('balance-value');
  const userNameSpan = document.getElementById('user-name');
  const topList = document.getElementById('top-list');

  let currentUser = null;


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

   
    const { error } = await supabaseClient.rpc('transfer_crystals', {
      sender: currentUser.id,
      recipient_name: recipientName,
      amount,
    });

    if (error) {
      alert('Ошибка перевода: ' + error.message);
    } else {
      alert(`Успешно переведено ${amount} кристаллов игроку ${recipientName}`);
   
      transferRecipientInput.value = '';
      transferAmountInput.value = '';
    
      await loadUser();
      
      await loadTopBalance();
    }
  });

 
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


  (async () => {
    await loadUser();
    await loadTopBalance();
  })();
});

