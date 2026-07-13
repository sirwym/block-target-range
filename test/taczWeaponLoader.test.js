import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { createTaczWeaponFromData, isTaczNativeWeapon } from "../src/taczWeaponLoader.js";

const DISPLAY_DIR = path.resolve("public/assets/tacz/display/guns");
const GEO_DIR = path.resolve("public/assets/tacz/geo_models/gun");
const TEXTURE_DIR = path.resolve("public/assets/tac/textures");
const WEAPONS = ["deagle_golden", "rpg7", "m107", "m95"];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function createScene() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  return { engine, scene };
}

test("isTaczNativeWeapon 白名单正确", () => {
  // Phase 5 后 9 把武器全部走 TaCZ 原生路径
  for (const w of ["glock17", "m4", "ak47", "awp", "p90", "deagle_golden", "rpg7", "m107", "m95"]) {
    assert.equal(isTaczNativeWeapon(w), true, `${w} 是原生武器`);
  }
  assert.equal(isTaczNativeWeapon("unknown"), false, "unknown 不是原生武器");
});

for (const weapon of WEAPONS) {
  test(`${weapon} 能从 display.json 解析 model/texture/animation`, () => {
    const display = loadJson(path.join(DISPLAY_DIR, `${weapon}_display.json`));
    const geo = loadJson(path.join(GEO_DIR, `${weapon}_geo.json`));
    const textureUrl = `assets/tac/textures/${weapon}/${weapon}.png`;
    const { scene, engine } = createScene();

    try {
      const result = createTaczWeaponFromData(weapon, scene, display, geo, textureUrl);
      assert.equal(result.weaponId, weapon);
      assert.ok(result.model, "model 存在");
      assert.ok(result.display, "display 存在");
      assert.ok(result.textureUrl, "textureUrl 存在");
      assert.ok(result.animationProfile, "animationProfile 存在");
      assert.ok(result.transform, "transform 存在");
    } finally {
      engine.dispose();
    }
  });

  test(`${weapon} animationProfile.type 从 use_default_animation 推导`, () => {
    const display = loadJson(path.join(DISPLAY_DIR, `${weapon}_display.json`));
    const geo = loadJson(path.join(GEO_DIR, `${weapon}_geo.json`));
    const { scene, engine } = createScene();

    try {
      const result = createTaczWeaponFromData(weapon, scene, display, geo, null);
      const expectedType = display.use_default_animation === "pistol" ? "pistol" : "rifle";
      assert.equal(result.animationProfile.type, expectedType);
      assert.ok(result.animationProfile.path, "animationPath 存在");
      assert.ok(result.animationProfile.playerAnimationPath, "playerAnimationPath 存在");
    } finally {
      engine.dispose();
    }
  });

  test(`${weapon} display.json 的 model 字段指向 geo`, () => {
    const display = loadJson(path.join(DISPLAY_DIR, `${weapon}_display.json`));
    assert.ok(display.model, "display.model 存在");
    assert.ok(display.model.startsWith("tacz:gun/"), "model 是 tacz:gun/ 命名空间");
    assert.ok(display.model.endsWith("_geo"), "model 以 _geo 结尾");
  });

  test(`${weapon} display.json 的 texture 字段指向 uv 贴图`, () => {
    const display = loadJson(path.join(DISPLAY_DIR, `${weapon}_display.json`));
    assert.ok(display.texture, "display.texture 存在");
    assert.ok(display.texture.startsWith("tacz:gun/uv/"), "texture 是 tacz:gun/uv/ 命名空间");
  });

  test(`${weapon} display.json 的 transform.scale 字段存在`, () => {
    const display = loadJson(path.join(DISPLAY_DIR, `${weapon}_display.json`));
    assert.ok(display.transform, "display.transform 存在");
    assert.ok(display.transform.scale, "transform.scale 存在");
  });

  test(`${weapon} geo.json 文件存在且非空`, () => {
    const geoPath = path.join(GEO_DIR, `${weapon}_geo.json`);
    assert.ok(fs.existsSync(geoPath), `geo 文件存在: ${geoPath}`);
    const stat = fs.statSync(geoPath);
    assert.ok(stat.size > 1000, `geo 文件大小: ${stat.size}`);
  });

  test(`${weapon} 贴图文件存在`, () => {
    const texPath = path.join(TEXTURE_DIR, weapon, `${weapon}.png`);
    assert.ok(fs.existsSync(texPath), `贴图文件存在: ${texPath}`);
  });
}

test("deagle_golden animationProfile.type === pistol", () => {
  const display = loadJson(path.join(DISPLAY_DIR, "deagle_golden_display.json"));
  assert.equal(display.use_default_animation, "pistol");
});

test("rpg7 animationProfile.type === rifle", () => {
  const display = loadJson(path.join(DISPLAY_DIR, "rpg7_display.json"));
  assert.equal(display.use_default_animation, "rifle");
});

test("m107 animationProfile.type === rifle", () => {
  const display = loadJson(path.join(DISPLAY_DIR, "m107_display.json"));
  assert.equal(display.use_default_animation, "rifle");
});

test("m95 animationProfile.type === rifle", () => {
  const display = loadJson(path.join(DISPLAY_DIR, "m95_display.json"));
  assert.equal(display.use_default_animation, "rifle");
});
