import * as BABYLON from "@babylonjs/core";
import { ASSET_ROOT } from "./config.js";
import { createSkinPatchTexture, materialFromTexture } from "./assets.js";
import { sampleAnimation } from "./taczAnimationParser.js";

// steve.png 手臂 UV 区域（64×64 标准 Minecraft 皮肤）
// 右手臂正面 [44,20,4,12]：x=44, y=20, w=4, h=12（像素坐标）
// 左手臂在 64×64 扩展层 [36,52,4,12]，但简化用右臂贴图镜像即可
const STEVE_ARM_RECT = [40, 16, 16, 16];
const STEVE_PALM_RECT = [44, 16, 4, 4];

// Minecraft 玩家手臂尺寸（像素，1 像素 = 1/16 Babylon 单位）
const FOREARM_SIZE = { w: 4 / 16, h: 12 / 16, d: 4 / 16 }; // 前臂 4×12×4
const PALM_SIZE = { w: 4 / 16, h: 4 / 16, d: 4 / 16 };     // 手掌 4×4×4
const WRIST_SIZE = { w: 4 / 16, h: 2 / 16, d: 4 / 16 };    // 手腕 4×2×4（手掌末端关节，用于细节旋转）

// 手部默认锚点（武器 root 坐标系）
// 如果 modelConfig.handAnchors 未指定，用这套通用默认值
const DEFAULT_HAND_ANCHORS = {
  rightHand: [0.25, -0.35, 0.2],
  leftHand: [-0.1, -0.3, 0.35],
};

let steveTextureCache = null;

function loadSteveTexture(scene) {
  if (steveTextureCache) return steveTextureCache;
  const texture = new BABYLON.Texture(
    `${ASSET_ROOT}/entity/player/steve.png`,
    scene,
    false,
    false,
    BABYLON.Texture.NEAREST_SAMPLINGMODE
  );
  texture.hasAlpha = true;
  steveTextureCache = texture;
  return texture;
}

function buildHandMesh(scene, parent, weaponId, side, steveTexture) {
  const root = new BABYLON.TransformNode(`${weaponId}-${side}-hand-root`, scene);
  root.parent = parent;

  // 前臂立方体
  const forearm = BABYLON.MeshBuilder.CreateBox(
    `${weaponId}-${side}-forearm`,
    { width: FOREARM_SIZE.w, height: FOREARM_SIZE.h, depth: FOREARM_SIZE.d },
    scene
  );
  forearm.parent = root;
  forearm.position.y = -FOREARM_SIZE.h / 2;
  forearm.isPickable = false;
  forearm.renderingGroupId = 2;
  forearm.alwaysSelectAsActiveMesh = true;

  // 手掌立方体，附加在前臂下端（第一人称视角手向下伸）
  const palm = BABYLON.MeshBuilder.CreateBox(
    `${weaponId}-${side}-palm`,
    { width: PALM_SIZE.w, height: PALM_SIZE.h, depth: PALM_SIZE.d },
    scene
  );
  palm.parent = root;
  palm.position.y = -FOREARM_SIZE.h - PALM_SIZE.h / 2;
  palm.isPickable = false;
  palm.renderingGroupId = 2;
  palm.alwaysSelectAsActiveMesh = true;

  // 手腕立方体（4 层层级最末端），附加在手掌下端，用于细节旋转
  // TaCZ player_animation.json 中的 righthand/lefthand bone 旋转可作用于手腕节点
  const wrist = BABYLON.MeshBuilder.CreateBox(
    `${weaponId}-${side}-wrist`,
    { width: WRIST_SIZE.w, height: WRIST_SIZE.h, depth: WRIST_SIZE.d },
    scene
  );
  wrist.parent = palm;
  wrist.position.y = -PALM_SIZE.h / 2 - WRIST_SIZE.h / 2;
  wrist.isPickable = false;
  wrist.renderingGroupId = 2;
  wrist.alwaysSelectAsActiveMesh = true;

  // 用 steve.png 手臂区域贴图
  const armPatch = createSkinPatchTexture(scene, steveTexture, 64, 64, STEVE_ARM_RECT, `${weaponId}-${side}-arm-texture`);
  const material = materialFromTexture(scene, armPatch, { name: `${weaponId}-${side}-hand-material` });
  forearm.material = material;
  palm.material = material;
  wrist.material = material;

  return { root, forearm, palm, wrist, material };
}

