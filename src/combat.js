import { ENEMY_STATS, GAME_CONFIG, SCORE_VALUES } from "./config.js";

// V2 真实数值体系：敌人 HP=100，爆头伤害 = bodyDamage * headShotMultiplier（不再秒杀）
export function getHitResult(hitType, enemyKind, weapon = null) {
  const critical = hitType === "head";
  const bodyDamage = Math.max(1, weapon?.bodyDamage ?? 1);
  const headMultiplier = weapon?.headShotMultiplier ?? 1.5;
  const damage = critical
    ? Math.max(1, Math.floor(bodyDamage * headMultiplier))
    : bodyDamage;
  return {
    critical,
    damage,
    label: critical ? "精准" : "",
    damageLabel: critical ? `精准 -${damage}` : `-${damage}`,
    basePoints: SCORE_VALUES[enemyKind] + (critical ? SCORE_VALUES.criticalBonus : 0),
    comboGain: critical ? GAME_CONFIG.criticalComboBonus : 1,
  };
}

// 爆炸 AoE 伤害计算：以落点为中心，对半径内所有目标施加衰减伤害
// center: {x, y, z} 世界坐标；targets: 含 group.position 的目标数组
// 返回 [{ target, damage, distance }]，调用方负责应用伤害和死亡判定
export function applyExplosionDamage(center, targets, explosion) {
  const radius = explosion?.radius ?? 0;
  const damage = explosion?.damage ?? 0;
  if (radius <= 0 || damage <= 0) return [];
  const hits = [];
  for (const target of targets) {
    const pos = target.group?.position ?? target.position;
    if (!pos) continue;
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    const dz = pos.z - center.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance > radius) continue;
    // 距离衰减：中心全伤，边缘 50% 伤
    const falloff = 1 - (distance / radius) * 0.5;
    const scaledDamage = Math.max(1, Math.floor(damage * falloff));
    hits.push({ target, damage: scaledDamage, distance });
  }
  return hits;
}

export function scoreDefeat({ basePoints, combo }) {
  const multiplier = 1 + Math.floor(Math.max(0, combo - 1) / 3) * 0.5;
  return {
    multiplier,
    earned: Math.round(basePoints * multiplier),
  };
}

export function applyDefeatCombo(state, comboGain = 1) {
  const nextCombo = state.combo + comboGain;
  return {
    ...state,
    combo: nextCombo,
    comboTimer: GAME_CONFIG.comboWindow,
    bestCombo: Math.max(state.bestCombo, nextCombo),
  };
}

export function decayCombo(state, delta) {
  const comboTimer = Math.max(0, state.comboTimer - delta);
  return {
    ...state,
    comboTimer,
    combo: comboTimer <= 0 ? 0 : state.combo,
  };
}

export function shouldShowCombo(combo) {
  return combo >= 3;
}
