'use strict';
// ===== 戰鬥核心：角色狀態機、招式、飛行道具 =====
let UID = 1;
function emptyIntent() { return { mx: 0, my: 0, atk: false, jmp: false, def: false, run: false, special: null, sdir: 0 }; }
const NEUTRAL = { idle: 1, walk: 1 };

class Fighter {
  constructor(o) {
    this.id = UID++;
    this.kind = o.kind; this.def = o.def; this.ci = o.ci; this.etype = o.etype;
    this.team = o.team; this.isBoss = !!o.boss; this.strong = !!o.strong; this.level = o.level || 1;
    this.x = o.x; this.y = o.y; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.face = o.face || 1;
    const m = o.mult || {};
    this.maxHp = Math.round(this.def.hp * (m.hp || 1)); this.hp = this.maxHp;
    this.maxMp = this.def.mp || 0; this.mp = this.maxMp; this.regen = (this.def.regen || 0) * (m.regen || 1);
    this.speed = this.def.speed * (m.spd || 1); this.power = (this.def.power || 1) * (m.pow || 1); this.defense = (this.def.def || 1) * (m.def || 1);
    this.scale = (this.def.scale || 1) * 1.22;
    this.look = this.isBoss ? bossLook(this.def.look, this.strong) : this.def.look;
    this.name = this.kind === 'char' ? (this.isBoss ? bossTitle(this.ci, this.strong) : this.def.cls + ' ' + this.def.name) : this.def.name;
    this.state = 'idle'; this.t = 0; this.hitstun = 0; this.stagger = 0; this.guard = 0; this.invuln = 0; this.armor = 0;
    this.held = null; this.intent = emptyIntent(); this.atk = null; this.queued = false; this.hitIds = new Set();
    this.move = null; this.moveId = null; this.mv = {}; this.anim = null; this.swing = 0; this.swingUsed = -1;
    this.status = { frozen: 0, burn: 0, poison: 0 }; this.flash = 0; this.remove = false; this.hidden = false;
    this.ai = null; this.bounced = false;
  }
  get w() { return (this.look.type === 'wolf' ? 44 : 28) * this.scale; }
  get h() { return (this.look.type === 'wolf' ? 36 : 64) * this.scale; }
  get alive() { return this.state !== 'dead' && this.hp > 0; }
  setState(s) { this.state = s; this.t = 0; this.hitIds.clear(); }
  weapon() { return this.held && ITEMS[this.held.type].cat === 'melee' ? ITEMS[this.held.type] : null; }

