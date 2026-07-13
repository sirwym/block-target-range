import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { WEAPON_CONFIG, WEAPON_ORDER } from "../src/config.js";
import { parseTaczAnimationJson, sampleAnimation, _TEST_ONLY } from "../src/taczAnimationParser.js";

const ROOT = process.cwd();

function loadWeaponAnimation(weaponId) {
  const profile = WEAPON_CONFIG[weaponId].v2AnimationProfile;
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, "public", profile.animationPath), "utf8"));
  return parseTaczAnimationJson(json, profile.animationPath);
}

test("9 把枪都有 TaCZ animation.json 与 player animator 配置", () => {
  for (const weaponId of WEAPON_ORDER) {
    const profile = WEAPON_CONFIG[weaponId].v2AnimationProfile;
    assert.ok(profile?.animationPath, `${weaponId} has animationPath`);
    assert.ok(profile?.playerAnimationPath, `${weaponId} has playerAnimationPath`);
    assert.ok(fs.existsSync(path.join(ROOT, "public", profile.animationPath)), `${weaponId} animation json exists`);
    assert.ok(fs.existsSync(path.join(ROOT, "public", profile.playerAnimationPath)), `${weaponId} player animation exists`);
  }
});

test("9 把枪都能解析 static_idle/reload/shoot/inspect 与左右手 bone", () => {
  for (const weaponId of WEAPON_ORDER) {
    const data = loadWeaponAnimation(weaponId);
    const profile = WEAPON_CONFIG[weaponId].v2AnimationProfile;
    for (const actionName of [profile.idle, profile.reloadEmpty, profile.reloadTactical, profile.shoot, profile.inspect]) {
      assert.ok(data.animations[actionName], `${weaponId} has ${actionName}`);
    }
    const idle = data.animations[profile.idle];
    assert.ok(idle.bones.righthand, `${weaponId} idle has righthand`);
    assert.ok(idle.bones.lefthand, `${weaponId} idle has lefthand`);
  }
});

test("TaCZ parser 支持数组关键帧、pre/post 和 catmullrom", () => {
  const parsed = parseTaczAnimationJson({
    format_version: "1.8.0",
    animations: {
      demo: {
        animation_length: 1,
        bones: {
          test: {
            rotation: [90, 0, 0],
            position: {
              "0": [0, 0, 0],
              "0.5": { pre: [1, 0, 0], post: [2, 0, 0], lerp_mode: "catmullrom" },
              "1": [4, 0, 0],
            },
            scale: [1, 1.5, 1],
          },
        },
      },
    },
  }, "inline");
  const sample = sampleAnimation(parsed, "demo", 0.25);
  assert.ok(sample.bones.test.rotation[0] > 1.5, "rotation is converted to radians");
  assert.deepEqual(sample.bones.test.scale, [1, 1.5, 1]);
  assert.ok(sample.bones.test.position[0] > 0, "catmullrom position samples");
});

test("组合骨骼能按武器采样：M4/AK/RPG/AWP/M95", () => {
  const m4 = sampleAnimation(loadWeaponAnimation("m4"), "reload_tactical", 0.8);
  assert.ok(m4.bones.mag_and_lefthand, "M4 samples mag_and_lefthand");

  const ak = sampleAnimation(loadWeaponAnimation("ak47"), "inspect", 1.0);
  assert.ok(ak.bones.lefthand_and_mag, "AK47 samples lefthand_and_mag");

  const rpg = sampleAnimation(loadWeaponAnimation("rpg7"), "reload_empty", 1.0);
  assert.ok(rpg.bones.mag_hand, "RPG7 samples mag_hand");

  const awp = sampleAnimation(loadWeaponAnimation("awp"), "bolt", 0.7);
  assert.ok(awp.bones.bolt_group || awp.bones.bolt_rotate, "AWP samples bolt bones");

  const m95 = sampleAnimation(loadWeaponAnimation("m95"), "bolt", 0.8);
  assert.ok(m95.bones.m95_bolt, "M95 samples m95_bolt");
});

test("sound_effects 时间点被保留并排序", () => {
  const data = loadWeaponAnimation("m4");
  const effects = data.animations.reload_empty.soundEffects;
  assert.ok(effects.length > 0, "M4 reload_empty has sound effects");
  assert.ok(effects.every((effect, index) => index === 0 || effect.time >= effects[index - 1].time), "effects sorted");
});

test("解析缓存测试工具能清空不报错", () => {
  assert.doesNotThrow(() => _TEST_ONLY.clearCaches());
});
