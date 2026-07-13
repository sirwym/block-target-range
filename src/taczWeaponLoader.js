import { ASSET_PATHS, TAIZ_NATIVE_WEAPONS, V2_WEAPON_ANIMATION_BINDINGS } from "./config.js";
import { createTaczGeoModel } from "./taczGeoModel.js";

// TaCZ V2 display.json 入口加载器
// 从 display/guns/{weapon}_display.json 自动解析资源链：
// model → geo_models/gun/*_geo.json
// texture → textures/{weapon}/{weapon}.png
// animation → animations/{weapon}.animation.json
// use_default_animation → player_animator/{type}_default.player_animation.json

export function isTaczNativeWeapon(weaponId) {
  return TAIZ_NATIVE_WEAPONS.includes(weaponId);
}

// tacz: 命名空间 → public 路径映射
// 导出供 taczFirstPersonAdapter 解析 display.json 资源链使用
export function resolveTaczNamespace(namespace) {
  // tacz:gun/{weapon}_geo → assets/tacz/geo_models/gun/{weapon}_geo.json
  // tacz:gun/uv/{weapon} → assets/tac/textures/{weapon}/{weapon}.png
  // tacz:{weapon} → assets/tacz/animations/{weapon}.animation.json
  if (!namespace || !namespace.startsWith("tacz:")) return null;
  const path = namespace.slice(5);
  if (path.startsWith("gun/") && path.endsWith("_geo")) {
    return `assets/tacz/geo_models/gun/${path.slice(4)}.json`;
  }
  if (path.startsWith("gun/uv/")) {
    const weapon = path.slice(7);
    return `assets/tac/textures/${weapon}/${weapon}.png`;
  }
  if (path.startsWith("flash/")) {
    return `assets/tac/effects/${path.slice(6)}.png`;
  }
  return null;
}

// 从 use_default_animation 推导动画类型
function resolveAnimationType(useDefaultAnimation) {
  if (useDefaultAnimation === "pistol") return "pistol";
  if (useDefaultAnimation === "rifle") return "rifle";
  return useDefaultAnimation || "rifle";
}

// 从 use_default_animation 推导 player_animation 路径
function resolvePlayerAnimationPath(useDefaultAnimation) {
  const type = resolveAnimationType(useDefaultAnimation);
  return `assets/tacz/player_animator/${type}_default.player_animation.json`;
}

/**
 * 从已加载的 display.json 和 geo.json 创建 TaCZ 武器资源对象。
 * 不依赖 fetch，测试可直接传 JSON。
 * @param {object} options - { visibilityProfile } 透传给 createTaczGeoModel
 */
export function createTaczWeaponFromData(weaponId, scene, displayJson, geoJson, textureUrl, options = {}) {
  const useDefaultAnimation = displayJson.use_default_animation;
  const animationType = resolveAnimationType(useDefaultAnimation);
  const playerAnimationPath = resolvePlayerAnimationPath(useDefaultAnimation);

  // animationProfile 从 display.animation 解析，但实际动画路径在 V2_WEAPON_ANIMATION_BINDINGS 配置
  const binding = V2_WEAPON_ANIMATION_BINDINGS[weaponId];
  const animationPath = binding?.profile?.animationPath || `assets/tacz/animations/${weaponId}.animation.json`;

  // visibilityProfile 透传给 createTaczGeoModel，统一可见性规则
  const model = createTaczGeoModel(scene, geoJson, textureUrl, {
    weaponId,
    visibilityProfile: options.visibilityProfile,
  });

  return {
    weaponId,
    model,
    display: displayJson,
    textureUrl,
    animationProfile: {
      path: animationPath,
      type: animationType,
      playerAnimationPath,
      useDefaultAnimation,
    },
    transform: displayJson.transform || {},
    sounds: displayJson.sounds || {},
    slot: displayJson.slot || null,
    muzzleFlash: displayJson.muzzle_flash || null,
    shell: displayJson.shell || null,
  };
}

/**
 * 浏览器路径：fetch display.json + geo.json，创建 TaCZ 武器。
 * @param {object} options - { visibilityProfile } 透传给 createTaczWeaponFromData
 */
export async function loadTaczWeapon(weaponId, scene, options = {}) {
  const displayPath = ASSET_PATHS.taczDisplayJson[weaponId];
  const geoPath = ASSET_PATHS.taczGeoModels[weaponId];
  const texturePath = ASSET_PATHS.taczWeaponTextures[weaponId];

  if (!displayPath || !geoPath) {
    throw new Error(`[${weaponId}] 缺少 TaCZ 原生资源路径配置`);
  }

  const [displayRes, geoRes] = await Promise.all([
    fetch(displayPath),
    fetch(geoPath),
  ]);

  if (!displayRes.ok) throw new Error(`[${weaponId}] display.json 加载失败: ${displayRes.status}`);
  if (!geoRes.ok) throw new Error(`[${weaponId}] geo.json 加载失败: ${geoRes.status}`);

  const displayJson = await displayRes.json();
  const geoJson = await geoRes.json();

  return createTaczWeaponFromData(weaponId, scene, displayJson, geoJson, texturePath, options);
}
