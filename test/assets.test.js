import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { ASSET_PATHS, WEAPON_CONFIG, WEAPON_ORDER } from "../src/config.js";
import {
  CREEPER_SKIN_UV,
  SKIN_FACE_ORDER,
  ZOMBIE_SKIN_UV,
  analyzeSkinPixelRect,
  createFaceUVBox,
  createSkinPatchTexture,
  cubeMaterialSpec,
  materialFromTexture,
  validateSkinUvSet,
} from "../src/assets.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("key public assets exist", () => {
  flattenAssetPaths(ASSET_PATHS).forEach((assetPath) => {
    assert.equal(existsSync(join(root, "public", assetPath)), true, assetPath);
  });
});

test("Babylon runtime dependencies are declared", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(Boolean(packageJson.dependencies["@babylonjs/core"]), true);
  assert.equal(Boolean(packageJson.dependencies["@babylonjs/gui"]), true);
  assert.equal(Boolean(packageJson.dependencies["@babylonjs/loaders"]), true);
  assert.equal(Boolean(packageJson.dependencies.three), false);
});

test("P90 3D source assets are structurally usable", () => {
  const gltf = JSON.parse(readFileSync(join(root, "public", ASSET_PATHS.weaponModels.p90), "utf8"));
  assert.ok(gltf.scenes?.length >= 1);
  assert.ok(gltf.nodes?.length >= 1);
  assert.ok(gltf.meshes?.length >= 1);
  assert.ok(gltf.materials?.length >= 1);

  const blockModel = JSON.parse(readFileSync(join(root, "public", ASSET_PATHS.weaponModels.p90BlockModel), "utf8"));
  assert.ok(blockModel.elements.length > 20);
  assert.deepEqual(blockModel.texture_size, [128, 128]);
  assert.equal(blockModel.textures["2"], "tac:items/p90/p90_1");
});

test("block material spec keeps top side and bottom textures distinct", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const top = rawTexture(scene, [40, 220, 40, 255]);
  const side = rawTexture(scene, [120, 180, 80, 255]);
  const bottom = rawTexture(scene, [120, 80, 35, 255]);
  const spec = cubeMaterialSpec(top, side, bottom);
  const block = createFaceUVBox(scene, "grass-test", 2, 0.5, 2, spec);
  const topFace = block.getChildMeshes().find((mesh) => mesh.name.endsWith("top-face"));
  const bottomFace = block.getChildMeshes().find((mesh) => mesh.name.endsWith("bottom-face"));

  assert.equal(spec.top, top);
  assert.equal(spec.side, side);
  assert.equal(spec.bottom, bottom);
  assert.equal(block.material.diffuseTexture, side);
  assert.equal(topFace.material.diffuseTexture, top);
  assert.equal(bottomFace.material.diffuseTexture, bottom);

  scene.dispose();
  engine.dispose();
});

test("materialFromTexture disables backFaceCulling so flipped planes stay visible", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const texture = rawTexture(scene, [220, 220, 220, 255]);
  const material = materialFromTexture(scene, texture, { transparent: true });
  assert.equal(material.backFaceCulling, false, "back face culling off for sprite use");

  scene.dispose();
  engine.dispose();
});

test("weapon display configs are calibrated so muzzle points toward screen center", () => {
  // 2D 武器图标用 TaC 背包图标，不是第一人称 sprite，必须以浏览器实际渲染为准。
  // 用户提供的 debugWeapon2D 验收截图证明 flipHV 会把枪口压向热栏；glock17/m4/ak47/awp 采用 flipH 作为基准。
  // 改动任一值需重新打开 ?debugWeapon2D=1 和正式战斗页验收，避免误回退到枪口朝玩家或上下倒置。
  const expected = {
    glock17: { flipX: true, flipY: false, rotationZ: -0.32, offsetX: 1.05, offsetY: -0.66, scale: 1.0 },
    m4: { flipX: true, flipY: false, rotationZ: -0.32, offsetX: 1.08, offsetY: -0.62, scale: 1.05 },
    ak47: { flipX: true, flipY: false, rotationZ: -0.32, offsetX: 1.06, offsetY: -0.64, scale: 1.05 },
    awp: { flipX: true, flipY: false, rotationZ: -0.32, offsetX: 1.1, offsetY: -0.58, scale: 1.15 },
    p90: { flipX: false, flipY: false, rotationZ: 0.03, offsetX: 1.02, offsetY: -0.68, scale: 0.95 },
  };
  for (const id of WEAPON_ORDER) {
    const display = WEAPON_CONFIG[id].display;
    assert.equal(typeof display.flipX, "boolean", `${id} display.flipX is boolean`);
    assert.equal(typeof display.flipY, "boolean", `${id} display.flipY is boolean`);
    for (const [field, value] of Object.entries(expected[id])) {
      assert.equal(display[field], value, `${id} display.${field} matches calibrated snapshot`);
    }
  }
});

test("enemy skin uv maps define six valid faces per part", () => {
  assert.equal(validateSkinUvSet(ZOMBIE_SKIN_UV), true);
  assert.equal(validateSkinUvSet(CREEPER_SKIN_UV), true);
  [ZOMBIE_SKIN_UV, CREEPER_SKIN_UV].forEach((skinUv) => {
    Object.values(skinUv.parts).forEach((part) => {
      assert.deepEqual(Object.keys(part).sort(), [...SKIN_FACE_ORDER].sort());
    });
  });
});

