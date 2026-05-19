export const CLASSES = {
  knight: {
    name: 'Knight', emoji: '⚔️',
    hp: 150, speed: 4, radius: 22,
    color: '#4fc3f7', shadowColor: 'rgba(79,195,247,0.5)',
    weapons: [{ type: 'sword', damage: 20, orbitRadius: 38, orbitSpeed: 2.5, length: 28, width: 6 }]
  },
  warrior: {
    name: 'Warrior', emoji: '🔨',
    hp: 200, speed: 2.8, radius: 26,
    color: '#ef9a9a', shadowColor: 'rgba(239,154,154,0.5)',
    weapons: [{ type: 'mace', damage: 30, orbitRadius: 42, orbitSpeed: 1.8, length: 22, width: 10 }]
  },
  reaper: {
    name: 'Reaper', emoji: '🌙',
    hp: 100, speed: 5.5, radius: 18,
    color: '#ce93d8', shadowColor: 'rgba(206,147,216,0.5)',
    weapons: [
      { type: 'scythe', damage: 15, orbitRadius: 36, orbitSpeed: 3.5, length: 32, width: 5, angleOffset: 0 },
      { type: 'scythe', damage: 15, orbitRadius: 36, orbitSpeed: 3.5, length: 32, width: 5, angleOffset: Math.PI }
    ]
  },
  ranger: {
    name: 'Ranger', emoji: '🏹',
    hp: 120, speed: 5, radius: 19,
    color: '#a5d6a7', shadowColor: 'rgba(165,214,167,0.5)',
    weapons: [{ type: 'spear', damage: 25, orbitRadius: 44, orbitSpeed: 2.2, length: 36, width: 5 }]
  },
  brawler: {
    name: 'Brawler', emoji: '👊',
    hp: 180, speed: 3.8, radius: 24,
    color: '#ffcc80', shadowColor: 'rgba(255,204,128,0.5)',
    weapons: [
      { type: 'fist', damage: 10, orbitRadius: 32, orbitSpeed: 4, length: 16, width: 14, angleOffset: 0 },
      { type: 'fist', damage: 10, orbitRadius: 32, orbitSpeed: 4, length: 16, width: 14, angleOffset: Math.PI * 2/3 },
      { type: 'fist', damage: 10, orbitRadius: 32, orbitSpeed: 4, length: 16, width: 14, angleOffset: Math.PI * 4/3 }
    ]
  }
};

