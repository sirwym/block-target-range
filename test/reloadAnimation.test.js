import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import { updateReloadAnimation, _TEST_ONLY } from "../src/reloadAnimation.js";
import { _TEST_ONLY as V2_TEST_ONLY } from "../src/v2AnimationParser.js";

const { buildReloadTimeline, sampleLeftHandPose, getMagPos, getPullPos, AWP_BOLT_THRESHOLD, updatePartPivot } = _TEST_ONLY;
const { setAnimationCache, clearAnimationCache } = V2_TEST_ONLY;

const DEFAULT_MODEL_CONFIG = {
  handAnchors: {
    leftHand: [0.0, -0.28, 0.35],
    rightHand: [0.15, -0.32, 0.1],
  },
};

const GLOCK_RELOAD_CONFIG = { duration: 1.88, feedTime: 1.63, soundScheme: "single" };
const P90_RELOAD_CONFIG = { duration: 3.04, feedTime: 2.45, soundScheme: "segmented" };
const AWP_RELOAD_CONFIG = { duration: 3.25, feedTime: 2.85, soundScheme: "segmented" };

function makeFakeHands() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("left-root", scene);
  return {
    leftHand: {
      root,
      defaultPos: [...DEFAULT_MODEL_CONFIG.handAnchors.leftHand],
    },
  };
}

test("updateReloadAnimation 不报错当 hands 为 null", () => {
  assert.doesNotThrow(() => updateReloadAnimation(null, { reloading: false }));
});

test("updateReloadAnimation 不报错当 leftHand 缺失", () => {
  assert.doesNotThrow(() => updateReloadAnimation({}, { reloading: false }));
});

test("非换弹时左手回到 defaultPos", () => {
  const hands = makeFakeHands();
  hands.leftHand.root.position.set(1, 2, 3);
  updateReloadAnimation(hands, {
    reloading: false,
    reloadProgress: 0,
    weaponId: "glock17",
    reloadConfig: null,
    modelConfig: DEFAULT_MODEL_CONFIG,
  });
  const pos = hands.leftHand.root.position;
  assert.deepEqual([pos.x, pos.y, pos.z], DEFAULT_MODEL_CONFIG.handAnchors.leftHand);
});

test("buildReloadTimeline 4 段时间点正确", () => {
  const tl = buildReloadTimeline(GLOCK_RELOAD_CONFIG);
  const duration = GLOCK_RELOAD_CONFIG.duration;
  const feedNorm = GLOCK_RELOAD_CONFIG.feedTime / duration;
  assert.ok(tl.reach.start === 0, "reach 从 0 开始");
  assert.equal(tl.reach.end, (GLOCK_RELOAD_CONFIG.feedTime * 0.5) / duration, "reach 结束于归一化 magoutTime");
  assert.ok(tl.pull.start < tl.pull.end, "pull 段有时长");
  assert.ok(tl.insert.start === tl.pull.end, "insert 衔接 pull");
  assert.equal(tl.insert.end, feedNorm, "insert 结束于归一化 feedTime");
  assert.equal(tl.return.start, feedNorm, "return 从归一化 feedTime 开始");
  assert.equal(tl.return.end, 1, "return 结束于 1");
});

test("P90 弹匣位 y 分量为正（向上）", () => {
  const defaultPos = DEFAULT_MODEL_CONFIG.handAnchors.leftHand;
  const magPos = getMagPos(defaultPos, "p90");
  assert.ok(magPos[1] > defaultPos[1], "P90 magPos y 大于 defaultPos y");
});

test("其他枪弹匣位 y 分量为负（向下）", () => {
  const defaultPos = DEFAULT_MODEL_CONFIG.handAnchors.leftHand;
  for (const weaponId of ["glock17", "m4", "ak47", "awp"]) {
    const magPos = getMagPos(defaultPos, weaponId);
    assert.ok(magPos[1] < defaultPos[1], `${weaponId} magPos y 小于 defaultPos y`);
  }
});

