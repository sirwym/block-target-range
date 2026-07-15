import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import {
  parseDisplayJson,
  createTaczFirstPersonWeapon,
  diagnoseFirstPersonWeapon,
  updateFunctionalHandAnchors,
  updateTaczFirstPersonWeapon,
} from "../src/taczFirstPersonAdapter.js";
import { resolveTaczNamespace } from "../src/taczWeaponLoader.js";
import {
  ASSET_PATHS,
  WEAPON_ORDER,
  WEAPON_CONFIG,
  WEAPON_CALIBRATION,
  WEAPON_MARKER_CALIBRATION,
  PHASE2_STATIC_POSE_CALIBRATION,
} from "../src/config.js";
import { createHands, _setSteveTextureForTest } from "../src/handModel.js";

const ROOT = path.resolve("public");

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, filePath), "utf8"));
}

// 用 64×64 RawTexture 模拟 steve.png，避免 Node.js 下 DynamicTexture 需要 OffscreenCanvas
function injectFakeSteveTexture(scene) {
  const width = 64;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data.set([200, 170, 140, 255], i * 4);
  }
  const texture = BABYLON.RawTexture.CreateRGBATexture(
    data, width, height, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE
  );
  _setSteveTextureForTest(texture);
  return texture;
}

function makeScene() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.UniversalCamera("test-camera", new BABYLON.Vector3(0, 0, 0), scene);
  injectFakeSteveTexture(scene);
  return { engine, scene, camera };
}

// 比较 Babylon Vector3 与 [x,y,z] 数组是否在 1e-4 容差内相等
function assertVec3Close(actual, expected, message) {
  assert.ok(Math.abs(actual.x - expected[0]) < 0.0001, `${message} x`);
  assert.ok(Math.abs(actual.y - expected[1]) < 0.0001, `${message} y`);
  assert.ok(Math.abs(actual.z - expected[2]) < 0.0001, `${message} z`);
}

function assertQuaternionClose(actual, expected, message) {
  assert.ok(actual, `${message} actual quaternion exists`);
  assert.ok(Math.abs(actual.x - expected.x) < 0.0001, `${message} x`);
  assert.ok(Math.abs(actual.y - expected.y) < 0.0001, `${message} y`);
  assert.ok(Math.abs(actual.z - expected.z) < 0.0001, `${message} z`);
  assert.ok(Math.abs(actual.w - expected.w) < 0.0001, `${message} w`);
}

// === resolveTaczNamespace 导出测试 ===

test("resolveTaczNamespace 已从 taczWeaponLoader 导出", () => {
  assert.equal(typeof resolveTaczNamespace, "function");
  assert.equal(resolveTaczNamespace("tacz:gun/glock_17_geo"), "assets/tacz/geo_models/gun/glock_17_geo.json");
  assert.equal(resolveTaczNamespace("tacz:gun/uv/glock_17"), "assets/tac/textures/glock_17/glock_17.png");
  assert.equal(resolveTaczNamespace("tacz:flash/muzzle_flash"), "assets/tac/effects/muzzle_flash.png");
  assert.equal(resolveTaczNamespace("not:tacz"), null);
  assert.equal(resolveTaczNamespace(null), null);
});

// === parseDisplayJson 测试 ===

for (const weaponId of WEAPON_ORDER) {
  test(`parseDisplayJson 解析 ${weaponId} 的 model/texture/animation`, () => {
    const display = loadJson(ASSET_PATHS.taczDisplayJson[weaponId]);
    const result = parseDisplayJson(display, weaponId);

    assert.equal(result.weaponId, weaponId);
    assert.ok(result.model.namespace, `${weaponId} model 命名空间存在`);
    assert.ok(result.model.geoPath, `${weaponId} geo 路径解析成功`);
    assert.ok(result.model.geoPath.endsWith("_geo.json"), `${weaponId} geo 路径以 _geo.json 结尾`);
    assert.ok(result.texture.namespace, `${weaponId} texture 命名空间存在`);
    assert.ok(result.texture.texturePath, `${weaponId} texture 路径解析成功`);
    assert.ok(result.texture.texturePath.endsWith(".png"), `${weaponId} texture 路径以 .png 结尾`);
    assert.ok(result.animation.animationPath, `${weaponId} animation 路径存在`);
    assert.ok(result.animation.playerAnimationPath, `${weaponId} player animation 路径存在`);
  });

  test(`parseDisplayJson ${weaponId} 的 display.json 字段完整性`, () => {
    const display = loadJson(ASSET_PATHS.taczDisplayJson[weaponId]);
    const result = parseDisplayJson(display, weaponId);

    assert.ok(result.transform, `${weaponId} transform 存在`);
    assert.ok(typeof result.transform === "object", `${weaponId} transform 是对象`);
    // sounds/slot/muzzleFlash/shell 可选，但字段必须存在（可为空）
    assert.equal("sounds" in result, true, `${weaponId} sounds 字段存在`);
    assert.equal("slot" in result, true, `${weaponId} slot 字段存在`);
    assert.equal("muzzleFlash" in result, true, `${weaponId} muzzleFlash 字段存在`);
    assert.equal("shell" in result, true, `${weaponId} shell 字段存在`);
  });
}

test("parseDisplayJson 对缺失 model 字段生成 error 诊断", () => {
  const brokenDisplay = { texture: "tacz:gun/uv/glock_17", use_default_animation: "pistol" };
  const result = parseDisplayJson(brokenDisplay, "test_weapon");
  const modelError = result.diagnostics.find((d) => d.field === "model" && d.severity === "error");
  assert.ok(modelError, "缺失 model 字段时生成 error 诊断");
});

