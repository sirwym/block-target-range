import * as BABYLON from "@babylonjs/core";
import { applyVisibilityProfile } from "./visibilityProfile.js";
import { bedrockRotationQuaternionZYX, convertBonePivot } from "./taczBedrockCoordinate.js";

// TaCZ 原生 Bedrock geo renderer
// 加载 minecraft:geometry 格式，保留 bone 层级、pivot、三轴旋转，
// 渲染真实 per-face UV 贴图。动画系统通过 boneMap 直接驱动 bone TransformNode。
//
// 坐标转换严格遵循 TaCZ BedrockModel.java 语义：
// - bone pivot：root 用 (24-pivotY)/16（眼睛高度偏移），child 用 (parentY-childY)/16（Y翻转）
// - cube origin：origin[1] 是 cube 顶部（maxY），中心 Y = origin[1] - size[1]/2
// - cube 相对 bone 的局部偏移：所有轴直接减法 (center-pivot)/16，不需要再翻转

const DEG_TO_RAD = Math.PI / 180;
const PIXEL_TO_UNIT = 1 / 16; // Bedrock 像素 → Babylon 单位

const DEFAULT_HIDDEN_BONE_ROOTS = {
  deagle_golden: ["mag_extended_1", "mag_extended_2", "mag_extended_3", "additional_magazine"],
  m95: ["sight_folded", "mag_extended_1", "mag_extended_2", "mag_extended_3", "shell_ejection"],
};

// Phase3v9：DEFAULT_HIDDEN_BONE_CUBES 全部清空，outlier cube 隐藏规则由 visibilityProfile.js 驱动，
// 等待 MCP 重新诊断后添加最小规则集
const DEFAULT_HIDDEN_BONE_CUBES = {};

const MAIN_STRUCTURE_BONES = new Set([
  "gun_body",
  "barrel",
  "barrel3", // ak47 枪管组件（无 cubes，只是层级节点）
  "sights",
  "fore_sight",
  "handguard2",
  "body",
  "muzzle_default",
  "grip",
  "grip_lower",
  "lower",
  "lower3",
]);

const PROFILE_HIDDEN_BONE_NAMES = new Set([
  "additional_magazine",
  "mag_and_lefthand",
  "mag_and_bullet",
  "sight_folded",
  "decos",
]);

const PROFILE_VISIBLE_MAG_BONE_NAMES = new Set([
  "mag_release",
  "magrelease",
]);

function isProfileHiddenCandidateName(boneName) {
  if (PROFILE_VISIBLE_MAG_BONE_NAMES.has(boneName)) return false;
  return (
    PROFILE_HIDDEN_BONE_NAMES.has(boneName)
    || boneName.startsWith("mag_extended_")
    || boneName.startsWith("shell_")
    || boneName.startsWith("bullet_shell")
    || boneName.startsWith("oem_stock_")
  );
}

function createHiddenCubeMatcher(weaponId, optionHiddenCubes = {}, profileHiddenCubes = {}) {
  // 合并三层数据源：硬编码 fallback + options 传入 + visibilityProfile
  const merged = {
    ...(DEFAULT_HIDDEN_BONE_CUBES[weaponId] ?? {}),
    ...optionHiddenCubes,
    ...profileHiddenCubes,
  };
  return (boneName, cubeIndex) => {
    const rule = merged[boneName];
    if (rule === true) return true;
    if (Array.isArray(rule)) return rule.includes(cubeIndex);
    return false;
  };
}

// Bedrock 旋转顺序：TaCZ BedrockPart.translateAndRotateAndScale 的 mulPose(Z,Y,X) 是 post-multiply，
// 矩阵 = R_Z * R_Y * R_X，四元数 q = q_Z * q_Y * q_X。
// 详见 taczBedrockCoordinate.js 的 bedrockRotationQuaternionZYX 数学推导。
function applyBedrockRotation(node, rotationDeg) {
  node.rotationQuaternion = bedrockRotationQuaternionZYX(rotationDeg);
}

// 从 Bedrock 旋转角度构造 ZYX 顺序四元数（不依赖 node，用于 delta 组合）
function bedrockRotationQuaternion(rotationDeg) {
  return bedrockRotationQuaternionZYX(rotationDeg);
}