  update(g) {
    const I = this.intent;
    this.t++;
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;
    if (this.armor > 0) this.armor--;
    this.stagger = Math.max(0, this.stagger - 0.7);
    this.guard = Math.max(0, this.guard - 0.5);
    const st = this.status;
    if (this.alive) {
      if (st.burn > 0) { st.burn--; if (st.burn % 20 === 0) this.dot(g, 2.5); }
      if (st.poison > 0) { st.poison--; if (st.poison % 20 === 0) this.dot(g, 2); }
      if (this.maxMp) this.mp = Math.min(this.maxMp, this.mp + this.regen);
    }
    if (st.frozen > 0) { st.frozen--; this.vx = 0; this.vy = 0; this.physics(g); return; }
    switch (this.state) {
      case 'idle': case 'walk': this.neutral(g, I); break;
      case 'run': this.stRun(g, I); break;
      case 'jump': if (I.atk) { if (this.held && ITEMS[this.held.type].cat === 'throw') this.startThrow(g); else { this.swing++; this.anim = { k: 'jumpatk', dur: 16 }; this.state = 'jumpatk'; this.t = 0; this.hitIds.clear(); SFX.play('swing'); } } break;
      case 'jumpatk': {
        if (this.t >= 3 && this.t <= 16) { const w = this.weapon();
          g.hit(this, { id: 'ja', fx0: -8, fx1: (w ? w.reach : this.reach()) + 6, dy: 22, z0: -40, z1: 50, dmg: this.atkBase() * 1.3 + (w ? w.dmg : 0), stagger: 60, knock: 3, launch: 4, hitstun: 18, weapon: !!w, kd: w && w.kd }); }
        break; }
      case 'land': this.vx *= 0.6; this.vy = 0; if (this.t >= 5) this.setState('idle'); break;
      case 'attack': this.stAttack(g, I); break;
      case 'dashatk': {
        this.vx *= 0.93; this.vy *= 0.8;
        if (this.t >= 4 && this.t <= 16) { const w = this.weapon();
          g.hit(this, { id: 'da', fx0: -5, fx1: (w ? w.reach : this.reach()) + 8, dy: 22, z0: 0, z1: 60 * this.scale, dmg: this.atkBase() * 1.6 + (w ? w.dmg : 0), kd: true, knock: 6, launch: 6, weapon: !!w }); }
        if (this.t >= 26) this.setState('idle');
        break; }
      case 'defend': this.vx *= 0.7; this.vy = 0;
        if (I.special && this.trySpecial(g, I.special, I.sdir)) break;
        if (!I.def && this.t > 6) this.setState('idle');
        break;
      case 'blockstun': this.vx *= 0.8; if (this.t >= 10) this.setState(I.def ? 'defend' : 'idle'); break;
      case 'hurt': this.vx *= 0.85; this.vy = 0; if (this.t >= this.hitstun) this.setState('idle'); break;
      case 'fall': break;
      case 'down': this.vx *= 0.8; this.vy = 0; if (this.t >= (this.kind === 'char' ? 34 : 44)) { this.setState('getup'); } break;
      case 'getup': this.invuln = Math.max(this.invuln, 2); if (this.t >= 14) { this.setState('idle'); this.invuln = 30; } break;
      case 'dead': this.vx *= 0.85; this.vy = 0; if (this.t > 80 && this.team !== 0) this.remove = true; break;
      case 'pick': this.vx = 0; this.vy = 0; if (this.t >= 9) this.setState('idle'); break;
      case 'throw': this.vy = 0; if (this.z <= 0) this.vx *= 0.7;
        if (this.t === 5) this.releaseThrow(g);
        if (this.t >= 14) this.setState(this.z > 0 ? 'jump' : 'idle');
        break;
      case 'special': {
        const cont = this.move.update(this, g, I);
        if (!cont) { this.armor = 0; this.hidden = false; this.setState(this.z > 0 ? 'jump' : 'idle'); }
        break; }
    }
    this.physics(g);
  }
  reach() { return this.def.reach || 50; }
  atkBase() { return this.def.atkBase || this.def.dmg || 6; }
  neutral(g, I) {
    if (I.special && this.trySpecial(g, I.special, I.sdir)) return;
    if (I.def) { this.setState('defend'); this.vx = this.vy = 0; return; }
    if (I.atk) { this.doAttack(g); return; }
    if (I.jmp) { this.jump(g, I.mx, I.my, false); return; }
    if (I.run && I.mx) { this.face = I.mx; this.setState('run'); SFX.play('dash'); return; }
    this.vx = I.mx * this.speed; this.vy = I.my * this.speed * 0.55;
    if (I.mx) this.face = I.mx;
    const moving = I.mx || I.my;
    if (moving && this.state !== 'walk') this.state = 'walk';
    else if (!moving && this.state !== 'idle') this.state = 'idle';
  }
  stRun(g, I) {
    if (I.special && this.trySpecial(g, I.special, I.sdir)) return;
    if (I.atk) {
      const it = g.itemUnder(this);
      if (this.held) { this.startThrow(g); return; }
      if (it) { this.pickup(g, it); return; }
      this.swing++; this.anim = { k: 'dash', dur: 20 }; this.setState('dashatk'); this.vx = this.face * this.speed * 2.3; SFX.play('swing'); return;
    }
    if (I.jmp) { this.jump(g, this.face, I.my, true); return; }
    if (I.def) { this.setState('defend'); this.vx *= 0.3; return; }
    if (I.mx !== this.face) { this.setState('land'); this.vx = this.face * 2; return; }
    this.vx = this.face * this.speed * 1.9; this.vy = I.my * this.speed * 0.4;
    if (this.t % 7 === 0) addParticle({ type: 'dust', x: this.x - this.face * 10, y: this.y, z: 2, vx: -this.face * 0.5, vz: 0.4, life: 20, r: 5 });
  }
  jump(g, mx, my, dash) {
    this.setState('jump'); this.z = 0.1; this.vz = dash ? 9.5 : 11;
    this.vx = dash ? this.face * this.speed * 2.3 : mx * this.speed; this.vy = my * this.speed * 0.5;
    if (mx) this.face = mx; SFX.play('jump');
  }
  doAttack(g) {
    const it = g.itemUnder(this);
    if (it && (ITEMS[it.type].cat === 'heal' || !this.held)) { this.pickup(g, it); return; }
    if (this.held && ITEMS[this.held.type].cat === 'throw') { this.startThrow(g); return; }
    this.startCombo(g, 0);
  }
  comboAnim(step) { return (this.def.combo && this.def.combo[step]) || this.def.anim || 'slash'; }
  startCombo(g, step) {
    const w = this.weapon();
    let anim = w ? (step === 1 && w.anim === 'slash' ? 'slash2' : w.anim) : this.comboAnim(step);
    let dur = 19, a0 = 5, a1 = 9;
    if (this.def.fast) { dur -= 4; a0 -= 1; a1 -= 1; }
    if (this.kind === 'enemy') { dur = this.def.heavy ? 34 : 26; a0 = this.def.heavy ? 16 : 11; a1 = a0 + 4; }
    if (w && w.slow) { dur += w.slow; a0 += w.slow; a1 += w.slow; }
    if (w && w.fast) { dur -= w.fast; }
    if (step === 2) { dur += 6; a1 += 1; }
    this.swing++;
    this.atk = { step, dur, a0, a1, w };
    this.anim = { k: anim, dur: Math.max(8, a1 + 4) };
    this.setState('attack'); this.queued = false; this.vx = this.face * 1.5; this.vy = 0;
  }
  stAttack(g, I) {
    const A = this.atk; this.vx *= 0.8; this.vy = 0;
    if (I.atk && A.step < 2 && this.kind === 'char') this.queued = true;
    if (this.t === A.a0) SFX.play('swing');
    const ranged3 = A.step === 2 && !A.w && (this.def.id === 'mage' || this.def.id === 'archer');
    if (this.t >= A.a0 && this.t <= A.a1) {
      if (ranged3) {
        if (this.t === A.a0) {
          const mage = this.def.id === 'mage';
          g.projs.push(new Proj({ type: mage ? 'magicbolt' : 'arrow', x: this.x + this.face * 30, y: this.y, z: 34 * this.scale, vx: this.face * (mage ? 9 : 12), team: this.team, owner: this, dmg: this.atkBase() * 1.6, kd: true, knock: 4, launch: 5, life: 45, r: 10 }));
          SFX.play(mage ? 'magic' : 'arrow');
        }
      } else {
        const mult = [1, 1.1, 1.5][A.step];
        const kd = A.step === 2 || (A.w && A.w.kd) || (this.kind === 'enemy' && this.def.heavy && Math.random() < 0.35);
        g.hit(this, { id: 'c' + A.step, fx0: -6, fx1: A.w ? A.w.reach : this.reach(), dy: 20, z0: 0, z1: 62 * this.scale, dmg: this.atkBase() * mult + (A.w ? A.w.dmg : 0), stagger: kd ? 100 : 34, knock: kd ? 5 : 1.6, launch: kd ? 6 : 0, hitstun: 16, weapon: !!A.w, kd });
      }
    }
    if (this.t > A.a1 && I.special && this.trySpecial(g, I.special, I.sdir)) return;
    if (this.t >= A.dur) { if (this.queued && A.step < 2) this.startCombo(g, A.step + 1); else this.setState('idle'); }
  }
  trySpecial(g, cmd, sdir) {
    if (this.kind !== 'char') return false;
    const sp = this.def.specials.find(s => s.cmd === cmd);
    if (!sp) return false;
    if (this.mp < sp.mp && !(g.debugInfMp && this.team === 0)) { if (this.team === 0) g.floatText(this, '魔力不足', '#6cf'); return false; }
    if (sdir) this.face = sdir;
    if (!(g.debugInfMp && this.team === 0)) this.mp -= sp.mp;
    this.startMove(g, sp.id);
    g.floatText(this, sp.name, this.team === 0 ? '#ffe36a' : '#ff8aa0', 20);
    g.stats.specials[sp.id] = (g.stats.specials[sp.id] || 0) + 1;
    return true;
  }
  startMove(g, id) {
    this.move = MOVES[id]; this.moveId = id; this.mv = {};
    this.setState('special'); this.vx = 0; this.vy = 0; this.swing++;
    this.anim = { k: this.move.anim || 'cast', dur: this.move.animDur || 20 };
    if (this.move.start) this.move.start(this, g);
  }
  itemPos() { return { x: this.x + this.face * 20, y: this.y, z: this.z + 40 * this.scale }; }
  pickup(g, it) {
    const d = ITEMS[it.type];
    g.items.splice(g.items.indexOf(it), 1);
    this.setState('pick');
    if (d.cat === 'heal') {
      if (d.hp) { this.hp = Math.min(this.maxHp, this.hp + d.hp); g.floatText(this, '+' + d.hp + ' HP', '#7f7'); }
      if (d.mpGain) { this.mp = Math.min(this.maxMp, this.mp + d.mpGain); g.floatText(this, '+' + d.mpGain + ' MP', '#6cf'); }
      for (let i = 0; i < 8; i++) addParticle({ type: 'heal', x: this.x + (Math.random() - 0.5) * 30, y: this.y, z: 10 + Math.random() * 50, vz: 1, life: 30, color: d.hp ? '#9f9' : '#8df' });
      SFX.play('drink');
    } else {
      this.held = { type: it.type, dur: it.dur != null ? it.dur : (d.dur || 1) };
      g.floatText(this, d.name, '#fff');
      SFX.play('pickup');
    }
    if (this.team === 0) g.stats.pickups[it.type] = (g.stats.pickups[it.type] || 0) + 1;
  }
  startThrow(g) { if (!this.held) return; this.throwItem = this.held; this.held = null; this.anim = { k: 'throw', dur: 12 }; this.setState('throw'); }
  releaseThrow(g) {
    const it = this.throwItem; if (!it) return; this.throwItem = null;
    const d = ITEMS[it.type]; const air = this.z > 0;
    const base = { x: this.x + this.face * 22, y: this.y, z: this.z + 42 * this.scale, team: this.team, owner: this, type: 'item', item: it.type, r: 14 };
    let p;
    if (it.type === 'knife') p = new Proj(Object.assign(base, { vx: this.face * 13, vz: air ? -1.5 : 0, life: 55, dmg: d.dmg, stagger: 55, knock: 2, hitstun: 18 }));
    else if (it.type === 'firebomb') p = new Proj(Object.assign(base, { vx: this.face * 7.5, vz: air ? 1 : 5, grav: 0.35, life: 120, dmg: 8, knock: 2, stagger: 30, spin: true,
      onHit: (gg, pp) => explode(gg, pp, pp.owner), onGround: (gg, pp) => explode(gg, pp, pp.owner) }));
    else if (it.type === 'rock') p = new Proj(Object.assign(base, { vx: this.face * 8.5, vz: air ? 1 : 4, grav: 0.4, life: 120, dmg: d.dmg, kd: true, knock: 4, launch: 5, spin: true,
      onGround: (gg, pp) => gg.dropItem('rock', pp.x, pp.y, null) }));
    else { // 近戰武器投擲
      const ndur = it.dur - 2;
      p = new Proj(Object.assign(base, { vx: this.face * 10.5, vz: air ? 0 : 3, grav: 0.3, life: 120, dmg: d.dmg * 1.6 + 10, kd: true, knock: 5, launch: 5, spin: true,
        onHit: (gg, pp) => { if (ndur > 0) gg.dropItem(it.type, pp.x, pp.y, ndur); }, onGround: (gg, pp) => { if (ndur > 0) gg.dropItem(it.type, pp.x, pp.y, ndur); } }));
    }
    g.projs.push(p); SFX.play('throw');
    if (this.team === 0) g.stats.throws[it.type] = (g.stats.throws[it.type] || 0) + 1;
  }
  useWeapon(g) {
    if (!this.held || this.swingUsed === this.swing) return;
    if (ITEMS[this.held.type].cat !== 'melee') return;
    this.swingUsed = this.swing; this.held.dur--;
    if (this.held.dur <= 0) {
      g.floatText(this, ITEMS[this.held.type].name + '損壞！', '#fa0');
      for (let i = 0; i < 6; i++) addParticle({ type: 'shard', x: this.x + this.face * 20, y: this.y, z: 40, vx: (Math.random() - 0.5) * 5, vz: Math.random() * 4, grav: 0.3, life: 30, color: ITEMS[this.held.type].color });
      this.held = null; SFX.play('break');
    }
  }
  dropHeld(g) { if (!this.held) return; const h = this.held; this.held = null; g.dropItem(h.type, this.x, this.y, h.dur); }
  dot(g, amt) {
    this.hp -= amt; g.floatText(this, '-' + amt, '#c8ff8a', 13);
    if (this.hp <= 0 && this.state !== 'fall' && this.state !== 'dead') knockDown(this, -this.face, { launch: 4, knock: 2 });
  }
  physics(g) {
    this.x += this.vx; this.y += this.vy;
    if (this.z > 0 || this.vz > 0) {
      this.z += this.vz; this.vz -= GRAV;
      if (this.z <= 0) { const v = this.vz; this.z = 0; this.vz = 0; this.onLand(g, v); }
    }
    if (this.y < GROUND_TOP) this.y = GROUND_TOP; if (this.y > GROUND_BOT) this.y = GROUND_BOT;
    const b = g.boundsFor(this);
    if (this.x < b[0]) this.x = b[0]; if (this.x > b[1]) this.x = b[1];
  }
  onLand(g, v) {
    switch (this.state) {
      case 'jump': case 'jumpatk': this.setState('land'); this.vx = 0; this.vy = 0; SFX.play('land'); break;
      case 'throw': this.vx = 0; break;
      case 'fall':
        if (v < -5 && !this.bounced) { this.bounced = true; this.vz = 3.2; this.z = 0.1; this.vx *= 0.5; addParticle({ type: 'dust', x: this.x, y: this.y, z: 0, life: 25, r: 14 }); g.shake = Math.max(g.shake, 4); SFX.play('land'); }
        else { this.vx *= 0.3; if (this.hp <= 0) { this.setState('dead'); g.onDeath(this); } else this.setState('down'); }
        break;
      case 'hurt': this.setState('idle'); break;
      case 'special': this.vx *= 0.3; break;
    }
  }
}

