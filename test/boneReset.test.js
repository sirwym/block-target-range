// TaCZ 原生武器 bone 归位测试
// 验证 resetTaczBones 恢复 bone 到 originalPosition 而非 [0,0,0]
// 验证 applyTaczNativeBonePose 在 idle 时保持 bone 在 pivot 位置
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { WEAPON_CONFIG, TAIZ_NATIVE_WEAPONS, ASSET_PATHS } from "../src/config.js";
import { createTaczWeaponFromData } from "../src/taczWeaponLoader.js";
import { _TEST_ONLY as CTRL_TEST_ONLY } from "../src/weaponAnimationController.js";

const ROOT = process.cwd();

const { resetTaczBones } = CTRL_TEST_ONLY;

function makeNativeController(weaponId, scene) {
  const displayPath = ASSET_PATHS.taczDisplayJson[weaponId];
  const geoPath = ASSET_PATHS.taczGeoModels[weaponId];
  const display = JSON.parse(fs.readFileSync(path.join(ROOT, "public", displayPath), "utf8"));
  const geo = JSON.parse(fs.readFileSync(path.join(ROOT, "public", geoPath), "utf8"));
  const textureUrl = ASSET_PATHS.taczWeaponTextures[weaponId];
  const weapon = createTaczWeaponFromData(weaponId, scene, display, geo, textureUrl);

  const camera = new BABYLON.UniversalCamera(`${weaponId}-cam`, new BABYLON.Vector3(0, 0, -10), scene);
  const root = new BABYLON.TransformNode(`${weaponId}-first-person-root`, scene);
  root.parent = camera;

  const modelConfig = WEAPON_CONFIG[weaponId].modelConfig;
  // Phase 5 后位置由 WEAPON_CALIBRATION 控制，此处仅用 viewTransform 或 modelConfig 模拟旧 root 变换
  const view = modelConfig.viewTransform;
  const position = view?.position ?? modelConfig.position;
  const rotation = view?.rotation ?? modelConfig.rotation;
  const scale = view?.scale ?? modelConfig.scaling ?? 1.0;
  root.position.set(position[0], position[1], position[2]);
  root.rotation.set(rotation[0], rotation[1], rotation[2]);
  root.scaling.setAll(scale);

  weapon.model.root.parent = root;
  weapon.model.root.position.set(0, 0, 0);
  weapon.model.root.rotation.set(0, 0, 0);
  weapon.model.root.scaling.setAll(1);

  return {
    root,
    ready: true,
    weaponId,
    modelConfig,
    isTaczNative: true,
    taczBoneMap: weapon.model.boneMap,
    taczGeoModel: weapon.model,
  };
}

test("resetTaczBones 恢复 bone 到 originalPosition 而非 [0,0,0]", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    for (const weaponId of TAIZ_NATIVE_WEAPONS) {
      const controller = makeNativeController(weaponId, scene);

      // 记录所有 bone 的 originalPosition
      const originalPositions = new Map();
      for (const [name, node] of controller.taczBoneMap) {
        const orig = node.metadata?.originalPosition ?? [0, 0, 0];
        originalPositions.set(name, [...orig]);
      }

      // 模拟动画修改 bone position（设为非 pivot 值）
      for (const node of controller.taczBoneMap.values()) {
        if (node && node.position) {
          node.position.set(99, 99, 99);
        }
      }

      // 调用 resetTaczBones 归位
      resetTaczBones(controller);

      // 验证 bone position == originalPosition，不是 [0,0,0]
      let checkedCount = 0;
      for (const [name, node] of controller.taczBoneMap) {
        const orig = originalPositions.get(name);
        if (!orig) continue;
        // 跳过 originalPosition 为 [0,0,0] 的 bone（它们归零是正确的）
        const isZero = orig.every((v) => Math.abs(v) < 1e-6);
        if (isZero) continue;

        assert.ok(
          Math.abs(node.position.x - orig[0]) < 1e-6,
          `${weaponId} bone ${name} position.x 恢复到 originalPosition ${orig[0]}，实际 ${node.position.x}`
        );
        assert.ok(
          Math.abs(node.position.y - orig[1]) < 1e-6,
          `${weaponId} bone ${name} position.y 恢复到 originalPosition ${orig[1]}，实际 ${node.position.y}`
        );
        assert.ok(
          Math.abs(node.position.z - orig[2]) < 1e-6,
          `${weaponId} bone ${name} position.z 恢复到 originalPosition ${orig[2]}，实际 ${node.position.z}`
        );
        checkedCount++;
      }
      assert.ok(checkedCount > 0,
        `${weaponId} 至少有一个非零 pivot bone 被验证归位`);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("resetTaczBones 后 bone 不在 [99,99,99]（确认归位生效）", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    for (const weaponId of TAIZ_NATIVE_WEAPONS) {
      const controller = makeNativeController(weaponId, scene);

      // 模拟动画修改 bone position
      for (const node of controller.taczBoneMap.values()) {
        if (node && node.position) {
          node.position.set(99, 99, 99);
        }
      }

      // 归位
      resetTaczBones(controller);

      // 验证所有 bone 不再在 [99,99,99]
      for (const [name, node] of controller.taczBoneMap) {
        assert.ok(
          !(Math.abs(node.position.x - 99) < 1e-6
            && Math.abs(node.position.y - 99) < 1e-6
            && Math.abs(node.position.z - 99) < 1e-6),
          `${weaponId} bone ${name} 归位后不在 [99,99,99]`
        );
      }
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
