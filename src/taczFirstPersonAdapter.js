// TaCZ 第一人称武器适配器
// 以 display.json 为权威入口消费 TaCZ 资源链，编排 FirstPersonRig + taczGeoModel + handModel + weaponAnimationController。
// adapter 不替代这些模块的内部逻辑，只负责按 TaCZ 标准组装。
//
// 资源链：
//   display.json (入口)
//     ├── model → tacz:gun/{weapon}_geo → geo_models/gun/*_geo.json
//     ├── texture → tacz:gun/uv/{weapon} → textures/{weapon}/{weapon}.png
//     ├── animation → V2_WEAPON_ANIMATION_BINDINGS[weaponId].profile.animationPath
//     ├── use_default_animation → player_animator/{type}_default.player_animation.json
//     ├── sounds → animation event sound binding
//     ├── transform → display transform (scale/rotation/position)
//     ├── muzzle_flash → 枪口火焰配置
//     └── shell → 抛壳配置

import * as BABYLON from "@babylonjs/core";

import {
  ASSET_PATHS,
  V2_WEAPON_ANIMATION_BINDINGS,
  WEAPON_CONFIG,
  WEAPON_CALIBRATION,
  WEAPON_MARKER_CALIBRATION,
  PHASE2_STATIC_POSE_CALIBRATION,
} from "./config.js";
import { resolveTaczNamespace, createTaczWeaponFromData } from "./taczWeaponLoader.js";
import { createFirstPersonRig } from "./firstPersonRig.js";
import { createHands } from "./handModel.js";
import { createWeaponAnimationController } from "./weaponAnimationController.js";
import { getVisibilityProfile } from "./visibilityProfile.js";
import { extractFirstPersonMarkers, mergeCalibrationWithMarkers } from "./taczFirstPersonMarkers.js";

// 默认校准值（与 firstPersonRig 的 DEFAULT_CALIBRATION 一致，weaponId 未在 WEAPON_CALIBRATION 中时使用）
const DEFAULT_CALIBRATION = null; // null 表示用 firstPersonRig 内置默认值

// TaCZ 原生武器枪口 bone 查找优先级（与 src/weaponModel.js 的 TACZ_MUZZLE_BONE_NAMES 保持一致）。
// muzzle_pos 是 TaCZ geo 中标准枪口位置 bone；muzzle_flash 是枪口火焰 bone，略前于 muzzle_pos；
// muzzle_default 是默认枪口 bone。
const TACZ_MUZZLE_BONE_NAMES = ["muzzle_pos", "muzzle_flash", "muzzle_default"];
const HAND_POSITION_BONES = {
  rightHand: "righthand_pos",
  leftHand: "lefthand_pos",
};
const HAND_Z180_MATRIX = BABYLON.Matrix.RotationZ(Math.PI);
const PIXEL_TO_UNIT = 1 / 16;
const STEVE_FOREARM_SIZE = { w: 4 / 16, h: 12 / 16, d: 4 / 16 };
const DEFAULT_FUNCTIONAL_HAND_SCALE = 0.72;

function clonePose(pose) {
  if (!pose) return null;
  return {
    position: Array.isArray(pose.position) ? [...pose.position] : null,
    rotation: Array.isArray(pose.rotation) ? [...pose.rotation] : null,
  };
}

function applyWeaponRootPose(weaponRoot, pose) {
  if (!weaponRoot || !pose) return false;
  if (Array.isArray(pose.position) && pose.position.length === 3) {
    weaponRoot.position.set(...pose.position);
  }
  if (Array.isArray(pose.rotation) && pose.rotation.length === 3) {
    weaponRoot.rotationQuaternion = null;
    weaponRoot.rotation.set(...pose.rotation);
  }
  weaponRoot.computeWorldMatrix(true);
  return true;
}

function computeNodeWorldMatrix(node) {
  if (!node) return null;
  const ancestors = [];
  let current = node;
  while (current) {
    ancestors.push(current);
    current = current.parent;
  }
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    ancestors[i].computeWorldMatrix(true);
  }
  return node.getWorldMatrix().clone();
}

