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

const PU = {
  weapon_grow: { icon:'⚡', color:'#ffbe00', label:'+SIZE'  },
  damage_boost:{ icon:'🔥', color:'#ff4040', label:'+DMG'   },
  speed_boost: { icon:'💨', color:'#00ff9d', label:'+SPEED' },
  shield:      { icon:'🛡', color:'#4488ff', label:'SHIELD' }
};

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
      img.src = `/assets/weapons/${type}.png`;
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
  ws = new WebSocket(wsUrl);
  ws.onopen = () => ws.send(JSON.stringify({type:'join_match',matchId,userId:user.id,token}));
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch(msg.type){
      case 'joined':
        playerNumber = msg.playerNumber;
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
        initStars(canvas.width, canvas.height);
        loadWeaponImages();
        hideStatus();
        startGameLoop();
        break;
      case 'state_update':
        gameState = msg.state;
        currentMapId = msg.state.mapId || currentMapId;
        break;
      case 'game_over': {
        const won = playerNumber === msg.winner;
        statusMessage.className = 'status-message';
        setStatus(won?'🏆':'💀', won?'VICTORY!':'DEFEAT', 'Returning to dashboard...');
        setTimeout(()=>window.location.href='/webapp2/dashboard.html', 4000);
        break;
      }
      case 'error':
        alert(msg.message);
        window.location.href = '/webapp2/dashboard.html';
        break;
    }
  };
  ws.onclose = () => {
    if(gameState){ statusMessage.className='status-message'; setStatus('📡','DISCONNECTED','Connection lost'); }
  };
}

// ─── Game Loop ───
function startGameLoop(){
  setInterval(()=>{ if(gameState){ render(); updateUI(); } }, 1000/60);
  setInterval(()=>{ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'input',keys})); }, 50);
  setInterval(()=>{ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'heartbeat'})); }, 5000);
}

// ─── RENDER ───
function render(){
  const W = canvas.width, H = canvas.height;
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

  // ── Ground ──
  if(hasGround){
    ctx.fillStyle = style.groundColor;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = style.groundColor;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
  }

  // ── Platforms ──
  for(const p of platforms){
    ctx.fillStyle = style.platFill;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // top highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x+3, p.y+1); ctx.lineTo(p.x+p.w-3, p.y+1); ctx.stroke();
    // border
    ctx.strokeStyle = style.platBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
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

  // ── Particles ──
  for(const p of (gameState.particles||[])){
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Players ──
  drawPlayer(gameState.player2);
  drawPlayer(gameState.player1);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

// ─── OBSTACLE ─── usa le coordinate esatte passate dal server
function drawObstacle(obs, style, t){
  const x=obs.x, y=obs.y, w=obs.w, h=obs.h;

  // body
  ctx.fillStyle = style.obsFill;
  ctx.fillRect(x, y, w, h);

  // stripes clipped
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = style.obsStripe;
  ctx.lineWidth = 7;
  for(let sx = x - h*2; sx < x + w + h; sx += 16){
    ctx.beginPath();
    ctx.moveTo(sx, y+h);
    ctx.lineTo(sx+h*2, y);
    ctx.stroke();
  }
  ctx.restore();

  // border
  ctx.strokeStyle = style.obsBorder;
  ctx.lineWidth   = 2;
  ctx.strokeRect(x, y, w, h);

  // top highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(x+3, y+1);
  ctx.lineTo(x+w-3, y+1);
  ctx.stroke();

  // shimmer
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const sx = x + ((t*55) % (w+50)) - 25;
  const sg = ctx.createLinearGradient(sx, 0, sx+25, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
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

// ─── STARS ───
function drawStars(W,H,t){
  for(const s of stars){
    ctx.globalAlpha = s.a*(0.65+0.35*Math.sin(t*1.2+s.x*.01));
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;
}

// ─── POWERUP ───
function drawPowerup(pu,t){
  const vis=PU[pu.type]; if(!vis) return;
  const by=pu.y+Math.sin(t*2.8+pu.id*.001)*5;
  ctx.strokeStyle=vis.color; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(pu.x,by,pu.radius+6,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle='rgba(4,8,15,0.75)';
  ctx.beginPath(); ctx.arc(pu.x,by,pu.radius,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=vis.color; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(pu.x,by,pu.radius,0,Math.PI*2); ctx.stroke();
  ctx.font=`${pu.radius+2}px serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(vis.icon,pu.x,by+1);
  ctx.font='bold 8px monospace'; ctx.fillStyle=vis.color;
  ctx.globalAlpha=0.8+0.2*Math.sin(t*3);
  ctx.fillText(vis.label,pu.x,by+pu.radius+12);
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

  // body
  const g=ctx.createRadialGradient(p.x-p.radius*.3,p.y-p.radius*.3,0,p.x,p.y,p.radius);
  if(isFlash){
    g.addColorStop(0,'#fff'); g.addColorStop(.5,'#faa'); g.addColorStop(1,'#f33');
  } else {
    g.addColorStop(0,lighten(p.color,.3)); g.addColorStop(.6,p.color); g.addColorStop(1,darken(p.color,.4));
  }
  ctx.shadowColor = isFlash?'#fff':(hasDmg?'#ff3333':p.color);
  ctx.shadowBlur  = isFlash?36:(hasDmg?26:16);
  ctx.fillStyle   = g;
  ctx.beginPath(); ctx.arc(p.x,p.y,p.radius,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur  = 0;

  // highlight
  ctx.fillStyle='rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(p.x-p.radius*.28,p.y-p.radius*.32,p.radius*.32,p.radius*.18,-0.5,0,Math.PI*2);
  ctx.fill();

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

connect();