function knockDown(t, dir, h) {
  t.setState('fall'); t.stagger = 0; t.vz = Math.max(h.launch || 0, 5); t.z = Math.max(t.z, 0.5);
  t.vx = dir * Math.max(h.knock || 3, 3); t.vy = 0; t.bounced = false; t.face = -dir; t.hidden = false; t.armor = 0;
}

// 命中判定核心
function hitFighter(g, att, t, h, dir) {
  if (t.invuln > 0 || t.state === 'down' || t.state === 'getup' || t.state === 'dead' || t.hp <= 0 && t.state === 'fall') return false;
  const pw = att ? att.power : 1;
  let dmg = h.dmg * pw / t.defense;
  const facing = t.face === -dir;
  if ((t.state === 'defend' || t.state === 'blockstun') && facing && !h.unblockable) {
    dmg *= 0.1; t.hp = Math.max(1, t.hp - dmg); t.guard += (h.stagger || 34) * 0.8; t.vx = dir * 3;
    addParticle({ type: 'spark', x: t.x - dir * 12, y: t.y, z: t.z + 40 * t.scale, life: 10, color: '#8cf' }); SFX.play('block');
    if (t.guard >= 100) { t.guard = 0; t.setState('hurt'); t.hitstun = 45; g.floatText(t, '破防！', '#f84'); }
    else { t.state = 'blockstun'; t.t = 0; }
    return true;
  }
  t.hp -= dmg; t.flash = 10;
  if (att) { if (att.maxMp) att.mp = Math.min(att.maxMp, att.mp + 1.5); if (att.team === 0) g.addScore(Math.round(dmg)); }
  g.hitstop = Math.max(g.hitstop, h.kd ? 5 : 3);
  if (h.burn) t.status.burn = 120;
  if (h.poison) t.status.poison = 200;
  addParticle({ type: 'spark', x: t.x - dir * 8, y: t.y, z: t.z + 40 * t.scale, life: 12, color: h.burn ? '#ffa040' : h.poison ? '#8f4' : h.freeze ? '#aef' : '#fff6a0', rot: Math.random() });
  g.floatText(t, Math.max(1, Math.round(dmg)) + '', t.team === 0 ? '#ff6060' : '#ffffff', 15);
  SFX.play(h.kd || dmg > 18 ? 'heavy' : 'hit');
  if (h.freeze && t.hp > 0) {
    t.status.frozen = Math.round(h.freeze * (t.isBoss ? 0.45 : 1)); t.setState('hurt'); t.hitstun = 10; t.vx = 0; t.vy = 0;
    for (let i = 0; i < 6; i++) addParticle({ type: 'shard', x: t.x, y: t.y, z: t.z + 30, vx: (Math.random() - 0.5) * 4, vz: Math.random() * 4, grav: 0.3, life: 30 });
    return true;
  }
  if (t.armor > 0 && t.hp > 0) return true;
  t.stagger += h.stagger || 34;
  const thresh = t.def.heavy ? 150 : t.isBoss ? 120 : 100;
  if (t.z > 2 || h.kd || t.stagger >= thresh || t.hp <= 0) {
    knockDown(t, dir, h); t.dropHeld(g);
    if (t.ai && t.ai.onHurt) t.ai.onHurt();
  } else {
    t.setState('hurt'); t.hitstun = h.hitstun || 14; t.vx = dir * (h.knock || 1.5) * 0.6; t.vy = 0;
    if (t.ai && t.ai.onHurt) t.ai.onHurt();
  }
  return true;
}

