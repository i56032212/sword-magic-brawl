'use strict';
// ===== 敵人 AI 與頭目 AI =====
const sgn = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
const rnd = Math.random;
function busy(f) { return !(f.state === 'idle' || f.state === 'walk' || f.state === 'run'); }
function isAttacking(t) { return t.state === 'attack' || t.state === 'special' || t.state === 'dashatk' || t.state === 'jumpatk'; }

class GruntAI {
  constructor(f, level) {
    this.f = f; this.level = level; this.cd = 40 + rnd() * 60; this.think = 0;
    this.react = Math.max(5, 16 - level); this.offset = rnd(); this.mx = 0; this.my = 0; this.wander = 0;
  }
  onHurt() { this.cd = Math.max(this.cd, 20); }
  update(g) {
    const f = this.f; const I = f.intent = emptyIntent();
    if (this.cd > 0) this.cd--;
    if (busy(f)) return;
    const tgt = g.nearestFoe(f); if (!tgt) { return; }
    const dx = tgt.x - f.x, dy = tgt.y - f.y, adx = Math.abs(dx), ady = Math.abs(dy);
    const tgtDown = tgt.state === 'down' || tgt.state === 'getup' || tgt.state === 'dead';
    // 撿道具／投擲
    if (f.def.picker && !f.held) {
      const it = g.items.find(i => ITEMS[i.type].cat !== 'heal' && Math.abs(i.x - f.x) < 140 && Math.abs(i.y - f.y) < 70 && i.z <= 1);
      if (it) {
        if (Math.abs(it.x - f.x) < 24 && Math.abs(it.y - f.y) < 14) { I.atk = true; return; }
        I.mx = sgn(it.x - f.x); I.my = Math.abs(it.y - f.y) > 4 ? sgn(it.y - f.y) : 0; return;
      }
    }
    if (f.held && ITEMS[f.held.type].cat === 'throw') {
      if (ady < 14 && adx > 90 && adx < 420 && this.cd <= 0 && !tgtDown) { f.face = sgn(dx); I.atk = true; this.cd = 70; return; }
    }
    if (--this.think <= 0) {
      this.think = this.react + Math.floor(rnd() * 6);
      const attacker = g.attackers.has(f);
      let tx, ty = tgt.y;
      if (f.def.ranged) { tx = tgt.x - sgn(dx || 1) * (250 + this.offset * 60); }
      else if (attacker && !tgtDown) tx = tgt.x - sgn(dx || 1) * (f.reach() * 0.75);
      else { tx = tgt.x - sgn(dx || 1) * (190 + this.offset * 110); ty = clamp(tgt.y + (this.offset - 0.5) * 140, GROUND_TOP, GROUND_BOT); }
      const ex = tx - f.x, ey = ty - f.y;
      this.mx = Math.abs(ex) > 10 ? sgn(ex) : 0; this.my = Math.abs(ey) > 5 ? sgn(ey) : 0;
      if (rnd() < 0.08) { this.mx = 0; this.my = 0; }
    }
    I.mx = this.mx; I.my = this.my;
    if (!I.mx) f.face = sgn(dx) || f.face;
    if (tgtDown || this.cd > 0) return;
    const aligned = ady < 14;
    if (f.def.ranged) {
      if (aligned && adx > 120 && adx < 460) { f.face = sgn(dx); f.startMove(g, 'orb'); this.cd = Math.max(70, 150 - this.level * 8) + rnd() * 40; return; }
      if (adx < f.reach() + 8 && aligned) { f.face = sgn(dx); I.atk = true; this.cd = 60; }
      return;
    }
    if (f.etype === 'wolf' && aligned && adx > 100 && adx < 210 && rnd() < 0.05) { f.face = sgn(dx); f.startMove(g, 'pounce'); this.cd = 90; return; }
    if (g.attackers.has(f) && adx < f.reach() + 12 && aligned) {
      f.face = sgn(dx); I.atk = true; this.cd = Math.max(22, 70 - this.level * 4) + rnd() * 35;
    }
  }
}

