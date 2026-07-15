// 换弹视觉动画系统：驱动左手 + 弹匣/套筒部件在换弹时的动画。
//
// 左手动画：4 段关键动作（reach/pull/insert/return），由 V2 feedTime 和 duration 推导。
//   段1 reach  (0 → magoutTime):      左手从托枪位伸向弹匣位
//   段2 pull   (magoutTime → +pull):  左手跟随弹匣拔出方向移动
//   段3 insert (pull 结束 → feedTime): 左手带着新弹匣回到弹匣口
//   段4 return (feedTime → duration):  左手从弹匣位回到托枪位
//
// 部件级动画：从 V2 glTF 提取弹匣/套筒的 translation/rotation 通道，
// 再按每把枪 reloadParts.*.animation 的 distance/axisMap/sign 校准后驱动 pivot。
//
// 弹匣位向下偏移（y 负向）。
// AWP 拉栓：V2 cooldown 已含拉栓时间，在 progress > 0.85 时左手移到枪栓位做后拉动作。

import * as BABYLON from "@babylonjs/core";
import { applyHandAnimationPose, applyHandBonePose } from "./handModel.js";
import { setHeldPartVisible, setReloadPartVisible } from "./weaponModel.js";
import { getV2Animation, samplePartTransform } from "./v2AnimationParser.js";

const DEG_TO_RAD = Math.PI / 180;

// Bedrock 旋转顺序：TaCZ mod 实测为 ZXY（先 Z 后 X 再 Y）
// 用 Quaternion 显式构造 ZXY 顺序，与 taczGeoModel.js / handModel.js 保持一致
// 内联实现避免循环依赖
function bedrockRotationQuaternion(rotationDeg) {
  const x = (rotationDeg[0] ?? 0) * DEG_TO_RAD;
  const y = (rotationDeg[1] ?? 0) * DEG_TO_RAD;
  const z = (rotationDeg[2] ?? 0) * DEG_TO_RAD;
  const qZ = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, z);
  const qX = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, x);
  const qY = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, y);
  return qY.multiply(qX).multiply(qZ);
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

// 原生武器 bone 归位（内联实现，避免与 weaponAnimationController 循环依赖）
// 恢复到 geo 原始 pivot/rotation，不能归零 [0,0,0]
// v9: originalRotation 现在存储 Quaternion 克隆，恢复时用 copyFrom 而非 Euler set
function resetTaczBonesInline(controller) {
  if (!controller?.taczBoneMap) return;
  for (const node of controller.taczBoneMap.values()) {
    if (node && node.position) {
      const origPos = node.metadata?.originalPosition ?? [0, 0, 0];
      const origRot = node.metadata?.originalRotation;
      node.position.set(origPos[0], origPos[1], origPos[2]);
      if (origRot) {
        if (node.rotationQuaternion) {
          node.rotationQuaternion.copyFrom(origRot);
        } else {
          node.rotationQuaternion = origRot.clone();
        }
      }
      node.scaling.set(1, 1, 1);
    }
  }
}

const PULL_DURATION = 0.3; // 段2 拔出动作耗时（秒）
const MAG_OFFSET = 0.25;   // 弹匣位相对托枪位的偏移量
const MAG_Z_OFFSET = 0.15; // 弹匣位 z 方向偏移（向枪口方向）
const PULL_EXTRA = 0.12;   // 段2 拔出时额外延伸距离
const AWP_BOLT_THRESHOLD = 0.85; // AWP 拉栓动画触发进度阈值
const AWP_BOLT_OFFSET = [0.1, 0.05, -0.2]; // AWP 枪栓位相对托枪位的偏移

// 构建换弹时间线（4 段关键时间点），所有时间归一化到 0-1（与 reloadProgress 对应）
function buildReloadTimeline(reloadConfig) {
  const duration = reloadConfig.duration;
  const feedTime = reloadConfig.feedTime;
  const magoutTime = (feedTime * 0.5) / duration; // magout 发生在 feedTime 的一半处
  const pullDuration = PULL_DURATION / duration;
  const feedNorm = feedTime / duration;
  const pullEnd = Math.min(magoutTime + pullDuration, feedNorm);
  return {
    reach: { start: 0, end: magoutTime },
    pull: { start: magoutTime, end: pullEnd },
    insert: { start: pullEnd, end: feedNorm },
    return: { start: feedNorm, end: 1 },
  };
}

