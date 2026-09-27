'use strict';
// ===== 遊戲資料：角色、招式、敵人、道具、關卡 =====
const W = 960, H = 540;
const GROUND_TOP = 330, GROUND_BOT = 520;
const GRAV = 0.62;

const UNIVERSAL_MOVES = [
  { id: 'combo', name: '普攻連段', input: 'A → A → A', desc: '三段連擊，第三擊擊倒敵人（魔法師／弓箭手第三擊為遠程）' },
  { id: 'jumpatk', name: '跳躍攻擊', input: 'J → A（空中）', desc: '空中向下斬擊，命中空中或地面敵人' },
  { id: 'dashatk', name: '衝刺攻擊', input: '→→ 奔跑中 A', desc: '奔跑中突進攻擊，將敵人擊飛' },
  { id: 'grab', name: '抓投', input: '貼近暈眩／硬直敵人 A', desc: '抓住敵人：再按 A 連續毆打，方向＋A 將其摔出（可砸中其他敵人）' },
  { id: 'roll', name: '翻滾閃避', input: 'D ＋ ←／→（或奔跑中 D）', desc: '快速翻滾位移，翻滾期間無敵' },
];

// cmd: D + 方向(f=前 u=上 d=下) + A/J；每名角色 6 招對應 6 個不同指令
const CHARS = [
  {
    id: 'sword', cls: '劍士', name: '亞倫', hp: 230, mp: 100, speed: 4.0, power: 1.1, def: 1.0, regen: 0.085,
    stats: { hp: 4, mp: 2, speed: 3, power: 4 },
    look: { type: 'sword', skin: '#f2c9a0', hair: '#3b2a1a', body: '#2f6fd6', pants: '#1e3a6e', accent: '#e8d36a', weapon: 'sword' },
    combo: ['slash', 'slash2', 'slash'], reach: 62, atkBase: 8,
    desc: '平衡型近戰劍士，擅長突進、反擊與連斬。',
    specials: [
      { id: 'gale', name: '疾風斬', short: '疾風', cmd: 'DfA', input: 'D → A', mp: 20, desc: '揮出貫穿敵人的新月劍氣（飛行道具）' },
      { id: 'rising', name: '升龍斬', short: '升龍', cmd: 'DuA', input: 'D ↑ A', mp: 25, desc: '旋身升空連斬，多段命中並擊飛（無敵起手）' },
      { id: 'whirl', name: '旋風劍', short: '旋風', cmd: 'DfJ', input: 'D → J', mp: 30, desc: '邊旋轉邊前進的多段迴旋斬' },
      { id: 'quake', name: '裂地斬', short: '裂地', cmd: 'DdA', input: 'D ↓ A', mp: 30, desc: '劍插大地，岩刺沿地面向前連續爆發' },
      { id: 'soul', name: '劍魂覺醒', short: '劍魂', cmd: 'DuJ', input: 'D ↑ J', mp: 45, desc: '8 秒內攻擊力 +35%、移動速度 +15%（增益）' },
      { id: 'counter', name: '燕返', short: '燕返', cmd: 'DdJ', input: 'D ↓ J', mp: 20, desc: '架勢迎擊，架勢中被攻擊即無敵反斬（反擊技）' },
    ],
  },
  {
    id: 'mage', cls: '魔法師', name: '莉亞', hp: 175, mp: 160, speed: 3.4, power: 1.0, def: 0.9, regen: 0.13,
    stats: { hp: 2, mp: 5, speed: 2, power: 3 },
    look: { type: 'mage', skin: '#f5d2b3', hair: '#c9a2ff', body: '#6b3fb3', pants: '#3d2170', accent: '#ffd35a', weapon: 'staff' },
    combo: ['thrust', 'slash2', 'cast'], reach: 50, atkBase: 6,
    desc: '魔力充沛的遠程法師，範圍魔法與瞬移護盾。',
    specials: [
      { id: 'fireball', name: '火球術', short: '火球', cmd: 'DfA', input: 'D → A', mp: 18, desc: '發射爆炎火球，命中擊倒並造成燃燒' },
      { id: 'frost', name: '冰霜新星', short: '冰霜', cmd: 'DdA', input: 'D ↓ A', mp: 40, desc: '以自身為中心爆發寒氣，凍結周圍敵人' },
      { id: 'thunder', name: '雷霆萬鈞', short: '雷霆', cmd: 'DuA', input: 'D ↑ A', mp: 50, desc: '召喚落雷連續轟擊前方的敵人' },
      { id: 'blink', name: '閃現術', short: '閃現', cmd: 'DfJ', input: 'D → J', mp: 20, desc: '向前瞬移，原地留下延遲爆炸的魔法符文' },
      { id: 'meteor', name: '隕石術', short: '隕石', cmd: 'DuJ', input: 'D ↑ J', mp: 65, desc: '標記最近敵人，巨大隕石墜落造成大範圍燃燒爆炸' },
      { id: 'manashield', name: '魔力護盾', short: '護盾', cmd: 'DdJ', input: 'D ↓ J', mp: 40, desc: '展開護盾吸收 70% 傷害且不會被擊倒（可被打破）' },
    ],
  },
  {
    id: 'archer', cls: '弓箭手', name: '席爾', hp: 185, mp: 115, speed: 3.9, power: 0.95, def: 0.95, regen: 0.1,
    stats: { hp: 2, mp: 3, speed: 4, power: 2 },
    look: { type: 'archer', skin: '#e8b98f', hair: '#8a5a2b', body: '#3f8f3a', pants: '#5a3d22', accent: '#d9f06a', weapon: 'bow' },
    combo: ['punch', 'kick', 'bow'], reach: 48, atkBase: 6,
    desc: '靈活的弓手，擅長保持距離、陷阱與箭矢壓制。',
    specials: [
      { id: 'triple', name: '三連矢', short: '三連', cmd: 'DfA', input: 'D → A', mp: 18, desc: '同時射出三支扇形箭矢，覆蓋多條縱深' },
      { id: 'rain', name: '箭雨', short: '箭雨', cmd: 'DuA', input: 'D ↑ A', mp: 40, desc: '向天射箭，前方區域降下大量箭雨' },
      { id: 'backshot', name: '後躍射擊', short: '後躍', cmd: 'DfJ', input: 'D → J', mp: 25, desc: '向後躍起並射出貫穿強力箭' },
      { id: 'trap', name: '捕獸陷阱', short: '陷阱', cmd: 'DdA', input: 'D ↓ A', mp: 20, desc: '在前方設置陷阱，踩中的敵人暈眩（最多 2 個）' },
      { id: 'rapid', name: '連珠箭', short: '連珠', cmd: 'DuJ', input: 'D ↑ J', mp: 30, desc: '高速連射六支直線箭矢' },
      { id: 'blast', name: '爆裂箭', short: '爆裂', cmd: 'DdJ', input: 'D ↓ J', mp: 30, desc: '射出命中即爆炸的火藥箭，範圍擊倒並燃燒' },
    ],
  },
  {
    id: 'paladin', cls: '聖騎士', name: '葛倫', hp: 290, mp: 100, speed: 3.0, power: 1.15, def: 1.3, regen: 0.08,
    stats: { hp: 5, mp: 2, speed: 1, power: 4 },
    look: { type: 'paladin', skin: '#f0c49a', hair: '#d8d8e0', body: '#e6e6f0', pants: '#8a7a50', accent: '#f5c542', weapon: 'hammer' },
    combo: ['slash', 'slash2', 'raise'], reach: 58, atkBase: 9,
    desc: '身披重甲的神聖騎士，耐打、能治癒並築起聖光壁壘。',
    specials: [
      { id: 'charge', name: '盾牌衝鋒', short: '衝鋒', cmd: 'DfA', input: 'D → A', mp: 22, desc: '舉盾霸體衝鋒，撞飛路徑上的敵人' },
      { id: 'judgment', name: '神聖審判', short: '審判', cmd: 'DdA', input: 'D ↓ A', mp: 45, desc: '錘擊大地召喚光柱，周圍敵人全部擊飛' },
      { id: 'heal', name: '聖光治癒', short: '治癒', cmd: 'DuJ', input: 'D ↑ J', mp: 50, desc: '聖光環繞，逐步回復 30% 生命值' },
      { id: 'upper', name: '昇天錘', short: '昇天', cmd: 'DuA', input: 'D ↑ A', mp: 25, desc: '由下而上揮錘，將眼前敵人高高擊飛（對空）' },
      { id: 'boomer', name: '聖光之錘', short: '聖錘', cmd: 'DfJ', input: 'D → J', mp: 25, desc: '擲出旋轉聖錘，飛出後折返，來回兩次命中' },
      { id: 'barrier', name: '神聖壁壘', short: '壁壘', cmd: 'DdJ', input: 'D ↓ J', mp: 40, desc: '在前方立起聖光壁壘 5 秒，擋下飛行道具並推開敵人' },
    ],
  },
  {
    id: 'assassin', cls: '刺客', name: '夜影', hp: 170, mp: 115, speed: 5.0, power: 1.0, def: 0.9, regen: 0.1,
    stats: { hp: 2, mp: 3, speed: 5, power: 3 },
    look: { type: 'assassin', skin: '#d9b08c', hair: '#1a1a22', body: '#2b2b38', pants: '#1a1a24', accent: '#d8263b', weapon: 'daggers' },
    combo: ['stab', 'stab', 'slash2'], reach: 46, atkBase: 7, fast: true,
    desc: '速度最快的暗殺者，瞬移、分身與毒刃令人防不勝防。',
    specials: [
      { id: 'shadow', name: '影襲', short: '影襲', cmd: 'DfA', input: 'D → A', mp: 22, desc: '化為暗影瞬移至最近敵人背後突刺' },
      { id: 'flurry', name: '千刃亂舞', short: '千刃', cmd: 'DfJ', input: 'D → J', mp: 32, desc: '向前高速連刺八次，最後一擊擊倒' },
      { id: 'poison', name: '毒刃連射', short: '毒刃', cmd: 'DdA', input: 'D ↓ A', mp: 22, desc: '連續擲出三把毒刃，命中造成持續中毒' },
      { id: 'dive', name: '飛燕斬', short: '飛燕', cmd: 'DuA', input: 'D ↑ A', mp: 22, desc: '躍上半空後斜向俯衝斬擊' },
      { id: 'clone', name: '影分身', short: '分身', cmd: 'DuJ', input: 'D ↑ J', mp: 50, desc: '召喚暗影分身協同作戰 8 秒（吸引敵人）' },
      { id: 'smoke', name: '煙霧彈', short: '煙霧', cmd: 'DdJ', input: 'D ↓ J', mp: 30, desc: '爆出煙霧使周圍敵人暈眩，自身隱身後撤' },
    ],
  },
];

