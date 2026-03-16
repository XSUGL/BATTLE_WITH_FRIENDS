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
    platforms: [],
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
    hazards: [{ type: 'lava', y: 460, rising: true }],
    bgColor: '#110500',
    groundColor: 'rgba(255,80,0,0.7)',
    ambientColor: 'rgba(255,80,0,0.08)'
  }
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
  }

  updatePlayer(p, input) {
    if (p.dead) return;

    if (input.left)  p.vx -= p.speed * 0.18;
    if (input.right) p.vx += p.speed * 0.18;
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
      const now = Date.now();
      if (now - this.lastHitTime[p.num === 1 ? 'p1' : 'p2'] > 400) {
        this.applyDamage(p, 8, { x: p.x, y: p.y });
        this.lastHitTime[p.num === 1 ? 'p1' : 'p2'] = now;
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

  checkWeaponCollisions() {
    const now = Date.now();
    for (const w of this.player1.weapons) {
      const tip  = this.getWeaponTipPosition(this.player1, w);
      const dist = Math.hypot(tip.x - this.player2.x, tip.y - this.player2.y);
      if (dist < this.player2.radius + w.width / 2 && now - this.lastHitTime.p2 > this.hitCooldown) {
        this.applyDamage(this.player2, w.damage, tip);
        this.lastHitTime.p2 = now;
        const angle = Math.atan2(this.player2.y - this.player1.y, this.player2.x - this.player1.x);
        this.player2.vx += Math.cos(angle) * 5;
        this.player2.vy += Math.sin(angle) * 4 - 2;
      }
    }
    for (const w of this.player2.weapons) {
      const tip  = this.getWeaponTipPosition(this.player2, w);
      const dist = Math.hypot(tip.x - this.player1.x, tip.y - this.player1.y);
      if (dist < this.player1.radius + w.width / 2 && now - this.lastHitTime.p1 > this.hitCooldown) {
        this.applyDamage(this.player1, w.damage, tip);
        this.lastHitTime.p1 = now;
        const angle = Math.atan2(this.player1.y - this.player2.y, this.player1.x - this.player2.x);
        this.player1.vx += Math.cos(angle) * 5;
        this.player1.vy += Math.sin(angle) * 4 - 2;
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
    return {
      player1:  this.serializePlayer(this.player1),
      player2:  this.serializePlayer(this.player2),
      particles: this.particles,
      timer:    Math.ceil(this.timeRemaining / 1000),
      mapId:    this.mapId,
      lavaY:    this.lavaY
    };
  }

  serializePlayer(p) {
    return {
      num: p.num, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      radius: p.radius, hp: p.hp, maxHp: p.maxHp,
      color: p.color, shadowColor: p.shadowColor,
      name: p.name, emoji: p.emoji,
      hitFlash: p.hitFlash, dead: p.dead, onGround: p.onGround,
      weapons: p.weapons.map(w => ({
        type: w.type, currentAngle: w.currentAngle,
        orbitRadius: w.orbitRadius, length: w.length,
        width: w.width, damage: w.damage
      }))
    };
  }
}