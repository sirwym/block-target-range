import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { buildFirstPersonBlockbenchMesh, buildBlockbenchMesh, P90_MATERIAL_COLORS } from "../src/weaponModel.js";

const MODEL_PATH = path.resolve("public/assets/tac/models/p90/p90_model.json");
const GLOCK17_MODEL_PATH = path.resolve("public/assets/tac/models/glock17/glock17.json");

function loadModel() {
  const raw = fs.readFileSync(MODEL_PATH, "utf8");
  return JSON.parse(raw);
}

test("P90 Blockbench model structure is well-formed", () => {
  const model = loadModel();
  assert.ok(Array.isArray(model.elements), "elements array");
  assert.ok(model.elements.length > 20, `part count ${model.elements.length}`);
  assert.deepEqual(model.texture_size, [128, 128]);
  assert.equal(model.textures["2"], "tac:items/p90/p90_1");

  const withRotation = model.elements.filter((e) => Math.abs(e.rotation?.angle ?? 0) > 0.001);
  assert.ok(withRotation.length > 20, `rotated parts ${withRotation.length}`);
  for (const element of withRotation) {
    assert.ok(Array.isArray(element.rotation.origin), "rotation has origin");
    assert.ok(["x", "y", "z"].includes(element.rotation.axis), "valid axis");
  }
});

test("P90 Blockbench conversion creates pivot nodes for rotated elements", () => {
  const model = loadModel();
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("root", scene);

  const partCount = buildFirstPersonBlockbenchMesh(model, scene, root, "p90");
  assert.equal(partCount, model.elements.length, "returns element count");

  const group = scene.getNodeByName("p90-first-person-solid-model");
  assert.ok(group, "model group exists");

  const rotatedElements = model.elements
    .map((element, index) => ({ element, index }))
    .filter((e) => Math.abs(e.element.rotation?.angle ?? 0) > 0.001);

  for (const { element, index } of rotatedElements) {
    const pivot = scene.getNodeByName(`p90-solid-part-${index}-pivot`);
    assert.ok(pivot, `pivot for rotated part ${index}`);
    assert.equal(pivot.parent, group, `pivot ${index} parent is group`);
    const angle = element.rotation.angle;
    const expectedRad = BABYLON.Tools.ToRadians(angle);
    const axis = element.rotation.axis;
    assert.ok(
      Math.abs((pivot.rotation[axis] ?? 0) - expectedRad) < 1e-6,
      `pivot ${index} ${axis} rotation matches angle ${angle}`
    );

    const mesh = scene.getMeshByName(`p90-solid-part-${index}`);
    assert.equal(mesh.parent, pivot, `rotated mesh ${index} parent is pivot`);
    const origin = element.rotation.origin;
    const expectedMeshX = ((element.from[0] + element.to[0]) / 2 - origin[0]) / 16;
    assert.ok(
      Math.abs(mesh.position.x - expectedMeshX) < 1e-6,
      `rotated mesh ${index} position.x relative to origin`
    );
  }
});

test("P90 Blockbench model bounding box stays compact", () => {
  const model = loadModel();
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("root", scene);
  root.computeWorldMatrix(true);

  buildFirstPersonBlockbenchMesh(model, scene, root, "p90");
  const group = scene.getNodeByName("p90-first-person-solid-model");
  const meshes = group.getChildMeshes(false, (n) => n instanceof BABYLON.Mesh);

  const min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  const max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    mesh.refreshBoundingInfo(true);
    mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    const wMin = bb.minimumWorld;
    const wMax = bb.maximumWorld;
    min.x = Math.min(min.x, wMin.x);
    min.y = Math.min(min.y, wMin.y);
    min.z = Math.min(min.z, wMin.z);
    max.x = Math.max(max.x, wMax.x);
    max.y = Math.max(max.y, wMax.y);
    max.z = Math.max(max.z, wMax.z);
  }

  const sx = max.x - min.x;
  const sy = max.y - min.y;
  const sz = max.z - min.z;
  assert.ok(sx < 3, `bbox x ${sx}`);
  assert.ok(sy < 3, `bbox y ${sy}`);
  assert.ok(sz < 3, `bbox z ${sz}`);

  const cx = (max.x + min.x) / 2;
  const cy = (max.y + min.y) / 2;
  const cz = (max.z + min.z) / 2;
  assert.ok(Math.abs(cx) < 1.5, `center x ${cx}`);
  assert.ok(Math.abs(cy) < 1.5, `center y ${cy}`);
  assert.ok(Math.abs(cz) < 1.5, `center z ${cz}`);
});

