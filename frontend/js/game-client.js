import { getToken, getUser } from './api/auth-api.js';

const urlParams = new URLSearchParams(window.location.search);
const matchId   = parseInt(urlParams.get('matchId'));
if (!matchId) { window.location.href = '/dashboard.html'; }

const user  = getUser();
const token = getToken();
if (!user || !token) { window.location.href = '/index.html'; }

let ws, playerNumber, gameState = null;
let currentMapId = 'arena';

const canvas        = document.getElementById('gameCanvas');
const ctx           = canvas.getContext('2d');
const timerEl       = document.getElementById('timer');
const hpBar1        = document.getElementById('hpBar1');
const hpBar2        = document.getElementById('hpBar2');
const hpText1       = document.getElementById('hpText1');
const hpText2       = document.getElementById('hpText2');
const p1emoji       = document.getElementById('p1emoji');
const p2emoji       = document.getElementById('p2emoji');
const p1name        = document.getElementById('p1name');
const p2name        = document.getElementById('p2name');
const statusOverlay = document.getElementById('statusOverlay');
const statusMessage = document.getElementById('statusMessage');
const statusSub     = document.getElementById('statusSub');
const statusIcon    = document.getElementById('statusIcon');

const keys = { up: false, down: false, left: false, right: false };

// ── Map visual configs (solo frontend) ──
const MAP_CONFIGS = {
  arena: {
    bgColor: '#070b11', hasGround: true, groundY: 460,
    groundColor: 'rgba(0,200,255,0.5)', platforms: []
  },
  platforms: {
    bgColor: '#080f0a', hasGround: true, groundY: 460,
    groundColor: 'rgba(80,200,80,0.5)', platformColor: 'rgba(80,200,80,0.7)',
    platforms: [
      { x: 80,  y: 340, w: 140, h: 14 },
      { x: 580, y: 340, w: 140, h: 14 },
      { x: 320, y: 260, w: 160, h: 14 },
      { x: 160, y: 180, w: 120, h: 14 },
      { x: 520, y: 180, w: 120, h: 14 }
    ]
  },
  space: {
    bgColor: '#02020f', hasGround: false, groundY: 500,
    groundColor: 'rgba(100,100,255,0.3)', platforms: []
  },
  volcano: {
    bgColor: '#110500', hasGround: true, groundY: 460,
    groundColor: 'rgba(255,80,0,0.8)', platformColor: 'rgba(200,80,20,0.8)',
    platforms: [
      { x: 60,  y: 300, w: 120, h: 14 },
      { x: 620, y: 300, w: 120, h: 14 },
      { x: 290, y: 220, w: 220, h: 14 }
    ]
  }
};

// ── WebSocket ──
function connect() {
  ws = new WebSocket('ws://localhost:3000');

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join_match', matchId, userId: user.id, token }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {

      case 'joined':
        playerNumber = msg.playerNumber;
        setStatus('⚔️', 'WAITING', 'Opponent connecting...');
        ws.send(JSON.stringify({ type: 'game_ready' }));
        break;

      case 'opponent_joined':
        setStatus('🎮', 'READY!', 'Get ready...');
        break;

      case 'countdown':
        statusMessage.className = 'status-message countdown';
        setStatus('', String(msg.seconds), 'FIGHT!');
        break;

      case 'game_start':
        gameState    = msg.initialState;
        currentMapId = msg.mapId || 'arena';
        p1emoji.textContent = gameState.player1.emoji;
        p1name.textContent  = gameState.player1.name;
        p2emoji.textContent = gameState.player2.emoji;
        p2name.textContent  = gameState.player2.name;
        hideStatus();
        startGameLoop();
        break;

      case 'state_update':
        gameState = msg.state;
        break;

      case 'game_over':
        const won = playerNumber === msg.winner;
        statusMessage.className = 'status-message';
        setStatus(won ? '🏆' : '💀', won ? 'VICTORY!' : 'DEFEAT', 'Returning to dashboard...');
        setTimeout(() => window.location.href = '/dashboard.html', 4000);
        break;

      case 'error':
        alert(msg.message);
        window.location.href = '/dashboard.html';
        break;
    }
  };

  ws.onclose = () => {
    if (gameState) {
      statusMessage.className = 'status-message';
      setStatus('📡', 'DISCONNECTED', 'Connection lost');
    }
  };
}

// ── Game Loop ──
function startGameLoop() {
  setInterval(() => { if (gameState) { render(); updateUI(); } }, 1000 / 60);
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', keys }));
  }, 50);
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heartbeat' }));
  }, 5000);
}

