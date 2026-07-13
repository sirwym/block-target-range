import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { createTaczGeoModel } from "../src/taczGeoModel.js";
import { ASSET_PATHS, WEAPON_ORDER, WEAPON_CALIBRATION, WEAPON_MARKER_CALIBRATION } from "../src/config.js";
import {
  FIRST_PERSON_MARKER_NAMES,
  extractFirstPersonMarkers,
  mergeCalibrationWithMarkers,
} from "../src/taczFirstPersonMarkers.js";

const ROOT = process.cwd();

function createScene() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  return { engine, scene };
}

function loadJson(assetPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "public", assetPath), "utf8"));
}

// 锁定 marker transform 必须是 finite 3 元数组，避免 NaN/Infinity 流入 rig calibration
function assertFiniteArray3(value, message) {
  assert.ok(Array.isArray(value), `${message} 应为数组`);
  assert.equal(value.length, 3, `${message} 应为 3 元数组`);
  for (const item of value) {
    assert.equal(Number.isFinite(item), true, `${message} 不应包含 NaN/Infinity`);
  }
}

const MOCK_MARKER_GEO = {
  format_version: "1.12.0",
  "minecraft:geometry": [
    {
      description: { identifier: "geometry.mock_marker", texture_width: 16, texture_height: 16 },
      bones: [
        { name: "root", pivot: [0, 0, 0] },
        { name: "idle_view", parent: "root", pivot: [16, 8, 4], rotation: [10, 20, 30] },
        { name: "iron_view", parent: "root", pivot: [4, 8, 16], rotation: [1, 2, 3] },
        { name: "lefthand_pos", parent: "root", pivot: [2, 3, 4], rotation: [0, 15, 0] },
        { name: "righthand_pos", parent: "root", pivot: [5, 6, 7], rotation: [0, -15, 0] },
      ],
    },
  ],
};

