'use strict';
// ===== 程序化繪圖：角色、敵人、道具、背景、特效 =====
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function shade(hex, amt) { // amt -1..1
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
  let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function bossLook(look, strong) {
  const l = Object.assign({}, look);
  l.body = shade(look.body, -0.45); l.pants = shade(look.pants, -0.4);
  l.accent = strong ? '#ff3344' : '#b04dff'; l.hair = shade(look.hair || '#222', -0.3);
  l.eyes = strong ? '#ff2020' : '#c070ff';
  return l;
}

// ---------- 姿勢 ----------
function P(o) {
  return Object.assign({ lean: 0, hipF: 0.12, kneeF: 0.1, hipB: -0.12, kneeB: 0.1, shF: 0.35, elF: 0.5, shB: -0.15, elB: 0.5, wpn: null, rot: 0, dy: 0, squash: 1 }, o);
}
const ANIMS = {
  slash(p) { const w = 0.3; if (p < w) { const q = p / w; return { shF: lerp(0.3, 2.9, q), elF: 0.2, wpn: lerp(0.8, 3.1, q), lean: -0.1, hipF: 0.3, hipB: -0.3 }; }
    const q = Math.min(1, (p - w) / 0.35); return { shF: lerp(2.9, 0.7, q), elF: 0.1, wpn: lerp(3.1, 0.9, q), lean: lerp(-0.1, 0.3, q), hipF: 0.55, kneeF: 0.3, hipB: -0.45 }; },
  slash2(p) { const q = clamp((p - 0.2) / 0.4, 0, 1); return { shF: lerp(-0.7, 1.9, q), elF: 0.15, wpn: lerp(-0.2, 2.0, q), shB: lerp(0.6, -0.5, q), lean: 0.18, hipF: 0.5, kneeF: 0.3, hipB: -0.4 }; },
  thrust(p) { const q = clamp((p - 0.25) / 0.25, 0, 1); return { shF: lerp(0.5, 1.55, q), elF: lerp(1.8, 0, q), wpn: 1.57, lean: lerp(0, 0.25, q), hipF: 0.6, kneeF: 0.4, hipB: -0.5 }; },
  stab(p, t) { const q = Math.abs(Math.sin(t * 0.5)); return { shF: lerp(0.6, 1.57, q), elF: lerp(1.6, 0, q), wpn: 1.57, shB: lerp(1.57, 0.6, q), elB: lerp(0, 1.5, q), lean: 0.25, hipF: 0.6, kneeF: 0.4, hipB: -0.5 }; },
  upper(p) { const q = clamp(p * 1.6, 0, 1); return { shF: lerp(0.3, 3.0, q), elF: 0.1, wpn: lerp(1.0, 3.1, q), shB: -0.6, hipF: 0.1, kneeF: 0.1, hipB: -0.5, kneeB: 0.8, lean: -0.1 }; },
  spin(p, t) { return { shF: 1.57, elF: 0, shB: -1.57, elB: 0, wpn: 1.6, squash: Math.cos(t * 0.9), hipF: 0.3, hipB: -0.3 }; },
  cast(p) { const q = clamp(p * 2, 0, 1); return { shF: lerp(2.6, 1.5, q), elF: 0.1, shB: lerp(2.2, 1.4, q), elB: 0.1, wpn: lerp(2.9, 2.0, q), lean: lerp(-0.1, 0.15, q), hipF: 0.4, hipB: -0.35 }; },
  castup(p) { return { shF: 2.9, elF: 0.1, shB: 2.7, elB: 0.2, wpn: 3.05, lean: -0.12, hipF: 0.25, hipB: -0.25 }; },
  bow(p) { const q = clamp(p * 2.2, 0, 1); return { shF: 1.57, elF: 0, shB: 1.5, elB: lerp(0.3, 2.9, q), lean: -0.05, hipF: 0.45, hipB: -0.4, bowDraw: q }; },
  bowup(p) { return { shF: 2.5, elF: 0, shB: 2.45, elB: 1.8, lean: -0.2, hipF: 0.3, hipB: -0.3, bowDraw: 1 }; },
  punch(p) { const q = clamp((p - 0.2) / 0.3, 0, 1); return { shF: lerp(0.8, 1.57, q), elF: lerp(2, 0, q), lean: 0.15, hipF: 0.5, hipB: -0.4 }; },
  kick(p) { const q = clamp((p - 0.15) / 0.3, 0, 1); return { hipF: lerp(0.3, 1.65, q), kneeF: lerp(1.3, 0, q), lean: -0.3, shF: 0.9, shB: -0.9, hipB: -0.1 }; },
  raise(p) { if (p < 0.45) { const q = p / 0.45; return { shF: lerp(0.5, 3.0, q), shB: lerp(0.5, 2.9, q), elF: 0.1, elB: 0.1, wpn: lerp(1.2, 3.3, q), lean: -0.15 }; }
    const q = Math.min(1, (p - 0.45) / 0.2); return { shF: lerp(3.0, 1.0, q), shB: lerp(2.9, 0.9, q), elF: 0.1, elB: 0.1, wpn: lerp(3.3, 1.2, q), lean: lerp(-0.15, 0.35, q), hipF: 0.6, kneeF: 0.6, hipB: -0.5 }; },
  shield(p) { return { lean: 0.4, shB: 1.5, elB: 0.2, shF: -0.5, elF: 0.4, wpn: -0.3, hipF: 0.8, kneeF: 0.6, hipB: -0.8, kneeB: 0.3, shieldFront: true }; },
  heal(p) { return { shF: 2.8, shB: 2.75, elF: 0.2, elB: 0.2, wpn: 3.1, lean: -0.1, hipF: 1.3, kneeF: 1.7, hipB: -0.3, kneeB: 1.9, dy: 9 }; },
  throw(p) { const q = clamp((p - 0.15) / 0.3, 0, 1); return { shF: lerp(2.9, 0.9, q), elF: 0.2, wpn: lerp(3.0, 1.2, q), lean: lerp(-0.2, 0.3, q), hipF: 0.5, hipB: -0.4 }; },
  throw3(p, t) { const q = clamp(((t + 2) % 6) / 4, 0, 1); return { shF: lerp(2.6, 1.0, q), elF: 0.2, wpn: lerp(2.8, 1.3, q), shB: lerp(1.0, 2.2, q), lean: 0.15, hipF: 0.5, hipB: -0.4 }; },
  guardstance(p, t) { return { lean: 0.1, shF: 0.9, elF: 1.4, shB: 0.6, elB: 1.2, wpn: -0.6, hipF: 0.7, kneeF: 0.7, hipB: -0.6, kneeB: 0.5, dy: 5 + Math.sin(t * 0.3) }; },
  grabhold(p, t) { return { lean: 0.15, shF: 1.45, elF: 0.3, shB: 1.35, elB: 0.4, wpn: 2.6, hipF: 0.4, hipB: -0.4 }; },
  bowrapid(p, t) { const q = ((t + 1) % 4) / 4; return { shF: 1.57, elF: 0, shB: 1.5, elB: lerp(2.8, 0.6, q), lean: -0.05, hipF: 0.45, hipB: -0.4, bowDraw: 1 - q }; },
  dive(p) { return { lean: 0.9, shF: 1.6, elF: 0, wpn: 1.2, shB: 2.4, hipF: 0.2, kneeF: 0.3, hipB: -0.5, kneeB: 0.4 }; },
  pick(p) { return { hipF: 0.9, kneeF: 1.6, hipB: -0.3, kneeB: 1.6, dy: 7, lean: 0.8, shF: 1.1, elF: 0.2 }; },
  jump(p) { return { hipF: 0.9, kneeF: 1.4, hipB: 0.2, kneeB: 1.1, shF: 2.3, elF: 0.3, shB: 1.9, elB: 0.4, lean: 0.1 }; },
  jumpatk(p) { const q = clamp(p * 2.5, 0, 1); return { shF: lerp(2.8, 0.6, q), elF: 0.1, wpn: lerp(3.1, 0.8, q), hipF: 0.9, kneeF: 1.3, hipB: 0.2, kneeB: 1.1, lean: 0.2 }; },
  dash(p) { return { lean: 0.45, shF: 1.45, elF: 0, wpn: 1.55, shB: -0.9, hipF: 0.95, kneeF: 0.6, hipB: -0.9, kneeB: 0.5 }; },
};
function getPose(f) {
  const t = f.t, s = f.state;
  if (s === 'attack' || s === 'special' || s === 'jumpatk' || s === 'dashatk' || s === 'throw' || s === 'grab') {
    const a = f.anim || { k: 'slash', dur: 20 };
    const fn = ANIMS[a.k] || ANIMS.slash;
    return P(fn(Math.min(1, t / a.dur), t));
  }
  switch (s) {
    case 'walk': { const ph = t * 0.22, a = Math.sin(ph) * 0.55; return P({ hipF: a, hipB: -a, kneeF: Math.max(0, -Math.cos(ph)) * 0.6, kneeB: Math.max(0, Math.cos(ph)) * 0.6, shF: 0.3 - a * 0.6, shB: a * 0.6, dy: -Math.abs(Math.sin(ph)) * 1.5 }); }
    case 'run': { const ph = t * 0.36, a = Math.sin(ph) * 0.95; return P({ lean: 0.35, hipF: a + 0.2, hipB: -a + 0.2, kneeF: Math.max(0, -Math.cos(ph)) * 1.2 + 0.2, kneeB: Math.max(0, Math.cos(ph)) * 1.2 + 0.2, shF: 0.4 - a * 0.9, elF: 1.2, shB: a * 0.9, elB: 1.2, dy: -Math.abs(Math.sin(ph)) * 3 }); }
    case 'jump': return P({ hipF: 0.9, kneeF: 1.4, hipB: 0.2, kneeB: 1.1, shF: 2.3, elF: 0.3, shB: 1.9, elB: 0.4, lean: 0.1 });
    case 'land': case 'pick': return P({ hipF: 0.9, kneeF: 1.6, hipB: -0.3, kneeB: 1.6, dy: 7, lean: s === 'pick' ? 0.8 : 0.2, shF: s === 'pick' ? 1.0 : 0.5, elF: 0.2 });
    case 'defend': case 'blockstun': return P({ lean: -0.05, shF: 1.3, elF: 1.7, shB: 1.2, elB: 1.9, wpn: 2.9, hipF: 0.35, kneeF: 0.3, hipB: -0.35, kneeB: 0.3, shieldFront: true });
    case 'roll': return P({ rot: -f.t * 0.6, hipF: 1.3, kneeF: 2.0, hipB: 1.0, kneeB: 2.0, shF: 1.2, elF: 1.4, shB: 1.0, elB: 1.4, lean: 0.8, dy: 8 });
    case 'dizzy': { const sw = Math.sin(t * 0.15) * 0.25; return P({ lean: sw, shF: 0.2 + sw, elF: 0.3, shB: -0.3, elB: 0.3, hipF: 0.2, hipB: -0.2, kneeF: 0.3, kneeB: 0.3, dy: 3 }); }
    case 'grabbed': return P({ lean: -0.3, shF: -0.4 + Math.sin(t * 0.6) * 0.3, elF: 0.8, shB: -0.9, elB: 0.8, hipF: 0.2, hipB: -0.3, kneeB: 0.3 });
    case 'hurt': return P({ lean: -0.35 - (f.hitstun > 20 ? 0.1 : 0), shF: -0.7, elF: 0.8, shB: -1.1, elB: 0.8, hipF: 0.35, hipB: -0.3, kneeB: 0.3 });
    case 'fall': return P({ rot: -Math.min(1.5, 0.35 + t * 0.09), shF: 2.4 + Math.sin(t * 0.5) * 0.4, shB: 2.0, elF: 0.4, hipF: 0.6, kneeF: 0.8, hipB: 0.1, kneeB: 0.6 });
    case 'down': case 'dead': return P({ rot: -Math.PI / 2, lying: true, shF: 2.6, shB: 2.2, elF: 0.2, hipF: 0.2, hipB: -0.1 });
    case 'getup': { const q = Math.min(1, t / 14); return P({ rot: lerp(-Math.PI / 2, 0, q), lying: q < 1, hipF: 0.9, kneeF: 1.5, hipB: -0.3, kneeB: 1.5, dy: 6 }); }
    default: return P({ dy: Math.sin(t * 0.08) * 1.2, shF: 0.35, elF: 0.7, shB: -0.1, elB: 0.7, hipF: 0.2, hipB: -0.2 });
  }
}

// ---------- 武器 ----------
function wpnRot(a) { return Math.PI / 2 - a; }
function drawWeapon(ctx, kind, hx, hy, a, s, look) {
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(wpnRot(a)); ctx.scale(s, s);
  ctx.lineCap = 'round';
  switch (kind) {
    case 'sword': case 'longsword': case 'bonesword': {
      const L = kind === 'longsword' ? 46 : 36;
      ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.strokeStyle = kind === 'bonesword' ? '#bdb7a0' : (look && look.accent) || '#e8d36a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
      ctx.fillStyle = kind === 'bonesword' ? '#e8e2cc' : '#dfe8f2'; ctx.strokeStyle = '#7d8a99'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(1, -3); ctx.lineTo(L, -2); ctx.lineTo(L + 6, 0); ctx.lineTo(L, 2); ctx.lineTo(1, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(3, -0.5); ctx.lineTo(L, -0.5); ctx.stroke();
      break; }
    case 'staff': case 'darkstaff': {
      ctx.strokeStyle = kind === 'staff' ? '#7a4a22' : '#2a2030'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(36, 0); ctx.stroke();
      const c = kind === 'staff' ? '#6ad8ff' : '#c040ff';
      const gr = ctx.createRadialGradient(41, 0, 1, 41, 0, 10); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(41, 0, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(41, 0, 5.5, 0, TAU); ctx.stroke();
      break; }
    case 'hammer': case 'warhammer': {
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(30, 0); ctx.stroke();
      ctx.fillStyle = kind === 'hammer' ? '#c8c8d8' : '#8a8a96'; ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
      ctx.fillRect(26, -12, 14, 24); ctx.strokeRect(26, -12, 14, 24);
      ctx.fillStyle = '#f5c542'; ctx.fillRect(31, -12, 4, 24);
      break; }
    case 'stick': ctx.strokeStyle = '#a0703a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(42, 0); ctx.stroke();
      ctx.strokeStyle = '#7a5020'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, -2); ctx.lineTo(14, 2); ctx.moveTo(26, -2); ctx.lineTo(30, 2); ctx.stroke(); break;
    case 'club': case 'bigclub': {
      const k = kind === 'bigclub' ? 1.5 : 1;
      ctx.fillStyle = '#7a5020'; ctx.beginPath(); ctx.moveTo(-4, -2.5); ctx.lineTo(26 * k, -6 * k); ctx.arc(26 * k, 0, 6 * k, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-4, 2.5); ctx.closePath(); ctx.fill();
      if (k > 1) { ctx.fillStyle = '#ccc'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(20 + i * 8, -6, 2, 0, TAU); ctx.fill(); } }
      break; }
    case 'axe': {
      ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(32, 0); ctx.stroke();
      ctx.fillStyle = '#9aa3ad'; ctx.strokeStyle = '#4a4f55'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(22, 0); ctx.quadraticCurveTo(24, -18, 36, -16); ctx.quadraticCurveTo(30, 0, 36, 16); ctx.quadraticCurveTo(24, 18, 22, 0); ctx.fill(); ctx.stroke();
      break; }
    case 'dagger': {
      ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(1, 0); ctx.stroke();
      ctx.fillStyle = '#e6eef5'; ctx.beginPath(); ctx.moveTo(1, -2.5); ctx.lineTo(16, 0); ctx.lineTo(1, 2.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = (look && look.accent) || '#d8263b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(1, 4); ctx.stroke();
      break; }
  }
  ctx.restore();
}
function drawBow(ctx, hx, hy, bx, by, s, draw) {
  ctx.save(); ctx.lineCap = 'round';
  const r = 22 * s;
  const cx = hx - 10 * s;
  ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.arc(cx, hy, r, -1.1, 1.1); ctx.stroke();
  const tx = cx + Math.cos(-1.1) * r, ty = hy + Math.sin(-1.1) * r, byy = hy + Math.sin(1.1) * r;
  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tx, ty);
  if (draw > 0.1) { ctx.lineTo(bx, by); } ctx.lineTo(tx, byy); ctx.stroke();
  if (draw > 0.1) { ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx + 12 * s, hy); ctx.stroke(); }
  ctx.restore();
}