export const MAPS = {
  arena: {
    name: 'Arena', emoji: '⚔️',
    gravity: 0.35,
    restitution: 0.62,
    hasGround: true,
    groundY: 460,
    platforms: [],
    obstacles: [
      { x: 340, y: 320, w: 120, h: 24, type: 'wall' },
      { x: 160, y: 390, w: 80,  h: 20, type: 'wall' },
      { x: 560, y: 390, w: 80,  h: 20, type: 'wall' }
    ],
    hazards: [],
    bgColor: '#070b11',
    groundColor: 'rgba(0,200,255,0.4)',
    ambientColor: 'rgba(0,200,255,0.05)'
  },
  platforms: {
    name: 'Platforms', emoji: '🏔️',
    gravity: 0.4,
    restitution: 0.55,
    hasGround: true,
    groundY: 460,
    platforms: [
      { x: 80,  y: 340, w: 140, h: 14 },
      { x: 580, y: 340, w: 140, h: 14 },
      { x: 320, y: 260, w: 160, h: 14 },
      { x: 160, y: 180, w: 120, h: 14 },
      { x: 520, y: 180, w: 120, h: 14 }
    ],
    obstacles: [
      { x: 350, y: 370, w: 100, h: 18, type: 'wall' },
      { x: 0,   y: 220, w: 50,  h: 18, type: 'wall' },
      { x: 750, y: 220, w: 50,  h: 18, type: 'wall' }
    ],
    hazards: [],
    bgColor: '#0a0e18',
    groundColor: 'rgba(100,200,100,0.6)',
    ambientColor: 'rgba(100,200,100,0.04)'
  },
  space: {
    name: 'Space', emoji: '🚀',
    gravity: 0.08,
    restitution: 0.85,
    hasGround: false,
    groundY: 500,
    platforms: [
      { x: 100, y: 150, w: 160, h: 12 },
      { x: 540, y: 150, w: 160, h: 12 },
      { x: 300, y: 350, w: 200, h: 12 }
    ],
    obstacles: [
      { x: 340, y: 60,  w: 120, h: 20, type: 'asteroid' },
      { x: 100, y: 300, w: 70,  h: 20, type: 'asteroid' },
      { x: 630, y: 300, w: 70,  h: 20, type: 'asteroid' }
    ],
    hazards: [],
    bgColor: '#02020f',
    groundColor: 'rgba(100,100,255,0.2)',
    ambientColor: 'rgba(100,100,255,0.06)'
  },
  volcano: {
    name: 'Vulcano', emoji: '🌋',
    gravity: 0.38,
    restitution: 0.5,
    hasGround: true,
    groundY: 460,
    platforms: [
      { x: 60,  y: 300, w: 120, h: 14 },
      { x: 620, y: 300, w: 120, h: 14 },
      { x: 290, y: 220, w: 220, h: 14 }
    ],
    obstacles: [
      { x: 200, y: 380, w: 60, h: 20, type: 'rock' },
      { x: 540, y: 380, w: 60, h: 20, type: 'rock' },
      { x: 370, y: 140, w: 60, h: 20, type: 'rock' }
    ],
    hazards: [{ type: 'lava', y: 460, rising: true }],
    bgColor: '#110500',
    groundColor: 'rgba(255,80,0,0.7)',
    ambientColor: 'rgba(255,80,0,0.08)'
  }
};

// ── Power-up types ──
export const POWERUP_TYPES = {
  weapon_grow:   { icon: '⚡', color: '#ffd700', label: '+SIZE',   duration: 8000 },
  damage_boost:  { icon: '🔥', color: '#ff4444', label: '+DMG',    duration: 8000 },
  speed_boost:   { icon: '💨', color: '#00ffaa', label: '+SPEED',  duration: 6000 },
  shield:        { icon: '🛡️',  color: '#4488ff', label: 'SHIELD',  duration: 6000 }
};

export class GameState {
  constructor(class1 = 'knight', class2 = 'warrior', mapId = 'arena') {
    const c1  = CLASSES[class1]  || CLASSES.knight;
    const c2  = CLASSES[class2]  || CLASSES.warrior;
    const map = MAPS[mapId]      || MAPS.arena;

    this.arenaWidth  = 800;
    this.arenaHeight = 500;
    this.map         = map;
    this.mapId       = mapId;

    this.gravity     = map.gravity;
    this.groundY     = map.groundY;
    this.restitution = map.restitution;

    // Lava per vulcano
    this.lavaY       = mapId === 'volcano' ? this.arenaHeight + 60 : 9999;
    this.lavaRising  = mapId === 'volcano';

    this.player1 = this.createPlayer(1, c1, 120,  this.groundY - c1.radius);
    this.player2 = this.createPlayer(2, c2, this.arenaWidth - 120, this.groundY - c2.radius);

    this.startTime    = Date.now();
    this.gameDuration = 3 * 60 * 1000;
    this.hitCooldown  = 600;
    this.lastHitTime  = { p1: 0, p2: 0 };
    this.particles    = [];
    this.tick         = 0;

    // Power-ups
    this.powerups          = [];
    this.lastPowerupSpawn  = 0;
    this.powerupInterval   = 7000;
    this.effects           = { p1: {}, p2: {} };
    this.baseWeaponSize    = { p1: null, p2: null }; // saved on first pickup
  }

