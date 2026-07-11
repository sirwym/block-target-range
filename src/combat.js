import { ENEMY_STATS, GAME_CONFIG, SCORE_VALUES } from "./config.js";

export function getHitResult(hitType, enemyKind, weapon = null) {
  const critical = hitType === "head";
  const maxHealth = ENEMY_STATS[enemyKind]?.health ?? 1;
  const damage = critical ? maxHealth : Math.max(1, weapon?.bodyDamage ?? 1);
  return {
    critical,
    damage,
    label: critical ? "精准" : "",
    damageLabel: critical ? `精准 -${damage}` : `-${damage}`,
    basePoints: SCORE_VALUES[enemyKind] + (critical ? SCORE_VALUES.criticalBonus : 0),
    comboGain: critical ? GAME_CONFIG.criticalComboBonus : 1,
  };
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
