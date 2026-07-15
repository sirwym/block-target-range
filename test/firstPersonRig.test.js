import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import {
  createFirstPersonRig,
  normalizeCalibration,
  computeAdsPose,
} from "../src/firstPersonRig.js";

function createTestScene() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.UniversalCamera("test-camera", new BABYLON.Vector3(0, 0, 0), scene);
  camera.setTarget(new BABYLON.Vector3(0, 0, 1));
  return { engine, scene, camera };
}

test("normalizeCalibration 补全缺失字段", () => {
  const cal = normalizeCalibration({ muzzle: [0.1, 0.2, 0.3] });
  assert.deepEqual(cal.hipPose.position, [0.25, -0.35, 0.5]);
  assert.deepEqual(cal.muzzle, [0.1, 0.2, 0.3]);
  assert.equal(cal.modelScale, 1.05);
  assert.equal(cal.adsPose, null);
});

test("normalizeCalibration 保留传入的 hipPose", () => {
  const cal = normalizeCalibration({
    hipPose: { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] },
  });
  assert.deepEqual(cal.hipPose.position, [1, 2, 3]);
  assert.deepEqual(cal.hipPose.rotation, [0.1, 0.2, 0.3]);
});

test("computeAdsPose 使 aimAnchor 对齐 cameraAnchor", () => {
  const cal = normalizeCalibration({
    hipPose: { position: [0.25, -0.35, 0.5], rotation: [0, Math.PI, 0] },
    aim: [0, 0, 0.5],
    modelScale: 1.05,
    screenOffset: [0, 0, 0.5],
  });
  const adsPose = computeAdsPose(cal);
  // 验证：adsPose.position = -rotate(Y=π, aim*modelScale) = -[0,0,-0.525] = [0,0,0.525]
  assert.ok(Math.abs(adsPose.position[0] - 0) < 0.001, `adsPose.x=${adsPose.position[0]}`);
  assert.ok(Math.abs(adsPose.position[1] - 0) < 0.001, `adsPose.y=${adsPose.position[1]}`);
  assert.ok(Math.abs(adsPose.position[2] - 0.525) < 0.001, `adsPose.z=${adsPose.position[2]}`);
});