test("parseDisplayJson 对缺失 texture 字段生成 error 诊断", () => {
  const brokenDisplay = { model: "tacz:gun/glock_17_geo", use_default_animation: "pistol" };
  const result = parseDisplayJson(brokenDisplay, "test_weapon");
  const texError = result.diagnostics.find((d) => d.field === "texture" && d.severity === "error");
  assert.ok(texError, "缺失 texture 字段时生成 error 诊断");
});

test("parseDisplayJson 对缺失 use_default_animation 生成 warn 诊断（不静默回退）", () => {
  const display = {
    model: "tacz:gun/deagle_golden_geo",
    texture: "tacz:gun/uv/deagle_golden",
  };
  const result = parseDisplayJson(display, "deagle_golden");
  const warn = result.diagnostics.find((d) => d.field === "use_default_animation" && d.severity === "warn");
  assert.ok(warn, "缺失 use_default_animation 时生成 warn 诊断");
  // 不静默回退：type 从 V2_WEAPON_ANIMATION_BINDINGS profile 推导（deagle_golden = pistol）
  assert.ok(result.animation.type, "缺失 use_default_animation 时仍有 type");
  assert.equal(result.animation.useDefaultAnimation, null, "useDefaultAnimation 为 null");
});

test("parseDisplayJson 对无效命名空间生成 error 诊断", () => {
  const display = {
    model: "invalid:namespace/deagle_golden_geo",
    texture: "tacz:gun/uv/deagle_golden",
    use_default_animation: "pistol",
  };
  const result = parseDisplayJson(display, "deagle_golden");
  const modelError = result.diagnostics.find((d) => d.field === "model" && d.severity === "error");
  assert.ok(modelError, "无效 model 命名空间时生成 error 诊断");
  assert.equal(result.model.geoPath, null, "无效命名空间返回 null geoPath");
});

// === createTaczFirstPersonWeapon 测试 ===

for (const weaponId of WEAPON_ORDER) {
  test(`createTaczFirstPersonWeapon 创建 ${weaponId} 返回完整 rig+model+hands+animationController`, () => {
    const display = loadJson(ASSET_PATHS.taczDisplayJson[weaponId]);
    const geo = loadJson(ASSET_PATHS.taczGeoModels[weaponId]);
    const { engine, scene, camera } = makeScene();

    try {
      const fpWeapon = createTaczFirstPersonWeapon(scene, camera, weaponId, display, geo, {
        weaponConfig: WEAPON_CONFIG[weaponId],
        textureUrl: ASSET_PATHS.taczWeaponTextures[weaponId],
      });

      // rig 存在且含完整层级
      assert.ok(fpWeapon.rig, `${weaponId} rig 存在`);
      assert.ok(fpWeapon.rig.cameraAnchor, `${weaponId} rig.cameraAnchor 存在`);
      assert.ok(fpWeapon.rig.weaponRoot, `${weaponId} rig.weaponRoot 存在`);
      assert.ok(fpWeapon.rig.modelRoot, `${weaponId} rig.modelRoot 存在`);
      assert.ok(fpWeapon.rig.aimAnchor, `${weaponId} rig.aimAnchor 存在`);
      assert.ok(fpWeapon.rig.muzzleAnchor, `${weaponId} rig.muzzleAnchor 存在`);
      assert.ok(fpWeapon.rig.rightGripAnchor, `${weaponId} rig.rightGripAnchor 存在`);
      assert.ok(fpWeapon.rig.leftGripAnchor, `${weaponId} rig.leftGripAnchor 存在`);
      assert.ok(fpWeapon.rig.rightHandRoot, `${weaponId} rig.rightHandRoot 存在`);
      assert.ok(fpWeapon.rig.leftHandRoot, `${weaponId} rig.leftHandRoot 存在`);
      assert.ok(fpWeapon.rig.heldItemRoot, `${weaponId} rig.heldItemRoot 存在`);

      // weapon 模型存在且挂到 rig.modelRoot
      assert.ok(fpWeapon.weapon, `${weaponId} weapon 存在`);
      assert.ok(fpWeapon.weapon.model, `${weaponId} weapon.model 存在`);
      assert.equal(
        fpWeapon.weapon.model.root.parent,
        fpWeapon.rig.modelRoot,
        `${weaponId} weapon.model.root.parent === rig.modelRoot`
      );

      // hands 存在且挂在 rig 层级下
      assert.ok(fpWeapon.hands, `${weaponId} hands 存在`);
      assert.ok(fpWeapon.hands.leftHand, `${weaponId} leftHand 存在`);
      assert.ok(fpWeapon.hands.rightHand, `${weaponId} rightHand 存在`);
      // 手部 root 重挂载到 rig.leftHandRoot/rightHandRoot（独立于 modelRoot 缩放）
      assert.equal(
        fpWeapon.hands.leftHand.root.parent,
        fpWeapon.rig.leftHandRoot,
        `${weaponId} leftHand.root.parent === rig.leftHandRoot`
      );
      assert.equal(
        fpWeapon.hands.rightHand.root.parent,
        fpWeapon.rig.rightHandRoot,
        `${weaponId} rightHand.root.parent === rig.rightHandRoot`
      );
      assert.deepEqual(
        fpWeapon.hands.leftHand.defaultPos,
        fpWeapon.functionalHandVisuals.leftHand.rootOffset,
        `${weaponId} leftHand.defaultPos 来自 lefthand_pos marker cube`
      );
      assert.deepEqual(
        fpWeapon.hands.rightHand.defaultPos,
        fpWeapon.functionalHandVisuals.rightHand.rootOffset,
        `${weaponId} rightHand.defaultPos 来自 righthand_pos marker cube`
      );

      // animationController 存在且已同步 taczBoneMap
      assert.ok(fpWeapon.animationController, `${weaponId} animationController 存在`);
      assert.ok(fpWeapon.animationController.taczBoneMap, `${weaponId} animationController.taczBoneMap 已同步`);
      assert.ok(fpWeapon.animationController.taczGeoModel, `${weaponId} animationController.taczGeoModel 已同步`);

      // 原生第一人称 marker 已提取并用于 rig calibration
      assert.ok(fpWeapon.firstPersonMarkers, `${weaponId} firstPersonMarkers 存在`);
      assert.ok(fpWeapon.firstPersonMarkers.idleView, `${weaponId} idle_view marker 存在`);
      assert.ok(fpWeapon.firstPersonMarkers.ironView, `${weaponId} iron_view marker 存在`);
      assert.ok(fpWeapon.firstPersonMarkers.leftHand, `${weaponId} lefthand_pos marker 存在`);
      assert.ok(fpWeapon.firstPersonMarkers.rightHand, `${weaponId} righthand_pos marker 存在`);
      assert.deepEqual(fpWeapon.rig.calibration.markerSource, {
        idleView: true,
        ironView: true,
        leftHand: true,
        rightHand: true,
      }, `${weaponId} rig calibration 使用 TaCZ 原生 marker`);

      // 兼容 weaponModel controller 接口
      assert.equal(fpWeapon.ready, true, `${weaponId} ready=true`);
      assert.equal(fpWeapon.failed, false, `${weaponId} failed=false`);
      assert.equal(fpWeapon.isTaczNative, true, `${weaponId} isTaczNative=true`);
      assert.ok(fpWeapon.partCount > 0, `${weaponId} partCount > 0`);
      assert.ok(fpWeapon.taczBoneMap, `${weaponId} taczBoneMap 存在`);
    } finally {
      engine.dispose();
    }
  });
}

