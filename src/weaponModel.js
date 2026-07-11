import * as BABYLON from "@babylonjs/core";
import { ASSET_PATHS } from "./config.js";
import { colorMaterial } from "./assets.js";

const FIRST_PERSON_WEAPON_COLORS = {
  glock17: "#24272b",
  m4: "#2c3036",
  ak47: "#4a3a2c",
  awp: "#30343a",
  p90: "#232527",
  fallback: "#2b2f34",
};

// P90 杪质色值刻意走中性深枪灰/黑灰金属色（R≈G≈B 略偏冷）。
// 旧值 #3a3d42 / #2a2d33 蓝分量偏大，叠加 createSkyTexture 的蓝色天光后整体显青，
// 这里压低蓝分量确保最终呈现深枪灰而非青色。改动需同步 test/weaponModel.test.js 的非青阈值。
export const P90_MATERIAL_COLORS = {
  "#2": "#1c1e21",
  "#3": "#2b2e31",
  fallback: "#232527",
};

// ===== 通用 3D 武器模型加载器 =====
// 5 把武器统一走 createWeaponModel，P90 保留多色材质（按 texture key 选 P90_MATERIAL_COLORS）。

export function createWeaponModel(scene, camera, weaponId, modelConfig, textureMap, onStatus = () => {}) {
  const root = new BABYLON.TransformNode(`${weaponId}-first-person-root`, scene);
  root.parent = camera;
  applyModelConfig(root, modelConfig);
  root.setEnabled(false);
  const muzzleAnchor = createMuzzleAnchor(scene, root, weaponId, modelConfig);

  const controller = {
    root,
    muzzleAnchor,
    ready: false,
    failed: false,
    weaponId,
    partCount: 0,
    status: "loading",
    modelConfig,
  };

  loadWeaponModel(scene, root, controller, weaponId, textureMap, onStatus);
  return controller;
}

export function updateWeaponModel(controller, { active, recoil, reloading, modelConfig }) {
  if (!controller?.ready) return false;
  controller.root.setEnabled(active);
  if (!active) return false;
  updateRootTransform(controller.root, { recoil, reloading, modelConfig });
  updateMuzzleAnchor(controller, modelConfig);
  return true;
}

function applyModelConfig(root, modelConfig) {
  root.position.set(modelConfig.position[0], modelConfig.position[1], modelConfig.position[2]);
  root.rotation.set(modelConfig.rotation[0], modelConfig.rotation[1], modelConfig.rotation[2]);
  root.scaling.setAll(modelConfig.scaling);
}

function updateRootTransform(root, { recoil, reloading, modelConfig }) {
  const base = modelConfig.position;
  const baseRot = modelConfig.rotation;
  const reloadDrop = reloading ? 0.16 : 0;
  root.position.set(
    base[0] + recoil * 0.07,
    base[1] - recoil * 0.05 - reloadDrop,
    base[2]
  );
  root.rotation.set(
    baseRot[0] - recoil * 0.08 + (reloading ? 0.12 : 0),
    baseRot[1],
    baseRot[2] - recoil * 0.1
  );
}

function createMuzzleAnchor(scene, root, weaponId, modelConfig) {
  const anchor = new BABYLON.TransformNode(`${weaponId}-muzzle-anchor`, scene);
  anchor.parent = root;
  setMuzzleAnchorPosition(anchor, modelConfig);
  return anchor;
}

function updateMuzzleAnchor(controller, modelConfig) {
  controller.modelConfig = modelConfig;
  setMuzzleAnchorPosition(controller.muzzleAnchor, modelConfig);
}

function setMuzzleAnchorPosition(anchor, modelConfig) {
  const position = modelConfig.muzzleLocalPosition;
  anchor.position.set(position[0], position[1], position[2]);
}

async function loadWeaponModel(scene, root, controller, weaponId, textureMap, onStatus) {
  try {
    const modelPath = ASSET_PATHS.weaponModels[weaponId];
    if (!modelPath) throw new Error(`No model path for ${weaponId}`);
    const response = await fetch(modelPath);
    if (!response.ok) throw new Error(`Model JSON missing for ${weaponId}`);
    const model = await response.json();

    const partCount = buildFirstPersonBlockbenchMesh(model, scene, root, weaponId);
    controller.ready = true;
    controller.partCount = partCount;
    controller.status = `${weaponId} model loaded (${partCount} parts)`;
    onStatus(controller.status);
  } catch (error) {
    console.warn(`[${weaponId} 3D] model load failed:`, error);
    controller.failed = true;
    controller.status = `${weaponId} 3D failed`;
    onStatus(controller.status);
  }
}