  createPlayer(num, cls, x, y) {
    return {
      num, class: cls, x, y,
      vx: 0, vy: 0,
      radius: cls.radius,
      speed: cls.speed,
      hp: cls.hp, maxHp: cls.hp,
      color: cls.color,
      shadowColor: cls.shadowColor,
      name: cls.name, emoji: cls.emoji,
      onGround: false,
      weapons: cls.weapons.map(w => ({
        ...w,
        currentAngle: (w.angleOffset || 0) + (num === 1 ? 0 : Math.PI)
      })),
      hitFlash: 0,
      dead: false
    };
  }

  update(input1, input2) {
    if (this.isOver()) return;
    this.tick++;

    this.updatePlayer(this.player1, input1);
    this.updatePlayer(this.player2, input2);
    this.updateWeapons();
    this.checkWeaponCollisions();
    this.checkBallCollision();
    this.updateLava();
    this.updateParticles();
    this.updatePowerups();
  }

  updatePlayer(p, input) {
    if (p.dead) return;

    const pkey = p.num === 1 ? 'p1' : 'p2';
    const eff  = this.effects[pkey];
    const now  = Date.now();

    // Clean expired effects
    for (const [type, exp] of Object.entries(eff)) { if (now > exp) delete eff[type]; }

    const speedMult = eff.speed_boost ? 1.55 : 1;
    const effectiveSpeed = p.speed * speedMult;

    if (input.left)  p.vx -= effectiveSpeed * 0.18;
    if (input.right) p.vx += effectiveSpeed * 0.18;
    if (input.up && p.onGround) {
      p.vy = this.mapId === 'space' ? -6 : -10.5;
      p.onGround = false;
    }

    p.vx *= 0.82;
    p.vy += this.gravity;
    p.x  += p.vx;
    p.y  += p.vy;

    // Collisione piattaforme
    for (const plat of this.map.platforms) {
      if (p.x + p.radius > plat.x && p.x - p.radius < plat.x + plat.w) {
        if (p.y + p.radius >= plat.y && p.y + p.radius <= plat.y + plat.h + 12 && p.vy >= 0) {
          p.y = plat.y - p.radius;
          p.vy = p.vy > 1 ? -Math.abs(p.vy) * this.restitution * 0.4 : 0;
          p.onGround = true;
        }
      }
    }

    // Collisione ostacoli (top + sides)
    for (const obs of (this.map.obstacles || [])) {
      const overlapX = p.x + p.radius > obs.x && p.x - p.radius < obs.x + obs.w;
      const overlapY = p.y + p.radius > obs.y && p.y - p.radius < obs.y + obs.h;
      if (overlapX && overlapY) {
        // Determine shallowest axis
        const fromLeft   = (p.x + p.radius) - obs.x;
        const fromRight  = (obs.x + obs.w)  - (p.x - p.radius);
        const fromTop    = (p.y + p.radius) - obs.y;
        const fromBottom = (obs.y + obs.h)  - (p.y - p.radius);
        const minX = Math.min(fromLeft, fromRight);
        const minY = Math.min(fromTop, fromBottom);
        if (minY < minX) {
          if (fromTop < fromBottom) {
            p.y = obs.y - p.radius;
            p.vy = p.vy > 1 ? -Math.abs(p.vy) * this.restitution * 0.4 : 0;
            p.onGround = true;
          } else {
            p.y = obs.y + obs.h + p.radius;
            p.vy = Math.abs(p.vy) * 0.3;
          }
        } else {
          if (fromLeft < fromRight) { p.x = obs.x - p.radius; p.vx = -Math.abs(p.vx) * this.restitution; }
          else                      { p.x = obs.x + obs.w + p.radius; p.vx = Math.abs(p.vx) * this.restitution; }
        }
      }
    }

    // Suolo
    if (this.map.hasGround && p.y + p.radius >= this.groundY) {
      p.y = this.groundY - p.radius;
      p.vy = -Math.abs(p.vy) * this.restitution;
      p.vx *= 0.88;
      p.onGround = Math.abs(p.vy) < 1.2;
      if (p.onGround) p.vy = 0;
    } else if (!this.map.hasGround) {
      // Spazio: rimbalza su tutti i bordi
      if (p.y - p.radius < 0)                    { p.y = p.radius;               p.vy =  Math.abs(p.vy) * this.restitution; }
      if (p.y + p.radius > this.arenaHeight - 20) { p.y = this.arenaHeight - 20 - p.radius; p.vy = -Math.abs(p.vy) * this.restitution; }
      p.onGround = false;
    } else {
      if (p.y + p.radius > this.groundY) p.onGround = false;
    }

    // Pareti
    if (p.x - p.radius < 0)                { p.x = p.radius;               p.vx =  Math.abs(p.vx) * this.restitution; }
    if (p.x + p.radius > this.arenaWidth)   { p.x = this.arenaWidth - p.radius; p.vx = -Math.abs(p.vx) * this.restitution; }

    // Soffitto
    if (p.y - p.radius < 0) { p.y = p.radius; p.vy = Math.abs(p.vy) * 0.4; }

    // Lava
    if (this.lavaRising && p.y + p.radius >= this.lavaY) {
      const dmgNow = Date.now();
      if (dmgNow - this.lastHitTime[pkey] > 400) {
        this.applyDamage(p, 8, { x: p.x, y: p.y });
        this.lastHitTime[pkey] = dmgNow;
      }
      p.y  = this.lavaY - p.radius;
      p.vy = -Math.abs(p.vy) * 0.3 - 4;
    }

    if (p.hitFlash > 0) p.hitFlash--;
  }

