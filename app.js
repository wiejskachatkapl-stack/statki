(() => {
  const STATKI_BUILD_VERSION = 'v1023';
  console.log('STATKI build', STATKI_BUILD_VERSION);
  const startScreen = document.getElementById('startScreen');
  const gameScreen = document.getElementById('gameScreen');
  const playBtn = document.getElementById('playBtn');
  const exitBtn = document.getElementById('exitBtn');
  const backToStartBtn = document.getElementById('backToStartBtn');

  const ownBoardEl = document.getElementById('ownBoard');
  const enemyBoardEl = document.getElementById('enemyBoard');
  const shipDock = document.getElementById('shipDock');
  const playersListEl = document.getElementById('playersList');
  const myNameLabel = document.getElementById('myNameLabel');
  const enemyNameLabel = document.getElementById('enemyNameLabel');
  const statusText = document.getElementById('statusText');

  const inviteModal = document.getElementById('inviteModal');
  const inviteText = document.getElementById('inviteText');
  const acceptInviteBtn = document.getElementById('acceptInviteBtn');
  const declineInviteBtn = document.getElementById('declineInviteBtn');

  const STORAGE_PLAYERS = 'STATKI_PLAYERS_V1005';
  const STORAGE_EVENTS = 'STATKI_EVENTS_V1005';
  const HEARTBEAT_MS = 3000;
  const ONLINE_TTL_MS = 12000;
  const SHIP_ASSETS = {
    1: 'assets/ui/ship_1.png',
    2: 'assets/ui/ship_2.png',
    3: 'assets/ui/ship_3.png',
    4: 'assets/ui/ship_4.png'
  };

  const FLEET_TEMPLATE = [
    { id: 'ship4_1', name: '4-masztowiec', size: 4, asset: SHIP_ASSETS[4] },
    { id: 'ship3_1', name: '3-masztowiec 1', size: 3, asset: SHIP_ASSETS[3] },
    { id: 'ship3_2', name: '3-masztowiec 2', size: 3, asset: SHIP_ASSETS[3] },
    { id: 'ship2_1', name: '2-masztowiec 1', size: 2, asset: SHIP_ASSETS[2] },
    { id: 'ship2_2', name: '2-masztowiec 2', size: 2, asset: SHIP_ASSETS[2] },
    { id: 'ship2_3', name: '2-masztowiec 3', size: 2, asset: SHIP_ASSETS[2] },
    { id: 'ship1_1', name: '1-masztowiec 1', size: 1, asset: SHIP_ASSETS[1] },
    { id: 'ship1_2', name: '1-masztowiec 2', size: 1, asset: SHIP_ASSETS[1] },
    { id: 'ship1_3', name: '1-masztowiec 3', size: 1, asset: SHIP_ASSETS[1] },
    { id: 'ship1_4', name: '1-masztowiec 4', size: 1, asset: SHIP_ASSETS[1] }
  ];

  const state = {
    myId: getOrCreateId(),
    myName: getPlayerName(),
    opponentId: null,
    opponentName: 'BRAK',
    pendingInviteFrom: null,
    activeShipId: null,
    orientation: 'H',
    placedShips: {},
    cellsWithShips: new Set(),
    shots: new Set(),
    enemyFleet: [],
    enemyOccupied: new Map(),
    enemyHits: new Set(),
    sunkEnemyShips: new Set()
  };

  function getOrCreateId() {
    let id = sessionStorage.getItem('STATKI_SESSION_ID');
    if (!id) {
      id = 'P' + Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).slice(-4).toUpperCase();
      sessionStorage.setItem('STATKI_SESSION_ID', id);
    }
    return id;
  }

  function getPlayerName() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('nick') || params.get('player') || params.get('name');
    const fromStorage = localStorage.getItem('STATKI_PLAYER_NAME') || localStorage.getItem('GAME_ROOM_NICK') || localStorage.getItem('playerNick');
    let name = (fromUrl || fromStorage || '').trim();
    if (!name) name = prompt('Podaj nick gracza do Statków:', 'Gracz') || 'Gracz';
    name = name.trim().slice(0, 18) || 'Gracz';
    localStorage.setItem('STATKI_PLAYER_NAME', name);
    return name;
  }

  function showStart() {
    gameScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  }

  async function requestLandscapeMode() {
    try {
      if (screen.orientation?.lock && document.documentElement.requestFullscreen) {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
        await screen.orientation.lock('landscape');
      }
    } catch (_) {
      // Przeglądarka może blokować wymuszenie orientacji poza PWA/fullscreen.
    }
  }

  function showGame() {
    startScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    requestLandscapeMode();
    registerPlayer();
    if (!state.enemyFleet.length) generateEnemyFleet();
    renderAll();
    setStatus('WYBIERZ STATKI I DODAJ DO EKRANU GRY.');
  }

  function exitToGameRoom() {
    unregisterPlayer();
    try { window.parent?.postMessage({ type: 'STATKI_EXIT', target: 'GAME_ROOM' }, '*'); } catch (_) {}
    if (document.referrer && history.length > 1) { history.back(); return; }
    window.location.href = '../index.html';
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  }
  function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function getPlayers() {
    const now = Date.now();
    const players = readJson(STORAGE_PLAYERS, []);
    return players.filter((player) => now - player.lastSeen < ONLINE_TTL_MS);
  }
  function savePlayers(players) { writeJson(STORAGE_PLAYERS, players); }
  function registerPlayer() {
    const now = Date.now();
    const players = getPlayers().filter((player) => player.id !== state.myId);
    players.push({ id: state.myId, name: state.myName, lastSeen: now, inGame: !gameScreen.classList.contains('hidden') });
    savePlayers(players);
  }
  function unregisterPlayer() {
    const players = getPlayers().filter((player) => player.id !== state.myId);
    savePlayers(players);
  }

  function pushEvent(event) {
    const events = readJson(STORAGE_EVENTS, []);
    events.push({ ...event, eventId: Date.now() + '_' + Math.random().toString(36).slice(2), time: Date.now() });
    writeJson(STORAGE_EVENTS, events.slice(-80));
    window.dispatchEvent(new Event('statki-local-event'));
  }
  function getEvents() {
    const events = readJson(STORAGE_EVENTS, []);
    const cutoff = Date.now() - 5 * 60 * 1000;
    const fresh = events.filter((event) => event.time > cutoff);
    if (fresh.length !== events.length) writeJson(STORAGE_EVENTS, fresh);
    return fresh;
  }

  function setStatus(text) { statusText.textContent = text; }

  function renderAll() {
    myNameLabel.textContent = state.myName;
    enemyNameLabel.textContent = state.opponentName || 'BRAK';
    renderPlayers();
    renderShipDock();
    renderBoards();
  }

  function renderPlayers() {
    const players = getPlayers();
    playersListEl.innerHTML = '';
    const others = players.filter((player) => player.id !== state.myId);
    if (!others.length) {
      const empty = document.createElement('div');
      empty.className = 'player-row';
      empty.innerHTML = '<span class="player-name">Brak innych graczy</span>';
      playersListEl.appendChild(empty);
      return;
    }
    others.forEach((player) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      const name = document.createElement('div');
      name.className = 'player-name';
      name.title = player.name;
      name.innerHTML = `<span class="player-status">•</span>${escapeHtml(player.name)}`;
      const btn = document.createElement('button');
      btn.className = 'invite-btn'; btn.type = 'button';
      btn.textContent = state.opponentId === player.id ? 'WYBRANY' : 'ZAPROŚ';
      btn.disabled = state.opponentId === player.id;
      btn.addEventListener('click', () => invitePlayer(player));
      row.appendChild(name); row.appendChild(btn); playersListEl.appendChild(row);
    });
  }

  function invitePlayer(player) {
    state.opponentId = player.id;
    state.opponentName = player.name;
    enemyNameLabel.textContent = player.name;
    pushEvent({ type: 'invite', fromId: state.myId, fromName: state.myName, toId: player.id, toName: player.name });
    setStatus(`Wysłano zaproszenie do gracza ${player.name}. Czekamy na przycisk GRAM po jego stronie.`);
    renderPlayers();
  }

  function processEvents() {
    const events = getEvents();
    events.forEach((event) => {
      if (event.toId !== state.myId) return;
      if (event.type === 'invite' && !wasSeen(event.eventId)) {
        markSeen(event.eventId);
        state.pendingInviteFrom = event;
        inviteText.textContent = `Gracz ${event.fromName} zaprasza Cię do rozgrywki.`;
        inviteModal.classList.remove('hidden');
      }
      if (event.type === 'inviteAccepted' && event.fromId === state.opponentId && !wasSeen(event.eventId)) {
        markSeen(event.eventId);
        state.opponentName = event.fromName;
        enemyNameLabel.textContent = state.opponentName;
        beginPlacement(`Gracz ${event.fromName} przyjął zaproszenie. Ustaw swoje statki na lewej planszy.`);
      }
    });
  }

  function wasSeen(eventId) { return sessionStorage.getItem('STATKI_SEEN_' + eventId) === '1'; }
  function markSeen(eventId) { sessionStorage.setItem('STATKI_SEEN_' + eventId, '1'); }

  function acceptInvite() {
    const invite = state.pendingInviteFrom; if (!invite) return;
    state.opponentId = invite.fromId;
    state.opponentName = invite.fromName;
    enemyNameLabel.textContent = invite.fromName;
    inviteModal.classList.add('hidden');
    pushEvent({ type: 'inviteAccepted', fromId: state.myId, fromName: state.myName, toId: invite.fromId, toName: invite.fromName });
    state.pendingInviteFrom = null;
    beginPlacement(`Grasz z ${state.opponentName}. Ustaw swoje statki na lewej planszy.`);
  }

  function declineInvite() { state.pendingInviteFrom = null; inviteModal.classList.add('hidden'); }

  function beginPlacement(message) {
    resetBoards();
    generateEnemyFleet();
    state.activeShipId = FLEET_TEMPLATE[0].id;
    setStatus('WYBIERZ STATKI I DODAJ DO EKRANU GRY.');
    renderAll();
  }

  function resetBoards() {
    state.placedShips = {};
    state.cellsWithShips = new Set();
    state.shots = new Set();
    state.activeShipId = FLEET_TEMPLATE[0].id;
    state.enemyHits = new Set();
    state.sunkEnemyShips = new Set();
  }

  function generateEnemyFleet() {
    const occupied = new Set();
    state.enemyFleet = [];
    state.enemyOccupied = new Map();
    state.enemyHits = new Set();
    state.sunkEnemyShips = new Set();

    const requiredEnemyFleet = [
      { id: 'enemy_ship4_1', name: '4-masztowiec', size: 4, asset: SHIP_ASSETS[4] },
      { id: 'enemy_ship3_1', name: '3-masztowiec 1', size: 3, asset: SHIP_ASSETS[3] },
      { id: 'enemy_ship3_2', name: '3-masztowiec 2', size: 3, asset: SHIP_ASSETS[3] },
      { id: 'enemy_ship2_1', name: '2-masztowiec 1', size: 2, asset: SHIP_ASSETS[2] },
      { id: 'enemy_ship2_2', name: '2-masztowiec 2', size: 2, asset: SHIP_ASSETS[2] },
      { id: 'enemy_ship2_3', name: '2-masztowiec 3', size: 2, asset: SHIP_ASSETS[2] },
      { id: 'enemy_ship1_1', name: '1-masztowiec 1', size: 1, asset: SHIP_ASSETS[1] },
      { id: 'enemy_ship1_2', name: '1-masztowiec 2', size: 1, asset: SHIP_ASSETS[1] },
      { id: 'enemy_ship1_3', name: '1-masztowiec 3', size: 1, asset: SHIP_ASSETS[1] },
      { id: 'enemy_ship1_4', name: '1-masztowiec 4', size: 1, asset: SHIP_ASSETS[1] }
    ];

    requiredEnemyFleet.forEach((base) => {
      let placed = false;
      let guard = 0;
      while (!placed && guard < 500) {
        guard += 1;
        const orientation = Math.random() < 0.5 ? 'H' : 'V';
        const r = Math.floor(Math.random() * 10);
        const c = Math.floor(Math.random() * 10);
        const cells = getShipCells(r, c, base.size, orientation);
        if (!canPlaceWithOccupied(cells, occupied)) continue;
        const ship = { ...base, orientation, cells };
        state.enemyFleet.push(ship);
        cells.forEach((cell) => {
          occupied.add(makeKey(cell.r, cell.c));
          state.enemyOccupied.set(makeKey(cell.r, cell.c), ship.id);
        });
        placed = true;
      }
    });
  }

  function renderShipDock() {
    shipDock.innerHTML = '';
    FLEET_TEMPLATE.forEach((ship) => {
      const token = document.createElement('button');
      token.type = 'button';
      token.className = `ship-token size-${ship.size}`;
      token.dataset.size = String(ship.size);
      if (state.activeShipId === ship.id) token.classList.add('active');
      if (state.placedShips[ship.id]) token.classList.add('done');
      token.title = state.placedShips[ship.id] ? 'Ten statek jest już ustawiony' : 'Kliknij, aby wybrać statek do ustawienia';
      token.disabled = !!state.placedShips[ship.id];
      token.innerHTML = `<img class="ship-token-preview" src="${ship.asset}" alt="${escapeHtml(ship.name)}">`;
      token.addEventListener('click', () => {
        if (!state.placedShips[ship.id]) {
          state.activeShipId = ship.id;
          renderShipDock();
          renderBoards();
          setStatus('WYBIERZ STATKI I DODAJ DO EKRANU GRY.');
        }
      });
      shipDock.appendChild(token);
    });
  }

  function renderBoards() {
    renderBoard(ownBoardEl, true);
    renderBoard(enemyBoardEl, false);
  }

  function renderBoard(container, isOwn) {
    container.innerHTML = '';
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const cell = document.createElement('button');
        cell.type = 'button'; cell.className = 'cell';
        cell.dataset.r = String(r); cell.dataset.c = String(c);
        cell.setAttribute('aria-label', `${isOwn ? 'Twoje pole' : 'Pole przeciwnika'} ${r + 1}-${c + 1}`);
        const key = makeKey(r, c);
        if (isOwn && state.cellsWithShips.has(key)) cell.classList.add('ship');
        if (!isOwn && state.shots.has(key)) {
          cell.classList.add(state.enemyHits.has(key) ? 'hit' : 'shot');
        }
        if (isOwn) {
          cell.addEventListener('click', () => placeActiveShip(r, c));
          cell.addEventListener('mouseenter', () => previewShip(r, c));
          cell.addEventListener('mouseleave', clearPreview);
        } else {
          cell.addEventListener('click', () => shootAt(r, c));
        }
        container.appendChild(cell);
      }
    }
    if (isOwn) renderOwnBoardSprites(container);
  }

  function renderOwnBoardSprites(container) {
    const overlay = document.createElement('div');
    overlay.className = 'board-overlay';
    Object.values(state.placedShips).forEach((ship) => {
      const sprite = document.createElement('div');
      sprite.className = 'ship-sprite';
      if (ship.orientation === 'V') sprite.classList.add('vertical');
      positionSprite(sprite, ship);
      const img = document.createElement('img');
      img.src = ship.asset || SHIP_ASSETS[ship.size]; img.alt = ship.name;
      sprite.appendChild(img); overlay.appendChild(sprite);
    });
    container.appendChild(overlay);
  }

  function positionSprite(sprite, ship) {
    const start = ship.cells[0];
    if (ship.orientation === 'H') {
      sprite.style.left = `${start.c * 10}%`;
      sprite.style.top = `${start.r * 10}%`;
      sprite.style.width = `${ship.size * 10}%`;
      sprite.style.height = `10%`;
    } else {
      sprite.style.left = `${start.c * 10}%`;
      sprite.style.top = `${start.r * 10}%`;
      sprite.style.width = `10%`;
      sprite.style.height = `${ship.size * 10}%`;
    }
  }

  function getActiveShip() { return FLEET_TEMPLATE.find((ship) => ship.id === state.activeShipId && !state.placedShips[ship.id]) || null; }

  function placeActiveShip(r, c) {
    const ship = getActiveShip();
    if (!ship) { setStatus('Wszystkie statki są już ustawione. Możesz strzelać do przeciwnika po prawej stronie.'); return; }
    const cells = getShipCells(r, c, ship.size, state.orientation);
    if (!canPlace(cells)) {
      flashInvalid(cells);
      setStatus('Nie można tu postawić statku. Statki nie mogą dotykać się bokami ani rogami.');
      return;
    }
    state.placedShips[ship.id] = { ...ship, cells, orientation: state.orientation };
    cells.forEach((cell) => state.cellsWithShips.add(makeKey(cell.r, cell.c)));
    const next = FLEET_TEMPLATE.find((item) => !state.placedShips[item.id]);
    state.activeShipId = next ? next.id : null;
    renderAll();
    if (!next) setStatus('Wszystkie statki ustawione. Teraz możesz strzelać w prawą planszę. Po zatopieniu pojawi się komunikat ZATOPIONO.');
    else setStatus(`Ustawiono ${ship.name}. Teraz ustaw: ${next.name}.`);
  }

  function shootAt(r, c) {
    const key = makeKey(r, c);
    if (state.shots.has(key)) return;
    state.shots.add(key);
    if (state.enemyOccupied.has(key)) {
      state.enemyHits.add(key);
      const shipId = state.enemyOccupied.get(key);
      const ship = state.enemyFleet.find((s) => s.id === shipId);
      const sunk = ship && ship.cells.every((cell) => state.enemyHits.has(makeKey(cell.r, cell.c)));
      if (sunk && !state.sunkEnemyShips.has(shipId)) {
        state.sunkEnemyShips.add(shipId);
        setStatus(`ZATOPIONO — ${ship.size}-masztowiec.`);
      } else {
        setStatus(`TRAFIONY — ${ship ? ship.size + '-masztowiec' : 'statek przeciwnika'}.`);
      }
    } else {
      setStatus('PUDŁO.');
    }
    renderBoards();
  }

  function getShipCells(r, c, size, orientation) {
    const cells = [];
    for (let i = 0; i < size; i++) cells.push({ r: orientation === 'H' ? r : r + i, c: orientation === 'H' ? c + i : c });
    return cells;
  }

  function canPlace(cells) { return canPlaceWithOccupied(cells, state.cellsWithShips); }
  function canPlaceWithOccupied(cells, occupiedSet) {
    if (cells.some((cell) => cell.r < 0 || cell.r > 9 || cell.c < 0 || cell.c > 9)) return false;
    for (const cell of cells) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (occupiedSet.has(makeKey(cell.r + dr, cell.c + dc))) return false;
        }
      }
    }
    return true;
  }

  function previewShip(r, c) {
    clearPreview();
    const ship = getActiveShip(); if (!ship) return;
    const cells = getShipCells(r, c, ship.size, state.orientation);
    const valid = canPlace(cells);
    cells.forEach((cell) => {
      const el = ownBoardEl.querySelector(`[data-r="${cell.r}"][data-c="${cell.c}"]`);
      if (el) el.classList.add(valid ? 'preview' : 'invalid');
    });
  }
  function clearPreview() { ownBoardEl.querySelectorAll('.preview, .invalid').forEach((el) => el.classList.remove('preview', 'invalid')); }
  function flashInvalid(cells) {
    cells.forEach((cell) => {
      const el = ownBoardEl.querySelector(`[data-r="${cell.r}"][data-c="${cell.c}"]`);
      if (el) el.classList.add('invalid');
    });
    setTimeout(clearPreview, 420);
  }
  function makeKey(r, c) { return `${r}:${c}`; }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  }

  playBtn.addEventListener('click', showGame);
  exitBtn.addEventListener('click', exitToGameRoom);
  backToStartBtn.addEventListener('click', showStart);
  acceptInviteBtn.addEventListener('click', acceptInvite);
  declineInviteBtn.addEventListener('click', declineInvite);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!inviteModal.classList.contains('hidden')) { declineInvite(); return; }
      if (!gameScreen.classList.contains('hidden')) showStart(); else exitToGameRoom();
    }
    if (event.key.toLowerCase() === 'r' && !gameScreen.classList.contains('hidden')) {
      state.orientation = state.orientation === 'H' ? 'V' : 'H';
      const active = getActiveShip();
      setStatus(`Obrót statku: ${state.orientation === 'H' ? 'poziomo' : 'pionowo'}${active ? `. Wybrany: ${active.name}.` : '.'}`);
    }
  });

  window.addEventListener('storage', () => { if (!gameScreen.classList.contains('hidden')) { processEvents(); renderPlayers(); } });
  window.addEventListener('statki-local-event', () => { if (!gameScreen.classList.contains('hidden')) { processEvents(); renderPlayers(); } });
  window.addEventListener('beforeunload', unregisterPlayer);
  setInterval(() => {
  const STATKI_BUILD_VERSION = 'v1023';
  console.log('STATKI build', STATKI_BUILD_VERSION); if (!gameScreen.classList.contains('hidden')) { registerPlayer(); processEvents(); renderPlayers(); } }, HEARTBEAT_MS);

  myNameLabel.textContent = state.myName;
  generateEnemyFleet();
  renderAll();
})();
