import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { WEAPON_CONFIG } from "../src/config.js";
import { parseTaczAnimationJson, _TEST_ONLY as PARSER_TEST_ONLY } from "../src/taczAnimationParser.js";
import {
  canPlayWeaponAction,
  createWeaponAnimationController,
  playWeaponAnimationAction,
  sampleWeaponAnimationPose,
  updateWeaponAnimation,
  _TEST_ONLY as CTRL_TEST_ONLY,
} from "../src/weaponAnimationController.js";

const { resolveBoneWithAlias, resetTaczBones, getAnimationName } = CTRL_TEST_ONLY;

const ROOT = process.cwd();

function makeController(weaponId) {
  const config = WEAPON_CONFIG[weaponId];
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, "public", config.v2AnimationProfile.animationPath), "utf8"));
  const parsed = parseTaczAnimationJson(json, config.v2AnimationProfile.animationPath);
  PARSER_TEST_ONLY.setAnimationCache(config.v2AnimationProfile.animationPath, parsed);
  const controller = createWeaponAnimationController(weaponId, config);
  controller.animationData = parsed;
  return controller;
}

test("draw 动作结束后回到 idle", () => {
  const controller = makeController("m4");
  assert.equal(playWeaponAnimationAction(controller, "draw", { force: true }), true);
  const pose = updateWeaponAnimation(controller, 10);
  assert.equal(controller.action, "idle");
  assert.equal(pose.animationName, "static_idle");
});

test("reload 期间不能 shoot 或 inspect 打断", () => {
  const controller = makeController("ak47");
  assert.equal(playWeaponAnimationAction(controller, "reload_empty", { force: true }), true);
  assert.equal(canPlayWeaponAction(controller, "shoot"), false);
  assert.equal(playWeaponAnimationAction(controller, "inspect"), false);
  assert.equal(controller.action, "reload_empty");
});

test("reload_empty 和 reload_tactical 使用 profile 中对应动画", () => {
  const controller = makeController("p90");
  playWeaponAnimationAction(controller, "reload_empty", { force: true });
  assert.equal(controller.animationName, "reload_empty");
  playWeaponAnimationAction(controller, "reload_tactical", { force: true });
  assert.equal(controller.animationName, "reload_tactical");
});

test("AWP/M95 能播放 bolt，普通 M4 缺 bolt 时返回错误", () => {
  const awp = makeController("awp");
  assert.equal(playWeaponAnimationAction(awp, "bolt", { force: true }), true);
  assert.equal(awp.animationName, "bolt");
  const m95 = makeController("m95");
  assert.equal(playWeaponAnimationAction(m95, "bolt", { force: true }), true);
  const m4 = makeController("m4");
  assert.equal(playWeaponAnimationAction(m4, "bolt", { force: true }), false);
  assert.equal(m4.status, "error");
});

test("static_idle 输出左右手 position/rotation/scale 且坐标有限", () => {
  const controller = makeController("deagle_golden");
  const pose = sampleWeaponAnimationPose(controller);
  for (const hand of [pose.lefthand, pose.righthand]) {
    assert.ok(hand, "hand pose exists");
    for (const vector of [hand.position, hand.rotation, hand.scale]) {
      assert.equal(vector.length, 3);
      assert.ok(vector.every(Number.isFinite), "hand vector finite");
    }
  }
});

test("RPG7 reload 走装填物 held 逻辑", () => {
  const controller = makeController("rpg7");
  playWeaponAnimationAction(controller, "reload_empty", { force: true });
  controller.time = 1.0;
  const pose = sampleWeaponAnimationPose(controller);
  assert.ok(pose.held, "RPG7 has held rocket/mag_hand pose");
});

test("shoot 可以排队 bolt 动作", () => {
  const controller = makeController("m95");
  assert.equal(playWeaponAnimationAction(controller, "shoot", { force: true, queueNext: "bolt" }), true);
  updateWeaponAnimation(controller, 10);
  assert.equal(controller.action, "bolt");
  assert.equal(controller.animationName, "bolt");
});

// ===== 原生路径测试（TaCZ native geo）=====

// 辅助：创建带 taczBoneMap 的原生 controller
function makeNativeController(weaponId) {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const controller = makeController(weaponId);
  controller.engine = engine;
  controller.scene = scene;
  // 创建 boneMap，包含 root/righthand/lefthand/mag_and_lefthand 等 TransformNode
  const boneMap = new Map();
  for (const name of ["root", "righthand", "lefthand", "constraint", "mag_and_lefthand", "slide2"]) {
    boneMap.set(name, new BABYLON.TransformNode(`${weaponId}-${name}`, scene));
  }
  controller.taczBoneMap = boneMap;
  return controller;
}

