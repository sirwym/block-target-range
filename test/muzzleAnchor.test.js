// TaCZ 原生武器 muzzleAnchor 自动定位测试
// 验证 muzzleAnchor 从 geo bone（muzzle_pos/muzzle_flash/muzzle_default）自动计算，
// 不再依赖手填 muzzleLocalPosition fallback 值
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { WEAPON_CONFIG, TAIZ_NATIVE_WEAPONS, ASSET_PATHS } from "../src/config.js";
import { createTaczWeaponFromData } from "../src/taczWeaponLoader.js";
import { updateWeaponModel } from "../src/weaponModel.js";

const ROOT = process.cwd();

// 加载 geo + display 创建 weapon，构建完整 controller
function makeNativeController(weaponId, scene) {
  const displayPath = ASSET_PATHS.taczDisplayJson[weaponId];
  const geoPath = ASSET_PATHS.taczGeoModels[weaponId];
  const display = JSON.parse(fs.readFileSync(path.join(ROOT, "public", displayPath), "utf8"));
  const geo = JSON.parse(fs.readFileSync(path.join(ROOT, "public", geoPath), "utf8"));
  const textureUrl = ASSET_PATHS.taczWeaponTextures[weaponId];
  const weapon = createTaczWeaponFromData(weaponId, scene, display, geo, textureUrl);

  // 模拟 createWeaponModel + loadWeaponModel 原生分支的挂载流程
  const camera = new BABYLON.UniversalCamera(`${weaponId}-cam`, new BABYLON.Vector3(0, 0, -10), scene);
  const root = new BABYLON.TransformNode(`${weaponId}-first-person-root`, scene);
  root.parent = camera;

  const modelConfig = WEAPON_CONFIG[weaponId].modelConfig;
  // Phase 5 后位置由 WEAPON_CALIBRATION 控制，此处用 viewTransform 或 modelConfig 模拟旧 root 变换
  const view = modelConfig.viewTransform;
  const position = view?.position ?? modelConfig.position;
  const rotation = view?.rotation ?? modelConfig.rotation;
  const scale = view?.scale ?? modelConfig.scaling ?? 1.0;
  root.position.set(position[0], position[1], position[2]);
  root.rotation.set(rotation[0], rotation[1], rotation[2]);
  root.scaling.setAll(scale);

  // geo model root 挂到 controller.root 下
  weapon.model.root.parent = root;
  weapon.model.root.position.set(0, 0, 0);
  weapon.model.root.rotation.set(0, 0, 0);
  weapon.model.root.scaling.setAll(1);

  // 创建 muzzleAnchor（初始用手填值，与 createMuzzleAnchor 一致）
  const muzzleAnchor = new BABYLON.TransformNode(`${weaponId}-muzzle-anchor`, scene);
  muzzleAnchor.parent = root;
  const muz = modelConfig.muzzleLocalPosition;
  muzzleAnchor.position.set(muz[0], muz[1], muz[2]);

  return {
    root,
    muzzleAnchor,
    ready: true,
    weaponId,
    modelConfig,
    isTaczNative: true,
    taczBoneMap: weapon.model.boneMap,
    taczGeoModel: weapon.model,
  };
}