function decomposeMatrixToNode(matrix, node) {
  if (!matrix || !node) return false;
  const scaling = new BABYLON.Vector3(1, 1, 1);
  const rotation = new BABYLON.Quaternion();
  const position = new BABYLON.Vector3();
  if (!matrix.decompose(scaling, rotation, position)) return false;
  node.position.copyFrom(position);
  node.rotationQuaternion = rotation;
  node.rotation.set(0, 0, 0);
  node.scaling.copyFrom(scaling);
  return true;
}

function getGeoBones(geoJson) {
  return geoJson?.["minecraft:geometry"]?.[0]?.bones ?? [];
}

function getFunctionalHandScale(modelConfig) {
  const value = modelConfig?.viewTransform?.handScale ?? modelConfig?.handScale ?? DEFAULT_FUNCTIONAL_HAND_SCALE;
  const scale = Number(value);
  return Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_FUNCTIONAL_HAND_SCALE;
}

function computeMarkerCubeVisual(cube, bonePivot, visualScale = DEFAULT_FUNCTIONAL_HAND_SCALE) {
  if (!cube?.origin || !cube?.size || !bonePivot) {
    return {
      rootOffset: [0, 0, 0],
      scale: [visualScale, visualScale, visualScale],
    };
  }
  const cubeCenter = [
    cube.origin[0] + cube.size[0] / 2,
    cube.origin[1] + cube.size[1] / 2,
    cube.origin[2] + cube.size[2] / 2,
  ];
  const cubeCenterLocal = [
    (cubeCenter[0] - bonePivot[0]) * PIXEL_TO_UNIT,
    (bonePivot[1] - cubeCenter[1]) * PIXEL_TO_UNIT,
    (cubeCenter[2] - bonePivot[2]) * PIXEL_TO_UNIT,
  ];
  const markerScale = [
    (cube.size[0] || 4) / 4,
    (cube.size[1] || 12) / 12,
    (cube.size[2] || 4) / 4,
  ];
  const scale = markerScale.map((value) => value * visualScale);
  return {
    // Steve forearm mesh 的中心默认在 root 下方 6px；rootOffset 要抵消这段局部位移，
    // 才能让前臂盒中心对齐 TaCZ marker cube 的真实中心，而不是只贴到 marker pivot。
    rootOffset: [
      cubeCenterLocal[0],
      cubeCenterLocal[1] + (STEVE_FOREARM_SIZE.h / 2) * markerScale[1],
      cubeCenterLocal[2],
    ],
    scale,
  };
}

function extractFunctionalHandVisuals(geoJson, modelConfig) {
  const bones = getGeoBones(geoJson);
  const byName = new Map(bones.map((bone) => [bone.name, bone]));
  const visuals = {};
  const visualScale = getFunctionalHandScale(modelConfig);
  for (const [handKey, boneName] of Object.entries(HAND_POSITION_BONES)) {
    const bone = byName.get(boneName);
    const cube = bone?.cubes?.[0] ?? null;
    visuals[handKey] = computeMarkerCubeVisual(cube, bone?.pivot, visualScale);
  }
  return visuals;
}

function applyFunctionalHandVisual(hand, visual, adsProgress = 0) {
  if (!hand?.root) return;
  const adsWeight = Math.max(0, Math.min(1, Number(adsProgress) || 0));
  const adsScale = BABYLON.Scalar.Lerp(1, 0.35, adsWeight);
  const offset = visual?.rootOffset ?? [0, 0, 0];
  const scale = visual?.scale ?? [1, 1, 1];
  hand.root.position.set(offset[0], offset[1], offset[2]);
  hand.root.rotationQuaternion = null;
  hand.root.rotation.set(0, 0, 0);
  hand.root.scaling.set(scale[0] * adsScale, scale[1] * adsScale, scale[2] * adsScale);
  hand.defaultPos = [...offset];
  hand.defaultRot = [0, 0, 0];
  hand.defaultScale = [...scale];
  // TaCZ 的 righthand_pos/lefthand_pos cube 是 12px 手臂功能节点。
  // 旧 Steve 模型额外 palm/wrist 会把手臂拉到 HUD 区域，功能节点模式下只保留前臂盒。
  hand.palm?.setEnabled(false);
  hand.wrist?.setEnabled(false);
}

