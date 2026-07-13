import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { ASSET_PATHS, SOUND_PATHS, WEAPON_CONFIG, WEAPON_ORDER, TAIZ_NATIVE_WEAPONS, V2_WEAPON_ANIMATION_BINDINGS } from "../src/config.js";
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

test("V2 sound files exist for all SOUND_PATHS", () => {
  // SOUND_PATHS 含字符串值和 { magout, magin } 对象值（AK47/AWP/P90 分段换弹）
  flattenAssetPaths(SOUND_PATHS).forEach((soundPath) => {
    assert.equal(existsSync(join(root, "public", soundPath)), true, soundPath);
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
  const model = JSON.parse(readFileSync(join(root, "public", ASSET_PATHS.weaponModels.p90), "utf8"));
  assert.ok(Array.isArray(model.elements), "elements array");
  assert.ok(model.elements.length > 20, `part count ${model.elements.length}`);
  assert.deepEqual(model.texture_size, [128, 128]);
  assert.equal(model.textures["2"], "tac:items/p90/p90_1");
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

test("weapon first-person configs are 3D-only with muzzle anchors", () => {
  for (const id of WEAPON_ORDER) {
    const weapon = WEAPON_CONFIG[id];
    assert.equal(weapon.display, undefined, `${id} has no 2D first-person display config`);
    const modelConfig = weapon.modelConfig;
    assert.ok(modelConfig, `${id} has modelConfig`);
    assert.ok(Array.isArray(modelConfig.position) && modelConfig.position.length === 3, `${id} position`);
    assert.ok(Array.isArray(modelConfig.rotation) && modelConfig.rotation.length === 3, `${id} rotation`);
    assert.ok(typeof modelConfig.scaling === "number" && modelConfig.scaling > 0, `${id} scaling`);
    assert.ok(
      Array.isArray(modelConfig.muzzleLocalPosition) && modelConfig.muzzleLocalPosition.length === 3,
      `${id} muzzleLocalPosition`
    );
    assert.equal(modelConfig.muzzleOffset, undefined, `${id} no camera-space muzzleOffset`);
    // Phase 2：方块手锚点必须配置
    assert.ok(modelConfig.handAnchors, `${id} has handAnchors`);
    assert.ok(
      Array.isArray(modelConfig.handAnchors.rightHand) && modelConfig.handAnchors.rightHand.length === 3,
      `${id} handAnchors.rightHand`
    );
    assert.ok(
      Array.isArray(modelConfig.handAnchors.leftHand) && modelConfig.handAnchors.leftHand.length === 3,
      `${id} handAnchors.leftHand`
    );
  }
});

test("reload part bindings use explicit element indices, not yRange", () => {
  for (const id of WEAPON_ORDER) {
    const parts = WEAPON_CONFIG[id].modelConfig.reloadParts;
    // rpg7 火箭筒无传统弹匣 bone，reloadParts 为空对象，跳过 magazine 检查
    if (id === "rpg7") {
      assert.equal(Object.keys(parts).length, 0, "rpg7 reloadParts 应为空对象");
      continue;
    }
    // TaCZ 原生武器走 boneMap 驱动，不使用 elementIndices
    if (TAIZ_NATIVE_WEAPONS.includes(id)) {
      continue;
    }
    assert.ok(parts?.magazine?.elementIndices?.length > 0, `${id} magazine indices`);
    for (const [partName, partConfig] of Object.entries(parts)) {
      assert.equal(partConfig.yRange, undefined, `${id}.${partName} does not use yRange at runtime`);
      assert.ok(Array.isArray(partConfig.elementIndices), `${id}.${partName} elementIndices array`);
      const unique = new Set(partConfig.elementIndices);
      assert.equal(unique.size, partConfig.elementIndices.length, `${id}.${partName} indices are unique`);
      const modelPath = WEAPON_CONFIG[id].modelPath ?? ASSET_PATHS.weaponModels[id];
      const model = JSON.parse(readFileSync(join(root, "public", modelPath), "utf8"));
      for (const index of partConfig.elementIndices) {
        assert.ok(Number.isInteger(index), `${id}.${partName} index ${index} is integer`);
        assert.ok(index >= 0 && index < model.elements.length, `${id}.${partName} index ${index} in range`);
      }
    }
  }
});

test("TaCZ 原生武器 geo/display/texture/animation 资源存在", () => {
  for (const id of TAIZ_NATIVE_WEAPONS) {
    assert.equal(existsSync(join(root, "public", ASSET_PATHS.taczGeoModels[id])), true, `${id} geo`);
    assert.equal(existsSync(join(root, "public", ASSET_PATHS.taczWeaponTextures[id])), true, `${id} texture`);
    assert.equal(existsSync(join(root, "public", ASSET_PATHS.taczDisplayJson[id])), true, `${id} display`);
    const animPath = V2_WEAPON_ANIMATION_BINDINGS[id].profile.animationPath;
    assert.equal(existsSync(join(root, "public", animPath)), true, `${id} animation`);
  }
});

test("TaCZ 原生武器不走 buildFirstPersonBlockbenchMesh 扁平路径", () => {
  // Phase 5 后 9 把武器全部走 TaCZ 原生路径，校准数据由 WEAPON_CALIBRATION 提供
  for (const id of TAIZ_NATIVE_WEAPONS) {
    assert.equal(TAIZ_NATIVE_WEAPONS.includes(id), true, `${id} 在原生白名单中`);
    assert.ok(WEAPON_CONFIG[id].modelConfig, `${id} 有 modelConfig`);
  }
});

// 阶段 0：验证全部 9 把武器的 TaCZ 资源链完整性（display + geo + texture + animation）
// 即使 5 把旧武器暂时仍走旧 Blockbench 路径，资源文件必须提前就位以便后续迁移
test("全部 9 把武器 TaCZ 资源链完整（display + geo + texture + animation）", () => {
  for (const id of WEAPON_ORDER) {
    assert.equal(existsSync(join(root, "public", ASSET_PATHS.taczGeoModels[id])), true, `${id} geo.json 存在`);
    assert.equal(existsSync(join(root, "public", ASSET_PATHS.taczWeaponTextures[id])), true, `${id} diffuse 贴图存在`);
    assert.equal(existsSync(join(root, "public", ASSET_PATHS.taczDisplayJson[id])), true, `${id} display.json 存在`);
    const animPath = V2_WEAPON_ANIMATION_BINDINGS[id].profile.animationPath;
    assert.equal(existsSync(join(root, "public", animPath)), true, `${id} animation.json 存在`);
    const playerAnimPath = V2_WEAPON_ANIMATION_BINDINGS[id].profile.playerAnimationPath;
    assert.equal(existsSync(join(root, "public", playerAnimPath)), true, `${id} player_animation.json 存在`);
  }
});

test("reloadbar GUI uses image-backed container instead of Rectangle background URL", () => {
  const uiSource = readFileSync(join(root, "src", "ui.js"), "utf8");
  assert.ok(uiSource.includes('new GUI.Container("reload-back")'), "reload-back is a container");
  assert.ok(uiSource.includes('new GUI.Image("reload-bg", ASSET_PATHS.gui.reloadbar)'), "reloadbar background is an image child");
  assert.equal(uiSource.includes("reloadBack.background = ASSET_PATHS.gui.reloadbar"), false);
  assert.equal(uiSource.includes("firemodeIcon.top = -90"), false, "firemode icon no longer floats outside hotbar wrap");
});

test("steve.png player skin exists for block hands", () => {
  const stevePath = join(root, "public", "assets", "minecraft", "entity", "player", "steve.png");
  assert.equal(existsSync(stevePath), true, "steve.png exists at public/assets/minecraft/entity/player/steve.png");
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
