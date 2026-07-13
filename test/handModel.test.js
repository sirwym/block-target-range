import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import { createHands, updateHands, disposeHands, applyHandBonePose, applyPlayerAnimationPose, _setSteveTextureForTest, _TEST_ONLY } from "../src/handModel.js";

const { DEFAULT_HAND_ANCHORS, FOREARM_SIZE, PALM_SIZE, WRIST_SIZE } = _TEST_ONLY;

const MODEL_CONFIG = {
  handAnchors: {
    rightHand: [0.15, -0.32, 0.1],
    leftHand: [0.0, -0.28, 0.35],
  },
};

// 用 64×64 RawTexture 模拟 steve.png，避免 Node.js 下 DynamicTexture 需要 OffscreenCanvas。
// 填充浅肤色像素 [200, 170, 140, 255]，让 createSkinPatchTexture 走 RawTexture 分支。
function injectFakeSteveTexture(scene) {
  const width = 64;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data.set([200, 170, 140, 255], i * 4);
  }
  const texture = BABYLON.RawTexture.CreateRGBATexture(data, width, height, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
  _setSteveTextureForTest(texture);
  return texture;
}

function makeScene() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("weapon-root", scene);
  injectFakeSteveTexture(scene);
  return { scene, root };
}

test("createHands 返回含 leftHand 和 rightHand 的对象", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "glock17", MODEL_CONFIG);
  assert.ok(hands.leftHand, "有 leftHand");
  assert.ok(hands.rightHand, "有 rightHand");
  assert.equal(hands.weaponId, "glock17");
});

test("每只手有 root 和 palm mesh", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "glock17", MODEL_CONFIG);
  for (const side of ["leftHand", "rightHand"]) {
    assert.ok(hands[side].root, `${side} 有 root`);
    assert.ok(hands[side].forearm, `${side} 有 forearm`);
    assert.ok(hands[side].palm, `${side} 有 palm`);
    assert.ok(hands[side].material, `${side} 有 material`);
  }
});

test("手部 root 的 parent 是武器 root", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "m4", MODEL_CONFIG);
  assert.equal(hands.leftHand.root.parent, root, "leftHand root 挂到武器 root");
  assert.equal(hands.rightHand.root.parent, root, "rightHand root 挂到武器 root");
});

test("手部 defaultPos 等于 handAnchors 配置", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "ak47", MODEL_CONFIG);
  assert.deepEqual(hands.leftHand.defaultPos, MODEL_CONFIG.handAnchors.leftHand);
  assert.deepEqual(hands.rightHand.defaultPos, MODEL_CONFIG.handAnchors.rightHand);
});

test("手部 mesh 不可拾取", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "awp", MODEL_CONFIG);
  assert.equal(hands.leftHand.forearm.isPickable, false, "leftHand forearm 不可拾取");
  assert.equal(hands.leftHand.palm.isPickable, false, "leftHand palm 不可拾取");
  assert.equal(hands.rightHand.forearm.isPickable, false, "rightHand forearm 不可拾取");
  assert.equal(hands.rightHand.palm.isPickable, false, "rightHand palm 不可拾取");
});

test("updateHands recoil=0 时右手 z 位置等于 defaultPos[2]", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "p90", MODEL_CONFIG);
  updateHands(hands, { recoil: 0, reloading: false, reloadProgress: 0 });
  assert.equal(hands.rightHand.root.position.z, MODEL_CONFIG.handAnchors.rightHand[2]);
});

test("updateHands recoil>0 时右手 z 位置小于 defaultPos[2]（后仰）", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "glock17", MODEL_CONFIG);
  updateHands(hands, { recoil: 1, reloading: false, reloadProgress: 0 });
  assert.ok(
    hands.rightHand.root.position.z < MODEL_CONFIG.handAnchors.rightHand[2],
    "recoil>0 时右手 z 应小于 defaultPos[2]"
  );
});

test("updateHands reloading=true 时不重置左手位置", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "glock17", MODEL_CONFIG);
  // 把左手移到换弹位置
  hands.leftHand.root.position.set(0.5, -0.5, 0.5);
  updateHands(hands, { recoil: 0, reloading: true, reloadProgress: 0.5 });
  // reloading=true 时左手不应被 updateHands 重置
  assert.equal(hands.leftHand.root.position.x, 0.5, "reloading 时左手 x 不变");
  assert.equal(hands.leftHand.root.position.y, -0.5, "reloading 时左手 y 不变");
  assert.equal(hands.leftHand.root.position.z, 0.5, "reloading 时左手 z 不变");
});