export function buildFirstPersonBlockbenchMesh(model, scene, parent, weaponId) {
  const materials = buildMaterialsForWeapon(scene, weaponId);

  const group = new BABYLON.TransformNode(`${weaponId}-first-person-solid-model`, scene);
  group.parent = parent;
  group.position.set(0, -0.06, 0.08);
  group.rotation.set(0, Math.PI, 0);
  group.scaling.setAll(1.05);

  model.elements.forEach((element, index) => {
    const mesh = buildSolidElementMesh(element, scene, group, weaponId, index);
    if (!mesh) return;
    mesh.material = selectMaterialForElement(element, materials, weaponId);
    mesh.isPickable = false;
    mesh.renderingGroupId = 2;
    mesh.alwaysSelectAsActiveMesh = true;
  });
  return model.elements.length;
}

// 按武器构建材质映射：P90 多色（#2/#3/fallback），其他武器单色 + accent 双色
function buildMaterialsForWeapon(scene, weaponId) {
  if (weaponId === "p90") {
    return {
      "#2": colorMaterial(scene, P90_MATERIAL_COLORS["#2"], { emissive: BABYLON.Color3.FromHexString("#050806") }),
      "#3": colorMaterial(scene, P90_MATERIAL_COLORS["#3"], { emissive: BABYLON.Color3.FromHexString("#080909") }),
      fallback: colorMaterial(scene, P90_MATERIAL_COLORS.fallback, { emissive: BABYLON.Color3.FromHexString("#060606") }),
    };
  }
  const baseColor = FIRST_PERSON_WEAPON_COLORS[weaponId] ?? FIRST_PERSON_WEAPON_COLORS.fallback;
  return {
    base: colorMaterial(scene, baseColor, { emissive: BABYLON.Color3.FromHexString("#070808") }),
    accent: colorMaterial(scene, "#151719", { emissive: BABYLON.Color3.FromHexString("#030303") }),
  };
}

// P90 按 element texture key 选多色材质；其他武器按尺寸选 base/accent
function selectMaterialForElement(element, materials, weaponId) {
  if (weaponId === "p90") {
    return materials[getElementTextureKey(element)] ?? materials.fallback;
  }
  return shouldUseAccentMaterial(element) ? materials.accent : materials.base;
}

function getElementTextureKey(element) {
  const face = Object.values(element.faces ?? {})[0];
  return face?.texture ?? "fallback";
}

function buildSolidElementMesh(element, scene, parent, weaponId, index) {
  const from = element.from;
  const to = element.to;
  const width = Math.max(0.006, (to[0] - from[0]) / 16);
  const height = Math.max(0.006, (to[1] - from[1]) / 16);
  const depth = Math.max(0.006, (to[2] - from[2]) / 16);
  const mesh = BABYLON.MeshBuilder.CreateBox(`${weaponId}-solid-part-${index}`, { width, height, depth }, scene);

  const cx = (from[0] + to[0]) / 2;
  const cy = (from[1] + to[1]) / 2;
  const cz = (from[2] + to[2]) / 2;
  const rotation = element.rotation;
  const angle = rotation?.angle ?? 0;
  const hasRotation = Math.abs(angle) > 0.001;

  if (hasRotation) {
    const origin = rotation.origin;
    const pivot = new BABYLON.TransformNode(`${weaponId}-solid-part-${index}-pivot`, scene);
    pivot.parent = parent;
    pivot.position.set(
      (origin[0] - 8) / 16,
      (origin[1] - 8) / 16,
      (origin[2] - 8) / 16
    );
    const rad = BABYLON.Tools.ToRadians(angle);
    if (rotation.axis === "x") pivot.rotation.x = rad;
    else if (rotation.axis === "y") pivot.rotation.y = rad;
    else if (rotation.axis === "z") pivot.rotation.z = rad;
    mesh.parent = pivot;
    mesh.position.set(
      (cx - origin[0]) / 16,
      (cy - origin[1]) / 16,
      (cz - origin[2]) / 16
    );
  } else {
    mesh.parent = parent;
    mesh.position.set(
      (cx - 8) / 16,
      (cy - 8) / 16,
      (cz - 8) / 16
    );
  }
  return mesh;
}

function shouldUseAccentMaterial(element) {
  const width = Math.abs(element.to[0] - element.from[0]);
  const height = Math.abs(element.to[1] - element.from[1]);
  const depth = Math.abs(element.to[2] - element.from[2]);
  return Math.min(width, height, depth) <= 0.35;
}

export function buildBlockbenchMesh(model, scene, parent, weaponId, materials) {
  const group = new BABYLON.TransformNode(`${weaponId}-blockbench-model`, scene);
  group.parent = parent;
  // group 基准变换与 P90 保持一致：略微下移前移，Y 轴 180° 翻转朝向相机
  group.position.set(0, -0.06, 0.08);
  group.rotation.set(0, Math.PI, 0);
  group.scaling.setAll(1.05);

  model.elements.forEach((element, index) => {
    buildElementMesh(element, scene, group, weaponId, index, materials);
  });
  return model.elements.length;
}