// 枪口锚点自动定位：验证每把武器的 nativeMuzzleSource 来自 TaCZ geo muzzle bone，
// 且 rig.muzzleAnchor.position 与 WEAPON_CALIBRATION fallback 不完全相等（证明走了自动路径）。
for (const weaponId of WEAPON_ORDER) {
  test(`createTaczFirstPersonWeapon ${weaponId} 从 geo muzzle bone 自动定位 muzzleAnchor`, () => {
    const display = loadJson(ASSET_PATHS.taczDisplayJson[weaponId]);
    const geo = loadJson(ASSET_PATHS.taczGeoModels[weaponId]);
    const { engine, scene, camera } = makeScene();

    try {
      const fpWeapon = createTaczFirstPersonWeapon(scene, camera, weaponId, display, geo, {
        weaponConfig: WEAPON_CONFIG[weaponId],
        textureUrl: ASSET_PATHS.taczWeaponTextures[weaponId],
      });

      // 多数武器 geo 应包含 muzzle_pos/muzzle_flash/muzzle_default 之一
      assert.ok(fpWeapon.nativeMuzzleSource, `${weaponId} nativeMuzzleSource 不为 null`);
      assert.ok(
        ["muzzle_pos", "muzzle_flash", "muzzle_default"].includes(fpWeapon.nativeMuzzleSource.boneName),
        `${weaponId} nativeMuzzleSource.boneName 应为 TaCZ 枪口 bone`
      );
      assert.equal(Array.isArray(fpWeapon.nativeMuzzleSource.position), true, `${weaponId} nativeMuzzleSource.position 为数组`);
      assert.equal(fpWeapon.nativeMuzzleSource.position.length, 3, `${weaponId} nativeMuzzleSource.position 为 3 元数组`);

      // muzzleAnchor.position 应已从 geo bone 重新计算，不等于 WEAPON_CALIBRATION 静态 fallback
      const fallback = WEAPON_CALIBRATION[weaponId].muzzle;
      const pos = fpWeapon.rig.muzzleAnchor.position;
      const stillFallback = Math.abs(pos.x - fallback[0]) < 1e-6
        && Math.abs(pos.y - fallback[1]) < 1e-6
        && Math.abs(pos.z - fallback[2]) < 1e-6;
      assert.equal(stillFallback, false,
        `${weaponId} muzzleAnchor 应从 geo bone 重新计算，不应等于 fallback ${fallback}，实际 [${pos.x}, ${pos.y}, ${pos.z}]`);

      // 坐标有限
      assert.ok(Number.isFinite(pos.x), `${weaponId} muzzleAnchor.x 有限`);
      assert.ok(Number.isFinite(pos.y), `${weaponId} muzzleAnchor.y 有限`);
      assert.ok(Number.isFinite(pos.z), `${weaponId} muzzleAnchor.z 有限`);
    } finally {
      engine.dispose();
    }
  });
}

test("createTaczFirstPersonWeapon 模型在 modelRoot 下无额外偏移", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.deagle_golden);
  const geo = loadJson(ASSET_PATHS.taczGeoModels.deagle_golden);
  const { engine, scene, camera } = makeScene();

  try {
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "deagle_golden", display, geo, {
      weaponConfig: WEAPON_CONFIG.deagle_golden,
      textureUrl: ASSET_PATHS.taczWeaponTextures.deagle_golden,
    });
    // 模型 root 在 modelRoot 下的 position 应为 [0,0,0]（位置由 weaponRoot/hipPose 控制）
    assert.deepEqual(
      [fpWeapon.weapon.model.root.position.x, fpWeapon.weapon.model.root.position.y, fpWeapon.weapon.model.root.position.z],
      [0, 0, 0],
      "模型 root position 在 modelRoot 下为 [0,0,0]"
    );
    // scaling 应为 1（缩放由 modelRoot 提供）
    assert.equal(fpWeapon.weapon.model.root.scaling.x, 1, "模型 root scaling.x = 1");
    assert.equal(fpWeapon.weapon.model.root.scaling.y, 1, "模型 root scaling.y = 1");
    assert.equal(fpWeapon.weapon.model.root.scaling.z, 1, "模型 root scaling.z = 1");
  } finally {
    engine.dispose();
  }
});