const ENEMIES = {
  goblin: { name: '哥布林', hp: 42, speed: 2.9, power: 1, scale: 0.78, reach: 40, dmg: 6, look: { type: 'goblin', skin: '#6fbf4a', body: '#7a5a30', pants: '#4d3a20', weapon: 'club' }, score: 100, picker: true },
  skeleton: { name: '骷髏兵', hp: 55, speed: 2.5, power: 1, scale: 0.95, reach: 55, dmg: 8, look: { type: 'skeleton', skin: '#ece8d8', body: '#ece8d8', pants: '#bdb7a0', weapon: 'bonesword' }, score: 120 },
  orc: { name: '獸人', hp: 115, speed: 2.1, power: 1, scale: 1.18, reach: 62, dmg: 13, heavy: true, look: { type: 'orc', skin: '#5f8a3a', body: '#6b4a2a', pants: '#3e2c1a', weapon: 'axe' }, score: 200, picker: true },
  darkmage: { name: '黑暗法師', hp: 48, speed: 2.3, power: 1, scale: 0.95, reach: 40, dmg: 5, ranged: true, look: { type: 'darkmage', skin: '#9a7bb8', body: '#2a1840', pants: '#1a0f2a', weapon: 'darkstaff' }, score: 160 },
  wolf: { name: '狼', hp: 46, speed: 4.3, power: 1, scale: 1, reach: 44, dmg: 7, quad: true, look: { type: 'wolf', body: '#7d7d86', pants: '#5d5d66' }, score: 110 },
  troll: { name: '巨魔', hp: 190, speed: 1.8, power: 1, scale: 1.35, reach: 72, dmg: 19, heavy: true, look: { type: 'troll', skin: '#7f8f96', body: '#4a4035', pants: '#3a3228', weapon: 'bigclub' }, score: 300, picker: true },
};

