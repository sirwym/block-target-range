import test from "node:test";
import assert from "node:assert/strict";
import { WEAPON_CONFIG } from "../src/config.js";
import { applyDefeatCombo, decayCombo, getHitResult, scoreDefeat } from "../src/combat.js";

test("critical hit defeats enemies while body hits chip health", () => {
  const body = getHitResult("body", "zombie");
  const head = getHitResult("head", "zombie");
  assert.equal(body.damage, 1);
  assert.equal(head.damage, 3);
  assert.equal(getHitResult("head", "creeper").damage, 2);
  assert.ok(head.basePoints > body.basePoints);
  assert.equal(head.critical, true);
  assert.equal(head.damageLabel, "精准 -3");
});

test("body hits require multiple shots by enemy kind", () => {
  const zombieBody = getHitResult("body", "zombie");
  const creeperBody = getHitResult("body", "creeper");
  assert.equal(Math.ceil(3 / zombieBody.damage), 3);
  assert.equal(Math.ceil(2 / creeperBody.damage), 2);
});

test("weapon body damage applies without changing headshot defeat", () => {
  const awpBody = getHitResult("body", "zombie", WEAPON_CONFIG.awp);
  const awpHead = getHitResult("head", "zombie", WEAPON_CONFIG.awp);
  assert.equal(awpBody.damage, 2);
  assert.equal(awpHead.damage, 3);
  assert.equal(awpHead.critical, true);
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