function buildElementMesh(element, scene, parent, weaponId, index, materials) {
  const from = element.from;
  const to = element.to;
  const faces = element.faces ?? {};

  const positions = [];
  const uvs = [];
  const indices = [];
  let vertexOffset = 0;

  // element 中心（Minecraft 坐标，用于计算顶点相对偏移）
  const cx = (from[0] + to[0]) / 2;
  const cy = (from[1] + to[1]) / 2;
  const cz = (from[2] + to[2]) / 2;

  // 只遍历 element.faces 中真实声明的方向，未声明的面不生成几何
  const directions = ["north", "south", "east", "west", "up", "down"];
  for (const dir of directions) {
    const face = faces[dir];
    if (!face) continue;

    const verts = faceDirectionVertices(dir, from, to, cx, cy, cz);
    for (const v of verts) {
      positions.push(v[0], v[1], v[2]);
    }

    // UV 换算：Blockbench UV 坐标以 16 为单位（Minecraft 标准方块像素）。
    // 经贴图像素分布验证，texture_size 字段不可靠（M4 标 256 但贴图 512），
    // 始终除以 16 才正确。翻转 Y 轴因 Babylon UV 原点在左下，Blockbench 在左上。
    const uv = face.uv;
    const u0 = uv[0] / 16;
    const v0 = 1 - uv[3] / 16;
    const u1 = uv[2] / 16;
    const v1 = 1 - uv[1] / 16;
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);

    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
    indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 3);
    vertexOffset += 4;
  }

  if (positions.length === 0) return null;

  // 用 VertexData 构建 mesh，只含声明的 face，不用 CreateBox
  const mesh = new BABYLON.Mesh(`${weaponId}-part-${index}`, scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.uvs = uvs;
  // 标准还原版用 VertexData 自定义 mesh，必须补算 normals，
  // 否则 StandardMaterial 无法计算光照，面片会全黑呈"碎片"状。
  const normals = [];
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh);

  // 材质：取第一个面的 texture 键（大多数 element 所有面用同一纹理键）
  const firstFace = Object.values(faces)[0];
  const textureKey = firstFace?.texture ?? "fallback";
  mesh.material = materials[textureKey] ?? materials.fallback;

  // rotation 处理：复用 P90 已验证的 pivot 方案
  const rotation = element.rotation;
  const angle = rotation?.angle ?? 0;
  const hasRotation = Math.abs(angle) > 0.001;

  if (hasRotation) {
    const origin = rotation.origin;
    // Minecraft 模型中心在 [8,8,8]，pivot 位置需减去中心
    const pivot = new BABYLON.TransformNode(`${weaponId}-part-${index}-pivot`, scene);
    pivot.parent = parent;
    pivot.position.set(
      (origin[0] - 8) / 16,
      (origin[1] - 8) / 16,
      (origin[2] - 8) / 16
    );
    const rad = BABYLON.Tools.ToRadians(angle);
    if (rotation.axis === "x") pivot.rotation.x = rad;
    else if (rotation.axis === "y") pivot.rotation.y = rad;
    else if (rotation.axis === "z") pivot.rotation.z = rad;
    mesh.parent = pivot;
    // mesh 位置 = element 中心相对 origin 的偏移
    mesh.position.set(
      (cx - origin[0]) / 16,
      (cy - origin[1]) / 16,
      (cz - origin[2]) / 16
    );
  } else {
    mesh.parent = parent;
    mesh.position.set(
      (cx - 8) / 16,
      (cy - 8) / 16,
      (cz - 8) / 16
    );
  }

  mesh.isPickable = false;
  mesh.renderingGroupId = 2;
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}

// Blockbench face 方向 → 4 顶点坐标（相对于 element 中心，已除以 16 转 Babylon 单位）
// 顶点顺序遵循逆时针（从外侧看），保证面法线朝外。
function faceDirectionVertices(direction, from, to, cx, cy, cz) {
  const x1 = (from[0] - cx) / 16;
  const x2 = (to[0] - cx) / 16;
  const y1 = (from[1] - cy) / 16;
  const y2 = (to[1] - cy) / 16;
  const z1 = (from[2] - cz) / 16;
  const z2 = (to[2] - cz) / 16;

  switch (direction) {
    case "north": // -Z, z = from[2]
      return [[x1, y1, z1], [x2, y1, z1], [x2, y2, z1], [x1, y2, z1]];
    case "south": // +Z, z = to[2]
      return [[x2, y1, z2], [x1, y1, z2], [x1, y2, z2], [x2, y2, z2]];
    case "east": // +X, x = to[0]
      return [[x2, y1, z2], [x2, y1, z1], [x2, y2, z1], [x2, y2, z2]];
    case "west": // -X, x = from[0]
      return [[x1, y1, z1], [x1, y1, z2], [x1, y2, z2], [x1, y2, z1]];
    case "up": // +Y, y = to[1]
      return [[x1, y2, z2], [x2, y2, z2], [x2, y2, z1], [x1, y2, z1]];
    case "down": // -Y, y = from[1]
      return [[x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2]];
    default:
      return [];
  }
}
