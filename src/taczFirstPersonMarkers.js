import * as BABYLON from "@babylonjs/core";

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

export function readMarkerLocalTransform(boneMap, markerName) {
  const node = boneMap?.get(markerName);
  if (!node) return null;
  const rotationQuaternion = node.rotationQuaternion || BABYLON.Quaternion.FromEulerAngles(
    node.rotation.x,
    node.rotation.y,
    node.rotation.z
  );
  return {
    name: markerName,
    position: vectorToArray3(node.position),
    rotation: quaternionToEulerArray(rotationQuaternion),
  };
}

export function extractFirstPersonMarkers(taczGeoModel) {
  const boneMap = taczGeoModel?.boneMap;
  return {
    idleView: readMarkerLocalTransform(boneMap, FIRST_PERSON_MARKER_NAMES.idleView),
    ironView: readMarkerLocalTransform(boneMap, FIRST_PERSON_MARKER_NAMES.ironView),
    leftHand: readMarkerLocalTransform(boneMap, FIRST_PERSON_MARKER_NAMES.leftHand),
    rightHand: readMarkerLocalTransform(boneMap, FIRST_PERSON_MARKER_NAMES.rightHand),
  };
}

// 对 marker position 先乘 markerScale，再叠加 offset。
// offset 用于把 TaCZ 原生 geo marker 校准到本项目第一人称 rig 期望姿态，
// 不修改 marker rotation（角度加法易破坏 bone 朝向）。
// invertPosePosition 为 true 时，对 idle_view/iron_view 的 position 整体取反后再乘 scale/叠加 offset。
// TaCZ geo 的 idle_view/iron_view 是相机 locator bone，position 表示"相机在模型空间的位置"，
// 而本项目 rig 把它当作"模型在相机空间的位置"，两者方向相反，需要取反才能让武器出现在屏幕右下而非左上。
// lefthand_pos/righthand_pos 是手在模型空间的位置，方向正确，不取反。
function applyMarkerOffset(position, markerScale, offset, invert) {
  let scaled = position.map((v) => v * markerScale);
  if (invert) scaled = scaled.map((v) => -v);
  if (!Array.isArray(offset) || offset.length !== 3) return scaled;
  return [
    scaled[0] + (Number.isFinite(offset[0]) ? offset[0] : 0),
    scaled[1] + (Number.isFinite(offset[1]) ? offset[1] : 0),
    scaled[2] + (Number.isFinite(offset[2]) ? offset[2] : 0),
  ];
}

export function mergeCalibrationWithMarkers(baseCalibration, markers, options = {}) {
  const markerScale = options.markerScale ?? 1;
  const invertPosePosition = options.invertPosePosition ?? false;
  const keepBaseRotation = options.keepBaseRotation ?? false;
  const hipOffset = options.hipOffset;
  const adsOffset = options.adsOffset;
  const leftGripOffset = options.leftGripOffset;
  const rightGripOffset = options.rightGripOffset;
  // rotationOverride：per-weapon rotation 校准，覆盖 marker rotation。
  // 基线发现不同武器 geo 默认朝向不同（glock17/m4/p90/m107 横向，ak47/awp/deagle/rpg7/m95 竖直），
  // marker rotation=(0,0,0) 会导致部分武器投影成竖直窄条。需要 per-weapon rotationOverride 校准朝向。
  // 同时应用到 hipPose 和 adsPose（adsPose.rotation 通常与 hipPose.rotation 一致，见 computeAdsPose）。
  const rotationOverride = Array.isArray(options.rotationOverride) && options.rotationOverride.length === 3
    ? [...options.rotationOverride]
    : null;
  const result = structuredClone(baseCalibration ?? {});

  // marker（idle_view/iron_view）position 表示相机在模型空间的位置，用它覆盖 base position。
  // rotation 优先级：rotationOverride > keepBaseRotation ? base.rotation : marker.rotation。
  // rotationOverride 用于 per-weapon 朝向校准（TaCZ geo 默认朝向差异）；
  // keepBaseRotation=true 保留 base rotation（旧 Blockbench 朝向，含 Math.PI），用于兼容旧模型；
  // 默认用 marker.rotation（TaCZ geo 的 locator 朝向，通常 identity）。
  if (markers?.idleView) {
    let rotation;
    if (rotationOverride) {
      rotation = [...rotationOverride];
    } else if (keepBaseRotation) {
      rotation = [...(result.hipPose?.rotation ?? [0, 0, 0])];
    } else {
      rotation = [...markers.idleView.rotation];
    }
    result.hipPose = {
      position: applyMarkerOffset(markers.idleView.position, markerScale, hipOffset, invertPosePosition),
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
      rotation = [...markers.ironView.rotation];
    }
    result.adsPose = {
      position: applyMarkerOffset(markers.ironView.position, markerScale, adsOffset, invertPosePosition),
      rotation,
    };
  }

  if (markers?.rightHand) {
    result.rightGrip = applyMarkerOffset(markers.rightHand.position, markerScale, rightGripOffset, false);
  }

  if (markers?.leftHand) {
    result.leftGrip = applyMarkerOffset(markers.leftHand.position, markerScale, leftGripOffset, false);
  }

  result.markerSource = {
    idleView: Boolean(markers?.idleView),
    ironView: Boolean(markers?.ironView),
    leftHand: Boolean(markers?.leftHand),
    rightHand: Boolean(markers?.rightHand),
  };

  return result;
}