test("extractFirstPersonMarkers 从 geo boneMap 提取四个第一人称 marker", () => {
  const { engine, scene } = createScene();
  try {
    const model = createTaczGeoModel(scene, MOCK_MARKER_GEO, null, { weaponId: "mock_marker" });
    const markers = extractFirstPersonMarkers(model);

    assert.equal(markers.idleView.name, FIRST_PERSON_MARKER_NAMES.idleView);
    assert.equal(markers.ironView.name, FIRST_PERSON_MARKER_NAMES.ironView);
    assert.equal(markers.leftHand.name, FIRST_PERSON_MARKER_NAMES.leftHand);
    assert.equal(markers.rightHand.name, FIRST_PERSON_MARKER_NAMES.rightHand);
    assert.deepEqual(markers.idleView.position, [1, 0.5, 0.25]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("extractFirstPersonMarkers 对缺失 marker 返回 null", () => {
  const { engine, scene } = createScene();
  try {
    const model = createTaczGeoModel(scene, {
      format_version: "1.12.0",
      "minecraft:geometry": [{ description: { identifier: "geometry.empty" }, bones: [{ name: "root", pivot: [0, 0, 0] }] }],
    }, null, { weaponId: "empty_marker" });
    const markers = extractFirstPersonMarkers(model);

    assert.equal(markers.idleView, null);
    assert.equal(markers.ironView, null);
    assert.equal(markers.leftHand, null);
    assert.equal(markers.rightHand, null);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

for (const weaponId of WEAPON_ORDER) {
  test(`${weaponId} 真实 geo 包含第一人称定位组并保留原始 transform metadata`, () => {
    const { engine, scene } = createScene();
    try {
      const geo = loadJson(ASSET_PATHS.taczGeoModels[weaponId]);
      const model = createTaczGeoModel(scene, geo, null, { weaponId });
      const markers = extractFirstPersonMarkers(model);

      for (const [key, markerName] of Object.entries(FIRST_PERSON_MARKER_NAMES)) {
        assert.ok(markers[key], `${weaponId} 提取 ${markerName}`);
        const node = model.boneMap.get(markerName);
        assert.ok(node.metadata?.originalPosition, `${weaponId} ${markerName} 有 originalPosition`);
        assert.ok(node.metadata?.originalRotation, `${weaponId} ${markerName} 有 originalRotation`);
      }

      // marker 数值合理性：position/rotation 必须是 finite 3 元数组，
      // 否则后续 rig.applyHipPose/blendPose 会把 NaN 写入 weaponRoot，导致屏幕投影失败
      assertFiniteArray3(markers.idleView.position, `${weaponId} idle_view.position`);
      assertFiniteArray3(markers.idleView.rotation, `${weaponId} idle_view.rotation`);
      assertFiniteArray3(markers.ironView.position, `${weaponId} iron_view.position`);
      assertFiniteArray3(markers.ironView.rotation, `${weaponId} iron_view.rotation`);
      assertFiniteArray3(markers.leftHand.position, `${weaponId} lefthand_pos.position`);
      assertFiniteArray3(markers.rightHand.position, `${weaponId} righthand_pos.position`);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
}

test("mergeCalibrationWithMarkers 使用 marker 覆盖 pose 和 hand grips，同时保留缩放与枪口 fallback", () => {
  const base = WEAPON_CALIBRATION.m4;
  const markers = {
    idleView: { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] },
    ironView: { position: [4, 5, 6], rotation: [0.4, 0.5, 0.6] },
    leftHand: { position: [7, 8, 9], rotation: [0, 0, 0] },
    rightHand: { position: [10, 11, 12], rotation: [0, 0, 0] },
  };

  const merged = mergeCalibrationWithMarkers(base, markers);

  // position 用 marker，rotation 默认用 marker.rotation（keepBaseRotation=false）
  assert.deepEqual(merged.hipPose.position, [1, 2, 3]);
  assert.deepEqual(merged.hipPose.rotation, [0.1, 0.2, 0.3]);
  assert.deepEqual(merged.adsPose.position, [4, 5, 6]);
  assert.deepEqual(merged.adsPose.rotation, [0.4, 0.5, 0.6]);
  assert.deepEqual(merged.leftGrip, [7, 8, 9]);
  assert.deepEqual(merged.rightGrip, [10, 11, 12]);
  assert.equal(merged.modelScale, base.modelScale);
  assert.equal(merged.handScale, base.handScale);
  assert.deepEqual(merged.muzzle, base.muzzle);
  assert.deepEqual(merged.aim, base.aim);
  assert.deepEqual(merged.markerSource, { idleView: true, ironView: true, leftHand: true, rightHand: true });
});

test("mergeCalibrationWithMarkers 缺失 marker 时保留 base calibration 对应字段", () => {
  const base = WEAPON_CALIBRATION.ak47;
  const merged = mergeCalibrationWithMarkers(base, {
    idleView: { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] },
    ironView: null,
    leftHand: null,
    rightHand: null,
  });

  // position 用 marker，rotation 默认用 marker.rotation
  assert.deepEqual(merged.hipPose, { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] });
  assert.deepEqual(merged.adsPose, base.adsPose);
  assert.deepEqual(merged.leftGrip, base.leftGrip);
  assert.deepEqual(merged.rightGrip, base.rightGrip);
  assert.deepEqual(merged.markerSource, { idleView: true, ironView: false, leftHand: false, rightHand: false });
});

test("mergeCalibrationWithMarkers 支持 markerScale 缩放 marker position", () => {
  const base = {
    hipPose: { position: [0, 0, 0], rotation: [0.5, 0.6, 0.7] },
    adsPose: { position: [0, 0, 0], rotation: [0.8, 0.9, 1.0] },
    leftGrip: [0, 0, 0],
    rightGrip: [0, 0, 0],
    muzzle: [1, 1, 1],
  };
  const markers = {
    idleView: { position: [2, 4, 6], rotation: [0.1, 0.2, 0.3] },
    ironView: { position: [8, 10, 12], rotation: [0.4, 0.5, 0.6] },
    leftHand: { position: [14, 16, 18], rotation: [0, 0, 0] },
    rightHand: { position: [20, 22, 24], rotation: [0, 0, 0] },
  };

  const merged = mergeCalibrationWithMarkers(base, markers, { markerScale: 0.5 });

  // markerScale 只缩放 position，rotation 用 marker.rotation
  assert.deepEqual(merged.hipPose.position, [1, 2, 3]);
  assert.deepEqual(merged.adsPose.position, [4, 5, 6]);
  assert.deepEqual(merged.leftGrip, [7, 8, 9]);
  assert.deepEqual(merged.rightGrip, [10, 11, 12]);
  assert.deepEqual(merged.hipPose.rotation, [0.1, 0.2, 0.3]);
});

test("mergeCalibrationWithMarkers 支持 hipOffset/adsOffset/gripOffset 叠加修正", () => {
  const base = {
    hipPose: { position: [0, 0, 0], rotation: [0.5, 0.6, 0.7] },
    adsPose: { position: [0, 0, 0], rotation: [0.8, 0.9, 1.0] },
    leftGrip: [0, 0, 0],
    rightGrip: [0, 0, 0],
    muzzle: [0, 0, 0],
  };
  const markers = {
    idleView: { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] },
    ironView: { position: [4, 5, 6], rotation: [0.4, 0.5, 0.6] },
    leftHand: { position: [7, 8, 9], rotation: [0, 0, 0] },
    rightHand: { position: [10, 11, 12], rotation: [0, 0, 0] },
  };
  const merged = mergeCalibrationWithMarkers(base, markers, {
    invertPosePosition: false,
    hipOffset: [0.1, -0.2, 0.3],
    adsOffset: [-0.1, 0.2, -0.3],
    leftGripOffset: [0.5, 0, 0],
    rightGripOffset: [0, -0.5, 0],
  });

  assert.deepEqual(merged.hipPose.position, [1.1, 1.8, 3.3]);
  assert.deepEqual(merged.adsPose.position, [3.9, 5.2, 5.7]);
  assert.deepEqual(merged.leftGrip, [7.5, 8, 9]);
  assert.deepEqual(merged.rightGrip, [10, 10.5, 12]);
  // rotation 默认用 marker.rotation
  assert.deepEqual(merged.hipPose.rotation, [0.1, 0.2, 0.3]);
  assert.deepEqual(merged.adsPose.rotation, [0.4, 0.5, 0.6]);
});

test("mergeCalibrationWithMarkers keepBaseRotation=true 保留 base rotation 不被 marker 覆盖", () => {
  const base = {
    hipPose: { position: [0, 0, 0], rotation: [0.5, 0.6, 0.7] },
    adsPose: { position: [0, 0, 0], rotation: [0.8, 0.9, 1.0] },
    leftGrip: [0, 0, 0],
    rightGrip: [0, 0, 0],
    muzzle: [0, 0, 0],
  };
  const markers = {
    idleView: { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] },
    ironView: { position: [4, 5, 6], rotation: [0.4, 0.5, 0.6] },
    leftHand: null,
    rightHand: null,
  };
  const merged = mergeCalibrationWithMarkers(base, markers, { keepBaseRotation: true });

  assert.deepEqual(merged.hipPose.position, [1, 2, 3]);
  assert.deepEqual(merged.hipPose.rotation, [0.5, 0.6, 0.7]);
  assert.deepEqual(merged.adsPose.position, [4, 5, 6]);
  assert.deepEqual(merged.adsPose.rotation, [0.8, 0.9, 1.0]);
});

test("mergeCalibrationWithMarkers invertPosePosition 对 idle_view/iron_view 取反，不影响 grip", () => {
  const base = {
    hipPose: { position: [0, 0, 0], rotation: [0.5, 0.6, 0.7] },
    adsPose: { position: [0, 0, 0], rotation: [0.8, 0.9, 1.0] },
    leftGrip: [0, 0, 0],
    rightGrip: [0, 0, 0],
    muzzle: [0, 0, 0],
  };
  const markers = {
    idleView: { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] },
    ironView: { position: [4, 5, 6], rotation: [0.4, 0.5, 0.6] },
    leftHand: { position: [7, 8, 9], rotation: [0, 0, 0] },
    rightHand: { position: [10, 11, 12], rotation: [0, 0, 0] },
  };
  const merged = mergeCalibrationWithMarkers(base, markers, {
    invertPosePosition: true,
  });

  // idle_view/iron_view position 取反
  assert.deepEqual(merged.hipPose.position, [-1, -2, -3]);
  assert.deepEqual(merged.adsPose.position, [-4, -5, -6]);
  // grip 不取反
  assert.deepEqual(merged.leftGrip, [7, 8, 9]);
  assert.deepEqual(merged.rightGrip, [10, 11, 12]);
  // rotation 用 marker.rotation（默认），不受 invert 影响
  assert.deepEqual(merged.hipPose.rotation, [0.1, 0.2, 0.3]);
});

test("mergeCalibrationWithMarkers markerScale 与 offset 同时生效（先缩放后叠加）", () => {
  const base = {
    hipPose: { position: [0, 0, 0], rotation: [0, 0, 0] },
    adsPose: { position: [0, 0, 0], rotation: [0, 0, 0] },
    leftGrip: [0, 0, 0],
    rightGrip: [0, 0, 0],
    muzzle: [0, 0, 0],
  };
  const markers = {
    idleView: { position: [2, 4, 6], rotation: [0, 0, 0] },
    ironView: null,
    leftHand: null,
    rightHand: null,
  };
  const merged = mergeCalibrationWithMarkers(base, markers, {
    invertPosePosition: false,
    markerScale: 0.5,
    hipOffset: [0.1, 0.1, 0.1],
  });
  // 先乘 0.5 得 [1,2,3]，再叠加 [0.1,0.1,0.1]
  assert.deepEqual(merged.hipPose.position, [1.1, 2.1, 3.1]);
});

test("mergeCalibrationWithMarkers 对缺失/非法 offset 视为零向量", () => {
  const base = {
    hipPose: { position: [0, 0, 0], rotation: [0, 0, 0] },
    adsPose: { position: [0, 0, 0], rotation: [0, 0, 0] },
    leftGrip: [0, 0, 0],
    rightGrip: [0, 0, 0],
    muzzle: [0, 0, 0],
  };
  const markers = {
    idleView: { position: [1, 2, 3], rotation: [0, 0, 0] },
    ironView: null,
    leftHand: null,
    rightHand: null,
  };
  const merged = mergeCalibrationWithMarkers(base, markers, {
    invertPosePosition: false,
    hipOffset: [NaN, undefined, "x"],
  });
  // NaN/undefined/字符串都视为 0
  assert.deepEqual(merged.hipPose.position, [1, 2, 3]);
});

test("WEAPON_MARKER_CALIBRATION 为 9 把武器提供完整结构", () => {
  for (const weaponId of WEAPON_ORDER) {
    const cal = WEAPON_MARKER_CALIBRATION[weaponId];
    assert.ok(cal, `${weaponId} 应有 marker calibration`);
    assert.equal(typeof cal.markerScale, "number", `${weaponId} markerScale 为数字`);
    assert.equal(cal.invertPosePosition, false, `${weaponId} invertPosePosition=false（不取反，用 hipOffset 微调）`);
    assert.ok(Array.isArray(cal.hipOffset) && cal.hipOffset.length === 3, `${weaponId} hipOffset 为 3 元数组`);
    assert.ok(Array.isArray(cal.adsOffset) && cal.adsOffset.length === 3, `${weaponId} adsOffset 为 3 元数组`);
    assert.ok(Array.isArray(cal.leftGripOffset) && cal.leftGripOffset.length === 3, `${weaponId} leftGripOffset 为 3 元数组`);
    assert.ok(Array.isArray(cal.rightGripOffset) && cal.rightGripOffset.length === 3, `${weaponId} rightGripOffset 为 3 元数组`);
  }
});

// 防回归：多模态验收报告曾出现"全局 invertPosePosition=true + 统一 hipOffset=[0.5,-0.2,0.3]"
// 导致多把武器全屏/飞出视锥。本测试固化"逐武器腰射校准 + 不全局取反 + markerScale=1"的当前正确状态，
// 防止未来误改回统一取反或统一 offset。改动 hipOffset 时仍要保证 finite 3 元数组。
test("WEAPON_MARKER_CALIBRATION 保持逐武器腰射校准且不全局取反", () => {
  for (const weaponId of WEAPON_ORDER) {
    const cfg = WEAPON_MARKER_CALIBRATION[weaponId];
    assert.ok(cfg, `${weaponId} 存在 marker 校准`);
    assert.equal(cfg.markerScale, 1, `${weaponId} markerScale 暂保持 1`);
    assert.equal(cfg.invertPosePosition, false, `${weaponId} 不应整体取反 idle_view/iron_view position`);
    assertFiniteArray3(cfg.hipOffset, `${weaponId} hipOffset`);
    assertFiniteArray3(cfg.adsOffset, `${weaponId} adsOffset`);
    assertFiniteArray3(cfg.leftGripOffset, `${weaponId} leftGripOffset`);
    assertFiniteArray3(cfg.rightGripOffset, `${weaponId} rightGripOffset`);
  }
});

// 防回归：用真实 glock17 marker 证明整体取反会让 hipPose.z 变负。
// 当前 rig 期望腰射 z 在相机前方（正值），整体取反会让武器飞到相机后方。
// 本测试固化"整体取反不可作为默认腰射策略"的结论，避免未来误启用全局 invertPosePosition。
test("整体 invertPosePosition 会把真实 idle_view z 取成负值，不作为默认腰射策略", () => {
  const { engine, scene } = createScene();
  try {
    const weaponId = "glock17";
    const geo = loadJson(ASSET_PATHS.taczGeoModels[weaponId]);
    const model = createTaczGeoModel(scene, geo, null, { weaponId });
    const markers = extractFirstPersonMarkers(model);
    const merged = mergeCalibrationWithMarkers(WEAPON_CALIBRATION[weaponId], markers, {
      markerScale: 1,
      invertPosePosition: true,
      hipOffset: [0, 0, 0],
      adsOffset: [0, 0, 0],
    });

    assert.ok(markers.idleView.position[2] > 0, "真实 idle_view z 为正");
    assert.ok(merged.hipPose.position[2] < 0, "整体取反会让 hipPose.z 变负");
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

// Task 4 扩展：per-weapon rotationOverride。
// 基线发现 marker rotation=(0,0,0) 覆盖 base rotation 后，ak47/awp/deagle/rpg7/m95 投影异常（竖直窄条）。
// 不同武器 geo 默认朝向不同，需要 per-weapon rotation 校准。rotationOverride 覆盖 marker rotation，
// 同时应用到 hipPose 和 adsPose（adsPose.rotation 通常与 hipPose.rotation 一致，见 computeAdsPose）。
test("mergeCalibrationWithMarkers 支持 rotationOverride 覆盖 marker rotation", () => {
  const base = {
    hipPose: { position: [0, 0, 0], rotation: [0.5, 0.6, 0.7] },
    adsPose: { position: [0, 0, 0], rotation: [0.8, 0.9, 1.0] },
    leftGrip: [0, 0, 0],
    rightGrip: [0, 0, 0],
    muzzle: [0, 0, 0],
  };
  const markers = {
    idleView: { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] },
    ironView: { position: [4, 5, 6], rotation: [0.4, 0.5, 0.6] },
    leftHand: { position: [7, 8, 9], rotation: [0, 0, 0] },
    rightHand: { position: [10, 11, 12], rotation: [0, 0, 0] },
  };
  const merged = mergeCalibrationWithMarkers(base, markers, {
    rotationOverride: [0, Math.PI, 0],
  });
  // rotationOverride 覆盖 marker rotation，同时应用到 hipPose 和 adsPose
  assert.deepEqual(merged.hipPose.rotation, [0, Math.PI, 0]);
  assert.deepEqual(merged.adsPose.rotation, [0, Math.PI, 0]);
  // position 仍用 marker + offset 逻辑
  assert.deepEqual(merged.hipPose.position, [1, 2, 3]);
  assert.deepEqual(merged.adsPose.position, [4, 5, 6]);
});

test("mergeCalibrationWithMarkers 未提供 rotationOverride 时保持 marker rotation 默认行为", () => {
  const base = {
    hipPose: { position: [0, 0, 0], rotation: [0.5, 0.6, 0.7] },
    adsPose: { position: [0, 0, 0], rotation: [0.8, 0.9, 1.0] },
    leftGrip: [0, 0, 0],
    rightGrip: [0, 0, 0],
    muzzle: [0, 0, 0],
  };
  const markers = {
    idleView: { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] },
    ironView: { position: [4, 5, 6], rotation: [0.4, 0.5, 0.6] },
    leftHand: null,
    rightHand: null,
  };
  const merged = mergeCalibrationWithMarkers(base, markers);
  // 未提供 rotationOverride 时，用 marker.rotation（现有行为）
  assert.deepEqual(merged.hipPose.rotation, [0.1, 0.2, 0.3]);
  assert.deepEqual(merged.adsPose.rotation, [0.4, 0.5, 0.6]);
});
