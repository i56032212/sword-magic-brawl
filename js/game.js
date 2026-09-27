'use strict';
// ===== 主程式：輸入、畫面流程、關卡、HUD、主迴圈 =====
const FONT = '"Noto Sans TC","Noto Sans CJK TC","Microsoft JhengHei","PingFang TC","Noto Serif CJK TC","Noto Sans CJK JP",sans-serif';
const font = (sz, bold = true) => `${bold ? 'bold ' : ''}${sz}px ${FONT}`;

// ---------- 輸入 ----------
const Input = {
  held: {}, queue: [], buffer: [], frame: 0, lastTap: { left: -99, right: -99 }, runTap: null, skillQ: null, joy: { active: false, run: 0 },
  codeMap: { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'atk', KeyZ: 'atk', KeyJ: 'jmp', KeyX: 'jmp', Space: 'jmp', KeyD: 'def', KeyC: 'def', Enter: 'enter', KeyP: 'pause', Escape: 'esc', KeyM: 'mute', KeyK: 'dbgKill', KeyN: 'dbgNext', KeyI: 'dbgMp' },
  down(k, noTap) {
    if (!this.held[k]) {
      this.queue.push(k); this.buffer.push({ k, f: this.frame });
      if (this.buffer.length > 12) this.buffer.shift();
      if ((k === 'left' || k === 'right') && !noTap) { if (this.frame - this.lastTap[k] < 15) this.runTap = k; this.lastTap[k] = this.frame; }
    }
    this.held[k] = true;
  },
  up(k) { this.held[k] = false; },
  consume() { const q = new Set(this.queue); this.queue.length = 0; return q; },
  command(btn) { // D + 方向 + A/J
    const buf = this.buffer, now = this.frame;
    let dirIdx = -1;
    for (let i = buf.length - 1; i >= 0; i--) {
      const e = buf[i]; if (now - e.f > 32) break;
      if (e.k === btn && dirIdx < 0) continue;
      if (dirIdx < 0 && (e.k === 'left' || e.k === 'right' || e.k === 'up' || e.k === 'down')) { dirIdx = i; continue; }
      if (dirIdx >= 0 && e.k === 'def') {
        const d = buf[dirIdx].k;
        const c = 'D' + (d === 'up' ? 'u' : d === 'down' ? 'd' : 'f') + (btn === 'atk' ? 'A' : 'J');
        return { cmd: c, sdir: d === 'left' ? -1 : d === 'right' ? 1 : 0 };
      }
      if (dirIdx >= 0 && e.k !== 'def' && !(e.k === 'left' || e.k === 'right' || e.k === 'up' || e.k === 'down')) break;
    }
    return null;
  },
};
window.addEventListener('keydown', e => {
  const k = Input.codeMap[e.code] || ({ a: 'atk', z: 'atk', j: 'jmp', x: 'jmp', d: 'def', c: 'def' })[(e.key || '').toLowerCase()];
  if (k) { Input.down(k); e.preventDefault(); }
  SFX.init();
});
window.addEventListener('keyup', e => {
  const k = Input.codeMap[e.code] || ({ a: 'atk', z: 'atk', j: 'jmp', x: 'jmp', d: 'def', c: 'def' })[(e.key || '').toLowerCase()];
  if (k) { Input.up(k); e.preventDefault(); }
});
window.addEventListener('blur', () => { Input.held = {}; });

// ---------- 存檔 ----------
function loadSave() { try { const s = JSON.parse(localStorage.getItem('smb_save') || 'null'); if (s && s.maxLevel) return s; } catch (e) {} return { maxLevel: 1, maxStage: 1, best: 0, won: false }; }
function writeSave(s) { try { localStorage.setItem('smb_save', JSON.stringify(s)); } catch (e) {} }
const newStats = () => ({ specials: {}, bossSpecials: {}, pickups: {}, throws: {}, kills: 0, grabs: 0, throwsBody: 0 });

const DROP_TABLE = [['knife', 10], ['firebomb', 7], ['rock', 9], ['longsword', 7], ['hammer', 5], ['stick', 8], ['potion', 5], ['bread', 10], ['crystal', 7]];
function randomItem() { let tot = 0; for (const [, w] of DROP_TABLE) tot += w; let r = Math.random() * tot; for (const [k, w] of DROP_TABLE) { if ((r -= w) < 0) return k; } return 'bread'; }

