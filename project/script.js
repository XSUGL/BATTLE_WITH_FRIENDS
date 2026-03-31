(() => {
  'use strict';

  const STORAGE_KEY = 'toybox_cat_state_v1';
  const DAILY_BONUS_BASE = 10000;
  const DAILY_XP = 20;
  const DAILY_STREAK_CAP_EXTRA = 10000; // max added over base, coins

  const REFERRAL_COINS = 2500;
  const REFERRAL_XP = 6;
  const DAILY_STREAK_START = 1;
  const IDLE_STAGE1_AT_MS = 90000; // 1.5 минут
  const IDLE_STAGE2_AT_MS = 240000; // 4 минуты

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const el = (id) => document.getElementById(id);
  const q = (sel) => document.querySelector(sel);

  function getLocalDateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getDateKeyOffsetDays(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return getLocalDateKey(d);
  }

  function getYesterdayKey() {
    return getDateKeyOffsetDays(-1);
  }

  function xpToNext(level) {
    // Curved progression: early levels are faster, then it slows.
    return Math.floor(100 + (level - 1) * 75 + (level - 1) * (level - 1) * 10);
  }

  function computeLevelFromXp(xpTotal) {
    let level = 1;
    let remaining = Math.max(0, xpTotal);
    // Small loop: UI levels will not be huge.
    while (remaining >= xpToNext(level)) {
      remaining -= xpToNext(level);
      level++;
      if (level > 999) break;
    }
    return { level, xpInLevel: remaining, xpNext: xpToNext(level) };
  }

  function safeJsonParse(str, fallback) {
    try {
      const v = JSON.parse(str);
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }

  function makeProfileId() {
    // Simple unique-ish id for local-only referral links.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function defaultState() {
    return {
      profileId: makeProfileId(),
      coins: 0,
      xpTotal: 0,
      stats: {
        hunger: 88, // fullness: 0..100 (higher = better)
        energy: 100,
        mood: 92,
        clean: 90,
      },
      equipped: {
        hat: null,
        glasses: null,
        outfit: null,
      },
      daily: {
        lastClaimedDateKey: null,
        streakCount: 0,
      },
      referral: {
        lastAppliedRef: null,
      },
      lastInteractionAt: Date.now(),
      lastTickAt: performance.now(),
      lastActionAt: 0,
    };
  }

  let state = loadState();
  let saveTimer = null;
  let uiPaused = false;

  let idleStage1Fired = false;
  let idleStage2Fired = false;

  // UI refs
  const toast = q('#toast');
  const moodChip = el('moodChip');

  const barHunger = el('barHunger');
  const barEnergy = el('barEnergy');
  const barMood = el('barMood');
  const barClean = el('barClean');

  const hungerText = el('hungerText');
  const energyText = el('energyText');
  const moodText = el('moodText');
  const cleanText = el('cleanText');

  const coinsEl = el('coins');
  const levelEl = el('level');
  const xpTextEl = el('xpText');

  const cat = q('#pet');
  const pupilL = el('pupilL');
  const pupilR = el('pupilR');
  const equipLayer = el('equipLayer');
  const petHand = q('#petHand');
  let lastEquippedSignature = '';

  const btnFeed = el('btnFeed');
  const btnWash = el('btnWash');
  const btnSpin = el('btnSpin');
  const btnDaily = el('btnDaily');
  const dailyText = el('dailyText');
  const btnShare = el('btnShare');

  const gameModal = q('#gameModal');
  const modalTitle = el('modalTitle');
  const btnCloseModal = el('btnCloseModal');
  const btnStartGame = el('btnStartGame');
  const btnBackGame = el('btnBackGame');
  const canvas = el('gameCanvas');
  const ctx = canvas.getContext('2d');

  const shareModal = q('#shareModal');
  const shareCanvas = el('shareCanvas');
  const shareCtx = shareCanvas.getContext('2d');
  const btnCloseShare = el('btnCloseShare');
  const btnGenShare = el('btnGenShare');
  const btnDownloadShare = el('btnDownloadShare');
  const btnCopyShare = el('btnCopyShare');
  const btnBackShare = el('btnBackShare');
  const shareMeta = el('shareMeta');

  // Shop tabs
  const shopList = el('shopList');
  const shopTabs = q('.shop__tabs');

  // Idle/breathing
  let blinkTimer = 0;

  // Petting
  let pointerDown = false;
  let lastPetRewardAt = 0;
  let lastPointer = { x: 0, y: 0 };

  // Mini-game engine state
  let rafId = null;
  let currentGameId = null;

  const ITEMS = [
    // Hat (hat)
    { id: 'hat_mooncap', slot: 'hat', name: 'Лунная кепка', cost: 150, reqLevel: 1, visual: 'moon' },
    { id: 'hat_zig', slot: 'hat', name: 'Зигзаг-колпак', cost: 260, reqLevel: 3, visual: 'zig' },
    { id: 'hat_mystic', slot: 'hat', name: 'Мистик-шапка', cost: 420, reqLevel: 6, visual: 'mystic' },
    { id: 'hat_star', slot: 'hat', name: 'Звёздный чепчик', cost: 320, reqLevel: 4, visual: 'star' },
    { id: 'hat_swirl', slot: 'hat', name: 'Свитчворл-хвостик', cost: 520, reqLevel: 7, visual: 'swirl' },
    { id: 'hat_bow', slot: 'hat', name: 'Бант-пеплум', cost: 240, reqLevel: 2, visual: 'bow' },
    { id: 'hat_nori', slot: 'hat', name: 'Нори-капитан', cost: 460, reqLevel: 6, visual: 'nori' },
    { id: 'hat_robot', slot: 'hat', name: 'Робо-котик-тюбик', cost: 680, reqLevel: 9, visual: 'robot' },

    // Glasses (glasses)
    { id: 'glasses_spark', slot: 'glasses', name: 'Спарк-очки', cost: 160, reqLevel: 1, visual: 'spark' },
    { id: 'glasses_rim', slot: 'glasses', name: 'Ободки-рамка', cost: 310, reqLevel: 4, visual: 'rim' },
    { id: 'glasses_nebula', slot: 'glasses', name: 'Небула-линзы', cost: 490, reqLevel: 7, visual: 'nebula' },
    { id: 'glasses_visor', slot: 'glasses', name: 'Визор-лазер', cost: 220, reqLevel: 2, visual: 'visor' },
    { id: 'glasses_halo', slot: 'glasses', name: 'Хало-ободок', cost: 360, reqLevel: 5, visual: 'halo' },
    { id: 'glasses_comets', slot: 'glasses', name: 'Кометные стекла', cost: 540, reqLevel: 8, visual: 'comets' },

    // Outfit (outfit)
    { id: 'outfit_patch', slot: 'outfit', name: 'Костюм патчворк', cost: 200, reqLevel: 2, visual: 'patch' },
    { id: 'outfit_comfy', slot: 'outfit', name: 'Комфи-скафандр', cost: 360, reqLevel: 5, visual: 'comfy' },
    { id: 'outfit_prism', slot: 'outfit', name: 'Призма-накидка', cost: 520, reqLevel: 8, visual: 'prism' },
    { id: 'outfit_jacket', slot: 'outfit', name: 'Космо-куртка', cost: 280, reqLevel: 3, visual: 'jacket' },
    { id: 'outfit_tux', slot: 'outfit', name: 'Токсид-тюкс', cost: 460, reqLevel: 6, visual: 'tux' },
    { id: 'outfit_cape', slot: 'outfit', name: 'Капюшон-капель', cost: 640, reqLevel: 9, visual: 'cape' },
  ];

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = safeJsonParse(raw, null);
    if (!parsed) return defaultState();

    const base = defaultState();
    // Merge known fields defensively.
    return {
      ...base,
      ...parsed,
      profileId: typeof parsed.profileId === 'string' ? parsed.profileId : base.profileId,
      stats: { ...base.stats, ...(parsed.stats || {}) },
      equipped: { ...base.equipped, ...(parsed.equipped || {}) },
      daily: { ...base.daily, ...(parsed.daily || {}) },
      referral: { ...base.referral, ...(parsed.referral || {}) },
      lastInteractionAt: typeof parsed.lastInteractionAt === 'number' ? parsed.lastInteractionAt : base.lastInteractionAt,
      coins: typeof parsed.coins === 'number' ? parsed.coins : base.coins,
      xpTotal: typeof parsed.xpTotal === 'number' ? parsed.xpTotal : base.xpTotal,
    };
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Ignore storage errors (private mode, quota, etc.)
      }
    }, 220);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('show');
    // Force reflow so animation restarts.
    void toast.offsetWidth;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 1100);
  }

  function grantCoinsAndXp(coinsDelta, xpDelta, reason = '') {
    state.coins = Math.max(0, state.coins + coinsDelta);
    state.xpTotal = Math.max(0, state.xpTotal + xpDelta);
    scheduleSave();

    const rewardMsg = coinsDelta > 0 ? `+${coinsDelta}🪙` : coinsDelta < 0 ? `${coinsDelta}🪙` : '';
    const xpMsg = xpDelta > 0 ? ` +${xpDelta}XP` : '';
    if (reason) {
      showToast(`${reason}${rewardMsg}${xpMsg}`.trim());
    }
  }

  function updateLevelUI() {
    const { level, xpInLevel, xpNext } = computeLevelFromXp(state.xpTotal);
    levelEl.textContent = String(level);
    xpTextEl.textContent = `${xpInLevel} / ${xpNext}`;
  }

  function updateBarsUI() {
    const s = state.stats;
    hungerText.textContent = String(Math.round(s.hunger));
    energyText.textContent = String(Math.round(s.energy));
    moodText.textContent = String(Math.round(s.mood));
    cleanText.textContent = String(Math.round(s.clean));

    barHunger.style.setProperty('--p', `${clamp(s.hunger, 0, 100)}%`);
    barEnergy.style.setProperty('--p', `${clamp(s.energy, 0, 100)}%`);
    barMood.style.setProperty('--p', `${clamp(s.mood, 0, 100)}%`);
    barClean.style.setProperty('--p', `${clamp(s.clean, 0, 100)}%`);

    coinsEl.textContent = String(Math.max(0, state.coins));
    updateLevelUI();
  }

  function getMoodMode() {
    const { hunger, energy, mood, clean } = state.stats;
    const idleMs = Date.now() - state.lastInteractionAt;

    if (energy < 25 || (idleMs > IDLE_STAGE1_AT_MS && mood < 58)) return 'sleepy';
    if (hunger < 26 || clean < 26) return 'angry';
    if (mood > 70) return 'happy';
    return 'neutral';
  }

  function applyCatMoodClasses() {
    cat.classList.remove('mood-happy', 'mood-angry', 'mood-sleepy');
    const mode = getMoodMode();
    if (mode === 'happy') cat.classList.add('mood-happy');
    if (mode === 'angry') cat.classList.add('mood-angry');
    if (mode === 'sleepy') cat.classList.add('mood-sleepy');

    const s = state.stats;
    const modeText =
      mode === 'happy'
        ? 'Мур-мур. Я доволен(а).'
        : mode === 'angry'
          ? `Фырк! Мне не хватает: ${s.hunger < 30 ? 'еды' : 'чистоты'}.`
          : mode === 'sleepy'
            ? 'Клюю носом… дай отдохнуть.'
            : 'Я в норме… но не забывай.';
    moodChip.textContent = modeText;
  }

  function blinkNow() {
    cat.classList.add('is-blinking');
    window.setTimeout(() => cat.classList.remove('is-blinking'), 110);
  }

  function renderEquipped() {
    const sig = `${state.equipped.hat || ''}|${state.equipped.glasses || ''}|${state.equipped.outfit || ''}`;
    if (sig === lastEquippedSignature) return;
    lastEquippedSignature = sig;

    equipLayer.innerHTML = '';
    const e = state.equipped;

    if (e.hat) {
      const item = ITEMS.find((x) => x.id === e.hat);
      const node = document.createElement('div');
      node.className = `equip-hat equip-hat--${item.visual}`;
      equipLayer.appendChild(node);
    }
    if (e.glasses) {
      const item = ITEMS.find((x) => x.id === e.glasses);
      const node = document.createElement('div');
      node.className = `equip-glasses equip-glasses--${item.visual}`;
      equipLayer.appendChild(node);
    }
    if (e.outfit) {
      const item = ITEMS.find((x) => x.id === e.outfit);
      const node = document.createElement('div');
      node.className = `equip-outfit equip-outfit--${item.visual}`;
      equipLayer.appendChild(node);
    }
  }

  function setButtonsDisabledByCoins() {
    btnFeed.disabled = state.coins < 50;
    btnWash.disabled = state.coins < 30;
    btnSpin.disabled = state.coins < 15;
    btnDaily.disabled = !canClaimDailyBonus();
  }

  function canClaimDailyBonus() {
    const key = getLocalDateKey();
    return state.daily.lastClaimedDateKey !== key;
  }

  function computeDailyBonus(streakCount) {
    const s = Math.max(0, Number(streakCount) || 0);
    const extraPerStreak = 1500;
    const extra = Math.max(0, (s - DAILY_STREAK_START) * extraPerStreak);
    const capped = Math.min(DAILY_STREAK_CAP_EXTRA, extra);
    return DAILY_BONUS_BASE + capped;
  }

  function updateDailyUI() {
    const key = getLocalDateKey();
    const streakCount = Math.max(0, Number(state.daily.streakCount) || 0);
    const bonus = computeDailyBonus(streakCount);
    if (state.daily.lastClaimedDateKey === key) {
      dailyText.textContent = `Бонус получен: сегодня`;
      el('dailyStreakText').textContent = `Серия: ${streakCount}`;
      btnDaily.disabled = true;
    } else {
      dailyText.textContent = `${bonus.toLocaleString('ru-RU')}🪙 сегодня`;
      el('dailyStreakText').textContent = `Серия: ${streakCount}`;
      btnDaily.disabled = false;
    }
  }

  function pettingRewardIfNeeded(now, strength = 1) {
    const nearEnough = isPointerNearCat(lastPointer.x, lastPointer.y);
    if (!nearEnough) return;
    if (now - lastPetRewardAt < 900) return;
    lastPetRewardAt = now;
    state.lastInteractionAt = Date.now();
    idleStage1Fired = false;
    idleStage2Fired = false;

    const s = state.stats;
    const bonusCoins = strength >= 2 ? 3 : 1;
    const bonusXp = strength >= 2 ? 2 : 1;

    state.stats.mood = clamp(s.mood + 2.6 * strength, 0, 100);
    state.stats.energy = clamp(s.energy + 1.2 * strength, 0, 100);
    // While the cat gets happier, it also gets a little more active.
    state.stats.hunger = clamp(s.hunger - 0.9 * strength, 0, 100);
    state.stats.clean = clamp(s.clean + 0.2 * strength, 0, 100);

    grantCoinsAndXp(bonusCoins, bonusXp);
    scheduleSave();
  }

  function isPointerNearCat(clientX, clientY) {
    const r = cat.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    return dist < Math.max(140, r.width * 0.45);
  }

  function handlePettingMove(e) {
    lastPointer = { x: e.clientX, y: e.clientY };
    const inCat = isPointerNearCat(e.clientX, e.clientY);

    if (inCat && pointerDown) {
      petHand.style.opacity = '1';
      // Place hand over the pet stage at the pointer position.
      const stage = q('#petStage');
      const sr = stage.getBoundingClientRect();
      const px = clamp(e.clientX - sr.left, 0, sr.width);
      const py = clamp(e.clientY - sr.top, 0, sr.height);
      petHand.style.left = `${px}px`;
      petHand.style.top = `${py}px`;
      pettingRewardIfNeeded(Date.now(), 2);
    } else if (inCat) {
      petHand.style.opacity = '0.8';
    } else {
      petHand.style.opacity = '0';
    }
  }

  function handlePettingClick(e) {
    if (!cat.contains(e.target)) return;
    doCatClickReaction();
  }

  function doCatClickReaction() {
    const now = Date.now();
    state.lastInteractionAt = now;
    idleStage1Fired = false;
    idleStage2Fired = false;

    const { hunger, energy, clean, mood } = state.stats;
    const mode =
      energy < 25 || (mood < 40 && hunger > 35) ? 'sleepy' : hunger < 26 || clean < 26 ? 'angry' : 'happy';

    // Click is "tap": the cat reacts instantly. It may be grumpy but still awards progress.
    if (mode === 'happy') {
      state.stats.mood = clamp(mood + 10, 0, 100);
      state.stats.energy = clamp(energy + 3, 0, 100);
      state.stats.hunger = clamp(hunger - 2, 0, 100);
      showToast('Мур! Это было мило.');
      grantCoinsAndXp(6, 4);
      cat.classList.remove('mood-angry', 'mood-sleepy');
      cat.classList.add('mood-happy');
    } else if (mode === 'angry') {
      state.stats.mood = clamp(mood - 6, 0, 100);
      state.stats.energy = clamp(energy - 3, 0, 100);
      state.stats.hunger = clamp(hunger, 0, 100);
      cat.classList.remove('mood-happy', 'mood-sleepy');
      cat.classList.add('mood-angry');
      showToast('Фырк! Я хотел(а) бы, чтобы меня поняли.');
      grantCoinsAndXp(2, 3);
    } else {
      state.stats.mood = clamp(mood - 7, 0, 100);
      state.stats.energy = clamp(energy - 2, 0, 100);
      cat.classList.remove('mood-happy', 'mood-angry');
      cat.classList.add('mood-sleepy');
      showToast('Ммм… я сонный котик.');
      grantCoinsAndXp(1, 2);
    }

    scheduleSave();
    applyCatMoodClasses();
    updateBarsUI();
  }

  // Quick actions
  function feedAction() {
    const cost = 50;
    if (state.coins < cost) return;
    state.coins -= cost;
    state.stats.hunger = clamp(state.stats.hunger + 34, 0, 100);
    state.stats.mood = clamp(state.stats.mood + 8, 0, 100);
    state.stats.energy = clamp(state.stats.energy + 4, 0, 100);
    // Eating makes cat slightly messy.
    state.stats.clean = clamp(state.stats.clean - 2.6, 0, 100);

    state.lastInteractionAt = Date.now();
    showToast('Хрум! Я почувствовал(а) вкусный запах.');
    grantCoinsAndXp(0, 6);
    scheduleSave();
    setButtonsDisabledByCoins();
    updateBarsUI();
    applyCatMoodClasses();
  }

  function washAction() {
    const cost = 30;
    if (state.coins < cost) return;
    state.coins -= cost;
    state.stats.clean = clamp(state.stats.clean + 48, 0, 100);
    state.stats.mood = clamp(state.stats.mood + 7, 0, 100);
    state.stats.energy = clamp(state.stats.energy + 2, 0, 100);
    state.stats.hunger = clamp(state.stats.hunger - 1.7, 0, 100);

    state.lastInteractionAt = Date.now();
    showToast('Ффф! Умывшись, я стал(а) ещё милее.');
    grantCoinsAndXp(0, 5);
    scheduleSave();
    setButtonsDisabledByCoins();
    updateBarsUI();
    applyCatMoodClasses();
  }

  function spinAction() {
    const cost = 15;
    if (state.coins < cost) return;
    state.coins -= cost;
    state.stats.mood = clamp(state.stats.mood + 14, 0, 100);
    state.stats.energy = clamp(state.stats.energy + 2, 0, 100);
    state.stats.hunger = clamp(state.stats.hunger - 6, 0, 100);
    state.stats.clean = clamp(state.stats.clean - 1, 0, 100);

    state.lastInteractionAt = Date.now();
    showToast('Кручуся! Дай ещё чуть-чуть.');
    grantCoinsAndXp(0, 4);
    scheduleSave();
    setButtonsDisabledByCoins();
    updateBarsUI();
    applyCatMoodClasses();
  }

  btnFeed.addEventListener('click', feedAction);
  btnWash.addEventListener('click', washAction);
  btnSpin.addEventListener('click', spinAction);

  btnDaily.addEventListener('click', () => {
    const key = getLocalDateKey();
    if (state.daily.lastClaimedDateKey === key) return;

    const yesterdayKey = getYesterdayKey();
    const prevWasYesterday = state.daily.lastClaimedDateKey === yesterdayKey;
    const prevStreak = Math.max(0, Number(state.daily.streakCount) || 0);
    const newStreak = prevWasYesterday ? prevStreak + 1 : DAILY_STREAK_START;

    state.daily.lastClaimedDateKey = key;
    state.daily.streakCount = newStreak;

    const bonusCoins = computeDailyBonus(newStreak);
    grantCoinsAndXp(bonusCoins, DAILY_XP, 'Ежедневный бонус: ');

    scheduleSave();
    updateDailyUI();
    setButtonsDisabledByCoins();
    updateBarsUI();
    applyCatMoodClasses();
  });

  function applyReferralFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref || typeof ref !== 'string') return;
    if (ref === state.profileId) return;
    if (state.referral.lastAppliedRef === ref) return;

    state.referral.lastAppliedRef = ref;
    scheduleSave();
    grantCoinsAndXp(REFERRAL_COINS, REFERRAL_XP, 'Реферальный бонус: ');
  }

  // Shop
  const shopState = {
    tab: 'head',
  };

  function getItemById(id) {
    return ITEMS.find((x) => x.id === id);
  }

  function slotFromTab(tab) {
    if (tab === 'head') return 'hat';
    if (tab === 'eyes') return 'glasses';
    return 'outfit';
  }

  function levelAllowed(reqLevel) {
    const { level } = computeLevelFromXp(state.xpTotal);
    return level >= reqLevel;
  }

  function renderShop() {
    const slot = slotFromTab(shopState.tab);
    const list = ITEMS.filter((x) => x.slot === slot);
    const { level } = computeLevelFromXp(state.xpTotal);
    shopList.innerHTML = '';

    list.forEach((item) => {
      const equipped = state.equipped[item.slot] === item.id;
      const unlocked = level >= item.reqLevel;

      const node = document.createElement('div');
      node.className = 'shop-item';

      const left = document.createElement('div');
      left.className = 'shop-item__left';
      const icon = document.createElement('div');
      icon.className = 'shop-item__icon';
      // Make shop icon reflect the item's visual palette.
      try {
        if (item.slot === 'hat') {
          const p = paletteForHat(item.visual);
          icon.style.background = `radial-gradient(circle at 30% 25%, rgba(255,255,255,.35), transparent 55%), linear-gradient(135deg, ${p.a}, ${p.s1}, ${p.b})`;
        }
        if (item.slot === 'glasses') {
          const p = paletteForGlasses(item.visual);
          icon.style.background = `radial-gradient(circle at 30% 25%, rgba(255,255,255,.35), transparent 55%), linear-gradient(135deg, ${p.a}, ${p.s}, ${p.b})`;
        }
        if (item.slot === 'outfit') {
          const p = paletteForOutfit(item.visual);
          icon.style.background = `radial-gradient(circle at 30% 25%, rgba(255,255,255,.35), transparent 55%), linear-gradient(135deg, ${p.a}, ${p.s1}, ${p.b})`;
        }
      } catch {
        // Ignore styling errors.
      }
      left.appendChild(icon);

      const meta = document.createElement('div');
      meta.className = 'shop-item__meta';

      const name = document.createElement('div');
      name.className = 'shop-item__name';
      name.textContent = item.name;

      const req = document.createElement('div');
      req.className = 'shop-item__req';
      req.textContent = unlocked ? `Разблокировано (ур. ${item.reqLevel})` : `Нужно ур. ${item.reqLevel}`;

      meta.appendChild(name);
      meta.appendChild(req);
      left.appendChild(meta);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.flexDirection = 'column';
      right.style.alignItems = 'flex-end';
      right.style.gap = '8px';

      const price = document.createElement('div');
      price.className = 'shop-item__price';
      price.textContent = `${item.cost}🪙`;

      const btn = document.createElement('button');
      btn.className = `btn shop-item__btn ${equipped ? 'btn--gold' : 'btn--primary'}`;
      btn.type = 'button';
      if (!unlocked) {
        btn.disabled = true;
        btn.textContent = 'Разблокировать';
      } else if (equipped) {
        btn.disabled = true;
        btn.textContent = 'Надето';
      } else {
        btn.disabled = state.coins < item.cost;
        btn.textContent = `Надеть`;
        btn.addEventListener('click', () => {
          state.coins = Math.max(0, state.coins - item.cost);
          state.equipped[item.slot] = item.id;
          scheduleSave();
          renderEquipped();
          updateBarsUI();
          // Equip is a "feel good" action.
          state.stats.mood = clamp(state.stats.mood + 3, 0, 100);
          showToast(`Одето: ${item.name}`);
          state.xpTotal = Math.max(0, state.xpTotal + 6);
          scheduleSave();
          setButtonsDisabledByCoins();
          renderShop();
          applyCatMoodClasses();
          updateBarsUI();
        });
      }

      right.appendChild(price);
      right.appendChild(btn);
      node.appendChild(left);
      node.appendChild(right);
      shopList.appendChild(node);
    });
  }

  shopTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    shopState.tab = btn.dataset.tab;
    [...shopTabs.querySelectorAll('.tab')].forEach((t) => t.classList.toggle('tab--active', t === btn));
    renderShop();
  });

  // Mini games modal
  const GAME_INFO = {
    flappy: {
      title: 'Flap-ish (Flappy Bird стиль)',
      startHint: 'Клик/Пробел: взлёт. Задача: пролетать между блоками.',
    },
    dino: {
      title: 'Turtle Dash (Dino Runner)',
      startHint: 'Пробел/↑: прыжок. Задача: не врезаться в кактусы.',
    },
    climb: {
      title: 'Upward Bounce (Вертикальный платформер)',
      startHint: 'Пробел/Клик: прыгать. Задача: добраться выше и не упасть.',
    },
  };

  function openModal() {
    gameModal.setAttribute('aria-hidden', 'false');
    uiPaused = true;
    setButtonsDisabledByCoins();
  }

  function closeModal() {
    gameModal.setAttribute('aria-hidden', 'true');
    uiPaused = false;
    stopGame();
    currentGameId = null;
    setButtonsDisabledByCoins();
  }

  btnCloseModal.addEventListener('click', closeModal);
  btnBackGame.addEventListener('click', closeModal);

  gameModal.addEventListener('click', (e) => {
    if (e.target === gameModal) closeModal();
  });

  function stopGame() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Share modal (PNG + copy text)
  function openShareModal() {
    shareModal.setAttribute('aria-hidden', 'false');
    uiPaused = true;
    setButtonsDisabledByCoins();
    renderShareCard();
  }

  function closeShareModal() {
    shareModal.setAttribute('aria-hidden', 'true');
    uiPaused = false;
    setButtonsDisabledByCoins();
  }

  function paletteForMood(mode) {
    if (mode === 'happy') return { a: 'rgba(103,245,198,.35)', b: 'rgba(255,211,107,.16)', c: 'rgba(92,204,255,.18)' };
    if (mode === 'angry') return { a: 'rgba(255,74,110,.38)', b: 'rgba(185,166,255,.16)', c: 'rgba(255,211,107,.14)' };
    if (mode === 'sleepy') return { a: 'rgba(185,166,255,.38)', b: 'rgba(92,204,255,.12)', c: 'rgba(255,211,107,.14)' };
    return { a: 'rgba(92,204,255,.28)', b: 'rgba(185,166,255,.14)', c: 'rgba(255,211,107,.10)' };
  }

  function paletteForHat(visual) {
    switch (visual) {
      case 'moon':
        return { a: 'rgba(255,211,107,.55)', b: 'rgba(185,166,255,.20)', s1: 'rgba(92,204,255,.25)', s2: 'rgba(255,122,162,.20)', s3: 'rgba(103,245,198,.22)' };
      case 'zig':
        return { a: 'rgba(103,245,198,.40)', b: 'rgba(255,122,162,.18)', s1: 'rgba(255,211,107,.20)', s2: 'rgba(103,245,198,.24)', s3: 'rgba(185,166,255,.20)' };
      case 'mystic':
        return { a: 'rgba(185,166,255,.44)', b: 'rgba(92,204,255,.16)', s1: 'rgba(255,122,162,.20)', s2: 'rgba(185,166,255,.24)', s3: 'rgba(255,211,107,.16)' };
      case 'star':
        return { a: 'rgba(255,211,107,.44)', b: 'rgba(92,204,255,.18)', s1: 'rgba(185,166,255,.22)', s2: 'rgba(103,245,198,.20)', s3: 'rgba(255,122,162,.18)' };
      case 'swirl':
        return { a: 'rgba(255,122,162,.35)', b: 'rgba(185,166,255,.18)', s1: 'rgba(92,204,255,.22)', s2: 'rgba(103,245,198,.20)', s3: 'rgba(255,211,107,.18)' };
      case 'bow':
        return { a: 'rgba(255,209,184,.30)', b: 'rgba(103,245,198,.18)', s1: 'rgba(255,122,162,.18)', s2: 'rgba(92,204,255,.18)', s3: 'rgba(185,166,255,.16)' };
      case 'nori':
        return { a: 'rgba(55,245,166,.34)', b: 'rgba(185,166,255,.14)', s1: 'rgba(255,211,107,.18)', s2: 'rgba(92,204,255,.18)', s3: 'rgba(103,245,198,.22)' };
      case 'robot':
        return { a: 'rgba(92,204,255,.34)', b: 'rgba(255,122,162,.14)', s1: 'rgba(255,211,107,.18)', s2: 'rgba(185,166,255,.20)', s3: 'rgba(103,245,198,.16)' };
      default:
        return paletteForHat('moon');
    }
  }

  function paletteForGlasses(visual) {
    switch (visual) {
      case 'spark':
        return { a: 'rgba(92,204,255,.42)', b: 'rgba(255,211,107,.20)', s: 'rgba(103,245,198,.25)' };
      case 'rim':
        return { a: 'rgba(255,122,162,.28)', b: 'rgba(185,166,255,.18)', s: 'rgba(255,211,107,.22)' };
      case 'nebula':
        return { a: 'rgba(185,166,255,.40)', b: 'rgba(92,204,255,.16)', s: 'rgba(185,166,255,.22)' };
      case 'visor':
        return { a: 'rgba(103,245,198,.34)', b: 'rgba(92,204,255,.18)', s: 'rgba(255,211,107,.16)' };
      case 'halo':
        return { a: 'rgba(255,211,107,.42)', b: 'rgba(185,166,255,.14)', s: 'rgba(92,204,255,.18)' };
      case 'comets':
        return { a: 'rgba(185,166,255,.34)', b: 'rgba(103,245,198,.16)', s: 'rgba(255,122,162,.18)' };
      default:
        return paletteForGlasses('spark');
    }
  }

  function paletteForOutfit(visual) {
    switch (visual) {
      case 'patch':
        return { a: 'rgba(255,122,162,.26)', b: 'rgba(103,245,198,.14)', s1: 'rgba(255,211,107,.24)', s2: 'rgba(92,204,255,.18)', s3: 'rgba(185,166,255,.18)' };
      case 'comfy':
        return { a: 'rgba(103,245,198,.22)', b: 'rgba(92,204,255,.14)', s1: 'rgba(185,166,255,.20)', s2: 'rgba(103,245,198,.22)', s3: 'rgba(255,211,107,.18)' };
      case 'prism':
        return { a: 'rgba(185,166,255,.26)', b: 'rgba(255,122,162,.14)', s1: 'rgba(92,204,255,.20)', s2: 'rgba(255,211,107,.18)', s3: 'rgba(103,245,198,.18)' };
      case 'jacket':
        return { a: 'rgba(92,204,255,.22)', b: 'rgba(255,209,184,.14)', s1: 'rgba(255,211,107,.20)', s2: 'rgba(185,166,255,.18)', s3: 'rgba(103,245,198,.16)' };
      case 'tux':
        return { a: 'rgba(185,166,255,.24)', b: 'rgba(255,122,162,.12)', s1: 'rgba(92,204,255,.18)', s2: 'rgba(255,211,107,.18)', s3: 'rgba(103,245,198,.16)' };
      case 'cape':
        return { a: 'rgba(103,245,198,.24)', b: 'rgba(255,211,107,.12)', s1: 'rgba(92,204,255,.20)', s2: 'rgba(185,166,255,.18)', s3: 'rgba(255,122,162,.14)' };
      default:
        return paletteForOutfit('patch');
    }
  }

  function getMoodModeText(mode) {
    if (mode === 'happy') return 'в восторге';
    if (mode === 'angry') return 'злой';
    if (mode === 'sleepy') return 'сонный';
    return 'в норме';
  }

  function drawRoundedRectTo(ctx2, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx2.beginPath();
    ctx2.moveTo(x + rr, y);
    ctx2.arcTo(x + w, y, x + w, y + h, rr);
    ctx2.arcTo(x + w, y + h, x, y + h, rr);
    ctx2.arcTo(x, y + h, x, y, rr);
    ctx2.arcTo(x, y, x + w, y, rr);
    ctx2.closePath();
  }

  function renderShareCard() {
    if (!shareCanvas || !shareCtx) return;
    const w = shareCanvas.width;
    const h = shareCanvas.height;

    const levelInfo = computeLevelFromXp(state.xpTotal);
    const mode = getMoodMode();
    const moodText = getMoodModeText(mode);

    const hatItem = state.equipped.hat ? ITEMS.find((x) => x.id === state.equipped.hat) : null;
    const glassesItem = state.equipped.glasses ? ITEMS.find((x) => x.id === state.equipped.glasses) : null;
    const outfitItem = state.equipped.outfit ? ITEMS.find((x) => x.id === state.equipped.outfit) : null;

    const hatPal = paletteForHat(hatItem?.visual || 'moon');
    const glassesPal = paletteForGlasses(glassesItem?.visual || 'spark');
    const outfitPal = paletteForOutfit(outfitItem?.visual || 'patch');
    const moodPal = paletteForMood(mode);

    const ctx2 = shareCtx;
    ctx2.clearRect(0, 0, w, h);

    // Background
    const bg = ctx2.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, moodPal.a);
    bg.addColorStop(0.45, moodPal.c);
    bg.addColorStop(1, moodPal.b);
    ctx2.fillStyle = bg;
    ctx2.fillRect(0, 0, w, h);

    // Soft toy bubbles
    ctx2.globalAlpha = 0.65;
    for (let i = 0; i < 8; i++) {
      const bx = 40 + i * 120 + (state.coins % 37);
      const by = 60 + ((i * 71) % 220);
      const br = 18 + (i % 3) * 10;
      const gg = ctx2.createRadialGradient(bx, by, 2, bx, by, br);
      gg.addColorStop(0, 'rgba(255,255,255,.35)');
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx2.fillStyle = gg;
      ctx2.beginPath();
      ctx2.arc(bx, by, br, 0, Math.PI * 2);
      ctx2.fill();
    }
    ctx2.globalAlpha = 1;

    // Frame
    ctx2.save();
    ctx2.globalAlpha = 0.95;
    ctx2.strokeStyle = 'rgba(255,255,255,.22)';
    ctx2.lineWidth = 3;
    drawRoundedRectTo(ctx2, 18, 18, w - 36, h - 36, 30);
    ctx2.stroke();
    ctx2.restore();

    // Cat (simple stylized toy render)
    const headX = 280;
    const headY = 270;
    const headR = 120;

    // Outfit cape behind
    ctx2.save();
    const capeGrad = ctx2.createLinearGradient(180, 320, 390, 460);
    capeGrad.addColorStop(0, outfitPal.a);
    capeGrad.addColorStop(1, outfitPal.s1);
    ctx2.fillStyle = capeGrad;
    ctx2.globalAlpha = 0.95;
    drawRoundedRectTo(ctx2, 210, 330, 170, 150, 70);
    ctx2.fill();
    ctx2.restore();

    // Body shadow blob
    ctx2.save();
    ctx2.globalAlpha = 0.55;
    ctx2.fillStyle = 'rgba(0,0,0,.25)';
    drawRoundedRectTo(ctx2, 235, 420, 130, 55, 28);
    ctx2.fill();
    ctx2.restore();

    // Ears
    ctx2.save();
    const earGrad = ctx2.createLinearGradient(headX - 90, headY - 120, headX + 90, headY - 40);
    earGrad.addColorStop(0, 'rgba(255,255,255,.26)');
    earGrad.addColorStop(1, outfitPal.b);
    ctx2.fillStyle = earGrad;
    ctx2.strokeStyle = 'rgba(255,255,255,.16)';
    ctx2.lineWidth = 3;
    for (const sx of [-60, 60]) {
      ctx2.beginPath();
      ctx2.moveTo(headX + sx, headY - headR + 10);
      ctx2.quadraticCurveTo(headX + sx * 0.7, headY - headR - 40, headX + sx * 1.02, headY - headR + 22);
      ctx2.quadraticCurveTo(headX + sx * 0.85, headY - headR + 55, headX + sx, headY - headR + 32);
      ctx2.closePath();
      ctx2.fill();
      ctx2.stroke();
    }
    ctx2.restore();

    // Head
    ctx2.save();
    const headGrad = ctx2.createRadialGradient(headX - 35, headY - 60, 10, headX, headY, headR + 30);
    headGrad.addColorStop(0, 'rgba(255,255,255,.40)');
    headGrad.addColorStop(0.35, 'rgba(185,166,255,.20)');
    headGrad.addColorStop(1, 'rgba(255,122,162,.10)');
    ctx2.fillStyle = headGrad;
    ctx2.strokeStyle = 'rgba(255,255,255,.18)';
    ctx2.lineWidth = 4;
    ctx2.beginPath();
    ctx2.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.stroke();
    ctx2.restore();

    // Glasses
    if (glassesItem) {
      const gp = glassesPal;
      ctx2.save();
      ctx2.globalAlpha = 0.95;
      ctx2.strokeStyle = gp.a;
      ctx2.lineWidth = 10;
      // Left lens
      drawRoundedRectTo(ctx2, headX - 85, headY - 18, 70, 58, 22);
      ctx2.stroke();
      // Right lens
      drawRoundedRectTo(ctx2, headX + 15, headY - 18, 70, 58, 22);
      ctx2.stroke();
      // Bridge
      ctx2.fillStyle = gp.b;
      drawRoundedRectTo(ctx2, headX - 10, headY - 4, 20, 16, 8);
      ctx2.fill();
      // Shine
      ctx2.globalAlpha = 0.65;
      ctx2.fillStyle = 'rgba(255,255,255,.55)';
      ctx2.beginPath();
      ctx2.arc(headX - 58, headY - 4, 10, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.restore();
    }

    // Eyes
    ctx2.save();
    const pupilDx = mode === 'angry' ? -6 : mode === 'sleepy' ? 3 : 0;
    const pupilDy = mode === 'sleepy' ? 6 : 0;
    const eyeY = headY - 8;
    const eyeLx = headX - 55;
    const eyeRx = headX + 55;
    ctx2.fillStyle = 'rgba(0,0,0,.25)';
    ctx2.beginPath();
    ctx2.arc(eyeLx, eyeY + 6, 32, 0, Math.PI * 2);
    ctx2.arc(eyeRx, eyeY + 6, 32, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.fillStyle = 'rgba(255,255,255,.88)';
    ctx2.beginPath();
    ctx2.arc(eyeLx, eyeY, 28, 0, Math.PI * 2);
    ctx2.arc(eyeRx, eyeY, 28, 0, Math.PI * 2);
    ctx2.fill();
    // Pupils
    ctx2.fillStyle = 'rgba(0,0,0,.78)';
    ctx2.beginPath();
    ctx2.arc(eyeLx + pupilDx, eyeY + 2 + pupilDy, 10, 0, Math.PI * 2);
    ctx2.arc(eyeRx + pupilDx, eyeY + 2 + pupilDy, 10, 0, Math.PI * 2);
    ctx2.fill();
    // Shine
    ctx2.fillStyle = 'rgba(255,255,255,.75)';
    ctx2.beginPath();
    ctx2.arc(eyeLx + pupilDx - 3, eyeY - 4 + pupilDy, 4, 0, Math.PI * 2);
    ctx2.arc(eyeRx + pupilDx - 3, eyeY - 4 + pupilDy, 4, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.restore();

    // Hat
    if (hatItem) {
      const hp = hatPal;
      ctx2.save();
      // Brim
      ctx2.fillStyle = hp.a;
      drawRoundedRectTo(ctx2, headX - 110, headY - headR - 30, 220, 40, 20);
      ctx2.fill();
      // Top
      const topGrad = ctx2.createLinearGradient(headX - 60, headY - headR - 50, headX + 60, headY - headR + 10);
      topGrad.addColorStop(0, hp.b);
      topGrad.addColorStop(1, hp.s1);
      ctx2.fillStyle = topGrad;
      drawRoundedRectTo(ctx2, headX - 70, headY - headR - 62, 140, 66, 30);
      ctx2.fill();
      // Stripe
      ctx2.globalAlpha = 0.95;
      const sGrad = ctx2.createLinearGradient(headX - 90, headY - headR - 12, headX + 90, headY - headR + 8);
      sGrad.addColorStop(0, hp.s1);
      sGrad.addColorStop(0.5, hp.s2);
      sGrad.addColorStop(1, hp.s3);
      ctx2.fillStyle = sGrad;
      drawRoundedRectTo(ctx2, headX - 84, headY - headR - 8, 168, 16, 10);
      ctx2.fill();
      ctx2.restore();
    }

    // Text
    ctx2.save();
    ctx2.fillStyle = 'rgba(255,255,255,.92)';
    ctx2.font = '900 34px ui-sans-serif, system-ui';
    ctx2.textAlign = 'left';
    ctx2.fillText('TOYBOX CAT', 510, 90);
    ctx2.fillStyle = 'rgba(217,231,255,.75)';
    ctx2.font = '800 18px ui-sans-serif, system-ui';
    ctx2.fillText(`Настроение: ${moodText}`, 510, 130);

    ctx2.fillStyle = 'rgba(217,231,255,.88)';
    ctx2.font = '900 20px ui-sans-serif, system-ui';
    ctx2.fillText(`Ур. ${levelInfo.level}`, 510, 175);
    ctx2.fillStyle = 'rgba(255,211,107,.95)';
    ctx2.fillText(`${Math.max(0, state.coins)}🪙`, 780, 175);

    ctx2.fillStyle = 'rgba(217,231,255,.68)';
    ctx2.font = '800 16px ui-sans-serif, system-ui';
    ctx2.fillText(`Голод: ${Math.round(state.stats.hunger)}%`, 510, 220);
    ctx2.fillText(`Энергия: ${Math.round(state.stats.energy)}%`, 510, 250);
    ctx2.fillText(`Чистота: ${Math.round(state.stats.clean)}%`, 510, 280);
    ctx2.fillText(`Настрой: ${Math.round(state.stats.mood)}%`, 510, 310);

    ctx2.fillStyle = 'rgba(255,255,255,.88)';
    ctx2.font = '900 24px ui-sans-serif, system-ui';
    ctx2.fillText('Погладь меня!', 510, 390);

    ctx2.fillStyle = 'rgba(217,231,255,.55)';
    ctx2.font = '700 15px ui-sans-serif, system-ui';
    ctx2.fillText('И сыграй в мини-игры, чтобы кот был счастлив.', 510, 420);
    ctx2.restore();
  }

  function buildShareText() {
    const levelInfo = computeLevelFromXp(state.xpTotal);
    const mode = getMoodMode();
    const modeNames = { happy: 'в восторге', angry: 'злой', sleepy: 'сонный', neutral: 'в норме' };
    const moodText = modeNames[mode] || mode;
    return `У моего Toybox Cat настроение: ${moodText}. Он на уровне ${levelInfo.level} и имеет ${Math.max(0, state.coins)}🪙. Погладь кота и поиграй!`;
  }

  btnShare?.addEventListener('click', openShareModal);
  btnCloseShare?.addEventListener('click', closeShareModal);
  btnBackShare?.addEventListener('click', closeShareModal);
  btnGenShare?.addEventListener('click', renderShareCard);
  btnDownloadShare?.addEventListener('click', () => {
    if (!shareCanvas) return;
    const link = document.createElement('a');
    link.download = 'toybox-cat.png';
    link.href = shareCanvas.toDataURL('image/png');
    link.click();
  });
  btnCopyShare?.addEventListener('click', async () => {
    const text = buildShareText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('Текст скопирован!');
    } catch {
      // Fallback
      window.prompt('Скопируй текст вручную:', text);
    }
  });

  shareModal?.addEventListener('click', (e) => {
    if (e.target === shareModal) closeShareModal();
  });

  function startGame(gameId) {
    stopGame();
    currentGameId = gameId;
    clearCanvas();

    if (gameId === 'flappy') return initFlappy();
    if (gameId === 'dino') return initDino();
    if (gameId === 'climb') return initClimb();
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function drawRoundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    ctx.fill();
  }

  function drawBgGrid() {
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Subtle neon grid.
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(92,204,255,.25)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function renderGameOverlayText(text, subtext) {
    drawBgGrid();
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = '900 34px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 - 18);
    ctx.fillStyle = 'rgba(217,231,255,.70)';
    ctx.font = '700 16px ui-sans-serif, system-ui';
    ctx.fillText(subtext, canvas.width / 2, canvas.height / 2 + 22);
  }

  // Canvas control state
  let gameInput = { started: false, jumpPressedAt: 0, lastTapAt: 0 };

  btnStartGame.addEventListener('click', () => {
    if (!currentGameId) return;
    gameInput.started = true;
    btnStartGame.disabled = true;
    btnStartGame.textContent = 'Идёт...';
    startGame(currentGameId);
  });

  btnStartGame.textContent = 'Начать';

  // Open game from cards
  document.querySelectorAll('.game-card[data-game]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.game;
      openModal();
      currentGameId = id;
      const info = GAME_INFO[id];
      modalTitle.textContent = info.title;
      gameInput = { started: false, jumpPressedAt: 0, lastTapAt: 0 };
      btnStartGame.disabled = false;
      btnStartGame.textContent = 'Начать';
      drawBgGrid();
      renderGameOverlayText('Играть', info.startHint);
    });
  });

  // Global key input (only affects active game)
  function onKeyDown(e) {
    if (uiPaused !== true || !currentGameId) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      gameInput.jumpPressedAt = performance.now();
      gameInput.lastTapAt = Date.now();
    }
    if (e.code === 'Escape') closeModal();
  }
  window.addEventListener('keydown', onKeyDown);

  function onCanvasPointerDown() {
    if (uiPaused !== true || !currentGameId) return;
    gameInput.jumpPressedAt = performance.now();
    gameInput.lastTapAt = Date.now();
  }
  canvas.addEventListener('pointerdown', onCanvasPointerDown);

  // Game: Flappy-ish
  function initFlappy() {
    const W = canvas.width;
    const H = canvas.height;

    const bird = {
      x: W * 0.32,
      y: H * 0.5,
      vy: 0,
      r: 18,
    };

    const obstacles = [];
    let spawnAcc = 0;
    let score = 0;
    let alive = true;

    const gravity = 980; // px/s^2
    const flapVy = -360;
    const speed = 270;
    const gap = 165;
    const minTop = 90;
    const pipeW = 58;

    function flap() {
      bird.vy = flapVy;
    }

    function collidesRectCircle(rx, ry, rw, rh, cx, cy, cr) {
      // AABB vs Circle approximation
      const closestX = clamp(cx, rx, rx + rw);
      const closestY = clamp(cy, ry, ry + rh);
      const dx = cx - closestX;
      const dy = cy - closestY;
      return dx * dx + dy * dy <= cr * cr;
    }

    const startTime = performance.now();

    function frame(now) {
      const dt = Math.min(0.033, (now - startTime) / 1000); // safe cap
      // dt above is not accurate after first frame; use better dt measure:
      // We'll derive from previous timestamp stored on function closure.
      // For simplicity, re-calc dt with stored variable:
    }

    let prev = performance.now();

    function loop(now) {
      if (!alive) return;
      const dt = Math.min(0.033, (now - prev) / 1000);
      prev = now;

      // Input
      if (gameInput.jumpPressedAt && performance.now() - gameInput.jumpPressedAt < 120) flap();
      gameInput.jumpPressedAt = 0;

      spawnAcc += dt;
      if (spawnAcc >= 1.25) {
        spawnAcc = 0;
        const topH = minTop + Math.random() * (H - minTop - gap - 80);
        const x = W + 40;
        obstacles.push({
          x,
          topH,
          gap,
          w: pipeW,
          passed: false,
        });
      }

      // Bird physics
      bird.vy += gravity * dt;
      bird.y += bird.vy * dt;

      // Ground bounds
      if (bird.y < 44 || bird.y > H - 44) {
        alive = false;
        return finishFlappy(score);
      }

      // Move obstacles + collision
      for (const ob of obstacles) {
        ob.x -= speed * dt;

        // Score when passing center
        if (!ob.passed && ob.x + ob.w < bird.x) {
          ob.passed = true;
          score++;
        }

        const topRect = { x: ob.x, y: 0, w: ob.w, h: ob.topH };
        const botRect = { x: ob.x, y: ob.topH + ob.gap, w: ob.w, h: H - (ob.topH + ob.gap) };

        if (
          collidesRectCircle(topRect.x, topRect.y, topRect.w, topRect.h, bird.x, bird.y, bird.r) ||
          collidesRectCircle(botRect.x, botRect.y, botRect.w, botRect.h, bird.x, bird.y, bird.r)
        ) {
          alive = false;
          break;
        }
      }

      // Cleanup
      for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].x + obstacles[i].w < -80) obstacles.splice(i, 1);
      }

      // Render
      drawBgGrid();

      // Bird
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.beginPath();
      ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI * 2);
      ctx.fill();
      // Cute face dot
      ctx.fillStyle = 'rgba(185,166,255,.95)';
      ctx.beginPath();
      ctx.arc(bird.x - 6, bird.y - 6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Obstacles
      for (const ob of obstacles) {
        const topY = 0;
        const topH = ob.topH;
        const botY = topH + ob.gap;
        ctx.fillStyle = 'rgba(92,204,255,.85)';
        drawRoundedRect(ob.x, topY, ob.w, topH, 14);
        ctx.fillStyle = 'rgba(255,122,162,.70)';
        drawRoundedRect(ob.x, botY, ob.w, H - botY, 14);
      }

      // HUD
      ctx.fillStyle = 'rgba(217,231,255,.85)';
      ctx.font = '900 18px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`Очки: ${score}`, 16, 28);

      rafId = requestAnimationFrame(loop);
    }

    function finishFlappy(finalScore) {
      stopGame();
      // Reward shaping: more for longer streaks.
      const rewardCoins = Math.floor(6 + finalScore * 2.2);
      const rewardXp = Math.floor(12 + finalScore * 3.1);
      const moodPenalty = state.stats.energy < 25 ? 0.65 : 1;
      grantCoinsAndXp(Math.floor(rewardCoins * moodPenalty), Math.floor(rewardXp * moodPenalty), 'Flap-ish: ');
      scheduleSave();
      updateBarsUI();
      applyCatMoodClasses();
      uiPaused = false;
      btnStartGame.disabled = false;
      btnStartGame.textContent = 'Начать';
      const msg = finalScore > 8 ? 'Неплохо!' : finalScore > 3 ? 'Ок!' : 'Попробуй ещё!';
      renderGameOverlayText('Конец игры', `${msg} Результат: ${finalScore} очков.`);
    }

    rafId = requestAnimationFrame(loop);
  }

  // Game: Dino runner
  function initDino() {
    const W = canvas.width;
    const H = canvas.height;
    const groundY = H - 88;

    const dino = {
      x: W * 0.25,
      y: groundY - 52,
      vy: 0,
      w: 44,
      h: 52,
      onGround: true,
    };

    const obstacles = [];
    let spawnAcc = 0;
    let alive = true;
    let score = 0;
    let prev = performance.now();

    const gravity = 1150;
    const jumpVy = -520;
    const speed = 290;

    function jump() {
      if (!dino.onGround) return;
      dino.onGround = false;
      dino.vy = jumpVy;
    }

    function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function loop(now) {
      if (!alive) return;
      const dt = Math.min(0.033, (now - prev) / 1000);
      prev = now;

      // Input
      if (gameInput.jumpPressedAt && performance.now() - gameInput.jumpPressedAt < 120) jump();
      gameInput.jumpPressedAt = 0;

      spawnAcc += dt;
      if (spawnAcc >= 1.05) {
        spawnAcc = 0;
        const h = 40 + Math.random() * 55;
        const w = 34 + Math.random() * 26;
        obstacles.push({
          x: W + 60,
          y: groundY - h,
          w,
          h,
          passed: false,
        });
      }

      // Physics
      dino.vy += gravity * dt;
      dino.y += dino.vy * dt;
      if (dino.y >= groundY - dino.h) {
        dino.y = groundY - dino.h;
        dino.vy = 0;
        dino.onGround = true;
      }

      // Obstacles movement + score
      for (const ob of obstacles) {
        ob.x -= speed * dt;
        if (!ob.passed && ob.x + ob.w < dino.x) {
          ob.passed = true;
          score += 1;
        }

        if (aabb(dino.x, dino.y, dino.w, dino.h, ob.x, ob.y, ob.w, ob.h)) {
          alive = false;
          break;
        }
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].x + obstacles[i].w < -120) obstacles.splice(i, 1);
      }

      // Render
      drawBgGrid();

      // Ground line
      ctx.strokeStyle = 'rgba(255,211,107,.65)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(W, groundY);
      ctx.stroke();

      // Dino (cute turtle-ish)
      ctx.fillStyle = 'rgba(103,245,198,.85)';
      drawRoundedRect(dino.x, dino.y, dino.w, dino.h, 14);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(dino.x + dino.w * 0.63, dino.y + 18, 6, 0, Math.PI * 2);
      ctx.fill();

      // Obstacles (cacti)
      for (const ob of obstacles) {
        ctx.fillStyle = 'rgba(185,166,255,.78)';
        drawRoundedRect(ob.x, ob.y, ob.w, ob.h, 10);
        // Spines
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const sx = ob.x + 6 + i * (ob.w / 3);
          ctx.beginPath();
          ctx.moveTo(sx, ob.y + 16);
          ctx.lineTo(sx, ob.y + ob.h - 10);
          ctx.stroke();
        }
      }

      // HUD
      ctx.fillStyle = 'rgba(217,231,255,.85)';
      ctx.font = '900 18px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`Выживание: ${score}`, 16, 28);

      if (!alive) return finishDino(score);
      rafId = requestAnimationFrame(loop);
    }

    function finishDino(finalScore) {
      stopGame();
      const rewardCoins = Math.floor(10 + finalScore * 3.5);
      const rewardXp = Math.floor(14 + finalScore * 4.2);
      const moodPenalty = state.stats.clean < 25 ? 0.7 : 1;
      grantCoinsAndXp(Math.floor(rewardCoins * moodPenalty), Math.floor(rewardXp * moodPenalty), 'Turtle Dash: ');
      scheduleSave();
      updateBarsUI();
      applyCatMoodClasses();
      uiPaused = false;
      btnStartGame.disabled = false;
      btnStartGame.textContent = 'Начать';
      const msg = finalScore > 10 ? 'Ты красавец!' : finalScore > 4 ? 'Неплохо!' : 'Давай ещё.';
      renderGameOverlayText('Конец игры', `${msg} Очков: ${finalScore}.`);
    }

    rafId = requestAnimationFrame(loop);
  }

  // Game: Vertical platformer
  function initClimb() {
    const W = canvas.width;
    const H = canvas.height;
    const line = H * 0.45;

    const player = {
      x: W * 0.5 - 16,
      y: H - 150,
      w: 32,
      h: 42,
      vy: 0,
      grounded: false,
    };

    const platforms = [];
    let alive = true;
    let prev = performance.now();
    let cameraShift = 0;

    const gravity = 1120;
    const jumpVy = -620;
    const scrollSpeed = 155;

    function spawnInitialPlatforms() {
      platforms.length = 0;
      const startY = H - 80;
      platforms.push({ x: W * 0.5 - 120 / 2, y: startY, w: 120, h: 16 });
      let minY = startY;
      for (let i = 0; i < 8; i++) {
        minY -= 110 + Math.random() * 85;
        platforms.push({
          x: W * 0.5 - 140 / 2 + (Math.random() - 0.5) * 120,
          y: minY,
          w: 140 + Math.random() * 70,
          h: 16,
        });
      }
    }

    function spawnMoreIfNeeded() {
      // Keep enough platforms above the screen.
      let minY = Infinity;
      for (const p of platforms) minY = Math.min(minY, p.y);

      while (minY > cameraShift * -1 - H - 420) {
        // Safety: avoid infinite loop.
        break;
      }

      // Spawn until we have near-top buffer.
      let topY = Infinity;
      for (const p of platforms) topY = Math.min(topY, p.y);

      while (platforms.length < 12 || topY > -240) {
        const newY = topY - (140 + Math.random() * 140);
        platforms.push({
          x: W * 0.5 - 160 / 2 + (Math.random() - 0.5) * 140,
          y: newY,
          w: 140 + Math.random() * 70,
          h: 16,
        });
        topY = newY;
        if (platforms.length > 18) break;
      }
    }

    function tryJump() {
      if (!player.grounded) return;
      player.grounded = false;
      player.vy = jumpVy;
    }

    function resolveCollisions() {
      player.grounded = false;
      // Only collide when falling.
      if (player.vy <= 0) return;
      const px1 = player.x;
      const px2 = player.x + player.w;
      const pyBottom = player.y + player.h;

      for (const p of platforms) {
        const withinX = px2 > p.x && px1 < p.x + p.w;
        const withinY = pyBottom >= p.y - 8 && pyBottom <= p.y + 10;
        if (withinX && withinY) {
          player.y = p.y - player.h;
          player.vy = 0;
          player.grounded = true;
          break;
        }
      }
    }

    function draw() {
      drawBgGrid();

      // Line that acts like "camera" threshold.
      ctx.strokeStyle = 'rgba(185,166,255,.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, line);
      ctx.lineTo(W, line);
      ctx.stroke();

      // Platforms
      for (const p of platforms) {
        ctx.fillStyle = 'rgba(255,211,107,.25)';
        drawRoundedRect(p.x, p.y, p.w, p.h, 10);
        ctx.fillStyle = 'rgba(92,204,255,.70)';
        drawRoundedRect(p.x + 6, p.y + 4, p.w - 12, p.h - 8, 10);
      }

      // Player
      ctx.fillStyle = 'rgba(255,122,162,.78)';
      drawRoundedRect(player.x, player.y, player.w, player.h, 14);
      // Eye dot
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.beginPath();
      ctx.arc(player.x + player.w * 0.63, player.y + 16, 5, 0, Math.PI * 2);
      ctx.fill();

      // HUD
      ctx.fillStyle = 'rgba(217,231,255,.90)';
      ctx.font = '900 18px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`Высота: ${Math.floor(cameraShift / 5)}m`, 16, 28);
      ctx.fillStyle = 'rgba(217,231,255,.65)';
      ctx.font = '700 14px ui-sans-serif, system-ui';
      ctx.fillText(player.grounded ? 'Земля/Платформа' : 'Прыжок', 16, 50);
    }

    function finish() {
      stopGame();
      const rewardCoins = Math.floor(8 + (cameraShift / 10) * 2.2);
      const rewardXp = Math.floor(14 + (cameraShift / 10) * 2.8);
      const moodPenalty = state.stats.mood < 35 ? 0.75 : 1;
      grantCoinsAndXp(Math.floor(rewardCoins * moodPenalty), Math.floor(rewardXp * moodPenalty), 'Upward Bounce: ');
      scheduleSave();
      updateBarsUI();
      applyCatMoodClasses();
      uiPaused = false;
      btnStartGame.disabled = false;
      btnStartGame.textContent = 'Начать';
      renderGameOverlayText('Конец игры', `Дистанция: ${Math.floor(cameraShift / 5)}m`);
    }

    spawnInitialPlatforms();

    function loop(now) {
      if (!alive) return;
      const dt = Math.min(0.033, (now - prev) / 1000);
      prev = now;

      if (gameInput.jumpPressedAt && performance.now() - gameInput.jumpPressedAt < 120) tryJump();
      gameInput.jumpPressedAt = 0;

      // Scroll platforms down.
      for (const p of platforms) p.y += scrollSpeed * dt;

      // Player physics
      player.vy += gravity * dt;
      player.y += player.vy * dt;

      // "Camera" shift when player reaches the line.
      if (player.y < line) {
        const delta = line - player.y;
        cameraShift += delta;
        player.y = line;
        for (const p of platforms) p.y += delta;
      }

      // Remove platforms that fall away.
      for (let i = platforms.length - 1; i >= 0; i--) {
        if (platforms[i].y > H + 160) platforms.splice(i, 1);
      }

      resolveCollisions();
      spawnMoreIfNeeded();

      // Fail condition
      if (player.y > H + 40) {
        alive = false;
        return finish();
      }

      draw();
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
  }

  // Main loop: pet stats & animations
  let lastUiUpdateAt = 0;

  function updateStats(dtSec) {
    const s = state.stats;
    const idleMs = Date.now() - state.lastInteractionAt;
    const idleFactor = idleMs > IDLE_STAGE2_AT_MS ? 2.0 : idleMs > IDLE_STAGE1_AT_MS ? 1.45 : idleMs > 30000 ? 1.18 : 1;

    const hungerNeed = (100 - s.hunger) / 100;
    const cleanNeed = (100 - s.clean) / 100;
    const energyNeed = (100 - s.energy) / 100;

    // Drain (fullness/energy go down).
    const hungerDrain = 0.018 * (1 + hungerNeed * 0.35) * idleFactor * (s.mood < 35 ? 1.15 : 1);
    const cleanDrain = 0.014 * (1 + cleanNeed * 0.25) * idleFactor * (hungerNeed > 0.5 ? 1.15 : 1);
    const energyDrain = 0.010 * (1 + (hungerNeed + energyNeed) * 0.45) * idleFactor;

    // Sleepy reduces drains a bit (cat rests).
    if (getMoodMode() === 'sleepy') {
      s.energy = clamp(s.energy + dtSec * 0.05, 0, 100); // tiny recovery while sleepy
    }

    s.hunger = clamp(s.hunger - hungerDrain * dtSec, 0, 100);
    s.clean = clamp(s.clean - cleanDrain * dtSec, 0, 100);
    s.energy = clamp(s.energy - energyDrain * dtSec, 0, 100);

    // Mood smoothing to a target computed from needs.
    const moodTarget = 100 - (hungerNeed * 52 + cleanNeed * 35 + energyNeed * 28);
    const moodFollow = 0.16 + (idleMs > 60000 ? 0.08 : 0);
    s.mood = clamp(s.mood + (moodTarget - s.mood) * (dtSec * moodFollow), 0, 100);

    // Idle reactions to inactivity (one-time toasts).
    if (!idleStage1Fired && idleMs > IDLE_STAGE1_AT_MS) {
      idleStage1Fired = true;
      showToast('Я скучаю… можно меня потрогать?');
      // Make it a bit sad.
      s.mood = clamp(s.mood - 6, 0, 100);
      s.energy = clamp(s.energy - 1.2, 0, 100);
    }
    if (!idleStage2Fired && idleMs > IDLE_STAGE2_AT_MS) {
      idleStage2Fired = true;
      showToast('Эй! Ты слишком пропал(а). Я недоволен(на).');
      s.hunger = clamp(s.hunger - 6, 0, 100);
      s.clean = clamp(s.clean - 7, 0, 100);
      s.mood = clamp(s.mood - 10, 0, 100);
    }
  }

  function updatePupilFollow() {
    const r = cat.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.32;
    const dx = lastPointer.x - cx;
    const dy = lastPointer.y - cy;
    const nx = clamp(dx / (r.width * 0.45), -1, 1);
    const ny = clamp(dy / (r.height * 0.35), -1, 1);
    const tx = nx * 10;
    const ty = ny * 7;
    pupilL.style.transform = `translate(-50%,-50%) translate(${tx}px,${ty}px)`;
    pupilR.style.transform = `translate(-50%,-50%) translate(${tx}px,${ty}px)`;
  }

  function mainLoop(nowPerf) {
    const dtSec = Math.min(0.05, (nowPerf - state.lastTickAt) / 1000);
    state.lastTickAt = nowPerf;

    if (!uiPaused) {
      updateStats(dtSec);

      blinkTimer -= dtSec;
      if (blinkTimer <= 0) {
        blinkTimer = 1.3 + Math.random() * 3.2;
        blinkNow();
      }

      // Keep mood classes responsive to stats.
      applyCatMoodClasses();
    }

    updatePupilFollow();

    if (nowPerf - lastUiUpdateAt > 170) {
      lastUiUpdateAt = nowPerf;
      updateBarsUI();
      renderEquipped();
      updateDailyUI();
      setButtonsDisabledByCoins();
    }

    requestAnimationFrame(mainLoop);
  }

  // Events
  cat.addEventListener('pointermove', handlePettingMove);
  q('#petStage')?.addEventListener('pointermove', handlePettingMove);
  document.addEventListener('pointerup', () => {
    pointerDown = false;
    petHand.style.opacity = '0';
  });
  document.addEventListener('pointerdown', (e) => {
    if (cat.contains(e.target)) pointerDown = true;
    lastPointer = { x: e.clientX, y: e.clientY };
  });
  document.addEventListener('pointermove', (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    // When pointer is down anywhere, and near the cat, treat it as petting.
    if (pointerDown) handlePettingMove(e);
  });
  cat.addEventListener('click', handlePettingClick);

  // Initialize first render
  applyReferralFromUrl();
  renderEquipped();
  updateBarsUI();
  applyCatMoodClasses();
  updateDailyUI();
  setButtonsDisabledByCoins();
  renderShop();
  // Seed last pointer position to center.
  {
    const r = cat.getBoundingClientRect();
    lastPointer = { x: r.left + r.width / 2, y: r.top + r.height * 0.35 };
  }

  // Start loop
  requestAnimationFrame((t) => {
    state.lastTickAt = t;
    blinkTimer = 1.4;
    requestAnimationFrame(mainLoop);
  });

  // Small safety: avoid duplicates if user returns from modal.
  closeModal();
})();