function disposeNativeController(controller) {
  controller.scene?.dispose();
  controller.engine?.dispose();
}

test("原生武器 sampleWeaponAnimationPose 返回 isTaczNative: true", () => {
  const controller = makeNativeController("deagle_golden");
  try {
    const pose = sampleWeaponAnimationPose(controller);
    assert.equal(pose.valid, true);
    assert.equal(pose.isTaczNative, true);
    assert.ok(pose.bones, "pose.bones 存在");
    assert.ok(pose.idleBones, "pose.idleBones 存在");
    assert.ok(pose.boneAliases, "pose.boneAliases 存在");
    assert.equal(pose.boneAliases.Deagle, "Deagle_golden", "deagle 别名正确");
  } finally {
    disposeNativeController(controller);
  }
});

test("resolveBoneWithAlias 支持直接查找", () => {
  const bones = { root: { position: [0, 0, 0] } };
  assert.equal(resolveBoneWithAlias(bones, "root", {}), "root");
});

test("resolveBoneWithAlias 支持别名", () => {
  const bones = { gun_barrel: { position: [0, 0, 0] } };
  assert.equal(resolveBoneWithAlias(bones, "m95_barrel", { m95_barrel: "gun_barrel" }), "gun_barrel");
});

test("resolveBoneWithAlias 支持 fallback 数组", () => {
  const bones = { bolt: { position: [0, 0, 0] } };
  assert.equal(resolveBoneWithAlias(bones, ["m95_bolt", "bolt"], {}), "bolt");
});

test("resolveBoneWithAlias 未找到返回 null", () => {
  const bones = { root: { position: [0, 0, 0] } };
  assert.equal(resolveBoneWithAlias(bones, "nonexistent", {}), null);
});

test("resetTaczBones 归位所有 bone", () => {
  const controller = makeNativeController("m95");
  try {
    // 把所有 node 设为非零值
    for (const node of controller.taczBoneMap.values()) {
      node.position.set(1, 2, 3);
      node.rotation.set(0.5, 0.6, 0.7);
      node.scaling.set(2, 2, 2);
    }
    resetTaczBones(controller);
    for (const [name, node] of controller.taczBoneMap.entries()) {
      assert.equal(node.position.x, 0, `${name} position.x 归零`);
      assert.equal(node.position.y, 0, `${name} position.y 归零`);
      assert.equal(node.position.z, 0, `${name} position.z 归零`);
      assert.equal(node.rotation.x, 0, `${name} rotation.x 归零`);
      assert.equal(node.rotation.y, 0, `${name} rotation.y 归零`);
      assert.equal(node.rotation.z, 0, `${name} rotation.z 归零`);
      assert.equal(node.scaling.x, 1, `${name} scaling.x 归一`);
      assert.equal(node.scaling.y, 1, `${name} scaling.y 归一`);
      assert.equal(node.scaling.z, 1, `${name} scaling.z 归一`);
    }
  } finally {
    disposeNativeController(controller);
  }
});

test("原生武器动画结束后 bone 归位", () => {
  const controller = makeNativeController("deagle_golden");
  try {
    assert.equal(playWeaponAnimationAction(controller, "draw", { force: true }), true);
    // 把 boneMap 中的 node 设为非零值
    for (const node of controller.taczBoneMap.values()) {
      node.position.set(0.5, -0.3, 0.2);
      node.rotation.set(0.1, 0.2, 0.3);
    }
    // 让动画播放结束（draw 动画很短，传入大 delta 确保结束）
    updateWeaponAnimation(controller, 10);
    assert.equal(controller.action, "idle", "动画结束后回到 idle");
    // 断言所有 bone 归位
    for (const [name, node] of controller.taczBoneMap.entries()) {
      assert.equal(node.position.x, 0, `${name} position.x 归零`);
      assert.equal(node.position.y, 0, `${name} position.y 归零`);
      assert.equal(node.position.z, 0, `${name} position.z 归零`);
    }
  } finally {
    disposeNativeController(controller);
  }
});

// ===== 动画接线测试 =====
// 模拟真实 main.js 流程：weapon model controller 有 taczBoneMap，animationController 没有
// 惰性同步后 animationController 应能走原生 bone 动画路径