const ITEMS = {
  knife: { name: '飛刀', cat: 'throw', dmg: 14, color: '#cfd8e0' },
  firebomb: { name: '火焰瓶', cat: 'throw', dmg: 16, color: '#ff7a2a' },
  rock: { name: '石頭', cat: 'throw', dmg: 18, color: '#8d8578' },
  longsword: { name: '長劍', cat: 'melee', dmg: 7, reach: 78, dur: 14, color: '#dfe6ee', anim: 'slash' },
  hammer: { name: '戰鎚', cat: 'melee', dmg: 12, reach: 70, dur: 9, color: '#9a8a70', anim: 'raise', kd: true, slow: 6 },
  stick: { name: '木棍', cat: 'melee', dmg: 4, reach: 66, dur: 16, color: '#a0703a', anim: 'slash2', fast: 3 },
  potion: { name: '藥水', cat: 'heal', hp: 80, color: '#ff4d6d' },
  bread: { name: '麵包', cat: 'heal', hp: 30, color: '#d9a55a' },
  crystal: { name: '魔力水晶', cat: 'heal', mpGain: 60, color: '#4dc3ff' },
};
const ITEM_KEYS = Object.keys(ITEMS);

const LEVELS = [
  { name: '迷霧森林', theme: 'forest', pool: ['goblin', 'wolf'] },
  { name: '幽暗洞窟', theme: 'cave', pool: ['goblin', 'skeleton', 'wolf'] },
  { name: '廢棄城堡', theme: 'castle', pool: ['skeleton', 'orc', 'darkmage'] },
  { name: '灼熱沙漠', theme: 'desert', pool: ['skeleton', 'orc', 'wolf'] },
  { name: '冰封雪山', theme: 'snow', pool: ['wolf', 'orc', 'darkmage'] },
  { name: '熔岩火山', theme: 'volcano', pool: ['orc', 'darkmage', 'troll', 'goblin'] },
  { name: '毒霧沼澤', theme: 'swamp', pool: ['goblin', 'skeleton', 'troll', 'darkmage'] },
  { name: '天空神殿', theme: 'sky', pool: ['skeleton', 'darkmage', 'orc', 'wolf'] },
  { name: '冥界深淵', theme: 'underworld', pool: ['skeleton', 'darkmage', 'troll', 'orc'] },
  { name: '魔王城', theme: 'demon', pool: ['goblin', 'skeleton', 'orc', 'darkmage', 'wolf', 'troll'] },
];

// 頭目：1–5 關為五名角色；6–10 關為強化版；第 10 關第 4 場為最終連戰
function bossPlan(level) {
  const L = level; // 1..10
  if (L <= 5) return [[L - 1]];
  if (L < 10) return [[L - 6]];
  return [[4], [0, 1], [2, 3]]; // 最終連戰：暗影刺客 → 劍士＋魔法師 → 弓箭手＋聖騎士
}
function bossTitle(ci, strong) {
  const c = CHARS[ci];
  return (strong ? '覺醒・' : '') + c.cls + ' ' + c.name;
}