export function createHands(scene, weaponRoot, weaponId, modelConfig) {
  const steveTexture = loadSteveTexture(scene);
  const anchors = modelConfig?.handAnchors ?? DEFAULT_HAND_ANCHORS;

  const leftHand = buildHandMesh(scene, weaponRoot, weaponId, "left", steveTexture);
  const rightHand = buildHandMesh(scene, weaponRoot, weaponId, "right", steveTexture);

  // 默认位置：右手握把，左手托枪
  leftHand.defaultPos = [...anchors.leftHand];
  rightHand.defaultPos = [...anchors.rightHand];
  leftHand.defaultRot = [0, 0, 0];
  rightHand.defaultRot = [0, 0, 0];
  leftHand.defaultScale = [1, 1, 1];
  rightHand.defaultScale = [1, 1, 1];
  leftHand.animationPoseApplied = false;
  rightHand.animationPoseApplied = false;
  leftHand.root.position.set(...anchors.leftHand);
  rightHand.root.position.set(...anchors.rightHand);

  // 左手默认旋转：手掌朝右（托枪）
  leftHand.root.rotation.set(0, 0, 0);
  // 右手默认旋转：手掌朝左（握把）
  rightHand.root.rotation.set(0, 0, 0);

  return {
    leftHand,
    rightHand,
    weaponId,
  };
}

function applyPoseToHand(hand, pose, blendWeight = 1) {
  if (!hand?.root || !pose) return false;
  const weight = Math.max(0, Math.min(1, blendWeight));
  const position = pose.position ?? hand.defaultPos;
  const rotation = pose.rotation ?? hand.defaultRot ?? [0, 0, 0];
  const scale = pose.scale ?? hand.defaultScale ?? [1, 1, 1];
  hand.root.position.set(
    BABYLON.Scalar.Lerp(hand.root.position.x, position[0], weight),
    BABYLON.Scalar.Lerp(hand.root.position.y, position[1], weight),
    BABYLON.Scalar.Lerp(hand.root.position.z, position[2], weight)
  );
  hand.root.rotation.set(
    BABYLON.Scalar.Lerp(hand.root.rotation.x, rotation[0], weight),
    BABYLON.Scalar.Lerp(hand.root.rotation.y, rotation[1], weight),
    BABYLON.Scalar.Lerp(hand.root.rotation.z, rotation[2], weight)
  );
  hand.root.scaling.set(
    BABYLON.Scalar.Lerp(hand.root.scaling.x, scale[0], weight),
    BABYLON.Scalar.Lerp(hand.root.scaling.y, scale[1], weight),
    BABYLON.Scalar.Lerp(hand.root.scaling.z, scale[2], weight)
  );
  hand.animationPoseApplied = true;
  return true;
}

export function applyHandAnimationPose(hands, pose, blendWeight = 1) {
  if (!hands || !pose) return false;
  const leftApplied = applyPoseToHand(hands.leftHand, pose.lefthand, blendWeight);
  const rightApplied = applyPoseToHand(hands.rightHand, pose.righthand, blendWeight);
  return leftApplied || rightApplied;
}

// TaCZ player_animation.json 驱动第一人称手臂姿态
// 从 playerAnimationData.animations[action].bones 中取 right_arm/left_arm 的 rotation/position，
// 把 rotation（Bedrock 度数，ZXY 顺序）应用到 forearm.rotationQuaternion，
// position 作为 delta 叠加到 forearm 默认位置（基准 + delta * positionScale）。
// 这层动画和 applyHandBonePose（武器动画 bone 驱动手 root）互补：
//   applyHandBonePose 驱动手 root 位置/旋转（整体手部位移）
//   applyPlayerAnimationPose 驱动 forearm 旋转（手臂关节角度）
export function applyPlayerAnimationPose(hands, playerAnimationData, action, time, config = {}) {
  if (!hands || !playerAnimationData) return false;
  const sample = sampleAnimation(playerAnimationData, action, time);
  if (!sample?.bones) return false;

  const calibration = config?.v2PoseCalibration ?? config?.calibration ?? {};
  const positionScale = calibration.handScale ?? calibration.positionScale ?? 0.028;
  const modelConfig = config?.modelConfig ?? {};
  const visualScale = modelConfig?.viewTransform?.handScale ?? modelConfig?.handScale ?? 1;

  let applied = false;

  // right_arm → rightHand.forearm
  const rightArm = sample.bones.right_arm;
  if (rightArm && hands.rightHand?.forearm) {
    const rotation = rightArm.rotation ?? [0, 0, 0];
    applyBedrockRotationInline(hands.rightHand.forearm, rotation);
    const position = rightArm.position ?? [0, 0, 0];
    hands.rightHand.forearm.position.set(
      position[0] * positionScale,
      -FOREARM_SIZE.h / 2 + position[1] * positionScale,
      position[2] * positionScale
    );
    hands.rightHand.forearm.scaling.setAll(visualScale);
    applied = true;
  }

  // left_arm → leftHand.forearm
  const leftArm = sample.bones.left_arm;
  if (leftArm && hands.leftHand?.forearm) {
    const rotation = leftArm.rotation ?? [0, 0, 0];
    applyBedrockRotationInline(hands.leftHand.forearm, rotation);
    const position = leftArm.position ?? [0, 0, 0];
    hands.leftHand.forearm.position.set(
      position[0] * positionScale,
      -FOREARM_SIZE.h / 2 + position[1] * positionScale,
      position[2] * positionScale
    );
    hands.leftHand.forearm.scaling.setAll(visualScale);
    applied = true;
  }

  return applied;
}