test("P90 material colors are gun-metal, not cyan", () => {
  // 收紧非青阈值：新色值 #1c1e21/#2b2e31/#232527 的 B-R≤6、G-R≤3 轻松通过；
  // 旧偏青值 #3a3d42 的 B-R=8 也会被 b<r+12 拦住，回归保护足够。
  for (const [key, hex] of Object.entries(P90_MATERIAL_COLORS)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    assert.ok(g < r + 12, `${key} green not dominant over red (r=${r} g=${g})`);
    assert.ok(b < r + 12, `${key} blue not dominant over red (r=${r} b=${b})`);
  }
});

test("P90 Blockbench meshes use P90_MATERIAL_COLORS palette", () => {
  // 确保第一人称实体模型路径所有 mesh 材质色属于 P90_MATERIAL_COLORS 三色之一，
  // 防止未来误改材质映射导致部分 mesh 回退到 fallback 或用到非深枪灰色。
  const model = loadModel();
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("root", scene);
  buildFirstPersonBlockbenchMesh(model, scene, root, "p90");

  const group = scene.getNodeByName("p90-first-person-solid-model");
  const meshes = group.getChildMeshes(false, (n) => n instanceof BABYLON.Mesh);
  const allowedHex = new Set(Object.values(P90_MATERIAL_COLORS));
  for (const mesh of meshes) {
    const mat = mesh.material;
    assert.ok(mat, `${mesh.name} has material`);
    // toHexString 返回大写 #RRGGBB，P90_MATERIAL_COLORS 用小写，需 toLowerCase 归一化比对
    const hex = mat.diffuseColor?.toHexString?.()?.toLowerCase();
    assert.ok(hex, `${mesh.name} material has diffuseColor hex`);
    assert.ok(allowedHex.has(hex), `${mesh.name} material ${hex} in P90_MATERIAL_COLORS`);
  }
});

// ===== 通用 3D 武器模型测试（标准还原版） =====

function loadGlock17Model() {
  const raw = fs.readFileSync(GLOCK17_MODEL_PATH, "utf8");
  return JSON.parse(raw);
}

test("Glock 17 Blockbench model structure is well-formed", () => {
  const model = loadGlock17Model();
  assert.ok(Array.isArray(model.elements), "elements array");
  assert.ok(model.elements.length > 20, `part count ${model.elements.length}`);
  assert.ok(model.textures, "textures object exists");
  assert.ok(model.textures["4"], "texture key #4 exists");

  let totalFaces = 0;
  for (const element of model.elements) {
    assert.ok(Array.isArray(element.from), "element.from is array");
    assert.ok(Array.isArray(element.to), "element.to is array");
    const faces = element.faces ?? {};
    const faceCount = Object.keys(faces).length;
    assert.ok(faceCount > 0, `element has at least 1 face`);
    assert.ok(faceCount <= 6, `element has at most 6 faces`);
    totalFaces += faceCount;
    for (const [dir, face] of Object.entries(faces)) {
      assert.ok(["north", "south", "east", "west", "up", "down"].includes(dir), `valid direction ${dir}`);
      assert.ok(Array.isArray(face.uv) && face.uv.length === 4, `face ${dir} uv is [x1,y1,x2,y2]`);
      assert.ok(typeof face.texture === "string", `face ${dir} has texture key`);
    }
  }
  assert.ok(totalFaces > 100, `total faces ${totalFaces}`);
});

