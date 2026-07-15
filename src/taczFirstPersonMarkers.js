import * as BABYLON from "@babylonjs/core";
import {
  buildBonePath,
  getTaczPositioningNodeInverse,
  computeTaczFirstPersonRenderMatrix,
  extractPositionFromMatrix,
  extractRotationFromMatrix,
} from "./taczBedrockCoordinate.js";

export const FIRST_PERSON_MARKER_NAMES = {
  idleView: "idle_view",
  ironView: "iron_view",
  leftHand: "lefthand_pos",
  rightHand: "righthand_pos",
};

export function vectorToArray3(vector) {
  return [vector.x, vector.y, vector.z];
}

export function quaternionToEulerArray(quaternion) {
  const euler = quaternion.toEulerAngles();
  return [euler.x, euler.y, euler.z];
}

// path inverse: 从 root→marker 反向遍历，计算 marker 在 root 空间的逆变换。
// 对照 TaCZ FirstPersonRenderGunEvent.getPositioningNodeInverse (L217-236)。
// 返回的 position/rotation 直接为 Babylon 相机空间可用值
//（Bedrock 与 Babylon 相机坐标系一致：Y up, forward=-Z），
// 经 mergeCalibrationWithMarkers 中乘以 markerScale + 叠加 offset 后，
// 作为 Babylon rig 的 local transform 使用。
// boneDataMap 缺失时 fallback 到 local transform（兼容旧调用方）。
function readMarkerPathInverseTransform(boneMap, boneDataMap, markerName) {
  const node = boneMap?.get(markerName);
  if (!node) return null;
  const path = buildBonePath(boneMap, boneDataMap, markerName);
  if (path.length === 0) {
    // fallback: 无 path 信息时退回 local transform（path 为空说明 boneDataMap 缺失或 marker 是 root）
    const rotationQuaternion = node.rotationQuaternion
      || BABYLON.Quaternion.FromEulerAngles(node.rotation.x, node.rotation.y, node.rotation.z);
    return {
      name: markerName,
      position: vectorToArray3(node.position),
      rotation: quaternionToEulerArray(rotationQuaternion),
    };
  }
  // TaCZ 原生 path inverse（已统一 root ty=-py，无 Minecraft 眼睛高度 T 共轭）
  const inverseMatrix = getTaczPositioningNodeInverse(path);
  // computeTaczFirstPersonRenderMatrix 直接返回 inverseMatrix，
  // 因为 Babylon camera 空间 Y=0 即眼睛高度，不需要 Minecraft PoseStack 的眼睛补偿。
  // Bedrock/Minecraft 与 Babylon 相机坐标系一致（Y up, forward=-Z），
  // 返回的 position/rotation 直接可作为 Babylon 相机空间中的 local transform。
  const renderMatrix = computeTaczFirstPersonRenderMatrix(inverseMatrix);
  return {
    name: markerName,
    position: extractPositionFromMatrix(renderMatrix),
    rotation: extractRotationFromMatrix(renderMatrix),
  };
}

export function extractFirstPersonMarkers(taczGeoModel) {
  const boneMap = taczGeoModel?.boneMap;
  const boneDataMap = taczGeoModel?.boneDataMap;
  return {
    idleView: readMarkerPathInverseTransform(boneMap, boneDataMap, FIRST_PERSON_MARKER_NAMES.idleView),
    ironView: readMarkerPathInverseTransform(boneMap, boneDataMap, FIRST_PERSON_MARKER_NAMES.ironView),
    leftHand: readMarkerPathInverseTransform(boneMap, boneDataMap, FIRST_PERSON_MARKER_NAMES.leftHand),
    rightHand: readMarkerPathInverseTransform(boneMap, boneDataMap, FIRST_PERSON_MARKER_NAMES.rightHand),
  };
}

// Bedrock/Minecraft 与 Babylon 相机坐标系对齐说明：
// Minecraft/Bedrock 第一人称相机：Y up，forward=-Z（north），X right
// Babylon.js UniversalCamera/FreeCamera：默认也是 Y up，forward=-Z，X right
// 两者局部坐标系完全一致！inverseMatrix 返回的 position/rotation 可直接作为
// Babylon 相机空间中 weaponRoot 的 local transform，不需要 X/Z 翻转或 Y=π 旋转。
//
// 之前误以为 Babylon 相机看向 +Z 是错误的——UniversalCamera 默认沿 -Z 观察，
// 与 Minecraft 第一人称约定相同。此处保留恒等转换，便于未来如需调整坐标系时有明确位置。

function convertBedrockPosToBabylon(pos) {
  return [pos[0], pos[1], pos[2]];
}

function convertBedrockRotToBabylon(rotEuler) {
  return [rotEuler[0], rotEuler[1], rotEuler[2]];
}