// bone 名解析：先直接查 boneMap，再查别名（支持 fallback 数组）
function resolveBoneInMap(name, boneMap, boneAliases) {
  if (!name) return null;
  const candidates = Array.isArray(name) ? name : [name];
  for (const c of candidates) {
    if (boneMap.has(c)) return c;
    const alias = boneAliases[c];
    if (alias && boneMap.has(alias)) return alias;
  }
  return null;
}

// Bedrock 旋转顺序：TaCZ mod 实测为 ZXY（先 Z 后 X 再 Y）
// 用 Quaternion 显式构造 ZXY 顺序，与 taczGeoModel.js 的 applyBedrockRotation 保持一致
// 内联实现避免从 taczGeoModel.js import 导致循环依赖
const HAND_DEG_TO_RAD = Math.PI / 180;
function applyBedrockRotationInline(node, rotationDeg) {
  const x = rotationDeg[0] * HAND_DEG_TO_RAD;
  const y = rotationDeg[1] * HAND_DEG_TO_RAD;
  const z = rotationDeg[2] * HAND_DEG_TO_RAD;
  const qZ = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, z);
  const qX = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, x);
  const qY = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, y);
  node.rotationQuaternion = qY.multiply(qX).multiply(qZ);
}

function vec3(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value)) return [...fallback];
  return [
    Number.isFinite(Number(value[0])) ? Number(value[0]) : fallback[0],
    Number.isFinite(Number(value[1])) ? Number(value[1]) : fallback[1],
    Number.isFinite(Number(value[2])) ? Number(value[2]) : fallback[2],
  ];
}

function mapAxis(raw, calibration = {}) {
  const source = { x: raw[0] ?? 0, y: raw[1] ?? 0, z: raw[2] ?? 0 };
  const axisMap = calibration.axisMap ?? ["x", "y", "z"];
  const sign = calibration.sign ?? [1, 1, 1];
  return axisMap.map((axis, index) => (source[axis] ?? 0) * (sign[index] ?? 1));
}

function getHandCalibration(config, handKey) {
  const calibration = config?.v2PoseCalibration ?? config?.calibration ?? {};
  return {
    shared: calibration,
    hand: calibration.hands?.[handKey] ?? {},
  };
}

function applyNativeHandPose(hand, handKey, transform, idleTransform, config, modelConfig) {
  if (!hand?.root || !transform) return false;
  const { shared, hand: handCalibration } = getHandCalibration(config, handKey);
  const base = vec3(hand.defaultPos);
  const rawPosition = vec3(transform.position);
  const idlePosition = vec3(idleTransform?.position);
  const delta = mapAxis([
    rawPosition[0] - idlePosition[0],
    rawPosition[1] - idlePosition[1],
    rawPosition[2] - idlePosition[2],
  ], shared);
  const positionScale = handCalibration.positionScale
    ?? shared.handPositionScale
    ?? shared.handScale
    ?? shared.positionScale
    ?? 0.028;
  const positionOffset = vec3(handCalibration.positionOffset ?? shared.positionOffset);
  hand.root.position.set(
    base[0] + delta[0] * positionScale + positionOffset[0],
    base[1] + delta[1] * positionScale + positionOffset[1],
    base[2] + delta[2] * positionScale + positionOffset[2]
  );

  const rotationOffset = vec3(handCalibration.rotationOffset ?? shared.rotationOffset);
  const rotation = vec3(transform.rotation);
  const mappedRotation = mapAxis(rotation, shared);
  applyBedrockRotationInline(hand.root, [
    mappedRotation[0] + rotationOffset[0],
    mappedRotation[1] + rotationOffset[1],
    mappedRotation[2] + rotationOffset[2],
  ]);

  const visualScale = handCalibration.visualScale
    ?? modelConfig?.viewTransform?.handScale
    ?? modelConfig?.handScale
    ?? 1;
  const animScale = vec3(transform.scale, [1, 1, 1]);
  hand.root.scaling.set(
    visualScale * animScale[0],
    visualScale * animScale[1],
    visualScale * animScale[2]
  );
  hand.animationPoseApplied = true;
  return true;
}

