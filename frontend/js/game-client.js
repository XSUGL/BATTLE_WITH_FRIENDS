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

// Cache: pre-renderizza ogni sprite su un offscreen canvas così il drawImage
// in render() è uno shot solo (zero loop nested per-frame).
const SPRITE_CACHE = {};
const SPRITE_PIXEL = 2; // ogni cella sprite = 2 logici (= 1 device px dopo PIXEL_SCALE)
function buildSpriteCanvas(className){
  const sprite  = PIXEL_SPRITES[className] || PIXEL_SPRITES.knight;
  const palette = PIXEL_PALETTES[className] || PIXEL_PALETTES.knight;
  const cols    = sprite[0].length;
  const rows    = sprite.length;
  const c = document.createElement('canvas');
  c.width  = cols * SPRITE_PIXEL;
  c.height = rows * SPRITE_PIXEL;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  for (let r = 0; r < rows; r++){
    for (let col = 0; col < cols; col++){
      const ch = sprite[r][col];
      if (ch === '.' || ch === '0') continue;
      const color = palette[ch];
      if (!color) continue;
      cx.fillStyle = color;
      cx.fillRect(col * SPRITE_PIXEL, r * SPRITE_PIXEL, SPRITE_PIXEL, SPRITE_PIXEL);
    }
  }
  return c;
}
function getSprite(className){
  if (!SPRITE_CACHE[className]) SPRITE_CACHE[className] = buildSpriteCanvas(className);
  return SPRITE_CACHE[className];
}

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
  for(let i=0;i<160;i++) stars.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.4+.2,a:Math.random()*.85+.15});
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
        p1emoji.textContent = gameState.player1.emoji;
        p1name.textContent  = gameState.player1.name.toUpperCase();
        p2emoji.textContent = gameState.player2.emoji;
        p2name.textContent  = gameState.player2.name.toUpperCase();
        initStars(canvas.logicalW, canvas.logicalH);
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

  // ── Background ──
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, W, H);

  if(currentMapId === 'space') drawStars(W, H, t);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.015)';
  ctx.lineWidth = 1;
  for(let x=0;x<=W;x+=40){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke(); }
  for(let y=0;y<=H;y+=40){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke(); }

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

  // ── Players ──
  drawPlayer(gameState.player2);
  drawPlayer(gameState.player1);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
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
  for(const s of stars){
    ctx.globalAlpha = s.a*(0.65+0.35*Math.sin(t*1.2+s.x*.01));
    ctx.fillStyle='#fff';
    const sz = s.r > 1 ? 4 : 2; // due taglie pixel
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
  // Sprite procedurale per classe. Aura/shadow/flash applicati allo sprite,
  // non più al pallino gradiente. Lo sprite cached è 24×32 pixel (logici).
  const className = (p.className || p.name || 'knight').toLowerCase();
  const sprite = getSprite(className);
  // Dimensione visiva sprite proporzionale al raggio del player. Manteniamo
  // multipli interi del SPRITE_PIXEL per evitare blur sub-pixel.
  const spriteScale = Math.max(2, Math.round(p.radius * 0.16) * 2); // 2,4,6,...
  const sw = sprite.width  * spriteScale / SPRITE_PIXEL;
  const sh = sprite.height * spriteScale / SPRITE_PIXEL;
  // Flip orizzontale in base alla direzione di MOVIMENTO reale (vx del server).
  // Se vx > soglia → guarda a destra; se vx < -soglia → guarda a sinistra.
  // Se ~0 (fermo o solo verticale) → mantieni l'ultimo facing.
  if (p.vx > FACING_THRESHOLD)       playerFacing[p.num] = 1;
  else if (p.vx < -FACING_THRESHOLD) playerFacing[p.num] = -1;
  const facing = playerFacing[p.num] || 1;
  const sx = p.x - sw/2;
  const sy = p.y - sh/2 - 2;

  // shadow ai piedi (ellisse pixel)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(p.x - p.radius*0.7, p.y + sh*0.42, p.radius*1.4, 4);

  // glow / hit flash via shadowBlur sul drawImage
  ctx.shadowColor = isFlash ? '#fff' : (hasDmg ? '#ff3333' : p.color);
  ctx.shadowBlur  = isFlash ? 30 : (hasDmg ? 22 : 14);
  ctx.save();
  if (facing === -1){
    ctx.translate(p.x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, -sw/2, sy, sw, sh);
  } else {
    ctx.drawImage(sprite, sx, sy, sw, sh);
  }
  ctx.restore();
  ctx.shadowBlur = 0;

  // Hit flash overlay (rosso translucido sopra lo sprite)
  if (isFlash){
    ctx.globalAlpha = 0.55;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  drawWeapons(p,effs);
  ctx.globalAlpha=1; ctx.shadowBlur=0;
}

function drawWeapons(p,effs){
  const grow = effs?.weapon_grow>0;
  const sm   = grow ? 1.85 : 1;
  
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
    
    // Try to draw weapon image, fall back to shapes if not loaded
    const img = weaponImages[w.type];
    if(img && img.complete){
      try {
        ctx.drawImage(img, props.ox - weaponW/2, props.oy - weaponH/2, weaponW, weaponH);
      } catch(e) {
        // Fallback if image fails
        ctx.fillStyle=gc; 
        ctx.fillRect(props.ox - weaponW/2, props.oy - weaponH/2, weaponW, weaponH);
      }
    } else {
      // Fallback to old canvas drawing while images load
      ctx.fillStyle=gc; 
      ctx.fillRect(props.ox - weaponW/2, props.oy - weaponH/2, weaponW, weaponH);
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