class Game {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.screen = 'title'; this.frame = 0; this.idx = 0; this.hot = []; this.sub = null;
    this.ci = 0; this.level = 1; this.stage = 1; this.score = 0; this.save = loadSave();
    this.fighters = []; this.projs = []; this.items = []; this.crates = []; this.player = null;
    this.stats = newStats(); this.shake = 0; this.hitstop = 0; this.camX = 0; this.lock = null; this.stageLen = W;
    this.params = new URLSearchParams(location.search);
    this.debug = this.params.get('debug') === '1'; this.debugInfMp = false; this.auto = this.params.get('auto') === '1';
    this.previews = CHARS.map((c, i) => new Fighter({ kind: 'char', def: c, ci: i, team: 0, x: 0, y: 0 }));
    this.titleF = [new Fighter({ kind: 'char', def: CHARS[0], ci: 0, team: 0, x: 150, y: 470, face: 1 }), new Fighter({ kind: 'char', def: CHARS[4], ci: 4, team: 1, x: 810, y: 470, face: -1, boss: true })];
    this.movesFrom = 'title';
    const L = parseInt(this.params.get('level')), S = parseInt(this.params.get('stage')), C = parseInt(this.params.get('char'));
    if (L) { this.ci = clamp(isNaN(C) ? 0 : C, 0, 4); this.score = 0; this.startStage(clamp(L, 1, 10), clamp(S || 1, 1, 4)); if (this.params.get('skipintro') === '1') this.screen = 'play'; }
    cv.addEventListener('pointerdown', e => { SFX.init(); const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height; this.click(x, y); });
  }
  // ----- 共用 -----
  go(screen) { this.screen = screen; this.idx = 0; this.sub = null; this.frame0 = this.frame; }
  click(x, y) { for (let i = this.hot.length - 1; i >= 0; i--) { const h = this.hot[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { h.fn(); return; } } }
  addScore(n) { this.score += n; }
  floatText(f, text, color, size) { addParticle({ type: 'text', text, color, size: size || 16, x: f.x, y: f.y, z: f.z + f.h + 18, vz: 0.9, life: 42 }); }
  nearestFoe(f) { let best = null, bd = 1e9; for (const t of this.fighters) { if (t.team === f.team || !t.alive) continue; const d = Math.abs(t.x - f.x) + Math.abs(t.y - f.y) * 2; if (t.stealth > 0 && d > 60) continue; if (d < bd) { bd = d; best = t; } } return best; }
  itemUnder(f) { return this.items.find(i => Math.abs(i.x - f.x) < 30 && Math.abs(i.y - f.y) < 18 && i.z <= 2) || null; }
  dropItem(type, x, y, dur) { const b = this.boundsFor({ team: 0 }); this.items.push({ type, x: clamp(x, b[0], b[1]), y: clamp(y, GROUND_TOP, GROUND_BOT), z: 20, vz: 4, dur: dur != null ? dur : ITEMS[type].dur }); }
  boundsFor(f) {
    if (this.lock != null) return f.team === 0 ? [this.lock + 22, this.lock + W - 22] : (this.isBoss ? [22, W - 22] : [this.lock - 90, this.lock + W + 90]);
    return [22, this.stageLen - 22];
  }
  hit(att, box) {
    let any = false;
    for (const t of this.fighters) {
      if (t.team === att.team || t.remove) continue;
      const key = box.id + ':' + t.id; if (att.hitIds.has(key)) continue;
      const dx = (t.x - att.x) * att.face;
      if (dx < box.fx0 - t.w * 0.5 || dx > box.fx1 + t.w * 0.5) continue;
      if (Math.abs(t.y - att.y) > (box.dy || 20)) continue;
      const z0 = att.z + (box.z0 || 0), z1 = att.z + (box.z1 || 60);
      if (t.z > z1 || t.z + t.h < z0) continue;
      if (hitFighter(this, att, t, box, att.face)) { att.hitIds.add(key); any = true; if (box.weapon) att.useWeapon(this); }
    }
    if (att.team === 0 || att.kind === 'char') for (const c of this.crates) {
      const key = box.id + ':c' + c.id; if (att.hitIds.has(key)) continue;
      const dx = (c.x - att.x) * att.face;
      if (dx < box.fx0 - 20 || dx > box.fx1 + 20 || Math.abs(c.y - att.y) > (box.dy || 20) + 4 || att.z > 45) continue;
      att.hitIds.add(key); this.hitCrate(c, 1); any = true;
    }
    return any;
  }
  aoe(att, team, cx, cy, rx, ry, h) {
    for (const t of this.fighters) {
      if (t.team === team || t.remove) continue;
      const q = ((t.x - cx) / rx) ** 2 + ((t.y - cy) / ry) ** 2; if (q > 1) continue;
      hitFighter(this, att, t, h, sgn(t.x - cx) || (att ? att.face : 1));
    }
    for (const c of this.crates) if (((c.x - cx) / rx) ** 2 + ((c.y - cy) / ry) ** 2 <= 1) this.hitCrate(c, 3);
  }
  hitCrate(c, n) {
    c.hp -= n; c.shake = 10; SFX.play('hit');
    if (c.hp <= 0 && !c.dead) {
      c.dead = true; this.crates = this.crates.filter(k => k !== c);
      for (let i = 0; i < 8; i++) addParticle({ type: 'shard', x: c.x, y: c.y, z: 20, vx: (Math.random() - 0.5) * 6, vz: 2 + Math.random() * 4, grav: 0.35, life: 35, color: '#a0703a' });
      this.dropItem(c.item || randomItem(), c.x, c.y); SFX.play('break'); this.addScore(50);
    }
  }
  onDeath(f) {
    for (const c of this.fighters) if (c.isClone && c.owner === f) c.life = 1;
    if (f.isClone) { f.remove = true; return; }
    if (f.team === 1) {
      this.stats.kills++; this.addScore(Math.round((f.def.score || 500) * (1 + (this.level - 1) * 0.2) * (f.isBoss ? 6 : 1)));
      if (!f.isBoss && Math.random() < 0.22) this.dropItem(Math.random() < 0.5 ? ['bread', 'potion', 'crystal'][Math.floor(Math.random() * 3)] : randomItem(), f.x, f.y);
      SFX.play('ko');
    } else if (f === this.player) { SFX.play('lose'); this.deathTimer = 80; }
  }
  spawnEnemy(type, x, y, mult) {
    const f = new Fighter({ kind: 'enemy', def: ENEMIES[type], etype: type, team: 1, x, y, face: x < this.player.x ? 1 : -1, mult, level: this.level });
    if (this.level >= 5 && type === 'wolf') f.look = Object.assign({}, f.look, { body: '#d8dde6', pants: '#a0a8b8' });
    if (this.level >= 6 && type === 'skeleton') f.look = Object.assign({}, f.look, { eyes: '#40c0ff' });
    f.ai = new GruntAI(f, this.level); this.fighters.push(f); return f;
  }
  spawnBoss(ci, x, y, count) {
    const L = this.level, strong = L > 5;
    const hp = (strong ? 2.5 + 0.3 * (L - 6) : 1.7 + 0.3 * (L - 1)) * (count > 1 ? 0.75 : 1) * (L === 10 ? 0.85 : 1) * 1.15;
    const mult = { hp, pow: 0.6 + 0.055 * (L - 1), regen: 1.3 + 0.1 * L, spd: 0.95 + 0.012 * L, def: 1 + 0.02 * L };
    const f = new Fighter({ kind: 'char', def: CHARS[ci], ci, team: 1, x, y, face: -1, boss: true, strong, mult, level: L });
    f.ai = new BossAI(f, L); f.invuln = 40; this.fighters.push(f); return f;
  }
  // ----- 關卡 -----
  startStage(level, stage) {
    this.level = level; this.stage = stage; this.isBoss = stage === 4;
    this.fighters = []; this.projs = []; this.items = []; this.crates = []; PARTICLES = [];
    this.theme = LEVELS[level - 1].theme; this.stats = this.stats || newStats();
    this.player = new Fighter({ kind: 'char', def: CHARS[this.ci], ci: this.ci, team: 0, x: 140, y: 425, face: 1 });
    this.fighters.push(this.player);
    this.deathTimer = 0; this.clearTimer = 0; this.goTimer = 0; this.hitstop = 0; this.shake = 0; this.spawnQ = [];
    this.stageScore0 = this.score;
    if (!this.isBoss) {
      this.stageLen = 2500 + level * 90 + stage * 100; this.lock = null; this.camX = 0;
      const n = level >= 6 ? 4 : 3; this.waves = [];
      const pool = LEVELS[level - 1].pool;
      for (let i = 0; i < n; i++) {
        const lx = Math.round(280 + i * (this.stageLen - 280 - W) / (n - 1));
        const cnt = Math.min(9, 2 + Math.floor((level - 1) / 2) + i + Math.floor((stage - 1) / 2));
        const list = []; for (let k = 0; k < cnt; k++) list.push(pool[Math.floor(Math.random() * pool.length)]);
        if (i === n - 1 && stage === 3 && level >= 3) list.push(pool[pool.length - 1]);
        this.waves.push({ lockX: lx, list, done: false, active: false });
      }
      this.waveIdx = 0;
      for (let i = 0; i < 3 + Math.floor(stage / 2); i++) this.crates.push({ id: UID++, x: 380 + i * (this.stageLen - 600) / (3 + Math.floor(stage / 2)) + Math.random() * 120, y: GROUND_TOP + 20 + Math.random() * 150, hp: 3, shake: 0 });
      this.dropItem(stage === 1 ? 'knife' : randomItem(), 300, 400);
    } else {
      this.stageLen = W; this.lock = 0; this.camX = 0;
      this.bossGroups = bossPlan(level); this.bossIdx = 0; this.bossBanner = 0;
      this.crates.push({ id: UID++, x: 200, y: 360, hp: 3, shake: 0 }, { id: UID++, x: 760, y: 500, hp: 3, shake: 0, item: 'potion' });
      this.spawnBossGroup();
    }
    this.go('intro');
  }
  spawnBossGroup() {
    const grp = this.bossGroups[this.bossIdx];
    grp.forEach((ci, k) => this.spawnBoss(ci, W - 140 - k * 40, 380 + k * 90, grp.length));
    this.bossBanner = 150; SFX.play('boss');
    if (this.bossIdx > 0) { const p = this.player; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35); this.floatText(p, '回復 35%', '#7f7', 18); this.dropItem('potion', 300, 420); this.dropItem('crystal', 340, 460); }
  }
  bossMult() { }
  updateStage() {
    const p = this.player;
    // 死亡
    if (this.deathTimer > 0 && --this.deathTimer === 0) { this.go('gameover'); return; }
    if (this.isBoss) {
      const alive = this.fighters.some(f => f.team === 1 && !f.isClone && !f.remove && f.state !== 'dead');
      if (!alive && !this.clearTimer && p.alive) {
        if (this.bossIdx < this.bossGroups.length - 1) { if (!this.fighters.some(f => f.team === 1 && !f.isClone && !f.remove)) { this.bossIdx++; this.spawnBossGroup(); } }
        else this.clearTimer = 100;
      }
    } else {
      // 攝影機
      const w = this.waves[this.waveIdx];
      if (w && !w.active && !w.done && p.x > w.lockX + W * 0.36) {
        w.active = true; this.lock = w.lockX; this.goTimer = 0;
        w.list.forEach((type, k) => this.spawnQ.push({ type, delay: k * 35 + Math.floor(Math.random() * 20), side: k % 2 === 0 ? 1 : -1 }));
      }
      if (this.spawnQ.length) {
        for (const s of this.spawnQ) s.delay--;
        const ready = this.spawnQ.filter(s => s.delay <= 0); this.spawnQ = this.spawnQ.filter(s => s.delay > 0);
        const L = this.level, S = this.stage;
        const mult = { hp: 1 + 0.14 * (L - 1) + 0.05 * (S - 1), pow: 1 + 0.09 * (L - 1), spd: 1 + 0.02 * (L - 1) };
        for (const s of ready) this.spawnEnemy(s.type, (s.side > 0 ? this.lock + W + 50 : this.lock - 50), GROUND_TOP + 15 + Math.random() * (GROUND_BOT - GROUND_TOP - 30), mult);
      }
      if (w && w.active && !this.spawnQ.length && !this.fighters.some(f => f.team === 1 && !f.isClone && f.state !== 'dead')) {
        w.active = false; w.done = true; this.waveIdx++; this.lock = null;
        if (this.waveIdx >= this.waves.length) { if (!this.clearTimer) this.clearTimer = 90; }
        else { this.goTimer = 200; SFX.play('go'); }
      }
      let target = this.lock != null ? this.lock : clamp(p.x - W * 0.4, 0, this.stageLen - W);
      if (this.lock == null && this.waves[this.waveIdx]) target = Math.min(target, this.waves[this.waveIdx].lockX + 60);
      this.camX += (target - this.camX) * 0.12;
      if (this.lock == null && this.waves[this.waveIdx]) {
        const lim = this.waves[this.waveIdx].lockX + W - 22; if (p.x > lim) p.x = lim;
      }
    }
    if (this.goTimer > 0) this.goTimer--;
    if (this.bossBanner > 0) this.bossBanner--;
    if (this.clearTimer > 0 && --this.clearTimer === 0) this.stageClear();
  }
  stageClear() {
    const p = this.player; const bonus = 500 * this.level + Math.round(p.hp / p.maxHp * 1000);
    this.clearBonus = bonus; this.score += bonus;
    const nl = this.stage < 4 ? this.level : this.level + 1, ns = this.stage < 4 ? this.stage + 1 : 1;
    if (nl <= 10 && (nl > this.save.maxLevel || (nl === this.save.maxLevel && ns > this.save.maxStage))) { this.save.maxLevel = nl; this.save.maxStage = ns; }
    if (this.level === 10 && this.stage === 4) { this.save.won = true; this.save.maxLevel = 10; this.save.maxStage = 4; }
    this.save.best = Math.max(this.save.best || 0, this.score); writeSave(this.save);
    SFX.play('clear');
    if (this.stage < 4) this.go('stageclear'); else if (this.level < 10) this.go('levelclear'); else this.go('win');
  }
  nextStage() { if (this.stage < 4) this.startStage(this.level, this.stage + 1); else this.startStage(this.level + 1, 1); }
  playerIntent(pr) {
    const I = emptyIntent(), h = Input.held;
    I.mx = (h.right ? 1 : 0) - (h.left ? 1 : 0); I.my = (h.down ? 1 : 0) - (h.up ? 1 : 0);
    I.atk = pr.has('atk'); I.jmp = pr.has('jmp'); I.def = !!h.def;
    if (I.atk || I.jmp) { const c = Input.command(I.atk ? 'atk' : 'jmp'); if (c) { I.special = c.cmd; I.sdir = c.sdir; Input.buffer.length = 0; } }
    if (Input.runTap) { I.run = true; I.mx = Input.runTap === 'right' ? 1 : -1; Input.runTap = null; }
    I.dpress = pr.has('left') ? -1 : pr.has('right') ? 1 : 0; I.defPress = pr.has('def'); I.roll = pr.has('roll');
    if (Input.joy.active) { if (Input.joy.run && I.mx === Input.joy.run) I.run = true; else if (!I.run) I.noRun = true; }
    if (Input.skillQ) { if (Input.frame - Input.skillQ.f <= 15) { I.special = Input.skillQ.cmd; I.sdir = I.mx || 0; } else Input.skillQ = null; }
    return I;
  }
  updatePlay(pr) {
    if (pr.has('pause') || pr.has('esc')) { this.go('paused'); SFX.play('select'); return; }
    if (this.debug) {
      if (pr.has('dbgKill')) for (const f of this.fighters) if (f.team === 1 && f.alive) { f.hp = 0; knockDown(f, 1, { launch: 5, knock: 3 }); }
      if (pr.has('dbgNext')) { this.stageClear(); return; }
      if (pr.has('dbgMp')) this.debugInfMp = !this.debugInfMp;
    }
    if (this.hitstop > 0) { this.hitstop--; return; }
    const p = this.player;
    if (p.alive) p.intent = this.playerIntent(pr); else p.intent = emptyIntent();
    if (this.auto && p.alive) {
      if (!p.ai) p.ai = new BossAI(p, 10);
      if (this.nearestFoe(p) && (this.lock != null || this.isBoss)) p.ai.update(this);
      else { p.intent = emptyIntent(); const it = this.items.find(i => ITEMS[i.type].cat === 'heal' && Math.abs(i.x - p.x) < 300); if (it && p.hp < p.maxHp * 0.8) { p.intent.mx = Math.abs(it.x - p.x) > 20 ? sgn(it.x - p.x) : 0; p.intent.my = Math.abs(it.y - p.y) > 8 ? sgn(it.y - p.y) : 0; if (this.itemUnder(p) && this.frame % 10 === 0) p.intent.atk = true; } else { p.intent.mx = 1; p.intent.my = sgn(420 - p.y); } }
    }
    // 同時攻擊者
    const grunts = this.fighters.filter(f => f.team === 1 && !f.isBoss && !f.isClone && f.alive).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
    this.attackers = new Set(grunts.slice(0, 2 + Math.floor(this.level / 4)));
    for (const f of this.fighters) if (f.ai && f.alive && f !== p) f.ai.update(this);
    for (const f of this.fighters) f.update(this);
    for (const pj of this.projs) pj.update(this);
    this.projs = this.projs.filter(pj => !pj.dead);
    this.fighters = this.fighters.filter(f => !f.remove);
    for (const it of this.items) { if (it.z > 0 || it.vz > 0) { it.z += it.vz; it.vz -= 0.5; if (it.z <= 0) { it.z = 0; it.vz = Math.abs(it.vz) > 2 ? -it.vz * 0.35 : 0; } } }
    for (const c of this.crates) if (c.shake > 0) c.shake--;
    updateParticles();
    this.updateStage();
  }
  // ----- 主更新 -----
  step() {
    Input.frame++; this.frame++;
    const pr = Input.consume();
    if (pr.has('mute')) SFX.toggle();
    if (this.shake > 0) this.shake *= 0.85, this.shake < 0.5 && (this.shake = 0);
    const nav = (n, cols = 1) => {
      if (pr.has('down')) { this.idx = (this.idx + cols) % n; SFX.play('select'); }
      if (pr.has('up')) { this.idx = (this.idx - cols + n) % n; SFX.play('select'); }
      if (cols > 1 || this.screen === 'select') {
        if (pr.has('right')) { this.idx = (this.idx + 1) % n; SFX.play('select'); }
        if (pr.has('left')) { this.idx = (this.idx - 1 + n) % n; SFX.play('select'); }
      }
    };
    const ok = pr.has('atk') || pr.has('enter'), back = pr.has('def') || pr.has('esc');
    switch (this.screen) {
      case 'title': { const m = this.titleMenu(); nav(m.length); if (ok) m[this.idx].fn(); this.titleF.forEach(f => { f.t++; }); if (this.frame % 150 === 0) this.titleF.forEach(f => { f.state = 'attack'; f.t = 0; f.anim = { k: f.def.combo[Math.floor(Math.random() * 3)], dur: 16 }; }); if (this.titleF[0].state === 'attack' && this.titleF[0].t > 22) this.titleF.forEach(f => { f.state = 'idle'; }); break; }
      case 'select': nav(5); this.previews.forEach(f => f.t++); { const f = this.previews[this.idx]; if (f.state !== 'attack' || f.t > 24) { f.state = 'attack'; f.t = 0; f.anim = { k: f.def.combo[(this.frame / 25 | 0) % 3], dur: 16 }; } }
        if (ok) { this.ci = this.idx; SFX.play('confirm'); this.go('levels'); this.idx = Math.min(9, this.save.maxLevel - 1); } if (back) this.go('title'); break;
      case 'levels':
        if (this.sub) { const n = this.subMax(); if (pr.has('right')) { this.sub.i = (this.sub.i + 1) % 4; SFX.play('select'); } if (pr.has('left')) { this.sub.i = (this.sub.i + 3) % 4; SFX.play('select'); }
          if (ok) { if (this.sub.i + 1 <= n) { SFX.play('confirm'); this.score = 0; this.stats = newStats(); this.startStage(this.sub.L, this.sub.i + 1); } else SFX.play('block'); }
          if (back) this.sub = null; break; }
        nav(10, 5); if (ok) { if (this.idx + 1 <= this.save.maxLevel) { SFX.play('confirm'); this.sub = { L: this.idx + 1, i: 0 }; this.sub.i = this.subMax() - 1; } else SFX.play('block'); } if (back) this.go('select'); break;
      case 'moves': if (pr.has('right')) { this.mpage = ((this.mpage || 0) + 1) % 6; SFX.play('select'); } if (pr.has('left')) { this.mpage = ((this.mpage || 0) + 5) % 6; SFX.play('select'); }
        if (ok || back) { SFX.play('select'); this.go(this.movesFrom); } break;
      case 'controls': if (ok || back) { SFX.play('select'); this.go(this.movesFrom); } break;
      case 'intro': this.previews.forEach(f => f.t++); if (this.frame - this.frame0 > (this.isBoss ? 130 : 100) || (ok && this.frame - this.frame0 > 20)) this.go('play'); break;
      case 'play': this.updatePlay(pr); break;
      case 'paused': { const m = this.pauseMenu(); nav(m.length); if (ok) m[this.idx].fn(); if (pr.has('pause') || pr.has('esc')) this.go('play'); break; }
      case 'gameover': { const m = this.overMenu(); nav(m.length); if (ok) m[this.idx].fn(); updateParticles(); break; }
      case 'stageclear': if (this.frame - this.frame0 > 150 || (ok && this.frame - this.frame0 > 30)) this.nextStage(); break;
      case 'levelclear': { const m = this.clearMenu(); nav(m.length); if (ok && this.frame - this.frame0 > 30) m[this.idx].fn(); break; }
      case 'win': if (ok && this.frame - this.frame0 > 60) this.go('title'); break;
    }
  }
  subMax() { const L = this.sub.L; return L < this.save.maxLevel ? 4 : this.save.maxStage; }
  titleMenu() { return [
    { label: '開始遊戲', fn: () => { SFX.play('confirm'); this.go('select'); this.idx = this.ci; } },
    { label: '招式表', fn: () => { SFX.play('select'); this.movesFrom = 'title'; this.mpage = 0; this.go('moves'); } },
    { label: '操作說明', fn: () => { SFX.play('select'); this.movesFrom = 'title'; this.go('controls'); } },
    { label: '音效：' + (SFX.muted ? '關' : '開'), fn: () => { SFX.toggle(); SFX.play('select'); } },
  ]; }
  pauseMenu() { return [
    { label: '繼續遊戲', fn: () => this.go('play') },
    { label: '招式表', fn: () => { this.movesFrom = 'paused'; this.mpage = this.ci + 1; this.go('moves'); } },
    { label: '操作說明', fn: () => { this.movesFrom = 'paused'; this.go('controls'); } },
    { label: '重新開始本場', fn: () => { this.score = this.stageScore0; this.startStage(this.level, this.stage); } },
    { label: '音效：' + (SFX.muted ? '關' : '開'), fn: () => SFX.toggle() },
    { label: '返回標題', fn: () => this.go('title') },
  ]; }
  overMenu() { return [
    { label: '重試本場', fn: () => { SFX.play('confirm'); this.score = this.stageScore0; this.startStage(this.level, this.stage); } },
    { label: '選擇關卡', fn: () => { this.go('levels'); this.idx = this.level - 1; } },
    { label: '返回標題', fn: () => this.go('title') },
  ]; }
  clearMenu() { return [
    { label: '前往下一關', fn: () => { SFX.play('confirm'); this.nextStage(); } },
    { label: '選擇關卡', fn: () => { this.go('levels'); this.idx = Math.min(9, this.level); } },
    { label: '返回標題', fn: () => this.go('title') },
  ]; }

  // ===== 繪製 =====
  draw() {
    const ctx = this.ctx; this.hot = [];
    ctx.save(); ctx.clearRect(0, 0, W, H);
    switch (this.screen) {
      case 'title': this.drawTitle(ctx); break;
      case 'select': this.drawSelect(ctx); break;
      case 'levels': this.drawLevels(ctx); break;
      case 'moves': this.drawMoves(ctx); break;
      case 'controls': this.drawControls(ctx); break;
      default: this.drawWorld(ctx); this.drawHUD(ctx); this.drawOverlay(ctx);
    }
    this.drawMuteBtn(ctx);
    ctx.restore();
  }
  btn(ctx, x, y, w, h, label, sel, fn, opt = {}) {
    ctx.fillStyle = sel ? 'rgba(255,215,90,0.95)' : opt.disabled ? 'rgba(40,40,50,0.8)' : 'rgba(20,24,44,0.85)';
    ctx.strokeStyle = sel ? '#fff' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = sel ? '#2a1a00' : opt.disabled ? '#777' : '#fff'; ctx.font = font(opt.size || 22); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1); ctx.textBaseline = 'alphabetic';
    if (fn) this.hot.push({ x, y, w, h, fn });
  }
  menu(ctx, items, cx, y0, w = 260, h = 44, gap = 10) {
    items.forEach((m, i) => this.btn(ctx, cx - w / 2, y0 + i * (h + gap), w, h, m.label, i === this.idx, () => { this.idx = i; m.fn(); }));
  }
  text(ctx, s, x, y, sz, col = '#fff', align = 'center', stroke = true) {
    ctx.font = font(sz); ctx.textAlign = align;
    if (stroke) { ctx.lineWidth = Math.max(3, sz / 6); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  drawMuteBtn(ctx) {
    const x = W - 46, y = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(ctx, x, y, 38, 30, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + 8, y + 11); ctx.lineTo(x + 13, y + 11); ctx.lineTo(x + 19, y + 6); ctx.lineTo(x + 19, y + 24); ctx.lineTo(x + 13, y + 19); ctx.lineTo(x + 8, y + 19); ctx.fill();
    ctx.strokeStyle = SFX.muted ? '#f55' : '#fff'; ctx.lineWidth = 2; ctx.beginPath();
    if (SFX.muted) { ctx.moveTo(x + 23, y + 9); ctx.lineTo(x + 32, y + 21); ctx.moveTo(x + 32, y + 9); ctx.lineTo(x + 23, y + 21); }
    else { ctx.arc(x + 20, y + 15, 7, -0.8, 0.8); ctx.moveTo(x + 27, y + 7); ctx.arc(x + 20, y + 15, 11, -0.8, 0.8); }
    ctx.stroke();
    this.hot.push({ x, y, w: 38, h: 30, fn: () => SFX.toggle() });
    if (this.screen === 'play') { const px = W - 90; ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(ctx, px, y, 38, 30, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(px + 13, y + 8, 4, 14); ctx.fillRect(px + 21, y + 8, 4, 14); this.hot.push({ x: px, y, w: 38, h: 30, fn: () => this.go('paused') }); }
  }
  drawTitle(ctx) {
    const cam = this.frame * 1.2;
    drawBackground(ctx, 'forest', cam, this.frame); drawAmbient(ctx, 'forest', this.frame, cam);
    for (const f of this.titleF) { const s = f.scale; f.scale = 2; drawFighter(ctx, f, 0, this.frame); f.scale = s; }
    ctx.fillStyle = 'rgba(0,0,20,0.35)'; ctx.fillRect(0, 0, W, H);
    const bob = Math.sin(this.frame * 0.04) * 4;
    this.text(ctx, '劍與魔法', W / 2, 105 + bob, 64, '#ffe27a');
    this.text(ctx, '亂鬥英雄', W / 2, 172 + bob, 52, '#ff8a5a');
    this.text(ctx, 'Sword & Magic Brawl', W / 2, 205, 18, '#cfe3ff');
    this.menu(ctx, this.titleMenu(), W / 2, 240, 260, 42, 10);
    this.text(ctx, `方向鍵移動・Z/A 攻擊・X/J 跳躍・C/D 防禦　|　最高分：${this.save.best || 0}　已解鎖：第 ${this.save.maxLevel} 關`, W / 2, 522, 14, '#ddd');
  }
  drawSelect(ctx) {
    drawBackground(ctx, 'castle', this.frame * 0.5, this.frame);
    ctx.fillStyle = 'rgba(0,0,15,0.55)'; ctx.fillRect(0, 0, W, H);
    this.text(ctx, '選擇你的英雄', W / 2, 44, 30, '#ffe27a');
    const cw = 176, gap = 8, x0 = (W - (cw * 5 + gap * 4)) / 2;
    CHARS.forEach((c, i) => {
      const x = x0 + i * (cw + gap), y = 64, sel = i === this.idx;
      ctx.fillStyle = sel ? 'rgba(255,215,90,0.25)' : 'rgba(20,24,44,0.8)'; ctx.strokeStyle = sel ? '#ffd75a' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = sel ? 3 : 1.5;
      roundRect(ctx, x, y, cw, 250, 10); ctx.fill(); ctx.stroke();
      this.hot.push({ x, y, w: cw, h: 250, fn: () => { if (this.idx === i) { this.ci = i; SFX.play('confirm'); this.go('levels'); this.idx = Math.min(9, this.save.maxLevel - 1); } else { this.idx = i; SFX.play('select'); } } });
      const f = this.previews[i]; if (!sel) { f.state = 'idle'; } f.x = x + cw / 2; f.y = y + 120; f.face = 1; const s0 = f.scale; f.scale = 1.5;
      drawFighter(ctx, f, 0, this.frame); f.scale = s0;
      this.text(ctx, c.cls, x + cw / 2, y + 146, 21, sel ? '#ffe27a' : '#fff');
      this.text(ctx, c.name, x + cw / 2, y + 164, 13, '#bbb');
      const rows = [['生命', c.stats.hp, '#f55', c.hp], ['魔力', c.stats.mp, '#4af', c.mp], ['速度', c.stats.speed, '#5e5', c.speed.toFixed(1)], ['力量', c.stats.power, '#fa4', c.power.toFixed(2)]];
      rows.forEach((r, k) => { const yy = y + 174 + k * 17; ctx.font = font(12); ctx.textAlign = 'left'; ctx.fillStyle = '#ddd'; ctx.fillText(r[0], x + 10, yy + 10);
        for (let s = 0; s < 5; s++) { ctx.fillStyle = s < r[1] ? r[2] : 'rgba(255,255,255,0.15)'; ctx.fillRect(x + 44 + s * 18, yy + 1, 15, 10); }
        ctx.textAlign = 'right'; ctx.fillStyle = '#aaa'; ctx.font = font(11, false); ctx.fillText(r[3], x + cw - 8, yy + 10); });
    });
    const c = CHARS[this.idx];
    ctx.fillStyle = 'rgba(10,12,30,0.85)'; roundRect(ctx, 20, 320, W - 40, 184, 10); ctx.fill();
    this.text(ctx, `${c.cls}・${c.name}　— ${c.desc}`, 36, 346, 17, '#ffe27a', 'left');
    c.specials.forEach((s, k) => { const cx = 36 + (k % 2) * 460, yy = 376 + Math.floor(k / 2) * 43;
      this.text(ctx, `【${s.input}】`, cx, yy, 15, '#8cf', 'left', false); this.text(ctx, s.name, cx + 90, yy, 16, '#fff', 'left', false); this.text(ctx, `MP ${s.mp}`, cx + 190, yy, 13, '#6cf', 'left', false);
      this.text(ctx, s.desc, cx + 8, yy + 18, 12, '#bbb', 'left', false); });
    this.text(ctx, '← → 選擇　A/Z 確認　D/C 返回', W / 2, 524, 14, '#ccc');
  }
  drawLevels(ctx) {
    drawBackground(ctx, LEVELS[this.sub ? this.sub.L - 1 : this.idx].theme, this.frame * 0.6, this.frame);
    ctx.fillStyle = 'rgba(0,0,15,0.55)'; ctx.fillRect(0, 0, W, H);
    this.text(ctx, '選擇關卡', W / 2, 44, 30, '#ffe27a');
    this.text(ctx, `英雄：${CHARS[this.ci].cls}　分數紀錄：${this.save.best || 0}`, W / 2, 70, 15, '#ddd');
    const cw = 170, ch = 180, gx = 10, x0 = (W - (cw * 5 + gx * 4)) / 2;
    LEVELS.forEach((lv, i) => {
      const col = i % 5, row = Math.floor(i / 5), x = x0 + col * (cw + gx), y = 86 + row * (ch + 12);
      const locked = i + 1 > this.save.maxLevel, sel = i === this.idx;
      const T = THEMES[lv.theme];
      ctx.save(); roundRect(ctx, x, y, cw, ch, 10); ctx.clip();
      let g = ctx.createLinearGradient(0, y, 0, y + ch); g.addColorStop(0, T.sky[0]); g.addColorStop(0.55, T.sky[1]); g.addColorStop(0.56, T.ground[0]); g.addColorStop(1, T.ground[1]);
      ctx.fillStyle = g; ctx.fillRect(x, y, cw, ch);
      ctx.fillStyle = T.farC; ctx.beginPath(); ctx.moveTo(x, y + ch * 0.56); for (let k = 0; k <= 8; k++) ctx.lineTo(x + k * cw / 8, y + ch * 0.56 - 18 - hash(i * 10 + k) * 30); ctx.lineTo(x + cw, y + ch * 0.56); ctx.fill();
      const bc = bossPlan(i + 1); const bci = bc[0][0];
      drawHead(ctx, x + cw - 30, y + ch * 0.56 - 18, 14, i >= 5 ? bossLook(CHARS[bci].look, true) : bossLook(CHARS[bci].look, false), 0);
      if (locked) { ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x, y, cw, ch); }
      ctx.restore();
      ctx.strokeStyle = sel ? '#ffd75a' : 'rgba(255,255,255,0.3)'; ctx.lineWidth = sel ? 4 : 1.5; roundRect(ctx, x, y, cw, ch, 10); ctx.stroke();
      this.text(ctx, `第 ${i + 1} 關`, x + 12, y + 28, 20, locked ? '#888' : '#fff', 'left');
      this.text(ctx, lv.name, x + 12, y + 52, 17, locked ? '#888' : '#ffe27a', 'left');
      if (locked) { drawLock(ctx, x + cw / 2, y + 110); }
      else {
        const bn = i === 9 ? '最終連戰' : bossTitle(bci, i >= 5);
        this.text(ctx, '頭目：' + bn, x + 12, y + ch - 36, 12, '#fcc', 'left');
        const maxS = i + 1 < this.save.maxLevel ? 5 : this.save.maxStage;
        for (let s = 0; s < 4; s++) { ctx.fillStyle = s + 1 < maxS || (i + 1 < this.save.maxLevel) ? '#ffd75a' : s + 1 === maxS ? '#8cf' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(x + 20 + s * 22, y + ch - 16, 7, 0, TAU); ctx.fill(); }
      }
      this.hot.push({ x, y, w: cw, h: ch, fn: () => { if (this.sub) return; this.idx = i; if (!locked) { SFX.play('confirm'); this.sub = { L: i + 1, i: 0 }; this.sub.i = this.subMax() - 1; } else SFX.play('block'); } });
    });
    if (this.sub) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(20,24,44,0.95)'; roundRect(ctx, 180, 170, 600, 200, 14); ctx.fill(); ctx.strokeStyle = '#ffd75a'; ctx.lineWidth = 2; ctx.stroke();
      this.text(ctx, `第 ${this.sub.L} 關　${LEVELS[this.sub.L - 1].name}　— 選擇場次`, W / 2, 210, 22, '#ffe27a');
      const n = this.subMax();
      for (let s = 0; s < 4; s++) this.btn(ctx, 205 + s * 140, 240, 130, 60, s < 3 ? `第 ${s + 1} 場` : '頭目戰', s === this.sub.i, () => { this.sub.i = s; if (s + 1 <= n) { this.score = 0; this.stats = newStats(); SFX.play('confirm'); this.startStage(this.sub.L, s + 1); } else SFX.play('block'); }, { disabled: s + 1 > n });
      this.btn(ctx, 400, 315, 160, 38, '返回', false, () => { this.sub = null; }, { size: 18 });
    } else this.btn(ctx, 30, 490, 120, 38, '← 返回', false, () => this.go('select'), { size: 18 });
    this.text(ctx, '方向鍵選擇　A/Z 確認　D/C 返回', W / 2, 524, 14, '#ccc');
  }
  drawMoves(ctx) {
    ctx.fillStyle = '#0e1024'; ctx.fillRect(0, 0, W, H);
    this.text(ctx, '招式表（共 35 招：共通 5 ＋ 必殺技 30）', W / 2, 34, 24, '#ffe27a');
    const tabs = ['共通招式', ...CHARS.map(c => c.cls)], pg = this.mpage || 0;
    tabs.forEach((t, i) => this.btn(ctx, 20 + i * 154, 48, 146, 34, t, i === pg, () => { this.mpage = i; SFX.play('select'); }, { size: 17 }));
    if (pg === 0) {
      UNIVERSAL_MOVES.forEach((m, i) => {
        const y = 118 + i * 62; ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'; ctx.fillRect(30, y - 26, W - 60, 56);
        this.text(ctx, m.name, 50, y, 20, '#ffe9a0', 'left', false); this.text(ctx, m.input, 200, y, 17, '#8cf', 'left', false);
        this.text(ctx, m.desc, 200, y + 22, 14, '#ccc', 'left', false);
      });
      this.text(ctx, '指令：「D → A」＝依序按 防禦、前方向（←或→，會轉向）、攻擊；觸控可直接點技能按鈕', W / 2, 438, 14, '#aaa');
    } else {
      const c = CHARS[pg - 1], f = this.previews[pg - 1];
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; roundRect(ctx, 24, 94, 190, 380, 10); ctx.fill();
      f.x = 119; f.y = 300; f.face = 1; const s0 = f.scale; f.scale = 2; if (f.state !== 'attack' || f.t > 24) { f.state = 'attack'; f.t = 0; f.anim = { k: c.combo[(this.frame / 25 | 0) % 3], dur: 16 }; } drawFighter(ctx, f, 0, this.frame); f.scale = s0;
      this.text(ctx, c.cls, 119, 340, 24, '#ffe27a'); this.text(ctx, c.name, 119, 364, 16, '#bbb');
      this.text(ctx, `HP ${c.hp}　MP ${c.mp}`, 119, 392, 14, '#ddd');
      wrapText(ctx, c.desc, 119, 420, 170, 18, 13, '#aaa');
      c.specials.forEach((s, i) => {
        const y = 122 + i * 58; ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'; ctx.fillRect(228, y - 24, W - 252, 52);
        this.text(ctx, s.name, 244, y, 19, '#ffe9a0', 'left', false); this.text(ctx, s.input, 400, y, 17, '#8cf', 'left', false);
        this.text(ctx, 'MP ' + s.mp, 500, y, 15, '#6cf', 'left', false); if (i >= 3) this.text(ctx, 'NEW', 890, y, 12, '#f8a', 'left', false);
        this.text(ctx, s.desc, 244, y + 21, 14, '#ccc', 'left', false);
      });
    }
    this.btn(ctx, 20, 488, 120, 38, '← 返回', false, () => this.go(this.movesFrom), { size: 17 });
    this.text(ctx, '← → 切換分頁　A / D 返回', W / 2, 514, 14, '#aaa');
  }
  drawControls(ctx) {
    ctx.fillStyle = '#0e1024'; ctx.fillRect(0, 0, W, H);
    this.text(ctx, '操作說明', W / 2, 44, 28, '#ffe27a');
    const L = [
      ['移動', '方向鍵 ← → ↑ ↓（↑↓ 為縱深移動）'], ['攻擊 A', 'A 或 Z　（連按三下＝三段連擊）'], ['跳躍 J', 'J、X 或 空白鍵'], ['防禦 D', 'D 或 C（按住防禦，正面攻擊大幅減傷）'],
      ['奔跑', '快速連按兩下 ← 或 →，按住持續奔跑'], ['衝刺攻擊', '奔跑中按 A'], ['跳躍攻擊', '跳躍中按 A'], ['必殺技', 'D → A、D ↑ A、D ↓ A、D → J、D ↑ J 等（依序輸入）'],
      ['抓投', '貼近暈眩／硬直敵人按 A 抓住 → A 毆打、方向＋A 摔出'], ['翻滾閃避', 'D ＋ ←／→、防禦中按 ←／→、或奔跑中按 D'],
      ['撿道具／投擲', '站在道具上按 A；手持投擲物按 A、手持武器奔跑中按 A'], ['暫停／靜音', 'P 或 Esc／M 或右上角喇叭'],
    ];
    L.forEach((r, i) => { const y = 92 + i * 31; this.text(ctx, r[0], 250, y, 18, '#8cf', 'right', false); this.text(ctx, r[1], 280, y, 17, '#fff', 'left', false); });
    this.text(ctx, '手機：左側虛擬搖桿（推到底＝奔跑），右側 6 個技能鍵＋A／J／D／翻滾。任何按鍵返回', W / 2, 500, 15, '#aaa');
    this.hot.push({ x: 0, y: 0, w: W, h: H, fn: () => this.go(this.movesFrom) });
  }
  drawWorld(ctx) {
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    const cam = Math.round(this.camX);
    drawBackground(ctx, this.theme, cam, this.frame);
    const ents = [];
    for (const c of this.crates) ents.push({ y: c.y, d: () => drawCrate(ctx, c, cam) });
    for (const it of this.items) ents.push({ y: it.y - 1, d: () => {
      const x = it.x - cam; ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, it.y, 12, 4, 0, 0, TAU); ctx.fill();
      const pulse = 0.5 + Math.sin(this.frame * 0.12) * 0.5; ctx.fillStyle = `rgba(255,255,200,${0.15 + pulse * 0.2})`; ctx.beginPath(); ctx.ellipse(x, it.y, 18, 6, 0, 0, TAU); ctx.fill();
      drawItemIcon(ctx, it.type, x, it.y - 10 - it.z, 1.2, 0); } });
    for (const f of this.fighters) ents.push({ y: f.y, d: () => { drawFighter(ctx, f, cam, this.frame); this.drawMiniBar(ctx, f, cam); } });
    for (const p of this.projs) ents.push({ y: p.y + 0.5, d: () => drawProj(ctx, p, cam, this.frame) });
    ents.sort((a, b) => a.y - b.y).forEach(e => e.d());
    for (const p of PARTICLES) drawParticle(ctx, p, cam);
    drawAmbient(ctx, this.theme, this.frame, cam);
    if (this.debug) { ctx.strokeStyle = 'rgba(255,0,0,0.6)'; for (const f of this.fighters) ctx.strokeRect(f.x - cam - f.w / 2, f.y - f.z - f.h, f.w, f.h); }
    ctx.restore();
  }
  drawMiniBar(ctx, f, cam) {
    if (f.team !== 1 || f.isBoss || f.hp >= f.maxHp || f.state === 'dead') return;
    const x = f.x - cam - 18, y = f.y - f.z - f.h - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, y - 1, 38, 6); ctx.fillStyle = '#f44'; ctx.fillRect(x, y, 36 * Math.max(0, f.hp / f.maxHp), 4);
  }
  drawHUD(ctx) {
    const p = this.player; if (!p) return;
    ctx.fillStyle = 'rgba(0,0,20,0.6)'; roundRect(ctx, 8, 8, 340, 78, 10); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#223'; ctx.beginPath(); ctx.arc(44, 47, 30, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ffd75a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(44, 47, 29, 0, TAU); ctx.clip(); drawHead(ctx, 44, 52, 20, p.look, 0); ctx.restore();
    this.text(ctx, p.name, 84, 28, 15, '#ffe27a', 'left');
    bar(ctx, 84, 36, 170, 13, p.hp / p.maxHp, p.hp / p.maxHp > 0.3 ? '#4d4' : '#f44', `${Math.max(0, Math.ceil(p.hp))}/${p.maxHp}`);
    bar(ctx, 84, 54, 170, 10, p.mp / p.maxMp, '#39f', `${Math.floor(p.mp)}/${p.maxMp}`);
    if (this.debugInfMp) this.text(ctx, '∞MP', 230, 28, 12, '#6cf', 'left');
    // 手持道具
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(ctx, 264, 22, 76, 56, 6); ctx.fill();
    this.text(ctx, '手持', 302, 34, 11, '#aaa', 'center', false);
    if (p.held) { drawItemIcon(ctx, p.held.type, 302, 52, 1.3, 0); const d = ITEMS[p.held.type]; this.text(ctx, d.name + (d.cat === 'melee' ? ` ${p.held.dur}` : ''), 302, 74, 12, '#fff'); }
    else this.text(ctx, '—', 302, 58, 16, '#666', 'center', false);
    // 關卡資訊
    const lv = LEVELS[this.level - 1];
    this.text(ctx, `第 ${this.level} 關 ${lv.name}　${this.stage < 4 ? '第 ' + this.stage + ' 場' : '頭目戰'}`, W / 2, 28, 18, '#fff');
    this.text(ctx, `分數 ${this.score}`, W / 2, 50, 16, '#ffe27a');
    if (!this.isBoss && this.waves) this.text(ctx, `波次 ${Math.min(this.waveIdx + 1, this.waves.length)}/${this.waves.length}`, W - 100, 60, 14, '#ddd');
    // 頭目血條
    if (this.isBoss) {
      const bosses = this.fighters.filter(f => f.isBoss && f.team === 1);
      bosses.forEach((b, k) => { const y = H - 34 - k * 30; this.text(ctx, b.name, 20, y + 12, 15, b.strong ? '#ff8a8a' : '#d8a0ff', 'left'); bar(ctx, 170, y, 580, 14, b.hp / b.maxHp, b.strong ? '#e22' : '#a4f', ''); bar(ctx, 760, y + 3, 120, 8, b.mp / b.maxMp, '#39f', ''); });
      if (this.bossGroups.length > 1) this.text(ctx, `最終連戰 ${this.bossIdx + 1}/${this.bossGroups.length}`, W - 110, 60, 14, '#fcc');
      if (this.bossBanner > 0) { const a = Math.min(1, this.bossBanner / 30); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(120,0,0,0.55)'; ctx.fillRect(0, 200, W, 80); this.text(ctx, '⚔ 頭目出現 ⚔', W / 2, 232, 22, '#ffd75a'); this.text(ctx, bosses.map(b => b.name).join('　＆　'), W / 2, 266, 28, '#fff'); ctx.globalAlpha = 1; }
    }
    if (this.goTimer > 0 && (this.frame % 30 < 20)) this.text(ctx, 'GO →', W - 110, H / 2, 48, '#ffd75a');
    if (this.debug) this.text(ctx, `DEBUG 敵:${this.fighters.length - 1} 投射:${this.projs.length} 粒子:${PARTICLES.length} 狀態:${p.state}  [K]清場 [N]下一場 [I]無限MP`, 10, H - 8, 12, '#0f0', 'left');
  }
  drawOverlay(ctx) {
    const s = this.screen;
    if (s === 'intro') {
      const t = this.frame - this.frame0; const a = Math.min(1, t / 15);
      ctx.fillStyle = `rgba(0,0,0,${0.55 * a})`; ctx.fillRect(0, 150, W, 200);
      this.text(ctx, `第 ${this.level} 關　${LEVELS[this.level - 1].name}`, W / 2, 215, 40, '#ffe27a');
      this.text(ctx, this.isBoss ? (this.level === 10 ? '最終決戰：五英雄連戰' : '頭目戰：' + this.bossGroups[0].map(ci => bossTitle(ci, this.level > 5)).join('、')) : `第 ${this.stage} 場　— 擊敗所有敵人前進！`, W / 2, 265, 24, '#fff');
      this.text(ctx, '按 A 開始', W / 2, 315, 16, '#ccc');
    } else if (s === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      this.text(ctx, '暫停', W / 2, 110, 40, '#ffe27a'); this.menu(ctx, this.pauseMenu(), W / 2, 140, 260, 42, 10);
    } else if (s === 'gameover') {
      ctx.fillStyle = 'rgba(40,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
      this.text(ctx, '戰敗…', W / 2, 150, 56, '#ff6a6a'); this.text(ctx, `分數 ${this.score}`, W / 2, 195, 20, '#fff');
      this.menu(ctx, this.overMenu(), W / 2, 240, 260, 44, 12);
    } else if (s === 'stageclear') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 160, W, 190);
      this.text(ctx, `第 ${this.stage} 場　完成！`, W / 2, 225, 44, '#ffe27a');
      this.text(ctx, `過關獎勵 +${this.clearBonus}　　總分 ${this.score}`, W / 2, 275, 22, '#fff');
      this.text(ctx, '按 A 繼續', W / 2, 320, 16, '#ccc');
    } else if (s === 'levelclear') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
      this.text(ctx, `第 ${this.level} 關　${LEVELS[this.level - 1].name}　通關！`, W / 2, 130, 40, '#ffe27a');
      this.text(ctx, `擊敗頭目獎勵 +${this.clearBonus}　　總分 ${this.score}`, W / 2, 175, 20, '#fff');
      this.text(ctx, `已解鎖第 ${this.level + 1} 關：${LEVELS[this.level].name}`, W / 2, 205, 18, '#8cf');
      this.menu(ctx, this.clearMenu(), W / 2, 240, 260, 44, 12);
    } else if (s === 'win') {
      ctx.fillStyle = 'rgba(0,0,30,0.75)'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 3; i++) if ((this.frame + i * 20) % 60 === 0) addParticle({ type: 'spark', x: this.camX + 100 + Math.random() * 760, y: 150 + Math.random() * 250, z: 0, life: 30, color: ['#ffd75a', '#8cf', '#f8a'][i] });
      updateParticles(); for (const p of PARTICLES) drawParticle(ctx, p, this.camX);
      this.text(ctx, '恭喜通關！', W / 2, 150, 60, '#ffe27a');
      this.text(ctx, `${CHARS[this.ci].cls} ${CHARS[this.ci].name} 擊敗了五位覺醒英雄，王國重獲和平！`, W / 2, 215, 22, '#fff');
      this.text(ctx, `最終分數：${this.score}　　最高紀錄：${this.save.best}`, W / 2, 260, 22, '#8cf');
      this.text(ctx, '感謝遊玩《劍與魔法：亂鬥英雄》', W / 2, 320, 18, '#ccc');
      this.btn(ctx, W / 2 - 110, 360, 220, 46, '返回標題', true, () => this.go('title'));
    }
  }
}
function wrapText(ctx, str, x, y, maxW, lh, sz, col) {
  ctx.font = font(sz, false); ctx.fillStyle = col; ctx.textAlign = 'center'; let line = '', yy = y;
  for (const ch of str) { if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, yy); line = ch; yy += lh; } else line += ch; }
  if (line) ctx.fillText(line, x, yy);
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function bar(ctx, x, y, w, h, v, col, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(v, 0, 1), h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, w * clamp(v, 0, 1), h / 3);
  if (label) { ctx.font = font(Math.max(9, h - 2)); ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.fillText(label, x + w - 3, y + h - 2); }
}
function drawLock(ctx, x, y) {
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y - 10, 12, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = '#999'; roundRect(ctx, x - 18, y - 10, 36, 28, 4); ctx.fill(); ctx.fillStyle = '#333'; ctx.fillRect(x - 3, y, 6, 10);
}

