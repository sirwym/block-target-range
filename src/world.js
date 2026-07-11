import * as BABYLON from "@babylonjs/core";
import { GAME_CONFIG } from "./config.js";
import { colorMaterial, createBox, cubeMaterialSpec, materialFromTexture } from "./assets.js";

export function buildLighting(scene) {
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.15), scene);
  hemi.intensity = 1.55;
  hemi.groundColor = new BABYLON.Color3(0.36, 0.47, 0.33);

  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(0.52, -0.72, -0.38), scene);
  sun.position.set(-18, 24, 14);
  sun.intensity = 2.2;
  return { hemi, sun };
}

export function createWorld(scene, textures) {
  const solidColliders = [];
  const solidMeshes = [];
  const registerSolid = (mesh, sizeOverride) => addSolidBox(solidColliders, solidMeshes, mesh, sizeOverride);
  buildArena(scene, textures, registerSolid);
  buildDecorations(scene, textures, registerSolid);
  const baseCrystal = buildBaseCrystal(scene, textures, registerSolid);
  return { solidColliders, solidMeshes, baseCrystal };
}

export function makeBlock(scene, width, height, depth, materialSpec, name = "block") {
  return createBox(scene, name, width, height, depth, materialSpec);
}

export function addSolidBox(solidColliders, solidMeshes, mesh, sizeOverride) {
  mesh.computeWorldMatrix(true);
  const bounding = mesh.getBoundingInfo().boundingBox;
  const center = bounding.centerWorld.clone();
  const extent = sizeOverride
    ? new BABYLON.Vector3(sizeOverride.x / 2, sizeOverride.y / 2, sizeOverride.z / 2)
    : bounding.extendSizeWorld.clone();
  const box = {
    minX: center.x - extent.x,
    minY: center.y - extent.y,
    minZ: center.z - extent.z,
    maxX: center.x + extent.x,
    maxY: center.y + extent.y,
    maxZ: center.z + extent.z,
  };
  solidColliders.push({ box, mesh });
  solidMeshes.push(mesh);
  mesh.metadata = { ...(mesh.metadata ?? {}), solid: true };
  mesh.checkCollisions = true;
  mesh.isPickable = true;
}

function stackBlock(scene, x, z, height, materialSpec, registerSolid) {
  for (let i = 0; i < height; i += 1) {
    const mesh = makeBlock(scene, 2, 2, 2, materialSpec, "stack-block");
    mesh.position.set(x, i * 2 + 0.75, z);
    registerSolid(mesh);
  }
}

function buildArena(scene, textures, registerSolid) {
  const floorSpec = cubeMaterialSpec(textures.grassTop, textures.grassSide, textures.dirt);
  for (let x = -12; x <= 12; x += 1) {
    for (let z = -15; z <= 11; z += 1) {
      const block = makeBlock(scene, 2, 0.5, 2, floorSpec, "grass-floor");
      block.position.set(x * 2, -0.25, z * 2);
      block.checkCollisions = false;
      block.isPickable = false;
    }
  }

  for (let x = -13; x <= 13; x += 1) {
    stackBlock(scene, x * 2, -32, 2, textures.cobble, registerSolid);
    stackBlock(scene, x * 2, 24, x % 4 === 0 ? 3 : 2, textures.cobble, registerSolid);
  }
  for (let z = -16; z <= 12; z += 1) {
    stackBlock(scene, -26, z * 2, z % 5 === 0 ? 3 : 2, textures.cobble, registerSolid);
    stackBlock(scene, 26, z * 2, z % 5 === 0 ? 3 : 2, textures.cobble, registerSolid);
  }

  GAME_CONFIG.lanes.forEach((laneX) => {
    for (let z = -12; z <= 7; z += 4) {
      const marker = makeBlock(scene, 1.9, 0.12, 1.9, textures.lamp, "lane-lamp");
      marker.position.set(laneX, 0.08, z * 2);
      marker.checkCollisions = false;
      marker.isPickable = false;
    }
  });

  [
    [-15, -8, 2], [15, -8, 2], [-10, 1, 3], [10, 1, 3],
    [-16, 9, 2], [16, 9, 2], [-4, -15, 2], [4, -15, 2],
  ].forEach(([x, z, h]) => stackBlock(scene, x, z, h, textures.planks, registerSolid));

  [[-21, 16], [21, 16], [-21, -22], [21, -22]]
    .forEach(([x, z]) => stackBlock(scene, x, z, 4, textures.obsidian, registerSolid));
}

