import test from "node:test";
import assert from "node:assert/strict";
import { WEAPON_CONFIG, WEAPON_ORDER, GAME_CONFIG } from "../src/config.js";
import { createStats } from "../src/weaponLab.js";
import { buildInventoryViewData } from "../src/inventoryView.js";

// 构造最小可用 state，供 buildInventoryViewData 读取
function makeState(weaponId = "glock17") {
  return {
    weapons: {
      currentWeaponId: weaponId,
      ammo: { [weaponId]: WEAPON_CONFIG[weaponId].magazineSize },
      reloading: false,
    },
    score: 120,
    hits: 8,
    combo: 3,
    bestCombo: 5,
    timeLeft: 42,
    baseHealth: 3,
  };
}

// 构造最小可用 weaponLab mock，含 createStats 真实统计对象
function makeLab(mode = "idle") {
  const stats = createStats();
  return {
    stats,
    getStats: () => stats.snapshot(),
    mode,
    dummies: [],
    enemies: [],
    movingTargets: [],
    enemyTimeLeft: 0,
    enemyHP: 0,
    enemyResult: null,
  };
}

test("buildInventoryViewData 靶场模式返回 rangeState 而非 stats", () => {
  const state = makeState();
  const view = buildInventoryViewData(state, null, null);
  assert.equal(view.stats, null, "靶场模式 stats 应为 null");
  assert.ok(view.rangeState, "靶场模式 rangeState 应存在");
  assert.equal(view.rangeState.score, 120);
  assert.equal(view.rangeState.hits, 8);
  assert.equal(view.rangeState.combo, 3);
  assert.equal(view.rangeState.bestCombo, 5);
  assert.equal(view.rangeState.timeLeft, 42);
  assert.equal(view.rangeState.baseHealth, 3);
  assert.equal(view.rangeState.baseMaxHealth, GAME_CONFIG.baseHealth);
});

test("buildInventoryViewData weaponLab 模式返回 stats 三层", () => {
  const state = makeState();
  const lab = makeLab("static");
  // 放一个假死靶让 displayCount=1
  lab.dummies.push({ group: { metadata: { dead: false } } });
  const view = buildInventoryViewData(state, lab, null);
  assert.ok(view.stats, "weaponLab 模式 stats 应存在");
  assert.equal(view.rangeState, null, "weaponLab 模式 rangeState 应为 null");
  assert.ok(view.stats.magazine, "stats.magazine 层应存在");
  assert.ok(view.stats.session, "stats.session 层应存在");
  assert.ok(view.stats.dummy, "stats.dummy 层应存在");
  assert.ok(view.stats.enemy, "stats.enemy 层应存在");
  assert.ok(view.stats.moving, "stats.moving 层应存在");
  assert.equal(view.stats.mode, "static");
  assert.equal(view.stats.displayCount, 1, "displayCount 应等于活态死靶数");
});

test("buildInventoryViewData weaponLab 模式 enemyState fallback 从 lab 读取", () => {
  const state = makeState();
  const lab = makeLab("enemy");
  lab.enemyTimeLeft = 30;
  lab.enemyHP = 3;
  lab.enemyResult = null;
  const view = buildInventoryViewData(state, lab, null);
  assert.equal(view.stats.enemyState.timeLeft, 30);
  assert.equal(view.stats.enemyState.hp, 3);
  assert.equal(view.stats.enemyState.result, null);
});

test("buildInventoryViewData weaponLab 模式 enemyState 优先用传入参数", () => {
  const state = makeState();
  const lab = makeLab("enemy");
  lab.enemyTimeLeft = 30;
  const customEnemy = { timeLeft: 10, hp: 2, result: "victory", playerMaxHP: 5 };
  const view = buildInventoryViewData(state, lab, customEnemy);
  assert.equal(view.stats.enemyState.timeLeft, 10, "应优先用传入的 enemyState");
  assert.equal(view.stats.enemyState.hp, 2);
  assert.equal(view.stats.enemyState.result, "victory");
});

test("buildInventoryViewData weaponSlots 长度等于 WEAPON_ORDER 长度", () => {
  const state = makeState();
  const view = buildInventoryViewData(state, null, null);
  assert.equal(view.weaponSlots.length, WEAPON_ORDER.length);
  // 每个 slot 应有 id/label/iconPath/slot/selected 字段
  for (let i = 0; i < view.weaponSlots.length; i += 1) {
    const slot = view.weaponSlots[i];
    assert.equal(slot.id, WEAPON_ORDER[i]);
    assert.equal(slot.label, WEAPON_CONFIG[WEAPON_ORDER[i]].label);
    assert.equal(slot.slot, i + 1, "slot 序号应从 1 开始");
    assert.equal(typeof slot.selected, "boolean");
  }
});

test("buildInventoryViewData 当前武器 selected 标记正确", () => {
  const state = makeState("m4");
  const view = buildInventoryViewData(state, null, null);
  const selectedSlots = view.weaponSlots.filter((s) => s.selected);
  assert.equal(selectedSlots.length, 1, "应有且仅有 1 个 slot 被选中");
  assert.equal(selectedSlots[0].id, "m4");
  assert.equal(view.currentWeapon.id, "m4");
});

