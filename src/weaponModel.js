import * as BABYLON from "@babylonjs/core";
import { ASSET_PATHS } from "./config.js";
import { colorMaterial } from "./assets.js";
import { isTaczNativeWeapon, loadTaczWeapon } from "./taczWeaponLoader.js";

const FIRST_PERSON_WEAPON_COLORS = {
  m4: "#2c3036",
  ak47: "#4a3a2c",
  awp: "#30343a",
  deagle_golden: "#b8860b",  // 黄金色（黄金沙鹰）
  m95: "#2f2e35",            // 深灰（重型栓动）
  fallback: "#2b2f34",
};

// TaCZ 原生武器枪口 bone 查找优先级
// muzzle_pos 是 TaCZ geo 中标准的枪口位置 bone（deagle/m95 都有）
// muzzle_flash 是枪口火焰 bone，位置略前于 muzzle_pos，作为备选
// muzzle_default 是默认枪口 bone（m95 有）
const TACZ_MUZZLE_BONE_NAMES = ["muzzle_pos", "muzzle_flash", "muzzle_default"];

// ===== 通用 3D 武器模型加载器 =====
// 5 把武器统一走 createWeaponModel，使用 FIRST_PERSON_WEAPON_COLORS 纯色材质。

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
    hands: null,  // 方块手控制器，由 main.js 创建后挂载
    isTaczNative: false,  // TaCZ 原生 geo 标记，由 loadWeaponModel 设置
  };

  loadWeaponModel(scene, root, controller, weaponId, textureMap, onStatus);
  return controller;
}

export function updateWeaponModel(controller, { active, recoil, reloading, reloadProgress, reloadIsEmpty, modelConfig }) {
  if (!controller?.ready) return false;
  controller.root.setEnabled(active);
  if (!active) {
    // 原生武器无 magazinePivot/slidePivot/boltPivot，跳过旧路径归零
    if (!controller.isTaczNative) {
      resetPartPivot(controller.magazinePivot);
      resetPartPivot(controller.slidePivot);
      resetPartPivot(controller.heldMagazinePivot);
      setHeldPartVisible(controller, false);
    }
    return false;
  }
  updateRootTransform(controller.root, { recoil, reloading, reloadProgress, modelConfig });
  updateMuzzleAnchor(controller, modelConfig);
  return true;
}

function resetPartPivot(pivot) {
  if (!pivot) return;
  pivot.position.set(0, 0, 0);
  pivot.rotation.set(0, 0, 0);
}

function applyModelConfig(root, modelConfig) {
  // 优先读 viewTransform（TaCZ 原生路径），fallback 到旧字段（旧 5 把枪兼容）
  const view = modelConfig.viewTransform;
  if (view) {
    root.position.set(view.position[0], view.position[1], view.position[2]);
    root.rotation.set(view.rotation[0], view.rotation[1], view.rotation[2]);
    root.scaling.setAll(view.scale ?? 1.0);
  } else {
    root.position.set(modelConfig.position[0], modelConfig.position[1], modelConfig.position[2]);
    root.rotation.set(modelConfig.rotation[0], modelConfig.rotation[1], modelConfig.rotation[2]);
    root.scaling.setAll(modelConfig.scaling);
  }
}

function updateRootTransform(root, { recoil, reloading, reloadProgress, modelConfig }) {
  // 优先读 viewTransform（TaCZ 原生路径），fallback 到旧字段
  const view = modelConfig.viewTransform;
  const base = view?.position ?? modelConfig.position;
  const baseRot = view?.rotation ?? modelConfig.rotation;
  const rootMotionScale = view?.rootMotionScale ?? 1.0;
  // 换弹下沉/旋转：用正弦曲线 sin(π·progress) 让武器先沉下去再抬起，比静态 0.16 更自然
  // progress=0/1 时 sin=0（基础位），progress=0.5 时 sin=1（最低点）
  const clampedProgress = Math.max(0, Math.min(1, reloadProgress ?? 0));
  const reloadFactor = reloading ? Math.sin(Math.PI * clampedProgress) : 0;
  const reloadDrop = reloadFactor * 0.2 * rootMotionScale;
  const reloadRotX = reloadFactor * 0.15 * rootMotionScale;
  root.position.set(
    base[0] + recoil * 0.07,
    base[1] - recoil * 0.05 - reloadDrop,
    base[2]
  );
  root.rotation.set(
    baseRot[0] - recoil * 0.08 + reloadRotX,
    baseRot[1],
    baseRot[2] - recoil * 0.1
  );
}