  updateWeapons() {
    const dt = 1 / 60;
    for (const p of [this.player1, this.player2]) {
      for (const w of p.weapons) {
        w.currentAngle += w.orbitSpeed * dt * Math.PI * 2;
      }
    }
  }

  getWeaponTipPosition(p, w) {
    return {
      x: p.x + Math.cos(w.currentAngle) * (w.orbitRadius + w.length / 2),
      y: p.y + Math.sin(w.currentAngle) * (w.orbitRadius + w.length / 2)
    };
  }

  // ─── HITBOX AABB ──────────────────────────────────────────────────────
  // Restituisce un rettangolo (AABB) che copre l'intero personaggio
  // visibile (testa → piedi), NON solo il cerchio fisico.
  // Il rettangolo è ANCORATO AI PIEDI (a p.y + p.radius, il punto di
  // contatto col terreno) e si estende verso l'alto per drawH. Questo
  // matcha esattamente come il client disegna lo sprite.
  //
  // Formula (mirror di client getSpriteScale, ridotta ~½ dopo bug fix):
  //   scale  = max(2, round(radius * 0.10) * 2)
  //   drawW  = 12 * scale,  drawH = 16 * scale  (logical px)
  //   halfW  ≈ drawW * 0.22  (copre fianchi, ~vecchio cerchio)
  //   halfH  ≈ drawH * 0.40  (~80% altezza, testa → piedi)
  //
  // Esempi:
  //   knight  (r=22, scale=4): drawW=48, drawH=64 → AABB 21×51 ancorato ai piedi
  //   warrior (r=26, scale=6): drawW=72, drawH=96 → AABB 32×77 ancorato ai piedi
  getHitBox(p) {
    const r     = p.radius || 12;
    const scale = Math.max(2, Math.round(r * 0.10) * 2);
    const drawW = 12 * scale;
    const drawH = 16 * scale;
    const footY = p.y + r;             // contatto col terreno (in coord world)
    const topY  = footY - drawH;       // top dello sprite
    const cy    = (footY + topY) / 2;  // centro Y del rettangolo
    return {
      halfW: drawW * 0.22,
      halfH: drawH * 0.40,
      cx: p.x,
      cy,
    };
  }