test("原生武器 muzzleAnchor 从 geo bone 自动计算（不等于手填 fallback）", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    for (const weaponId of TAIZ_NATIVE_WEAPONS) {
      const controller = makeNativeController(weaponId, scene);
      const fallback = WEAPON_CONFIG[weaponId].modelConfig.muzzleLocalPosition;

      // 更新前：muzzleAnchor 应为手填值
      assert.deepEqual(
        [controller.muzzleAnchor.position.x, controller.muzzleAnchor.position.y, controller.muzzleAnchor.position.z],
        fallback,
        `${weaponId} 初始 muzzleAnchor 应为手填值`
      );

      // 触发 updateWeaponModel，内部调用 updateMuzzleAnchor → setMuzzleAnchorPosition
      updateWeaponModel(controller, {
        active: true,
        recoil: 0,
        reloading: false,
        reloadProgress: 0,
        reloadIsEmpty: false,
        modelConfig: controller.modelConfig,
      });

      const pos = controller.muzzleAnchor.position;
      // 更新后：muzzleAnchor 应从 geo bone 重新计算，不等于手填值
      const stillFallback = Math.abs(pos.x - fallback[0]) < 1e-6
        && Math.abs(pos.y - fallback[1]) < 1e-6
        && Math.abs(pos.z - fallback[2]) < 1e-6;
      assert.equal(stillFallback, false,
        `${weaponId} muzzleAnchor 应从 geo bone 重新计算，不应等于手填 fallback ${fallback}，实际 [${pos.x}, ${pos.y}, ${pos.z}]`);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("原生武器 muzzleAnchor 位置有限且在合理范围内", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    for (const weaponId of TAIZ_NATIVE_WEAPONS) {
      const controller = makeNativeController(weaponId, scene);
      updateWeaponModel(controller, {
        active: true,
        recoil: 0,
        reloading: false,
        reloadProgress: 0,
        reloadIsEmpty: false,
        modelConfig: controller.modelConfig,
      });

      const pos = controller.muzzleAnchor.position;
      assert.ok(Number.isFinite(pos.x), `${weaponId} muzzleAnchor.x 有限`);
      assert.ok(Number.isFinite(pos.y), `${weaponId} muzzleAnchor.y 有限`);
      assert.ok(Number.isFinite(pos.z), `${weaponId} muzzleAnchor.z 有限`);
      // 枪口位置应在枪身前方，z 分量绝对值不超过 5（Babylon 单位）
      assert.ok(Math.abs(pos.x) < 5, `${weaponId} muzzleAnchor.x 在合理范围 (|x| < 5)，实际: ${pos.x}`);
      assert.ok(Math.abs(pos.y) < 5, `${weaponId} muzzleAnchor.y 在合理范围 (|y| < 5)，实际: ${pos.y}`);
      assert.ok(Math.abs(pos.z) < 5, `${weaponId} muzzleAnchor.z 在合理范围 (|z| < 5)，实际: ${pos.z}`);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("原生武器 muzzleAnchor 每把枪位置各不相同（非统一复制）", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const positions = new Map();
    for (const weaponId of TAIZ_NATIVE_WEAPONS) {
      const controller = makeNativeController(weaponId, scene);
      updateWeaponModel(controller, {
        active: true,
        recoil: 0,
        reloading: false,
        reloadProgress: 0,
        reloadIsEmpty: false,
        modelConfig: controller.modelConfig,
      });
      const pos = controller.muzzleAnchor.position;
      positions.set(weaponId, [pos.x, pos.y, pos.z]);
    }

    // 至少有 2 把枪的 muzzleAnchor 位置不同（避免所有枪用同一个硬编码值）
    const uniquePositions = new Set();
    for (const [weaponId, pos] of positions) {
      uniquePositions.add(pos.map((v) => v.toFixed(3)).join(","));
    }
    assert.ok(uniquePositions.size >= 2,
      `至少 2 把枪的 muzzleAnchor 位置不同，实际唯一位置数: ${uniquePositions.size}`);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("原生武器 bone metadata 包含 originalPosition 和 originalRotation", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    for (const weaponId of TAIZ_NATIVE_WEAPONS) {
      const controller = makeNativeController(weaponId, scene);
      let checkedCount = 0;
      for (const node of controller.taczBoneMap.values()) {
        assert.ok(node.metadata?.originalPosition,
          `${weaponId} bone ${node.name} 有 originalPosition metadata`);
        assert.ok(node.metadata?.originalRotation,
          `${weaponId} bone ${node.name} 有 originalRotation metadata`);
        assert.ok(Array.isArray(node.metadata.originalPosition) && node.metadata.originalPosition.length === 3,
          `${weaponId} bone ${node.name} originalPosition 是 3 元素数组`);
        // v9 修复 C：originalRotation 从 Euler 数组改为 Quaternion 克隆（与 taczGeoModel.js 一致）
        // 动画系统恢复时用 copyFrom 而非 Euler set
        const origRot = node.metadata.originalRotation;
        assert.ok(origRot && typeof origRot === "object" && !Array.isArray(origRot)
          && "x" in origRot && "y" in origRot && "z" in origRot && "w" in origRot,
          `${weaponId} bone ${node.name} originalRotation 是 Quaternion（x/y/z/w 属性）`);
        checkedCount++;
      }
      assert.ok(checkedCount > 0, `${weaponId} 至少有一个 bone 有 metadata`);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
