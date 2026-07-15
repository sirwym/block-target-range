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
    // path inverse 后 position 是矩阵提取值，验证 finite 即可（不再直读 local transform）
    assertFiniteArray3(markers.idleView.position, "idle_view.position");
    assertFiniteArray3(markers.idleView.rotation, "idle_view.rotation");
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

// path inverse: 单层 root→marker，无旋转时 M.translation 正确计算相对偏移
// 验证 path inverse 基本行为 + computeTaczFirstPersonRenderMatrix 完整矩阵链
// 所有节点（包括root）统一 ty=-py，反向平移撤销各bone的local position；computeTacz直接返回inverse
test("extractFirstPersonMarkers path inverse: 无旋转单层 marker rig position 正确计算", () => {
  const { engine, scene } = createScene();
  try {
    const geo = {
      format_version: "1.12.0",
      "minecraft:geometry": [{
        description: { identifier: "geometry.path_test", texture_width: 16, texture_height: 16 },
        bones: [
          { name: "root", pivot: [0, 0, 0] },
          { name: "idle_view", parent: "root", pivot: [16, 32, 48] },
        ],
      }],
    };
    const model = createTaczGeoModel(scene, geo, null, { weaponId: "path_test" });
    const markers = extractFirstPersonMarkers(model);
    // bone position 经 convertBonePivot 转换（root Y=(24-pivotY)/16, child Y=(parentPivotY-childPivotY)/16）：
    //   root pivot [0,0,0] → pos = [0, (24-0)/16=1.5, 0]
    //   idle_view pivot [16,32,48], child of root (parentPivot=[0,0,0]) → pos = [1, (0-32)/16=-2, 3]
    // getTaczPositioningNodeInverse（所有节点统一 ty=-py）：
    //   i=1 (idle_view): ty=-py=-(-2)=2, trans(-1,2,-3), matrix=T(-1,2,-3)
    //   i=0 (root): ty=-py=-1.5, trans(0,-1.5,0), matrix=T(0,-1.5,0)*T(-1,2,-3)=T(-1,0.5,-3)
    //   inverse.translation = [-1, 0.5, -3]
    // computeTaczFirstPersonRenderMatrix: 直接返回 inverse.clone()
    assert.deepEqual(markers.idleView.position, [-1, 0.5, -3]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

// path inverse: 多层 bone 链，验证父骨骼变换被正确反向应用
test("extractFirstPersonMarkers path inverse: 多层 bone 链正确计算逆变换", () => {
  const { engine, scene } = createScene();
  try {
    const geo = {
      format_version: "1.12.0",
      "minecraft:geometry": [{
        description: { identifier: "geometry.multi_path", texture_width: 16, texture_height: 16 },
        bones: [
          { name: "root", pivot: [0, 0, 0] },
          { name: "middle", parent: "root", pivot: [16, 0, 0] },
          { name: "idle_view", parent: "middle", pivot: [0, 16, 0] },
        ],
      }],
    };
    const model = createTaczGeoModel(scene, geo, null, { weaponId: "multi_path" });
    const markers = extractFirstPersonMarkers(model);
    // bone position 经 convertBonePivot 转换：
    //   root [0,0,0] → pos=[0,(24-0)/16=1.5,0]
    //   middle pivot[16,0,0], child of root(parentPivot=[0,0,0]) → pos=[1,(0-0)/16=0,0]
    //   idle_view pivot[0,16,0], child of middle(parentPivot=[16,0,0]) → pos=[(0-16)/16=-1,(0-16)/16=-1,0]
    // path: [root(pos=[0,1.5,0],isRoot), middle(pos=[1,0,0]), idle_view(pos=[-1,-1,0])]
    // getTaczPositioningNodeInverse（所有节点统一 ty=-py）：
    //   i=2 (idle_view): ty=-py=1, trans(1,1,0), matrix=T(1,1,0)
    //   i=1 (middle): ty=-py=0, trans(-1,0,0), matrix=T(-1,0,0)*T(1,1,0)=T(0,1,0)
    //   i=0 (root): ty=-py=-1.5, trans(0,-1.5,0), matrix=T(0,-1.5,0)*T(0,1,0)=T(0,-0.5,0)
    // computeTaczFirstPersonRenderMatrix: 直接返回 inverse.clone()
    assert.deepEqual(markers.idleView.position, [0, -0.5, 0]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

// 验证：root 和 idle_view 都在 pivot [0,24,0] 时的 position 计算
// root pivot [0,24,0] → convertBonePivot Y=0 → getTaczPositioningNodeInverse root ty=-0=0
test("extractFirstPersonMarkers: root+idle_view 都在 pivot [0,24,0] 时 position = [0,0,0]", () => {
  const { engine, scene } = createScene();
  try {
    const geo = {
      format_version: "1.12.0",
      "minecraft:geometry": [{
        description: { identifier: "geometry.eye_level_test", texture_width: 16, texture_height: 16 },
        bones: [
          { name: "root", pivot: [0, 24, 0] },
          { name: "idle_view", parent: "root", pivot: [0, 24, 0] },
        ],
      }],
    };
    const model = createTaczGeoModel(scene, geo, null, { weaponId: "eye_level_test" });
    const markers = extractFirstPersonMarkers(model);
    // root pivot [0,24,0] → convertBonePivot: Y=(24-24)/16=0 → pos [0,0,0]
    // idle_view pivot [0,24,0] child of root (parentPivot=[0,24,0]) → Y=(24-24)/16=0 → pos [0,0,0]
    // getTaczPositioningNodeInverse（所有节点统一 ty=-py）：
    //   i=1 (idle_view): ty=-py=0, trans(0,0,0), matrix=I
    //   i=0 (root): ty=-py=0, trans(0,0,0), matrix=I
    // computeTaczFirstPersonRenderMatrix:
    //   直接返回 inverse.clone() = I → position = [0,0,0]
    assert.ok(Math.abs(markers.idleView.position[0] - 0) < 1e-6, `idleView.position.x: ${markers.idleView.position[0]} 期望 ≈0`);
    assert.ok(Math.abs(markers.idleView.position[1] - 0) < 1e-6, `idleView.position.y: ${markers.idleView.position[1]} 期望 ≈0`);
    assert.ok(Math.abs(markers.idleView.position[2] - 0) < 1e-6, `idleView.position.z: ${markers.idleView.position[2]} 期望 ≈0`);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

// path inverse: boneDataMap 缺失时 fallback 到 local transform
test("extractFirstPersonMarkers boneDataMap 缺失时 fallback 到 local transform", () => {
  const { engine, scene } = createScene();
  try {
    const model = createTaczGeoModel(scene, MOCK_MARKER_GEO, null, { weaponId: "mock_fallback" });
    // 模拟 boneDataMap 缺失（旧调用方兼容）
    const modelWithoutBoneDataMap = { boneMap: model.boneMap };
    const markers = extractFirstPersonMarkers(modelWithoutBoneDataMap);
    // fallback 时用 local transform，position = node.position（convertBonePivot 转换后）
    assertFiniteArray3(markers.idleView.position, "fallback idle_view.position");
    // idle_view pivot [16, 8, 4] child of root, convertBonePivot: [16/16, (0-8)/16=-0.5, 4/16=0.25]
    assert.deepEqual(markers.idleView.position, [1, -0.5, 0.25]);
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

test("mergeCalibrationWithMarkers 使用 marker 覆盖 pose，但 rightGrip/leftGrip 保留 base 值不被 marker 覆盖", () => {
  const base = WEAPON_CALIBRATION.m4;
  const markers = {
    idleView: { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] },
    ironView: { position: [4, 5, 6], rotation: [0.4, 0.5, 0.6] },
    leftHand: { position: [7, 8, 9], rotation: [0, 0, 0] },
    rightHand: { position: [10, 11, 12], rotation: [0, 0, 0] },
  };

  const merged = mergeCalibrationWithMarkers(base, markers);

  // position 直接使用 marker原值，rotation 直接使用 marker原值
  assert.deepEqual(merged.hipPose.position, [1, 2, 3]);
  assert.deepEqual(merged.hipPose.rotation, [0.1, 0.2, 0.3]);
  assert.deepEqual(merged.adsPose.position, [4, 5, 6]);
  assert.deepEqual(merged.adsPose.rotation, [0.4, 0.5, 0.6]);
  // rightGrip/leftGrip 保留 baseCalibration 手调值，不被 marker 覆盖
  // （marker grip position 在 rotationOverride 后坐标系不匹配，会导致手漂到相机后方）
  assert.deepEqual(merged.leftGrip, base.leftGrip);
  assert.deepEqual(merged.rightGrip, base.rightGrip);
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

  // position 直接使用 marker原值，rotation 直接使用 marker原值
  assert.deepEqual(merged.hipPose, { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] });
  assert.deepEqual(merged.adsPose, base.adsPose);
  assert.deepEqual(merged.leftGrip, base.leftGrip);
  assert.deepEqual(merged.rightGrip, base.rightGrip);
  assert.deepEqual(merged.markerSource, { idleView: true, ironView: false, leftHand: false, rightHand: false });
});

test("mergeCalibrationWithMarkers 支持 markerScale 缩放 marker position，但不影响 grip 位置", () => {
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

  // markerScale 只缩放 pose position，rotation 直接使用 marker原值
  assert.deepEqual(merged.hipPose.position, [1, 2, 3]);
  assert.deepEqual(merged.adsPose.position, [4, 5, 6]);
  // grip 位置保留 base 值，不被 marker 覆盖
  assert.deepEqual(merged.leftGrip, [0, 0, 0]);
  assert.deepEqual(merged.rightGrip, [0, 0, 0]);
  assert.deepEqual(merged.hipPose.rotation, [0.1, 0.2, 0.3]);
  assert.deepEqual(merged.adsPose.rotation, [0.4, 0.5, 0.6]);
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
    hipOffset: [0.1, -0.2, 0.3],
    adsOffset: [-0.1, 0.2, -0.3],
    leftGripOffset: [0.5, 0, 0],
    rightGripOffset: [0, -0.5, 0],
  });

  assert.deepEqual(merged.hipPose.position, [1.1, 1.8, 3.3]);
  assert.deepEqual(merged.adsPose.position, [3.9, 5.2, 5.7]);
  // gripOffset 叠加在 base grip 值上（marker 不覆盖 grip）
  assert.deepEqual(merged.leftGrip, [0.5, 0, 0]);
  assert.deepEqual(merged.rightGrip, [0, -0.5, 0]);
  // rotation 直接使用 marker原值
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
    markerScale: 0.5,
    hipOffset: [0.1, 0.1, 0.1],
  });
  // 直接使用 marker原值，乘 0.5 得 [1,2,3]，再叠加 [0.1,0.1,0.1]
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
    hipOffset: [NaN, undefined, "x"],
  });
  // NaN/undefined/字符串都视为 0，直接使用 marker原值
  assert.deepEqual(merged.hipPose.position, [1, 2, 3]);
});

test("WEAPON_MARKER_CALIBRATION 为 5 把武器提供完整结构", () => {
  for (const weaponId of WEAPON_ORDER) {
    const cal = WEAPON_MARKER_CALIBRATION[weaponId];
    assert.ok(cal, `${weaponId} 应有 marker calibration`);
    assert.equal(typeof cal.markerScale, "number", `${weaponId} markerScale 为数字`);
    assert.ok(Array.isArray(cal.hipOffset) && cal.hipOffset.length === 3, `${weaponId} hipOffset 为 3 元数组`);
    assert.ok(Array.isArray(cal.adsOffset) && cal.adsOffset.length === 3, `${weaponId} adsOffset 为 3 元数组`);
    assert.ok(Array.isArray(cal.leftGripOffset) && cal.leftGripOffset.length === 3, `${weaponId} leftGripOffset 为 3 元数组`);
    assert.ok(Array.isArray(cal.rightGripOffset) && cal.rightGripOffset.length === 3, `${weaponId} rightGripOffset 为 3 元数组`);
  }
});

// 防回归：逐武器腰射校准 + markerScale=1 的当前正确状态。
// Phase3v7 移除了 invertPosePosition 选项，path inverse 已正确处理坐标系转换。
test("WEAPON_MARKER_CALIBRATION 保持逐武器腰射校准且 markerScale=1", () => {
  for (const weaponId of WEAPON_ORDER) {
    const cfg = WEAPON_MARKER_CALIBRATION[weaponId];
    assert.ok(cfg, `${weaponId} 存在 marker 校准`);
    assert.equal(cfg.markerScale, 1, `${weaponId} markerScale 暂保持 1`);
    assertFiniteArray3(cfg.hipOffset, `${weaponId} hipOffset`);
    assertFiniteArray3(cfg.adsOffset, `${weaponId} adsOffset`);
    assertFiniteArray3(cfg.leftGripOffset, `${weaponId} leftGripOffset`);
    assertFiniteArray3(cfg.rightGripOffset, `${weaponId} rightGripOffset`);
  }
});

// Task 4 扩展：per-weapon rotationOverride。
// 基线发现 marker rotation=(0,0,0) 覆盖 base rotation 后，ak47/awp/deagle/m95 投影异常（竖直窄条）。
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
  // position 直接使用 marker原值
  assert.deepEqual(merged.hipPose.position, [1, 2, 3]);
  assert.deepEqual(merged.adsPose.position, [4, 5, 6]);
  // grip 位置保留 base 值，不被 marker 覆盖
  assert.deepEqual(merged.leftGrip, [0, 0, 0]);
  assert.deepEqual(merged.rightGrip, [0, 0, 0]);
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
  // 未提供 rotationOverride 时，直接使用 marker原值
  assert.deepEqual(merged.hipPose.position, [1, 2, 3]);
  assert.deepEqual(merged.adsPose.position, [4, 5, 6]);
  assert.deepEqual(merged.hipPose.rotation, [0.1, 0.2, 0.3]);
  assert.deepEqual(merged.adsPose.rotation, [0.4, 0.5, 0.6]);
});