// ── Render ──
function render() {
  const W = canvas.width, H = canvas.height;
  const map = MAP_CONFIGS[currentMapId] || MAP_CONFIGS.arena;

  // Sfondo
  ctx.fillStyle = map.bgColor;
  ctx.fillRect(0, 0, W, H);

  // Stelle per spazio
  if (currentMapId === 'space') drawStars(W, H);

  // Griglia
  ctx.strokeStyle = 'rgba(255,255,255,0.02)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Suolo
  if (map.hasGround) {
    const groundY = map.groundY;
    const gg = ctx.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, map.groundColor);
    gg.addColorStop(1, 'transparent');
    ctx.fillStyle = gg;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = map.groundColor;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
  }

  // Piattaforme
  if (map.platforms && map.platforms.length > 0) {
    for (const p of map.platforms) {
      const pg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      pg.addColorStop(0, map.platformColor || 'rgba(100,200,100,0.7)');
      pg.addColorStop(1, map.platformColor ? darken(map.platformColor, 0.3) : 'rgba(60,140,60,0.4)');
      ctx.fillStyle = pg;
      ctx.shadowColor = map.platformColor || 'rgba(100,200,100,0.5)';
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, 4); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // Lava (vulcano)
  if (currentMapId === 'volcano' && gameState.lavaY) {
    drawLava(W, H, gameState.lavaY);
  }

  // Particelle
  if (gameState.particles) {
    for (const p of gameState.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawPlayer(gameState.player1);
  drawPlayer(gameState.player2);
}

function drawStars(W, H) {
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  const seeds = [42,137,283,512,711,900,1024,200,333,450,600,750,850,950,100,77,321,654,888,222];
  for (const s of seeds) {
    const x = (s * 53) % W;
    const y = (s * 37) % H;
    const r = s % 3 === 0 ? 1.5 : 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawLava(W, H, lavaY) {
  const lg = ctx.createLinearGradient(0, lavaY, 0, H);
  lg.addColorStop(0, 'rgba(255,120,0,0.9)');
  lg.addColorStop(0.3, 'rgba(255,50,0,0.8)');
  lg.addColorStop(1, 'rgba(180,0,0,0.95)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, lavaY, W, H - lavaY);

  // Bordo ondulato
  ctx.strokeStyle = 'rgba(255,200,0,0.9)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(255,150,0,0.8)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  const t = Date.now() / 300;
  ctx.moveTo(0, lavaY);
  for (let x = 0; x <= W; x += 20) {
    ctx.lineTo(x, lavaY + Math.sin(x / 40 + t) * 5);
  }
  ctx.lineTo(W, lavaY);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawPlayer(p) {
  if (!p) return;
  const color = p.color;
  const cx = p.x, cy = p.y;

  // Ombra a terra
  const map = MAP_CONFIGS[currentMapId] || MAP_CONFIGS.arena;
  const shadowGrad = ctx.createRadialGradient(cx, map.groundY, 0, cx, map.groundY, p.radius * 2);
  shadowGrad.addColorStop(0, p.shadowColor || 'rgba(255,255,255,0.1)');
  shadowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath(); ctx.ellipse(cx, map.groundY, p.radius * 1.5, 6, 0, 0, Math.PI * 2); ctx.fill();

  // Alone
  const glowGrad = ctx.createRadialGradient(cx, cy, p.radius * 0.3, cx, cy, p.radius * 2);
  glowGrad.addColorStop(0, p.shadowColor || 'rgba(255,255,255,0.1)');
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.beginPath(); ctx.arc(cx, cy, p.radius * 2, 0, Math.PI * 2); ctx.fill();

  // Flash danno
  const isFlashing = p.hitFlash > 0 && p.hitFlash % 2 === 0;

  // Corpo sfera
  const bodyGrad = ctx.createRadialGradient(cx - p.radius * 0.3, cy - p.radius * 0.3, 0, cx, cy, p.radius);
  bodyGrad.addColorStop(0, isFlashing ? '#ffffff' : lighten(color, 0.4));
  bodyGrad.addColorStop(0.6, isFlashing ? '#ffaaaa' : color);
  bodyGrad.addColorStop(1, isFlashing ? '#ff4444' : darken(color, 0.4));

  ctx.shadowColor = color;
  ctx.shadowBlur  = isFlashing ? 30 : 16;
  ctx.fillStyle   = bodyGrad;
  ctx.beginPath(); ctx.arc(cx, cy, p.radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur  = 0;

  // Riflesso
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(cx - p.radius * 0.25, cy - p.radius * 0.3, p.radius * 0.35, p.radius * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();

  drawWeapons(p);
}

function drawWeapons(p) {
  // Orbita tratteggiata
  if (p.weapons.length > 0) {
    ctx.save();
    ctx.setLineDash([3, 8]);
    ctx.strokeStyle = `${p.color}22`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.weapons[0].orbitRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  for (const w of p.weapons) {
    const angle = w.currentAngle;
    const ox = p.x + Math.cos(angle) * w.orbitRadius;
    const oy = p.y + Math.sin(angle) * w.orbitRadius;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(angle + Math.PI / 2);
    drawWeaponShape(w.type, w.length, w.width, p.color);
    ctx.restore();
  }
}

function drawWeaponShape(type, length, width, color) {
  ctx.shadowColor = color;
  ctx.shadowBlur  = 10;

  switch (type) {
    case 'sword': {
      const sg = ctx.createLinearGradient(0, -length/2, 0, length/2);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(0.3, color);
      sg.addColorStop(1, darken(color, 0.5));
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(0, -length/2);
      ctx.lineTo(width/2, length/4);
      ctx.lineTo(0, length/2);
      ctx.lineTo(-width/2, length/4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#aaa';
      ctx.fillRect(-width*1.2, length/4 - 3, width*2.4, 5);
      break;
    }
    case 'mace': {
      ctx.fillStyle = '#8B5E3C';
      ctx.fillRect(-3, -length/2, 6, length * 0.7);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0, -length/2, width/2 + 2, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.fillStyle = darken(color, 0.2);
        ctx.beginPath();
        ctx.moveTo(0, -length/2);
        ctx.lineTo(Math.cos(a) * (width/2 + 8), -length/2 + Math.sin(a) * (width/2 + 8));
        ctx.lineTo(Math.cos(a + 0.5) * (width/2), -length/2 + Math.sin(a + 0.5) * (width/2));
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'scythe': {
      ctx.fillStyle = '#555';
      ctx.fillRect(-2, -length/2, 4, length);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(length * 0.3, -length/2, length * 0.45, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      break;
    }
    case 'spear': {
      ctx.fillStyle = '#8B5E3C';
      ctx.fillRect(-2, -length/2 + 10, 4, length - 10);
      const spg = ctx.createLinearGradient(0, -length/2, 0, -length/2 + 18);
      spg.addColorStop(0, '#fff');
      spg.addColorStop(1, color);
      ctx.fillStyle = spg;
      ctx.beginPath();
      ctx.moveTo(0, -length/2);
      ctx.lineTo(width/2, -length/2 + 18);
      ctx.lineTo(-width/2, -length/2 + 18);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'fist': {
      const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, width/2 + 2);
      fg.addColorStop(0, lighten(color, 0.3));
      fg.addColorStop(1, darken(color, 0.2));
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.roundRect(-width/2, -length/2, width, length, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(-width/4 + i * (width/3), -length/2 + 4, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    default: {
      ctx.fillStyle = color;
      ctx.fillRect(-width/2, -length/2, width, length);
    }
  }
  ctx.shadowBlur = 0;
}

// ── UI ──
function updateUI() {
  const p1 = gameState.player1;
  const p2 = gameState.player2;

  const hp1pct = Math.max(0, p1.hp / p1.maxHp * 100);
  const hp2pct = Math.max(0, p2.hp / p2.maxHp * 100);
  hpBar1.style.width = hp1pct + '%';
  hpBar2.style.width = hp2pct + '%';
  hpText1.textContent = `${p1.hp} / ${p1.maxHp}`;
  hpText2.textContent = `${p2.hp} / ${p2.maxHp}`;

  if (hp1pct < 25)      hpBar1.style.background = 'linear-gradient(90deg, #ff0000, #ff4060)';
  else if (hp1pct < 50) hpBar1.style.background = 'linear-gradient(90deg, #ff8800, #ffaa00)';
  else                  hpBar1.style.background = '';

  if (hp2pct < 25)      hpBar2.style.background = 'linear-gradient(90deg, #ff0000, #ff4060)';
  else if (hp2pct < 50) hpBar2.style.background = 'linear-gradient(90deg, #ff8800, #ffaa00)';
  else                  hpBar2.style.background = '';

  const t = Math.max(0, gameState.timer);
  const m = Math.floor(t / 60), s = t % 60;
  timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  timerEl.classList.toggle('danger', t <= 30);
}

// ── Status overlay ──
function setStatus(icon, msg, sub = '') {
  statusIcon.textContent    = icon;
  statusMessage.textContent = msg;
  statusSub.textContent     = sub;
  statusOverlay.classList.remove('hidden');
}
function hideStatus() { statusOverlay.classList.add('hidden'); }

// ── Helper colori ──
function lighten(hex, amt) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgb(${Math.min(255,c.r+amt*255)},${Math.min(255,c.g+amt*255)},${Math.min(255,c.b+amt*255)})`;
}
function darken(hex, amt) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgb(${Math.max(0,c.r-amt*255)},${Math.max(0,c.g-amt*255)},${Math.max(0,c.b-amt*255)})`;
}
function hexToRgb(hex) {
  // Supporta anche stringhe rgb(...)
  if (hex.startsWith('rgb')) return null;
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null;
}

// ── Controlli ──
document.addEventListener('keydown', (e) => {
  if (['a','A','ArrowLeft'].includes(e.key))  keys.left  = true;
  if (['d','D','ArrowRight'].includes(e.key)) keys.right = true;
  if (['w','W','ArrowUp'].includes(e.key))    keys.up    = true;
  if (['s','S','ArrowDown'].includes(e.key))  keys.down  = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  if (['a','A','ArrowLeft'].includes(e.key))  keys.left  = false;
  if (['d','D','ArrowRight'].includes(e.key)) keys.right = false;
  if (['w','W','ArrowUp'].includes(e.key))    keys.up    = false;
  if (['s','S','ArrowDown'].includes(e.key))  keys.down  = false;
});

document.getElementById('forfeitBtn').addEventListener('click', () => {
  if (confirm('Sicuro di voler abbandonare?')) {
    ws.send(JSON.stringify({ type: 'forfeit' }));
  }
});

connect();