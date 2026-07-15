// TaCZ 原生武器动画 bone 到 geo boneMap 映射测试
// 验证目标武器的动画 bone 名能在 geo boneMap 中解析，别名映射正确
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { createTaczWeaponFromData } from "../src/taczWeaponLoader.js";
import { parseTaczAnimationJson, sampleAnimation } from "../src/taczAnimationParser.js";
import { _TEST_ONLY as CTRL_TEST_ONLY } from "../src/weaponAnimationController.js";
import { V2_WEAPON_ANIMATION_BINDINGS, TAIZ_NATIVE_WEAPONS, ASSET_PATHS } from "../src/config.js";

const { resolveBoneWithAlias } = CTRL_TEST_ONLY;
const ROOT = process.cwd();
const WEAPONS = TAIZ_NATIVE_WEAPONS;

// 每把枪 geo 中必须存在的关键 bone（通用 + 武器专属）
const EXPECTED_BONES = {
  m4: ["root", "righthand", "lefthand", "constraint", "mag_and_lefthand", "gun_and_righthand", "m4a1_bolt"],
  ak47: ["root", "righthand", "lefthand", "constraint", "lefthand_and_mag", "bolt", "magazine"],
  awp: ["root", "righthand", "lefthand", "constraint", "mag_and_lefthand", "bolt_group", "bolt_rotate"],
  deagle_golden: ["root", "righthand", "lefthand", "constraint", "mag_and_lefthand", "slide2", "additional_magazine", "Deagle_golden"],
  m95: ["root", "righthand", "lefthand", "constraint", "m95_bolt", "bolt", "mag_and_lefthand", "mag_and_bullet"],
};

// 辅助：加载 geo + display 创建 boneMap
function loadWeaponBoneMap(weaponId, scene) {
  const displayPath = ASSET_PATHS.taczDisplayJson[weaponId];
  const geoPath = ASSET_PATHS.taczGeoModels[weaponId];
  const display = JSON.parse(fs.readFileSync(path.join(ROOT, "public", displayPath), "utf8"));
  const geo = JSON.parse(fs.readFileSync(path.join(ROOT, "public", geoPath), "utf8"));
  const textureUrl = ASSET_PATHS.taczWeaponTextures[weaponId];
  const weapon = createTaczWeaponFromData(weaponId, scene, display, geo, textureUrl);
  return weapon.model.boneMap;
}

// 辅助：加载动画并采样指定动画名在 t=0 的 bone 名集合
function loadAnimationBoneNames(weaponId, animationName) {
  const binding = V2_WEAPON_ANIMATION_BINDINGS[weaponId];
  const animPath = binding.profile.animationPath;
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, "public", animPath), "utf8"));
  const parsed = parseTaczAnimationJson(json, animPath);
  const sample = sampleAnimation(parsed, animationName, 0);
  assert.ok(sample, `${weaponId} 动画 ${animationName} 采样成功`);
  return Object.keys(sample.bones);
}

// 辅助：在 boneMap 中解析 bone 名（含别名），模拟 reloadAnimation.resolveBoneInMap
function resolveInBoneMap(name, boneMap, boneAliases) {
  if (!name) return null;
  if (boneMap.has(name)) return name;
  const alias = boneAliases[name];
  if (alias && boneMap.has(alias)) return alias;
  return null;
}

// 辅助：获取武器别名配置
function getBoneAliases(weaponId) {
  return V2_WEAPON_ANIMATION_BINDINGS[weaponId].boneAliases ?? {};
}

// ===== 测试 1：每把枪 boneMap 包含关键 bone =====