test("createTaczFirstPersonWeapon rig 默认隐藏（setEnabled(false))", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.m4);
  const geo = loadJson(ASSET_PATHS.taczGeoModels.m4);
  const { engine, scene, camera } = makeScene();

  try {
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "m4", display, geo, {
      weaponConfig: WEAPON_CONFIG.m4,
      textureUrl: ASSET_PATHS.taczWeaponTextures.m4,
    });
    assert.equal(fpWeapon.rig.cameraAnchor.isEnabled(), false, "rig 默认隐藏");
    // setEnabled(true) 后可见
    fpWeapon.rig.setEnabled(true);
    assert.equal(fpWeapon.rig.cameraAnchor.isEnabled(), true, "rig.setEnabled(true) 后可见");
  } finally {
    engine.dispose();
  }
});

test("updateTaczFirstPersonWeapon 使用 adsProgress 在 hip 和 ads 之间插值", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.deagle_golden);
  const geo = loadJson(ASSET_PATHS.taczGeoModels.deagle_golden);
  const { engine, scene, camera } = makeScene();

  try {
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "deagle_golden", display, geo, {
      weaponConfig: WEAPON_CONFIG.deagle_golden,
      textureUrl: ASSET_PATHS.taczWeaponTextures.deagle_golden,
    });
    const hip = fpWeapon.rig.calibration.hipPose.position;
    const ads = fpWeapon.rig.adsPose.position;

    updateTaczFirstPersonWeapon(fpWeapon, { active: true, adsProgress: 0, recoil: 0, reloading: false });
    assert.ok(Math.abs(fpWeapon.rig.weaponRoot.position.x - hip[0]) < 0.0001, "adsProgress=0 使用 hip x");

    updateTaczFirstPersonWeapon(fpWeapon, { active: true, adsProgress: 1, recoil: 0, reloading: false });
    assert.ok(Math.abs(fpWeapon.rig.weaponRoot.position.x - ads[0]) < 0.0001, "adsProgress=1 使用 ads x");

    updateTaczFirstPersonWeapon(fpWeapon, { active: true, adsProgress: 0.5, recoil: 0, reloading: false });
    assert.ok(Math.abs(fpWeapon.rig.weaponRoot.position.x - (hip[0] + ads[0]) / 2) < 0.0001, "adsProgress=0.5 使用中间 x");
    assert.ok(Math.abs(fpWeapon.rig.weaponRoot.position.y - (hip[1] + ads[1]) / 2) < 0.0001, "adsProgress=0.5 使用中间 y");
    assert.ok(Math.abs(fpWeapon.rig.weaponRoot.position.z - (hip[2] + ads[2]) / 2) < 0.0001, "adsProgress=0.5 使用中间 z");
  } finally {
    engine.dispose();
  }
});

test("updateFunctionalHandAnchors 使用 _pos world matrix + Rz180 驱动 handRoot", () => {
  const { engine, scene } = makeScene();

  try {
    const weaponRoot = new BABYLON.TransformNode("test-weapon-root", scene);
    weaponRoot.position.set(0.3, -0.2, 0.5);
    weaponRoot.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, 0.4);

    const rightHandRoot = new BABYLON.TransformNode("test-right-hand-root", scene);
    rightHandRoot.parent = weaponRoot;
    const leftHandRoot = new BABYLON.TransformNode("test-left-hand-root", scene);
    leftHandRoot.parent = weaponRoot;

    const hands = createHands(scene, weaponRoot, "test", {});
    hands.rightHand.root.parent = rightHandRoot;
    hands.leftHand.root.parent = leftHandRoot;

    const boneParent = new BABYLON.TransformNode("test-bone-parent", scene);
    boneParent.position.set(1, 2, 3);
    boneParent.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, 0.25);
    const rightPos = new BABYLON.TransformNode("test-righthand-pos", scene);
    rightPos.parent = boneParent;
    rightPos.position.set(0.1, 0.2, 0.3);
    rightPos.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, 0.5);
    const leftPos = new BABYLON.TransformNode("test-lefthand-pos", scene);
    leftPos.parent = boneParent;
    leftPos.position.set(-0.2, 0.1, 0.4);
    leftPos.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, -0.2);

    const controller = {
      rig: { weaponRoot, rightHandRoot, leftHandRoot },
      hands,
      taczBoneMap: new Map([
        ["righthand_pos", rightPos],
        ["lefthand_pos", leftPos],
      ]),
    };

    assert.equal(updateFunctionalHandAnchors(controller), true, "functional hand anchors applied");

    weaponRoot.computeWorldMatrix(true);
    const weaponRootInv = weaponRoot.getWorldMatrix().clone();
    weaponRootInv.invert();
    rightPos.computeWorldMatrix(true);
    const expectedRight = BABYLON.Matrix.RotationZ(Math.PI).multiply(rightPos.getWorldMatrix()).multiply(weaponRootInv);
    const expectedScale = new BABYLON.Vector3();
    const expectedRot = new BABYLON.Quaternion();
    const expectedPos = new BABYLON.Vector3();
    expectedRight.decompose(expectedScale, expectedRot, expectedPos);

    assertVec3Close(rightHandRoot.position, [expectedPos.x, expectedPos.y, expectedPos.z], "rightHandRoot.position 来自完整矩阵");
    assertQuaternionClose(rightHandRoot.rotationQuaternion, expectedRot, "rightHandRoot.rotation 来自完整矩阵");
    assert.deepEqual(hands.rightHand.defaultPos, [0, 0, 0], "手 mesh 在 handRoot 下归零");
    assert.equal(updateFunctionalHandAnchors(controller, 1), true, "ADS 进度下 functional hand anchors applied");
    assert.ok(Math.abs(hands.rightHand.root.scaling.x - 0.35) < 0.0001, "ADS 时手部视觉缩小，避免遮挡机瞄");
  } finally {
    engine.dispose();
  }
});

