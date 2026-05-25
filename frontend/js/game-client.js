import { getToken, getUser } from './api/auth-api.js';

const urlParams = new URLSearchParams(window.location.search);
const matchId   = parseInt(urlParams.get('matchId'));
if (!matchId) window.location.href = '/webapp2/dashboard.html';

const user  = getUser();
const token = getToken();
if (!user || !token) window.location.href = '/webapp2/index.html';

let ws, playerNumber, gameState = null;
let currentMapId = 'arena';
let savedMapGeo  = { platforms:[], obstacles:[], hasGround:true, groundY:460 };
let gameOver = false;
// Username dei due player (caricati dal server al game_start) — usati per
// disegnare l'etichetta sopra al personaggio nel canvas
let usernames = { p1: '', p2: '' };
// Timer ID per cleanup
let renderIntervalId = null;
let inputIntervalId = null;
let heartbeatIntervalId = null;
// Connection robustness
let reconnectAttempts = 0;
let intentionalClose = false;
let joinTimeoutId = null;

const canvas        = document.getElementById('gameCanvas');
const ctx           = canvas.getContext('2d');
// ─── PIXEL-ART PIPELINE ───────────────────────────────────────────────────
// Backing buffer is 400x250 (half of the 800x500 game space). We scale the
// context by 0.5 so all existing draw code can keep using 0..800 / 0..500
// coordinates, but every primitive lands on a 400x250 buffer that the
// browser upscales to fit via `image-rendering: pixelated` → chunky look
// across players, weapons, terrain, particles. No per-draw refactor needed.
const PIXEL_SCALE = 0.5;
ctx.scale(PIXEL_SCALE, PIXEL_SCALE);
ctx.imageSmoothingEnabled = false;
// Expose the *logical* canvas size so existing render code still sees 800x500
canvas.logicalW = 800;
canvas.logicalH = 500;
const timerEl       = document.getElementById('timer');
const hpBar1        = document.getElementById('hpBar1');
const hpBar2        = document.getElementById('hpBar2');
const hpText1       = document.getElementById('hpText1');
const hpText2       = document.getElementById('hpText2');
const p1emoji       = document.getElementById('p1emoji');
const p2emoji       = document.getElementById('p2emoji');
const p1name        = document.getElementById('p1name');
const p2name        = document.getElementById('p2name');
const effects1      = document.getElementById('effects1');
const effects2      = document.getElementById('effects2');
const statusOverlay = document.getElementById('statusOverlay');
const statusMessage = document.getElementById('statusMessage');
const statusSub     = document.getElementById('statusSub');
const statusIcon    = document.getElementById('statusIcon');

const keys = { up:false, down:false, left:false, right:false };

// Visual style per mappa (solo colori, coordinate vengono dal server)
const MAP_STYLE = {
  arena:    { bg:'#070b11', groundColor:'rgba(0,200,255,0.5)', platFill:'rgba(0,180,220,0.7)', platBorder:'#00c8ff', obsFill:'#0d3d55', obsBorder:'#00c8ff', obsStripe:'rgba(0,200,255,0.3)' },
  platforms:{ bg:'#060c08', groundColor:'rgba(60,200,80,0.5)',  platFill:'rgba(60,200,80,0.7)',  platBorder:'#00c850', obsFill:'#0d3d1a', obsBorder:'#00c850', obsStripe:'rgba(0,200,80,0.3)' },
  space:    { bg:'#02020f', groundColor:'rgba(100,100,255,0.3)',platFill:'rgba(130,80,255,0.7)', platBorder:'#9050ff', obsFill:'#1a0a4a', obsBorder:'#9050ff', obsStripe:'rgba(140,80,255,0.3)' },
  volcano:  { bg:'#110400', groundColor:'rgba(255,80,0,0.8)',   platFill:'rgba(200,70,15,0.8)',  platBorder:'#ff6000', obsFill:'#4a1500', obsBorder:'#ff6000', obsStripe:'rgba(255,100,0,0.3)' },
};

// ─── PIXEL SPRITES (procedural pixel-art per character class) ───
// Ogni sprite è una griglia 12×16 di codici (0-9). I codici sono mappati alla
// palette della classe per renderizzare pixel chunky. 0 = trasparente.
// Codici comuni:
//   1 = corpo (color principale classe)   2 = ombra (corpo scuro)
//   3 = luce (corpo chiaro)               4 = outline (#0a0e14)
//   5 = pelle (#f4c896)                   6 = elmo/cappuccio
//   7 = accento (oro/argento/dettaglio)   8 = occhi (bianco)
const PIXEL_SPRITES = {
  // CAVALIERE — elmo con cresta argentata, visiera
  knight: [
    '....7777....',
    '...766667...',
    '..76666667..',
    '.7666666667.',
    '.6444444446.',  // visiera nera
    '.6488884486.',  // occhi/visiera
    '..56666665..',
    '.13311333331',  // armatura corpo
    '.13111111131',
    '.13111111131',
    '.12111111121',
    '..211111121.',
    '...22.22....',
    '...11.11....',
    '...11.11....',
    '..222..222..',
  ],
  // GUERRIERO — elmo cornuto, armatura pesante
  warrior: [
    '.7.....7....',
    '.77...77....',
    '..71111177..',
    '..71111117..',
    '.7641114167.',
    '.7644444467.',
    '.766666666..',
    '.13311333331',
    '113111111131',
    '113111111131',
    '.13111111121',
    '..211111121.',
    '...22.22....',
    '..222.222...',
    '..111.111...',
    '..222.222...',
  ],
  // REAPER — cappuccio scuro, occhi luminosi
  reaper: [
    '....6666....',
    '...666666...',
    '..66666666..',
    '.6666666666.',
    '.6678887766.',  // occhi che brillano
    '.66888888.66',
    '..66666666..',
    '...666666...',
    '..21111112..',
    '..21111112..',
    '..21111112..',
    '...111111...',
    '....1.1.....',
    '....1.1.....',
    '...22.22....',
    '..222.222...',
  ],
  // RANGER — cappuccio verde + piuma
  ranger: [
    '.....77.....',
    '....677.....',
    '...66677....',
    '..6655566...',
    '.66585856...',
    '..66666666..',
    '...555555...',  // viso
    '..13311333..',
    '.131111133..',
    '.121111122..',
    '..21111112..',
    '...111111...',
    '...11..11...',
    '...11..11...',
    '...11..11...',
    '..222..222..',
  ],
  // BRAWLER — fascia rossa, muscoli scoperti
  brawler: [
    '....5555....',
    '...555555...',
    '..55555555..',
    '..77777777..',  // fascia rossa
    '..55555555..',
    '..58588585..',  // occhi
    '..55555555..',
    '...555555...',
    '..1133331...',
    '.11333333111',  // spalle larghe
    '.11533335111',
    '..11555511..',
    '..11555511..',
    '...11..11...',
    '...22..22...',
    '..222..222..',
  ],
};

// Palette per classe (indici 0..9). Generata anche da p.color come fallback.
const PIXEL_PALETTES = {
  knight: { 1:'#4fc3f7', 2:'#1976c2', 3:'#90daff', 4:'#0a0e14', 5:'#f4c896', 6:'#c0c8d0', 7:'#e8eff5', 8:'#ffffff' },
  warrior:{ 1:'#ef9a9a', 2:'#a23737', 3:'#ffd0d0', 4:'#0a0e14', 5:'#f4c896', 6:'#6b3a3a', 7:'#ffd54f', 8:'#ffffff' },
  reaper: { 1:'#ce93d8', 2:'#6a3a82', 3:'#ecc5f5', 4:'#0a0e14', 5:'#cfa4d8', 6:'#2a1733', 7:'#b066d0', 8:'#ff66ff' },
  ranger: { 1:'#a5d6a7', 2:'#3d7b40', 3:'#d4f0d5', 4:'#0a0e14', 5:'#f4c896', 6:'#2e6b4e', 7:'#d4a86a', 8:'#ffffff' },
  brawler:{ 1:'#ffcc80', 2:'#a55a1c', 3:'#ffe6b3', 4:'#0a0e14', 5:'#f4c896', 6:'#d96a3a', 7:'#e23636', 8:'#ffffff' },
};

// ── ANIM FRAMES — sovrascritture delle 3 righe inferiori (le "gambe") per
// ogni classe, per ogni stato. Il resto dello sprite (torso/testa) resta
// uguale all'idle. Frame supportati: idle, walk_a, walk_b, jump.
// Indice di riga: l'ultima riga è 15, la penultima 14, ecc.
const ANIM_LEGS = {
  knight: {
    idle:   ['...11.11....', '...11.11....', '..222..222..'],
    walk_a: ['...111.1....', '...11..1....', '..222...22..'],
    walk_b: ['....1.111...', '....1..11...', '..22...222..'],
    jump:   ['...11..11...', '..222..222..', '...22..22...'],
  },
  warrior: {
    idle:   ['..222.222...', '..111.111...', '..222.222...'],
    walk_a: ['.2221.11....', '.1111..1....', '.222...22...'],
    walk_b: ['....11.1222.', '....1..1111.', '...22...222.'],
    jump:   ['..111.111...', '.222...222..', '.222...222..'],
  },
  reaper: {
    idle:   ['....1.1.....', '...22.22....', '..222.222...'],
    walk_a: ['...11.1.....', '..221.1.....', '.222..22....'],
    walk_b: ['.....1.11...', '.....1.122..', '....22..222.'],
    jump:   ['....1.1.....', '...22.22....', '...22.22....'],
  },
  ranger: {
    idle:   ['...11..11...', '...11..11...', '..222..222..'],
    walk_a: ['...111.1....', '...11..1....', '..222...22..'],
    walk_b: ['....1.111...', '....1..11...', '..22...222..'],
    jump:   ['...11..11...', '...22..22...', '..222..222..'],
  },
  brawler: {
    idle:   ['...11..11...', '...22..22...', '..222..222..'],
    walk_a: ['..111..1....', '..222..2....', '.2222...22..'],
    walk_b: ['....1..111..', '....2..222..', '..22...2222.'],
    jump:   ['...11..11...', '..222..222..', '..222..222..'],
  },
};