test("rig 层级正确：parent 链完整", () => {
  const { engine, scene, camera } = createTestScene();
  const rig = createFirstPersonRig(scene, camera, "test", {
    aim: [0, 0, 0.5],
    modelScale: 1.05,
  });

  assert.equal(rig.cameraAnchor.parent, camera, "cameraAnchor parent = camera");
  assert.equal(rig.taczRenderRoot.parent, rig.cameraAnchor, "taczRenderRoot parent = cameraAnchor");
  assert.equal(rig.weaponRoot.parent, rig.taczRenderRoot, "weaponRoot parent = taczRenderRoot");
  assert.ok(Math.abs(rig.cameraAnchor.rotation.y - Math.PI) < 0.0001, "cameraAnchor 保持 Y180 基线补偿");
  assert.ok(Math.abs(rig.taczRenderRoot.rotation.z - Math.PI) < 0.0001, "taczRenderRoot 保持 TaCZ Z180 翻转");
  assert.equal(rig.modelRoot.parent, rig.weaponRoot, "modelRoot parent = weaponRoot");
  assert.equal(rig.aimAnchor.parent, rig.modelRoot, "aimAnchor parent = modelRoot");
  assert.equal(rig.muzzleAnchor.parent, rig.modelRoot, "muzzleAnchor parent = modelRoot");
  assert.equal(rig.rightGripAnchor.parent, rig.modelRoot, "rightGripAnchor parent = modelRoot");
  assert.equal(rig.leftGripAnchor.parent, rig.modelRoot, "leftGripAnchor parent = modelRoot");
  assert.equal(rig.rightHandRoot.parent, rig.weaponRoot, "rightHandRoot parent = weaponRoot");
  assert.equal(rig.leftHandRoot.parent, rig.weaponRoot, "leftHandRoot parent = weaponRoot");
  assert.equal(rig.heldItemRoot.parent, rig.weaponRoot, "heldItemRoot parent = weaponRoot");
  assert.equal(rig.adsRoot.parent, rig.cameraAnchor, "adsRoot parent = cameraAnchor");

  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test("applyHipPose 后 weaponRoot 位置和旋转等于 hipPose", () => {
  const { engine, scene, camera } = createTestScene();
  const hipPose = { position: [0.3, -0.4, 0.6], rotation: [0.1, Math.PI, 0.2] };
  const rig = createFirstPersonRig(scene, camera, "test", { hipPose });

  rig.applyAdsPose(); // 先切到 ADS
  rig.applyHipPose(); // 再切回 hip
  assert.deepEqual(
    [rig.weaponRoot.position.x, rig.weaponRoot.position.y, rig.weaponRoot.position.z],
    hipPose.position
  );
  assert.deepEqual(
    [rig.weaponRoot.rotation.x, rig.weaponRoot.rotation.y, rig.weaponRoot.rotation.z],
    hipPose.rotation
  );
  assert.equal(rig.currentPose, "hip");

  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test("applyAdsPose 后 aimAnchor 世界坐标 ≈ cameraAnchor 世界坐标", () => {
  const { engine, scene, camera } = createTestScene();
  const rig = createFirstPersonRig(scene, camera, "test", {
    hipPose: { position: [0.25, -0.35, 0.5], rotation: [0, Math.PI, 0] },
    aim: [0, -0.1, 0.5], // 瞄具不在枪口正上方，有 y 偏移
    modelScale: 1.05,
    screenOffset: [0, 0, 0.5],
  });

  rig.applyAdsPose();

  const aimWorld = rig.getAimWorldPosition();
  const anchorWorld = rig.getCameraAnchorWorldPosition();

  const dx = Math.abs(aimWorld.x - anchorWorld.x);
  const dy = Math.abs(aimWorld.y - anchorWorld.y);
  const dz = Math.abs(aimWorld.z - anchorWorld.z);

  assert.ok(dx < 0.01, `aimAnchor x 偏差 ${dx} 超过 0.01`);
  assert.ok(dy < 0.01, `aimAnchor y 偏差 ${dy} 超过 0.01`);
  assert.ok(dz < 0.01, `aimAnchor z 偏差 ${dz} 超过 0.01`);

  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test("applyInspectPose 设置 inspectPose 位置和旋转", () => {
  const { engine, scene, camera } = createTestScene();
  const inspectPose = { position: [0.15, -0.2, 0.35], rotation: [0.3, Math.PI - 0.2, 0.15] };
  const rig = createFirstPersonRig(scene, camera, "test", { inspectPose });

  rig.applyInspectPose();
  assert.deepEqual(
    [rig.weaponRoot.position.x, rig.weaponRoot.position.y, rig.weaponRoot.position.z],
    inspectPose.position
  );
  assert.deepEqual(
    [rig.weaponRoot.rotation.x, rig.weaponRoot.rotation.y, rig.weaponRoot.rotation.z],
    inspectPose.rotation
  );
  assert.equal(rig.currentPose, "inspect");

  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test("blendPose 在 hip 和 ads 之间插值", () => {
  const { engine, scene, camera } = createTestScene();
  const rig = createFirstPersonRig(scene, camera, "test", {
    hipPose: { position: [0.25, -0.35, 0.5], rotation: [0, Math.PI, 0] },
    aim: [0, 0, 0.5],
    modelScale: 1.05,
  });

  // weight=0 应等于 hipPose
  rig.blendPose("hip", "ads", 0);
  assert.ok(Math.abs(rig.weaponRoot.position.x - 0.25) < 0.001);
  assert.ok(Math.abs(rig.weaponRoot.position.z - 0.5) < 0.001);

  // weight=1 应等于 adsPose
  rig.blendPose("hip", "ads", 1);
  const adsPos = rig.adsPose.position;
  assert.ok(Math.abs(rig.weaponRoot.position.x - adsPos[0]) < 0.001);
  assert.ok(Math.abs(rig.weaponRoot.position.z - adsPos[2]) < 0.001);

  // weight=0.5 应在中间
  rig.blendPose("hip", "ads", 0.5);
  const midX = (0.25 + adsPos[0]) / 2;
  assert.ok(Math.abs(rig.weaponRoot.position.x - midX) < 0.01);

  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test("setEnabled 控制整个 rig 可见性", () => {
  const { engine, scene, camera } = createTestScene();
  const rig = createFirstPersonRig(scene, camera, "test", {});

  rig.setEnabled(true);
  assert.equal(rig.cameraAnchor.isEnabled(), true);

  rig.setEnabled(false);
  assert.equal(rig.cameraAnchor.isEnabled(), false);

  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test("heldItemRoot 默认隐藏", () => {
  const { engine, scene, camera } = createTestScene();
  const rig = createFirstPersonRig(scene, camera, "test", {});
  assert.equal(rig.heldItemRoot.isEnabled(), false, "heldItemRoot 默认应隐藏");

  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test("dispose 后 cameraAnchor 不在 scene 中", () => {
  const { engine, scene, camera } = createTestScene();
  const rig = createFirstPersonRig(scene, camera, "test", {});

  rig.dispose();
  // TransformNode dispose 后不应再能找到
  const nodes = scene.transformNodes.filter((n) => n.name.startsWith("test-"));
  assert.equal(nodes.length, 0, "dispose 后不应有残留节点");

  scene.dispose();
  engine.dispose();
});

test("rightHandRoot 和 leftHandRoot 独立于 modelRoot 缩放", () => {
  const { engine, scene, camera } = createTestScene();
  const modelScale = 2.0;
  const rightGrip = [0.3, -0.4, 0.2];
  const rig = createFirstPersonRig(scene, camera, "test", {
    modelScale,
    rightGrip,
  });

  // rightHandRoot 的位置应等于 rightGrip（不受 modelScale 影响）
  assert.ok(Math.abs(rig.rightHandRoot.position.x - rightGrip[0]) < 0.001);
  assert.ok(Math.abs(rig.rightHandRoot.position.y - rightGrip[1]) < 0.001);
  assert.ok(Math.abs(rig.rightHandRoot.position.z - rightGrip[2]) < 0.001);

  // rightGripAnchor 的位置也应等于 rightGrip（在 modelRoot 下，但 modelRoot 缩放不影响子节点本地 position）
  assert.ok(Math.abs(rig.rightGripAnchor.position.x - rightGrip[0]) < 0.001);

  // modelRoot 的 scaling 应为 modelScale
  assert.ok(Math.abs(rig.modelRoot.scaling.x - modelScale) < 0.001);

  rig.dispose();
  scene.dispose();
  engine.dispose();
});

// ===== Phase 7: 冷兵器 pose 预留接口测试 =====

test("applyMeleePose 设置 currentPose='melee'", () => {
  const { engine, scene, camera } = createTestScene();
  const rig = createFirstPersonRig(scene, camera, "test-melee", null);
  assert.equal(rig.currentPose, "hip", "初始 currentPose='hip'");
  rig.applyMeleePose();
  assert.equal(rig.currentPose, "melee", "applyMeleePose 后 currentPose='melee'");
  // 武器位置应改变为挥砍 pose
  assert.ok(Math.abs(rig.weaponRoot.position.x - 0.35) < 0.001, "melee pose weaponRoot.x=0.35");
  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test("applyTwoHandHoldPose 修改 leftHandRoot 位置", () => {
  const { engine, scene, camera } = createTestScene();
  const rig = createFirstPersonRig(scene, camera, "test-twohand", null);
  const originalLeftX = rig.leftHandRoot.position.x;
  rig.applyTwoHandHoldPose();
  assert.equal(rig.currentPose, "two_hand_hold", "currentPose='two_hand_hold'");
  // leftHandRoot 应被前移到双手握持位置
  assert.ok(Math.abs(rig.leftHandRoot.position.x - 0.30) < 0.001, "leftHandRoot.x=0.30");
  assert.ok(Math.abs(rig.leftHandRoot.position.y - (-0.30)) < 0.001, "leftHandRoot.y=-0.30");
  // x 值应从原值改变（默认 leftGrip.x=-0.1，two_hand_hold 设为 0.30）
  assert.notEqual(
    Math.abs(rig.leftHandRoot.position.x - originalLeftX) < 0.001,
    true,
    "leftHandRoot.x 已从原值改变"
  );
  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test("applyShieldBlockPose 设置 currentPose='shield_block'", () => {
  const { engine, scene, camera } = createTestScene();
  const rig = createFirstPersonRig(scene, camera, "test-shield", null);
  rig.applyShieldBlockPose();
  assert.equal(rig.currentPose, "shield_block", "currentPose='shield_block'");
  // 左手应抬高到胸前
  assert.ok(Math.abs(rig.leftHandRoot.position.y - (-0.15)) < 0.001, "leftHandRoot.y=-0.15");
  rig.dispose();
  scene.dispose();
  engine.dispose();
});

test("restoreHandRoots 恢复双手 root 到 calibration 位置", () => {
  const { engine, scene, camera } = createTestScene();
  const customCalibration = {
    rightGrip: [0.20, -0.30, 0.10],
    leftGrip: [0.05, -0.25, 0.30],
  };
  const rig = createFirstPersonRig(scene, camera, "test-restore", customCalibration);
  // 先切换到冷兵器 pose 修改 leftHandRoot
  rig.applyTwoHandHoldPose();
  assert.ok(Math.abs(rig.leftHandRoot.position.x - 0.30) < 0.001, "two_hand_hold 后 leftHandRoot.x=0.30");
  // restoreHandRoots 应恢复到 calibration 位置
  rig.restoreHandRoots();
  assert.ok(Math.abs(rig.rightHandRoot.position.x - 0.20) < 0.001, "restore 后 rightHandRoot.x=calibration.rightGrip[0]");
  assert.ok(Math.abs(rig.rightHandRoot.position.y - (-0.30)) < 0.001, "restore 后 rightHandRoot.y=calibration.rightGrip[1]");
  assert.ok(Math.abs(rig.leftHandRoot.position.x - 0.05) < 0.001, "restore 后 leftHandRoot.x=calibration.leftGrip[0]");
  assert.ok(Math.abs(rig.leftHandRoot.position.y - (-0.25)) < 0.001, "restore 后 leftHandRoot.y=calibration.leftGrip[1]");
  rig.dispose();
  scene.dispose();
  engine.dispose();
});