test("createTaczFirstPersonWeapon 使用 _pos marker cube 偏移分离左右 Steve 手臂", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.ak47);
  const geo = loadJson(ASSET_PATHS.taczGeoModels.ak47);
  const { engine, scene, camera } = makeScene();

  try {
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "ak47", display, geo, {
      weaponConfig: WEAPON_CONFIG.ak47,
      textureUrl: ASSET_PATHS.taczWeaponTextures.ak47,
    });

    assert.deepEqual(
      fpWeapon.functionalHandVisuals.rightHand.rootOffset,
      [0.34375, 0, 0],
      "右手 rootOffset 来自 righthand_pos cube center"
    );
    assert.deepEqual(
      fpWeapon.functionalHandVisuals.leftHand.rootOffset,
      [-0.34375, 0, 0],
      "左手 rootOffset 来自 lefthand_pos cube center"
    );
    assert.deepEqual(fpWeapon.functionalHandVisuals.rightHand.scale, [0.54, 0.72, 0.72], "3px 宽手臂叠加默认 functional handScale");
    assert.deepEqual(fpWeapon.hands.rightHand.defaultPos, [0.34375, 0, 0], "右手 mesh 默认局部偏移写入 defaultPos");
    assert.equal(fpWeapon.hands.rightHand.palm.isEnabled(), false, "功能节点模式隐藏额外 palm，避免手臂压住 HUD");
    assert.equal(fpWeapon.hands.rightHand.wrist.isEnabled(), false, "功能节点模式隐藏额外 wrist，避免手臂压住 HUD");
  } finally {
    engine.dispose();
  }
});

// === diagnoseFirstPersonWeapon 测试 ===

for (const weaponId of WEAPON_ORDER) {
  test(`diagnoseFirstPersonWeapon ${weaponId} 资源链完整`, () => {
    const display = loadJson(ASSET_PATHS.taczDisplayJson[weaponId]);
    const diag = diagnoseFirstPersonWeapon(weaponId, { displayJson: display });

    assert.equal(diag.valid, true, `${weaponId} 资源链 valid=true`);
    assert.equal(diag.errors.length, 0, `${weaponId} 无 error: ${diag.errors.join("; ")}`);
    assert.ok(diag.resourceChain.display, `${weaponId} display 路径存在`);
    assert.ok(diag.resourceChain.geo, `${weaponId} geo 路径存在`);
    assert.ok(diag.resourceChain.texture, `${weaponId} texture 路径存在`);
    assert.ok(diag.resourceChain.animation, `${weaponId} animation 路径存在`);
    assert.ok(diag.resourceChain.playerAnimation, `${weaponId} playerAnimation 路径存在`);
  });
}

test("diagnoseFirstPersonWeapon 对未知 weaponId 报错", () => {
  const diag = diagnoseFirstPersonWeapon("unknown_weapon");
  assert.equal(diag.valid, false, "未知 weaponId valid=false");
  assert.ok(diag.errors.length > 0, "未知 weaponId 有 error");
});

test("diagnoseFirstPersonWeapon 检测 display.json 解析错误", () => {
  const brokenDisplay = { texture: "tacz:gun/uv/glock_17" }; // 缺 model
  const diag = diagnoseFirstPersonWeapon("deagle_golden", { displayJson: brokenDisplay });
  assert.equal(diag.valid, false, "display.json 缺 model 时 valid=false");
  const modelError = diag.errors.find((e) => e.includes("model"));
  assert.ok(modelError, "error 包含 model 字段缺失信息");
});

// === Phase 5: WEAPON_CALIBRATION 集成测试 ===

test("createTaczFirstPersonWeapon 使用 marker 覆盖 pose，但 rightGrip/leftGrip 保留 WEAPON_CALIBRATION 值", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.deagle_golden);
  const geo = loadJson(ASSET_PATHS.taczGeoModels.deagle_golden);
  const { engine, scene, camera } = makeScene();

  try {
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "deagle_golden", display, geo, {
      weaponConfig: WEAPON_CONFIG.deagle_golden,
      textureUrl: ASSET_PATHS.taczWeaponTextures.deagle_golden,
    });
    // hipPose.position 来自 idleView marker 经 markerScale + hipOffset 处理
    const expected = WEAPON_CALIBRATION.deagle_golden;
    const markerCal = WEAPON_MARKER_CALIBRATION.deagle_golden;
    const idlePos = fpWeapon.firstPersonMarkers.idleView.position;
    const expectedHipPos = [
      idlePos[0] * markerCal.markerScale + (markerCal.hipOffset[0] || 0),
      idlePos[1] * markerCal.markerScale + (markerCal.hipOffset[1] || 0),
      idlePos[2] * markerCal.markerScale + (markerCal.hipOffset[2] || 0),
    ];
    assert.deepEqual(
      fpWeapon.rig.calibration.hipPose.position,
      expectedHipPos,
      "hipPose.position 来自 idle_view marker 经 markerScale + hipOffset 处理"
    );
    // rightGrip/leftGrip 保留 WEAPON_CALIBRATION base 值 + gripOffset（marker grip position 不覆盖）
    const expectedRightGrip = [
      expected.rightGrip[0] + (markerCal.rightGripOffset?.[0] || 0),
      expected.rightGrip[1] + (markerCal.rightGripOffset?.[1] || 0),
      expected.rightGrip[2] + (markerCal.rightGripOffset?.[2] || 0),
    ];
    assert.deepEqual(
      fpWeapon.rig.calibration.rightGrip,
      expectedRightGrip,
      "rightGrip = WEAPON_CALIBRATION base 值 + rightGripOffset"
    );
    assert.deepEqual(
      fpWeapon.rig.calibration.muzzle,
      expected.muzzle,
      "muzzle 等于 WEAPON_CALIBRATION.deagle_golden.muzzle"
    );
  } finally {
    engine.dispose();
  }
});