for (const weaponId of WEAPONS) {
  test(`${weaponId} geo boneMap 包含关键 bone`, () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    try {
      const boneMap = loadWeaponBoneMap(weaponId, scene);
      assert.ok(boneMap.size > 0, `${weaponId} boneMap 非空`);
      for (const boneName of EXPECTED_BONES[weaponId]) {
        assert.ok(boneMap.has(boneName), `${weaponId} boneMap 包含 "${boneName}"`);
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
}

// ===== 测试 2：static_idle 动画 bone 名能在 boneMap 中解析 =====

for (const weaponId of WEAPONS) {
  test(`${weaponId} static_idle 动画 bone 能在 boneMap 中解析`, () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    try {
      const boneMap = loadWeaponBoneMap(weaponId, scene);
      const boneAliases = getBoneAliases(weaponId);
      const boneNames = loadAnimationBoneNames(weaponId, "static_idle");
      assert.ok(boneNames.length > 0, `${weaponId} static_idle 有 bone`);

      // 关键 bone 必须解析
      const requiredBones = ["root", "righthand", "lefthand", "constraint"];
      for (const required of requiredBones) {
        const resolved = resolveInBoneMap(required, boneMap, boneAliases);
        assert.ok(resolved, `${weaponId} 关键 bone "${required}" 能解析`);
      }

      // 所有动画 bone 中至少 70% 能解析（允许少量控制点如 muzzle_pos/shell 不在 boneMap）
      const resolved = boneNames.filter((name) => resolveInBoneMap(name, boneMap, boneAliases));
      const ratio = resolved.length / boneNames.length;
      assert.ok(ratio >= 0.7, `${weaponId} 动画 bone 解析率 ${ratio.toFixed(2)} >= 0.7（${resolved.length}/${boneNames.length}）`);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
}

// ===== 测试 3：static_idle 含 righthand/lefthand/constraint =====

for (const weaponId of WEAPONS) {
  test(`${weaponId} static_idle 含 righthand/lefthand/constraint`, () => {
    const boneNames = loadAnimationBoneNames(weaponId, "static_idle");
    for (const required of ["righthand", "lefthand", "constraint"]) {
      assert.ok(boneNames.includes(required),
        `${weaponId} static_idle 包含 "${required}"（实际: ${boneNames.join(", ")}）`);
    }
  });
}

// ===== 测试 4：deagle 别名 Deagle → Deagle_golden =====

test("deagle_golden boneAliases 将 Deagle 映射到 Deagle_golden", () => {
  const boneAliases = getBoneAliases("deagle_golden");
  assert.equal(boneAliases.Deagle, "Deagle_golden");
});

test("resolveBoneWithAlias 支持别名解析（Deagle → Deagle_golden）", () => {
  // resolveBoneWithAlias 在动画 bone 集合中查找
  const bones = { Deagle_golden: { position: [0, 0, 0] } };
  const result = resolveBoneWithAlias(bones, "Deagle", { Deagle: "Deagle_golden" });
  assert.equal(result, "Deagle_golden");
});

// ===== 测试 6：resolveBoneWithAlias 支持 fallback 数组 =====

test("resolveBoneWithAlias 支持 fallback 数组", () => {
  const bones = { bolt: { position: [0, 0, 0] } };
  // m95 的 boltPart 配置为 ["m95_bolt", "bolt"]，m95_bolt 不在 bones 中但 bolt 在
  const result = resolveBoneWithAlias(bones, ["m95_bolt", "bolt"], {});
  assert.equal(result, "bolt");
});

test("resolveBoneWithAlias fallback 数组优先匹配第一个", () => {
  const bones = { m95_bolt: { position: [0, 0, 0] }, bolt: { position: [0, 0, 0] } };
  const result = resolveBoneWithAlias(bones, ["m95_bolt", "bolt"], {});
  assert.equal(result, "m95_bolt");
});

// ===== 测试 7：resolveBoneWithAlias 边界情况 =====

test("resolveBoneWithAlias 直接查找成功", () => {
  const bones = { root: { position: [0, 0, 0] } };
  assert.equal(resolveBoneWithAlias(bones, "root", {}), "root");
});

test("resolveBoneWithAlias 未找到返回 null", () => {
  const bones = { root: { position: [0, 0, 0] } };
  assert.equal(resolveBoneWithAlias(bones, "nonexistent", {}), null);
});

test("resolveBoneWithAlias candidate 为 null 返回 null", () => {
  assert.equal(resolveBoneWithAlias({}, null, {}), null);
});

test("resolveBoneWithAlias 别名目标也不存在返回 null", () => {
  const bones = { root: { position: [0, 0, 0] } };
  assert.equal(resolveBoneWithAlias(bones, "foo", { foo: "bar" }), null);
});

// ===== 测试 8：reload_empty 动画含换弹关键 bone =====

test("deagle_golden reload_empty 含 mag_and_lefthand", () => {
  const boneNames = loadAnimationBoneNames("deagle_golden", "reload_empty");
  assert.ok(boneNames.includes("mag_and_lefthand"), "reload_empty 含 mag_and_lefthand");
});

test("m95 reload_empty 含 m95_bolt 或 bolt", () => {
  const boneNames = loadAnimationBoneNames("m95", "reload_empty");
  assert.ok(boneNames.includes("m95_bolt") || boneNames.includes("bolt"),
    "reload_empty 含 m95_bolt 或 bolt");
});