test("P90 拔出位 y 比弹匣位更高", () => {
  const defaultPos = DEFAULT_MODEL_CONFIG.handAnchors.leftHand;
  const magPos = getMagPos(defaultPos, "p90");
  const pullPos = getPullPos(magPos, "p90");
  assert.ok(pullPos[1] > magPos[1], "P90 pullPos y 大于 magPos y");
});

test("其他枪拔出位 y 比弹匣位更低", () => {
  const defaultPos = DEFAULT_MODEL_CONFIG.handAnchors.leftHand;
  const magPos = getMagPos(defaultPos, "glock17");
  const pullPos = getPullPos(magPos, "glock17");
  assert.ok(pullPos[1] < magPos[1], "glock17 pullPos y 小于 magPos y");
});

test("sampleLeftHandPose progress=0 返回 defaultPos", () => {
  const tl = buildReloadTimeline(GLOCK_RELOAD_CONFIG);
  const pose = sampleLeftHandPose(0, tl, "glock17", DEFAULT_MODEL_CONFIG);
  assert.deepEqual(pose.position, DEFAULT_MODEL_CONFIG.handAnchors.leftHand);
});

test("sampleLeftHandPose progress=1 返回 defaultPos", () => {
  const tl = buildReloadTimeline(GLOCK_RELOAD_CONFIG);
  const pose = sampleLeftHandPose(1, tl, "glock17", DEFAULT_MODEL_CONFIG);
  assert.deepEqual(pose.position, DEFAULT_MODEL_CONFIG.handAnchors.leftHand);
});

test("sampleLeftHandPose progress=0.5 返回非 defaultPos", () => {
  const tl = buildReloadTimeline(GLOCK_RELOAD_CONFIG);
  const pose = sampleLeftHandPose(0.5, tl, "glock17", DEFAULT_MODEL_CONFIG);
  const defaultPos = DEFAULT_MODEL_CONFIG.handAnchors.leftHand;
  assert.ok(
    !pose.position.every((v, i) => Math.abs(v - defaultPos[i]) < 1e-6),
    "换弹中段位置不等于 defaultPos"
  );
});

test("AWP progress > 0.85 触发拉栓动作", () => {
  const tl = buildReloadTimeline(AWP_RELOAD_CONFIG);
  const pose = sampleLeftHandPose(0.9, tl, "awp", DEFAULT_MODEL_CONFIG);
  const defaultPos = DEFAULT_MODEL_CONFIG.handAnchors.leftHand;
  // 拉栓位置应该偏离 defaultPos（z 分量明显不同）
  assert.ok(
    Math.abs(pose.position[2] - defaultPos[2]) > 0.1,
    "AWP 拉栓时 z 位置应明显偏离 defaultPos"
  );
});

test("AWP progress < 0.85 不触发拉栓", () => {
  const tl = buildReloadTimeline(AWP_RELOAD_CONFIG);
  // progress=0.5 在正常换弹段
  const pose = sampleLeftHandPose(0.5, tl, "awp", DEFAULT_MODEL_CONFIG);
  const defaultPos = DEFAULT_MODEL_CONFIG.handAnchors.leftHand;
  // 0.5 时应该在弹匣位附近，不是拉栓位
  assert.ok(
    Math.abs(pose.position[2] - defaultPos[2]) < 0.3,
    "AWP 非拉栓段 z 位置应接近弹匣位"
  );
});

// ===== 部件级动画测试 =====

function makeFakeController() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  return {
    engine,
    magazinePivot: new BABYLON.TransformNode("mag-pivot", scene),
    slidePivot: new BABYLON.TransformNode("slide-pivot", scene),
    scene,
  };
}

test("updatePartPivot 非换弹时归零 pivot", () => {
  const { magazinePivot, engine, scene } = makeFakeController();
  magazinePivot.position.set(0.5, -0.3, 0.1);
  updatePartPivot(magazinePivot, null, false, null, 0);
  assert.equal(magazinePivot.position.x, 0);
  assert.equal(magazinePivot.position.y, 0);
  assert.equal(magazinePivot.position.z, 0);
  scene.dispose();
  engine.dispose();
});