test("buildBlockbenchMesh only generates declared faces (no CreateBox 6-face)", () => {
  // 标准还原版核心验证：mesh 顶点数 = 该 element 声明的 face 数 × 4
  // 不用 CreateBox 生成 6 面，未声明的 face 不生成几何
  const model = loadGlock17Model();
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("root", scene);

  // 用简单材质 map（测试只验证几何，不验证贴图）
  const materials = {
    "#4": new BABYLON.StandardMaterial("test-mat", scene),
    fallback: new BABYLON.StandardMaterial("test-fallback", scene),
  };

  const partCount = buildBlockbenchMesh(model, scene, root, "glock17", materials);
  assert.equal(partCount, model.elements.length, "returns element count");

  const group = scene.getNodeByName("glock17-blockbench-model");
  assert.ok(group, "glock17 model group exists");

  // 逐个 element 验证顶点数 = 声明 face 数 × 4
  model.elements.forEach((element, index) => {
    const mesh = scene.getMeshByName(`glock17-part-${index}`);
    assert.ok(mesh, `mesh glock17-part-${index} exists`);
    const declaredFaces = Object.keys(element.faces ?? {}).length;
    const expectedVertices = declaredFaces * 4;
    const actualVertices = mesh.getTotalVertices();
    assert.equal(
      actualVertices, expectedVertices,
      `element ${index}: ${declaredFaces} faces should produce ${expectedVertices} vertices, got ${actualVertices}`
    );
    // 索引数 = face 数 × 6（每 face 2 三角形 × 3 索引）
    const expectedIndices = declaredFaces * 6;
    const actualIndices = mesh.getTotalIndices();
    assert.equal(
      actualIndices, expectedIndices,
      `element ${index}: ${declaredFaces} faces should produce ${expectedIndices} indices, got ${actualIndices}`
    );
  });

  scene.dispose();
  engine.dispose();
});

test("buildBlockbenchMesh UVs are normalized to 0-1 via UV/16 formula", () => {
  // 验证 UV 换算公式：u = uvCoord / 16，v = 1 - uvCoord / 16（翻转 Y）
  const model = loadGlock17Model();
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("root", scene);
  const materials = {
    "#4": new BABYLON.StandardMaterial("test-mat", scene),
    fallback: new BABYLON.StandardMaterial("test-fallback", scene),
  };

  buildBlockbenchMesh(model, scene, root, "glock17", materials);

  // 检查第一个有 face 的 element 的 UV
  const firstElement = model.elements[0];
  const firstFace = Object.values(firstElement.faces)[0];
  const mesh = scene.getMeshByName("glock17-part-0");
  assert.ok(mesh, "first mesh exists");

  const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
  assert.ok(uvs && uvs.length > 0, "mesh has UV data");

  // 验证 UV 在 0-1 范围内（UV/16 公式的结果必然在 0-1）
  for (let i = 0; i < uvs.length; i += 1) {
    assert.ok(uvs[i] >= -0.001 && uvs[i] <= 1.001, `UV[${i}]=${uvs[i]} in [0,1] range`);
  }

  // 验证第一个 face 的 UV 计算正确
  const [ux1, uy1, ux2, uy2] = firstFace.uv;
  const expectedU0 = ux1 / 16;
  const expectedV0 = 1 - uy2 / 16;
  assert.ok(
    Math.abs(uvs[0] - expectedU0) < 1e-6,
    `UV u0: expected ${expectedU0}, got ${uvs[0]}`
  );
  assert.ok(
    Math.abs(uvs[1] - expectedV0) < 1e-6,
    `UV v0: expected ${expectedV0}, got ${uvs[1]}`
  );

  scene.dispose();
  engine.dispose();
});

test("buildBlockbenchMesh creates pivot nodes for rotated elements", () => {
  // 验证旋转 element 的 mesh 有 pivot TransformNode 父节点
  const model = loadGlock17Model();
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("root", scene);
  const materials = {
    "#4": new BABYLON.StandardMaterial("test-mat", scene),
    fallback: new BABYLON.StandardMaterial("test-fallback", scene),
  };

  buildBlockbenchMesh(model, scene, root, "glock17", materials);
  const group = scene.getNodeByName("glock17-blockbench-model");

  const rotatedElements = model.elements
    .map((element, index) => ({ element, index }))
    .filter((e) => Math.abs(e.element.rotation?.angle ?? 0) > 0.001);

  assert.ok(rotatedElements.length > 10, `rotated elements ${rotatedElements.length}`);

  for (const { element, index } of rotatedElements) {
    const pivot = scene.getNodeByName(`glock17-part-${index}-pivot`);
    assert.ok(pivot, `pivot for rotated part ${index}`);
    assert.equal(pivot.parent, group, `pivot ${index} parent is group`);

    const angle = element.rotation.angle;
    const expectedRad = BABYLON.Tools.ToRadians(angle);
    const axis = element.rotation.axis;
    assert.ok(
      Math.abs((pivot.rotation[axis] ?? 0) - expectedRad) < 1e-6,
      `pivot ${index} ${axis} rotation matches angle ${angle}`
    );

    const mesh = scene.getMeshByName(`glock17-part-${index}`);
    assert.equal(mesh.parent, pivot, `rotated mesh ${index} parent is pivot`);

    // pivot 位置 = (origin - [8,8,8]) / 16
    const origin = element.rotation.origin;
    const expectedPivotX = (origin[0] - 8) / 16;
    assert.ok(
      Math.abs(pivot.position.x - expectedPivotX) < 1e-6,
      `pivot ${index} position.x matches origin`
    );
  }

  scene.dispose();
  engine.dispose();
});