test("当前武器列表 rig.modelRoot.scaling 等于 WEAPON_CALIBRATION modelScale", () => {
  for (const weaponId of WEAPON_ORDER) {
    const display = loadJson(ASSET_PATHS.taczDisplayJson[weaponId]);
    const geo = loadJson(ASSET_PATHS.taczGeoModels[weaponId]);
    const { engine, scene, camera } = makeScene();

    try {
      const fpWeapon = createTaczFirstPersonWeapon(scene, camera, weaponId, display, geo, {
        weaponConfig: WEAPON_CONFIG[weaponId],
        textureUrl: ASSET_PATHS.taczWeaponTextures[weaponId],
      });
      const expectedScale = WEAPON_CALIBRATION[weaponId].modelScale;
      assert.equal(
        fpWeapon.rig.modelRoot.scaling.x,
        expectedScale,
        `${weaponId} modelRoot.scaling.x === WEAPON_CALIBRATION.modelScale`
      );
      assert.equal(
        fpWeapon.rig.modelRoot.scaling.y,
        expectedScale,
        `${weaponId} modelRoot.scaling.y === WEAPON_CALIBRATION.modelScale`
      );
      assert.equal(
        fpWeapon.rig.modelRoot.scaling.z,
        expectedScale,
        `${weaponId} modelRoot.scaling.z === WEAPON_CALIBRATION.modelScale`
      );
    } finally {
      engine.dispose();
    }
  }
});

test("createTaczFirstPersonWeapon options.calibration 优先于 WEAPON_CALIBRATION，但 marker 仍覆盖 pose", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.m4);
  const geo = loadJson(ASSET_PATHS.taczGeoModels.m4);
  const { engine, scene, camera } = makeScene();

  try {
    const customCalibration = {
      hipPose: { position: [1, 2, 3], rotation: [0, Math.PI, 0] },
      adsPose: null,
      inspectPose: { position: [0, 0, 0], rotation: [0, 0, 0] },
      rightGrip: [0, 0, 0],
      leftGrip: [0, 0, 0],
      muzzle: [0, 0, 0],
      aim: [0, 0, 0],
      screenOffset: [0, 0, 0],
      fovScale: 1,
      modelScale: 2,
      handScale: 1,
      rootMotionScale: 1,
    };
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "m4", display, geo, {
      weaponConfig: WEAPON_CONFIG.m4,
      textureUrl: ASSET_PATHS.taczWeaponTextures.m4,
      calibration: customCalibration,
    });
    // TaCZ marker 覆盖 options.calibration 的 hipPose，经 markerScale + hipOffset 处理
    const markerCalM4 = WEAPON_MARKER_CALIBRATION.m4;
    const idlePosM4 = fpWeapon.firstPersonMarkers.idleView.position;
    const expectedHipPosM4 = [
      idlePosM4[0] * markerCalM4.markerScale + (markerCalM4.hipOffset[0] || 0),
      idlePosM4[1] * markerCalM4.markerScale + (markerCalM4.hipOffset[1] || 0),
      idlePosM4[2] * markerCalM4.markerScale + (markerCalM4.hipOffset[2] || 0),
    ];
    assert.deepEqual(
      fpWeapon.rig.calibration.hipPose.position,
      expectedHipPosM4,
      "TaCZ marker 覆盖 options.calibration 的 hipPose（经 markerScale + hipOffset 处理）"
    );
    assert.equal(fpWeapon.rig.modelRoot.scaling.x, 2, "modelScale 来自 options.calibration");
  } finally {
    engine.dispose();
  }
});

// === fallback 集成测试：geo 缺少 marker 时使用 calibration 对应字段 ===

// 复制 geo 并删除指定 bone，用于模拟真实资源缺失某个第一人称定位组的情况
function cloneGeoWithoutBone(geo, boneName) {
  const clone = structuredClone(geo);
  for (const geometry of clone["minecraft:geometry"] || []) {
    geometry.bones = (geometry.bones || []).filter((bone) => bone.name !== boneName);
  }
  return clone;
}

test("createTaczFirstPersonWeapon 缺 iron_view 时使用 calibration adsPose fallback", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.deagle_golden);
  const geo = cloneGeoWithoutBone(loadJson(ASSET_PATHS.taczGeoModels.deagle_golden), "iron_view");
  const { engine, scene, camera } = makeScene();

  try {
    const fallbackCalibration = {
      ...WEAPON_CALIBRATION.deagle_golden,
      adsPose: { position: [0.12, -0.34, 0.56], rotation: [0.01, 0.02, 0.03] },
    };
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "deagle_golden", display, geo, {
      calibration: fallbackCalibration,
      weaponConfig: WEAPON_CONFIG.deagle_golden,
      textureUrl: ASSET_PATHS.taczWeaponTextures.deagle_golden,
    });

    // iron_view 缺失：markerSource 标记 false，adsPose 不被 marker 覆盖，保留 fallback
    assert.equal(fpWeapon.rig.calibration.markerSource.ironView, false);
    assert.deepEqual(fpWeapon.rig.calibration.adsPose, fallbackCalibration.adsPose);
    // 其他 marker 仍可读取
    assert.ok(fpWeapon.firstPersonMarkers.idleView, "其他 marker 仍可读取");
    assert.ok(fpWeapon.firstPersonMarkers.leftHand, "lefthand_pos 仍可读取");
    assert.ok(fpWeapon.firstPersonMarkers.rightHand, "righthand_pos 仍可读取");
  } finally {
    engine.dispose();
  }
});