// ---------- 觸控操作：浮動搖桿＋技能鍵 ----------
const Touch = {
  on: false, built: -1, skillBtns: [],
  setup() {
    const wrap = document.getElementById('touch');
    const want = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).get('touch') === '1';
    if (!want) return;
    this.on = true; document.body.classList.add('touch'); wrap.style.display = 'block';
    // 動作鍵（多點觸控：每個按鈕獨立追蹤自己的 pointer）
    wrap.querySelectorAll('[data-k]').forEach(b => {
      const k = b.dataset.k; const ids = new Set();
      const on = e => { e.preventDefault(); SFX.init(); ids.add(e.pointerId); try { b.setPointerCapture(e.pointerId); } catch (_) {} b.classList.add('on'); Input.down(k, true); };
      const off = e => { e.preventDefault(); ids.delete(e.pointerId); if (!ids.size) { b.classList.remove('on'); Input.up(k); } };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    // 搖桿
    const zone = document.getElementById('joy'), base = document.getElementById('joyBase'), knob = document.getElementById('joyKnob');
    const J = Input.joy; J.dirs = { left: false, right: false, up: false, down: false };
    const R = () => base.offsetWidth * 0.5;
    const setDirs = (want) => { for (const k of ['left', 'right', 'up', 'down']) { if (want[k] && !J.dirs[k]) Input.down(k, true); if (!want[k] && J.dirs[k]) Input.up(k); J.dirs[k] = want[k]; } };
    const place = (x, y) => { const r = zone.getBoundingClientRect(); base.style.left = (x - r.left) + 'px'; base.style.top = (y - r.top) + 'px'; };
    const move = (x, y) => {
      const r = R(); let dx = x - J.bx, dy = y - J.by; const m = Math.hypot(dx, dy);
      if (m > r) { dx *= r / m; dy *= r / m; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const n = Math.min(1, m / r), want = { left: false, right: false, up: false, down: false };
      if (n > 0.25) {
        const sec = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8; // 0=右 2=下 4=左 6=上
        if (sec === 7 || sec === 0 || sec === 1) want.right = true;
        if (sec === 3 || sec === 4 || sec === 5) want.left = true;
        if (sec === 1 || sec === 2 || sec === 3) want.down = true;
        if (sec === 5 || sec === 6 || sec === 7) want.up = true;
      }
      setDirs(want);
      J.run = Math.abs(dx) >= r * 0.85 ? Math.sign(dx) : 0; J.nx = dx / r; J.ny = dy / r;
    };
    const end = e => { if (e.pointerId !== J.id) return; J.active = false; J.id = null; J.run = 0; setDirs({}); knob.style.transform = ''; base.classList.add('idle'); base.style.left = base.style.top = ''; };
    zone.addEventListener('pointerdown', e => { e.preventDefault(); SFX.init(); if (J.active) return; J.active = true; J.id = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch (_) {} J.bx = e.clientX; J.by = e.clientY; base.classList.remove('idle'); place(e.clientX, e.clientY); move(e.clientX, e.clientY); });
    zone.addEventListener('pointermove', e => { if (e.pointerId === J.id) { e.preventDefault(); move(e.clientX, e.clientY); } });
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    document.getElementById('rotate').addEventListener('click', e => e.currentTarget.classList.add('hide'));
  },
  buildSkills(ci) {
    const box = document.getElementById('skills'); box.innerHTML = ''; this.skillBtns = [];
    const arrow = { f: '→', u: '↑', d: '↓' };
    CHARS[ci].specials.forEach(s => {
      const b = document.createElement('button'); b.className = 'sk sk-' + s.cmd;
      b.innerHTML = `<b>${s.short}</b><i>${arrow[s.cmd[1]]}${s.cmd[2]}·${s.mp}</i>`; b.title = s.name;
      const ids = new Set();
      b.addEventListener('pointerdown', e => { e.preventDefault(); SFX.init(); ids.add(e.pointerId); b.classList.add('on'); Input.skillQ = { cmd: s.cmd, f: Input.frame }; });
      const off = e => { ids.delete(e.pointerId); if (!ids.size) b.classList.remove('on'); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('contextmenu', e => e.preventDefault());
      box.appendChild(b); this.skillBtns.push({ b, s });
    });
    this.built = ci;
  },
  tick(g) {
    if (!this.on) return;
    const playing = g.screen === 'play' || g.screen === 'intro';
    if (document.body.classList.contains('playing') !== playing) { document.body.classList.toggle('playing', playing); if (!playing) { Input.held = {}; } }
    if (!playing || !g.player) return;
    if (this.built !== g.player.ci) this.buildSkills(g.player.ci);
    if (g.frame % 6 === 0) for (const { b, s } of this.skillBtns) b.classList.toggle('dim', g.player.mp < s.mp);
  },
};

// ---------- 啟動 ----------
let game;
function boot() {
  const cv = document.getElementById('game');
  game = new Game(cv); window.SMB = game;
  const fit = () => { const s = Math.min(window.innerWidth / W, window.innerHeight / H); cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px'; };
  window.addEventListener('resize', fit); fit(); Touch.setup();
  let last = performance.now(), acc = 0;
  function loop(now) {
    acc += Math.min(100, now - last); last = now;
    let n = 0;
    while (acc >= 1000 / 60 && n < 5) { try { game.step(); } catch (e) { console.error(e); } acc -= 1000 / 60; n++; }
    try { game.draw(); Touch.tick(game); } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
window.addEventListener('load', boot);