// Cache: pre-renderizza ogni sprite su un offscreen canvas così il drawImage
// in render() è uno shot solo (zero loop nested per-frame).
const SPRITE_CACHE = {};
const SPRITE_PIXEL = 2; // ogni cella sprite = 2 logici (= 1 device px dopo PIXEL_SCALE)
function buildSpriteCanvas(className, frame='idle'){
  const sprite  = PIXEL_SPRITES[className] || PIXEL_SPRITES.knight;
  const palette = PIXEL_PALETTES[className] || PIXEL_PALETTES.knight;
  const cols    = sprite[0].length;
  const rows    = sprite.length;
  // Costruisci il set di righe per il frame richiesto: prendi le prime (rows-3)
  // dallo sprite base, e sostituisci le ultime 3 dal pattern dell'animazione.
  const legPatterns = ANIM_LEGS[className] || ANIM_LEGS.knight;
  const legs = legPatterns[frame] || legPatterns.idle;
  const finalRows = sprite.slice(0, rows - 3).concat(legs.slice(0, 3));
  const c = document.createElement('canvas');
  c.width  = cols * SPRITE_PIXEL;
  c.height = rows * SPRITE_PIXEL;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  for (let r = 0; r < rows; r++){
    const rowStr = finalRows[r] || '';
    for (let col = 0; col < cols; col++){
      const ch = rowStr[col];
      if (!ch || ch === '.' || ch === '0') continue;
      const color = palette[ch];
      if (!color) continue;
      cx.fillStyle = color;
      cx.fillRect(col * SPRITE_PIXEL, r * SPRITE_PIXEL, SPRITE_PIXEL, SPRITE_PIXEL);
    }
  }
  return c;
}
function getSprite(className, frame='idle'){
  const key = className + ':' + frame;
  if (!SPRITE_CACHE[key]) SPRITE_CACHE[key] = buildSpriteCanvas(className, frame);
  return SPRITE_CACHE[key];
}

// Calcola la scala visiva sprite in funzione del raggio.
// Manteniamo SOLO multipli interi del SPRITE_PIXEL (no blur sub-pixel).
// Formula ridotta a ~metà rispetto a prima (0.10 invece di 0.18) perché
// gli sprite risultavano enormi rispetto al cerchio fisico → personaggi che
// camminavano "sotto" le piattaforme (i piedi visivi cadevano sotto la
// linea di terra fisica). Esempi:
//   radius=18 (reaper/ranger) → scale 4  (sprite 48×64 logici)
//   radius=22 (knight)        → scale 4  (sprite 48×64)
//   radius=26 (warrior)       → scale 6  (sprite 72×96)
function getSpriteScale(p){
  return Math.max(2, Math.round((p.radius || 12) * 0.10) * 2); // 2,4,6
}
// Moltiplicatore base delle armi: indipendente dalla scala personaggio.
// Le armi sono ~35% più grandi del default originale così riempiono
// la mano del personaggio invece di sembrare "stuzzicadenti".
const WEAPON_BASE_MULT = 1.35;

const PU = {
  weapon_grow: { icon:'⚡', color:'#ffbe00', label:'+SIZE'  },
  damage_boost:{ icon:'🔥', color:'#ff4040', label:'+DMG'   },
  speed_boost: { icon:'💨', color:'#00ff9d', label:'+SPEED' },
  shield:      { icon:'🛡', color:'#4488ff', label:'SHIELD' }
};

// Direzione di sguardo per player (1 = destra, -1 = sinistra).
// Si aggiorna solo quando il player si muove abbastanza: se sta fermo
// (vx ~ 0) mantiene l'ultimo facing — niente "wobble" tra frame.
// Default sensato: P1 guarda a destra (verso il centro), P2 guarda a sinistra.
const playerFacing = { 1: 1, 2: -1 };
const FACING_THRESHOLD = 0.3;

let stars = [];
function initStars(W,H){
  stars=[];
  // Tre layer di parallasse per uno spazio profondo
  for(let i=0;i<200;i++) stars.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.4+.2,a:Math.random()*.85+.15,layer:Math.floor(Math.random()*3)});
}

// ─── DECOR DI MAPPA — stato persistente per oggetti animati ───
const mapDecor = {
  clouds: [],     // platforms
  birds: [],      // platforms
  asteroids: [],  // space
  embers: [],     // volcano
  buildings: [],  // arena
  trees: [],      // platforms (alberi distanti)
  smokes: [],     // volcano (fumo)
  shootingStars: [], // space
};

// Pseudo-random deterministico semplice (per layout stabile entro la stessa mappa)
function _rand(seed){ const x = Math.sin(seed*9301+49297)*233280; return x - Math.floor(x); }

function initMapDecor(mapId, W, H){
  const D = mapDecor;
  D.clouds = []; D.birds = []; D.asteroids = []; D.embers = [];
  D.buildings = []; D.trees = []; D.smokes = []; D.shootingStars = [];

  if (mapId === 'arena'){
    // Skyline cyberpunk: edifici di altezze varie con finestre lit
    let x = 0;
    let i = 0;
    while (x < W){
      const w = 30 + Math.floor(_rand(i+1)*40);
      const h = 60 + Math.floor(_rand(i+2)*120);
      const windows = [];
      // Griglia di finestre random (lit on/off)
      for (let wy = 16; wy < h - 8; wy += 12){
        for (let wx = 6; wx < w - 6; wx += 10){
          if (_rand(i*99 + wy + wx) > 0.45) windows.push({ x: wx, y: wy });
        }
      }
      D.buildings.push({ x, w, h, windows, hue: 0.5 + _rand(i+5)*0.2 });
      x += w + 4 + Math.floor(_rand(i+9)*8);
      i++;
    }
  }
  else if (mapId === 'platforms'){
    // Nuvole pixel a layer
    for (let i = 0; i < 6; i++){
      mapDecor.clouds.push({
        x: _rand(i+1)*W, y: 20 + _rand(i+2)*90,
        w: 28 + Math.floor(_rand(i+3)*30),
        speed: 0.15 + _rand(i+4)*0.25,
        layer: i % 2
      });
    }
    // Alberi distanti
    for (let i = 0; i < 14; i++){
      D.trees.push({ x: _rand(i+10)*W, h: 40 + _rand(i+11)*30 });
    }
    // Uccelli (animati)
    for (let i = 0; i < 3; i++){
      D.birds.push({ x: _rand(i+30)*W, y: 50 + _rand(i+31)*60, phase: _rand(i+32)*Math.PI*2, speed: 0.4 + _rand(i+33)*0.3 });
    }
  }
  else if (mapId === 'space'){
    // Asteroidi sospesi (drift lento)
    for (let i = 0; i < 6; i++){
      D.asteroids.push({
        x: _rand(i+1)*W, y: 40 + _rand(i+2)*(H*0.55),
        size: 6 + Math.floor(_rand(i+3)*8),
        vx: (_rand(i+4) - 0.5) * 0.3,
        vy: (_rand(i+5) - 0.5) * 0.15,
      });
    }
    // Shooting stars
    for (let i = 0; i < 2; i++){
      D.shootingStars.push({ x: _rand(i+40)*W, y: _rand(i+41)*(H*0.4), life: -_rand(i+42)*500 });
    }
  }
  else if (mapId === 'volcano'){
    // Braci che volano via dal vulcano
    for (let i = 0; i < 28; i++){
      D.embers.push({
        x: _rand(i+1)*W, y: _rand(i+2)*H,
        vx: -0.2 - _rand(i+3)*0.5,
        vy: -0.3 - _rand(i+4)*0.6,
        size: 2 + Math.floor(_rand(i+5)*2),
        life: _rand(i+6)*100
      });
    }
    // Nuvole di fumo scuro
    for (let i = 0; i < 4; i++){
      D.smokes.push({ x: _rand(i+50)*W, y: 30 + _rand(i+51)*80, speed: 0.1 + _rand(i+52)*0.2, w: 50 + Math.floor(_rand(i+53)*30) });
    }
  }
}

// ─── Weapon Images Cache ───
const weaponImages = {};
const weaponTypes = ['sword', 'mace', 'scythe', 'spear', 'fist'];

async function loadWeaponImages() {
  for (const type of weaponTypes) {
    try {
      const img = new Image();
      img.src = `/webapp2/assets/weapons/${type}.png`;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      weaponImages[type] = img;
    } catch (e) {
      console.warn(`Failed to load weapon image: ${type}`);
    }
  }
}

