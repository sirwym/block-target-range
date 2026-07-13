import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import { spawnProjectileTrail, updateTemporaryMeshes, getTracerPoolSize, createFloatingText, createExplosionEffect } from "../src/effects.js";

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const camera = new BABYLON.FreeCamera("cam", new BABYLON.Vector3(0, 1.5, 5), scene);
camera.setTarget(new BABYLON.Vector3(0, 1.5, 0));
camera.computeWorldMatrix(true);

test("spawnProjectileTrail creates at most one tracer per shot", () => {
  const projectiles = [];
  spawnProjectileTrail(scene, projectiles, camera);
  assert.equal(projectiles.length, 1, "single tracer per shot");
  assert.ok(projectiles[0].metadata.pooled, "tracer is pooled");
});

test("tracer pool stays bounded across many shots", () => {
  const projectiles = [];
  for (let i = 0; i < 20; i += 1) {
    spawnProjectileTrail(scene, projectiles, camera);
  }
  assert.ok(getTracerPoolSize() <= 6, `pool size ${getTracerPoolSize()}`);
});

test("pooled tracers are recycled instead of disposed", () => {
  const projectiles = [];
  spawnProjectileTrail(scene, projectiles, camera);
  const tracer = projectiles[0];

  updateTemporaryMeshes(projectiles, [], camera, scene, 0.2);
  assert.equal(projectiles.length, 0, "removed from active list");
  assert.equal(tracer.isEnabled(), false, "disabled not disposed");
  assert.equal(tracer.getScene(), scene, "mesh still in scene");
});

test("updateTemporaryMeshes advances tracer position and life", () => {
  const projectiles = [];
  spawnProjectileTrail(scene, projectiles, camera);
  const tracer = projectiles[0];
  const startZ = tracer.position.z;

  updateTemporaryMeshes(projectiles, [], camera, scene, 0.05);
  assert.ok(projectiles.length === 1, "still active");
  assert.ok(projectiles[0].metadata.life < 0.14, "life decreased");
  assert.notEqual(projectiles[0].position.z, startZ, "z position advanced");
});

test("createFloatingText returns null without throwing when ui lacks addFloatingText", () => {
  const ui = {};
  const position = new BABYLON.Vector3(0, 1, 0);
  const result = createFloatingText(ui, scene, "10", position, false);
  assert.equal(result, null, "graceful null instead of throwing");
});

test("updateTemporaryMeshes tolerates null effect entries", () => {
  const effects = [null];
  assert.doesNotThrow(() => updateTemporaryMeshes([], effects, camera, scene, 0.05));
  assert.equal(effects.length, 0, "null entry removed");
});

test("createExplosionEffect spawns flash + sparks + smoke", () => {
  const effects = [];
  const position = new BABYLON.Vector3(0, 1, 0);
  createExplosionEffect(scene, effects, position);
  // 1 flash + 24 sparks + 8 smoke = 33
  assert.equal(effects.length, 33);
  for (const effect of effects) {
    assert.equal(effect.mesh.isPickable, false, "explosion mesh not pickable");
    assert.equal(effect.mesh.renderingGroupId, 2, "explosion mesh in rendering group 2");
    assert.ok(effect.life > 0 && effect.life <= 1, "reasonable lifetime");
  }
});

test("explosion effects expire and dispose via updateTemporaryMeshes", () => {
  const effects = [];
  const position = new BABYLON.Vector3(0, 1, 0);
  createExplosionEffect(scene, effects, position);
  // 推进足够长时间让所有效果过期（max life = 0.9s）
  updateTemporaryMeshes([], effects, camera, scene, 1.5);
  assert.equal(effects.length, 0, "all explosion effects expired");
});