// 原生路径：从 righthand/lefthand bone 世界坐标驱动手模型
// 以项目第一人称 handAnchors 为基准，叠加 TaCZ 动画相对 idle 的手部位移。
// 不能直接把 TaCZ bone 世界坐标塞给手模型；geo bone 坐标空间和当前相机 root 不同，
// 直接套用会让手臂贴脸并遮满画面。
export function applyHandBonePose(hands, boneMap, taczPose, configBoneMap, config) {
  if (!hands || !taczPose?.bones || !configBoneMap) return false;

  const bones = taczPose.bones;
  const idleBones = taczPose.idleBones ?? {};
  const boneAliases = taczPose.boneAliases ?? {};
  const modelConfig = config?.modelConfig ?? {};
  let applied = false;

  // 右手：从 righthand bone 世界坐标驱动
  const rightHandName = configBoneMap.rightHand;
  const rightBoneName = resolveBoneInMap(rightHandName, boneMap, boneAliases);
  if (rightBoneName && hands.rightHand) {
    const rightTransform = bones[rightBoneName] ?? bones[rightHandName];
    const rightIdle = idleBones[rightBoneName] ?? idleBones[rightHandName];
    applied = applyNativeHandPose(hands.rightHand, "rightHand", rightTransform, rightIdle, config, modelConfig) || applied;
  }

  // 左手：从 lefthand bone 世界坐标驱动
  const leftHandName = configBoneMap.leftHand;
  const leftBoneName = resolveBoneInMap(leftHandName, boneMap, boneAliases);
  if (leftBoneName && hands.leftHand) {
    const leftTransform = bones[leftBoneName] ?? bones[leftHandName];
    const leftIdle = idleBones[leftBoneName] ?? idleBones[leftHandName];
    applied = applyNativeHandPose(hands.leftHand, "leftHand", leftTransform, leftIdle, config, modelConfig) || applied;
  }

  return applied;
}

export function resetHandAnimationFlags(hands) {
  if (!hands) return;
  if (hands.leftHand) hands.leftHand.animationPoseApplied = false;
  if (hands.rightHand) hands.rightHand.animationPoseApplied = false;
}

export function resetHandPose(hand) {
  if (!hand?.root) return;
  hand.root.position.set(...hand.defaultPos);
  hand.root.rotation.set(...(hand.defaultRot ?? [0, 0, 0]));
  hand.root.rotationQuaternion = null;
  hand.root.scaling.set(...(hand.defaultScale ?? [1, 1, 1]));
  hand.animationPoseApplied = false;
}

export function updateHands(hands, { recoil, reloading, reloadProgress, animationPoseApplied = false }) {
  if (!hands) return;
  const hasAnimationPose = animationPoseApplied || hands.leftHand?.animationPoseApplied || hands.rightHand?.animationPoseApplied;
  if (hasAnimationPose) {
    if (hands.rightHand?.root) {
      hands.rightHand.root.position.z -= recoil * 0.03;
    }
    return;
  }
  // 右手：开火时轻微后仰（Z 轴回退）
  const rightRecoilOffset = recoil * 0.03;
  hands.rightHand.root.position.z = hands.rightHand.defaultPos[2] - rightRecoilOffset;
  // 左手：非换弹时回托枪位；换弹时由 reloadAnimation 接管位置
  if (!reloading) {
    resetHandPose(hands.leftHand);
  }
}

export function disposeHands(hands) {
  if (!hands) return;
  for (const hand of [hands.leftHand, hands.rightHand]) {
    hand.wrist?.dispose();
    hand.forearm?.dispose();
    hand.palm?.dispose();
    hand.material?.dispose();
    hand.root?.dispose();
  }
}

export function getSteveTexture(scene) {
  return loadSteveTexture(scene);
}

// 测试注入：允许单元测试用预加载的 RawTexture 替换 steve 纹理缓存，
// 避免 Node.js 环境下 DynamicTexture fallback 需要 OffscreenCanvas 的问题。
export function _setSteveTextureForTest(texture) {
  steveTextureCache = texture;
}

export const _TEST_ONLY = { STEVE_ARM_RECT, FOREARM_SIZE, PALM_SIZE, WRIST_SIZE, DEFAULT_HAND_ANCHORS, applyPoseToHand };