// lerp 辅助
function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function lerpVec3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function addVec3(a, b, scale = 1) {
  return [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
}

// 计算弹匣位（向下偏移，z 略向枪口）
function getMagPos(defaultPos) {
  return [defaultPos[0], defaultPos[1] - MAG_OFFSET, defaultPos[2] + MAG_Z_OFFSET];
}

// 计算拔出终点（弹匣向下脱离枪身的极限位置）
function getPullPos(magPos) {
  return [magPos[0], magPos[1] - PULL_EXTRA, magPos[2]];
}

// 采样左手姿态（位置+旋转）
function sampleLeftHandPose(progress, timeline, weaponId, modelConfig, magazineTransform = null) {
  const defaultPos = modelConfig.handAnchors.leftHand;
  const magPos = getMagPos(defaultPos);
  const pullPos = getPullPos(magPos);
  const isAwp = weaponId === "awp";

  // AWP 拉栓：progress > 0.85 时左手移到枪栓位做后拉动作
  if (isAwp && progress > AWP_BOLT_THRESHOLD) {
    const boltPos = [
      defaultPos[0] + AWP_BOLT_OFFSET[0],
      defaultPos[1] + AWP_BOLT_OFFSET[1],
      defaultPos[2] + AWP_BOLT_OFFSET[2],
    ];
    // 0.85 → 0.925: 移到枪栓位；0.925 → 1.0: 后拉再前推（用正弦模拟）
    const boltProgress = (progress - AWP_BOLT_THRESHOLD) / (1 - AWP_BOLT_THRESHOLD);
    const pullAmount = Math.sin(Math.PI * boltProgress) * 0.08;
    return {
      position: [boltPos[0] - pullAmount, boltPos[1], boltPos[2]],
      rotation: [0, 0, 0],
    };
  }

  // 按 progress 落在哪段，lerp 对应起止位置
  if (progress <= timeline.reach.end) {
    // 段1 reach: defaultPos → magPos
    const t = timeline.reach.start < timeline.reach.end
      ? (progress - timeline.reach.start) / (timeline.reach.end - timeline.reach.start)
      : 1;
    return { position: lerpVec3(defaultPos, magPos, t), rotation: [0, 0, 0] };
  }
  if (progress <= timeline.pull.end) {
    // 段2 pull: magPos → pullPos
    const t = timeline.pull.start < timeline.pull.end
      ? (progress - timeline.pull.start) / (timeline.pull.end - timeline.pull.start)
      : 1;
    const position = lerpVec3(magPos, pullPos, t);
    return {
      position: magazineTransform?.position ? addVec3(position, magazineTransform.position, 0.45) : position,
      rotation: [0, 0, 0],
    };
  }
  if (progress <= timeline.insert.end) {
    // 段3 insert: pullPos → magPos
    const t = timeline.insert.start < timeline.insert.end
      ? (progress - timeline.insert.start) / (timeline.insert.end - timeline.insert.start)
      : 1;
    const position = lerpVec3(pullPos, magPos, t);
    return {
      position: magazineTransform?.position ? addVec3(position, magazineTransform.position, 0.45) : position,
      rotation: [0, 0, 0],
    };
  }
  // 段4 return: magPos → defaultPos
  const t = timeline.return.start < timeline.return.end
    ? (progress - timeline.return.start) / (timeline.return.end - timeline.return.start)
    : 1;
  return { position: lerpVec3(magPos, defaultPos, t), rotation: [0, 0, 0] };
}

// 驱动单个部件 pivot 的位移：换弹中按 V2 动画采样，非换弹时归零
function updatePartPivot(pivot, partAnim, reloading, reloadConfig, reloadProgress, partConfig) {
  if (!pivot) return null;
  if (!reloading || !reloadConfig || !partAnim) {
    pivot.position.set(0, 0, 0);
    pivot.rotation.set(0, 0, 0);
    return null;
  }
  const transform = samplePartTransform(
    partAnim,
    reloadProgress ?? 0,
    reloadConfig.duration,
    partConfig?.animation ?? {}
  );
  pivot.position.set(transform.position[0], transform.position[1], transform.position[2]);
  pivot.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
  return transform;
}

function applyPoseToTransform(transform, pose) {
  if (!transform) return;
  if (!pose) {
    transform.position.set(0, 0, 0);
    transform.rotation.set(0, 0, 0);
    return;
  }
  const position = pose.position ?? [0, 0, 0];
  const rotation = pose.rotation ?? [0, 0, 0];
  transform.position.set(position[0], position[1], position[2]);
  transform.rotation.set(rotation[0], rotation[1], rotation[2]);
}

function addPoseToTransform(transform, pose) {
  if (!transform || !pose) return;
  const position = pose.position ?? [0, 0, 0];
  const rotation = pose.rotation ?? [0, 0, 0];
  transform.position.x += position[0];
  transform.position.y += position[1];
  transform.position.z += position[2];
  transform.rotation.x += rotation[0];
  transform.rotation.y += rotation[1];
  transform.rotation.z += rotation[2];
}

function poseHasMotion(pose) {
  if (!pose) return false;
  const position = pose.position ?? [0, 0, 0];
  const rotation = pose.rotation ?? [0, 0, 0];
  return [...position, ...rotation].some((value) => Math.abs(value) > 0.0001);
}

function updateHeldPart(controller, taczPose) {
  const pivot = controller?.heldMagazinePivot;
  if (!pivot) return;
  const heldVisible = taczPose?.held && (taczPose.action?.startsWith("reload") || taczPose.action === "inspect" || taczPose.action === "inspect_empty");
  if (heldVisible) {
    applyPoseToTransform(pivot, taczPose.held);
    setHeldPartVisible(controller, true);
    setReloadPartVisible(controller, "magazine", false);
  } else {
    applyPoseToTransform(pivot, { position: [0, 0, 0], rotation: [0, 0, 0] });
    setHeldPartVisible(controller, false);
    setReloadPartVisible(controller, "magazine", true);
  }
}

function updateTaczPartPivots(controller, taczPose) {
  if (!controller) return;
  applyPoseToTransform(controller.magazinePivot, taczPose?.magazine && poseHasMotion(taczPose.magazine) ? taczPose.magazine : null);
  applyPoseToTransform(controller.slidePivot, taczPose?.slide && poseHasMotion(taczPose.slide) ? taczPose.slide : null);
  applyPoseToTransform(controller.boltPivot ?? controller.slidePivot, taczPose?.bolt && poseHasMotion(taczPose.bolt) ? taczPose.bolt : null);
}

function applyTaczWeaponPose(hands, { taczPose, controller, weaponId }) {
  if (!taczPose?.valid) {
    if (controller?.isTaczNative) {
      // 原生武器无效 pose：归位所有 bone
      resetTaczBonesInline(controller);
    } else {
      updateTaczPartPivots(controller, null);
      updateHeldPart(controller, null);
    }
    return false;
  }

  // 原生路径：动画 bone 直接驱动 boneMap TransformNode
  if (taczPose.isTaczNative) {
    return applyTaczNativeBonePose(hands, controller, taczPose, weaponId);
  }

  // 旧路径：pose → pivot 间接映射
  addPoseToTransform(controller?.root, taczPose.root);
  applyHandAnimationPose(hands, taczPose, 1);
  updateTaczPartPivots(controller, taczPose);
  updateHeldPart(controller, taczPose);
  return true;
}

// 原生路径：动画 bone 直接驱动 boneMap TransformNode
// 不经过 pose → pivot 间接映射，不 clone mesh，不用 cylinder fallback
function applyTaczNativeBonePose(hands, controller, taczPose, weaponId) {
  const boneMap = controller.taczBoneMap;
  const bones = taczPose.bones;
  const idleBones = taczPose.idleBones;
  const boneAliases = taczPose.boneAliases ?? {};
  const animCtrl = controller.animationController;
  const configBoneMap = animCtrl?.boneMap;
  const rootName = configBoneMap?.root ?? "root";

  // 1. 遍历动画 bone，计算 delta = current - idle，应用到 boneMap
  //    bone 层级会自动传递（parent 变换带动 child）
  for (const [name, transform] of Object.entries(bones)) {
    const resolvedName = resolveBoneInMap(name, boneMap, boneAliases);
    if (!resolvedName) continue;
    // root motion 由 controller.root 承担。若这里同时移动 geo root bone，
    // 再在下面移动 controller.root，会出现整枪位移双重叠加。
    if (resolvedName === rootName || name === rootName) continue;
    const node = boneMap.get(resolvedName);
    if (!node) continue;

    const idle = idleBones[name] ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    // Bedrock 像素坐标 → Babylon 单位（1/16）
    const dx = (transform.position?.[0] ?? 0) - (idle.position?.[0] ?? 0);
    const dy = (transform.position?.[1] ?? 0) - (idle.position?.[1] ?? 0);
    const dz = (transform.position?.[2] ?? 0) - (idle.position?.[2] ?? 0);
    // 保留 geo pivot：position = originalPosition + delta（而非 delta 覆盖 pivot）
    const origPos = node.metadata?.originalPosition ?? [0, 0, 0];
    node.position.set(
      origPos[0] + dx / 16,
      origPos[1] + dy / 16,
      origPos[2] + dz / 16
    );
    // Bedrock 旋转是角度，delta = current - idle，用 ZXY 顺序四元数构造后叠加到 geo 原始旋转
    // v9: 从 Euler set 改为 Quaternion 组合，与 taczGeoModel.js 的 applyBedrockRotation 一致
    const deltaRot = [
      (transform.rotation?.[0] ?? 0) - (idle.rotation?.[0] ?? 0),
      (transform.rotation?.[1] ?? 0) - (idle.rotation?.[1] ?? 0),
      (transform.rotation?.[2] ?? 0) - (idle.rotation?.[2] ?? 0),
    ];
    const deltaQ = bedrockRotationQuaternion(deltaRot);
    const origRot = node.metadata?.originalRotation;
    if (origRot) {
      // 原始旋转（Quaternion）× delta 四元数 = 叠加后的旋转
      node.rotationQuaternion = origRot.multiply(deltaQ);
    } else {
      node.rotationQuaternion = deltaQ;
    }
    // scale 直接应用
    if (transform.scale) {
      node.scaling.set(transform.scale[0] ?? 1, transform.scale[1] ?? 1, transform.scale[2] ?? 1);
    }
  }

  // 2. 手部：TaCZ functional hand 路径由 adapter 在动画 bone 更新后读取
  // righthand_pos/lefthand_pos 完整矩阵。这里不再用 righthand/lefthand 的动画 delta
  // 直接驱动 Steve 手，避免手根和功能节点处在两个不同空间导致漂移。
  if (!controller?.useFunctionalHandAnchors) {
    const config = animCtrl?.config;
    applyHandBonePose(hands, boneMap, taczPose, configBoneMap, config);
  }

  // 3. root bone 变换应用到 controller.root（weapon root TransformNode）
  //    root bone 的变换是相对动画空间的，需要额外缩放
  const rootTransform = bones[rootName];
  const rootIdle = idleBones[rootName];
  if (rootTransform && rootIdle) {
    const calibration = animCtrl?.calibration ?? {};
    const rootScale = calibration.rootScale ?? 0.02;
    const dx = (rootTransform.position?.[0] ?? 0) - (rootIdle.position?.[0] ?? 0);
    const dy = (rootTransform.position?.[1] ?? 0) - (rootIdle.position?.[1] ?? 0);
    const dz = (rootTransform.position?.[2] ?? 0) - (rootIdle.position?.[2] ?? 0);
    controller.root.position.set(
      dx * rootScale,
      dy * rootScale,
      dz * rootScale
    );
  }

  // 4. 手持物：原生 geo 中 mag_and_lefthand/rocket bone 已有 mesh，
  //    动画直接驱动 bone 即可同时移动弹匣和左手，无需 clone/heldMagazinePivot
  return true;
}

// 每帧调用，根据 reloadProgress 更新左手位置 + 部件 pivot 位移
export function updateReloadAnimation(hands, {
  reloading, reloadProgress, reloadIsEmpty, weaponId, reloadConfig, modelConfig,
  controller, taczPose = null, allowLegacy = true,
}) {
  const appliedTacz = applyTaczWeaponPose(hands, { taczPose, controller, weaponId });
  if (appliedTacz || allowLegacy === false) return;

  let magazineTransform = null;
  if (controller?.magazinePivot || controller?.slidePivot) {
    const partAnim = (reloading && reloadConfig)
      ? getV2Animation(weaponId, reloadIsEmpty) : null;
    magazineTransform = updatePartPivot(
      controller.magazinePivot,
      partAnim?.magazine,
      reloading,
      reloadConfig,
      reloadProgress,
      modelConfig?.reloadParts?.magazine
    );
    updatePartPivot(
      controller.slidePivot,
      partAnim?.slide,
      reloading,
      reloadConfig,
      reloadProgress,
      modelConfig?.reloadParts?.slide
    );
  }

  // 左手动画（hands 可能为 null，部件动画仍需独立执行）
  if (hands?.leftHand) {
    if (!reloading || !reloadConfig) {
      hands.leftHand.root.position.set(...hands.leftHand.defaultPos);
      hands.leftHand.root.rotation.set(0, 0, 0);
    } else {
      const timeline = buildReloadTimeline(reloadConfig);
      const pose = sampleLeftHandPose(reloadProgress ?? 0, timeline, weaponId, modelConfig, magazineTransform);
      hands.leftHand.root.position.set(pose.position[0], pose.position[1], pose.position[2]);
      hands.leftHand.root.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
    }
  }
}

export const _TEST_ONLY = {
  buildReloadTimeline, sampleLeftHandPose, getMagPos, getPullPos,
  PULL_DURATION, MAG_OFFSET, AWP_BOLT_THRESHOLD,
  updatePartPivot,
};