function explode(g, p, owner) {
  addParticle({ type: 'explosion', x: p.x, y: p.y, z: 10, life: 24, r: 80 });
  for (let i = 0; i < 14; i++) addParticle({ type: 'flame', x: p.x + (Math.random() - 0.5) * 90, y: p.y + (Math.random() - 0.5) * 40, z: Math.random() * 20, vz: 1 + Math.random(), life: 20 + Math.random() * 20 });
  g.aoe(owner, p.team, p.x, p.y, 80, 36, { id: 'boom' + p.id, dmg: 16, kd: true, knock: 4, launch: 6, burn: true });
  g.shake = Math.max(g.shake, 8); SFX.play('boom');
}

let PID = 1;
class Proj {
  constructor(o) {
    Object.assign(this, { id: PID++, x: 0, y: 0, z: 30, vx: 0, vy: 0, vz: 0, grav: 0, life: 60, team: 0, owner: null, dmg: 10, stagger: 40, knock: 2, launch: 0, hitstun: 16, pierce: false, type: 'arrow', r: 12, dy: 18, t: 0, dead: false }, o);
    this.hitSet = new Set();
  }
  update(g) {
    this.t++; this.x += this.vx; this.y += this.vy; this.z += this.vz; if (this.grav) this.vz -= this.grav;
    if (this.onTick) this.onTick(g, this);
    if (this.type === 'spawner') { this.life--; if (this.life <= 0) this.dead = true; return; }
    if (this.z <= 0 && (this.grav || this.vz < 0)) {
      this.z = 0; this.dead = true;
      if (this.onGround) this.onGround(g, this);
      else if (this.type === 'rainarrow') addParticle({ type: 'arrowstuck', x: this.x, y: this.y, z: 0, life: 40 });
      return;
    }
    if (--this.life <= 0) { this.dead = true; if (this.onExpire) this.onExpire(g, this); return; }
    if (this.y < GROUND_TOP - 30 || this.y > GROUND_BOT + 30) { this.dead = true; return; }
    const dir = this.dir || (this.vx >= 0 ? 1 : -1);
    for (const t of g.fighters) {
      if (t.team === this.team || this.hitSet.has(t.id) || !t.alive && t.state !== 'fall') continue;
      if (Math.abs(t.x - this.x) > this.r + t.w * 0.5) continue;
      if (Math.abs(t.y - this.y) > this.dy) continue;
      if (this.z < t.z - 8 || this.z > t.z + t.h + 8) continue;
      if (hitFighter(g, this.owner, t, this, dir)) {
        this.hitSet.add(t.id);
        if (this.onHit) this.onHit(g, this, t);
        if (!this.pierce) { this.dead = true; return; }
      }
    }
    for (const c of g.crates) {
      if (this.hitSet.has('c' + c.id)) continue;
      if (Math.abs(c.x - this.x) < this.r + 20 && Math.abs(c.y - this.y) < this.dy + 4 && this.z < 45) {
        this.hitSet.add('c' + c.id); g.hitCrate(c, 2);
        if (this.onHit) this.onHit(g, this, null);
        if (!this.pierce) { this.dead = true; return; }
      }
    }
  }
}

