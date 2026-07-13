import { getTaczAnimation, getTaczLoadError, sampleAnimation } from "./taczAnimationParser.js";

const FINAL_ACTION = "idle";
const RELOAD_ACTIONS = new Set(["reload_empty", "reload_tactical"]);
const ACTION_PRIORITY = {
  idle: 0,
  draw: 1,
  put_away: 1,
  ads_in: 1,
  ads_out: 1,
  shoot: 2,
  bolt: 3,
  inspect: 4,
  inspect_empty: 4,
  reload_tactical: 5,
  reload_empty: 5,
};

const DEFAULT_BONES = {
  root: "root",
  rightHand: "righthand",
  leftHand: "lefthand",
  constraint: "constraint",
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function vec3(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value)) return [...fallback];
  return [
    Number.isFinite(Number(value[0])) ? Number(value[0]) : fallback[0],
    Number.isFinite(Number(value[1])) ? Number(value[1]) : fallback[1],
    Number.isFinite(Number(value[2])) ? Number(value[2]) : fallback[2],
  ];
}

function addVec3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subVec3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function mulVec3(a, scale) {
  return [a[0] * scale, a[1] * scale, a[2] * scale];
}

function mapAxis(raw, calibration = {}) {
  const source = { x: raw[0] ?? 0, y: raw[1] ?? 0, z: raw[2] ?? 0 };
  const axisMap = calibration.axisMap ?? ["x", "y", "z"];
  const sign = calibration.sign ?? [1, 1, 1];
  return axisMap.map((axis, index) => (source[axis] ?? 0) * (sign[index] ?? 1));
}

function maxTrackDelta(track) {
  if (!track?.frames?.length) return 0;
  const base = track.frames[0].post;
  return Math.max(
    0,
    ...track.frames.flatMap((frame) => {
      const delta = subVec3(frame.post, base);
      return delta.map((value) => Math.abs(value));
    })
  );
}

function getAnimationName(profile, action) {
  if (!profile) return null;
  const key = {
    idle: "idle",
    draw: "draw",
    put_away: "putAway",
    ads_in: "adsIn",
    ads_out: "adsOut",
    shoot: "shoot",
    reload_tactical: "reloadTactical",
    reload_empty: "reloadEmpty",
    inspect: "inspect",
    inspect_empty: "inspectEmpty",
    bolt: "bolt",
  }[action];
  return profile[key] ?? null;
}

function resolveBoneName(bones, candidate) {
  if (Array.isArray(candidate)) return candidate.find((name) => bones?.[name]) ?? candidate[0] ?? null;
  return candidate ?? null;
}

// bone 别名解析：支持 fallback 数组 + boneAliases 映射
// 用于 V2 源 bone 名错误修正（m95_barrel→gun_barrel, Deagle→Deagle_golden）
function resolveBoneWithAlias(bones, candidate, boneAliases = {}) {
  if (!candidate) return null;
  const candidates = Array.isArray(candidate) ? candidate : [candidate];
  for (const name of candidates) {
    if (bones[name]) return name;
    const alias = boneAliases[name];
    if (alias && bones[alias]) return alias;
  }
  return null;
}

// 原生武器动画结束归位：恢复所有 bone 到 geo 原始 pivot/rotation
// 不能归零 [0,0,0]——那会丢失 bone pivot 导致模型塌陷
// v9: originalRotation 现在存储 Quaternion 克隆（与 taczGeoModel.js 一致），
// 恢复时用 copyFrom 而非 Euler set
// metadata 缺失时（非 geo 创建的 bone）归零 rotation，保持 v8 之前的行为
function resetTaczBones(controller) {
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
      } else if (node.rotationQuaternion) {
        // metadata 缺失但 node 用 rotationQuaternion：归零为 identity
        node.rotationQuaternion.set(0, 0, 0, 1);
      } else {
        // metadata 缺失且 node 用 Euler rotation：归零
        node.rotation.set(0, 0, 0);
      }
      node.scaling.set(1, 1, 1);
    }
  }
}

function getIdleSample(animationData, profile) {
  const idleName = getAnimationName(profile, "idle") ?? "static_idle";
  return sampleAnimation(animationData, idleName, 0) ?? { bones: {} };
}

function mapHandPose(rawPose, idlePose, anchor, calibration, handKey) {
  if (!rawPose) return null;
  const handCalibration = calibration?.hands?.[handKey] ?? {};
  const rawPosition = vec3(rawPose.position);
  const idlePosition = vec3(idlePose?.position);
  const delta = mapAxis(subVec3(rawPosition, idlePosition), calibration);
  const positionScale = handCalibration.positionScale ?? calibration?.handScale ?? calibration?.positionScale ?? 0.035;
  const positionOffset = vec3(handCalibration.positionOffset ?? calibration?.positionOffset);
  const rotationOffset = vec3(handCalibration.rotationOffset ?? calibration?.rotationOffset);
  return {
    position: addVec3(addVec3(vec3(anchor), mulVec3(delta, positionScale)), positionOffset),
    rotation: addVec3(mapAxis(vec3(rawPose.rotation), calibration), rotationOffset),
    scale: vec3(rawPose.scale, [1, 1, 1]),
    source: "tacz",
  };
}