// Bedrock geo 6 面顶点定义（相对 cube 中心，已转 Babylon 单位）
// 顶点顺序遵循逆时针（从外侧看），保证面法线朝外
// 顶点以 cube 中心为局部原点，只用 size 不用 origin；
// mesh.position 负责把 cube 放到正确世界位置，顶点不再含绝对模型坐标
function cubeFaceVertices(direction, size) {
  const x0 = -size[0] / 2 * PIXEL_TO_UNIT;
  const x1 =  size[0] / 2 * PIXEL_TO_UNIT;
  const y0 = -size[1] / 2 * PIXEL_TO_UNIT;
  const y1 =  size[1] / 2 * PIXEL_TO_UNIT;
  const z0 = -size[2] / 2 * PIXEL_TO_UNIT;
  const z1 =  size[2] / 2 * PIXEL_TO_UNIT;

  switch (direction) {
    case "north": // -Z
      return [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]];
    case "south": // +Z
      return [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]];
    case "east": // +X
      return [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]];
    case "west": // -X
      return [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]];
    case "up": // +Y
      return [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]];
    case "down": // -Y
      return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
    default:
      return [];
  }
}

// 计算 per-face UV（Bedrock 像素坐标 → Babylon 归一化 UV）
// Bedrock UV 原点在左上，V 轴向下；Babylon UV 原点在左下，V 轴向上，需翻转 V
function computeFaceUV(faceUv, faceUvSize, textureWidth, textureHeight) {
  const u0 = faceUv[0] / textureWidth;
  const u1 = (faceUv[0] + faceUvSize[0]) / textureWidth;
  // V 翻转：贴图上方对应 Babylon 高 V
  const vTop = 1 - faceUv[1] / textureHeight;
  const vBottom = 1 - (faceUv[1] + faceUvSize[1]) / textureHeight;
  // 顶点顺序 [左下, 右下, 右上, 左上] 对应 UV
  return [u0, vBottom, u1, vBottom, u1, vTop, u0, vTop];
}

// Bedrock auto UV（cube.uv 是数组 [u, v]）的简单 fallback
// 根据 cube size 为每面计算 UV 区域
function computeAutoFaceUV(direction, uv, size, textureWidth, textureHeight) {
  const u = uv[0];
  const v = uv[1];
  const sw = size[0];
  const sh = size[1];
  const sd = size[2];
  let faceUv, faceUvSize;
  switch (direction) {
    case "north":
    case "south":
      faceUv = [u, v];
      faceUvSize = [sw, sh];
      break;
    case "east":
    case "west":
      faceUv = [u + sw, v];
      faceUvSize = [sd, sh];
      break;
    case "up":
    case "down":
      faceUv = [u, v + sh];
      faceUvSize = [sw, sd];
      break;
    default:
      faceUv = [u, v];
      faceUvSize = [sw, sh];
  }
  return computeFaceUV(faceUv, faceUvSize, textureWidth, textureHeight);
}

// 为单个 cube 构建 VertexData mesh（6 面，per-face UV）
function buildCubeMesh(cube, boneName, scene, textureWidth, textureHeight, material, weaponId, cubeIndex) {
  const origin = cube.origin;
  const size = cube.size;
  const faces = ["north", "south", "east", "west", "up", "down"];

  const positions = [];
  const uvs = [];
  const indices = [];
  let vertexOffset = 0;
  let hasAnyFace = false;

  for (const dir of faces) {
    const verts = cubeFaceVertices(dir, size);
    if (verts.length === 0) continue;

    for (const v of verts) {
      positions.push(v[0], v[1], v[2]);
    }

    // UV 解析：优先 per-face，其次 auto 对象，最后 auto 数组
    let faceUV;
    const cubeUv = cube.uv;
    if (cubeUv && typeof cubeUv === "object" && !Array.isArray(cubeUv) && cubeUv[dir]) {
      // per-face UV: { north: {uv, uv_size}, ... }
      const face = cubeUv[dir];
      faceUV = computeFaceUV(face.uv, face.uv_size, textureWidth, textureHeight);
    } else if (cubeUv && typeof cubeUv === "object" && !Array.isArray(cubeUv) && cubeUv.uv) {
      // auto 对象: {uv: [u,v], uv_size: [w,h]}
      faceUV = computeFaceUV(cubeUv.uv, cubeUv.uv_size, textureWidth, textureHeight);
    } else if (Array.isArray(cubeUv)) {
      // auto 数组: [u, v]
      faceUV = computeAutoFaceUV(dir, cubeUv, size, textureWidth, textureHeight);
    } else {
      // 无 UV，用默认
      faceUV = [0, 0, 1, 0, 1, 1, 0, 1];
    }
    uvs.push(...faceUV);

    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
    indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 3);
    vertexOffset += 4;
    hasAnyFace = true;
  }

  if (!hasAnyFace) return null;

  const mesh = new BABYLON.Mesh(`${weaponId}-geo-${boneName}-${cubeIndex}`, scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.uvs = uvs;
  const normals = [];
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh);

  mesh.material = material;
  mesh.isPickable = false;
  mesh.renderingGroupId = 2;
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}