// ---------- 頭部 ----------
function drawHead(ctx, x, y, r, look, face) {
  const type = look.type;
  ctx.save(); ctx.translate(x, y);
  const eye = look.eyes || '#222';
  const skin = look.skin || '#f0c8a0';
  // 後層
  if (type === 'mage') { ctx.fillStyle = look.hair; ctx.beginPath(); ctx.moveTo(-r * 0.9, -r * 0.2); ctx.quadraticCurveTo(-r * 1.6, r * 1.5, -r * 0.4, r * 1.6); ctx.lineTo(r * 0.2, r * 0.5); ctx.fill(); }
  if (type === 'assassin') { ctx.fillStyle = look.accent; ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.5); ctx.quadraticCurveTo(-r * 2.2, r * 0.6 + Math.sin(face || 0) * 3, -r * 2.6, r * 1.4); ctx.lineTo(-r * 0.4, r * 0.9); ctx.fill(); }
  ctx.fillStyle = type === 'darkmage' ? look.body : skin;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  switch (type) {
    case 'sword':
      ctx.fillStyle = look.hair; ctx.beginPath(); ctx.moveTo(-r, 0);
      for (let i = 0; i < 5; i++) { const a = Math.PI + i * 0.45; ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35 - 1); ctx.lineTo(Math.cos(a + 0.22) * r * 0.9, Math.sin(a + 0.22) * r * 0.9); }
      ctx.lineTo(r, -r * 0.2); ctx.lineTo(r * 0.3, -r * 0.35); ctx.lineTo(-r * 0.2, -r * 0.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = look.accent; ctx.fillRect(-r, -r * 0.45, r * 2, r * 0.28);
      ctx.fillRect(-r * 1.6, -r * 0.45, r * 0.7, r * 0.2);
      break;
    case 'mage':
      ctx.fillStyle = look.body; ctx.beginPath(); ctx.moveTo(-r * 1.5, -r * 0.35); ctx.lineTo(r * 1.5, -r * 0.35); ctx.lineTo(r * 0.2, -r * 1.2); ctx.quadraticCurveTo(-r * 0.4, -r * 2.6, -r * 1.5, -r * 2.2); ctx.quadraticCurveTo(-r * 0.6, -r * 1.8, -r * 0.7, -r * 1.0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = look.accent; ctx.fillRect(-r * 1.0, -r * 0.75, r * 1.9, r * 0.3);
      break;
    case 'archer':
      ctx.fillStyle = look.body; ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 1.05, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(r * 1.1, -r * 0.1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.2); ctx.lineTo(-r * 1.8, r * 0.1); ctx.lineTo(-r * 0.8, r * 0.3); ctx.fill();
      ctx.strokeStyle = '#e44'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.9); ctx.quadraticCurveTo(-r * 1.2, -r * 2.0, -r * 2.0, -r * 1.8); ctx.stroke();
      ctx.fillStyle = look.hair; ctx.fillRect(-r * 0.9, -r * 0.1, r * 0.5, r * 0.7);
      break;
    case 'paladin':
      ctx.fillStyle = '#c9ccd6'; ctx.beginPath(); ctx.arc(0, 0, r * 1.08, Math.PI * 0.8, Math.PI * 2.25); ctx.lineTo(r * 0.3, r * 1.05); ctx.lineTo(-r * 0.9, r * 0.8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a8d99'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#222'; ctx.fillRect(r * 0.15, -r * 0.2, r * 0.95, r * 0.22);
      ctx.fillStyle = look.accent; ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 1.0); ctx.quadraticCurveTo(-r * 0.4, -r * 2.0, -r * 1.6, -r * 1.3); ctx.quadraticCurveTo(-r * 0.9, -r * 0.9, -r * 0.8, -r * 0.6); ctx.fill();
      ctx.fillStyle = eye; ctx.fillRect(r * 0.55, -r * 0.18, r * 0.25, r * 0.14);
      ctx.restore(); return;
    case 'assassin':
      ctx.fillStyle = look.body; ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 1.12, Math.PI * 0.7, Math.PI * 2.1); ctx.lineTo(r * 0.3, -r * 0.1); ctx.lineTo(-r * 0.2, r * 1.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = look.accent; ctx.fillRect(-r * 0.1, r * 0.1, r * 1.1, r * 0.55);
      ctx.fillStyle = look.eyes || '#fff'; ctx.fillRect(r * 0.45, -r * 0.25, r * 0.35, r * 0.14);
      ctx.restore(); return;
    case 'goblin':
      ctx.fillStyle = skin; ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.3); ctx.lineTo(-r * 2.0, -r * 0.9); ctx.lineTo(-r * 0.7, r * 0.2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.8, r * 0.1); ctx.lineTo(r * 1.5, r * 0.35); ctx.lineTo(r * 0.8, r * 0.5); ctx.fill();
      ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.15, r * 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(r * 0.3, r * 0.5, r * 0.2, r * 0.2); ctx.fillRect(r * 0.6, r * 0.5, r * 0.2, r * 0.2);
      ctx.restore(); return;
    case 'skeleton':
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.1, r * 0.28, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.1, -r * 0.1, r * 0.22, 0, TAU); ctx.fill();
      ctx.fillStyle = look.eyes || '#ff5040'; ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.1, r * 0.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(r * (0 + i * 0.22), r * 0.5); ctx.lineTo(r * (0 + i * 0.22), r * 0.85); ctx.stroke(); }
      ctx.restore(); return;
    case 'orc': case 'troll':
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(r * 0.5, r * 0.5); ctx.lineTo(r * 0.6, r * 0.0); ctx.lineTo(r * 0.75, r * 0.5); ctx.fill();
      ctx.fillStyle = look.eyes || '#ffdd00'; ctx.fillRect(r * 0.35, -r * 0.3, r * 0.3, r * 0.18);
      ctx.fillStyle = '#222'; ctx.fillRect(r * 0.1, -r * 0.5, r * 0.7, r * 0.12);
      if (type === 'orc') { ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.95, r * 0.35, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = shade(skin, -0.2); ctx.beginPath(); ctx.arc(r * 0.95, r * 0.1, r * 0.3, 0, TAU); ctx.fill(); }
      ctx.restore(); return;
    case 'darkmage':
      ctx.fillStyle = shade(look.body, -0.3); ctx.beginPath(); ctx.arc(0, 0, r * 1.15, Math.PI * 0.6, Math.PI * 2.15); ctx.quadraticCurveTo(-r * 1.2, -r * 2.2, -r * 1.3, r * 0.5); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(r * 0.35, r * 0.05, r * 0.7, 0, TAU); ctx.fill();
      ctx.fillStyle = look.eyes || '#e050ff'; ctx.fillRect(r * 0.25, -r * 0.15, r * 0.22, r * 0.14); ctx.fillRect(r * 0.62, -r * 0.15, r * 0.22, r * 0.14);
      ctx.restore(); return;
  }
  ctx.fillStyle = eye; ctx.fillRect(r * 0.45, -r * 0.15, r * 0.22, r * 0.3);
  ctx.restore();
}

