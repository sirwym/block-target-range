import test from "node:test";
import assert from "node:assert/strict";
import { WEAPON_CONFIG, WEAPON_ORDER, ASSET_PATHS } from "../src/config.js";

test("每把武器都配置了 crosshair.image", () => {
  for (const weaponId of WEAPON_ORDER) {
    const weapon = WEAPON_CONFIG[weaponId];
    assert.ok(weapon.crosshair, `${weaponId} 必须有 crosshair 配置`);
    assert.ok(weapon.crosshair.image, `${weaponId} crosshair.image 必须存在`);
    assert.equal(typeof weapon.crosshair.image, "string");
    assert.ok(weapon.crosshair.image.startsWith("assets/"), `${weaponId} crosshair.image 必须是 assets/ 路径`);
  }
});

test("5 把武器配不同准星贴图", () => {
  const images = WEAPON_ORDER.map((id) => WEAPON_CONFIG[id].crosshair.image);
  const unique = new Set(images);
  // AWP 和 glock17 可能都用 dot.png，但 AWP 有 hiddenByAds 标记
  // 至少 3 种不同准星贴图（dot/round/better/circle 中至少 3 种）
  assert.ok(unique.size >= 3, `至少 3 种不同准星贴图，实际 ${unique.size} 种`);
});

test("AWP 配置了 ads 开镜参数", () => {
  const awp = WEAPON_CONFIG.awp;
  assert.ok(awp.ads, "AWP 必须有 ads 配置");
  assert.equal(typeof awp.ads.fov, "number");
  assert.ok(awp.ads.fov > 0 && awp.ads.fov < 1, "ads.fov 应在 0-1 弧度范围内（狙击镜窄视野）");
  assert.ok(awp.crosshair.hiddenByAds, "AWP crosshair 应标记 hiddenByAds（开镜时隐藏普通准星）");
});

test("只有 AWP 有 ads 配置", () => {
  for (const weaponId of WEAPON_ORDER) {
    const weapon = WEAPON_CONFIG[weaponId];
    if (weaponId === "awp") {
      assert.ok(weapon.ads, "AWP 必须有 ads");
    } else {
      assert.equal(weapon.ads, undefined, `${weaponId} 不应有 ads`);
    }
  }
});

test("ASSET_PATHS.crosshair 包含所有准星贴图路径", () => {
  assert.ok(ASSET_PATHS.crosshair.dot, "crosshair.dot 必须存在");
  assert.ok(ASSET_PATHS.crosshair.circle, "crosshair.circle 必须存在");
  assert.ok(ASSET_PATHS.crosshair.dynamic, "crosshair.dynamic 必须存在");
  assert.ok(ASSET_PATHS.crosshair.better, "crosshair.better 必须存在");
  assert.ok(ASSET_PATHS.crosshair.round, "crosshair.round 必须存在");
});

test("ASSET_PATHS.gui 包含所有 GUI 素材路径", () => {
  assert.ok(ASSET_PATHS.gui.reloadbar, "gui.reloadbar 必须存在");
  assert.ok(ASSET_PATHS.gui.ammoslots, "gui.ammoslots 必须存在");
  assert.ok(ASSET_PATHS.gui.firemodeAuto, "gui.firemodeAuto 必须存在");
  assert.ok(ASSET_PATHS.gui.firemodeSemi, "gui.firemodeSemi 必须存在");
  assert.ok(ASSET_PATHS.gui.armorBackdrop, "gui.armorBackdrop 必须存在");
  assert.ok(ASSET_PATHS.gui.armorFiller, "gui.armorFiller 必须存在");
});