  // Helper: punto P colpisce il body AABB di "target", con un margine
  // (es. metà larghezza dell'arma) di tolleranza ai bordi.
  pointHitsBody(px, py, target, margin) {
    const hb = this.getHitBox(target);
    return (
      Math.abs(px - hb.cx) < hb.halfW + margin &&
      Math.abs(py - hb.cy) < hb.halfH + margin
    );
  }

  checkWeaponCollisions() {
    const now = Date.now();
    const dmgMult1 = this.effects.p1.damage_boost ? 2.2 : 1;
    const dmgMult2 = this.effects.p2.damage_boost ? 2.2 : 1;
    const shield1  = !!this.effects.p1.shield;
    const shield2  = !!this.effects.p2.shield;

    for (const w of this.player1.weapons) {
      const tip    = this.getWeaponTipPosition(this.player1, w);
      const margin = this.effects.p1.weapon_grow ? w.width : w.width / 2;
      if (this.pointHitsBody(tip.x, tip.y, this.player2, margin)
          && now - this.lastHitTime.p2 > this.hitCooldown) {
        if (!shield2) {
          this.applyDamage(this.player2, w.damage * dmgMult1, tip);
          this.lastHitTime.p2 = now;
          const angle = Math.atan2(this.player2.y - this.player1.y, this.player2.x - this.player1.x);
          this.player2.vx += Math.cos(angle) * 5;
          this.player2.vy += Math.sin(angle) * 4 - 2;
        }
      }
    }
    for (const w of this.player2.weapons) {
      const tip    = this.getWeaponTipPosition(this.player2, w);
      const margin = this.effects.p2.weapon_grow ? w.width : w.width / 2;
      if (this.pointHitsBody(tip.x, tip.y, this.player1, margin)
          && now - this.lastHitTime.p1 > this.hitCooldown) {
        if (!shield1) {
          this.applyDamage(this.player1, w.damage * dmgMult2, tip);
          this.lastHitTime.p1 = now;
          const angle = Math.atan2(this.player1.y - this.player2.y, this.player1.x - this.player2.x);
          this.player1.vx += Math.cos(angle) * 5;
          this.player1.vy += Math.sin(angle) * 4 - 2;
        }
      }
    }
  }