// TaCZ 原版把 righthand_pos/lefthand_pos 当作功能渲染节点，并在该节点处额外 Rz(180) 后渲染玩家手臂。
// 本项目用 Steve 方块手近似这个 functional renderer：每帧读取 _pos 节点完整 world matrix，
// 变换到 weaponRoot 本地空间后驱动 handRoot；marker cube 的局部 origin/size 另用于手臂盒偏移和缩放，
// 避免左右手只跟随相同 pivot 而重合。
export function updateFunctionalHandAnchors(controller, adsProgress = 0) {
  const rig = controller?.rig;
  const hands = controller?.hands;
  const boneMap = controller?.taczBoneMap;
  if (!rig || !hands || !boneMap) return false;

  const weaponRootWorld = computeNodeWorldMatrix(rig.weaponRoot);
  if (!weaponRootWorld) return false;
  const weaponRootInv = weaponRootWorld.clone();
  weaponRootInv.invert();

  let applied = false;
  for (const [handKey, boneName] of Object.entries(HAND_POSITION_BONES)) {
    const handRoot = handKey === "rightHand" ? rig.rightHandRoot : rig.leftHandRoot;
    const hand = handKey === "rightHand" ? hands.rightHand : hands.leftHand;
    const posNode = boneMap.get(boneName);
    if (!handRoot || !hand?.root || !posNode) {
      if (handRoot) handRoot.setEnabled(false);
      continue;
    }
    const posWorld = computeNodeWorldMatrix(posNode);
    if (!posWorld) continue;
    const handLocal = HAND_Z180_MATRIX.multiply(posWorld).multiply(weaponRootInv);
    if (decomposeMatrixToNode(handLocal, handRoot)) {
      handRoot.setEnabled(true);
      applyFunctionalHandVisual(hand, controller.functionalHandVisuals?.[handKey], adsProgress);
      applied = true;
    }
  }
  return applied;
}

// 从 TaCZ geo muzzle bone 计算 rig.muzzleAnchor 在 rig.modelRoot 本地空间的位置。
// 第一人称新路径中 muzzleAnchor.parent = rig.modelRoot，weapon.model.root.parent = rig.modelRoot，
// 所以 muzzleAnchor 本地坐标 = muzzle bone 世界坐标 → modelRoot 空间本地坐标。
// 返回 { boneName, position: [x,y,z] }；未找到 muzzle bone 时返回 null，调用方应保留 calibration.muzzle fallback。
export function applyNativeMuzzleAnchor(rig, weaponModel) {
  if (!rig?.muzzleAnchor || !rig?.modelRoot || !weaponModel?.boneMap) return null;
  // modelRoot 的世界矩阵受 camera → cameraAnchor → weaponRoot → modelRoot 链路影响，
  // 必须先沿父链自顶向下更新，否则 getAbsolutePosition 会拿到上一帧的值。
  rig.modelRoot.computeWorldMatrix(true);
  const modelRootMatrix = rig.modelRoot.getWorldMatrix().clone();
  const modelRootInverse = modelRootMatrix.clone();
  modelRootInverse.invert();
  for (const boneName of TACZ_MUZZLE_BONE_NAMES) {
    const boneNode = weaponModel.boneMap.get(boneName);
    if (!boneNode) continue;
    // 沿父链从顶向下更新所有祖先节点的世界矩阵（包括 camera）
    const ancestors = [];
    let current = boneNode;
    while (current) {
      ancestors.push(current);
      current = current.parent;
    }
    for (let i = ancestors.length - 1; i >= 0; i -= 1) {
      ancestors[i].computeWorldMatrix(true);
    }
    const boneWorld = boneNode.getAbsolutePosition();
    const localPos = BABYLON.Vector3.TransformCoordinates(boneWorld, modelRootInverse);
    rig.muzzleAnchor.position.copyFrom(localPos);
    return { boneName, position: [localPos.x, localPos.y, localPos.z] };
  }
  return null;
}

/**
 * 解析 display.json，返回结构化资源描述 + 诊断。
 * 不做 I/O，只解析已加载的 JSON 对象。
 * @param {object} displayJson - display.json 内容
 * @param {string} weaponId - 武器 ID
 * @returns {object} 结构化资源描述，含 diagnostics 数组
 */