test("真实接线：惰性同步后 animationController 走原生 isTaczNative 路径", () => {
  // 1. 创建 animationController（模拟 main.js 的 createWeaponAnimationController）
  const animationController = makeController("deagle_golden");
  // 此时 animationController.taczBoneMap 应为 undefined（真实 main.js 不注入）
  assert.equal(animationController.taczBoneMap, undefined, "同步前 animationController 无 taczBoneMap");

  // 2. 创建 weapon model controller（模拟 loadWeaponModel 加载完成后的状态）
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const boneMap = new Map();
  for (const name of ["root", "righthand", "lefthand", "constraint", "mag_and_lefthand", "slide2"]) {
    boneMap.set(name, new BABYLON.TransformNode(`deagle_golden-${name}`, scene));
  }
  const weaponModelController = {
    isTaczNative: true,
    taczBoneMap: boneMap,
    taczGeoModel: { root: new BABYLON.TransformNode("deagle_golden-geo-root", scene) },
    animationController, // 引用 animationController（模拟 main.js 中 controller.animationController）
  };

  try {
    // 3. 同步前：sampleWeaponAnimationPose 不应走原生路径
    const poseBeforeSync = sampleWeaponAnimationPose(animationController);
    assert.equal(poseBeforeSync.isTaczNative, undefined, "同步前 isTaczNative 应为 undefined");

    // 4. 执行惰性同步（模拟 main.js update 循环中的同步逻辑）
    if (weaponModelController.isTaczNative && weaponModelController.taczBoneMap && !weaponModelController.animationController.taczBoneMap) {
      weaponModelController.animationController.taczBoneMap = weaponModelController.taczBoneMap;
      weaponModelController.animationController.taczGeoModel = weaponModelController.taczGeoModel;
    }

    // 5. 同步后：sampleWeaponAnimationPose 应走原生路径
    const poseAfterSync = sampleWeaponAnimationPose(animationController);
    assert.equal(poseAfterSync.valid, true, "同步后 pose.valid");
    assert.equal(poseAfterSync.isTaczNative, true, "同步后 isTaczNative === true");
    assert.ok(poseAfterSync.bones, "同步后 pose.bones 存在");
    assert.ok(poseAfterSync.idleBones, "同步后 pose.idleBones 存在");
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

// ===== Phase 6: ads_in/ads_out 动画状态扩展测试 =====

test("canPlayWeaponAction 允许 ads_in 打断 idle", () => {
  const controller = makeController("glock17");
  assert.equal(playWeaponAnimationAction(controller, "draw", { force: true }), true);
  // draw 结束后回到 idle
  updateWeaponAnimation(controller, 10);
  assert.equal(controller.action, "idle");
  // ads_in 优先级 1 > idle 优先级 0，能打断 idle
  assert.equal(canPlayWeaponAction(controller, "ads_in"), true);
});

test("canPlayWeaponAction 不允许 ads_in 打断 reload_empty", () => {
  const controller = makeController("m4");
  assert.equal(playWeaponAnimationAction(controller, "reload_empty", { force: true }), true);
  // reload_empty 优先级 5 > ads_in 优先级 1，ads_in 不能打断
  assert.equal(canPlayWeaponAction(controller, "ads_in"), false);
  assert.equal(controller.action, "reload_empty");
});

test("canPlayWeaponAction 允许 shoot 打断 ads_in", () => {
  const controller = makeController("ak47");
  // 手动设置 controller.action = "ads_in" 模拟开镜状态（实际 ads_in 动画未在 profile 配置）
  controller.action = "ads_in";
  // shoot 优先级 2 > ads_in 优先级 1，shoot 能打断 ads_in
  assert.equal(canPlayWeaponAction(controller, "shoot"), true);
});

test("getAnimationName 映射 ads_in → adsIn", () => {
  const profile = { adsIn: "custom_ads_in_anim", adsOut: "custom_ads_out_anim" };
  assert.equal(getAnimationName(profile, "ads_in"), "custom_ads_in_anim");
  assert.equal(getAnimationName(profile, "ads_out"), "custom_ads_out_anim");
});

test("getAnimationName ads_in 在 profile 无 adsIn 字段时返回 null", () => {
  // 现有 9 把武器的 profile 没有 adsIn/adsOut 字段，应返回 null（不静默回退到其他动画）
  const controller = makeController("p90");
  assert.equal(getAnimationName(controller.profile, "ads_in"), null);
  assert.equal(getAnimationName(controller.profile, "ads_out"), null);
});

test("playWeaponAnimationAction ads_in 缺少动画时返回 false 并设置诊断", () => {
  // 缺少 TaCZ 动画时必须显示诊断，不允许静默回退到旧手写动画
  const controller = makeController("glock17");
  const result = playWeaponAnimationAction(controller, "ads_in", { force: true });
  assert.equal(result, false, "ads_in 缺少动画时返回 false");
  assert.equal(controller.status, "error", "status 设为 error");
  assert.ok(controller.warning, "warning 包含诊断信息");
  assert.ok(controller.warning.includes("ads_in"), "warning 提及 ads_in");
});