test("updatePartPivot 有动画数据时按采样设置位移", () => {
  const { magazinePivot, engine, scene } = makeFakeController();
  const partAnim = {
    translation: {
      times: [0, 1.0],
      values: [[0, 0, 0], [0, -0.2, 0]],
    },
  };
  updatePartPivot(magazinePivot, partAnim, true, { duration: 1.0 }, 0.5, {
    animation: { distance: 0.2, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
  });
  const expected = -0.1;
  assert.ok(Math.abs(magazinePivot.position.y - expected) < 1e-6,
    `pivot y=${magazinePivot.position.y} should be ${expected}`);
  scene.dispose();
  engine.dispose();
});

test("updateReloadAnimation 传 controller 时驱动 magazinePivot", () => {
  clearAnimationCache();
  const mockAnim = {
    magazine: {
      translation: {
        times: [0, 1.0],
        values: [[0, 0, 0], [0, -0.2, 0]],
      },
    },
    slide: null,
  };
  setAnimationCache("glock17", { empty: mockAnim, tactical: null });

  const hands = makeFakeHands();
  const { magazinePivot, slidePivot, engine, scene } = makeFakeController();
  const controller = { magazinePivot, slidePivot };

  updateReloadAnimation(hands, {
    reloading: true,
    reloadProgress: 0.5,
    reloadIsEmpty: true,
    weaponId: "glock17",
    reloadConfig: { duration: 1.0, feedTime: 0.5 },
    modelConfig: {
      ...DEFAULT_MODEL_CONFIG,
      reloadParts: {
        magazine: { animation: { distance: 0.2, axisMap: ["x", "y", "z"], sign: [1, 1, 1] } },
      },
    },
    controller,
  });
  assert.ok(magazinePivot.position.y < -0.001,
    `magazinePivot y=${magazinePivot.position.y} should be negative`);
  assert.equal(slidePivot.position.x, 0, "slidePivot stays at 0 (no slide anim)");

  clearAnimationCache();
  scene.dispose();
  engine.dispose();
});

test("updateReloadAnimation 非换弹时 controller 的 pivot 归零", () => {
  const hands = makeFakeHands();
  const { magazinePivot, slidePivot, engine, scene } = makeFakeController();
  magazinePivot.position.set(0.5, -0.3, 0.1);
  slidePivot.position.set(0.2, 0.1, -0.1);
  const controller = { magazinePivot, slidePivot };

  updateReloadAnimation(hands, {
    reloading: false,
    reloadProgress: 0,
    weaponId: "glock17",
    reloadConfig: null,
    modelConfig: DEFAULT_MODEL_CONFIG,
    controller,
  });
  assert.equal(magazinePivot.position.x, 0, "magazinePivot reset");
  assert.equal(magazinePivot.position.y, 0, "magazinePivot reset");
  assert.equal(slidePivot.position.x, 0, "slidePivot reset");

  scene.dispose();
  engine.dispose();
});

// ===== 原生路径测试（TaCZ native geo bone 驱动）=====

// 辅助：创建带 taczBoneMap 的原生 controller mock
function makeNativeController(scene) {
  const root = new BABYLON.TransformNode("native-root", scene);
  const boneMap = new Map();
  for (const name of ["root", "righthand", "lefthand", "constraint", "mag_and_lefthand", "slide2"]) {
    boneMap.set(name, new BABYLON.TransformNode(`bone-${name}`, scene));
  }
  return {
    root,
    taczBoneMap: boneMap,
    isTaczNative: true,
    boneMap: { root: "root", rightHand: "righthand", leftHand: "lefthand", constraint: "constraint" },
    config: { v2PoseCalibration: { rootScale: 0.02, handScale: 0.03 }, v2BoneAliases: {} },
    calibration: { rootScale: 0.02 },
    magazinePivot: new BABYLON.TransformNode("mag-pivot", scene),
    slidePivot: new BABYLON.TransformNode("slide-pivot", scene),
  };
}

test("原生武器 applyTaczWeaponPose 驱动 boneMap（delta = current - idle）", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const controller = makeNativeController(scene);
    // 构造 taczPose：mag_and_lefthand 位移 [16, 0, 0] 像素，idle 为 [0,0,0]
    // delta = 16 像素，转为 Babylon 单位 = 16/16 = 1.0
    const taczPose = {
      valid: true,
      isTaczNative: true,
      bones: {
        mag_and_lefthand: { position: [16, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      idleBones: {
        mag_and_lefthand: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      boneAliases: {},
    };
    updateReloadAnimation(null, {
      taczPose, controller, weaponId: "deagle_golden", allowLegacy: false,
    });
    const node = controller.taczBoneMap.get("mag_and_lefthand");
    assert.ok(Math.abs(node.position.x - 1.0) < 1e-6, `delta/16 = 1.0（实际: ${node.position.x}）`);
    assert.ok(Math.abs(node.position.y) < 1e-6, "y 归零");
    assert.ok(Math.abs(node.position.z) < 1e-6, "z 归零");
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("原生武器 root motion 只应用到 controller.root，不重复移动 geo root bone", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const controller = makeNativeController(scene);
    const taczPose = {
      valid: true,
      isTaczNative: true,
      bones: {
        root: { position: [16, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      idleBones: {
        root: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      boneAliases: {},
    };
    updateReloadAnimation(null, {
      taczPose, controller, weaponId: "m95", allowLegacy: false,
    });
    const geoRoot = controller.taczBoneMap.get("root");
    assert.equal(geoRoot.position.x, 0, "geo root bone 不再叠加 root motion");
    assert.ok(Math.abs(controller.root.position.x - 16 * 0.02) < 1e-6,
      `controller.root 应只应用一次 root motion，实际 ${controller.root.position.x}`);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("原生武器无效 pose 时 bone 归位", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const controller = makeNativeController(scene);
    // 把 boneMap 中的 node 设为非零值
    for (const node of controller.taczBoneMap.values()) {
      node.position.set(0.5, -0.3, 0.2);
      node.rotation.set(0.1, 0.2, 0.3);
    }
    const taczPose = { valid: false };
    updateReloadAnimation(null, {
      taczPose, controller, weaponId: "deagle_golden", allowLegacy: false,
    });
    for (const [name, node] of controller.taczBoneMap.entries()) {
      assert.equal(node.position.x, 0, `${name} position.x 归零`);
      assert.equal(node.position.y, 0, `${name} position.y 归零`);
      assert.equal(node.position.z, 0, `${name} position.z 归零`);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("原生武器 allowLegacy:false 不走旧路径（magazinePivot 不被修改）", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const controller = makeNativeController(scene);
    // 把 magazinePivot 设为非零值（旧路径会归零它）
    controller.magazinePivot.position.set(0.7, -0.4, 0.3);
    controller.slidePivot.position.set(0.3, 0.2, -0.1);

    // 无效 taczPose + allowLegacy:false
    // 原生路径会 resetTaczBonesInline 归位 boneMap，但不会调用 updateTaczPartPivots
    // updateReloadAnimation 在 appliedTacz=false 但 allowLegacy=false 时直接 return
    const taczPose = { valid: false };
    updateReloadAnimation(null, {
      taczPose, controller, weaponId: "deagle_golden", allowLegacy: false,
    });

    // magazinePivot 应保持不变（旧路径未被调用）
    assert.equal(controller.magazinePivot.position.x, 0.7, "magazinePivot 未被旧路径归零");
    assert.equal(controller.slidePivot.position.x, 0.3, "slidePivot 未被旧路径归零");

    // 但 boneMap 应被 resetTaczBonesInline 归位
    for (const [name, node] of controller.taczBoneMap.entries()) {
      assert.equal(node.position.x, 0, `${name} boneMap 被归位`);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
