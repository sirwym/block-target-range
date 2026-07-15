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

test("weapon configs define all firearms", () => {
  assert.deepEqual(WEAPON_ORDER, ["m4", "m95", "deagle_golden", "awp", "ak47"]);
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
    assert.equal(weapon.display, undefined, `${id} no 2D first-person display config`);
    const modelConfig = weapon.modelConfig;
    assert.ok(Array.isArray(modelConfig.position) && modelConfig.position.length === 3, `${id} model position`);
    assert.ok(Array.isArray(modelConfig.rotation) && modelConfig.rotation.length === 3, `${id} model rotation`);
    assert.ok(typeof modelConfig.scaling === "number" && modelConfig.scaling > 0, `${id} model scaling`);
    assert.ok(
      Array.isArray(modelConfig.muzzleLocalPosition) && modelConfig.muzzleLocalPosition.length === 3,
      `${id} muzzleLocalPosition`
    );
  }
});

test("weapon state spends ammo and blocks fire during cooldown", () => {
  const weapon = WEAPON_CONFIG.deagle_golden;
  let state = createWeaponState(WEAPON_ORDER, WEAPON_CONFIG);
  const shot = fireWeapon(state, weapon);
  assert.equal(shot.fired, true);
  state = shot.state;
  assert.equal(state.ammo.deagle_golden, WEAPON_CONFIG.deagle_golden.magazineSize - 1);
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
  // 战术换弹（弹匣有余弹），时长来自 reloadTactical.duration
  state = updateWeaponState(reload.state, weapon.reloadTactical.duration, WEAPON_CONFIG);
  assert.equal(state.reloading, false);
  assert.equal(state.ammo.m4, 30);
});

test("startReload distinguishes empty vs tactical reload", () => {
  const weapon = WEAPON_CONFIG.ak47;
  // 空仓换弹：弹匣打空
  let state = selectWeapon(createWeaponState(WEAPON_ORDER, WEAPON_CONFIG), "ak47", WEAPON_CONFIG);
  state = { ...state, ammo: { ...state.ammo, ak47: 0 } };
  let reload = startReload(state, weapon);
  assert.equal(reload.started, true);
  assert.equal(reload.isEmpty, true);
  assert.equal(reload.reloadDuration, weapon.reloadEmpty.duration);

  // 战术换弹：弹匣有余弹
  state = selectWeapon(createWeaponState(WEAPON_ORDER, WEAPON_CONFIG), "ak47", WEAPON_CONFIG);
  state = fireWeapon(state, weapon).state;  // 打掉 1 发，剩 29 发
  reload = startReload(state, weapon);
  assert.equal(reload.started, true);
  assert.equal(reload.isEmpty, false);
  assert.equal(reload.reloadDuration, weapon.reloadTactical.duration);

  // 空仓换弹时长应大于战术换弹时长
  assert.ok(
    weapon.reloadEmpty.duration > weapon.reloadTactical.duration,
    "empty reload should take longer than tactical"
  );
});

test("all weapons have reloadEmpty and reloadTactical configs", () => {
  for (const id of WEAPON_ORDER) {
    const weapon = WEAPON_CONFIG[id];
    assert.ok(weapon.reloadEmpty, `${id} has reloadEmpty config`);
    assert.ok(weapon.reloadTactical, `${id} has reloadTactical config`);
    assert.ok(weapon.reloadEmpty.duration > 0, `${id} reloadEmpty duration`);
    assert.ok(weapon.reloadTactical.duration > 0, `${id} reloadTactical duration`);
    assert.ok(weapon.reloadEmpty.feedTime > 0, `${id} reloadEmpty feedTime`);
    assert.ok(weapon.reloadTactical.feedTime > 0, `${id} reloadTactical feedTime`);
    assert.ok(
      ["single", "segmented"].includes(weapon.reloadEmpty.soundScheme),
      `${id} reloadEmpty soundScheme`
    );
    assert.ok(
      ["single", "segmented"].includes(weapon.reloadTactical.soundScheme),
      `${id} reloadTactical soundScheme`
    );
    assert.ok(weapon.reloadEmptySound, `${id} has reloadEmptySound`);
    assert.ok(weapon.reloadTacticalSound, `${id} has reloadTacticalSound`);
    assert.ok(weapon.drawSound, `${id} has drawSound`);
  }
});

test("automatic weapons can fire again while semi automatic weapons stay locked", () => {
  let autoState = selectWeapon(createWeaponState(WEAPON_ORDER, WEAPON_CONFIG), "ak47", WEAPON_CONFIG);
  const autoWeapon = WEAPON_CONFIG.ak47;
  autoState = fireWeapon(autoState, autoWeapon).state;
  autoState = updateWeaponState(autoState, autoWeapon.fireInterval, WEAPON_CONFIG);
  assert.equal(canFireWeapon(autoState, autoWeapon), true);

  let semiState = createWeaponState(WEAPON_ORDER, WEAPON_CONFIG);
  const semiWeapon = WEAPON_CONFIG.deagle_golden;
  semiState = fireWeapon(semiState, semiWeapon).state;
  semiState = updateWeaponState(semiState, semiWeapon.fireInterval, WEAPON_CONFIG);
  assert.equal(canFireWeapon(semiState, semiWeapon), false);
  semiState = setTriggerHeld(semiState, false);
  assert.equal(canFireWeapon(semiState, semiWeapon), true);
});

test("switching weapons preserves each magazine and cancels reload", () => {
  // createWeaponState 默认 currentWeaponId = WEAPON_ORDER[0] = "m4"，需先切换到 deagle_golden
  let state = selectWeapon(createWeaponState(WEAPON_ORDER, WEAPON_CONFIG), "deagle_golden", WEAPON_CONFIG);
  state = fireWeapon(state, WEAPON_CONFIG.deagle_golden).state;
  state = startReload(state, WEAPON_CONFIG.deagle_golden).state;
  state = selectWeapon(state, "m4", WEAPON_CONFIG);
  assert.equal(state.currentWeaponId, "m4");
  assert.equal(state.reloading, false);
  assert.equal(state.ammo.deagle_golden, WEAPON_CONFIG.deagle_golden.magazineSize - 1);
  assert.equal(state.ammo.m4, WEAPON_CONFIG.m4.magazineSize);
});
