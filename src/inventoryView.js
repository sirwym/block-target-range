// Tab 人物+背包面板的数据组装层。
// 把 state/weaponLab/weaponConfig 收集成结构化数据供 ui.js 渲染，
// 独立成纯函数模块便于 node --test 直接验证，不依赖 Babylon GUI。
import { WEAPON_CONFIG, WEAPON_ORDER, GAME_CONFIG, WEAPON_LAB_CONFIG } from "./config.js";
import { getCurrentWeapon } from "./weapon.js";

// 估算每秒射速：fireInterval 是每发间隔秒数，60/interval = RPM，再除 60 = 每秒发数。
// fireInterval=0 时返回 0 避免除零。
function computeFireRatePerSecond(fireInterval) {
  if (!fireInterval || fireInterval <= 0) return 0;
  return Math.round((60 / fireInterval / 60) * 10) / 10;
}

// 把 weaponConfig 中的字段转成面板可读的 currentWeapon 结构。
function buildCurrentWeapon(weapon) {
  return {
    id: weapon.id,
    label: weapon.label,
    magazineSize: weapon.magazineSize,
    fireRate: computeFireRatePerSecond(weapon.fireInterval),
    bodyDamage: weapon.bodyDamage,
    recoil: weapon.recoil,
    fireMode: weapon.automatic ? "自动" : "半自动",
  };
}

// 5 把武器作为"背包格子"：每把武器的 id/label/iconPath/slot 供面板渲染。
function buildWeaponSlots(currentWeaponId) {
  return WEAPON_ORDER.map((id, index) => {
    const cfg = WEAPON_CONFIG[id];
    return {
      id,
      label: cfg.label,
      iconPath: cfg.iconPath,
      slot: index + 1,
      selected: id === currentWeaponId,
    };
  });
}

// weaponLab 模式统计区块：弹匣层 + 会话层 + 当前模式区块（死靶/敌人/动靶）。
// enemyState 由 main.js 传入（lab.enemyTimeLeft / lab.enemyHP / lab.enemyResult）。
function buildWeaponLabStats(lab, enemyState) {
  const stats = lab.getStats();
  const mode = lab.mode;
  // 活跃计数：moving 排除 dead，enemy 用 enemies.length，其他用 dummies.length
  const displayCount = mode === "moving"
    ? lab.movingTargets.filter((mt) => !mt.group.metadata.dead).length
    : mode === "enemy"
      ? lab.enemies.length
      : lab.dummies.length;
  return {
    magazine: stats.magazine,
    session: stats.session,
    dummy: stats.dummy,
    enemy: stats.enemy,
    moving: stats.moving,
    mode,
    displayCount,
    enemyState: enemyState ?? {
      timeLeft: lab.enemyTimeLeft,
      hp: lab.enemyHP,
      result: lab.enemyResult,
      playerMaxHP: WEAPON_LAB_CONFIG.enemyMode.playerHP,
    },
  };
}

// 靶场模式统计区块：直接读 state 中的玩法字段。
function buildRangeState(state) {
  return {
    score: state.score,
    hits: state.hits,
    combo: state.combo,
    bestCombo: state.bestCombo,
    timeLeft: Math.ceil(state.timeLeft),
    baseHealth: state.baseHealth,
    baseMaxHealth: GAME_CONFIG.baseHealth,
  };
}

// 主入口：组装 Tab 面板所需的全部数据。
// state: main.js 的 state 对象（必须含 weapons/score/combo 等）
// weaponLab: lab 对象或 null（weaponLab 模式传 lab，靶场模式传 null）
// enemyState: 可选，weaponLab 敌人模式下由 main.js 主动传入最新数据
export function buildInventoryViewData(state, weaponLab, enemyState) {
  const weapons = state.weapons;
  const currentWeapon = weapons
    ? getCurrentWeapon(weapons, WEAPON_CONFIG)
    : WEAPON_CONFIG[WEAPON_ORDER[0]];
  return {
    character: {
      previewSrc: "assets/minecraft/entity/player/steve.png",
    },
    currentWeapon: buildCurrentWeapon(currentWeapon),
    weaponSlots: buildWeaponSlots(currentWeapon.id),
    stats: weaponLab ? buildWeaponLabStats(weaponLab, enemyState) : null,
    rangeState: weaponLab ? null : buildRangeState(state),
  };
}
