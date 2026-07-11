import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import { createBox } from "../src/assets.js";
import { createCreeperTarget, createZombieTarget, spawnTarget } from "../src/actors.js";

test("Babylon enemy skin boxes and combat picking stay aligned", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 5), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);
  const blockTexture = rawTexture(scene, [100, 100, 100, 255]);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    initial: false,
    options: { forceCreeper: false },
    nextLaneIndex: () => 1,
  });

  target.allParts.forEach((part) => {
    assert.equal(part.getVerticesData(BABYLON.VertexBuffer.UVKind).length, 48, part.name);
    assert.equal(part.isPickable, true, part.name);
    assert.equal(Boolean(part.metadata?.target), true, part.name);
    assert.equal(part.material.subMaterials.length, 6, part.name);
  });
  assert.equal(target.parts.head.metadata.hitType, "head");
  assert.equal(target.parts.body.metadata.hitType, "body");
  assert.equal(target.group.metadata.maxHealth, 3);
  assert.equal(target.group.metadata.health, 3);

  refreshWorldMatrices(scene);
  const headPick = pickFromFront(scene, target.parts.head.getAbsolutePosition());
  assert.equal(headPick.hit, true);
  assert.equal(headPick.pickedMesh.metadata.hitType, "head");
  assert.equal(headPick.pickedMesh.metadata.target === target, true);

  const bodyPick = pickFromFront(scene, target.parts.body.getAbsolutePosition());
  assert.equal(bodyPick.hit, true);
  assert.equal(bodyPick.pickedMesh.metadata.hitType, "body");
  assert.equal(bodyPick.pickedMesh.metadata.target === target, true);

  const headCenter = target.parts.head.getAbsolutePosition();
  const block = createBox(scene, "blocking-cube", 1.2, 1.2, 1.2, blockTexture);
  block.position.set(headCenter.x, headCenter.y, headCenter.z + 2.2);
  block.metadata = { solid: true };
  refreshWorldMatrices(scene);
  const blockedPick = pickFromFront(scene, headCenter);
  assert.equal(blockedPick.hit, true);
  assert.equal(blockedPick.pickedMesh.name, block.name);

  scene.dispose();
  engine.dispose();
});

test("enemy actor models expose distinct Minecraft-style body parts", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const zombie = createZombieTarget(scene, { zombie: skin });
  assert.deepEqual(Object.keys(zombie.parts).sort(), ["body", "head", "leftArm", "leftLeg", "rightArm", "rightLeg"].sort());
  assert.equal(zombie.allParts.length, 6);
  assert.ok(zombie.parts.leftArm.position.x < zombie.parts.body.position.x);
  assert.ok(zombie.parts.rightArm.position.x > zombie.parts.body.position.x);
  assert.ok(zombie.parts.head.position.y > zombie.parts.body.position.y);

  const creeper = createCreeperTarget(scene, { creeper: skin });
  assert.equal(Boolean(creeper.parts.head), true);
  assert.equal(Boolean(creeper.parts.body), true);
  assert.equal(creeper.parts.legs.length, 4);
  assert.equal(creeper.allParts.length, 6);
  assert.ok(creeper.parts.head.position.y > creeper.parts.body.position.y);

  scene.dispose();
  engine.dispose();
});

function pickFromFront(scene, point) {
  const ray = new BABYLON.Ray(point.add(new BABYLON.Vector3(0, 0, 6)), new BABYLON.Vector3(0, 0, -1), 20);
  return scene.pickWithRay(ray, (mesh) => Boolean(mesh.metadata?.target || mesh.metadata?.solid), false);
}

function rawTexture(scene, rgba, width = 1, height = 1) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return BABYLON.RawTexture.CreateRGBATexture(data, width, height, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
}

function refreshWorldMatrices(scene) {
  scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
  scene.transformNodes.forEach((node) => node.computeWorldMatrix(true));
}