class BossAI {
  constructor(f, level) {
    this.f = f; this.level = level;
    this.skill = Math.min(0.95, 0.3 + level * 0.065);
    this.cd = 60; this.spCd = 150 - level * 6; this.think = 0; this.defT = 0; this.mx = 0; this.my = 0; this.keep = 0;
    this.react = Math.max(3, 13 - level);
  }
  onHurt() { this.cd = Math.max(this.cd, 10); }
  unlocked() { const n = this.f.isClone ? 0 : clamp(2 + Math.ceil(this.level / 2), 3, 6); return this.f.def.specials.slice(0, n); }
  pickSpecial(g, tgt, dx, dy) {
    const f = this.f, adx = Math.abs(dx), ady = Math.abs(dy), id = f.def.id, d = sgn(dx) || f.face;
    const aligned = ady < 18;
    const un = this.unlocked();
    const opts = [];
    const add = (cmd, w = 1, sdir = d) => { const s = un.find(x => x.cmd === cmd); if (s && f.mp >= s.mp) opts.push({ cmd, w, sdir }); };
    switch (id) {
      case 'sword':
        if (aligned && adx > 150 && adx < 600) add('DfA'); if (aligned && adx < 70) add('DuA'); if (adx < 200 && ady < 30) add('DfJ');
        if (ady < 30 && adx > 70 && adx < 380) add('DdA'); if (f.buffs.power <= 0 && adx > 140) add('DuJ', 0.7); break;
      case 'mage':
        if (aligned && adx > 110) add('DfA'); if (adx < 140 && ady < 60) add('DdA'); if (adx > 140 && adx < 540) add('DuA');
        if (adx < 90) add('DfJ', 1.2, -d); if (adx > 150) add('DuJ', 0.8); if (f.buffs.shield <= 0 && adx < 260) add('DdJ', 0.7); break;
      case 'archer':
        if (adx > 130 && ady < 60) add('DfA'); if (adx > 120 && adx < 420) add('DuA'); if (aligned && adx < 120) add('DfJ');
        if (adx > 70 && adx < 220 && ady < 40) add('DdA', 0.8); if (aligned && adx > 120) add('DuJ'); if (aligned && adx > 140) add('DdJ'); break;
      case 'paladin':
        if (f.hp < f.maxHp * 0.45 && adx > 130) add('DuJ', 2); if (aligned && adx > 80 && adx < 320) add('DfA'); if (adx < 160 && ady < 60) add('DdA');
        if (aligned && adx < 75) add('DuA'); if (aligned && adx > 120 && adx < 420) add('DfJ'); if (adx > 180 && (tgt.def.id === 'mage' || tgt.def.id === 'archer')) add('DdJ', 0.8); break;
      case 'assassin':
        if (adx > 170) add('DfA'); if (aligned && adx < 65) add('DfJ'); if (aligned && adx > 140) add('DdA');
        if (aligned && adx > 90 && adx < 230) add('DuA'); if (!g.fighters.some(c => c.isClone && c.owner === f) && adx < 420) add('DuJ', 0.6); if (adx < 110) add('DdJ', 0.7); break;
    }
    if (!opts.length) return null;
    let tot = opts.reduce((s, o) => s + o.w, 0), r = rnd() * tot;
    for (const o of opts) { if ((r -= o.w) < 0) return o; }
    return opts[0];
  }
  update(g) {
    const f = this.f; const I = f.intent = emptyIntent();
    if (this.cd > 0) this.cd--; if (this.spCd > 0) this.spCd--;
    const tgt = g.nearestFoe(f); if (!tgt) return;
    const dx = tgt.x - f.x, dy = tgt.y - f.y, adx = Math.abs(dx), ady = Math.abs(dy);
    const tgtDown = tgt.state === 'down' || tgt.state === 'getup' || tgt.state === 'dead';
    if (f.state === 'defend' || f.state === 'blockstun') { if (this.defT-- > 0) I.def = true; return; }
    if (f.state === 'attack') { if (adx < f.reach() + 25 && ady < 22 && rnd() < this.skill + 0.2) I.atk = true; return; }
    if (f.state === 'jump') { if (adx < 80 && ady < 24 && rnd() < 0.3) I.atk = true; return; }
    if (f.state === 'grab') { if (f.punchT <= 0 && rnd() < 0.15) { I.atk = true; if (f.punches >= 2 || rnd() < 0.3) I.mx = rnd() < 0.5 ? f.face : -f.face; } return; }
    if (busy(f)) return;
    // 防禦反應
    const threat = (isAttacking(tgt) && adx < 120 && ady < 30 && sgn(-dx) === tgt.face) || g.projs.some(p => p.team !== f.team && p.type !== 'spawner' && Math.abs(p.y - f.y) < 22 && sgn(f.x - p.x) === sgn(p.vx) && Math.abs(p.x - f.x) < 160);
    if (threat && rnd() < this.skill * 0.22) {
      const r = rnd();
      const ctr = this.unlocked().find(s => s.id === 'counter');
      if (ctr && f.mp >= ctr.mp && r < 0.3 && !this.noSpecial) { I.special = 'DdJ'; I.sdir = sgn(dx) || f.face; return; }
      if (this.level >= 3 && r < 0.55) { I.roll = true; I.mx = rnd() < 0.5 ? -sgn(dx) || 1 : sgn(dx) || 1; return; }
      f.face = sgn(dx) || f.face; I.def = true; this.defT = 16 + Math.floor(rnd() * 12); return;
    }
    if (tgt.state === 'dizzy' && adx < 44 && ady < 14 && this.cd <= 0) { f.face = sgn(dx) || f.face; I.atk = true; this.cd = 20; return; }
    // 必殺技
    if (!this.noSpecial && this.spCd <= 0 && !tgtDown && rnd() < 0.04 + this.skill * 0.06) {
      const o = this.pickSpecial(g, tgt, dx, dy);
      if (o) { I.special = o.cmd; I.sdir = o.sdir; this.spCd = Math.max(55, 200 - this.level * 13) + rnd() * 60; return; }
    }
    // 移動
    if (--this.think <= 0) {
      this.think = this.react + Math.floor(rnd() * 5);
      const ranged = f.def.id === 'mage' || f.def.id === 'archer';
      let want = f.reach() * 0.7;
      if (ranged && rnd() < 0.55) want = 220 + rnd() * 80;
      if (tgtDown) want = 150;
      const tx = tgt.x - sgn(dx || 1) * want;
      const ex = tx - f.x, ey = tgt.y - f.y;
      this.mx = Math.abs(ex) > 12 ? sgn(ex) : 0; this.my = Math.abs(ey) > 5 ? sgn(ey) : 0;
      this.run = Math.abs(ex) > 260 && rnd() < 0.6;
    }
    I.mx = this.mx; I.my = this.my; if (this.run && I.mx) I.run = true;
    if (f.state === 'run' && Math.abs(dx) < 110) { I.atk = ady < 18 && rnd() < 0.5; if (!I.atk) I.mx = 0; }
    if (!I.mx) f.face = sgn(dx) || f.face;
    if (tgtDown || this.cd > 0) return;
    if (adx < f.reach() + 10 && ady < 16) { f.face = sgn(dx); I.mx = 0; I.atk = true; this.cd = Math.max(8, 45 - this.level * 4) + rnd() * 25; return; }
    if (adx < 150 && adx > 70 && ady < 16 && rnd() < 0.02 * (1 + this.skill)) { f.face = sgn(dx); I.jmp = true; I.mx = sgn(dx); this.cd = 30; }
  }
}