export function parseDisplayJson(displayJson, weaponId) {
  const diagnostics = [];

  // model → geo.json 路径
  const modelNamespace = displayJson.model;
  const geoPath = resolveTaczNamespace(modelNamespace);
  if (!modelNamespace) {
    diagnostics.push({ field: "model", severity: "error", message: `${weaponId} display.json 缺少 model 字段` });
  } else if (!geoPath) {
    diagnostics.push({ field: "model", severity: "error", message: `${weaponId} model 命名空间无法解析: ${modelNamespace}` });
  }

  // texture → diffuse 贴图路径
  const textureNamespace = displayJson.texture;
  const texturePath = resolveTaczNamespace(textureNamespace);
  if (!textureNamespace) {
    diagnostics.push({ field: "texture", severity: "error", message: `${weaponId} display.json 缺少 texture 字段` });
  } else if (!texturePath) {
    diagnostics.push({ field: "texture", severity: "error", message: `${weaponId} texture 命名空间无法解析: ${textureNamespace}` });
  }

  // animation → 从 V2_WEAPON_ANIMATION_BINDINGS 获取
  const binding = V2_WEAPON_ANIMATION_BINDINGS[weaponId];
  const profile = binding?.profile;
  if (!profile) {
    diagnostics.push({ field: "animation", severity: "error", message: `${weaponId} 缺少 V2_WEAPON_ANIMATION_BINDINGS 配置` });
  }
  const useDefaultAnimation = displayJson.use_default_animation;
  if (!useDefaultAnimation) {
    diagnostics.push({ field: "use_default_animation", severity: "warn", message: `${weaponId} display.json 缺少 use_default_animation，默认用 rifle` });
  }

  return {
    weaponId,
    model: { namespace: modelNamespace || null, geoPath: geoPath || null },
    texture: { namespace: textureNamespace || null, texturePath: texturePath || null },
    animation: {
      animationPath: profile?.animationPath || null,
      type: profile?.type || (useDefaultAnimation === "pistol" ? "pistol" : "rifle"),
      playerAnimationPath: profile?.playerAnimationPath || null,
      useDefaultAnimation: useDefaultAnimation || null,
    },
    transform: displayJson.transform || {},
    sounds: displayJson.sounds || {},
    slot: displayJson.slot || null,
    muzzleFlash: displayJson.muzzle_flash || null,
    shell: displayJson.shell || null,
    diagnostics,
  };
}

/**
 * 从已加载的 display.json + geo.json 创建第一人称武器（不依赖 fetch）。
 * 测试用此函数直接传 JSON，浏览器路径用 loadTaczFirstPersonWeapon。
 * @param {Scene} scene - Babylon 场景
 * @param {Camera} camera - 第一人称相机
 * @param {string} weaponId - 武器 ID
 * @param {object} displayJson - display.json 内容
 * @param {object} geoJson - geo.json 内容
 * @param {object} options - { calibration, modelConfig, weaponConfig, textureUrl }
 * @returns {object} { rig, weapon, hands, animationController, display, diagnostics }
 */