test("updateHands reloading=false 时重置左手到 defaultPos", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "glock17", MODEL_CONFIG);
  hands.leftHand.root.position.set(0.5, -0.5, 0.5);
  updateHands(hands, { recoil: 0, reloading: false, reloadProgress: 0 });
  assert.deepEqual(
    [hands.leftHand.root.position.x, hands.leftHand.root.position.y, hands.leftHand.root.position.z],
    MODEL_CONFIG.handAnchors.leftHand
  );
});

test("updateHands hands 为 null 时不报错", () => {
  assert.doesNotThrow(() => updateHands(null, { recoil: 0, reloading: false }));
});

test("disposeHands 后手部 mesh 已销毁", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "glock17", MODEL_CONFIG);
  const leftRootName = hands.leftHand.root.name;
  disposeHands(hands);
  assert.ok(!scene.getNodeByName(leftRootName), "dispose 后 leftHand root 已从场景移除");
});

test("DEFAULT_HAND_ANCHORS 含 rightHand 和 leftHand", () => {
  assert.ok(Array.isArray(DEFAULT_HAND_ANCHORS.rightHand), "rightHand 是数组");
  assert.ok(Array.isArray(DEFAULT_HAND_ANCHORS.leftHand), "leftHand 是数组");
  assert.equal(DEFAULT_HAND_ANCHORS.rightHand.length, 3, "rightHand 是 3 元素");
  assert.equal(DEFAULT_HAND_ANCHORS.leftHand.length, 3, "leftHand 是 3 元素");
});

test("手部尺寸符合 Minecraft 玩家模型", () => {
  assert.ok(FOREARM_SIZE.w > 0 && FOREARM_SIZE.h > 0 && FOREARM_SIZE.d > 0, "forearm 尺寸有效");
  assert.ok(PALM_SIZE.w > 0 && PALM_SIZE.h > 0 && PALM_SIZE.d > 0, "palm 尺寸有效");
  // 前臂高度应大于手掌高度（前臂 12 像素，手掌 4 像素）
  assert.ok(FOREARM_SIZE.h > PALM_SIZE.h, "前臂比手掌长");
});