// 对 marker position 直接使用（Bedrock 与 Babylon 相机空间一致），
// 再乘 markerScale，再叠加 offset（offset 是 Babylon 坐标系中的微调）。
function applyMarkerOffset(position, markerScale, offset) {
  const flipped = convertBedrockPosToBabylon(position);
  const scaled = flipped.map((v) => v * markerScale);
  if (!Array.isArray(offset) || offset.length !== 3) return scaled;
  return [
    scaled[0] + (Number.isFinite(offset[0]) ? offset[0] : 0),
    scaled[1] + (Number.isFinite(offset[1]) ? offset[1] : 0),
    scaled[2] + (Number.isFinite(offset[2]) ? offset[2] : 0),
  ];
}

export function mergeCalibrationWithMarkers(baseCalibration, markers, options = {}) {
  const markerScale = options.markerScale ?? 1;
  const keepBaseRotation = options.keepBaseRotation ?? false;
  const hipOffset = options.hipOffset;
  const adsOffset = options.adsOffset;
  const leftGripOffset = options.leftGripOffset;
  const rightGripOffset = options.rightGripOffset;
  // rotationOverride：per-weapon rotation 校准，覆盖 marker rotation。
  // 基线发现不同武器 geo 默认朝向不同（m4 横向，ak47/awp/deagle/m95 竖直），
  // marker rotation=(0,0,0) 会导致部分武器投影成竖直窄条。需要 per-weapon rotationOverride 校准朝向。
  // 同时应用到 hipPose 和 adsPose（adsPose.rotation 通常与 hipPose.rotation 一致，见 computeAdsPose）。
  const rotationOverride = Array.isArray(options.rotationOverride) && options.rotationOverride.length === 3
    ? [...options.rotationOverride]
    : null;
  const result = structuredClone(baseCalibration ?? {});

  // marker（idle_view/iron_view）的 inverse matrix 返回 root→camera 变换：
  // position = root 在相机局部空间的位置，rotation = root 在相机局部空间的旋转。
  // Bedrock 与 Babylon 相机坐标系一致（均为 Y up, forward=-Z），直接使用。
  // rotation 优先级：rotationOverride > keepBaseRotation ? base.rotation : marker.rotation。
  // rotationOverride 用于 per-weapon 朝向校准（如模型默认朝向与 forward 不一致时）；
  // keepBaseRotation=true 保留 base rotation（兼容旧校准值）。
  if (markers?.idleView) {
    let rotation;
    if (rotationOverride) {
      rotation = [...rotationOverride];
    } else if (keepBaseRotation) {
      rotation = [...(result.hipPose?.rotation ?? [0, 0, 0])];
    } else {
      rotation = convertBedrockRotToBabylon(markers.idleView.rotation);
    }
    result.hipPose = {
      position: applyMarkerOffset(markers.idleView.position, markerScale, hipOffset),
      rotation,
    };
  }

  if (markers?.ironView) {
    let rotation;
    if (rotationOverride) {
      rotation = [...rotationOverride];
    } else if (keepBaseRotation) {
      rotation = [...(result.adsPose?.rotation ?? [0, 0, 0])];
    } else {
      rotation = convertBedrockRotToBabylon(markers.ironView.rotation);
    }
    result.adsPose = {
      position: applyMarkerOffset(markers.ironView.position, markerScale, adsOffset),
      rotation,
    };
  }

  // rightGrip/leftGrip 保留 baseCalibration 中的手调值，不被 markers 覆盖。
  // 原因：markers.rightHand/leftHand 的 position 是 righthand_pos/lefthand_pos bone
  // 在 geo 原始朝向（marker rotation 空间）中的坐标。当 rotationOverride 替换 marker rotation
  // 后，这些坐标不会自动跟随旋转，导致手被放到错误位置（如 [0,-1,0] 经 Z=π/2 旋转后
  // 映射到相机后方，Steve 手漂在屏幕左下角）。
  // 手的动态位置由 applyHandBonePose 通过 righthand/lefthand bone 动画 delta 驱动，
  // 静态基准位置使用 WEAPON_CALIBRATION 中手调值即可，这些值是 weaponRoot 空间下的偏移，
  // 会自然跟随 weaponRoot 的 rotationOverride 旋转。
  // 如需未来从 markers 自动计算 grip 位置，必须对 position 做 R_override × R_marker⁻¹ 旋转变换。
  //
  // gripOffset 仍然叠加在 base grip 值上，允许 per-weapon 微调
  if (result.rightGrip) {
    result.rightGrip = applyMarkerOffset(result.rightGrip, 1, rightGripOffset);
  }
  if (result.leftGrip) {
    result.leftGrip = applyMarkerOffset(result.leftGrip, 1, leftGripOffset);
  }

  result.markerSource = {
    idleView: Boolean(markers?.idleView),
    ironView: Boolean(markers?.ironView),
    leftHand: Boolean(markers?.leftHand),
    rightHand: Boolean(markers?.rightHand),
  };

  return result;
}