test("buildInventoryViewData fireMode 字段：automatic → 自动，半自动 → 半自动", () => {
  // glock17 是半自动
  const semiState = makeState("glock17");
  const semiView = buildInventoryViewData(semiState, null, null);
  assert.equal(semiView.currentWeapon.fireMode, "半自动");

  // m4 是自动
  const autoState = makeState("m4");
  const autoView = buildInventoryViewData(autoState, null, null);
  assert.equal(autoView.currentWeapon.fireMode, "自动");
});

test("buildInventoryViewData fireRate 从 fireInterval 正确换算", () => {
  // glock17 fireInterval = 60/400 = 0.15s，fireRate = 60/0.15/60 = 6.67 → 取 1 位小数 = 6.7
  const state = makeState("glock17");
  const view = buildInventoryViewData(state, null, null);
  const expected = Math.round((60 / WEAPON_CONFIG.glock17.fireInterval / 60) * 10) / 10;
  assert.equal(view.currentWeapon.fireRate, expected);
  assert.equal(view.currentWeapon.magazineSize, WEAPON_CONFIG.glock17.magazineSize);
  assert.equal(view.currentWeapon.bodyDamage, WEAPON_CONFIG.glock17.bodyDamage);
  assert.equal(view.currentWeapon.recoil, WEAPON_CONFIG.glock17.recoil);
});

test("buildInventoryViewData character.previewSrc 指向 steve.png", () => {
  const state = makeState();
  const view = buildInventoryViewData(state, null, null);
  assert.ok(view.character.previewSrc.includes("steve.png"));
});

test("buildInventoryViewData displayCount 在 moving 模式排除 dead 动靶", () => {
  const state = makeState();
  const lab = makeLab("moving");
  // 2 个活态 + 1 个死态
  lab.movingTargets = [
    { group: { metadata: { dead: false } } },
    { group: { metadata: { dead: false } } },
    { group: { metadata: { dead: true } } },
  ];
  const view = buildInventoryViewData(state, lab, null);
  assert.equal(view.stats.displayCount, 2, "moving 模式 displayCount 应排除 dead 动靶");
});

test("buildInventoryViewData displayCount 在 enemy 模式用 enemies.length", () => {
  const state = makeState();
  const lab = makeLab("enemy");
  lab.enemies = [{}, {}, {}];
  const view = buildInventoryViewData(state, lab, null);
  assert.equal(view.stats.displayCount, 3, "enemy 模式 displayCount 应等于 enemies.length");
});

// 新增武器 selected 标记和字段完整性验证，确保新武器不会导致 GUI 崩溃
// 第一人称排查阶段 rpg7 已从 WEAPON_ORDER 过滤，仅验证保留的新枪 m107/m95
test("buildInventoryViewData 新武器 m107/m95 selected 标记正确且字段完整", () => {
  for (const wid of ["m107", "m95"]) {
    const state = makeState(wid);
    const view = buildInventoryViewData(state, null, null);
    const selectedSlots = view.weaponSlots.filter((s) => s.selected);
    assert.equal(selectedSlots.length, 1, `${wid} 应有且仅有 1 个 slot 被选中`);
    assert.equal(selectedSlots[0].id, wid);
    assert.equal(view.currentWeapon.id, wid);
    assert.ok(view.currentWeapon.magazineSize > 0, `${wid} magazineSize 应有值`);
    assert.ok(typeof view.currentWeapon.fireRate === "number", `${wid} fireRate 应为数字`);
    assert.ok(typeof view.currentWeapon.bodyDamage === "number", `${wid} bodyDamage 应为数字`);
    assert.ok(typeof view.currentWeapon.recoil === "number", `${wid} recoil 应为数字`);
    assert.ok(["自动", "半自动"].includes(view.currentWeapon.fireMode), `${wid} fireMode 应有效`);
  }
});

// 参与运行武器全部字段完整性验证，确保任意武器切换都不会导致 GUI 崩溃
test("buildInventoryViewData 当前武器列表 currentWeapon 字段完整", () => {
  for (const wid of WEAPON_ORDER) {
    const state = makeState(wid);
    const view = buildInventoryViewData(state, null, null);
    const w = view.currentWeapon;
    assert.equal(w.id, wid);
    assert.ok(w.label, `${wid} label 不应为空`);
    assert.ok(w.magazineSize > 0, `${wid} magazineSize 应 > 0`);
    assert.ok(w.fireRate >= 0, `${wid} fireRate 应 >= 0`);
    assert.ok(w.bodyDamage > 0, `${wid} bodyDamage 应 > 0`);
    assert.ok(w.recoil >= 0, `${wid} recoil 应 >= 0`);
    assert.ok(["自动", "半自动"].includes(w.fireMode), `${wid} fireMode 应有效`);
  }
});