function mapRootPose(rawPose, idlePose, calibration) {
  if (!rawPose) return null;
  const delta = mapAxis(subVec3(vec3(rawPose.position), vec3(idlePose?.position)), calibration);
  const positionScale = calibration?.rootScale ?? calibration?.positionScale ?? 0.035;
  const rotationScale = calibration?.rootRotationScale ?? 0.08;
  return {
    position: mulVec3(delta, positionScale),
    rotation: mulVec3(mapAxis(subVec3(vec3(rawPose.rotation), vec3(idlePose?.rotation)), calibration), rotationScale),
    scale: vec3(rawPose.scale, [1, 1, 1]),
    source: "tacz",
  };
}

function mapPartPose(animation, rawPose, boneName, calibration, partCalibration = {}) {
  if (!rawPose || !boneName) return null;
  const track = animation?.bones?.[boneName]?.position;
  const base = track?.frames?.[0]?.post ?? [0, 0, 0];
  const rawDelta = subVec3(vec3(rawPose.position), base);
  const max = maxTrackDelta(track);
  const distance = partCalibration.distance ?? 0.16;
  const positionScale = max > 0 ? distance / max : (calibration?.positionScale ?? 0.035);
  const mapped = mapAxis(rawDelta, {
    axisMap: partCalibration.axisMap ?? calibration?.axisMap,
    sign: partCalibration.sign ?? calibration?.sign,
  });
  return {
    position: mulVec3(mapped, positionScale),
    rotation: mapAxis(vec3(rawPose.rotation), {
      axisMap: partCalibration.axisMap ?? calibration?.axisMap,
      sign: partCalibration.sign ?? calibration?.sign,
    }),
    scale: vec3(rawPose.scale, [1, 1, 1]),
    source: "tacz",
  };
}

function collectDueEvents(controller, animation, previousTime, currentTime) {
  const allEvents = [...(animation?.soundEffects ?? []), ...(animation?.effects ?? [])];
  const due = [];
  for (const event of allEvents) {
    const key = `${animation.name}:${event.time}:${event.effect}`;
    if (controller.playedEventKeys.has(key)) continue;
    if (event.time > previousTime && event.time <= currentTime) {
      controller.playedEventKeys.add(key);
      due.push(event);
    }
  }
  return due;
}

export function createWeaponAnimationController(weaponId, config) {
  return {
    weaponId,
    config,
    profile: config.v2AnimationProfile,
    boneMap: { ...DEFAULT_BONES, ...(config.v2BoneMap ?? {}) },
    calibration: config.v2PoseCalibration ?? {},
    action: "idle",
    animationName: config.v2AnimationProfile?.idle ?? "static_idle",
    time: 0,
    previousTime: 0,
    locked: false,
    status: "pending",
    warning: null,
    playedEventKeys: new Set(),
    queuedAction: null,
    lastPose: null,
  };
}

export function refreshWeaponAnimationController(controller) {
  if (!controller) return null;
  controller.animationData = getTaczAnimation(controller.profile);
  const loadError = getTaczLoadError(controller.weaponId);
  if (loadError) {
    controller.status = "error";
    controller.warning = loadError.message;
  } else if (controller.animationData) {
    controller.status = "ready";
    controller.warning = null;
  } else {
    controller.status = "missing";
    controller.warning = `${controller.weaponId} TaCZ animation not loaded`;
  }
  return controller.animationData;
}

export function canPlayWeaponAction(controller, action) {
  if (!controller) return false;
  if (RELOAD_ACTIONS.has(controller.action) && !RELOAD_ACTIONS.has(action)) return false;
  return (ACTION_PRIORITY[action] ?? 0) >= (ACTION_PRIORITY[controller.action] ?? 0)
    || controller.action === "idle";
}

export function playWeaponAnimationAction(controller, action, options = {}) {
  if (!controller) return false;
  refreshWeaponAnimationController(controller);
  if (!options.force && !canPlayWeaponAction(controller, action)) return false;
  const animationName = getAnimationName(controller.profile, action);
  if (!animationName || !controller.animationData?.animations?.[animationName]) {
    controller.status = "error";
    controller.warning = `${controller.weaponId} missing TaCZ action ${action}:${animationName ?? "unset"}`;
    return false;
  }
  controller.action = action;
  controller.animationName = animationName;
  controller.time = options.startTime ?? 0;
  controller.previousTime = controller.time;
  controller.locked = RELOAD_ACTIONS.has(action);
  controller.queuedAction = options.queueNext ?? null;
  controller.playedEventKeys.clear();
  return true;
}