function buildDecorations(scene, textures, registerSolid) {
  [[-18, -18, textures.diamond], [18, -18, textures.emerald], [-18, 5, textures.emerald], [18, 5, textures.diamond]].forEach(([x, z, texture]) => {
    const block = makeBlock(scene, 2, 2, 2, texture, "gem-block");
    block.position.set(x, 1, z);
    registerSolid(block);
  });

  for (let i = 0; i < 9; i += 1) {
    const glass = makeBlock(scene, 3.6, 0.55, 3.6, materialFromTexture(scene, textures.glass, { alpha: 0.58, transparent: true }), "glass-platform");
    glass.position.set(-20 + i * 5, 0.45, -25 + (i % 2) * 4);
    glass.checkCollisions = false;
    glass.isPickable = false;
  }

  [[-22, -6], [22, -6], [-22, 10], [22, 10]].forEach(([x, z]) => {
    const lamp = makeBlock(scene, 1.7, 1.7, 1.7, textures.pumpkin, "pumpkin-lamp");
    lamp.position.set(x, 1.05, z);
    registerSolid(lamp);
    const light = new BABYLON.PointLight("pumpkin-light", new BABYLON.Vector3(x, 2.1, z), scene);
    light.diffuse = new BABYLON.Color3(1, 0.68, 0.3);
    light.intensity = 0.8;
    light.range = 9;
  });

  [[-6, -26], [6, -26], [-3, -26], [3, -26]].forEach(([x, z]) => {
    const tnt = makeBlock(scene, 1.6, 1.6, 1.6, cubeMaterialSpec(textures.tntTop, textures.tntSide, textures.tntTop), "tnt");
    tnt.position.set(x, 0.95, z);
    registerSolid(tnt);
  });

  GAME_CONFIG.lanes.forEach((x) => {
    const magma = makeBlock(scene, 2.4, 0.22, 2.4, textures.magma, "magma-marker");
    magma.position.set(x, 0.18, GAME_CONFIG.goalZ + 2.5);
    magma.checkCollisions = false;
    magma.isPickable = false;
  });
}

function buildBaseCrystal(scene, textures, registerSolid) {
  const group = new BABYLON.TransformNode("base-crystal", scene);
  group.position.set(0, 0, GAME_CONFIG.goalZ + 1.5);

  const plinth = makeBlock(scene, 3.4, 0.8, 3.4, textures.obsidian, "base-plinth");
  plinth.position.y = 0.42;
  plinth.parent = group;

  const crystal = BABYLON.MeshBuilder.CreatePolyhedron("crystal", { type: 1, size: 1.25 }, scene);
  crystal.material = materialFromTexture(scene, textures.beacon, {
    emissiveColor: new BABYLON.Color3(0.08, 0.42, 0.72),
  });
  crystal.position.y = 2.2;
  crystal.parent = group;
  crystal.isPickable = false;

  const ring = BABYLON.MeshBuilder.CreateTorus("crystal-ring", { diameter: 3.1, thickness: 0.08, tessellation: 6 }, scene);
  ring.material = colorMaterial(scene, "#ffd56a", { alpha: 0.78 });
  ring.position.y = 1.7;
  ring.rotation.x = Math.PI / 2;
  ring.parent = group;
  ring.isPickable = false;

  const light = new BABYLON.PointLight("crystal-light", new BABYLON.Vector3(0, 2.4, 0), scene);
  light.diffuse = new BABYLON.Color3(0.48, 0.9, 1);
  light.intensity = 1.4;
  light.range = 18;
  light.parent = group;

  registerSolid(plinth, { x: 3.4, y: 0.8, z: 3.4 });
  return { group, crystal, ring, light };
}

export function updateCrystal(baseCrystal, delta, elapsed) {
  if (!baseCrystal) return;
  baseCrystal.crystal.rotation.y += delta * 1.3;
  baseCrystal.crystal.position.y = 2.2 + Math.sin(elapsed * 2.4) * 0.16;
  baseCrystal.ring.rotation.z += delta * 1.9;
}