// ─── WebSocket ───
function connect(){
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/webapp2/ws`;

  // Cleanup eventuale WS precedente (in caso di reconnect)
  if (ws) {
    try { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; } catch {}
    try { ws.close(); } catch {}
  }

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    reconnectAttempts = 0;
    setStatus('⚔️','CONNECTING TO MATCH','');
    try { ws.send(JSON.stringify({type:'join_match',matchId,userId:user.id,token})); }
    catch (err) { console.warn('join_match send failed:', err); }

    // Difesa: se 'joined' non arriva entro 6s mostra errore esplicito.
    if (joinTimeoutId) clearTimeout(joinTimeoutId);
    joinTimeoutId = setTimeout(() => {
      if (playerNumber == null) {
        setStatus('⚠️','SERVER NOT RESPONDING','Reload the page to retry.');
      }
    }, 6000);
  };

  ws.onerror = () => {
    if (playerNumber == null) setStatus('📡','CONNECTION ERROR','Retrying...');
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch(msg.type){
      case 'joined':
        playerNumber = msg.playerNumber;
        if (joinTimeoutId) { clearTimeout(joinTimeoutId); joinTimeoutId = null; }
        setStatus('⚔️','WAITING FOR OPPONENT','');
        ws.send(JSON.stringify({type:'game_ready'}));
        break;
      case 'opponent_connected':
        setStatus('🎮','OPPONENT CONNECTED','Choose your fighter...');
        break;
      case 'opponent_joined':
        setStatus('🔥','BOTH READY','Prepare to fight!');
        break;
      case 'countdown':
        statusMessage.className='status-message countdown';
        setStatus('',String(msg.seconds),'');
        break;
      case 'game_start':
        gameState    = msg.initialState;
        currentMapId = msg.mapId || 'arena';
        // Salva geometria mappa — non viene persa nei state_update
        if(gameState.map) savedMapGeo = gameState.map;
        // Username reali per le etichette flottanti sul canvas
        if (msg.usernames) usernames = msg.usernames;
        p1emoji.textContent = gameState.player1.emoji;
        p1name.textContent  = `${gameState.player1.name.toUpperCase()}${playerNumber===1?' · YOU':''}`;
        p2emoji.textContent = gameState.player2.emoji;
        p2name.textContent  = `${gameState.player2.name.toUpperCase()}${playerNumber===2?' · YOU':''}`;
        // Marca il blocco HUD del player locale per styling speciale (riquadro YOU)
        document.querySelector('.p1-hud')?.classList.toggle('is-you', playerNumber===1);
        document.querySelector('.p2-hud')?.classList.toggle('is-you', playerNumber===2);
        initStars(canvas.logicalW, canvas.logicalH);
        initMapDecor(currentMapId, canvas.logicalW, canvas.logicalH);
        loadWeaponImages();
        hideStatus();
        startGameLoop();
        break;
      case 'state_update':
        gameState = msg.state;
        currentMapId = msg.state.mapId || currentMapId;
        break;
      case 'game_over': {
        if (gameOver) break; // ignora duplicati
        gameOver = true;
        intentionalClose = true;
        // Ferma TUTTI gli intervalli per evitare timer fantasma
        stopAllIntervals();
        const won = playerNumber === msg.winner;
        // Vignette + shake forte + haptic burst per drammatizzare la fine
        applyEndgameVignette();
        triggerShake(2);
        haptic(won ? [40,30,40,30,80] : 80);
        // Piccolo delay prima dell'overlay per percepire l'impatto finale
        setTimeout(() => {
          statusMessage.className = 'status-message';
          setStatus(won?'🏆':'💀', won?'VICTORY!':'DEFEAT', 'Returning to dashboard...');
        }, 350);
        // Chiudi esplicitamente il WS prima del redirect
        try { ws?.close(); } catch {}
        // Se era un match di torneo, torna alla lobby del torneo invece che
        // alla dashboard — così il giocatore vede subito il bracket aggiornato
        // e, se ha vinto, può attendere il prossimo round (o vedere la finale).
        const redirectUrl = msg.tournamentId
          ? `/webapp2/tournament-lobby.html?id=${msg.tournamentId}`
          : '/webapp2/dashboard.html';
        setTimeout(()=>window.location.href=redirectUrl, 4000);
        break;
      }
      case 'error':
        intentionalClose = true;
        try { ws?.close(); } catch {}
        alert(msg.message);
        window.location.href = '/webapp2/dashboard.html';
        break;
    }
  };

  ws.onclose = () => {
    if (joinTimeoutId) { clearTimeout(joinTimeoutId); joinTimeoutId = null; }
    if (intentionalClose) return;
    // Se il game è già finito non riconnettere
    if (gameOver) return;

    if (reconnectAttempts < 5) {
      reconnectAttempts++;
      statusMessage.className = 'status-message';
      setStatus('📡','RECONNECTING',`Attempt ${reconnectAttempts}/5...`);
      setTimeout(connect, 800 * reconnectAttempts);
    } else {
      setStatus('📡','DISCONNECTED','Connection lost — reload the page.');
    }
  };
}

// ─── Game Loop ───
function startGameLoop(){
  // Sicurezza: se startGameLoop venisse richiamato (es. game_start duplicato),
  // pulisci eventuali timer precedenti prima di crearne di nuovi
  stopAllIntervals();
  renderIntervalId    = setInterval(()=>{ if(gameState && !gameOver){ render(); updateUI(); } }, 1000/60);
  inputIntervalId     = setInterval(()=>{ if(!gameOver && ws?.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'input',keys})); }, 50);
  heartbeatIntervalId = setInterval(()=>{ if(ws?.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'heartbeat'})); }, 5000);
}

function stopAllIntervals(){
  if (renderIntervalId)    { clearInterval(renderIntervalId);    renderIntervalId = null; }
  if (inputIntervalId)     { clearInterval(inputIntervalId);     inputIntervalId = null; }
  if (heartbeatIntervalId) { clearInterval(heartbeatIntervalId); heartbeatIntervalId = null; }
}

// Pulizia su unload (es. utente che chiude o naviga via)
window.addEventListener('beforeunload', () => {
  intentionalClose = true;
  stopAllIntervals();
  try { ws?.close(); } catch {}
});

// ─── RENDER ───
function render(){
  const W = canvas.logicalW, H = canvas.logicalH;
  const t = Date.now()/1000;
  const style = MAP_STYLE[currentMapId] || MAP_STYLE.arena;

  // Geometria mappa salvata al game_start — non viene sovrascritta dai state_update
  const mapGeo    = savedMapGeo;
  const platforms = mapGeo.platforms || [];
  const obstacles = mapGeo.obstacles || [];
  const hasGround = mapGeo.hasGround !== false;
  const groundY   = mapGeo.groundY || 460;

  // Reset context
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.shadowColor = 'transparent';
  ctx.setLineDash([]);

  // ── Background pixel-art per mappa (gradiente cielo + scenografia) ──
  drawMapBackground(currentMapId, W, H, t);

  // ── Ground (pixel tile floor con bordo "grass/sand/lava crust") ──
  if(hasGround){
    drawPixelGround(W, H, groundY, currentMapId, style);
  }

  // ── Platforms (pixel-block con dithering e top-light) ──
  for(const p of platforms){
    drawPixelBlock(p.x, p.y, p.w, p.h, style, /*isPlatform=*/true);
  }

  // ── Obstacles ──  (coordinate dal server = stessa fisica)
  for(const obs of obstacles){
    drawObstacle(obs, style, t);
  }

  // ── Lava ──
  if(currentMapId==='volcano' && gameState.lavaY){
    drawLava(W, H, gameState.lavaY, t);
  }

  // ── Powerups ──
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  for(const pu of (gameState.powerups||[])){
    drawPowerup(pu, t);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.setLineDash([]);

  // ── Particles (pixel-style: quadrate, no antialiasing) ──
  for(const p of (gameState.particles||[])){
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle   = p.color;
    const s = Math.max(2, Math.round(p.size * 1.4));
    ctx.fillRect(Math.round(p.x - s/2), Math.round(p.y - s/2), s, s);
  }
  ctx.globalAlpha = 1;

  // ── Anelli di squadra a terra (sotto ai giocatori, sopra le piattaforme)
  // Disegnati PRIMA dei player così non coprono i piedi ma si vedono sotto.
  drawTeamRing(gameState.player2);
  drawTeamRing(gameState.player1);

  // ── Players ──
  drawPlayer(gameState.player2);
  drawPlayer(gameState.player1);

  // ── Etichette flottanti (nickname + HP bar + freccia YOU) SOPRA tutto ──
  drawPlayerLabel(gameState.player2);
  drawPlayerLabel(gameState.player1);

  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

// ─── TEAM RING — anello colorato a terra per identificare P1/P2 ──────────
// Cyan per P1, rosso per P2. Disegnato come ellisse "pixel" leggermente
// pulsante. Aiuta a distinguere i due fighter anche se hanno la stessa classe.
function drawTeamRing(p){
  if (!p || p.dead) return;
  const t = Date.now() / 1000;
  const isMe = p.num === playerNumber;
  // Colore team (non quello della classe, che è generico)
  const teamColor = p.num === 1 ? '#00d4ff' : '#ff3d5c';
  const footY = p.y + (p.radius || 12);
  // Pulse: leggero scaling sull'anello, più marcato per il proprio player
  const pulse = isMe ? (1 + 0.10 * Math.sin(t * 4)) : (1 + 0.04 * Math.sin(t * 2.5));
  const rx = (p.radius || 12) * 1.25 * pulse;
  const ry = rx * 0.35;
  // Anello esterno (alone)
  ctx.save();
  ctx.globalAlpha = isMe ? 0.55 : 0.40;
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = isMe ? 3 : 2;
  ctx.beginPath();
  ctx.ellipse(p.x, footY + 1, rx, ry, 0, 0, Math.PI*2);
  ctx.stroke();
  // Riempimento interno semi-trasparente
  ctx.globalAlpha = isMe ? 0.18 : 0.10;
  ctx.fillStyle = teamColor;
  ctx.beginPath();
  ctx.ellipse(p.x, footY + 1, rx*0.85, ry*0.85, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

// ─── PLAYER LABEL — nickname + HP bar + freccia YOU sopra la testa ───────
// Stile pixel-art coerente col resto del gioco. Coordinate canvas logiche
// (800x500). La testa del player è approssimativamente a footY - drawH.
function drawPlayerLabel(p){
  if (!p || p.dead) return;
  const isMe = p.num === playerNumber;
  const teamColor = p.num === 1 ? '#00d4ff' : '#ff3d5c';
  const teamColorDark = p.num === 1 ? '#0080a0' : '#a01830';
  // Username (fallback al nome classe se non disponibile)
  const label = (p.num === 1 ? usernames.p1 : usernames.p2) || (p.name || `P${p.num}`);
  const displayName = String(label).toUpperCase().slice(0, 14);

  // Posizione: stessa logica dello sprite (footY - drawH)
  const spriteScale = getSpriteScale(p);
  const drawH = 16 * spriteScale;
  const footY = p.y + (p.radius || 12);
  const headY = footY - drawH;
  // Y dell'etichetta: 16px sopra la testa (canvas logico = 800x500)
  const labelY = headY - 18;
  const cx = Math.round(p.x);

  // Carattere monospaziato chunky
  ctx.save();
  ctx.font = 'bold 11px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nameW = Math.max(48, Math.ceil(ctx.measureText(displayName).width) + 10);
  const nameH = 13;
  const nameX = cx - nameW / 2;
  const nameY = labelY - nameH / 2;

  // BG pixel-card del nome (bordo team-colored)
  ctx.fillStyle = 'rgba(4,8,15,0.85)';
  ctx.fillRect(nameX, nameY, nameW, nameH);
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(nameX + 0.5, nameY + 0.5, nameW - 1, nameH - 1);
  // Bordo angolare (chunky pixel corners)
  ctx.fillStyle = teamColor;
  ctx.fillRect(nameX, nameY, 2, 2);
  ctx.fillRect(nameX + nameW - 2, nameY, 2, 2);
  ctx.fillRect(nameX, nameY + nameH - 2, 2, 2);
  ctx.fillRect(nameX + nameW - 2, nameY + nameH - 2, 2, 2);

  // Testo nome
  ctx.fillStyle = '#fff';
  ctx.shadowColor = teamColor;
  ctx.shadowBlur = isMe ? 8 : 4;
  ctx.fillText(displayName, cx, labelY + 0.5);
  ctx.shadowBlur = 0;

  // ── HP bar pixel sotto al nome ─────────────────────────────────────────
  const hpBarW = nameW;
  const hpBarH = 4;
  const hpBarX = nameX;
  const hpBarY = nameY + nameH + 2;
  const hpRatio = Math.max(0, Math.min(1, (p.hp || 0) / (p.maxHp || 1)));
  // Sfondo (vuoto)
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(hpBarX, hpBarY, hpBarW, hpBarH);
  // Riempimento HP (colore team)
  if (hpRatio > 0) {
    // Gradiente discreto: verde alto / giallo medio / rosso basso
    let fillColor = teamColor;
    if (hpRatio < 0.3) fillColor = '#ff3d5c';
    else if (hpRatio < 0.6) fillColor = '#ffbe00';
    ctx.fillStyle = fillColor;
    ctx.fillRect(hpBarX + 1, hpBarY + 1, Math.round((hpBarW - 2) * hpRatio), hpBarH - 2);
  }
  // Bordo HP bar
  ctx.strokeStyle = teamColorDark;
  ctx.lineWidth = 1;
  ctx.strokeRect(hpBarX + 0.5, hpBarY + 0.5, hpBarW - 1, hpBarH - 1);

  // ── Freccia "YOU" dorata pulsante sopra al nome ─────────────────────────
  if (isMe) {
    const t = Date.now() / 1000;
    const bob = Math.round(Math.sin(t * 4) * 2);
    const arrowY = nameY - 14 + bob;
    const ax = cx;
    // Triangolo discendente (pixel chunky)
    ctx.fillStyle = '#ffbe00';
    ctx.shadowColor = '#ffbe00';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(ax - 6, arrowY);
    ctx.lineTo(ax + 6, arrowY);
    ctx.lineTo(ax, arrowY + 6);
    ctx.closePath();
    ctx.fill();
    // Pixel highlight bianco sulla punta
    ctx.fillStyle = '#fffac0';
    ctx.fillRect(ax - 1, arrowY + 1, 2, 2);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

// ─── OBSTACLE (pixel-art con dithering) ───
function drawObstacle(obs, style, t){
  drawPixelBlock(obs.x, obs.y, obs.w, obs.h, style, /*isPlatform=*/false);
}

// ─── PIXEL BLOCK — usato per platform e obstacle ───
// Riga superiore: colore highlight (top-light a pixel).
// Riga inferiore: ombra. Resto: fill base + dithering ogni 8 px su pattern checker.
function drawPixelBlock(x, y, w, h, style, isPlatform){
  const px = 4; // dimensione "pixel" logico (= 2 device dopo PIXEL_SCALE)
  const fill   = isPlatform ? style.platFill   : style.obsFill;
  const border = isPlatform ? style.platBorder : style.obsBorder;
  const stripe = style.obsStripe;

  // body uniform fill
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);

  // dithering — pixel sparsi più scuri ogni cella pari
  ctx.fillStyle = stripe;
  for (let dy = 0; dy < h; dy += px*2){
    for (let dx = ((dy/px)%2 ? 0 : px); dx < w; dx += px*2){
      ctx.fillRect(x + dx, y + dy, px, px);
    }
  }

  // top highlight strip (riga di pixel "luce")
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(x, y, w, px);
  // bottom shadow strip
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y + h - px, w, px);
  // side borders (colore mappa)
  ctx.fillStyle = border;
  ctx.fillRect(x, y, px, h);
  ctx.fillRect(x + w - px, y, px, h);
}

// ─── MAP BACKGROUND ROUTER ───────────────────────────────────────────────
// Per ogni mappa: gradiente di sfondo + scenografia pixel-art animata.
// Chiamato all'inizio di render(), prima di ground/platform/obstacles.
function drawMapBackground(mapId, W, H, t){
  if (mapId === 'arena')         drawArenaBg(W, H, t);
  else if (mapId === 'platforms')drawPlatformsBg(W, H, t);
  else if (mapId === 'space')    drawSpaceBg(W, H, t);
  else if (mapId === 'volcano')  drawVolcanoBg(W, H, t);
  else {
    ctx.fillStyle = (MAP_STYLE[mapId]||MAP_STYLE.arena).bg;
    ctx.fillRect(0,0,W,H);
  }
}

// Gradiente verticale a "bande" pixel (no smooth, look retro)
function drawPixelSkyGradient(W, H, colors, bandSize = 8){
  // colors: array di colori dal top al bottom
  const total = H;
  const stops = colors.length;
  const bandsPerStop = Math.ceil(total / (stops * bandSize));
  let y = 0;
  for (let s = 0; s < stops - 1; s++){
    for (let b = 0; b < bandsPerStop; b++){
      const tt = b / bandsPerStop;
      ctx.fillStyle = lerpColor(colors[s], colors[s+1], tt);
      ctx.fillRect(0, y, W, bandSize);
      y += bandSize;
      if (y > total) return;
    }
  }
  ctx.fillStyle = colors[stops-1];
  ctx.fillRect(0, y, W, total - y);
}

function lerpColor(a, b, t){
  // a,b in formato #rrggbb
  const ai = parseInt(a.slice(1),16), bi = parseInt(b.slice(1),16);
  const ar=(ai>>16)&255, ag=(ai>>8)&255, ab=ai&255;
  const br=(bi>>16)&255, bg=(bi>>8)&255, bb=bi&255;
  const r = Math.round(ar + (br-ar)*t);
  const g = Math.round(ag + (bg-ag)*t);
  const bl= Math.round(ab + (bb-ab)*t);
  return `rgb(${r},${g},${bl})`;
}

// ═══════════════════════════════════════════════════════════════════════
// ARENA — cyberpunk skyline con neon e scan-lines
// ═══════════════════════════════════════════════════════════════════════
function drawArenaBg(W, H, t){
  // Sky gradient blu/viola scuro
  drawPixelSkyGradient(W, H, ['#0a0e22', '#1a1638', '#2a1a48', '#1a1030'], 12);

  // Stelle/luci lontane (statiche)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 40; i++){
    const x = Math.round(_rand(i+100)*W);
    const y = Math.round(_rand(i+101)*H*0.5);
    ctx.fillRect(x, y, 2, 2);
  }

  // Luna pixel in alto a destra
  ctx.fillStyle = '#f0e8d8';
  drawPixelCircle(W - 80, 60, 18, '#f0e8d8');
  ctx.fillStyle = 'rgba(80,80,120,0.55)';
  drawPixelCircle(W - 72, 54, 6, 'rgba(80,80,120,0.55)');

  // Skyline cyberpunk
  for (const b of mapDecor.buildings){
    // Corpo edificio
    ctx.fillStyle = '#0a1020';
    ctx.fillRect(b.x, 250 - b.h, b.w, b.h);
    // Top antenna su alcuni edifici
    if (b.h > 130){
      ctx.fillStyle = '#1a2238';
      ctx.fillRect(b.x + b.w/2 - 2, 250 - b.h - 14, 4, 14);
      // Lucina rossa pulsante in cima
      if ((Math.floor(t*2) % 2) === 0){
        ctx.fillStyle = '#ff3050';
        ctx.fillRect(b.x + b.w/2 - 2, 250 - b.h - 18, 4, 4);
      }
    }
    // Finestre lit (alcune sfarfallano)
    for (const w of b.windows){
      const flicker = (Math.sin(t*3 + b.x + w.y) > 0.85) ? 0 : 1;
      if (!flicker) continue;
      // Colore variabile: cyan/giallo/rosa
      const winColors = ['#00d4ff', '#ffbe00', '#ff66cc'];
      const c = winColors[(w.x + w.y) % 3];
      ctx.fillStyle = c;
      ctx.fillRect(b.x + w.x, 250 - b.h + w.y, 4, 6);
    }
    // Bordo top
    ctx.fillStyle = '#1e3050';
    ctx.fillRect(b.x, 250 - b.h, b.w, 2);
  }

  // Scan-line orizzontale che scorre dall'alto (effetto "screen")
  const scanY = Math.floor((t * 60) % H);
  ctx.fillStyle = 'rgba(0,212,255,0.08)';
  ctx.fillRect(0, scanY, W, 2);

  // Floor neon strip (sotto, prima del ground)
  ctx.fillStyle = 'rgba(0,212,255,0.15)';
  ctx.fillRect(0, 250, W, 4);
}

// ═══════════════════════════════════════════════════════════════════════
// PLATFORMS — foresta di giorno con cielo, nuvole, sole, alberi, uccelli
// ═══════════════════════════════════════════════════════════════════════
function drawPlatformsBg(W, H, t){
  // Cielo gradiente giorno
  drawPixelSkyGradient(W, H, ['#5fb8ff', '#8ed0ff', '#c8e4ff', '#dde8d8'], 10);

  // Sole pixel-art con raggi
  const sunX = 120, sunY = 70;
  ctx.fillStyle = 'rgba(255,220,120,0.25)';
  drawPixelCircle(sunX, sunY, 28, 'rgba(255,220,120,0.25)');
  drawPixelCircle(sunX, sunY, 20, '#ffe480');
  drawPixelCircle(sunX, sunY, 14, '#fff4b0');

  // Montagne lontane (strato 1, viola/blu)
  ctx.fillStyle = '#7a8db8';
  drawPixelMountainRange(W, 280, [55, 80, 65, 95, 75, 110, 60, 90, 70, 50]);
  // Strato 2 (verde scuro)
  ctx.fillStyle = '#4a6a52';
  drawPixelMountainRange(W, 320, [40, 60, 50, 70, 45, 80, 55, 65]);

  // Alberi distanti (silhouette)
  for (const tr of mapDecor.trees){
    drawPixelTree(tr.x, 330, tr.h);
  }

  // Nuvole pixel (in movimento)
  for (const c of mapDecor.clouds){
    c.x += c.speed * 0.6;
    if (c.x > W + 60) c.x = -60;
    drawPixelCloud(c.x, c.y, c.w, c.layer);
  }

  // Uccelli a "V"
  for (const bird of mapDecor.birds){
    bird.x += bird.speed;
    if (bird.x > W + 20) bird.x = -20;
    const flap = Math.sin(t * 6 + bird.phase) > 0;
    drawPixelBird(bird.x, bird.y, flap);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SPACE — cosmo profondo con stelle a layer, pianeta, nebulosa, asteroidi
// ═══════════════════════════════════════════════════════════════════════
function drawSpaceBg(W, H, t){
  // Sfondo gradiente nero/viola scuro
  drawPixelSkyGradient(W, H, ['#02020f', '#0a0420', '#10082c', '#180a38'], 14);

  // Nebulosa: blob viola/rosa molto translucidi
  drawNebula(W*0.25, H*0.35, 70, '#9050ff', 0.18);
  drawNebula(W*0.75, H*0.55, 60, '#ff5099', 0.12);
  drawNebula(W*0.5,  H*0.2,  90, '#5070ff', 0.10);

  // Pianeta lontano (in alto a destra) con anello
  const px = W - 110, py = 95;
  drawPixelCircle(px, py, 30, '#2a1a4a');
  drawPixelCircle(px - 6, py - 6, 24, '#5a3a8a');
  drawPixelCircle(px - 10, py - 10, 14, '#a070d8');
  // Anello orizzontale (ellisse pixelata semplice)
  ctx.fillStyle = '#b8a0e0';
  for (let dx = -42; dx <= 42; dx += 4){
    const ey = py + Math.round(Math.sin(dx*0.05 + 1.4)*4);
    ctx.fillRect(px + dx, ey, 4, 2);
  }

  // Stelle pixel a 3 layer (parallasse leggera con t)
  drawStars(W, H, t);

  // Asteroidi che ruotano e driftano lentamente
  for (const a of mapDecor.asteroids){
    a.x += a.vx; a.y += a.vy;
    if (a.x < -20) a.x = W + 20;
    if (a.x > W + 20) a.x = -20;
    if (a.y < -20) a.y = H + 20;
    if (a.y > H * 0.7) a.y = -20;
    drawPixelAsteroid(a.x, a.y, a.size);
  }

  // Shooting stars
  for (const ss of mapDecor.shootingStars){
    ss.life += 1;
    if (ss.life > 0 && ss.life < 40){
      const tailLen = 40 - ss.life;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < tailLen; i++){
        ctx.globalAlpha = (tailLen - i) / tailLen * 0.8;
        ctx.fillRect(Math.round(ss.x + i*3), Math.round(ss.y + i*1.5), 2, 2);
      }
      ctx.globalAlpha = 1;
    } else if (ss.life > 80 + _rand(ss.x)*200){
      // Reset
      ss.x = _rand(t)*W*0.6;
      ss.y = _rand(t+1)*H*0.3;
      ss.life = 0;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// VOLCANO — cielo rosso scuro, vulcano distante, braci che salgono, fumo
// ═══════════════════════════════════════════════════════════════════════
function drawVolcanoBg(W, H, t){
  // Sky gradient ross-fuoco scuro
  drawPixelSkyGradient(W, H, ['#1a0210', '#3a0a18', '#5a1a18', '#3a0a08'], 12);

  // Luna rossa
  ctx.fillStyle = '#ff5028';
  drawPixelCircle(W - 80, 55, 14, '#ff5028');
  drawPixelCircle(W - 84, 50, 8, '#ff7c4a');

  // Vulcano distante (triangolo pixel con punta che brilla)
  const vx = W * 0.7, vy = 280;
  // Profilo del vulcano
  ctx.fillStyle = '#1a0a08';
  drawPixelCone(vx, vy, 200, 140);
  // Crater glow
  ctx.fillStyle = '#ff8030';
  ctx.fillRect(vx - 12, vy - 140 + 4, 24, 4);
  ctx.fillStyle = '#ffd060';
  ctx.fillRect(vx - 8, vy - 140 + 4, 16, 2);
  // Lava che cola lungo i fianchi
  ctx.fillStyle = '#ff4010';
  ctx.fillRect(vx - 6, vy - 130, 4, 30);
  ctx.fillRect(vx + 8, vy - 120, 4, 22);

  // Vulcano più piccolo sullo sfondo a sinistra
  ctx.fillStyle = '#0a0404';
  drawPixelCone(W * 0.18, 290, 130, 90);

  // Strato di nuvole di fumo nere/grigio scuro
  for (const sm of mapDecor.smokes){
    sm.x += sm.speed;
    if (sm.x > W + 80) sm.x = -80;
    drawPixelCloud(sm.x, sm.y, sm.w, 0, '#2a1818', '#1a0a0a');
  }

  // Braci che salgono (luminescenti)
  for (const e of mapDecor.embers){
    e.x += e.vx;
    e.y += e.vy;
    e.life += 1;
    if (e.y < -10 || e.x < -10 || e.x > W + 10 || e.life > 220){
      // respawn
      e.x = _rand(e.life)*W;
      e.y = H + _rand(e.life+1)*20;
      e.vx = -0.2 - _rand(e.life+2)*0.5;
      e.vy = -0.3 - _rand(e.life+3)*0.6;
      e.life = 0;
    }
    const alpha = 1 - (e.life / 220);
    ctx.globalAlpha = alpha;
    // Pixel color: rosso brillante → arancione → giallo
    const phase = e.life / 220;
    let color = '#ff4010';
    if (phase < 0.3) color = '#ffd060';
    else if (phase < 0.7) color = '#ff8020';
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(e.x), Math.round(e.y), e.size, e.size);
  }
  ctx.globalAlpha = 1;

  // Heat haze: bande translucide ondulate vicino al ground
  ctx.fillStyle = 'rgba(255,100,40,0.06)';
  for (let i = 0; i < 8; i++){
    const wy = 380 + i*8 + Math.round(Math.sin(t*2 + i)*3);
    ctx.fillRect(0, wy, W, 2);
  }
}

// ─── Pixel-art helpers ───────────────────────────────────────────────────

// Cerchio "pixel" approssimato (Bresenham semplificato — fillRect 4x4)
function drawPixelCircle(cx, cy, r, color){
  ctx.fillStyle = color;
  const step = 2;
  for (let y = -r; y <= r; y += step){
    const xx = Math.floor(Math.sqrt(r*r - y*y));
    ctx.fillRect(Math.round(cx - xx), Math.round(cy + y), xx*2, step);
  }
}

// Range di montagne pixelate: linea spezzata con larghezza fissa per "picco"
function drawPixelMountainRange(W, baseY, heights){
  const peakW = Math.ceil(W / (heights.length - 1));
  // disegna come triangoli pixel approssimati
  for (let i = 0; i < heights.length - 1; i++){
    const x0 = i * peakW;
    const h0 = heights[i];
    const h1 = heights[i+1];
    // Fill area sotto il segmento di linea
    for (let dx = 0; dx < peakW; dx += 4){
      const tt = dx / peakW;
      const h = Math.round(h0 + (h1 - h0) * tt);
      ctx.fillRect(x0 + dx, baseY - h, 4, h + 80);
    }
  }
}

// Albero pixel (pino verde scuro silhouette)
function drawPixelTree(x, baseY, h){
  // tronco
  ctx.fillStyle = '#3a2818';
  ctx.fillRect(Math.round(x - 2), Math.round(baseY - 8), 4, 12);
  // chioma triangolare a strati
  ctx.fillStyle = '#2a5a2a';
  const levels = 4;
  for (let i = 0; i < levels; i++){
    const w = (levels - i) * 6;
    const ly = baseY - 8 - (levels - i) * 6 - i*2;
    ctx.fillRect(Math.round(x - w/2), ly, w, 4);
  }
  // punta
  ctx.fillRect(Math.round(x - 2), baseY - 8 - levels*8, 4, 4);
}

// Nuvola pixel-art (3 file di rettangoli sovrapposti)
function drawPixelCloud(x, y, w, layer, mainColor, edgeColor){
  const main = mainColor || (layer === 1 ? '#f8fafe' : '#ffffff');
  const edge = edgeColor || (layer === 1 ? '#c8d0e0' : '#d8e0f0');
  ctx.fillStyle = edge;
  ctx.fillRect(x, y, w, 4);
  ctx.fillRect(x - 4, y + 4, w + 8, 4);
  ctx.fillRect(x - 8, y + 8, w + 16, 4);
  ctx.fillRect(x - 4, y + 12, w + 8, 4);
  ctx.fillStyle = main;
  ctx.fillRect(x + 2, y + 2, w - 4, 12);
  ctx.fillRect(x - 2, y + 6, w + 4, 6);
}

// Uccello pixel a "V" (animato col flap)
function drawPixelBird(x, y, flap){
  ctx.fillStyle = '#1a1a2a';
  if (flap){
    // ali in alto
    ctx.fillRect(x - 4, y - 2, 2, 2);
    ctx.fillRect(x - 2, y, 2, 2);
    ctx.fillRect(x + 0, y + 2, 2, 2);
    ctx.fillRect(x + 2, y, 2, 2);
    ctx.fillRect(x + 4, y - 2, 2, 2);
  } else {
    // ali in basso
    ctx.fillRect(x - 4, y + 2, 2, 2);
    ctx.fillRect(x - 2, y, 2, 2);
    ctx.fillRect(x + 0, y - 2, 2, 2);
    ctx.fillRect(x + 2, y, 2, 2);
    ctx.fillRect(x + 4, y + 2, 2, 2);
  }
}

// Cono di vulcano pixel
function drawPixelCone(cx, baseY, baseW, h){
  for (let dy = 0; dy < h; dy += 4){
    const tt = dy / h;
    const w = Math.round(baseW * (1 - tt));
    ctx.fillRect(Math.round(cx - w/2), baseY - dy - 4, w, 4);
  }
}

// Nebulosa: blob translucido con dithering
function drawNebula(cx, cy, r, color, alpha){
  ctx.globalAlpha = alpha;
  drawPixelCircle(cx, cy, r, color);
  ctx.globalAlpha = alpha * 0.6;
  drawPixelCircle(cx - r*0.3, cy + r*0.2, r*0.7, color);
  ctx.globalAlpha = alpha * 0.4;
  drawPixelCircle(cx + r*0.4, cy - r*0.3, r*0.5, color);
  ctx.globalAlpha = 1;
}

// Asteroide pixel (forma irregolare con shading)
function drawPixelAsteroid(x, y, size){
  ctx.fillStyle = '#4a4258';
  // forma "tondeggiante" approssimata
  ctx.fillRect(x - size, y - size/2, size*2, size);
  ctx.fillRect(x - size/2, y - size, size, size*2);
  // shading luce alto-sinistra
  ctx.fillStyle = '#6a627a';
  ctx.fillRect(x - size, y - size/2, size, size/2);
  // crateri
  ctx.fillStyle = '#2a2238';
  ctx.fillRect(x - 2, y, 2, 2);
  ctx.fillRect(x + 2, y - 2, 2, 2);
}

// ─── PIXEL GROUND — tile sul fondo con "crust" decorativa per mappa ───
function drawPixelGround(W, H, groundY, mapId, style){
  const px = 4;
  // base fill
  ctx.fillStyle = style.platFill;
  ctx.fillRect(0, groundY, W, H - groundY);

  // dithering ground
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let dy = groundY + px*2; dy < H; dy += px*2){
    for (let dx = ((dy/px)%2 ? 0 : px); dx < W; dx += px*2){
      ctx.fillRect(dx, dy, px, px);
    }
  }

  // crust per mappa: top-row decorato
  if (mapId === 'platforms'){
    // erba: blocchi verdi + ciuffi più chiari
    ctx.fillStyle = '#6fdc6f';
    ctx.fillRect(0, groundY, W, px);
    ctx.fillStyle = '#a8f5a8';
    for (let dx = 0; dx < W; dx += px*3) ctx.fillRect(dx, groundY, px, px);
  } else if (mapId === 'volcano'){
    // crust di lava — strisce rosso/giallo che pulsano
    const t = Date.now()/300;
    ctx.fillStyle = '#ffb020';
    ctx.fillRect(0, groundY, W, px);
    ctx.fillStyle = '#ff4000';
    for (let dx = 0; dx < W; dx += px*2){
      const flicker = (Math.sin(t + dx*0.05) > 0) ? px : 0;
      ctx.fillRect(dx, groundY + flicker, px, px);
    }
  } else if (mapId === 'space'){
    // crust metallico viola con rivetti
    ctx.fillStyle = '#c090ff';
    ctx.fillRect(0, groundY, W, px);
    ctx.fillStyle = '#6030c0';
    for (let dx = px*2; dx < W; dx += px*4) ctx.fillRect(dx, groundY + px, px, px);
  } else {
    // arena: linea cyan luminosa
    ctx.fillStyle = '#80f0ff';
    ctx.fillRect(0, groundY, W, px);
    ctx.fillStyle = style.platBorder;
    ctx.fillRect(0, groundY + px, W, px);
  }
}

// ─── LAVA ───
function drawLava(W,H,lavaY,t){
  const pts=[];
  for(let x=0;x<=W;x+=8) pts.push({x,y:lavaY+Math.sin(x*.04+t*1.4)*5+Math.sin(x*.015+t*.9)*4});
  ctx.fillStyle='rgba(255,80,0,0.9)';
  ctx.beginPath(); ctx.moveTo(0,lavaY);
  for(const p of pts) ctx.lineTo(p.x,p.y);
  ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(255,200,0,0.9)';
  ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
  for(const p of pts) ctx.lineTo(p.x,p.y);
  ctx.stroke();
}

// ─── STARS (pixel-quadrate) ───
function drawStars(W,H,t){
  // 3 layer: lontane (piccole, blu), medie (bianche), vicine (giallo/grandi)
  const layerColors = ['#7a90c8', '#ffffff', '#fff4c0'];
  const layerSizes  = [2, 2, 4];
  for(const s of stars){
    const twinkle = 0.6 + 0.4 * Math.sin(t*1.5 + s.x*.02 + s.y*.03);
    ctx.globalAlpha = s.a * twinkle;
    ctx.fillStyle = layerColors[s.layer] || '#fff';
    const sz = layerSizes[s.layer] || 2;
    ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
  }
  ctx.globalAlpha=1;
}

// ─── POWERUP (cassetta pixel quadrata) ───
function drawPowerup(pu,t){
  const vis=PU[pu.type]; if(!vis) return;
  const by=pu.y+Math.round(Math.sin(t*2.8+pu.id*.001)*5);
  const r = pu.radius;
  const px = 4;

  // glow esterno (square ring pulsante)
  const pulse = (0.5 + 0.5*Math.sin(t*4));
  ctx.globalAlpha = 0.35 + pulse*0.35;
  ctx.fillStyle = vis.color;
  ctx.fillRect(pu.x - r - px*2, by - r - px*2, (r+px*2)*2, px);   // top
  ctx.fillRect(pu.x - r - px*2, by + r + px,   (r+px*2)*2, px);   // bottom
  ctx.fillRect(pu.x - r - px*2, by - r - px*2, px, (r+px*2)*2);   // left
  ctx.fillRect(pu.x + r + px,   by - r - px*2, px, (r+px*2)*2);   // right
  ctx.globalAlpha = 1;

  // box interna
  ctx.fillStyle = 'rgba(4,8,15,0.88)';
  ctx.fillRect(pu.x - r, by - r, r*2, r*2);
  // bordo colorato
  ctx.fillStyle = vis.color;
  ctx.fillRect(pu.x - r, by - r,        r*2, px);          // top
  ctx.fillRect(pu.x - r, by + r - px,   r*2, px);          // bottom
  ctx.fillRect(pu.x - r, by - r,        px,  r*2);         // left
  ctx.fillRect(pu.x + r - px, by - r,   px,  r*2);         // right

  // icona emoji (centered, monospace-ish per coerenza pixel)
  ctx.font=`${r+4}px serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(vis.icon,pu.x,by+1);

  // label sotto
  ctx.font='bold 8px monospace'; ctx.fillStyle=vis.color;
  ctx.globalAlpha=0.8+0.2*Math.sin(t*3);
  ctx.fillText(vis.label,pu.x,by+r+10);
  ctx.globalAlpha=1; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}