test("updateTaczFirstPersonWeapon pureStatic 应用 Phase2 静态 pose，忽略 recoil/reload/ads", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.m4);
  const geo = loadJson(ASSET_PATHS.taczGeoModels.m4);
  const { engine, scene, camera } = makeScene();

  try {
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "m4", display, geo, {
      weaponConfig: WEAPON_CONFIG.m4,
      textureUrl: ASSET_PATHS.taczWeaponTextures.m4,
      pureStatic: true,
    });

    const result = updateTaczFirstPersonWeapon(fpWeapon, {
      active: true,
      ads: true,
      adsProgress: 1,
      recoil: 10,
      reloading: true,
      reloadProgress: 0.5,
      pureStatic: true,
    });

    assert.equal(result.active, true, "active=true");
    assert.equal(fpWeapon.rig.cameraAnchor.isEnabled(), true, "rig 已启用");
    assert.equal(fpWeapon.staticPoseApplied, true, "pureStatic 应用 Phase2 静态 pose");
    assert.equal(fpWeapon.staticPoseSource, "PHASE2_STATIC_POSE_CALIBRATION", "记录静态 pose 来源");
    assert.equal(fpWeapon.rig.currentPose, "phase2-static", "pureStatic 使用 Phase2 静态 pose");
    assertVec3Close(fpWeapon.rig.weaponRoot.position, PHASE2_STATIC_POSE_CALIBRATION.m4.position, "weaponRoot.position 应等于 Phase2 静态 position");
    assertVec3Close(fpWeapon.rig.weaponRoot.rotation, PHASE2_STATIC_POSE_CALIBRATION.m4.rotation, "weaponRoot.rotation 应等于 Phase2 静态 rotation");
  } finally {
    engine.dispose();
  }
});

test("updateTaczFirstPersonWeapon 非 pureStatic 不应用 Phase2 静态 pose", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.m4);
  const geo = loadJson(ASSET_PATHS.taczGeoModels.m4);
  const { engine, scene, camera } = makeScene();

  try {
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "m4", display, geo, {
      weaponConfig: WEAPON_CONFIG.m4,
      textureUrl: ASSET_PATHS.taczWeaponTextures.m4,
      pureStatic: false,
    });

    updateTaczFirstPersonWeapon(fpWeapon, { active: true, ads: false, pureStatic: false });

    assert.equal(fpWeapon.phase2StaticPose, null, "非 pureStatic controller 不持有静态 pose");
    assert.equal(fpWeapon.staticPoseApplied, false, "非 pureStatic 不应用静态 pose");
    assertVec3Close(fpWeapon.rig.weaponRoot.position, fpWeapon.rig.calibration.hipPose.position, "非 pureStatic 保持 hipPose.position");
    assertVec3Close(fpWeapon.rig.weaponRoot.rotation, fpWeapon.rig.calibration.hipPose.rotation, "非 pureStatic 保持 hipPose.rotation");
  } finally {
    engine.dispose();
  }
});

// Phase2 新增：pureStatic 模式覆盖所有 WEAPON_ORDER 武器，验证静态枪模挂载结构稳定
for (const weaponId of WEAPON_ORDER) {
  test(`createTaczFirstPersonWeapon ${weaponId} pureStatic 只创建枪模和 rig，不创建手臂与动画控制器`, () => {
    const display = loadJson(ASSET_PATHS.taczDisplayJson[weaponId]);
    const geo = loadJson(ASSET_PATHS.taczGeoModels[weaponId]);
    const { engine, scene, camera } = makeScene();

    try {
      const fpWeapon = createTaczFirstPersonWeapon(scene, camera, weaponId, display, geo, {
        weaponConfig: WEAPON_CONFIG[weaponId],
        textureUrl: ASSET_PATHS.taczWeaponTextures[weaponId],
        pureStatic: true,
      });

      assert.equal(fpWeapon.pureStatic, true, `${weaponId} pureStatic 标记应保留在 controller 上`);
      assert.equal(fpWeapon.hands, null, `${weaponId} pureStatic 不创建 hands`);
      assert.equal(fpWeapon.animationController, null, `${weaponId} pureStatic 不创建 animationController`);
      assert.ok(fpWeapon.rig, `${weaponId} rig 仍存在`);
      assert.ok(fpWeapon.weapon?.model?.root, `${weaponId} TaCZ 模型仍存在`);
      assert.equal(fpWeapon.weapon.model.root.parent, fpWeapon.rig.modelRoot, `${weaponId} 模型仍挂到 rig.modelRoot`);
      // Phase2 新增：root position 归零、scaling 归一，确保静态枪模挂载不引入额外偏移
      assertVec3Close(fpWeapon.weapon.model.root.position, [0, 0, 0], `${weaponId} geo root position 归零`);
      assertVec3Close(fpWeapon.weapon.model.root.scaling, [1, 1, 1], `${weaponId} geo root scaling 归一`);
      assert.equal(fpWeapon.ready, true, `${weaponId} controller ready=true`);
      assert.equal(fpWeapon.failed, false, `${weaponId} controller failed=false`);
      assert.equal(fpWeapon.isTaczNative, true, `${weaponId} controller 仍标记为 TaCZ 原生路径`);
      assert.ok(fpWeapon.partCount > 0, `${weaponId} 纯静态模式仍有可渲染 mesh/cube`);
      assert.ok(fpWeapon.taczBoneMap, `${weaponId} boneMap 仍保留供诊断`);
    } finally {
      engine.dispose();
    }
  });
}