function createMuzzleAnchor(scene, root, weaponId, modelConfig) {
  const anchor = new BABYLON.TransformNode(`${weaponId}-muzzle-anchor`, scene);
  anchor.parent = root;
  // 创建时 controller 尚未加载（loadWeaponModel 异步），只能用手填 fallback 值
  // 原生武器加载完成后，由 updateMuzzleAnchor 每帧从 geo bone 重新计算
  setMuzzleAnchorPosition(anchor, modelConfig, null);
  return anchor;
}

function updateMuzzleAnchor(controller, modelConfig) {
  controller.modelConfig = modelConfig;
  setMuzzleAnchorPosition(controller.muzzleAnchor, modelConfig, controller);
}

function setMuzzleAnchorPosition(anchor, modelConfig, controller) {
  // 原生武器：从 geo boneMap 自动计算枪口位置
  // muzzleAnchor.parent = controller.root，weapon.model.root.parent = controller.root
  // 所以 muzzleAnchor 本地坐标 = bone 世界坐标 → controller.root 空间本地坐标
  if (controller?.isTaczNative && controller.taczBoneMap && controller.taczGeoModel?.root) {
    const root = controller.root;
    for (const boneName of TACZ_MUZZLE_BONE_NAMES) {
      const boneNode = controller.taczBoneMap.get(boneName);
      if (!boneNode) continue;
      // 沿父链从顶向下更新所有祖先节点的世界矩阵（包括 camera）
      // getAbsolutePosition() 需要整条链路都是最新的
      const ancestors = [];
      let current = boneNode;
      while (current) {
        ancestors.push(current);
        current = current.parent;
      }
      // 从最顶层祖先（场景根或 camera）向下更新到 boneNode
      for (let i = ancestors.length - 1; i >= 0; i--) {
        ancestors[i].computeWorldMatrix(true);
      }
      const boneWorld = boneNode.getAbsolutePosition();
      const rootMatrix = root.getWorldMatrix().clone();
      rootMatrix.invert();
      const localPos = BABYLON.Vector3.TransformCoordinates(boneWorld, rootMatrix);
      anchor.position.copyFrom(localPos);
      return;
    }
  }
  // fallback：旧武器或未找到 muzzle bone 时用手填值
  const position = modelConfig.muzzleLocalPosition;
  anchor.position.set(position[0], position[1], position[2]);
}

