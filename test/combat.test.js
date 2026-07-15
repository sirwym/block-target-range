import test from "node:test";
import assert from "node:assert/strict";
import { WEAPON_CONFIG, ENEMY_STATS } from "../src/config.js";
import { applyDefeatCombo, applyExplosionDamage, decayCombo, getHitResult, scoreDefeat, shouldShowCombo } from "../src/combat.js";

// V2 真实数值体系：敌人 HP=100，爆头伤害 = floor(bodyDamage * headShotMultiplier)
// weapon=null 时 bodyDamage 默认 1，headMultiplier 默认 1.5

test("body hit deals default damage without weapon", () => {
  const body = getHitResult("body", "zombie");
  assert.equal(body.damage, 1);
  assert.equal(body.critical, false);
  assert.equal(body.label, "");
});

test("headshot multiplies body damage without one-shot kill", () => {
  const head = getHitResult("head", "zombie");
  // floor(1 * 1.5) = 1（不再秒杀 maxHealth）
  assert.equal(head.damage, 1);
  assert.equal(head.critical, true);
  assert.equal(head.label, "精准");
  assert.equal(head.damageLabel, "精准 -1");
  assert.equal(getHitResult("head", "creeper").damage, 1);
});

test("weapon body damage and headshot multiplier produce expected values", () => {
  const awpBody = getHitResult("body", "zombie", WEAPON_CONFIG.awp);
  const awpHead = getHitResult("head", "zombie", WEAPON_CONFIG.awp);
  assert.equal(awpBody.damage, 42);
  assert.equal(awpHead.damage, Math.floor(42 * 2));
  assert.equal(awpHead.critical, true);
});

test("enemies need multiple body shots at 100 HP", () => {
  const zombieBody = getHitResult("body", "zombie");
  const zombieHP = ENEMY_STATS.zombie.health;
  assert.equal(zombieHP, 100);
  assert.equal(Math.ceil(zombieHP / zombieBody.damage), 100);
});

test("v2 new weapons have expected damage values", () => {
  const deagleBody = getHitResult("body", "zombie", WEAPON_CONFIG.deagle_golden);
  const deagleHead = getHitResult("head", "zombie", WEAPON_CONFIG.deagle_golden);
  assert.equal(deagleBody.damage, 12);
  assert.equal(deagleHead.damage, Math.floor(12 * 1.8));

  const m95Head = getHitResult("head", "zombie", WEAPON_CONFIG.m95);
  assert.equal(m95Head.damage, Math.floor(75 * 2.5));
});

test("applyExplosionDamage hits targets within radius with falloff", () => {
  const targets = [
    { group: { position: { x: 0, y: 0, z: 0 } } },       // 中心：distance=0, falloff=1.0
    { group: { position: { x: 1.5, y: 0, z: 0 } } },     // 中距：distance=1.5, falloff=0.75
    { group: { position: { x: 3, y: 0, z: 0 } } },        // 边缘：distance=3, falloff=0.5
    { group: { position: { x: 4, y: 0, z: 0 } } },        // 超出：不命中
  ];
  const hits = applyExplosionDamage({ x: 0, y: 0, z: 0 }, targets, { damage: 120, radius: 3 });
  assert.equal(hits.length, 3);
  assert.equal(hits[0].damage, 120);   // 中心全伤
  assert.equal(hits[1].damage, Math.floor(120 * 0.75));  // 中距衰减
  assert.equal(hits[2].damage, 60);    // 边缘 50%
});

test("applyExplosionDamage returns empty for invalid config", () => {
  const targets = [{ group: { position: { x: 0, y: 0, z: 0 } } }];
  assert.deepEqual(applyExplosionDamage({ x: 0, y: 0, z: 0 }, targets, null), []);
  assert.deepEqual(applyExplosionDamage({ x: 0, y: 0, z: 0 }, targets, { damage: 0, radius: 3 }), []);
  assert.deepEqual(applyExplosionDamage({ x: 0, y: 0, z: 0 }, targets, { damage: 120, radius: 0 }), []);
});

test("combo increases score multiplier", () => {
  const low = scoreDefeat({ basePoints: 10, combo: 1 });
  const high = scoreDefeat({ basePoints: 10, combo: 4 });
  assert.ok(high.earned > low.earned);
});

test("combo gain and timeout reset work", () => {
  const gained = applyDefeatCombo({ combo: 2, bestCombo: 2, comboTimer: 0 }, 2);
  assert.equal(gained.combo, 4);
  assert.equal(gained.bestCombo, 4);
  const decayed = decayCombo(gained, 3);
  assert.equal(decayed.combo, 0);
});