export function updateWeaponAnimation(controller, delta) {
  if (!controller) return null;
  refreshWeaponAnimationController(controller);
  const animation = controller.animationData?.animations?.[controller.animationName];
  if (!animation) {
    controller.lastPose = sampleWeaponAnimationPose(controller);
    return controller.lastPose;
  }
  controller.previousTime = controller.time;
  controller.time += Math.max(0, delta);
  if (animation.loop !== true && controller.time >= animation.length) {
    const events = collectDueEvents(controller, animation, controller.previousTime, animation.length);
    const queuedAction = controller.queuedAction;
    controller.queuedAction = null;
    if (queuedAction) {
      controller.action = "idle";
      controller.locked = false;
      playWeaponAnimationAction(controller, queuedAction, { force: true });
      controller.lastPose = sampleWeaponAnimationPose(controller);
      controller.lastPose.events = events;
      return controller.lastPose;
    }
    controller.action = FINAL_ACTION;
    // 原生武器动画结束归位所有 bone，避免下一动画从错误位置开始
    resetTaczBones(controller);
    controller.animationName = getAnimationName(controller.profile, FINAL_ACTION) ?? "static_idle";
    controller.time = 0;
    controller.previousTime = 0;
    controller.locked = false;
    controller.playedEventKeys.clear();
    controller.lastPose = sampleWeaponAnimationPose(controller);
    controller.lastPose.events = events;
    return controller.lastPose;
  }
  controller.lastPose = sampleWeaponAnimationPose(controller);
  controller.lastPose.events = collectDueEvents(controller, animation, controller.previousTime, controller.time);
  return controller.lastPose;
}

export function sampleWeaponAnimationPose(controller) {
  refreshWeaponAnimationController(controller);
  if (!controller.animationData) {
    return {
      valid: false,
      status: controller.status,
      warning: controller.warning,
      action: controller.action,
      animationName: controller.animationName,
      root: null,
      lefthand: null,
      righthand: null,
      magazine: null,
      slide: null,
      bolt: null,
      held: null,
      constraint: null,
      events: [],
    };
  }

  const animation = controller.animationData.animations?.[controller.animationName];
  const sample = sampleAnimation(controller.animationData, controller.animationName, controller.time);
  const idleSample = getIdleSample(controller.animationData, controller.profile);
  const map = controller.boneMap;
  const modelConfig = controller.config.modelConfig ?? {};
  const reloadParts = modelConfig.reloadParts ?? {};
  const calibration = controller.calibration;
  const bones = sample?.bones ?? {};
  const idleBones = idleSample?.bones ?? {};

  // 原生路径：返回 bone 原始变换，供 reloadAnimation.applyTaczNativeBonePose 直接驱动 boneMap
  if (controller.taczBoneMap) {
    return {
      valid: true,
      isTaczNative: true,
      status: controller.status,
      warning: controller.warning,
      action: controller.action,
      animationName: controller.animationName,
      progress: animation?.length ? clamp01(controller.time / animation.length) : 0,
      bones,           // 原始 bone 变换（当前帧）
      idleBones,       // idle 基准 bone 变换
      boneAliases: controller.config.v2BoneAliases ?? {},
      events: [],
    };
  }

  const leftHand = mapHandPose(bones[map.leftHand], idleBones[map.leftHand], modelConfig.handAnchors?.leftHand, calibration, "leftHand");
  const rightHand = mapHandPose(bones[map.rightHand], idleBones[map.rightHand], modelConfig.handAnchors?.rightHand, calibration, "rightHand");
  const root = mapRootPose(bones[map.root], idleBones[map.root], calibration);

  const magazineBone = resolveBoneName(bones, map.magazinePart);
  const slideBone = resolveBoneName(bones, map.slidePart);
  const boltBone = resolveBoneName(bones, map.boltPart);
  const heldBone = resolveBoneName(bones, map.heldMagazine ?? map.heldRocket ?? null);

  return {
    valid: true,
    status: controller.status,
    warning: controller.warning,
    action: controller.action,
    animationName: controller.animationName,
    progress: animation?.length ? clamp01(controller.time / animation.length) : 0,
    root,
    lefthand: leftHand,
    righthand: rightHand,
    mag_and_lefthand: bones.mag_and_lefthand ?? null,
    lefthand_and_mag: bones.lefthand_and_mag ?? null,
    mag_hand: bones.mag_hand ?? null,
    gun_and_righthand: bones.gun_and_righthand ?? null,
    magazine: mapPartPose(animation, bones[magazineBone], magazineBone, calibration, reloadParts.magazine?.animation),
    slide: mapPartPose(animation, bones[slideBone], slideBone, calibration, reloadParts.slide?.animation),
    bolt: mapPartPose(animation, bones[boltBone], boltBone, calibration, reloadParts.bolt?.animation ?? reloadParts.slide?.animation),
    held: heldBone ? mapPartPose(animation, bones[heldBone], heldBone, calibration, { distance: calibration.heldDistance ?? 0.34 }) : null,
    constraint: bones[map.constraint] ?? null,
    events: [],
  };
}

export function isReloadAction(action) {
  return RELOAD_ACTIONS.has(action);
}

export const _TEST_ONLY = {
  mapAxis,
  mapHandPose,
  mapPartPose,
  maxTrackDelta,
  getAnimationName,
  resolveBoneWithAlias,
  resetTaczBones,
};