async function loadWeaponModel(scene, root, controller, weaponId, textureMap, onStatus) {
  try {
    // TaCZ 原生 geo 路径：5 把枪走 display.json → Bedrock geo renderer
    if (isTaczNativeWeapon(weaponId)) {
      const weapon = await loadTaczWeapon(weaponId, scene);
      weapon.model.root.parent = root;
      // 位置/旋转/缩放由 firstPersonRig 的 WEAPON_CALIBRATION 控制（Phase 5 迁移）
      // 此处不再硬编码 position/rotation/scaling，避免与 adapter rig 层级冲突
      weapon.model.root.position.set(0, 0, 0);
      weapon.model.root.rotation.set(0, 0, 0);
      weapon.model.root.scaling.setAll(1);
      // 挂载到 controller，供动画系统直接驱动 boneMap
      controller.taczBoneMap = weapon.model.boneMap;
      controller.taczGeoModel = weapon.model;
      controller.taczTransform = weapon.transform;
      controller.ready = true;
      controller.partCount = weapon.model.cubes.length;
      controller.isTaczNative = true;
      controller.source = "tacz-native-geo";
      controller.status = `${weaponId} TaCZ native loaded (${controller.partCount} cubes)`;
      // 方式 A（主方案）：加载完成后立即同步 taczBoneMap/taczGeoModel 到 animationController
      // main.js 行 700 同步创建 animationController，此处异步加载完成时它已存在
      // 不依赖 isActive 和 controller.hands，比方式 B（惰性同步）更可靠
      if (controller.animationController) {
        controller.animationController.taczBoneMap = controller.taczBoneMap;
        controller.animationController.taczGeoModel = controller.taczGeoModel;
      }
      onStatus(controller.status);
      return;
    }

    // 旧路径：buildFirstPersonBlockbenchMesh 扁平 Blockbench elements
    const modelPath = ASSET_PATHS.weaponModels[weaponId];
    if (!modelPath) throw new Error(`No model path for ${weaponId}`);
    const response = await fetch(modelPath);
    if (!response.ok) throw new Error(`Model JSON missing for ${weaponId}`);
    const model = await response.json();

    const reloadParts = controller.modelConfig?.reloadParts;
    const result = buildFirstPersonBlockbenchMesh(model, scene, root, weaponId, reloadParts);
    controller.ready = true;
    controller.partCount = result.partCount;
    controller.magazinePivot = result.magazinePivot;
    controller.slidePivot = result.slidePivot;
    controller.boltPivot = result.boltPivot;
    controller.partRoots = result.partRoots;
    controller.heldMagazinePivot = result.heldMagazinePivot;
    controller.status = `${weaponId} model loaded (${result.partCount} parts)`;
    onStatus(controller.status);
  } catch (error) {
    console.warn(`[${weaponId} 3D] model load failed:`, error);
    controller.failed = true;
    controller.status = `${weaponId} 3D failed`;
    onStatus(controller.status);
  }
}

function buildPartIndexMap(reloadParts) {
  const map = new Map();
  for (const partName of ["magazine", "slide", "bolt"]) {
    const indices = reloadParts?.[partName]?.elementIndices;
    if (!Array.isArray(indices)) continue;
    for (const index of indices) map.set(index, partName);
  }
  return map;
}

export function buildFirstPersonBlockbenchMesh(model, scene, parent, weaponId, reloadParts) {
  const materials = buildMaterialsForWeapon(scene, weaponId);

  const group = new BABYLON.TransformNode(`${weaponId}-first-person-solid-model`, scene);
  group.parent = parent;
  group.position.set(0, -0.06, 0.08);
  group.rotation.set(0, Math.PI, 0);
  group.scaling.setAll(1.05);

  // 创建部件 pivot：弹匣/套筒独立 TransformNode，换弹时移动 pivot 实现部件级动画
  const magazinePivot = reloadParts?.magazine
    ? new BABYLON.TransformNode(`${weaponId}-magazine-pivot`, scene)
    : null;
  if (magazinePivot) {
    magazinePivot.parent = group;
    magazinePivot.position.set(0, 0, 0);
  }
  const slidePivot = reloadParts?.slide
    ? new BABYLON.TransformNode(`${weaponId}-slide-pivot`, scene)
    : null;
  if (slidePivot) {
    slidePivot.parent = group;
    slidePivot.position.set(0, 0, 0);
  }
  const boltPivot = reloadParts?.bolt
    ? new BABYLON.TransformNode(`${weaponId}-bolt-pivot`, scene)
    : null;
  if (boltPivot) {
    boltPivot.parent = group;
    boltPivot.position.set(0, 0, 0);
  }

  const partIndexMap = buildPartIndexMap(reloadParts);
  const partRoots = { magazine: [], slide: [], bolt: [] };
  model.elements.forEach((element, index) => {
    const built = buildSolidElementMesh(element, scene, group, weaponId, index);
    const mesh = built?.mesh;
    if (!mesh) return;
    mesh.material = selectMaterialForElement(element, materials);
    mesh.isPickable = false;
    mesh.renderingGroupId = 2;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.metadata = { elementIndex: index, from: element.from, to: element.to };

    const partName = partIndexMap.get(index);
    if (partName === "magazine" && magazinePivot) {
      built.transformRoot.parent = magazinePivot;
      built.transformRoot.metadata = { ...(built.transformRoot.metadata ?? {}), reloadPart: "magazine", elementIndex: index };
      partRoots.magazine.push(built.transformRoot);
    } else if (partName === "slide" && slidePivot) {
      built.transformRoot.parent = slidePivot;
      built.transformRoot.metadata = { ...(built.transformRoot.metadata ?? {}), reloadPart: "slide", elementIndex: index };
      partRoots.slide.push(built.transformRoot);
    } else if (partName === "bolt" && boltPivot) {
      built.transformRoot.parent = boltPivot;
      built.transformRoot.metadata = { ...(built.transformRoot.metadata ?? {}), reloadPart: "bolt", elementIndex: index };
      partRoots.bolt.push(built.transformRoot);
    }
  });
  const heldMagazinePivot = createHeldPartPivot(scene, group, weaponId, "magazine", partRoots.magazine);
  return { partCount: model.elements.length, magazinePivot, slidePivot, boltPivot, partRoots, heldMagazinePivot };
}