function subtractUnitVector(a, b) {
  return [
    ((a[0] ?? 0) - (b[0] ?? 0)) * PIXEL_TO_UNIT,
    ((a[1] ?? 0) - (b[1] ?? 0)) * PIXEL_TO_UNIT,
    ((a[2] ?? 0) - (b[2] ?? 0)) * PIXEL_TO_UNIT,
  ];
}

// 相对位置计算（Y轴翻转），用于 cube 相对于 pivot 的位置
// 对照 TaCZ BedrockModel.convertOrigin L314-320：
// - X/Z: cube 中心 - pivot（不翻转）
// - Y: pivot - cube 中心（翻转），因为 Bedrock 格式 Y 轴在 cube origin 语义上是反的
function subtractUnitVectorYFlip(child, parent) {
  return [
    ((child[0] ?? 0) - (parent[0] ?? 0)) * PIXEL_TO_UNIT,
    ((parent[1] ?? 0) - (child[1] ?? 0)) * PIXEL_TO_UNIT,
    ((child[2] ?? 0) - (parent[2] ?? 0)) * PIXEL_TO_UNIT,
  ];
}

function cloneVectorArray(values) {
  return Array.isArray(values) ? [...values] : null;
}

function vectorToPlain(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function getMeshWorldBounds(mesh) {
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo(true);
  const bb = mesh.getBoundingInfo().boundingBox;
  const min = bb.minimumWorld;
  const max = bb.maximumWorld;
  const center = BABYLON.Vector3.Center(min, max);
  return {
    min: vectorToPlain(min),
    max: vectorToPlain(max),
    center: vectorToPlain(center),
    extent: {
      x: max.x - min.x,
      y: max.y - min.y,
      z: max.z - min.z,
    },
  };
}

function createDebugGeometry(weaponId, bones) {
  return {
    weaponId,
    coordinateMode: "bind-pose-diff",
    pixelToUnit: PIXEL_TO_UNIT,
    boneCount: bones.length,
    cubeCount: 0,
    bones: [],
    cubes: [],
    bounds: null,
    rawBounds: null,
    visibleBounds: null,
    outliers: [],
    rawOutliers: [],
    visibleOutliers: [],
    semantics: {
      active: "bind-pose-diff",
      candidates: [
        "bind-pose-diff",
        "z-axis-mirrored-position",
        "z-axis-mirrored-position-and-yz-rotation",
      ],
    },
  };
}

function isNodeEffectivelyEnabled(node) {
  let current = node;
  while (current) {
    if (typeof current.isEnabled === "function" && !current.isEnabled()) return false;
    current = current.parent;
  }
  return true;
}

function findDisabledAncestorName(node) {
  let current = node?.parent ?? null;
  while (current) {
    if (typeof current.isEnabled === "function" && !current.isEnabled()) return current.name ?? null;
    current = current.parent;
  }
  return null;
}

function boneHasProfileHiddenAncestor(boneName, boneDataMap, hiddenProfileBones) {
  let currentName = boneName;
  while (currentName) {
    if (hiddenProfileBones.has(currentName)) return true;
    currentName = boneDataMap.get(currentName)?.parent ?? null;
  }
  return false;
}

function buildBoneChain(boneName, boneDataMap) {
  const chain = [];
  const visited = new Set();
  let currentName = boneName;
  while (currentName && !visited.has(currentName)) {
    visited.add(currentName);
    chain.push(currentName);
    currentName = boneDataMap.get(currentName)?.parent ?? null;
  }
  return chain;
}

function classifyCubeDebug(cubeDebug, boneDataMap) {
  const boneChain = buildBoneChain(cubeDebug.boneName, boneDataMap);
  const isMainStructureCandidate = boneChain.some((name) => MAIN_STRUCTURE_BONES.has(name));
  const isProfileHiddenCandidate = boneChain.some(isProfileHiddenCandidateName);
  cubeDebug.boneChain = boneChain;
  cubeDebug.rootBoneName = boneChain.length > 0 ? boneChain[boneChain.length - 1] : cubeDebug.boneName;
  cubeDebug.isMainStructureCandidate = isMainStructureCandidate;
  cubeDebug.isProfileHiddenCandidate = isProfileHiddenCandidate;
  // 主结构默认禁止直接隐藏；只有明确属于附件/弹匣/弹壳/装饰变体的 cube 才进入隐藏候选。
  cubeDebug.hideAllowed = isProfileHiddenCandidate && !isMainStructureCandidate;
}

function createEmptyBounds() {
  return {
    min: null,
    max: null,
    center: null,
    extent: { x: 0, y: 0, z: 0 },
  };
}

function computeDebugBounds(debugCubes, distancePrefix) {
  if (debugCubes.length === 0) return createEmptyBounds();

  const min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  const max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  for (const cubeDebug of debugCubes) {
    const bounds = cubeDebug.meshWorldBounds;
    if (!bounds) continue;
    min.x = Math.min(min.x, bounds.min.x);
    min.y = Math.min(min.y, bounds.min.y);
    min.z = Math.min(min.z, bounds.min.z);
    max.x = Math.max(max.x, bounds.max.x);
    max.y = Math.max(max.y, bounds.max.y);
    max.z = Math.max(max.z, bounds.max.z);
  }

  if (!Number.isFinite(min.x)) return createEmptyBounds();
  const center = BABYLON.Vector3.Center(min, max);
  const bounds = {
    min: vectorToPlain(min),
    max: vectorToPlain(max),
    center: vectorToPlain(center),
    extent: {
      x: max.x - min.x,
      y: max.y - min.y,
      z: max.z - min.z,
    },
  };

  for (const cubeDebug of debugCubes) {
    const cubeCenter = cubeDebug.meshWorldBounds?.center;
    if (!cubeCenter) continue;
    const dx = cubeCenter.x - center.x;
    const dy = cubeCenter.y - center.y;
    const dz = cubeCenter.z - center.z;
    cubeDebug[`${distancePrefix}DistanceFromModelCenter`] = Math.hypot(dx, dy, dz);
    cubeDebug[`${distancePrefix}TopFloatingDistance`] = cubeCenter.y - center.y;
  }
  return bounds;
}

function buildOutlierSummary(debugCubes, distancePrefix) {
  const distanceField = `${distancePrefix}DistanceFromModelCenter`;
  const topField = `${distancePrefix}TopFloatingDistance`;
  return debugCubes
    .filter((cube) => Number.isFinite(cube[distanceField]))
    .sort((a, b) => b[distanceField] - a[distanceField])
    .slice(0, 20)
    .map((cube) => ({
      boneName: cube.boneName,
      cubeIndex: cube.cubeIndex,
      distanceFromModelCenter: cube[distanceField],
      topFloatingDistance: cube[topField],
      rawDistanceFromModelCenter: cube.rawDistanceFromModelCenter,
      visibleDistanceFromModelCenter: cube.visibleDistanceFromModelCenter,
      effectiveEnabled: cube.effectiveEnabled,
      effectiveVisible: cube.effectiveVisible,
      hiddenByProfile: cube.hiddenByProfile,
      ancestorDisabled: cube.ancestorDisabled,
      disabledAncestorName: cube.disabledAncestorName,
      boneChain: cube.boneChain,
      rootBoneName: cube.rootBoneName,
      isProfileHiddenCandidate: cube.isProfileHiddenCandidate,
      isMainStructureCandidate: cube.isMainStructureCandidate,
      hideAllowed: cube.hideAllowed,
      hasRotation: cube.hasRotation,
      rotationDeg: cube.rotationDeg,
      cubeCenterLocal: cube.cubeCenterLocal,
      cubePivotLocal: cube.cubePivotLocal,
      meshWorldBounds: cube.meshWorldBounds,
    }));
}

function finalizeDebugGeometry(debugGeometry, cubes, options = {}) {
  if (!debugGeometry || cubes.length === 0) return debugGeometry;

  const hiddenProfileBones = options.hiddenProfileBones ?? new Set();
  const boneDataMap = options.boneDataMap ?? new Map();
  const cubeDebugByKey = new Map();
  for (const cubeDebug of debugGeometry.cubes) {
    cubeDebugByKey.set(`${cubeDebug.boneName}:${cubeDebug.cubeIndex}`, cubeDebug);
  }

  for (const cube of cubes) {
    const bounds = getMeshWorldBounds(cube.mesh);
    const cubeDebug = cubeDebugByKey.get(`${cube.boneName}:${cube.cubeIndex}`);
    if (cubeDebug) {
      const effectiveEnabled = isNodeEffectivelyEnabled(cube.mesh);
      const isVisible = cube.mesh.isVisible !== false;
      const hasVertices = (cube.mesh.getTotalVertices?.() ?? 0) > 0;
      cubeDebug.meshWorldBounds = bounds;
      cubeDebug.rawMeshWorldBounds = bounds;
      cubeDebug.effectiveEnabled = effectiveEnabled;
      cubeDebug.isVisible = isVisible;
      cubeDebug.hasVertices = hasVertices;
      cubeDebug.effectiveVisible = effectiveEnabled && isVisible && hasVertices;
      cubeDebug.hiddenByProfile = boneHasProfileHiddenAncestor(cube.boneName, boneDataMap, hiddenProfileBones);
      cubeDebug.ancestorDisabled = !effectiveEnabled;
      cubeDebug.disabledAncestorName = findDisabledAncestorName(cube.mesh);
    }
  }

  for (const cubeDebug of debugGeometry.cubes) {
    classifyCubeDebug(cubeDebug, boneDataMap);
  }

  const rawCubes = debugGeometry.cubes.filter((cube) => cube.meshWorldBounds);
  const visibleCubes = rawCubes.filter((cube) => cube.effectiveVisible);
  debugGeometry.rawBounds = computeDebugBounds(rawCubes, "raw");
  debugGeometry.visibleBounds = computeDebugBounds(visibleCubes, "visible");
  debugGeometry.rawOutliers = buildOutlierSummary(rawCubes, "raw");
  debugGeometry.visibleOutliers = buildOutlierSummary(visibleCubes, "visible");

  // 兼容旧调试字段：bounds/outliers 始终代表最终可见模型，避免把已隐藏子树误当碎片。
  debugGeometry.bounds = debugGeometry.visibleBounds;
  debugGeometry.outliers = debugGeometry.visibleOutliers;
  for (const cubeDebug of debugGeometry.cubes) {
    cubeDebug.distanceFromModelCenter = cubeDebug.visibleDistanceFromModelCenter ?? cubeDebug.rawDistanceFromModelCenter;
    cubeDebug.topFloatingDistance = cubeDebug.visibleTopFloatingDistance ?? cubeDebug.rawTopFloatingDistance;
  }

  return debugGeometry;
}

/**
 * 加载 TaCZ 原生 Bedrock geo，保留 bone 层级、pivot、三轴旋转。
 * @param {Scene} scene - Babylon 场景
 * @param {object} geoJson - Bedrock geo JSON（minecraft:geometry 格式）
 * @param {string} textureUrl - 贴图 URL
 * @param {object} options - { weaponId, material }
 * @returns {object} { root, boneMap, cubes, textureWidth, textureHeight, dispose, highlightBone, getBoneWorldMatrix }
 */
export function createTaczGeoModel(scene, geoJson, textureUrl, options = {}) {
  const weaponId = options.weaponId || "tacz-weapon";
  const geometry = geoJson["minecraft:geometry"];
  if (!geometry || !Array.isArray(geometry) || geometry.length === 0) {
    throw new Error(`[${weaponId}] geo JSON 缺少 minecraft:geometry`);
  }
  const geo = geometry[0];
  const desc = geo.description || {};
  const textureWidth = desc.texture_width || 16;
  const textureHeight = desc.texture_height || 16;
  const bones = geo.bones || [];
  // 合并三层数据源：硬编码 fallback + options.hiddenBoneRoots + visibilityProfile.defaultHiddenBones
  const profile = options.visibilityProfile;
  const hiddenRoots = new Set([
    ...(DEFAULT_HIDDEN_BONE_ROOTS[weaponId] ?? []),
    ...(options.hiddenBoneRoots ?? []),
    ...(profile?.defaultHiddenBones ?? []),
  ]);
  const shouldHideCube = createHiddenCubeMatcher(weaponId, options.hiddenBoneCubes, profile?.hiddenBoneCubes ?? {});

  // 创建材质（真实贴图）
  const material = new BABYLON.StandardMaterial(`${weaponId}-geo-material`, scene);
  if (textureUrl) {
    const texture = new BABYLON.Texture(textureUrl, scene);
    texture.anisotropicFilteringLevel = 4;
    material.diffuseTexture = texture;
  }
  material.backFaceCulling = true;
  material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

  // 顶层 root node（parent 由调用方设置）
  const root = new BABYLON.TransformNode(`${weaponId}-geo-root`, scene);
  const debugGeometry = createDebugGeometry(weaponId, bones);

  // 第一层：构建 boneMap（name → TransformNode）
  const boneMap = new Map();
  const boneDataMap = new Map(); // 保存原始 bone 数据用于第二遍处理 cube
  for (const bone of bones) {
    const node = new BABYLON.TransformNode(`${weaponId}-bone-${bone.name}`, scene);
    boneMap.set(bone.name, node);
    boneDataMap.set(bone.name, bone);
  }

  // 找到真正的 root bone（name === "root"），获取其 pivot 用于顶层定位组
  const rootBone = bones.find((b) => b.name === "root");
  const rootPivot = rootBone?.pivot || [0, 24, 0];

  // 第二层：设置 parent / bind-pose local position / rotation。
  // Bedrock geo 的 bone.pivot 是 bind pose（未旋转初始姿态）下的模型空间坐标。
  // 严格使用 convertBonePivot 转换 pivot（对照 TaCZ BedrockModel.convertPivot L280-294）：
  // - 顶层bone（bone.parent === null）：包括root、view、positioning、camera等，
  //   统一使用顶层公式 localY=(24-pivotY)/16（24像素眼睛高度偏移），
  //   X/Z=pivot/16。它们直接挂在geo-root TransformNode下，彼此平行。
  // - 子bone（有parent）：localY=(parentPivotY-pivotY)/16（Y翻转），X/Z=(child-parent)/16。
  //
  // 关键架构说明：view/positioning/camera等第一人称定位组在Bedrock geo中是顶层bone，
  // 与root平行，不是root的子节点。buildBonePath从marker向上遍历到顶层bone即终止，
  // 不强制追溯到root。root是唯一包含cubes的顶层bone，其他顶层bone是空定位组。
  for (const bone of bones) {
    const node = boneMap.get(bone.name);
    const pivot = bone.pivot || [0, 0, 0];

    // 判定顶层bone：geo中bone.parent为null（包括root、view、positioning、camera）
    const isTopLevel = !bone.parent;
    let parentName = bone.parent || null;
    let parentPivot = [0, 0, 0];

    if (bone.parent) {
      const parentNode = boneMap.get(bone.parent);
      node.parent = parentNode || root;
      const parentData = boneDataMap.get(bone.parent);
      if (parentData?.pivot) parentPivot = parentData.pivot;
    } else {
      // 顶层bone（无parent）：直接挂在geo-root TransformNode下，不链接到root bone
      node.parent = root;
    }

    const boneLocal = convertBonePivot(pivot, isTopLevel ? null : parentPivot, isTopLevel);
    node.position.set(...boneLocal);

    // bone rotation → node.rotationQuaternion（ZXY 顺序，TaCZ mod 原生格式）
    applyBedrockRotation(node, bone.rotation ?? [0, 0, 0]);
    // 存储原始变换，供动画系统恢复（pivot + delta 而非覆盖 pivot）
    node.metadata = {
      originalPosition: [node.position.x, node.position.y, node.position.z],
      originalRotation: node.rotationQuaternion.clone(),
    };
    debugGeometry.bones.push({
      boneName: bone.name,
      parent: parentName,
      boneParent: parentName,
      originalPivot: cloneVectorArray(pivot),
      parentPivot: cloneVectorArray(parentPivot),
      localPosition: boneLocal,
      rotationDeg: cloneVectorArray(bone.rotation ?? [0, 0, 0]),
    });
  }

  // 第三层：为每个 bone 的 cubes 创建 mesh
  // 跳过 lefthand_pos/righthand_pos：这些是 TaCZ 手部位置参考点，只有 1 个标记 cube，
  // 不应该渲染。若渲染会拉大模型包围盒，导致枪口相对位置偏移、screenBounds 失真。
  // cube.origin/cube.pivot 是 bind-pose 模型空间绝对坐标。这里按 bone/cube pivot 差值
  // 转成 Babylon local position，不使用 setAbsolutePosition 或 world matrix inverse 反算，
  // 避免父 bone 已带旋转时污染子节点的局部坐标。
  const SKIP_RENDER_BONES = new Set(["lefthand_pos", "righthand_pos"]);
  const hiddenBoneNames = new Set(hiddenRoots);
  let addedHiddenChild = true;
  while (addedHiddenChild) {
    addedHiddenChild = false;
    for (const bone of bones) {
      if (!hiddenBoneNames.has(bone.name) && bone.parent && hiddenBoneNames.has(bone.parent)) {
        hiddenBoneNames.add(bone.name);
        addedHiddenChild = true;
      }
    }
  }
  const cubes = [];
  for (const bone of bones) {
    if (!bone.cubes || bone.cubes.length === 0) continue;
    if (SKIP_RENDER_BONES.has(bone.name)) continue;
    if (hiddenBoneNames.has(bone.name)) continue;
    const boneNode = boneMap.get(bone.name);
    const bonePivot = bone.pivot || [0, 0, 0];

    bone.cubes.forEach((cube, cubeIndex) => {
      if (shouldHideCube(bone.name, cubeIndex)) return;
      const mesh = buildCubeMesh(cube, bone.name, scene, textureWidth, textureHeight, material, weaponId, cubeIndex);
      if (!mesh) return;

      const cubeRotation = cube.rotation;

      // cube 中心（Bedrock 模型空间像素坐标）：
      // 对照 TaCZ BedrockModel.convertOrigin L314-320：
      // Bedrock 格式中 cube.origin[1] 是 cube 的顶部（Y 起点），cube 向下延伸 size[1] 像素，
      // 所以 Bedrock 像素坐标中 center Y = origin[1] + size[1]/2（从 top 往下走一半）。
      // X/Z 轴 origin 是 min corner，center = origin + size/2。
      // 转换到 Babylon 局部位置时 Y 轴需要翻转：pivotY - centerY（而非 centerY - pivotY），
      // 这和 bone pivot 的 Y 翻转语义一致（convertBonePivot / convertPivot）。
      const cubeCenter = [
        cube.origin[0] + cube.size[0] / 2,
        cube.origin[1] + cube.size[1] / 2,
        cube.origin[2] + cube.size[2] / 2,
      ];

      if (cubeRotation && (cubeRotation[0] !== 0 || cubeRotation[1] !== 0 || cubeRotation[2] !== 0)) {
        // cube 有独立旋转：创建 cube pivot node
        // cubePivotNode local position = convertPivot(parentBone, cube) 语义（Y翻转）
        // mesh local position = convertOrigin(cubePivot, cube) 语义（Y翻转）
        const cubePivotNode = new BABYLON.TransformNode(`${weaponId}-cube-pivot-${bone.name}-${cubeIndex}`, scene);
        cubePivotNode.parent = boneNode;

        // cube.pivot 缺失时 fallback 到 cube 自身中心（origin+size/2），而非 bone.pivot
        // Wiki model.html 强调 pivot（旋转轴）与 origin（方块原点）是不同概念
        // cube 有独立 rotation 时应绕自身中心旋转，fallback 到 bone.pivot 会让 cube 飞离正确位置
        const cubePivot = cube.pivot || cubeCenter;
        const cubePivotLocal = subtractUnitVectorYFlip(cubePivot, bonePivot);
        const meshLocal = subtractUnitVectorYFlip(cubeCenter, cubePivot);

        // cubePivotNode local = convertPivot 语义
        cubePivotNode.position.set(...cubePivotLocal);
        // cubePivotNode rotation 用 ZXY 顺序四元数（与 bone rotation 一致）
        applyBedrockRotation(cubePivotNode, cubeRotation);
        mesh.parent = cubePivotNode;

        // mesh local = convertOrigin 语义（Y翻转）
        mesh.position.set(...meshLocal);
        debugGeometry.cubes.push({
          boneName: bone.name,
          cubeIndex,
          boneParent: bone.parent ?? null,
          originalPivot: cloneVectorArray(cube.pivot),
          bonePivot: cloneVectorArray(bonePivot),
          cubeOrigin: cloneVectorArray(cube.origin),
          cubeSize: cloneVectorArray(cube.size),
          cubeCenter: cloneVectorArray(cubeCenter),
          cubeCenterLocal: subtractUnitVectorYFlip(cubeCenter, bonePivot),
          cubePivot: cloneVectorArray(cubePivot),
          cubePivotLocal,
          meshLocal,
          hasRotation: true,
          rotationDeg: cloneVectorArray(cubeRotation),
          meshWorldBounds: null,
        });
      } else {
        // cube 无独立旋转：直接挂到 bone node
        // mesh local = convertOrigin 语义（Y翻转）
        mesh.parent = boneNode;
        const meshLocal = subtractUnitVectorYFlip(cubeCenter, bonePivot);
        mesh.position.set(...meshLocal);
        debugGeometry.cubes.push({
          boneName: bone.name,
          cubeIndex,
          boneParent: bone.parent ?? null,
          originalPivot: cloneVectorArray(cube.pivot),
          bonePivot: cloneVectorArray(bonePivot),
          cubeOrigin: cloneVectorArray(cube.origin),
          cubeSize: cloneVectorArray(cube.size),
          cubeCenter: cloneVectorArray(cubeCenter),
          cubeCenterLocal: meshLocal,
          cubePivot: null,
          cubePivotLocal: null,
          meshLocal,
          hasRotation: false,
          rotationDeg: [0, 0, 0],
          meshWorldBounds: null,
        });
      }

      cubes.push({
        boneName: bone.name,
        cubeIndex,
        mesh,
        origin: cube.origin,
        size: cube.size,
        uv: cube.uv,
      });
    });
  }

  // === 模型居中：等效旧路径 [8,8,8] centering ===
  // Bedrock geo 的 bone pivot 不以模型中心为原点，需要计算包围盒中心并反向偏移，
  // 否则模型整体偏移、贴近相机，投影后 centerX 偏左。
  // 第一人称路径（disableCentering=true）跳过此步：
  //   TaCZ 源码 BedrockModel.java 没有居中逻辑，marker inverse 读取的是 bone 本地 path，
  //   如果额外平移模型但 marker.position 仍按原始层级算，会导致 idle_view/iron_view 定位错乱。
  let centeringNode = null;
  if (!options.disableCentering) {
    // 性能：用 mesh.getAbsolutePosition() 取 cube 中心世界坐标，避免 refreshBoundingInfo 在 NullEngine 中的开销
    root.computeWorldMatrix(true);
    const min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    const max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
    for (const cube of cubes) {
      cube.mesh.computeWorldMatrix(true);
      const center = cube.mesh.getAbsolutePosition();
      min.x = Math.min(min.x, center.x);
      min.y = Math.min(min.y, center.y);
      min.z = Math.min(min.z, center.z);
      max.x = Math.max(max.x, center.x);
      max.y = Math.max(max.y, center.y);
      max.z = Math.max(max.z, center.z);
    }
    const modelCenter = BABYLON.Vector3.Center(min, max);
    // 转换到 root 本地空间
    const rootInverse = root.getWorldMatrix().clone();
    rootInverse.invert();
    const localCenter = BABYLON.Vector3.TransformCoordinates(modelCenter, rootInverse);
    // 创建居中节点，偏移所有顶层 bone，让模型中心落在 root 原点
    centeringNode = new BABYLON.TransformNode(`${weaponId}-geo-centering`, scene);
    centeringNode.parent = root;
    centeringNode.position.set(-localCenter.x, -localCenter.y, -localCenter.z);
    for (const bone of bones) {
      if (!bone.parent) {
        const node = boneMap.get(bone.name);
        if (node && node.parent === root) {
          node.parent = centeringNode;
        }
      }
    }
  }
  debugGeometry.cubeCount = debugGeometry.cubes.length;

  // debug：高亮指定 bone 的所有 mesh
  const originalMaterials = new Map();
  function highlightBone(name, colorHex = "#ff0000") {
    const node = boneMap.get(name);
    if (!node) return;
    const highlightMat = new BABYLON.StandardMaterial(`${weaponId}-highlight-${name}`, scene);
    highlightMat.emissiveColor = BABYLON.Color3.FromHexString(colorHex);
    highlightMat.backFaceCulling = false;
    // 递归找所有子 mesh
    const meshes = node.getChildMeshes?.(false) ?? [];
    for (const m of meshes) {
      if (!originalMaterials.has(m)) {
        originalMaterials.set(m, m.material);
      }
      m.material = highlightMat;
    }
  }

  function clearHighlights() {
    for (const [mesh, originalMaterial] of originalMaterials.entries()) {
      if (mesh && !mesh.isDisposed?.()) mesh.material = originalMaterial;
    }
    originalMaterials.clear();
  }

  function getBoneWorldMatrix(name) {
    const node = boneMap.get(name);
    if (!node) return null;
    node.computeWorldMatrix(true);
    return node.getWorldMatrix();
  }

  function dispose() {
    root.dispose(false, true);
    material.dispose();
  }

  // 应用 visibilityProfile：隐藏 heldItemBones/shellBones（defaultHiddenBones 已在 cube 渲染时跳过）
  // 只 setEnabled(false) 不删除 bone 节点，动画系统仍可驱动它们
  if (profile) {
    applyVisibilityProfile(boneMap, profile);
  }

  const hiddenProfileBones = new Set([
    ...(profile?.defaultHiddenBones ?? []),
    ...(profile?.heldItemBones ?? []),
    ...(profile?.shellBones ?? []),
  ]);
  finalizeDebugGeometry(debugGeometry, cubes, { boneDataMap, hiddenProfileBones });

  return {
    root,
    boneMap,
    boneDataMap,
    cubes,
    centeringNode,
    textureWidth,
    textureHeight,
    material,
    debugGeometry,
    dispose,
    highlightBone,
    clearHighlights,
    getBoneWorldMatrix,
  };
}