// ---------- 人形角色 ----------
function drawHumanoid(ctx, f, pose, look, s) {
  const legU = 13 * s, legL = 13 * s, torso = 22 * s, armU = 10.5 * s, armL = 10.5 * s, headR = 9 * s;
  const hip = { x: 0, y: -(legU + legL) + pose.dy * s };
  const neck = { x: hip.x + Math.sin(pose.lean) * torso, y: hip.y - Math.cos(pose.lean) * torso };
  const head = { x: neck.x + Math.sin(pose.lean) * headR * 1.1, y: neck.y - Math.cos(pose.lean) * headR * 1.1 };
  const sh = { x: lerp(hip.x, neck.x, 0.88), y: lerp(hip.y, neck.y, 0.88) };
  const leg = (a, k) => { const kn = { x: hip.x + Math.sin(a) * legU, y: hip.y + Math.cos(a) * legU }; const ft = { x: kn.x + Math.sin(a - k) * legL, y: kn.y + Math.cos(a - k) * legL }; return [kn, ft]; };
  const arm = (a, e) => { const el = { x: sh.x + Math.sin(a) * armU, y: sh.y + Math.cos(a) * armU }; const hd = { x: el.x + Math.sin(a + e) * armL, y: el.y + Math.cos(a + e) * armL }; return [el, hd]; };
  const [kF, fF] = leg(pose.hipF, pose.kneeF), [kB, fB] = leg(pose.hipB, pose.kneeB);
  const [eF, hF] = arm(pose.shF, pose.elF), [eB, hB] = arm(pose.shB, pose.elB);
  const skin = look.skin || '#f0c8a0';
  const type = look.type;
  const bone = type === 'skeleton';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const limb = (a, b, c, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke(); };
  const sleeve = bone ? skin : look.body, pant = bone ? skin : look.pants;
  const armW = (bone ? 2.5 : 4.5) * s * (type === 'orc' || type === 'troll' ? 1.4 : 1);
  const legW = (bone ? 3 : 5.5) * s * (type === 'orc' || type === 'troll' ? 1.3 : 1);
  const wkind = f.held && ITEMS[f.held.type].cat === 'melee' ? f.held.type : look.weapon;
  // 披風（聖騎士）
  if (type === 'paladin') { ctx.fillStyle = f.isBoss ? shade(look.accent, -0.3) : '#b8262e'; ctx.beginPath(); ctx.moveTo(sh.x - 3 * s, sh.y); ctx.quadraticCurveTo(sh.x - 16 * s, hip.y + 5 * s, sh.x - 14 * s - Math.sin(f.t * 0.1) * 2, -3 * s); ctx.lineTo(hip.x - 2 * s, -6 * s); ctx.closePath(); ctx.fill(); }
  // 後手
  limb(sh, eB, hB, shade(sleeve, -0.25), armW);
  ctx.fillStyle = shade(skin, -0.15); ctx.beginPath(); ctx.arc(hB.x, hB.y, 2.6 * s, 0, TAU); ctx.fill();
  if (type === 'paladin' && !pose.shieldFront) drawShield(ctx, hB.x, hB.y, s, look, 0.85);
  if (wkind === 'daggers') drawWeapon(ctx, 'dagger', hB.x, hB.y, pose.shB + pose.elB + 1.2, s, look);
  // 後腳
  limb(hip, kB, fB, shade(pant, -0.25), legW);
  foot(ctx, fB, s, shade(type === 'wolf' ? '#555' : bone ? skin : '#3a2a1a', -0.2));
  // 身體
  if (type === 'mage' || type === 'darkmage') {
    ctx.fillStyle = look.body; ctx.beginPath();
    ctx.moveTo(sh.x - 5 * s, sh.y); ctx.lineTo(sh.x + 5 * s, sh.y);
    ctx.lineTo(Math.max(fF.x, hip.x + 9 * s) + 2 * s, -4 * s); ctx.lineTo(Math.min(fB.x, hip.x - 9 * s) - 2 * s, -4 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = look.accent || '#222'; ctx.fillRect(hip.x - 7 * s, hip.y - 1 * s, 14 * s, 3 * s);
    ctx.fillRect(Math.min(fB.x, hip.x - 9 * s) - 2 * s, -6 * s, (Math.max(fF.x, hip.x + 9 * s) - Math.min(fB.x, hip.x - 9 * s) + 4 * s), 2.5 * s);
  } else {
    ctx.strokeStyle = bone ? skin : look.body; ctx.lineWidth = (bone ? 4 : 12) * s * (type === 'orc' || type === 'troll' ? 1.4 : 1);
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(neck.x, neck.y + 2 * s); ctx.stroke();
    if (bone) { ctx.strokeStyle = skin; ctx.lineWidth = 2 * s; for (let i = 0; i < 3; i++) { const q = 0.45 + i * 0.16; const cx = lerp(hip.x, neck.x, q), cy = lerp(hip.y, neck.y, q); ctx.beginPath(); ctx.moveTo(cx - 6 * s, cy); ctx.lineTo(cx + 6 * s, cy); ctx.stroke(); } }
    else {
      ctx.strokeStyle = look.accent || '#333'; ctx.lineWidth = 3 * s; const bx = lerp(hip.x, neck.x, 0.12), by = lerp(hip.y, neck.y, 0.12);
      ctx.beginPath(); ctx.moveTo(bx - 6 * s, by); ctx.lineTo(bx + 6 * s, by); ctx.stroke();
      if (type === 'paladin') { const cx = lerp(hip.x, neck.x, 0.55), cy = lerp(hip.y, neck.y, 0.55); ctx.strokeStyle = look.accent; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(cx, cy - 6 * s); ctx.lineTo(cx, cy + 6 * s); ctx.moveTo(cx - 4 * s, cy - 2 * s); ctx.lineTo(cx + 4 * s, cy - 2 * s); ctx.stroke(); }
      if (type === 'archer') { ctx.fillStyle = '#6b4a2a'; ctx.save(); ctx.translate(lerp(hip.x, neck.x, 0.6) - 6 * s, lerp(hip.y, neck.y, 0.6)); ctx.rotate(-0.5); ctx.fillRect(-3 * s, -8 * s, 6 * s, 16 * s); ctx.fillStyle = '#eee'; ctx.fillRect(-2 * s, -12 * s, 1.5 * s, 4 * s); ctx.fillRect(0.5 * s, -12 * s, 1.5 * s, 4 * s); ctx.restore(); }
    }
  }
  // 前腳
  if (type !== 'mage' && type !== 'darkmage') { limb(hip, kF, fF, pant, legW); }
  foot(ctx, fF, s, bone ? skin : '#3a2a1a');
  // 頭
  drawHead(ctx, head.x, head.y, headR * (type === 'goblin' ? 1.2 : type === 'troll' ? 0.9 : 1), look, f.t * 0.2);
  // 武器（前手）
  const wA = pose.wpn != null ? pose.wpn : pose.shF + pose.elF + 1.1;
  if (f.held && ITEMS[f.held.type].cat === 'throw') drawItemIcon(ctx, f.held.type, hF.x, hF.y - 3 * s, 0.8 * s, 0);
  else if (wkind === 'bow') drawBow(ctx, hF.x, hF.y, hB.x, hB.y, s, pose.bowDraw || 0);
  else if (wkind === 'daggers') drawWeapon(ctx, 'dagger', hF.x, hF.y, wA, s, look);
  else if (wkind) drawWeapon(ctx, wkind, hF.x, hF.y, wA, s, look);
  // 前手
  limb(sh, eF, hF, sleeve, armW);
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hF.x, hF.y, 2.8 * s, 0, TAU); ctx.fill();
  if (type === 'paladin' && pose.shieldFront) drawShield(ctx, hB.x + 4 * s, hB.y, s, look, 1);
}
function foot(ctx, p, s, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(p.x + 2 * s, p.y, 4 * s, 2.4 * s, 0, 0, TAU); ctx.fill(); }
function drawShield(ctx, x, y, s, look, k) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * k, s * k);
  ctx.fillStyle = '#d8dce6'; ctx.strokeStyle = look.accent; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, -14); ctx.lineTo(8, 2); ctx.quadraticCurveTo(8, 12, 0, 17); ctx.quadraticCurveTo(-8, 12, -8, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = look.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.moveTo(-5, -3); ctx.lineTo(5, -3); ctx.stroke();
  ctx.restore();
}

