import test from "node:test";
import assert from "node:assert/strict";
import { WEAPON_CONFIG, WEAPON_ORDER } from "../src/config.js";
import {
  canFireWeapon,
  createWeaponState,
  fireWeapon,
  getBowFrame,
  selectWeapon,
  setTriggerHeld,
  startReload,
  updateWeaponState,
} from "../src/weapon.js";

test("bow animation frame follows shot timer", () => {
  assert.equal(getBowFrame(0, 0.24), "bow");
  assert.equal(getBowFrame(0.24, 0.24), "bowPulling0");
  assert.equal(getBowFrame(0.14, 0.24), "bowPulling1");
  assert.equal(getBowFrame(0.04, 0.24), "bowPulling2");
});

test("weapon configs define the first four firearms", () => {
  assert.deepEqual(WEAPON_ORDER, ["glock17", "m4", "ak47", "awp", "p90"]);
  for (const id of WEAPON_ORDER) {
    const weapon = WEAPON_CONFIG[id];
    assert.equal(weapon.id, id);
    assert.ok(weapon.iconPath.endsWith(".png"));
    assert.ok(weapon.magazineSize > 0);
    assert.ok(weapon.fireInterval > 0);
    assert.ok(weapon.reloadDuration > 0);
    assert.ok(weapon.bodyDamage >= 1);
    assert.ok(weapon.fireSound);
    assert.ok(weapon.tracerInterval >= 1, `${id} tracerInterval`);
    const display = weapon.display;
    assert.ok(typeof display.offsetX === "number", `${id} display.offsetX`);
    assert.ok(typeof display.offsetY === "number", `${id} display.offsetY`);
    assert.ok(typeof display.scale === "number" && display.scale > 0, `${id} display.scale`);
    assert.ok(typeof display.rotationZ === "number", `${id} display.rotationZ`);
    assert.equal(typeof display.flipX, "boolean", `${id} display.flipX`);
  }
  assert.ok(WEAPON_CONFIG.p90.modelPath, "p90 has modelPath");
  assert.equal(WEAPON_CONFIG.p90.slot, 5);
  assert.equal(WEAPON_CONFIG.p90.magazineSize, 50);
  assert.equal(WEAPON_CONFIG.p90.automatic, true);
  assert.ok(WEAPON_CONFIG.p90.modelPath.endsWith("p90_static.gltf"));
});

test("weapon state spends ammo and blocks fire during cooldown", () => {
  const weapon = WEAPON_CONFIG.glock17;
  let state = createWeaponState(WEAPON_ORDER, WEAPON_CONFIG);
  const shot = fireWeapon(state, weapon);
  assert.equal(shot.fired, true);
  state = shot.state;
  assert.equal(state.ammo.glock17, 16);
  assert.equal(canFireWeapon(state, weapon), false);
  state = updateWeaponState(state, weapon.fireInterval, WEAPON_CONFIG);
  state = setTriggerHeld(state, false);
  assert.equal(canFireWeapon(state, weapon), true);
});

test("reload fills the selected magazine after the timer", () => {
  const weapon = WEAPON_CONFIG.m4;
  let state = selectWeapon(createWeaponState(WEAPON_ORDER, WEAPON_CONFIG), "m4", WEAPON_CONFIG);
  state = fireWeapon(state, weapon).state;
  assert.equal(state.ammo.m4, 29);
  const reload = startReload(state, weapon);
  assert.equal(reload.started, true);
  state = updateWeaponState(reload.state, weapon.reloadDuration, WEAPON_CONFIG);
  assert.equal(state.reloading, false);
  assert.equal(state.ammo.m4, 30);
});

test("automatic weapons can fire again while semi automatic weapons stay locked", () => {
  let autoState = selectWeapon(createWeaponState(WEAPON_ORDER, WEAPON_CONFIG), "ak47", WEAPON_CONFIG);
  const autoWeapon = WEAPON_CONFIG.ak47;
  autoState = fireWeapon(autoState, autoWeapon).state;
  autoState = updateWeaponState(autoState, autoWeapon.fireInterval, WEAPON_CONFIG);
  assert.equal(canFireWeapon(autoState, autoWeapon), true);

  let semiState = createWeaponState(WEAPON_ORDER, WEAPON_CONFIG);
  const semiWeapon = WEAPON_CONFIG.glock17;
  semiState = fireWeapon(semiState, semiWeapon).state;
  semiState = updateWeaponState(semiState, semiWeapon.fireInterval, WEAPON_CONFIG);
  assert.equal(canFireWeapon(semiState, semiWeapon), false);
  semiState = setTriggerHeld(semiState, false);
  assert.equal(canFireWeapon(semiState, semiWeapon), true);
});

test("switching weapons preserves each magazine and cancels reload", () => {
  let state = createWeaponState(WEAPON_ORDER, WEAPON_CONFIG);
  state = fireWeapon(state, WEAPON_CONFIG.glock17).state;
  state = startReload(state, WEAPON_CONFIG.glock17).state;
  state = selectWeapon(state, "p90", WEAPON_CONFIG);
  assert.equal(state.currentWeaponId, "p90");
  assert.equal(state.reloading, false);
  assert.equal(state.ammo.glock17, 16);
  assert.equal(state.ammo.p90, 50);
});