export function createTaczFirstPersonWeapon(scene, camera, weaponId, displayJson, geoJson, options = {}) {
  const display = parseDisplayJson(displayJson, weaponId);
  const baseCalibration = options.calibration || WEAPON_CALIBRATION[weaponId] || DEFAULT_CALIBRATION;
  const weaponConfig = options.weaponConfig || WEAPON_CONFIG[weaponId] || {};
  const modelConfig = options.modelConfig || weaponConfig.modelConfig || {};
  const textureUrl = options.textureUrl || ASSET_PATHS.taczWeaponTextures[weaponId] || null;
  // visibilityProfile：优先用 options 传入，否则从 visibilityProfile.js 取默认 profile
  const visibilityProfile = options.visibilityProfile || getVisibilityProfile(weaponId);
  // Phase 2 纯枪模静态渲染模式：只保留 TaCZ geo 模型 + rig，不创建 hands 和动画控制器，
  // 避免手臂 mesh、手部动画、bone 驱动 pose 干扰纯枪模渲染验证。
  const pureStatic = options.pureStatic === true;
  const phase2StaticPose = pureStatic
    ? clonePose(options.phase2StaticPose ?? PHASE2_STATIC_POSE_CALIBRATION[weaponId])
    : null;

  // 1. 先创建 TaCZ 武器模型，读取 geo 中的原生第一人称定位组
  // disableCentering=true：第一人称路径禁用 centeringNode，保持 marker inverse 定位正确
  const weapon = createTaczWeaponFromData(weaponId, scene, displayJson, geoJson, textureUrl, { visibilityProfile, disableCentering: true });
  const firstPersonMarkers = extractFirstPersonMarkers(weapon.model);
  const functionalHandVisuals = extractFunctionalHandVisuals(geoJson, modelConfig);
  // marker 后处理：先用 WEAPON_MARKER_CALIBRATION 的 per-weapon offset，再允许调用方覆盖
  const markerCalibrationOptions = {
    ...(WEAPON_MARKER_CALIBRATION[weaponId] ?? {}),
    ...(options.markerCalibrationOptions ?? {}),
  };
  const calibration = mergeCalibrationWithMarkers(baseCalibration, firstPersonMarkers, markerCalibrationOptions);

  // 2. 创建 FirstPersonRig：优先使用 TaCZ 原生定位组，缺失时由 WEAPON_CALIBRATION 兜底
  const rig = createFirstPersonRig(scene, camera, weaponId, calibration);

  // 模型挂到 rig.modelRoot，由 rig 的 modelScale 统一缩放
  weapon.model.root.parent = rig.modelRoot;
  // 模型在 modelRoot 下的局部偏移归零，位置由 rig 的 weaponRoot/hipPose 控制
  weapon.model.root.position.set(0, 0, 0);
  weapon.model.root.rotation.set(0, 0, 0);
  weapon.model.root.scaling.setAll(1);

  // 2.1 枪口锚点优先从 TaCZ geo muzzle bone 自动计算到 rig.modelRoot 本地空间。
  // 旧 WEAPON_CALIBRATION.muzzle 是旧模型坐标系下的手填值，迁移到 TaCZ 原生 geo 后坐标系不匹配，
  // 会导致枪口火焰出现在模型左下或枪身内部。这里复用旧 weaponModel.js 已验证的 bone 查找逻辑。
  // 未找到 muzzle bone 时返回 null，rig.muzzleAnchor 保留 calibration.muzzle fallback。
  const nativeMuzzleSource = applyNativeMuzzleAnchor(rig, weapon.model);

  let hands = null;
  if (!pureStatic) {
    hands = createHands(scene, rig.weaponRoot, weaponId, modelConfig);
    hands.leftHand.root.parent = rig.leftHandRoot;
    hands.rightHand.root.parent = rig.rightHandRoot;
    applyFunctionalHandVisual(hands.leftHand, functionalHandVisuals.leftHand);
    applyFunctionalHandVisual(hands.rightHand, functionalHandVisuals.rightHand);
  }

  // 4. 创建动画控制器
  // v2AnimationProfile 用 weaponConfig（来自 V2_WEAPON_ANIMATION_BINDINGS.profile），
  // 字段名 animationPath 与 getTaczAnimation / preloadTaczAnimations 一致；
  // 不用 weapon.animationProfile（字段名是 path，会导致缓存查找失败）
  // Phase 2 纯枪模模式不创建动画控制器，避免 idle/draw/shoot/reload pose 驱动 boneMap。
  let animationController = null;
  if (!pureStatic) {
    const animationConfig = {
      ...weaponConfig,
      v2BoneMap: V2_WEAPON_ANIMATION_BINDINGS[weaponId]?.boneMap,
      v2PoseCalibration: V2_WEAPON_ANIMATION_BINDINGS[weaponId]?.calibration,
      v2BoneAliases: V2_WEAPON_ANIMATION_BINDINGS[weaponId]?.boneAliases,
      modelConfig,
    };
    animationController = createWeaponAnimationController(weaponId, animationConfig);
    // 同步 taczBoneMap 到动画控制器（与 weaponModel.js loadWeaponModel 方式 A 一致）
    animationController.taczBoneMap = weapon.model.boneMap;
    animationController.taczGeoModel = weapon.model;
  }

  return {
    weaponId,
    rig,
    weapon,
    hands,
    animationController,
    display,
    diagnostics: display.diagnostics,
    // 兼容 weaponModel.js controller 接口，供 main.js 平滑迁移
    root: rig.cameraAnchor,
    muzzleAnchor: rig.muzzleAnchor,
    ready: true,
    failed: false,
    isTaczNative: true,
    source: "tacz-first-person",
    pureStatic,
    phase2StaticPose,
    staticPoseApplied: false,
    staticPoseSource: phase2StaticPose ? "PHASE2_STATIC_POSE_CALIBRATION" : null,
    partCount: weapon.model.cubes.length,
    status: `${weaponId} TaCZ first person loaded (${weapon.model.cubes.length} cubes)`,
    taczBoneMap: weapon.model.boneMap,
    taczGeoModel: weapon.model,
    taczTransform: weapon.transform,
    firstPersonMarkers,
    calibrationSource: calibration.markerSource,
    // 枪口锚点来源诊断：{ boneName, position } 或 null（fallback 到 calibration.muzzle）
    nativeMuzzleSource,
    useFunctionalHandAnchors: Boolean(hands),
    functionalHandVisuals,
  };
}

