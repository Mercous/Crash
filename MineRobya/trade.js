document.addEventListener('DOMContentLoaded', () => {
  const supabaseClient = window.supabaseClient;

  const createListingForm = document.getElementById('create-listing-form');
  const sellerNameInput = document.getElementById('seller-name');
  const itemNameInput = document.getElementById('item-name');
  const itemPriceInput = document.getElementById('item-price');
  const pickupLocationInput = document.getElementById('pickup-location');
  const listingsList = document.getElementById('listings-list');
  const purchaseInfo = document.getElementById('purchase-info');

  let currentUser = null;

  async function loadUser() {
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser();

    if (error || !user) {
      currentUser = null;
      sellerNameInput.value = '';
      sellerNameInput.disabled = true;
      return;
    }

    currentUser = user;

    const { data, error: profileError } = await supabaseClient
      .from('users')
      .select('username')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Ошибка получения профиля:', profileError.message);
      sellerNameInput.value = '';
      sellerNameInput.disabled = false;
    } else {
      sellerNameInput.value = data.username;
      sellerNameInput.disabled = true;
    }
  }

  async function loadListings() {
    const { data, error } = await supabaseClient
      .from('trades')
      .select('id, username, item_name, price, location, created_at, sold')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      listingsList.innerHTML = '<li>Ошибка загрузки заявок</li>';
      console.error('Ошибка загрузки заявок:', error.message);
      return;
    }

    if (!data || data.length === 0) {
      listingsList.innerHTML = '<li>Пока нет заявок</li>';
      return;
    }

    // Показываем только непроданные заявки
    const activeListings = data.filter(listing => !listing.sold);

    if (activeListings.length === 0) {
      listingsList.innerHTML = '<li>Пока нет доступных заявок</li>';
      return;
    }

    listingsList.innerHTML = activeListings
  .map(
    (listing) =>
      `<li>
        <strong>${listing.item_name}</strong> за ${listing.price} 💎<br/>
        Продавец: ${listing.username}<br/>
        Место получения: ???<br/>
        <button class="buy-button" data-id="${listing.id}">Купить</button>
      </li>`
  )
  .join('');


    // Навесить обработчики на кнопки «Купить»
    document.querySelectorAll('.buy-button').forEach(button => {
      button.addEventListener('click', () => {
        const tradeId = button.getAttribute('data-id');
        buyListing(tradeId);
      });
    });
  }

  async function buyListing(tradeId) {
  if (!currentUser) {
    alert('Пожалуйста, войдите в систему, чтобы покупать предметы');
    return;
  }

  purchaseInfo.textContent = 'Обработка покупки...';

  // Вызов с правильными именами параметров
  const { data, error } = await supabaseClient.rpc('buy_trade', {
    p_buyer_id: currentUser.id,
    p_trade_id: tradeId,
  });

  if (error) {
    alert('Ошибка покупки: ' + error.message);
    purchaseInfo.textContent = '';
    return;
  }

  if (!data) {
    alert('Покупка не удалась, возможно, заявка уже продана');
    purchaseInfo.textContent = '';
    await loadListings();
    return;
  }

  // data — строка с местом получения
  purchaseInfo.textContent = `Покупка успешна! Место получения: ${data}`;

  await loadListings();
}

  createListingForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentUser) {
      alert('Пожалуйста, войдите в систему, чтобы создавать заявки');
      return;
    }

    const sellerName = sellerNameInput.value.trim();
    const itemName = itemNameInput.value.trim();
    const itemPrice = parseInt(itemPriceInput.value, 10);
    const pickupLocation = pickupLocationInput.value.trim();

    if (!sellerName || !itemName || !pickupLocation) {
      alert('Пожалуйста, заполните все поля');
      return;
    }

    if (isNaN(itemPrice) || itemPrice <= 0) {
      alert('Введите корректную цену');
      return;
    }

    if (itemPrice < 2) {
      alert('Минимальная цена заявки — 2 кристалла');
      return;
    }

    const { data: userData, error: userError } = await supabaseClient
      .from('users')
      .select('balance')
      .eq('id', currentUser.id)
      .single();

    if (userError || !userData) {
      alert('Не удалось проверить баланс');
      return;
    }

    if (userData.balance < 2) {
      alert('Недостаточно кристаллов для создания заявки (нужно 2)');
      return;
    }

    const { error } = await supabaseClient.rpc('create_trade', {
      p_user_id: currentUser.id,
      p_username: sellerName,
      p_item_name: itemName,
      p_price: itemPrice,
      p_location: pickupLocation,
    });

    if (error) {
      alert('Ошибка создания заявки: ' + error.message);
      return;
    }

    alert('Заявка успешно создана! Списано 2 кристалла.');

    itemNameInput.value = '';
    itemPriceInput.value = '';
    pickupLocationInput.value = '';

    await loadListings();
  });

  (async () => {
    await loadUser();
    await loadListings();
  })();
});