  // ── Power-ups ──
  updatePowerups() {
    const now = Date.now();
    // Spawn
    if (now - this.lastPowerupSpawn > this.powerupInterval && this.powerups.length < 3) {
      const types = ['weapon_grow', 'damage_boost', 'speed_boost', 'shield'];
      const type  = types[Math.floor(Math.random() * types.length)];
      const margin = 60;
      const x = margin + Math.random() * (this.arenaWidth - margin * 2);
      // Spawn sopra il suolo (o al centro in space)
      const y = this.map.hasGround
        ? this.groundY - 60 - Math.random() * 200
        : 80 + Math.random() * (this.arenaHeight - 160);
      this.powerups.push({ id: now, type, x, y, radius: 18, born: now });
      this.lastPowerupSpawn = now;
    }

    // Remove expired powerups (30s lifetime)
    this.powerups = this.powerups.filter(pu => now - pu.born < 30000);

    // Pick-up detection
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      for (const [pkey, p] of [['p1', this.player1], ['p2', this.player2]]) {
        const dist = Math.hypot(p.x - pu.x, p.y - pu.y);
        if (dist < p.radius + pu.radius) {
          // Apply effect
          const dur = { weapon_grow: 8000, damage_boost: 8000, speed_boost: 6000, shield: 6000 }[pu.type] || 6000;
          this.effects[pkey][pu.type] = now + dur;
          // Spawn pick-up particles
          for (let j = 0; j < 14; j++) {
            const colors = { weapon_grow:'#ffd700', damage_boost:'#ff4444', speed_boost:'#00ffaa', shield:'#4488ff' };
            this.particles.push({
              x: pu.x, y: pu.y,
              vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8 - 3,
              life: 40 + Math.random() * 20, maxLife: 60,
              color: colors[pu.type], size: 3 + Math.random() * 3
            });
          }
          this.powerups.splice(i, 1);
          break;
        }
      }
    }
  }

  checkBallCollision() {
    const dx   = this.player2.x - this.player1.x;
    const dy   = this.player2.y - this.player1.y;
    const dist = Math.hypot(dx, dy);
    const min  = this.player1.radius + this.player2.radius;
    if (dist < min && dist > 0) {
      const overlap = (min - dist) / 2;
      const nx = dx / dist, ny = dy / dist;
      this.player1.x -= nx * overlap; this.player1.y -= ny * overlap;
      this.player2.x += nx * overlap; this.player2.y += ny * overlap;
      const dvx = this.player1.vx - this.player2.vx;
      const dvy = this.player1.vy - this.player2.vy;
      const dot = dvx * nx + dvy * ny;
      if (dot > 0) {
        this.player1.vx -= dot * nx * this.restitution;
        this.player1.vy -= dot * ny * this.restitution;
        this.player2.vx += dot * nx * this.restitution;
        this.player2.vy += dot * ny * this.restitution;
      }
    }
  }

  updateLava() {
    if (!this.lavaRising) return;
    // La lava sale lentamente — inizia dopo 60s, arriva in cima dopo altri 90s
    const elapsed = (Date.now() - this.startTime) / 1000;
    if (elapsed > 60) {
      this.lavaY = Math.max(80, this.arenaHeight - ((elapsed - 60) * 1.8));
    }
  }

  applyDamage(target, amount, pos) {
    target.hp = Math.max(0, target.hp - amount);
    target.hitFlash = 8;
    if (target.hp <= 0) target.dead = true;
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: pos.x, y: pos.y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 2,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: target.color,
        size: 2 + Math.random() * 3
      });
    }
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  checkWinner() {
    if (this.player1.dead) return 2;
    if (this.player2.dead) return 1;
    return null;
  }

  getWinnerByScore() {
    if (this.player1.hp > this.player2.hp) return 1;
    if (this.player2.hp > this.player1.hp) return 2;
    return 1;
  }

  isOver() {
    return this.player1.dead || this.player2.dead || this.timeRemaining <= 0;
  }

  get timeRemaining() {
    return this.gameDuration - (Date.now() - this.startTime);
  }

  toJSON() {
    const now = Date.now();
    return {
      player1:   this.serializePlayer(this.player1),
      player2:   this.serializePlayer(this.player2),
      particles: this.particles,
      timer:     Math.ceil(this.timeRemaining / 1000),
      mapId:     this.mapId,
      lavaY:     this.lavaY,
      powerups:  this.powerups,
      map: {
        platforms: this.map.platforms,
        obstacles: this.map.obstacles,
        hasGround: this.map.hasGround,
        groundY:   this.map.groundY
      },
      effects: {
        p1: Object.fromEntries(Object.entries(this.effects.p1).map(([k,v]) => [k, Math.max(0, v - now)])),
        p2: Object.fromEntries(Object.entries(this.effects.p2).map(([k,v]) => [k, Math.max(0, v - now)]))
      }
    };
  }

  serializePlayer(p) {
    const hb = this.getHitBox(p);
    return {
      num: p.num, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      radius: p.radius, hp: p.hp, maxHp: p.maxHp,
      color: p.color, shadowColor: p.shadowColor,
      name: p.name, emoji: p.emoji,
      // className serve al client per scegliere lo sprite pixel-art corretto
      className: (p.name || '').toLowerCase(),
      // hitW/hitH: hitbox AABB visibile (per debug e per disegnare flash
      // sull'intero corpo, non solo sul cerchio fisico)
      hitW: hb.halfW * 2,
      hitH: hb.halfH * 2,
      hitFlash: p.hitFlash, dead: p.dead, onGround: p.onGround,
      weapons: p.weapons.map(w => ({
        type: w.type, currentAngle: w.currentAngle,
        orbitRadius: w.orbitRadius, length: w.length,
        width: w.width, damage: w.damage
      }))
    };
  }
}