/**
 * 浏览器路径：fetch display.json + geo.json，创建第一人称武器。
 * @param {Scene} scene - Babylon 场景
 * @param {Camera} camera - 第一人称相机
 * @param {string} weaponId - 武器 ID
 * @param {object} options - { calibration, modelConfig, weaponConfig }
 * @returns {Promise<object>} createTaczFirstPersonWeapon 的返回值
 */
export async function loadTaczFirstPersonWeapon(scene, camera, weaponId, options = {}) {
  const displayPath = ASSET_PATHS.taczDisplayJson[weaponId];
  const geoPath = ASSET_PATHS.taczGeoModels[weaponId];
  const texturePath = ASSET_PATHS.taczWeaponTextures[weaponId];

  if (!displayPath || !geoPath) {
    throw new Error(`[${weaponId}] 缺少 TaCZ display/geo 路径配置`);
  }

  const [displayRes, geoRes] = await Promise.all([
    fetch(displayPath),
    fetch(geoPath),
  ]);

  if (!displayRes.ok) throw new Error(`[${weaponId}] display.json 加载失败: ${displayRes.status}`);
  if (!geoRes.ok) throw new Error(`[${weaponId}] geo.json 加载失败: ${geoRes.status}`);

  const displayJson = await displayRes.json();
  const geoJson = await geoRes.json();

  return createTaczFirstPersonWeapon(scene, camera, weaponId, displayJson, geoJson, {
    ...options,
    textureUrl: texturePath,
  });
}

/**
 * 诊断第一人称武器资源链完整性（Node 环境用 fs，浏览器环境只检查配置）。
 * @param {string} weaponId - 武器 ID
 * @param {object} options - { displayJson, geoJson } 可选预加载数据
 * @returns {object} { valid, errors, warnings, resourceChain }
 */
export function diagnoseFirstPersonWeapon(weaponId, options = {}) {
  const errors = [];
  const warnings = [];
  const resourceChain = {};

  // 检查 ASSET_PATHS 配置
  const displayPath = ASSET_PATHS.taczDisplayJson[weaponId];
  const geoPath = ASSET_PATHS.taczGeoModels[weaponId];
  const texturePath = ASSET_PATHS.taczWeaponTextures[weaponId];
  const binding = V2_WEAPON_ANIMATION_BINDINGS[weaponId];

  if (!displayPath) errors.push(`缺少 display.json 路径配置`);
  if (!geoPath) errors.push(`缺少 geo.json 路径配置`);
  if (!texturePath) errors.push(`缺少 texture 路径配置`);
  if (!binding) errors.push(`缺少 V2_WEAPON_ANIMATION_BINDINGS 配置`);
  if (!binding?.profile?.animationPath) errors.push(`缺少 animation.json 路径`);
  if (!binding?.profile?.playerAnimationPath) errors.push(`缺少 player_animation.json 路径`);

  resourceChain.display = displayPath;
  resourceChain.geo = geoPath;
  resourceChain.texture = texturePath;
  resourceChain.animation = binding?.profile?.animationPath;
  resourceChain.playerAnimation = binding?.profile?.playerAnimationPath;

  // 检查 display.json 解析（如果有预加载数据）
  if (options.displayJson) {
    const display = parseDisplayJson(options.displayJson, weaponId);
    for (const d of display.diagnostics) {
      if (d.severity === "error") errors.push(d.message);
      else warnings.push(d.message);
    }
    resourceChain.parsedModel = display.model.geoPath;
    resourceChain.parsedTexture = display.texture.texturePath;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    resourceChain,
  };
}