test("原生 TaCZ 手部姿态以 handAnchors 为基准叠加动画 delta", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "m95", {
    handAnchors: {
      rightHand: [0.12, -0.28, 0.05],
      leftHand: [0.05, -0.22, 0.3],
    },
    viewTransform: { handScale: 0.42 },
  });
  const boneMap = new Map([
    ["righthand", new BABYLON.TransformNode("bone-righthand", scene)],
    ["lefthand", new BABYLON.TransformNode("bone-lefthand", scene)],
  ]);
  const applied = applyHandBonePose(
    hands,
    boneMap,
    {
      bones: {
        righthand: { position: [10, 5, 0], rotation: [0, 30, 0], scale: [1, 1, 1] },
        lefthand: { position: [0, 8, -4], rotation: [10, 0, 0], scale: [1, 1, 1] },
      },
      idleBones: {
        righthand: { position: [2, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        lefthand: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    },
    { rightHand: "righthand", leftHand: "lefthand" },
    {
      modelConfig: { viewTransform: { handScale: 0.42 } },
      v2PoseCalibration: { handScale: 0.025, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
    }
  );
  assert.equal(applied, true);
  assert.ok(Math.abs(hands.rightHand.root.position.x - (0.12 + 8 * 0.025)) < 1e-6);
  assert.ok(Math.abs(hands.rightHand.root.position.y - (-0.28 + 4 * 0.025)) < 1e-6);
  assert.ok(Math.abs(hands.rightHand.root.position.z - 0.05) < 1e-6);
  assert.equal(hands.rightHand.root.scaling.x, 0.42);
  assert.equal(hands.leftHand.root.scaling.x, 0.42);
  assert.ok(hands.rightHand.root.rotationQuaternion, "右手使用 TaCZ rotationQuaternion");
});

test("原生 TaCZ 手部姿态支持每只手独立 visualScale 和 positionOffset", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "deagle_golden", MODEL_CONFIG);
  const boneMap = new Map([
    ["righthand", new BABYLON.TransformNode("bone-righthand", scene)],
  ]);
  applyHandBonePose(
    hands,
    boneMap,
    {
      bones: {
        righthand: { position: [4, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      idleBones: {
        righthand: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    },
    { rightHand: "righthand", leftHand: "lefthand" },
    {
      modelConfig: { viewTransform: { handScale: 0.5 } },
      v2PoseCalibration: {
        handScale: 0.02,
        hands: {
          rightHand: { positionScale: 0.01, positionOffset: [0.03, 0, 0], visualScale: 0.35 },
        },
      },
    }
  );
  assert.ok(Math.abs(hands.rightHand.root.position.x - (MODEL_CONFIG.handAnchors.rightHand[0] + 0.04 + 0.03)) < 1e-6);
  assert.equal(hands.rightHand.root.scaling.x, 0.35);
});

// ===== Phase 4: 4 层手部层级 + applyPlayerAnimationPose 测试 =====

test("每只手有 wrist mesh 且 parent === palm", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "glock17", MODEL_CONFIG);
  for (const side of ["leftHand", "rightHand"]) {
    assert.ok(hands[side].wrist, `${side} 有 wrist`);
    assert.equal(hands[side].wrist.parent, hands[side].palm, `${side} wrist.parent === palm`);
    assert.equal(hands[side].wrist.isPickable, false, `${side} wrist 不可拾取`);
  }
});

test("WRIST_SIZE 从 _TEST_ONLY 导出且尺寸合理", () => {
  assert.ok(WRIST_SIZE, "WRIST_SIZE 存在");
  assert.ok(WRIST_SIZE.w > 0 && WRIST_SIZE.h > 0 && WRIST_SIZE.d > 0, "WRIST_SIZE 三维有效");
  // 手腕高度应小于手掌高度（手腕是手掌末端关节）
  assert.ok(WRIST_SIZE.h < PALM_SIZE.h, "手腕比手掌薄");
});

test("applyPlayerAnimationPose 把 right_arm rotation 应用到 forearm", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "glock17", MODEL_CONFIG);
  // 构造 mock player_animation 数据（Bedrock 格式，度数）
  const mockPlayerAnim = {
    format_version: "1.8.0",
    animations: {
      hold_upper: {
        loop: true,
        animation_length: 1.0,
        bones: {
          right_arm: {
            rotation: { "0.0": { post: [-90, 0, 0] } },
            position: { "0.0": { post: [2, -2, 1] } },
          },
          left_arm: {
            rotation: { "0.0": { post: [-80, 0, 0] } },
            position: { "0.0": { post: [-2, -2, 1] } },
          },
        },
      },
    },
  };
  const applied = applyPlayerAnimationPose(hands, mockPlayerAnim, "hold_upper", 0, {
    v2PoseCalibration: { handScale: 0.025 },
    modelConfig: { viewTransform: { handScale: 0.5 } },
  });
  assert.equal(applied, true, "applyPlayerAnimationPose 返回 true");
  // forearm 应使用 rotationQuaternion（ZXY 顺序）
  assert.ok(hands.rightHand.forearm.rotationQuaternion, "右手 forearm rotationQuaternion 非空");
  assert.ok(hands.leftHand.forearm.rotationQuaternion, "左手 forearm rotationQuaternion 非空");
  // visualScale 应应用到 forearm scaling
  assert.equal(hands.rightHand.forearm.scaling.x, 0.5, "右手 forearm scaling = visualScale");
});

test("applyPlayerAnimationPose null 安全", () => {
  const { scene, root } = makeScene();
  const hands = createHands(scene, root, "glock17", MODEL_CONFIG);
  assert.equal(applyPlayerAnimationPose(null, {}, "idle", 0), false, "hands=null 返回 false");
  assert.equal(applyPlayerAnimationPose(hands, null, "idle", 0), false, "playerAnimationData=null 返回 false");
  assert.equal(applyPlayerAnimationPose(hands, {}, "idle", 0), false, "空 playerAnimationData 返回 false");
});