// ─── PLAYER ───
function drawPlayer(p){
  if(p.dead) return;
  const effs = gameState.effects?.[p.num===1?'p1':'p2'] || {};
  const hasShield = effs.shield>0;
  const hasDmg    = effs.damage_boost>0;
  const hasSpeed  = effs.speed_boost>0;
  const isFlash   = p.hitFlash>0;
  const t = Date.now()/1000;

  // speed trail
  if(hasSpeed && (Math.abs(p.vx)>0.5 || Math.abs(p.vy)>0.5)){
    for(let i=1;i<=3;i++){
      ctx.globalAlpha=0.1/i; ctx.fillStyle='#00ff9d';
      ctx.beginPath(); ctx.arc(p.x-p.vx*i*3, p.y-p.vy*i*3, p.radius*(1-i*.2), 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  // shield aura
  if(hasShield){
    ctx.strokeStyle=`rgba(68,136,255,${0.5+0.3*Math.sin(t*4)})`;
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.radius+12,0,Math.PI*2); ctx.stroke();
  }

  // ── PIXEL SPRITE BODY ────────────────────────────────────────────────
  // Sprite procedurale per classe + animazioni (walk a/b, jump, idle).
  // Lo sprite è scelto in base allo stato di movimento del player (vx, vy,
  // onGround dal server). Bob verticale + squash/stretch danno feel "punchy".
  const className = (p.className || p.name || 'knight').toLowerCase();

  // ── ANIMAZIONE: scelta del frame ────────────────────────────────────
  const moving = Math.abs(p.vx) > FACING_THRESHOLD;
  const inAir  = (p.onGround === false) || Math.abs(p.vy) > 1.5;
  let frame = 'idle';
  let bobY = 0;            // offset verticale "hop" durante la camminata
  let sxScale = 1, syScale = 1; // squash/stretch su salto

  if (inAir){
    frame = 'jump';
    // Salto: stretch in salita, squash in atterraggio
    if (p.vy < -0.5) { sxScale = 0.92; syScale = 1.10; }
    else if (p.vy > 0.5) { sxScale = 1.06; syScale = 0.94; }
  } else if (moving){
    // Walk-cycle: alterna due frame ~7Hz, con micro-hop
    const phase = Math.floor(t * 7) % 2;
    frame = phase ? 'walk_b' : 'walk_a';
    bobY = phase ? -1 : 0;
  }

  const sprite = getSprite(className, frame);
  const spriteScale = getSpriteScale(p);
  const sw = sprite.width  * spriteScale / SPRITE_PIXEL;
  const sh = sprite.height * spriteScale / SPRITE_PIXEL;

  // Flip orizzontale in base alla direzione di MOVIMENTO reale (vx del server).
  if (p.vx > FACING_THRESHOLD)       playerFacing[p.num] = 1;
  else if (p.vx < -FACING_THRESHOLD) playerFacing[p.num] = -1;
  const facing = playerFacing[p.num] || 1;

  // Applico squash/stretch alle dimensioni finali (mantenendo i piedi a terra)
  const drawW = sw * sxScale;
  const drawH = sh * syScale;
  const sx = p.x - drawW / 2;
  // "ancoraggio piedi": i piedi visivi devono coincidere col punto di
  // contatto fisico col terreno, NON con il centro dello sprite. Il server
  // colloca il player a p.y con il cerchio fisico che tocca terra a
  // p.y + p.radius. Quindi i piedi pixel li disegniamo lì, e lo sprite si
  // estende verso l'alto. Così non camminano più sotto le piattaforme.
  const footY = p.y + (p.radius || 12);
  const sy = footY - drawH + bobY;

  // shadow ai piedi (ellisse pixel) — leggermente più larga sui personaggi grossi
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(p.x - p.radius*0.85, footY - 1, p.radius*1.7, 4);

  // glow / hit flash via shadowBlur sul drawImage
  ctx.shadowColor = isFlash ? '#fff' : (hasDmg ? '#ff3333' : p.color);
  ctx.shadowBlur  = isFlash ? 30 : (hasDmg ? 22 : 14);
  ctx.save();
  if (facing === -1){
    ctx.translate(p.x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, -drawW/2, sy, drawW, drawH);
  } else {
    ctx.drawImage(sprite, sx, sy, drawW, drawH);
  }
  ctx.restore();
  ctx.shadowBlur = 0;

  // Hit flash overlay (rosso translucido sopra lo sprite)
  if (isFlash){
    ctx.globalAlpha = 0.55;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(sx, sy, drawW, drawH);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Polvere ai piedi quando cammina a terra (pixel particles)
  if (moving && !inAir){
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(180,170,150,0.7)';
    const dustX = p.x - facing * (p.radius*0.4 + Math.random()*4);
    ctx.fillRect(dustX | 0, (footY + Math.random()*2) | 0, 3, 2);
    ctx.globalAlpha = 1;
  }

  drawWeapons(p, effs, spriteScale);
  ctx.globalAlpha=1; ctx.shadowBlur=0;
}

function drawWeapons(p, effs, spriteScale){
  const grow = effs?.weapon_grow > 0;
  // Le armi hanno un moltiplicatore base costante (WEAPON_BASE_MULT = 1.35),
  // ovvero il 35% più grandi del default originale — così riempiono la mano
  // del personaggio. Personaggi NON ingranditi (la base resta originale).
  // weapon_grow buff applica un ulteriore 1.85×.
  const sm = (grow ? 1.85 : 1) * WEAPON_BASE_MULT;

  for(const w of p.weapons){
    const ox=p.x+Math.cos(w.currentAngle)*w.orbitRadius;
    const oy=p.y+Math.sin(w.currentAngle)*w.orbitRadius;
    ctx.save();
    ctx.translate(ox,oy);
    ctx.rotate(w.currentAngle+Math.PI/2);

    const gc=grow?'#ffbe00':p.color;
    ctx.shadowColor=gc;
    ctx.shadowBlur=grow?24:10;

    // Proportions optimized per weapon type (relative to player radius ~12)
    const proportions = {
      sword:  { w: 18, h: 60, ox: 0, oy: 0 },
      mace:   { w: 32, h: 38, ox: 0, oy: -2 },
      scythe: { w: 35, h: 65, ox: 8, oy: 0 },
      spear:  { w: 20, h: 70, ox: 0, oy: -2 },
      fist:   { w: 28, h: 32, ox: 0, oy: 0 }
    };

    const props = proportions[w.type] || { w: 20, h: 50, ox: 0, oy: 0 };
    const weaponW = props.w * sm;
    const weaponH = props.h * sm;
    // Anche gli offset della "mano" scalano con sm così l'arma resta agganciata
    // al pugno del personaggio quando il personaggio cresce.
    const ox2 = props.ox * sm;
    const oy2 = props.oy * sm;

    // Try to draw weapon image, fall back to shapes if not loaded
    const img = weaponImages[w.type];
    if(img && img.complete){
      try {
        ctx.drawImage(img, ox2 - weaponW/2, oy2 - weaponH/2, weaponW, weaponH);
      } catch(e) {
        // Fallback if image fails
        ctx.fillStyle=gc;
        ctx.fillRect(ox2 - weaponW/2, oy2 - weaponH/2, weaponW, weaponH);
      }
    } else {
      // Fallback to old canvas drawing while images load
      ctx.fillStyle=gc;
      ctx.fillRect(ox2 - weaponW/2, oy2 - weaponH/2, weaponW, weaponH);
    }
    
    ctx.shadowBlur=0; 
    ctx.restore();
  }
}

// ─── UI ───
function updateUI(){
  const p1=gameState.player1, p2=gameState.player2;
  const h1=Math.max(0,p1.hp/p1.maxHp*100);
  const h2=Math.max(0,p2.hp/p2.maxHp*100);
  hpBar1.style.width=h1+'%'; hpBar2.style.width=h2+'%';
  hpText1.textContent=`${Math.ceil(p1.hp)} / ${p1.maxHp}`;
  hpText2.textContent=`${Math.ceil(p2.hp)} / ${p2.maxHp}`;
  hpBar1.style.background=h1<25?'linear-gradient(90deg,#f00,#f33)':h1<50?'linear-gradient(90deg,#f80,#fa0)':'';
  hpBar2.style.background=h2<25?'linear-gradient(90deg,#f00,#f33)':h2<50?'linear-gradient(90deg,#f80,#fa0)':'';
  const t=Math.max(0,gameState.timer);
  timerEl.textContent=`${Math.floor(t/60)}:${(t%60).toString().padStart(2,'0')}`;
  timerEl.classList.toggle('danger',t<=30);
  updateEffects(effects1, gameState.effects?.p1||{});
  updateEffects(effects2, gameState.effects?.p2||{});
}

const PILLS={
  weapon_grow: {cls:'effect-weapon_grow',txt:'⚡+SIZE'},
  damage_boost:{cls:'effect-damage_boost',txt:'🔥+DMG'},
  speed_boost: {cls:'effect-speed_boost', txt:'💨+SPD'},
  shield:      {cls:'effect-shield',      txt:'🛡SHIELD'}
};
function updateEffects(el,effs){
  const active=Object.entries(effs).filter(([,v])=>v>0).map(([k])=>k);
  for(const pill of [...el.querySelectorAll('.effect-pill')]){
    if(!active.includes(pill.dataset.type)) pill.remove();
  }
  const have=new Set([...el.querySelectorAll('.effect-pill')].map(e=>e.dataset.type));
  for(const k of active){
    if(!have.has(k)&&PILLS[k]){
      const d=document.createElement('span');
      d.className=`effect-pill ${PILLS[k].cls}`; d.dataset.type=k; d.textContent=PILLS[k].txt;
      el.appendChild(d);
    }
  }
}

function setStatus(icon,msg,sub=''){
  statusIcon.textContent=icon; statusMessage.textContent=msg; statusSub.textContent=sub;
  statusOverlay.classList.remove('hidden');
}
function hideStatus(){ statusOverlay.classList.add('hidden'); }

function lighten(hex,a){
  const c=hexToRgb(hex); if(!c) return hex;
  return `rgb(${Math.min(255,c.r+a*255)|0},${Math.min(255,c.g+a*255)|0},${Math.min(255,c.b+a*255)|0})`;
}
function darken(hex,a){
  const c=hexToRgb(hex); if(!c) return hex;
  return `rgb(${Math.max(0,c.r-a*255)|0},${Math.max(0,c.g-a*255)|0},${Math.max(0,c.b-a*255)|0})`;
}
function hexToRgb(hex){
  if(typeof hex!=='string'||!hex.startsWith('#')) return null;
  const r=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r?{r:parseInt(r[1],16),g:parseInt(r[2],16),b:parseInt(r[3],16)}:null;
}

document.addEventListener('keydown',(e)=>{
  if(['a','A','ArrowLeft'].includes(e.key))  keys.left=true;
  if(['d','D','ArrowRight'].includes(e.key)) keys.right=true;
  if(['w','W','ArrowUp'].includes(e.key))    keys.up=true;
  if(['s','S','ArrowDown'].includes(e.key))  keys.down=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});
document.addEventListener('keyup',(e)=>{
  if(['a','A','ArrowLeft'].includes(e.key))  keys.left=false;
  if(['d','D','ArrowRight'].includes(e.key)) keys.right=false;
  if(['w','W','ArrowUp'].includes(e.key))    keys.up=false;
  if(['s','S','ArrowDown'].includes(e.key))  keys.down=false;
});

document.getElementById('forfeitBtn').addEventListener('click',()=>{
  if(confirm('Sicuro di voler abbandonare?')) ws.send(JSON.stringify({type:'forfeit'}));
});

// ─── TOUCH CONTROLS ───
// Feature detection: alcuni browser (Samsung Internet con DeX/S-Pen, Chrome
// con touch laptop, ecc.) non matchano `(hover:none) and (pointer:coarse)`
// anche su device chiaramente touch. Se rileviamo touch capability via JS,
// forziamo la visualizzazione dei pulsanti aggiungendo body.has-touch.
if ('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)) {
  document.body.classList.add('has-touch');
}

function bindTouchButton(btnId, key){
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const press = (e) => {
    e.preventDefault();
    keys[key] = true;
    btn.classList.add('pressed');
  };
  const release = (e) => {
    e.preventDefault();
    keys[key] = false;
    btn.classList.remove('pressed');
  };
  btn.addEventListener('touchstart', press,   { passive: false });
  btn.addEventListener('touchend',   release, { passive: false });
  btn.addEventListener('touchcancel',release, { passive: false });
  // Fallback per device misti (es. tablet con mouse)
  btn.addEventListener('mousedown',  press);
  btn.addEventListener('mouseup',    release);
  btn.addEventListener('mouseleave', release);
}

bindTouchButton('btnLeft',  'left');
bindTouchButton('btnRight', 'right');
bindTouchButton('btnJump',  'up');

// Previene zoom su doppio tap sui pulsanti
document.querySelectorAll('.touch-btn').forEach(btn => {
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

// ─── SCREEN SHAKE / HIT FLASH / DAMAGE POPUPS (graphics polish) ───
const arenaWrap = document.querySelector('.arena-wrapper');
let prevHp1 = null, prevHp2 = null;
let prevPowerupIds = new Set();
let wasCritical1 = false, wasCritical2 = false;

function triggerShake(intensity = 1){
  if (!arenaWrap) return;
  arenaWrap.classList.remove('shake-1','shake-2');
  void arenaWrap.offsetWidth;
  arenaWrap.classList.add(intensity >= 2 ? 'shake-2' : 'shake-1');
  setTimeout(() => arenaWrap.classList.remove('shake-1','shake-2'), 280);
}

function triggerFlash(){
  if (!arenaWrap) return;
  arenaWrap.classList.add('flash');
  setTimeout(() => arenaWrap.classList.remove('flash'), 90);
}

// Vibrazione tattile sul mobile (silenziosa su desktop)
function haptic(ms = 15){
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
}

// Damage popup floating sopra il player colpito
function spawnDamagePopup(canvasX, canvasY, dmg, color){
  if (!arenaWrap || !canvas) return;
  // Converti coord canvas (logiche 800x500) in coord CSS dell'arena-wrapper
  const rect = canvas.getBoundingClientRect();
  const wrapRect = arenaWrap.getBoundingClientRect();
  const scaleX = rect.width  / canvas.logicalW;
  const scaleY = rect.height / canvas.logicalH;
  const cssX = (rect.left - wrapRect.left) + canvasX * scaleX;
  const cssY = (rect.top  - wrapRect.top)  + canvasY * scaleY;

  const el = document.createElement('div');
  el.className = 'damage-popup' + (dmg >= 25 ? ' crit' : '');
  el.style.left = `${cssX}px`;
  el.style.top  = `${cssY - 20}px`;
  el.style.color = color;
  el.textContent = `-${Math.round(dmg)}`;
  arenaWrap.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// Burst on power-up pickup
function spawnPickupBurst(canvasX, canvasY, color){
  if (!arenaWrap || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const wrapRect = arenaWrap.getBoundingClientRect();
  const scaleX = rect.width  / canvas.logicalW;
  const scaleY = rect.height / canvas.logicalH;
  const cssX = (rect.left - wrapRect.left) + canvasX * scaleX;
  const cssY = (rect.top  - wrapRect.top)  + canvasY * scaleY;
  const el = document.createElement('div');
  el.className = 'pickup-burst';
  el.style.left = `${cssX}px`;
  el.style.top  = `${cssY}px`;
  el.style.background = `radial-gradient(circle, ${color}cc 0%, ${color}00 70%)`;
  el.style.boxShadow = `0 0 24px ${color}`;
  arenaWrap.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

// Hook nel render loop: detect damage, criticals, pickup events
function checkDamageEffects(){
  if (!gameState) return;
  const p1 = gameState.player1, p2 = gameState.player2;
  const hp1 = p1?.hp, hp2 = p2?.hp;
  const maxHp1 = p1?.maxHp || 1, maxHp2 = p2?.maxHp || 1;

  // ── Damage events ──
  if (prevHp1 !== null && hp1 < prevHp1) {
    const dmg = prevHp1 - hp1;
    triggerShake(dmg > 15 ? 2 : 1);
    if (playerNumber === 1) { triggerFlash(); haptic(dmg > 15 ? 30 : 12); }
    spawnDamagePopup(p1.x, p1.y - p1.radius, dmg, '#ff6680');
  }
  if (prevHp2 !== null && hp2 < prevHp2) {
    const dmg = prevHp2 - hp2;
    triggerShake(dmg > 15 ? 2 : 1);
    if (playerNumber === 2) { triggerFlash(); haptic(dmg > 15 ? 30 : 12); }
    spawnDamagePopup(p2.x, p2.y - p2.radius, dmg, '#80e0ff');
  }

  // ── Low-HP critical state (per il giocatore locale) ──
  const myHp    = playerNumber === 1 ? hp1 : hp2;
  const myMaxHp = playerNumber === 1 ? maxHp1 : maxHp2;
  const myCritical = myHp > 0 && (myHp / myMaxHp) < 0.25;
  if (myCritical && !arenaWrap.classList.contains('critical')) {
    arenaWrap.classList.add('critical');
  } else if (!myCritical && arenaWrap.classList.contains('critical')) {
    arenaWrap.classList.remove('critical');
  }

  // Animation shake su HP bar quando colpito + glow critical
  const setHpCritical = (wrap, bar, isCrit, justHit) => {
    if (!wrap || !bar) return;
    if (isCrit) wrap.classList.add('critical'); else wrap.classList.remove('critical');
    if (justHit) {
      bar.classList.remove('low');
      void bar.offsetWidth;
      bar.classList.add('low');
      setTimeout(() => bar.classList.remove('low'), 500);
    }
  };
  const wrap1 = hpBar1?.parentElement, wrap2 = hpBar2?.parentElement;
  setHpCritical(wrap1, hpBar1, hp1/maxHp1 < 0.25, prevHp1 !== null && hp1 < prevHp1);
  setHpCritical(wrap2, hpBar2, hp2/maxHp2 < 0.25, prevHp2 !== null && hp2 < prevHp2);
  wasCritical1 = hp1/maxHp1 < 0.25;
  wasCritical2 = hp2/maxHp2 < 0.25;

  // ── Power-up pickup detection (ID scomparso = raccolto) ──
  const currentIds = new Set((gameState.powerups || []).map(p => p.id));
  const PU_COLORS = { weapon_grow:'#ffbe00', damage_boost:'#ff4040', speed_boost:'#00ff9d', shield:'#4488ff' };
  for (const pu of (gameState.powerups || [])) prevPowerupIds.delete(pu.id);
  // Quello che resta in prevPowerupIds è stato raccolto
  for (const oldId of prevPowerupIds) {
    // approssima la posizione vicino al player più vicino — fallback al centro
    const cx = (p1?.x + p2?.x) / 2 || 400, cy = (p1?.y + p2?.y) / 2 || 250;
    spawnPickupBurst(cx, cy, '#ffbe00');
  }
  prevPowerupIds = currentIds;

  prevHp1 = hp1;
  prevHp2 = hp2;
}

// Endgame vignette
function applyEndgameVignette(){
  if (arenaWrap) arenaWrap.classList.add('endgame');
}

// Aggancia il check al render loop esistente
const _origRender = render;
render = function(){
  _origRender();
  checkDamageEffects();
};

connect();