/**
 * 更新第一人称武器（替代 weaponModel.js 的 updateWeaponModel）。
 * 负责：rig 显隐、ADS/hip pose 切换、recoil 偏移、reload 下沉。
 * 不负责：双手动画、bone 驱动、muzzle flash（由 main.js 调用方处理）。
 * @param {object} controller - createTaczFirstPersonWeapon 返回的 controller
 * @param {object} options - { active, recoil, reloading, reloadProgress, ads }
 * @returns {object} { active, muzzleWorld }
 */
export function updateTaczFirstPersonWeapon(controller, options = {}) {
  const { rig } = controller;
  if (!rig) return { active: false, muzzleWorld: null };

  const active = options.active ?? false;
  rig.setEnabled(active);
  if (!active) return { active: false, muzzleWorld: null };

  // Phase 2 纯枪模模式：固定 hip pose，不进入 ADS 插值，不叠加 recoil/reloadDrop。
  // pureStatic 由调用方通过 options 传入，或 controller 自身就是 pureStatic controller。
  const pureStatic = options.pureStatic === true || controller.pureStatic === true;
  controller.staticPoseApplied = false;

  // 1. ADS/hip pose 切换；adsProgress 存在时使用插值，避免第一人称视角瞬切。
  if (pureStatic) {
    rig.applyHipPose();
    if (controller.phase2StaticPose && applyWeaponRootPose(rig.weaponRoot, controller.phase2StaticPose)) {
      // Phase2 静态验收只关心裸枪轮廓，专用 pose 覆盖在 hip pose 之后，
      // 但不修改 rig.calibration，避免污染运行时 ADS/换弹/动画姿态。
      controller.staticPoseApplied = true;
      rig.currentPose = "phase2-static";
    }
  } else if (typeof options.adsProgress === "number") {
    rig.blendPose("hip", "ads", options.adsProgress);
  } else if (options.ads) {
    rig.applyAdsPose();
  } else {
    rig.applyHipPose();
  }

  // 纯枪模模式：pose 应用后直接返回，跳过 recoil/reloadDrop 叠加，避免任何动态偏移。
  if (pureStatic) {
    let muzzleWorld = null;
    if (rig.muzzleAnchor) {
      rig.muzzleAnchor.computeWorldMatrix(true);
      muzzleWorld = rig.muzzleAnchor.getAbsolutePosition().clone();
    }
    return { active: true, muzzleWorld };
  }

  // 2. 在 hipPose/adsPose 之上叠加 recoil 偏移和 reload 下沉
  const recoil = options.recoil ?? 0;
  const reloading = options.reloading ?? false;
  const reloadProgress = Math.max(0, Math.min(1, options.reloadProgress ?? 0));
  const rootMotionScale = rig.calibration.rootMotionScale ?? 1;
  // 换弹下沉：sin(π·progress) 让武器先沉下去再抬起
  const reloadFactor = reloading ? Math.sin(Math.PI * reloadProgress) : 0;
  const reloadDrop = reloadFactor * 0.2 * rootMotionScale;
  const reloadRotX = reloadFactor * 0.15 * rootMotionScale;

  // 读取当前 pose 的 base position/rotation（applyHipPose/applyAdsPose 已设置）
  const basePos = rig.weaponRoot.position;
  const baseRot = rig.weaponRoot.rotation;
  // 叠加 recoil + reload 偏移
  rig.weaponRoot.position.set(
    basePos.x + recoil * 0.07,
    basePos.y - recoil * 0.05 - reloadDrop,
    basePos.z
  );
  rig.weaponRoot.rotation.set(
    baseRot.x - recoil * 0.08 + reloadRotX,
    baseRot.y,
    baseRot.z - recoil * 0.1
  );

  // 3. 获取 muzzleAnchor 世界坐标（供 main.js 枪口火焰定位）
  let muzzleWorld = null;
  if (rig.muzzleAnchor) {
    rig.muzzleAnchor.computeWorldMatrix(true);
    muzzleWorld = rig.muzzleAnchor.getAbsolutePosition().clone();
  }

  return { active: true, muzzleWorld };
}