test("skin patch texture creates a real non-empty cropped patch", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const atlas = rawTextureAtlas(scene, 4, 4, (x, y) => (
    x >= 1 && x <= 2 && y >= 1 && y <= 2
      ? [80, 180, 80, 255]
      : [0, 0, 0, 0]
  ));
  const patch = createSkinPatchTexture(scene, atlas, 4, 4, [1, 1, 2, 2], "test-patch");
  const size = patch.getSize();
  const metrics = patch.metadata.skinPatchMetrics;

  assert.equal(patch.hasAlpha, true);
  assert.equal(size.width, 2);
  assert.equal(size.height, 2);
  assert.equal(metrics.total, 4);
  assert.equal(metrics.opaqueRatio, 1);
  assert.equal(metrics.visibleRatio, 1);
  assert.equal(metrics.nearBlackRatio, 0);

  scene.dispose();
  engine.dispose();
});

test("front skin sample rects are opaque and not all black", () => {
  const zombiePng = readPngRgba(join(root, "public", ASSET_PATHS.zombie));
  const creeperPng = readPngRgba(join(root, "public", ASSET_PATHS.creeper));
  const samples = [
    ["zombie head/front", zombiePng, ZOMBIE_SKIN_UV.parts.head.front],
    ["zombie body/front", zombiePng, ZOMBIE_SKIN_UV.parts.body.front],
    ["zombie arm/front", zombiePng, ZOMBIE_SKIN_UV.parts.leftArm.front],
    ["zombie arm/side", zombiePng, ZOMBIE_SKIN_UV.parts.leftArm.right],
    ["zombie leg/front", zombiePng, ZOMBIE_SKIN_UV.parts.leftLeg.front],
    ["zombie leg/side", zombiePng, ZOMBIE_SKIN_UV.parts.leftLeg.right],
    ["creeper head/front", creeperPng, CREEPER_SKIN_UV.parts.head.front],
    ["creeper body/front", creeperPng, CREEPER_SKIN_UV.parts.body.front],
    ["creeper leg/front", creeperPng, CREEPER_SKIN_UV.parts.leg.front],
  ];

  samples.forEach(([label, png, rect]) => {
    const metrics = analyzeSkinPixelRect(png.data, png.width, png.height, rect);
    assert.ok(metrics.opaqueRatio > 0.8, `${label} opaque ${metrics.opaqueRatio}`);
    assert.ok(metrics.nearBlackRatio < 0.92, `${label} near black ${metrics.nearBlackRatio}`);
  });
});

test("zombie left arm uv points at visible pixels", () => {
  const zombiePng = readPngRgba(join(root, "public", ASSET_PATHS.zombie));
  ["front", "right", "left", "back"].forEach((face) => {
    const metrics = analyzeSkinPixelRect(zombiePng.data, zombiePng.width, zombiePng.height, ZOMBIE_SKIN_UV.parts.leftArm[face]);
    assert.ok(metrics.opaqueRatio > 0.8, `leftArm ${face} opaque ${metrics.opaqueRatio}`);
    assert.ok(metrics.visibleRatio > 0.8, `leftArm ${face} visible ${metrics.visibleRatio}`);
  });
});

test("zombie left leg uv points at visible pixels", () => {
  const zombiePng = readPngRgba(join(root, "public", ASSET_PATHS.zombie));
  ["front", "right", "left", "back"].forEach((face) => {
    const metrics = analyzeSkinPixelRect(zombiePng.data, zombiePng.width, zombiePng.height, ZOMBIE_SKIN_UV.parts.leftLeg[face]);
    assert.ok(metrics.opaqueRatio > 0.8, `leftLeg ${face} opaque ${metrics.opaqueRatio}`);
    assert.ok(metrics.visibleRatio > 0.8, `leftLeg ${face} visible ${metrics.visibleRatio}`);
  });
});

function rawTexture(scene, rgba) {
  return BABYLON.RawTexture.CreateRGBATexture(Uint8Array.from(rgba), 1, 1, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
}

function flattenAssetPaths(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(flattenAssetPaths);
}

function rawTextureAtlas(scene, width, height, pixelAt) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixelAt(x, y), (y * width + x) * 4);
    }
  }
  return BABYLON.RawTexture.CreateRGBATexture(data, width, height, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
}

function readPngRgba(path) {
  const file = readFileSync(path);
  assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      assert.equal(data[9], 6);
      assert.equal(data[12], 0);
    }
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") break;
    offset += 12 + length;
  }
  return { width, height, data: unfilterRgba(inflateSync(Buffer.concat(idat)), width, height) };
}

function unfilterRgba(inflated, width, height) {
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const out = new Uint8Array(rowLength * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source];
    source += 1;
    const row = inflated.subarray(source, source + rowLength);
    source += rowLength;
    const target = y * rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const left = x >= bytesPerPixel ? out[target + x - bytesPerPixel] : 0;
      const up = y > 0 ? out[target + x - rowLength] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? out[target + x - rowLength - bytesPerPixel] : 0;
      out[target + x] = (row[x] + pngFilterValue(filter, left, up, upLeft)) & 255;
    }
  }
  return out;
}

function pngFilterValue(filter, left, up, upLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`Unsupported PNG filter ${filter}`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}