// ---------- 狼 ----------
function drawWolf(ctx, f, look, s) {
  const st = f.state; const t = f.t;
  let ph = st === 'walk' ? t * 0.3 : st === 'run' ? t * 0.45 : 0;
  let lean = 0, lying = st === 'down' || st === 'dead' || st === 'fall';
  const body = look.body, dark = look.pants;
  ctx.save(); ctx.scale(s, s);
  if (lying) { ctx.translate(0, -6); ctx.rotate(st === 'fall' ? -0.6 : -0.15); }
  if (st === 'attack' || st === 'special') { lean = -0.25; ph = t * 0.5; }
  if (st === 'hurt') lean = 0.25;
  ctx.rotate(lean);
  const legs = [[14, 0], [8, Math.PI], [-12, Math.PI * 0.5], [-18, Math.PI * 1.5]];
  ctx.strokeStyle = dark; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (const [lx, o] of legs) { const a = lying ? 1.2 : Math.sin(ph + o) * 0.6; ctx.beginPath(); ctx.moveTo(lx, -18); ctx.lineTo(lx + Math.sin(a) * 8, -10); ctx.lineTo(lx + Math.sin(a) * 10, -1); ctx.stroke(); }
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(-2, -22, 22, 9, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-22, -24); ctx.quadraticCurveTo(-36, -30 + Math.sin(t * 0.2) * 4, -38, -18); ctx.quadraticCurveTo(-30, -22, -22, -18); ctx.fill();
  ctx.save(); ctx.translate(20, -28);
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 8, 0, 0, TAU); ctx.fill();
  const open = (st === 'attack' || st === 'special') ? 4 : 0;
  ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(18, 1 - open * 0.3); ctx.lineTo(6, 4); ctx.fill();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(6, 4 + open * 0.2); ctx.lineTo(16, 4 + open); ctx.lineTo(4, 7); ctx.fill();
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(-2, -15); ctx.lineTo(2, -6); ctx.fill();
  ctx.fillStyle = look.eyes || '#ffcc00'; ctx.fillRect(5, -3, 3, 2);
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(18, 1, 1.8, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ---------- 角色總繪製 ----------
function drawFighter(ctx, f, camX, frame) {
  const sx = Math.round(f.x - camX), sy = Math.round(f.y);
  // 影子
  const sh = Math.max(0.35, 1 - f.z / 200);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, 20 * f.scale * sh, 6 * f.scale * sh, 0, 0, TAU); ctx.fill();
  if (f.hidden) return;
  if (f.invuln > 0 && (f.state === 'idle' || f.state === 'walk') && frame % 6 < 3) ctx.globalAlpha = 0.45;
  if (f.stealth > 0) ctx.globalAlpha = f.team === 0 ? 0.35 : 0.18;
  if (f.isClone) ctx.globalAlpha = 0.62 + Math.sin(frame * 0.2) * 0.1;
  if (f.state === 'dead' && f.t > 40) ctx.globalAlpha = Math.max(0, 1 - (f.t - 40) / 40) * (frame % 4 < 2 ? 1 : 0.5);
  ctx.save();
  ctx.translate(sx, sy - f.z);
  // 頭目光環
  if (f.isBoss && f.state !== 'dead') {
    const r = 46 * f.scale;
    const g = ctx.createRadialGradient(0, -34 * f.scale, 4, 0, -34 * f.scale, r);
    g.addColorStop(0, f.strong ? 'rgba(255,40,60,0.35)' : 'rgba(170,80,255,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -34 * f.scale, r * (1 + Math.sin(frame * 0.1) * 0.06), 0, TAU); ctx.fill();
  }
  const pose = getPose(f);
  ctx.scale(f.face * (pose.squash < 0 ? -1 : 1) * Math.max(0.35, Math.abs(pose.squash)), 1);
  if (pose.lying) { ctx.translate(18 * f.scale, -5); ctx.rotate(pose.rot); }
  else if (pose.rot) { ctx.translate(0, -26 * f.scale); ctx.rotate(pose.rot); ctx.translate(0, 26 * f.scale); }
  if (f.flash > 0 && f.flash % 4 < 2) ctx.filter = 'brightness(2.2)';
  if (f.look.type === 'wolf') drawWolf(ctx, f, f.look, f.scale);
  else drawHumanoid(ctx, f, pose, f.look, f.scale);
  ctx.filter = 'none';
  ctx.restore();
  ctx.globalAlpha = 1;
  if (f.buffs && f.buffs.shield > 0) {
    const r = 44 * f.scale, cy = sy - f.z - 32 * f.scale;
    const gr = ctx.createRadialGradient(sx, cy, r * 0.5, sx, cy, r); gr.addColorStop(0, 'rgba(120,200,255,0.05)'); gr.addColorStop(1, 'rgba(140,210,255,0.4)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(200,240,255,${0.5 + Math.sin(frame * 0.2) * 0.3})`; ctx.lineWidth = 2; ctx.stroke();
  }
  if (f.state === 'dizzy' || f.state === 'grabbed') {
    const hy = sy - f.z - 72 * f.scale;
    for (let i = 0; i < 3; i++) { const a = frame * 0.12 + i * TAU / 3; ctx.fillStyle = f.state === 'dizzy' ? '#ffe040' : '#fff'; drawStar(ctx, sx + Math.cos(a) * 16, hy + Math.sin(a) * 5, 4.5); }
  }
  // 冰凍
  if (f.status.frozen > 0) {
    ctx.fillStyle = 'rgba(160,220,255,0.45)'; ctx.strokeStyle = 'rgba(230,250,255,0.9)'; ctx.lineWidth = 2;
    const hh = 70 * f.scale, ww = 38 * f.scale;
    ctx.beginPath(); ctx.moveTo(sx - ww / 2, sy - f.z); ctx.lineTo(sx - ww / 2 - 4, sy - f.z - hh * 0.6); ctx.lineTo(sx - ww / 4, sy - f.z - hh); ctx.lineTo(sx + ww / 3, sy - f.z - hh * 0.95); ctx.lineTo(sx + ww / 2 + 3, sy - f.z - hh * 0.5); ctx.lineTo(sx + ww / 2, sy - f.z); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (f.status.poison > 0 && frame % 10 === 0) addParticle({ type: 'bubble', x: f.x + (Math.random() - 0.5) * 20, y: f.y, z: f.z + 50 * f.scale, vz: 0.8, life: 30, color: '#7cff4a' });
  if (f.status.burn > 0 && frame % 4 === 0) addParticle({ type: 'flame', x: f.x + (Math.random() - 0.5) * 24, y: f.y + 1, z: f.z + Math.random() * 50 * f.scale, vz: 1.2, life: 20 });
}

function drawStar(ctx, x, y, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
// ---------- 道具圖示 ----------
function drawItemIcon(ctx, type, x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(s, s); ctx.lineCap = 'round';
  switch (type) {
    case 'knife': ctx.fillStyle = '#e6eef5'; ctx.beginPath(); ctx.moveTo(-2, -2.5); ctx.lineTo(12, 0); ctx.lineTo(-2, 2.5); ctx.fill(); ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-2, 0); ctx.stroke(); break;
    case 'firebomb': ctx.fillStyle = '#a8e0ff'; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(0, 2, 7, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.arc(0, 4, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#8a6a4a'; ctx.fillRect(-2.5, -9, 5, 5); ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(4, -14, 0, -17); ctx.quadraticCurveTo(-3, -13, 0, -9); ctx.fill(); break;
    case 'rock': ctx.fillStyle = '#8d8578'; ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(-6, -5); ctx.lineTo(2, -8); ctx.lineTo(8, -3); ctx.lineTo(7, 5); ctx.lineTo(-2, 7); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#b0a898'; ctx.beginPath(); ctx.arc(-1, -3, 2.5, 0, TAU); ctx.fill(); break;
    case 'longsword': drawWeapon(ctx, 'longsword', -20, 0, Math.PI / 2, 0.8, null); break;
    case 'hammer': drawWeapon(ctx, 'warhammer', -16, 0, Math.PI / 2, 0.85, null); break;
    case 'stick': drawWeapon(ctx, 'stick', -16, 0, Math.PI / 2, 0.75, null); break;
    case 'potion': ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(0, 3, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd0d8'; ctx.fillRect(-2.5, -8, 5, 6); ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-3, -10, 6, 3); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(-2.5, 1, 2, 0, TAU); ctx.fill(); break;
    case 'bread': ctx.fillStyle = '#d9a55a'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 6, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#a0703a'; ctx.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 5 - 2, -4); ctx.lineTo(i * 5 + 2, 2); ctx.stroke(); } break;
    case 'crystal': ctx.fillStyle = '#4dc3ff'; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, -2); ctx.lineTo(0, 9); ctx.lineTo(-7, -2); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#c8f0ff'; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(2, -2); ctx.lineTo(0, 9); ctx.lineTo(-7, -2); ctx.closePath(); ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1; break;
  }
  ctx.restore();
}
function drawCrate(ctx, c, camX) {
  const x = c.x - camX, y = c.y;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, 24, 7, 0, 0, TAU); ctx.fill();
  const sh = c.shake > 0 ? (Math.random() - 0.5) * 4 : 0;
  ctx.save(); ctx.translate(x + sh, y);
  ctx.fillStyle = '#a0703a'; ctx.fillRect(-20, -38, 40, 38);
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 3; ctx.strokeRect(-20, -38, 40, 38);
  ctx.beginPath(); ctx.moveTo(-20, -38); ctx.lineTo(20, 0); ctx.moveTo(20, -38); ctx.lineTo(-20, 0); ctx.stroke();
  ctx.fillStyle = '#c89050'; ctx.fillRect(-20, -38, 40, 4);
  ctx.restore();
}

// ---------- 背景 ----------
const THEMES = {
  forest: { sky: ['#6ec6ff', '#d8f3ff'], far: 'hills', farC: '#5a9a6a', mid: 'trees', midC: '#2f6b3a', ground: ['#5c8a3a', '#3f6428'], line: 'rgba(0,0,0,0.12)', fx: 'leaves' },
  cave: { sky: ['#1a1420', '#2e2438'], far: 'cavewall', farC: '#3a3040', mid: 'stalag', midC: '#4a3e52', ground: ['#4a4048', '#2e282e'], line: 'rgba(255,255,255,0.06)', fx: 'drip', dark: true },
  castle: { sky: ['#3a3f5c', '#7a7f9c'], far: 'castlewall', farC: '#5a5a6a', mid: 'pillars', midC: '#6a6a7a', ground: ['#707078', '#4a4a52'], line: 'rgba(0,0,0,0.2)', fx: null },
  desert: { sky: ['#ffb45a', '#ffe8b0'], far: 'dunes', farC: '#e8b870', mid: 'cacti', midC: '#5a8a3a', ground: ['#e0b070', '#c08a4a'], line: 'rgba(120,60,0,0.15)', fx: 'dust' },
  snow: { sky: ['#9ab8d8', '#e8f2ff'], far: 'peaks', farC: '#8aa0b8', mid: 'pines', midC: '#2a5a4a', ground: ['#f0f6ff', '#c8d8ea'], line: 'rgba(80,120,160,0.2)', fx: 'snow' },
  volcano: { sky: ['#2a0a0a', '#8a2a10'], far: 'volcano', farC: '#3a1a14', mid: 'lavarocks', midC: '#2a1410', ground: ['#4a2a20', '#2a1410'], line: 'rgba(255,100,0,0.25)', fx: 'embers' },
  swamp: { sky: ['#3a4a3a', '#7a8a6a'], far: 'hills', farC: '#3a4a34', mid: 'deadtrees', midC: '#2a2a20', ground: ['#4a5a34', '#2e3a20'], line: 'rgba(0,0,0,0.2)', fx: 'bubbles' },
  sky: { sky: ['#8ad0ff', '#fff4d8'], far: 'clouds', farC: '#ffffff', mid: 'columns', midC: '#f0e8d0', ground: ['#e8e0c8', '#c8bca0'], line: 'rgba(160,130,60,0.25)', fx: 'sparkle' },
  underworld: { sky: ['#0a0014', '#2a0a3a'], far: 'spires', farC: '#1a0a2a', mid: 'graves', midC: '#3a3048', ground: ['#2a2034', '#140e1c'], line: 'rgba(160,80,255,0.18)', fx: 'souls', dark: true },
  demon: { sky: ['#1a0008', '#5a0a1a'], far: 'demoncastle', farC: '#140008', mid: 'torches', midC: '#3a2028', ground: ['#3a2a30', '#1a1018'], line: 'rgba(255,40,60,0.2)', fx: 'embers', dark: true },
};
function drawBackground(ctx, theme, camX, frame) {
  const T = THEMES[theme] || THEMES.forest;
  let g = ctx.createLinearGradient(0, 0, 0, GROUND_TOP);
  g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_TOP);
  // 遠景
  drawFar(ctx, T, camX * 0.2, frame);
  drawMid(ctx, T, camX * 0.5, frame);
  // 地面
  g = ctx.createLinearGradient(0, GROUND_TOP - 20, 0, H);
  g.addColorStop(0, T.ground[0]); g.addColorStop(1, T.ground[1]);
  ctx.fillStyle = g; ctx.fillRect(0, GROUND_TOP - 22, W, H - GROUND_TOP + 22);
  ctx.strokeStyle = T.line; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) { const y = GROUND_TOP - 10 + i * i * 9 + i * 10; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const sp = 120, off = -(camX % sp);
  for (let x = off - sp; x < W + sp * 2; x += sp) { ctx.beginPath(); ctx.moveTo(x, GROUND_TOP - 20); ctx.lineTo(x + (x - W / 2) * 0.35, H); ctx.stroke(); }
  // 地面點綴
  for (let k = -1; k < 12; k++) {
    const idx = Math.floor(camX / 90) + k; const x = idx * 90 - camX + hash(idx) * 60;
    const y = GROUND_TOP + hash(idx + 7) * (H - GROUND_TOP - 10);
    ctx.fillStyle = T.line; ctx.beginPath(); ctx.ellipse(x, y, 6 + hash(idx + 3) * 10, 2 + hash(idx + 5) * 2, 0, 0, TAU); ctx.fill();
  }
}
function drawFar(ctx, T, cx, frame) {
  ctx.fillStyle = T.farC;
  const base = GROUND_TOP - 20;
  switch (T.far) {
    case 'hills': ctx.beginPath(); ctx.moveTo(0, base); for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base - 70 - Math.sin((x + cx) * 0.006) * 40 - Math.sin((x + cx) * 0.017) * 18); ctx.lineTo(W, base); ctx.fill(); break;
    case 'dunes': ctx.beginPath(); ctx.moveTo(0, base); for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base - 50 - Math.sin((x + cx) * 0.005) * 30); ctx.lineTo(W, base); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.beginPath(); ctx.arc(760, 80, 36, 0, TAU); ctx.fill(); break;
    case 'mountains': case 'peaks': case 'volcano': case 'spires': {
      const sp = T.far === 'spires' ? 110 : 220;
      for (let k = -1; k < W / sp + 2; k++) {
        const idx = Math.floor(cx / sp) + k, x = idx * sp - cx, hgt = (T.far === 'spires' ? 140 : 120) + hash(idx) * 90, wd = T.far === 'spires' ? 30 : 150;
        ctx.fillStyle = T.farC; ctx.beginPath(); ctx.moveTo(x - wd, base); ctx.lineTo(x, base - hgt); ctx.lineTo(x + wd, base); ctx.fill();
        if (T.far === 'peaks') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - wd * 0.3, base - hgt * 0.7); ctx.lineTo(x, base - hgt); ctx.lineTo(x + wd * 0.3, base - hgt * 0.7); ctx.lineTo(x + wd * 0.1, base - hgt * 0.75); ctx.lineTo(x - wd * 0.1, base - hgt * 0.68); ctx.fill(); }
        if (T.far === 'spires') { ctx.fillStyle = 'rgba(200,80,255,0.6)'; ctx.fillRect(x - 3, base - hgt * 0.6, 6, 6); }
      }
      if (T.far === 'volcano') {
        const vx = 600 - (cx * 0.3) % 1400; ctx.fillStyle = '#2a0e0a'; ctx.beginPath(); ctx.moveTo(vx - 260, base); ctx.lineTo(vx - 50, base - 200); ctx.lineTo(vx + 50, base - 200); ctx.lineTo(vx + 260, base); ctx.fill();
        const gl = ctx.createRadialGradient(vx, base - 205, 5, vx, base - 205, 90); gl.addColorStop(0, 'rgba(255,160,40,0.9)'); gl.addColorStop(1, 'rgba(255,60,0,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(vx, base - 205, 90, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ff6a1a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(vx - 20, base - 198); ctx.lineTo(vx - 60, base - 120); ctx.lineTo(vx - 50, base - 60); ctx.stroke();
      }
      break; }
    case 'cavewall': ctx.fillRect(0, 0, W, base);
      for (let k = -1; k < W / 70 + 2; k++) { const idx = Math.floor(cx / 70) + k, x = idx * 70 - cx; ctx.fillStyle = '#241c2a'; ctx.beginPath(); ctx.moveTo(x - 25, 0); ctx.lineTo(x, 50 + hash(idx) * 80); ctx.lineTo(x + 25, 0); ctx.fill();
        if (hash(idx + 9) > 0.7) { ctx.fillStyle = 'rgba(120,220,255,0.7)'; ctx.beginPath(); ctx.arc(x + 10, 150 + hash(idx + 4) * 100, 4, 0, TAU); ctx.fill(); } }
      break;
    case 'castlewall': case 'demoncastle': {
      ctx.fillStyle = T.farC; ctx.fillRect(0, base - 170, W, 170);
      for (let k = -1; k < W / 40 + 2; k++) { const idx = Math.floor(cx / 40) + k, x = idx * 40 - cx; if (idx % 2 === 0) ctx.fillRect(x, base - 195, 22, 26); }
      for (let k = -1; k < W / 160 + 2; k++) { const idx = Math.floor(cx / 160) + k, x = idx * 160 - cx + 60;
        ctx.fillStyle = T.far === 'demoncastle' ? '#ff3040' : '#ffd070'; ctx.globalAlpha = 0.6 + Math.sin(frame * 0.05 + idx) * 0.2; ctx.fillRect(x, base - 130, 16, 30); ctx.globalAlpha = 1; ctx.fillStyle = T.farC; }
      if (T.far === 'demoncastle') { ctx.fillStyle = '#0a0004'; const tx = 480 - (cx * 0.3) % 1600; ctx.fillRect(tx - 40, 20, 80, base - 190); ctx.beginPath(); ctx.moveTo(tx - 55, 30); ctx.lineTo(tx, -40); ctx.lineTo(tx + 55, 30); ctx.fill(); ctx.fillStyle = '#ff2030'; ctx.beginPath(); ctx.arc(tx, 70, 8, 0, TAU); ctx.fill(); }
      break; }
    case 'clouds': for (let k = -1; k < W / 200 + 2; k++) { const idx = Math.floor(cx / 200) + k, x = idx * 200 - cx, y = 60 + hash(idx) * 140;
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(x, y, 60, 18, 0, 0, TAU); ctx.ellipse(x + 30, y - 10, 35, 16, 0, 0, TAU); ctx.fill();
        if (hash(idx + 2) > 0.6) { ctx.fillStyle = '#c8b890'; ctx.beginPath(); ctx.moveTo(x - 40, y + 10); ctx.lineTo(x + 40, y + 10); ctx.lineTo(x, y + 50); ctx.fill(); ctx.fillStyle = '#e8e0c8'; ctx.fillRect(x - 12, y - 30, 24, 32); } }
      break;
  }
}
function drawMid(ctx, T, cx, frame) {
  const base = GROUND_TOP - 18;
  const sp = { trees: 130, stalag: 110, pillars: 200, cacti: 240, pines: 110, lavarocks: 170, deadtrees: 170, columns: 190, graves: 120, torches: 220 }[T.mid] || 150;
  for (let k = -1; k < W / sp + 2; k++) {
    const idx = Math.floor(cx / sp) + k, x = idx * sp - cx + hash(idx) * 40, r = hash(idx + 1);
    ctx.fillStyle = T.midC; ctx.strokeStyle = T.midC;
    switch (T.mid) {
      case 'trees': ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x - 6, base - 70, 12, 70); ctx.fillStyle = r > 0.5 ? T.midC : shade(T.midC, 0.15); ctx.beginPath(); ctx.arc(x, base - 90 - r * 20, 38 + r * 14, 0, TAU); ctx.arc(x - 26, base - 70, 26, 0, TAU); ctx.arc(x + 26, base - 72, 26, 0, TAU); ctx.fill(); break;
      case 'stalag': ctx.beginPath(); ctx.moveTo(x - 20, base); ctx.lineTo(x, base - 60 - r * 60); ctx.lineTo(x + 20, base); ctx.fill(); break;
      case 'pillars': ctx.fillRect(x - 18, base - 220, 36, 220); ctx.fillStyle = shade(T.midC, -0.2); ctx.fillRect(x - 24, base - 226, 48, 12);
        ctx.fillStyle = r > 0.5 ? '#8a1a2a' : '#1a3a8a'; ctx.beginPath(); ctx.moveTo(x - 14, base - 200); ctx.lineTo(x + 14, base - 200); ctx.lineTo(x + 14, base - 120); ctx.lineTo(x, base - 132); ctx.lineTo(x - 14, base - 120); ctx.fill(); break;
      case 'cacti': ctx.lineCap = 'round'; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - 70 - r * 30); ctx.moveTo(x, base - 40); ctx.lineTo(x - 20, base - 40); ctx.lineTo(x - 20, base - 65); ctx.moveTo(x, base - 50); ctx.lineTo(x + 18, base - 50); ctx.lineTo(x + 18, base - 80); ctx.stroke(); break;
      case 'pines': for (let i = 0; i < 3; i++) { ctx.fillStyle = T.midC; ctx.beginPath(); ctx.moveTo(x - 34 + i * 7, base - 20 - i * 30); ctx.lineTo(x, base - 70 - i * 30 - r * 10); ctx.lineTo(x + 34 - i * 7, base - 20 - i * 30); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 10, base - 60 - i * 30); ctx.lineTo(x, base - 70 - i * 30 - r * 10); ctx.lineTo(x + 10, base - 60 - i * 30); ctx.fill(); } break;
      case 'lavarocks': ctx.beginPath(); ctx.moveTo(x - 40, base); ctx.lineTo(x - 20, base - 40 - r * 30); ctx.lineTo(x + 15, base - 30 - r * 20); ctx.lineTo(x + 40, base); ctx.fill(); ctx.strokeStyle = '#ff5a10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 20, base - 30); ctx.lineTo(x - 5, base - 10); ctx.lineTo(x + 10, base - 20); ctx.stroke(); break;
      case 'deadtrees': ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + 5, base - 90); ctx.moveTo(x + 3, base - 55); ctx.lineTo(x - 25, base - 85); ctx.moveTo(x + 5, base - 75); ctx.lineTo(x + 30, base - 100); ctx.stroke(); ctx.fillStyle = 'rgba(160,200,120,0.25)'; ctx.beginPath(); ctx.ellipse(x, base + 4, 50, 8, 0, 0, TAU); ctx.fill(); break;
      case 'columns': ctx.fillStyle = T.midC; ctx.fillRect(x - 16, base - 200, 32, 200); ctx.fillStyle = shade(T.midC, -0.15); for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * 9 - 1, base - 195, 2, 190); ctx.fillStyle = '#d4af37'; ctx.fillRect(x - 22, base - 206, 44, 10); ctx.fillRect(x - 22, base - 8, 44, 8); break;
      case 'graves': ctx.fillStyle = T.midC; ctx.beginPath(); ctx.moveTo(x - 14, base); ctx.lineTo(x - 14, base - 34); ctx.arc(x, base - 34, 14, Math.PI, 0); ctx.lineTo(x + 14, base); ctx.fill(); ctx.fillStyle = '#1a1422'; ctx.fillRect(x - 2, base - 40, 4, 20); ctx.fillRect(x - 7, base - 34, 14, 4);
        if (r > 0.6) { ctx.fillStyle = 'rgba(180,120,255,' + (0.3 + Math.sin(frame * 0.08 + idx) * 0.2) + ')'; ctx.beginPath(); ctx.arc(x + 20, base - 60 - Math.sin(frame * 0.05 + idx) * 10, 6, 0, TAU); ctx.fill(); } break;
      case 'torches': ctx.fillStyle = '#2a1a1a'; ctx.fillRect(x - 4, base - 110, 8, 110); ctx.fillStyle = '#5a3a2a'; ctx.fillRect(x - 10, base - 116, 20, 8);
        for (let i = 0; i < 3; i++) { ctx.fillStyle = i === 0 ? 'rgba(255,60,20,0.7)' : i === 1 ? 'rgba(255,160,40,0.8)' : 'rgba(255,240,160,0.9)'; const fl = Math.sin(frame * 0.3 + idx + i) * 3; ctx.beginPath(); ctx.ellipse(x, base - 126 - i * 3 + fl * 0.3, 10 - i * 3, 16 - i * 4 + fl, 0, 0, TAU); ctx.fill(); } break;
    }
  }
}
// 天氣／氣氛粒子（螢幕座標）
function drawAmbient(ctx, theme, frame, camX) {
  const T = THEMES[theme]; if (!T || !T.fx) return;
  for (let i = 0; i < 40; i++) {
    const r1 = hash(i), r2 = hash(i + 50), sp = 0.3 + r2;
    let x, y;
    switch (T.fx) {
      case 'snow': x = ((r1 * W * 1.5 - camX * 0.8 + Math.sin(frame * 0.02 + i) * 20) % W + W) % W; y = (r2 * H + frame * sp * 1.2) % H; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(x, y, 1.5 + r2 * 2, 0, TAU); ctx.fill(); break;
      case 'embers': x = ((r1 * W * 1.5 - camX * 0.6 + Math.sin(frame * 0.03 + i) * 15) % W + W) % W; y = H - ((r2 * H + frame * sp) % H); ctx.fillStyle = i % 3 ? 'rgba(255,140,40,0.8)' : 'rgba(255,220,120,0.8)'; ctx.fillRect(x, y, 2 + r2 * 2, 2 + r2 * 2); break;
      case 'leaves': if (i > 14) break; x = ((r1 * W * 1.5 - camX * 0.7 - frame * sp * 0.6) % W + W) % W; y = (r2 * H * 0.8 + frame * sp * 0.5 + Math.sin(frame * 0.05 + i) * 20) % (H * 0.8); ctx.fillStyle = i % 2 ? '#8ac24a' : '#e0a030'; ctx.beginPath(); ctx.ellipse(x, y, 4, 2, frame * 0.05 + i, 0, TAU); ctx.fill(); break;
      case 'dust': if (i > 20) break; x = ((r1 * W * 1.5 - camX * 0.7 - frame * sp * 2) % W + W) % W; y = 250 + r2 * 280; ctx.fillStyle = 'rgba(255,230,180,0.35)'; ctx.fillRect(x, y, 8 + r2 * 10, 1.5); break;
      case 'bubbles': if (i > 18) break; x = ((r1 * W * 1.5 - camX) % W + W) % W; y = H - ((r2 * 220 + frame * sp * 0.6) % 220); ctx.strokeStyle = 'rgba(180,230,120,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 2 + r2 * 4, 0, TAU); ctx.stroke(); break;
      case 'souls': if (i > 16) break; x = ((r1 * W * 1.5 - camX * 0.5 + Math.sin(frame * 0.02 + i) * 30) % W + W) % W; y = H - ((r2 * H + frame * sp * 0.7) % H); ctx.fillStyle = 'rgba(190,140,255,0.4)'; ctx.beginPath(); ctx.arc(x, y, 3 + r2 * 3, 0, TAU); ctx.fill(); break;
      case 'sparkle': if (i > 20) break; x = ((r1 * W * 1.5 - camX * 0.4) % W + W) % W; y = r2 * 300; ctx.fillStyle = 'rgba(255,240,180,' + (0.5 + Math.sin(frame * 0.1 + i) * 0.5) + ')'; ctx.fillRect(x, y, 2, 2); break;
      case 'drip': if (i > 10) break; x = ((r1 * W * 1.5 - camX * 0.2) % W + W) % W; y = (r2 * 300 + frame * 3 * sp) % 320; ctx.fillStyle = 'rgba(140,200,255,0.6)'; ctx.fillRect(x, y, 1.5, 5); break;
    }
  }
  if (T.dark) { const g = ctx.createRadialGradient(W / 2, H * 0.65, 150, W / 2, H * 0.6, 620); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
}

// ---------- 粒子 / 特效 ----------
let PARTICLES = [];
function addParticle(p) { p.t = 0; p.maxLife = p.life; PARTICLES.push(p); if (PARTICLES.length > 600) PARTICLES.shift(); }
function updateParticles() {
  for (const p of PARTICLES) { p.t++; p.life--; p.x += p.vx || 0; p.y += p.vy || 0; p.z = (p.z || 0) + (p.vz || 0); if (p.grav) p.vz -= p.grav; if (p.grav && p.z < 0) { p.z = 0; p.vz = 0; p.vx = (p.vx || 0) * 0.5; } }
  PARTICLES = PARTICLES.filter(p => p.life > 0);
}
function drawParticle(ctx, p, camX) {
  const x = p.x - camX, y = p.y - (p.z || 0), a = Math.max(0, p.life / p.maxLife);
  ctx.save();
  switch (p.type) {
    case 'spark': { ctx.strokeStyle = p.color || '#fff'; ctx.lineWidth = 3; ctx.globalAlpha = a; const r = 6 + (1 - a) * 22; for (let i = 0; i < 8; i++) { const an = i * TAU / 8 + (p.rot || 0); ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * r * 0.4, y + Math.sin(an) * r * 0.4); ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 8 * a, 0, TAU); ctx.fill(); break; }
    case 'dust': case 'smoke': ctx.globalAlpha = a * 0.6; ctx.fillStyle = p.color || (p.type === 'smoke' ? '#333' : '#d8c8a8'); ctx.beginPath(); ctx.arc(x, y, (p.r || 6) * (1.5 - a * 0.5), 0, TAU); ctx.fill(); break;
    case 'text': ctx.globalAlpha = Math.min(1, a * 2); ctx.font = `bold ${p.size || 18}px "Noto Sans TC","Microsoft JhengHei",sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(p.text, x, y); ctx.fillStyle = p.color || '#fff'; ctx.fillText(p.text, x, y); break;
    case 'ring': ctx.globalAlpha = a; ctx.strokeStyle = p.color || '#fff'; ctx.lineWidth = 4 * a + 1; const rr = p.r0 + (p.r1 - p.r0) * (1 - a); ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.35, 0, 0, TAU); ctx.stroke(); if (p.fill) { ctx.fillStyle = p.fill; ctx.globalAlpha = a * 0.3; ctx.fill(); } break;
    case 'pillar': { ctx.globalAlpha = a; const w = (p.w || 30) * (0.6 + a * 0.4); const g = ctx.createLinearGradient(x - w, 0, x + w, 0); g.addColorStop(0, 'rgba(255,240,150,0)'); g.addColorStop(0.5, p.color || 'rgba(255,250,210,0.95)'); g.addColorStop(1, 'rgba(255,240,150,0)'); ctx.fillStyle = g; ctx.fillRect(x - w, 0, w * 2, y); ctx.fillStyle = 'rgba(255,255,220,0.8)'; ctx.beginPath(); ctx.ellipse(x, y, w * 1.2, w * 0.35, 0, 0, TAU); ctx.fill(); break; }
    case 'bolt': { ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.shadowColor = '#8cf'; ctx.shadowBlur = 16; ctx.beginPath(); let yy = 0, xx = x; ctx.moveTo(xx, 0); while (yy < y) { yy += 24; xx = x + (hash(yy + p.seed + Math.floor(p.t / 2)) - 0.5) * 30; ctx.lineTo(xx, Math.min(yy, y)); } ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(120,180,255,0.4)'; ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(200,230,255,0.7)'; ctx.beginPath(); ctx.ellipse(x, y, 40 * a, 12 * a, 0, 0, TAU); ctx.fill(); break; }
    case 'flame': ctx.globalAlpha = a; ctx.fillStyle = a > 0.6 ? '#ffe070' : a > 0.3 ? '#ff8a20' : '#c02a10'; ctx.beginPath(); ctx.arc(x, y, 3 + a * 5, 0, TAU); ctx.fill(); break;
    case 'explosion': { ctx.globalAlpha = a; const r = (p.r || 60) * (1.2 - a * 0.6); const g = ctx.createRadialGradient(x, y, 0, x, y, r); if (p.color === 'purple') { g.addColorStop(0, '#fff0ff'); g.addColorStop(0.4, '#b050ff'); g.addColorStop(1, 'rgba(80,0,160,0)'); } else { g.addColorStop(0, '#fff8c0'); g.addColorStop(0.4, '#ffa030'); g.addColorStop(1, 'rgba(200,40,0,0)'); } ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); break; }
    case 'shard': ctx.globalAlpha = a; ctx.fillStyle = p.color || '#bfe8ff'; ctx.translate(x, y); ctx.rotate(p.t * 0.2); ctx.fillRect(-3, -6, 6, 12); break;
    case 'heal': ctx.globalAlpha = a; ctx.fillStyle = p.color || '#fff27a'; ctx.translate(x, y); ctx.fillRect(-1.5, -6, 3, 12); ctx.fillRect(-6, -1.5, 12, 3); break;
    case 'bubble': ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.stroke(); break;
    case 'slashfx': { ctx.globalAlpha = a * 0.85; ctx.strokeStyle = p.color || '#fff'; ctx.lineWidth = 6 * a + 1; ctx.beginPath(); ctx.ellipse(x, y, p.r || 40, (p.r || 40) * 0.5, 0, p.a0, p.a1, p.ccw); ctx.stroke(); break; }
    case 'spike': { const k = Math.min(1, p.t / 5) * Math.min(1, p.life / 8); ctx.fillStyle = '#7a5a3a'; ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) { const hgt = (34 + hash(p.seed * 3 + i) * 22) * k; ctx.beginPath(); ctx.moveTo(x + i * 12 - 9, y); ctx.lineTo(x + i * 12 + (hash(i + p.seed) - 0.5) * 6, y - hgt); ctx.lineTo(x + i * 12 + 9, y); ctx.closePath(); ctx.fill(); ctx.stroke(); } break; }
    case 'arrowstuck': ctx.globalAlpha = a; ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 14); ctx.stroke(); break;
  }
  ctx.restore();
}

// ---------- 飛行道具 ----------
function drawProj(ctx, p, camX, frame) {
  const x = p.x - camX, y = p.y - p.z, dir = p.vx >= 0 ? 1 : -1;
  if (p.type === 'spawner') return;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, p.y, 10, 3, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  switch (p.type) {
    case 'wave': ctx.strokeStyle = 'rgba(160,220,255,0.9)'; ctx.lineWidth = 6; ctx.shadowColor = '#6cf'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(-10, 0, 26, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); break;
    case 'fireball': { const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 18); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.5, '#ff8a20'); g.addColorStop(1, 'rgba(255,40,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
      if (frame % 2 === 0) addParticle({ type: 'flame', x: p.x - dir * 10, y: p.y, z: p.z + (Math.random() - 0.5) * 10, life: 16 }); break; }
    case 'magicbolt': ctx.fillStyle = '#9ef'; ctx.shadowColor = '#6cf'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); break;
    case 'darkorb': ctx.fillStyle = '#6a1aa0'; ctx.shadowColor = '#c040ff'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(0, 0, 10 + Math.sin(frame * 0.4) * 2, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8a0ff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill(); break;
    case 'arrow': case 'bigarrow': { const k = p.type === 'bigarrow' ? 1.6 : 1; ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.moveTo(-18 * k, 0); ctx.lineTo(10 * k, 0); ctx.stroke(); ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(10 * k, -3 * k); ctx.lineTo(17 * k, 0); ctx.lineTo(10 * k, 3 * k); ctx.fill(); ctx.fillStyle = '#e44'; ctx.fillRect(-18 * k, -3 * k, 5 * k, 6 * k);
      if (k > 1) { ctx.strokeStyle = 'rgba(200,255,120,0.6)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-18, 0); ctx.stroke(); } break; }
    case 'rainarrow': ctx.rotate(Math.PI / 2 * dir); ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(8, 0); ctx.stroke(); ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(8, -3); ctx.lineTo(14, 0); ctx.lineTo(8, 3); ctx.fill(); break;
    case 'kunai': ctx.rotate(frame * 0.0); ctx.fillStyle = '#cfd8e0'; ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(10, 0); ctx.lineTo(-4, 3); ctx.fill(); ctx.strokeStyle = '#7cff4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-4, 0); ctx.stroke(); break;
    case 'item': drawItemIcon(ctx, p.item, 0, 0, 1.2, p.spin ? frame * 0.4 : 0); break;
    case 'firearrow': ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(10, 0); ctx.stroke(); ctx.fillStyle = '#c22'; ctx.beginPath(); ctx.arc(12, 0, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#333'; ctx.fillRect(9, -2, 6, 4);
      if (frame % 2 === 0) addParticle({ type: 'flame', x: p.x - dir * 16, y: p.y, z: p.z, life: 12 }); break;
    case 'meteor': { ctx.scale(dir, 1); ctx.rotate(0); const gr = ctx.createRadialGradient(0, 0, 4, 0, 0, 34); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.35, '#ff7a20'); gr.addColorStop(1, 'rgba(160,20,0,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5a2a18'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill(); for (let i = 0; i < 3; i++) addParticle({ type: 'flame', x: p.x - p.vx * i * 1.5, y: p.y, z: p.z + 10 + i * 12, life: 16 }); break; }
    case 'hammerboom': ctx.rotate(frame * 0.5); drawWeapon(ctx, 'hammer', -18, 0, Math.PI / 2, 1, { accent: '#f5c542' }); ctx.fillStyle = 'rgba(255,240,150,0.3)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill(); break;
    case 'trap': { ctx.restore(); ctx.save(); ctx.translate(x, p.y); const bl = p.t < 10 ? p.t / 10 : 1; ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 16 * bl, 6 * bl, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#b0b5c0'; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 16 * bl, Math.sin(a) * 6 * bl); ctx.lineTo(Math.cos(a) * 11 * bl, Math.sin(a) * 4 * bl - 7); ctx.lineTo(Math.cos(a + 0.2) * 16 * bl, Math.sin(a + 0.2) * 6 * bl); ctx.fill(); }
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-4, -2, 8, 4); break; }
    case 'barrier': { ctx.restore(); ctx.save(); ctx.translate(x, p.y); const a = Math.min(1, p.life / 30) * (0.75 + Math.sin(frame * 0.2) * 0.15);
      const gr = ctx.createLinearGradient(-14, 0, 14, 0); gr.addColorStop(0, 'rgba(255,240,150,0)'); gr.addColorStop(0.5, `rgba(255,245,190,${a})`); gr.addColorStop(1, 'rgba(255,240,150,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-12, 46); ctx.lineTo(12, 46); ctx.lineTo(12, -120); ctx.lineTo(-12, -80); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,215,90,${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 46); ctx.lineTo(0, -100); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-10, -60); ctx.lineTo(10, -60); ctx.stroke(); break; }
  }
  ctx.restore();
}