function createHeldPartPivot(scene, parent, weaponId, partName, sourceRoots) {
  const pivot = new BABYLON.TransformNode(`${weaponId}-held-${partName}-pivot`, scene);
  pivot.parent = parent;
  pivot.setEnabled(false);
  if (sourceRoots?.length) {
    sourceRoots.forEach((sourceRoot, index) => {
      const clone = sourceRoot.clone(`${weaponId}-held-${partName}-${index}`, pivot, true);
      if (clone) {
        clone.parent = pivot;
        clone.setEnabled(true);
        for (const mesh of clone.getChildMeshes?.(false) ?? []) {
          mesh.isPickable = false;
          mesh.renderingGroupId = 2;
        }
      }
    });
  } else {
    const fallback = BABYLON.MeshBuilder.CreateBox(`${weaponId}-held-${partName}-body`, { width: 0.13, height: 0.28, depth: 0.08 }, scene);
    fallback.parent = pivot;
    fallback.material = colorMaterial(scene, "#17191b", { emissive: BABYLON.Color3.FromHexString("#030303") });
    fallback.isPickable = false;
    fallback.renderingGroupId = 2;
  }
  return pivot;
}

export function setReloadPartVisible(controller, partName, visible) {
  const roots = controller?.partRoots?.[partName] ?? [];
  roots.forEach((root) => root.setEnabled?.(visible));
}

export function setHeldPartVisible(controller, visible) {
  controller?.heldMagazinePivot?.setEnabled(Boolean(visible));
}

// 按武器构建材质映射：单色 base + accent 双色
function buildMaterialsForWeapon(scene, weaponId) {
  const baseColor = FIRST_PERSON_WEAPON_COLORS[weaponId] ?? FIRST_PERSON_WEAPON_COLORS.fallback;
  return {
    base: colorMaterial(scene, baseColor, { emissive: BABYLON.Color3.FromHexString("#070808") }),
    accent: colorMaterial(scene, "#151719", { emissive: BABYLON.Color3.FromHexString("#030303") }),
  };
}

// 按尺寸选 base/accent 材质
function selectMaterialForElement(element, materials) {
  return shouldUseAccentMaterial(element) ? materials.accent : materials.base;
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
    return { mesh, transformRoot: pivot };
  } else {
    mesh.parent = parent;
    mesh.position.set(
      (cx - 8) / 16,
      (cy - 8) / 16,
      (cz - 8) / 16
    );
  }
  return { mesh, transformRoot: mesh };
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
  // group 基准变换：略微下移前移，Y 轴 180° 翻转朝向相机
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

  // rotation 处理：Blockbench element 旋转 pivot 方案
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