// ===== 招式實作（15 個角色必殺技 + 敵人技能）=====
const HB = (f, o) => Object.assign({ fx0: -6, fx1: 50, dy: 22, z0: 0, z1: 70 * f.scale }, o);
const MOVES = {
  // --- 劍士 ---
  gale: { anim: 'slash', animDur: 18,
    update(f, g) {
      if (f.t === 7) { g.projs.push(new Proj({ type: 'wave', x: f.x + f.face * 36, y: f.y, z: 30 * f.scale, vx: f.face * 9.5, team: f.team, owner: f, dmg: 22, stagger: 80, knock: 4, launch: 4, pierce: true, r: 22, dy: 24, life: 55 })); SFX.play('swing'); SFX.play('magic'); }
      return f.t < 24; } },
  rising: { anim: 'upper', animDur: 16,
    start(f) { f.invuln = 12; f.z = 0.5; f.vz = 11; f.vx = f.face * 2.2; SFX.play('swing'); },
    update(f, g) {
      if (f.t < 26) { const n = Math.floor(f.t / 6); const last = f.t >= 18;
        g.hit(f, HB(f, { id: 'ris' + n, fx0: -18, fx1: 58, z0: -15, z1: 95, dmg: 9, stagger: 45, hitstun: 20, kd: last, launch: last ? 10 : 3, knock: last ? 4 : 1 }));
        if (f.t % 6 === 0) addParticle({ type: 'slashfx', x: f.x + f.face * 20, y: f.y, z: f.z + 40, r: 30, a0: -2.5, a1: 0.5, life: 8, color: '#aef' }); }
      return !(f.t > 6 && f.z <= 0); } },
  whirl: { anim: 'spin', animDur: 42,
    update(f, g, I) {
      if (f.t < 38) { f.vx = f.face * 5.5; f.vy = (I.my || 0) * 1.6; }
      else f.vx *= 0.8;
      if (f.t % 6 === 0 && f.t < 36) { SFX.play('swing'); addParticle({ type: 'slashfx', x: f.x, y: f.y, z: 30, r: 46, a0: 0, a1: TAU, life: 8, color: '#cdf' }); }
      if (f.t < 36) g.hit(f, HB(f, { id: 'wh' + Math.floor(f.t / 6), fx0: -44, fx1: 52, dy: 28, dmg: 5.5, stagger: 18, hitstun: 14, knock: 1.5 }));
      else if (f.t < 40) g.hit(f, HB(f, { id: 'whf', fx0: -44, fx1: 56, dy: 28, dmg: 10, kd: true, knock: 6, launch: 6 }));
      return f.t < 44; } },
  // --- 魔法師 ---
  fireball: { anim: 'cast', animDur: 16,
    update(f, g) {
      if (f.t === 10) { g.projs.push(new Proj({ type: 'fireball', x: f.x + f.face * 34, y: f.y, z: 34 * f.scale, vx: f.face * 8, team: f.team, owner: f, dmg: 24, kd: true, knock: 5, launch: 6, burn: true, r: 16, life: 75,
        onHit: (gg, p) => addParticle({ type: 'explosion', x: p.x, y: p.y, z: p.z, life: 18, r: 50 }) })); SFX.play('fire'); }
      return f.t < 26; } },
  frost: { anim: 'castup', animDur: 20,
    update(f, g) {
      if (f.t === 12) {
        addParticle({ type: 'ring', x: f.x, y: f.y, z: 0, r0: 20, r1: 180, life: 24, color: '#bff', fill: 'rgba(170,230,255,1)' });
        for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; addParticle({ type: 'shard', x: f.x + Math.cos(a) * 60, y: f.y + Math.sin(a) * 22, z: 10, vx: Math.cos(a) * 5, vy: Math.sin(a) * 1.6, vz: 2, grav: 0.2, life: 30 }); }
        g.aoe(f, f.team, f.x, f.y, 175, 70, { id: 'frost', dmg: 12, freeze: 110, stagger: 0 }); SFX.play('ice'); g.shake = Math.max(g.shake, 4);
      }
      return f.t < 36; } },
  thunder: { anim: 'castup', animDur: 20,
    start(f, g) {
      const foes = g.fighters.filter(t => t.team !== f.team && t.alive && (t.x - f.x) * f.face > -40 && Math.abs(t.x - f.x) < 560).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x)).slice(0, 4);
      const tg = foes.map(t => ({ f: t }));
      for (let k = 1; tg.length < 4; k++) tg.push({ x: f.x + f.face * 130 * k, y: f.y });
      f.mv.tg = tg; SFX.play('magic');
    },
    update(f, g) {
      const i = (f.t - 12) / 11;
      if (i >= 0 && i < f.mv.tg.length && Number.isInteger(i)) {
        const tg = f.mv.tg[i]; const x = tg.f ? tg.f.x : tg.x, y = tg.f ? tg.f.y : tg.y;
        addParticle({ type: 'bolt', x, y, z: 0, life: 14, seed: Math.random() * 100 });
        g.aoe(f, f.team, x, y, 48, 24, { id: 'th' + i, dmg: 26, kd: true, knock: 2, launch: 7 }); SFX.play('thunder'); g.shake = Math.max(g.shake, 6);
      }
      return f.t < 60; } },
  // --- 弓箭手 ---
  triple: { anim: 'bow', animDur: 12,
    update(f, g) {
      if (f.t === 9) { for (const vy of [-1.7, 0, 1.7]) g.projs.push(new Proj({ type: 'arrow', x: f.x + f.face * 26, y: f.y, z: 38 * f.scale, vx: f.face * 12, vy, team: f.team, owner: f, dmg: 13, stagger: 45, hitstun: 18, knock: 2, r: 12, life: 60 })); SFX.play('arrow'); }
      return f.t < 22; } },
  rain: { anim: 'bowup', animDur: 10,
    update(f, g) {
      if (f.t === 8) {
        SFX.play('arrow'); const ox = f.x, oy = f.y, face = f.face, team = f.team;
        g.projs.push(new Proj({ type: 'spawner', x: ox, y: oy, z: 0, team, owner: f, life: 50, onTick: (gg, p) => {
          if (p.t % 3 === 0 && p.t > 8) {
            const x = ox + face * (90 + Math.random() * 340), y = clamp(oy + (Math.random() - 0.5) * 110, GROUND_TOP, GROUND_BOT);
            gg.projs.push(new Proj({ type: 'rainarrow', x, y, z: 330, vz: -15, vx: face * 0.5, team, owner: f, dmg: 8, stagger: 40, hitstun: 16, knock: 0.5, r: 12, dy: 16, life: 40 }));
            if (p.t % 9 === 0) SFX.play('arrow');
          } } }));
      }
      return f.t < 30; } },
  backshot: { anim: 'bow', animDur: 12,
    start(f) { f.z = 0.5; f.vz = 8.5; f.vx = -f.face * 5.5; f.invuln = 8; SFX.play('jump'); },
    update(f, g) {
      if (f.t === 10) { g.projs.push(new Proj({ type: 'bigarrow', x: f.x + f.face * 26, y: f.y, z: f.z + 36, vx: f.face * 15, team: f.team, owner: f, dmg: 28, pierce: true, kd: true, knock: 5, launch: 5, r: 18, dy: 22, life: 50 })); SFX.play('arrow'); SFX.play('magic'); }
      return !(f.t > 6 && f.z <= 0); } },
  // --- 聖騎士 ---
  charge: { anim: 'shield', animDur: 30,
    start(f) { f.armor = 32; SFX.play('dash'); },
    update(f, g) {
      if (f.t < 24) { f.vx = f.face * 9; if (f.t % 4 === 0) addParticle({ type: 'dust', x: f.x - f.face * 14, y: f.y, z: 2, life: 18, r: 7 }); g.hit(f, HB(f, { id: 'chg', fx0: -4, fx1: 44, dy: 26, dmg: 20, kd: true, knock: 7, launch: 5 })); }
      else f.vx *= 0.75;
      return f.t < 32; } },
  judgment: { anim: 'raise', animDur: 30,
    start(f) { f.invuln = 20; SFX.play('magic'); },
    update(f, g) {
      if (f.t === 16) {
        for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; addParticle({ type: 'pillar', x: f.x + Math.cos(a) * 130, y: f.y + Math.sin(a) * 45, z: 0, life: 30, w: 26 }); }
        addParticle({ type: 'pillar', x: f.x, y: f.y + 1, z: 0, life: 30, w: 40 });
        addParticle({ type: 'ring', x: f.x, y: f.y, z: 0, r0: 30, r1: 200, life: 26, color: '#ffe680', fill: 'rgba(255,240,150,1)' });
        g.aoe(f, f.team, f.x, f.y, 195, 75, { id: 'jdg', dmg: 30, kd: true, launch: 10, knock: 4 }); SFX.play('boom'); SFX.play('heal'); g.shake = Math.max(g.shake, 10);
      }
      return f.t < 44; } },
  heal: { anim: 'heal', animDur: 10,
    start(f) { SFX.play('heal'); },
    update(f, g) {
      if (f.t >= 5 && f.t < 45) { f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.34 / 40); if (f.t % 3 === 0) addParticle({ type: 'heal', x: f.x + (Math.random() - 0.5) * 40, y: f.y + 1, z: Math.random() * 20, vz: 1.5, life: 30 }); }
      if (f.t === 6) { addParticle({ type: 'ring', x: f.x, y: f.y, z: 0, r0: 10, r1: 70, life: 30, color: '#fff27a' }); g.floatText(f, '治癒', '#9f9'); }
      return f.t < 50; } },
  // --- 刺客 ---
  shadow: { anim: 'stab', animDur: 30,
    start(f, g) {
      const foes = g.fighters.filter(t => t.team !== f.team && t.alive && Math.abs(t.x - f.x) < 460).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x));
      f.mv.tgt = foes[0] || null; f.invuln = 14; f.hidden = true;
      addParticle({ type: 'smoke', x: f.x, y: f.y, z: 30, life: 25, r: 20, color: '#222' }); SFX.play('dash');
    },
    update(f, g) {
      if (f.t === 7) {
        const t = f.mv.tgt;
        if (t && t.alive) { const side = -t.face; f.x = t.x + side * 42; f.y = t.y; f.face = -side; }
        else f.x += f.face * 160;
        const b = g.boundsFor(f); f.x = clamp(f.x, b[0], b[1]);
        f.hidden = false; addParticle({ type: 'smoke', x: f.x, y: f.y, z: 30, life: 25, r: 20, color: '#222' });
      }
      if (f.t >= 9 && f.t <= 15) g.hit(f, HB(f, { id: 'sh', fx0: -8, fx1: 58, dmg: 26, kd: true, knock: 5, launch: 6, unblockable: true }));
      return f.t < 28; } },
  flurry: { anim: 'stab', animDur: 46,
    update(f, g) {
      f.vx = f.face * 1.2;
      if (f.t >= 4 && f.t < 38) { const n = Math.floor((f.t - 4) / 4.25); g.hit(f, HB(f, { id: 'fl' + n, fx1: 56, dmg: 4.5, stagger: 8, hitstun: 12, knock: 0.3 })); if ((f.t - 4) % 4 === 0) { SFX.play('swing'); addParticle({ type: 'slashfx', x: f.x + f.face * (30 + Math.random() * 20), y: f.y, z: 30 + Math.random() * 25, r: 14, a0: 0, a1: TAU, life: 6, color: '#f66' }); } }
      if (f.t >= 40 && f.t <= 43) g.hit(f, HB(f, { id: 'flf', fx1: 60, dmg: 11, kd: true, knock: 6, launch: 5 }));
      if (f.t > 38) f.vx = 0;
      return f.t < 48; } },
  poison: { anim: 'throw3', animDur: 30,
    update(f, g) {
      if (f.t === 6 || f.t === 12 || f.t === 18) { g.projs.push(new Proj({ type: 'kunai', x: f.x + f.face * 24, y: f.y, z: 40 * f.scale, vx: f.face * 13, team: f.team, owner: f, dmg: 8, stagger: 30, hitstun: 14, poison: true, r: 10, life: 55 })); SFX.play('throw'); }
      return f.t < 30; } },
  // --- 敵人技能 ---
  orb: { anim: 'cast', animDur: 20,
    update(f, g) { if (f.t === 16) { g.projs.push(new Proj({ type: 'darkorb', x: f.x + f.face * 30, y: f.y, z: 36 * f.scale, vx: f.face * 6, team: f.team, owner: f, dmg: 12, stagger: 70, knock: 3, r: 14, life: 100 })); SFX.play('magic'); } return f.t < 34; } },
  pounce: { anim: 'dash', animDur: 20,
    start(f) { f.z = 0.5; f.vz = 7; f.vx = f.face * 7.5; SFX.play('dash'); },
    update(f, g) { g.hit(f, HB(f, { id: 'pn', fx0: -4, fx1: 40, dmg: 9, stagger: 70, knock: 3, hitstun: 20, z0: -20, z1: 50 })); return !(f.t > 4 && f.z <= 0); } },
};