test("createTaczFirstPersonWeapon 缺 lefthand_pos 时使用 calibration leftGrip fallback", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.deagle_golden);
  const geo = cloneGeoWithoutBone(loadJson(ASSET_PATHS.taczGeoModels.deagle_golden), "lefthand_pos");
  const { engine, scene, camera } = makeScene();

  try {
    const fallbackCalibration = {
      ...WEAPON_CALIBRATION.deagle_golden,
      leftGrip: [-0.11, -0.22, 0.33],
    };
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "deagle_golden", display, geo, {
      calibration: fallbackCalibration,
      weaponConfig: WEAPON_CONFIG.deagle_golden,
      textureUrl: ASSET_PATHS.taczWeaponTextures.deagle_golden,
    });

    // lefthand_pos 缺失：markerSource.leftHand 标记 false，leftGrip 保留 fallback
    assert.equal(fpWeapon.rig.calibration.markerSource.leftHand, false);
    assert.deepEqual(fpWeapon.rig.calibration.leftGrip, fallbackCalibration.leftGrip);
    // 其他 marker 仍可读取
    assert.ok(fpWeapon.firstPersonMarkers.idleView, "idle_view 仍可读取");
    assert.ok(fpWeapon.firstPersonMarkers.ironView, "iron_view 仍可读取");
    assert.ok(fpWeapon.firstPersonMarkers.rightHand, "righthand_pos 仍可读取");
  } finally {
    engine.dispose();
  }
});

// === Phase3 hip 冻结模式（phase3Hip=1）测试 ===
// phase3Hip=1 对应 adapter 路径：pureStatic=false（保留 hands + animationController 创建），
// 但 main.js 主循环冻结 draw/idle/shoot/reload 动画输入、recoil/reloadDrop/ads 偏移。
// 这里覆盖 Task 0 Step 3 的 Test intent：
//   1. pureStatic=false 时不应用 PHASE2_STATIC_POSE_CALIBRATION（已有测试，这里补充 marker 校准生效）。
//   2. pureStatic=false 时 hipOffset 反映到 weaponRootPosition。
//   3. pureStatic=false 时 rotationOverride 反映到 weaponRootRotation。

test("Phase3 hip 冻结模式：m4 的 hipOffset 反映到 weaponRootPosition，不应用 Phase2 静态 pose", () => {
  const display = loadJson(ASSET_PATHS.taczDisplayJson.m4);
  const geo = loadJson(ASSET_PATHS.taczGeoModels.m4);
  const { engine, scene, camera } = makeScene();

  try {
    const fpWeapon = createTaczFirstPersonWeapon(scene, camera, "m4", display, geo, {
      weaponConfig: WEAPON_CONFIG.m4,
      textureUrl: ASSET_PATHS.taczWeaponTextures.m4,
      pureStatic: false,
    });

    // phase3Hip=1 对应的 adapter 调用：pureStatic=false, adsProgress=0, recoil=0, reloading=false
    updateTaczFirstPersonWeapon(fpWeapon, {
      active: true,
      adsProgress: 0,
      recoil: 0,
      reloading: false,
      reloadProgress: 0,
      pureStatic: false,
    });

    // 不应用 Phase2 静态 pose
    assert.equal(fpWeapon.staticPoseApplied, false, "phase3Hip 不应用 Phase2 静态 pose");
    assert.equal(fpWeapon.staticPoseSource, null, "phase3Hip staticPoseSource 为 null");
    assert.equal(fpWeapon.rig.currentPose, "hip", "phase3Hip rig.currentPose === hip");

    // hipOffset 反映到 weaponRootPosition（markerScale + offset 直接叠加）
    const markerCal = WEAPON_MARKER_CALIBRATION.m4;
    const idlePos = fpWeapon.firstPersonMarkers.idleView.position;
    const expectedHipPos = [
      idlePos[0] * markerCal.markerScale + markerCal.hipOffset[0],
      idlePos[1] * markerCal.markerScale + markerCal.hipOffset[1],
      idlePos[2] * markerCal.markerScale + markerCal.hipOffset[2],
    ];
    assertVec3Close(fpWeapon.rig.weaponRoot.position, expectedHipPos, "m4 weaponRootPosition 应反映 hipOffset");
    // 明确不等于 Phase2 静态 position
    const phase2Pos = PHASE2_STATIC_POSE_CALIBRATION.m4.position;
    assert.ok(
      Math.abs(fpWeapon.rig.weaponRoot.position.x - phase2Pos[0]) > 0.001
        || Math.abs(fpWeapon.rig.weaponRoot.position.y - phase2Pos[1]) > 0.001
        || Math.abs(fpWeapon.rig.weaponRoot.position.z - phase2Pos[2]) > 0.001,
      "m4 weaponRootPosition 不应等于 PHASE2_STATIC_POSE_CALIBRATION.m4.position"
    );
  } finally {
    engine.dispose();
  }
});

test("Phase3 hip 冻结模式：5 把武器 pureStatic=false 时 rig.currentPose 都是 hip 且不应用 Phase2 pose", () => {
  for (const weaponId of WEAPON_ORDER) {
    const display = loadJson(ASSET_PATHS.taczDisplayJson[weaponId]);
    const geo = loadJson(ASSET_PATHS.taczGeoModels[weaponId]);
    const { engine, scene, camera } = makeScene();

    try {
      const fpWeapon = createTaczFirstPersonWeapon(scene, camera, weaponId, display, geo, {
        weaponConfig: WEAPON_CONFIG[weaponId],
        textureUrl: ASSET_PATHS.taczWeaponTextures[weaponId],
        pureStatic: false,
      });

      updateTaczFirstPersonWeapon(fpWeapon, {
        active: true,
        adsProgress: 0,
        recoil: 0,
        reloading: false,
        reloadProgress: 0,
        pureStatic: false,
      });

      assert.equal(fpWeapon.staticPoseApplied, false, `${weaponId} 不应用 Phase2 静态 pose`);
      assert.equal(fpWeapon.staticPoseSource, null, `${weaponId} staticPoseSource 为 null`);
      assert.equal(fpWeapon.rig.currentPose, "hip", `${weaponId} rig.currentPose === hip`);
      // hands 和 animationController 仍存在（Phase3 真实链路保留）
      assert.ok(fpWeapon.hands, `${weaponId} hands 仍创建`);
      assert.ok(fpWeapon.animationController, `${weaponId} animationController 仍创建`);
    } finally {
      engine.dispose();
    }
  }
});