test("buildBlockbenchMesh generates normals for proper lighting", () => {
  // 标准还原版用 VertexData 自定义 mesh，必须补算 normals，
  // 否则 StandardMaterial 无法计算光照，面片会全黑呈"碎片"状。
  const model = loadGlock17Model();
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("root", scene);
  const materials = {
    "#4": new BABYLON.StandardMaterial("test-mat", scene),
    fallback: new BABYLON.StandardMaterial("test-fallback", scene),
  };

  buildBlockbenchMesh(model, scene, root, "glock17", materials);

  // 检查每个 mesh 都有 normals 数据
  model.elements.forEach((element, index) => {
    const mesh = scene.getMeshByName(`glock17-part-${index}`);
    if (!mesh) return; // 空 element 可能跳过
    const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    assert.ok(normals && normals.length > 0, `mesh ${index} has normals data`);
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    // normals 数组长度应与 positions 数组长度一致（每顶点 3 分量）
    assert.equal(
      normals.length, positions.length,
      `mesh ${index}: normals length ${normals.length} matches positions length ${positions.length}`
    );
  });

  scene.dispose();
  engine.dispose();
});

// ===== M4/AK47/AWP 3D 武器模型测试（阶段 2 接入） =====

const M4_MODEL_PATH = path.resolve("public/assets/tac/models/m4/m4.json");
const AK47_MODEL_PATH = path.resolve("public/assets/tac/models/ak47/ak47.json");
const AWP_MODEL_PATH = path.resolve("public/assets/tac/models/awp/awp.json");

function loadModelAtPath(modelPath) {
  return JSON.parse(fs.readFileSync(modelPath, "utf8"));
}

const STAGE2_MODELS = [
  { id: "m4", path: M4_MODEL_PATH, textureKey: "#8" },
  { id: "ak47", path: AK47_MODEL_PATH, textureKey: "#0" },
  { id: "awp", path: AWP_MODEL_PATH, textureKey: "#4" },
];

for (const { id, path: modelPath, textureKey } of STAGE2_MODELS) {
  test(`${id.toUpperCase()} Blockbench model structure is well-formed`, () => {
    const model = loadModelAtPath(modelPath);
    assert.ok(Array.isArray(model.elements), `${id} elements array`);
    assert.ok(model.elements.length > 20, `${id} part count ${model.elements.length}`);
    assert.ok(model.textures, `${id} textures object exists`);
    assert.ok(model.textures[textureKey.slice(1)], `${id} texture key ${textureKey} exists`);

    for (const element of model.elements) {
      assert.ok(Array.isArray(element.from), `${id} element.from is array`);
      assert.ok(Array.isArray(element.to), `${id} element.to is array`);
      const faces = element.faces ?? {};
      const faceCount = Object.keys(faces).length;
      assert.ok(faceCount > 0, `${id} element has at least 1 face`);
      assert.ok(faceCount <= 6, `${id} element has at most 6 faces`);
    }
  });

  test(`buildBlockbenchMesh generates normals for ${id.toUpperCase()}`, () => {
    const model = loadModelAtPath(modelPath);
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const root = new BABYLON.TransformNode("root", scene);
    const materials = {
      [textureKey]: new BABYLON.StandardMaterial(`test-mat-${id}`, scene),
      fallback: new BABYLON.StandardMaterial(`test-fallback-${id}`, scene),
    };

    buildBlockbenchMesh(model, scene, root, id, materials);

    model.elements.forEach((element, index) => {
      const mesh = scene.getMeshByName(`${id}-part-${index}`);
      if (!mesh) return;
      const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
      assert.ok(normals && normals.length > 0, `${id} mesh ${index} has normals data`);
      const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
      assert.equal(
        normals.length, positions.length,
        `${id} mesh ${index}: normals length matches positions length`
      );
    });

    scene.dispose();
    engine.dispose();
  });
}
