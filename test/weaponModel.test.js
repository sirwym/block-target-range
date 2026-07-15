import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { buildBlockbenchMesh } from "../src/weaponModel.js";

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
