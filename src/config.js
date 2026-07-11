export const ASSET_ROOT = "./assets/minecraft";
export const FONT_ROOT = "./assets/fonts";
export const TAC_ASSET_ROOT = "assets/tac";

export const GAME_CONFIG = {
  duration: 75,
  baseHealth: 5,
  lanes: [-9, 0, 9],
  spawnZ: -25,
  goalZ: 15.5,
  maxTargets: 10,
  playerRadius: 0.62,
  playerGroundY: 2.25,
  playerJumpVelocity: 7.6,
  playerGravity: 22,
  playerBounds: { x: 20.5, zMin: -25.5, zMax: 17.5 },
  comboWindow: 2,
  criticalComboBonus: 2,
  shootCooldown: 0.22,
  bowAnimationDuration: 0.24,
};

export const ENEMY_STATS = {
  zombie: { health: 3 },
  creeper: { health: 2 },
};

export const SCORE_VALUES = {
  zombie: 10,
  creeper: 12,
  criticalBonus: 10,
};

export const ASSET_PATHS = {
  titleFont: "assets/fonts/minecraft-title.woff2",
  uiFont: "assets/fonts/minecraft-ui.woff2",
  inventory: "assets/minecraft/gui/inventory.png",
  bow: "assets/minecraft/item/bow.png",
  bowPulling0: "assets/minecraft/item/bow_pulling_0.png",
  bowPulling1: "assets/minecraft/item/bow_pulling_1.png",
  bowPulling2: "assets/minecraft/item/bow_pulling_2.png",
  arrow: "assets/minecraft/item/arrow.png",
  experienceBottle: "assets/minecraft/item/experience_bottle.png",
  zombie: "assets/minecraft/entity/zombie/zombie.png",
  creeper: "assets/minecraft/entity/creeper/creeper.png",
  tacMuzzleFlash: "assets/tac/effects/muzzle_flash.png",
  tacHitMarker: "assets/tac/effects/hit_marker.png",
  weapons: {
    glock17: "assets/tac/weapons/glock17.png",
    m4: "assets/tac/weapons/m4.png",
    ak47: "assets/tac/weapons/ak47.png",
    awp: "assets/tac/weapons/awp.png",
    p90: "assets/tac/weapons/p90.png",
  },
  weaponModels: {
    p90: "assets/tac/models/p90/p90_static.gltf",
    p90BlockModel: "assets/tac/models/p90/p90_model.json",
    glock17: "assets/tac/models/glock17/glock17.json",
    m4: "assets/tac/models/m4/m4.json",
    ak47: "assets/tac/models/ak47/ak47.json",
    awp: "assets/tac/models/awp/awp.json",
  },
  // 按 weaponId 分组，每个武器的纹理键(#n) → 贴图路径映射。
  // Blockbench JSON 的 textures 对象键与这里的键对应，用于选择材质。
  weaponModelTextures: {
    p90: {
      "#2": "assets/tac/textures/p90/p90_1.png",
      "#3": "assets/tac/textures/p90/bs_512.png",
    },
    glock17: {
      "#4": "assets/tac/textures/glock17/glock17_gen4_3.png",
    },
    m4: {
      "#8": "assets/tac/textures/m4/m4a1_other.png",
    },
    ak47: {
      "#0": "assets/tac/textures/ak47/ak47_uv.png",
    },
    awp: {
      "#4": "assets/tac/textures/awp/awp_3.png",
    },
  },
};

export const SOUND_PATHS = {
  glock17Fire: "assets/tac/sounds/glock17_fire.ogg",
  m4Fire: "assets/tac/sounds/m4_fire.ogg",
  ak47Fire: "assets/tac/sounds/ak47_fire.ogg",
  awpFire: "assets/tac/sounds/awp_fire.ogg",
  p90Fire: "assets/tac/sounds/p90_fire.ogg",
  glock17Reload: "assets/tac/sounds/glock17_reload.ogg",
  m4Reload: "assets/tac/sounds/m4_reload.ogg",
  ak47Reload: "assets/tac/sounds/ak47_reload.ogg",
  awpReload: "assets/tac/sounds/awp_reload.ogg",
  p90Reload: "assets/tac/sounds/p90_reload.ogg",
  weaponDraw: "assets/tac/sounds/draw.ogg",
  p90Draw: "assets/tac/sounds/p90_draw.ogg",
};

export const WEAPON_ORDER = ["glock17", "m4", "ak47", "awp", "p90"];

export const WEAPON_CONFIG = {
  glock17: {
    id: "glock17",
    label: "Glock 17",
    slot: 1,
    magazineSize: 17,
    reloadDuration: 1.4,
    fireInterval: 60 / 360,
    automatic: false,
    bodyDamage: 1,
    recoil: 0.74,
    cameraKick: 0.004,
    fireSound: "glock17Fire",
    reloadSound: "glock17Reload",
    iconPath: ASSET_PATHS.weapons.glock17,
    tracerInterval: 1,
    display: { offsetX: 1.05, offsetY: -0.66, scale: 1.0, rotationZ: -0.32, flipX: true, flipY: false },
    // 3D 模型配置：position/rotation/scaling 控制模型在相机坐标系中的变换，
    // muzzleOffset 是枪口火焰位置（相对相机），每把枪独立校准。
    // 初始值参考 P90 的位置，需浏览器验收微调。
    modelConfig: {
      position: [0.5, -0.55, 1.15],
      rotation: [-0.08, -0.2, 0.02],
      scaling: 1.3,
      muzzleOffset: [0.64, -0.5, 1.2],
    },
  },
  m4: {
    id: "m4",
    label: "M4",
    slot: 2,
    magazineSize: 30,
    reloadDuration: 1.8,
    fireInterval: 60 / 700,
    automatic: true,
    bodyDamage: 1,
    recoil: 0.52,
    cameraKick: 0.003,
    fireSound: "m4Fire",
    reloadSound: "m4Reload",
    iconPath: ASSET_PATHS.weapons.m4,
    tracerInterval: 2,
    display: { offsetX: 1.08, offsetY: -0.62, scale: 1.05, rotationZ: -0.32, flipX: true, flipY: false },
    // 3D 模型配置：步枪比手枪大，初始值参考 glock17 粗调，后续浏览器微调。
    modelConfig: {
      position: [0.55, -0.6, 1.2],
      rotation: [-0.08, -0.2, 0.02],
      scaling: 1.5,
      muzzleOffset: [0.7, -0.5, 1.3],
    },
  },
  ak47: {
    id: "ak47",
    label: "AK47",
    slot: 3,
    magazineSize: 30,
    reloadDuration: 2.0,
    fireInterval: 60 / 600,
    automatic: true,
    bodyDamage: 1,
    recoil: 0.68,
    cameraKick: 0.004,
    fireSound: "ak47Fire",
    reloadSound: "ak47Reload",
    iconPath: ASSET_PATHS.weapons.ak47,
    tracerInterval: 2,
    display: { offsetX: 1.06, offsetY: -0.64, scale: 1.05, rotationZ: -0.32, flipX: true, flipY: false },
    // 3D 模型配置：步枪比手枪大，初始值参考 glock17 粗调，后续浏览器微调。
    modelConfig: {
      position: [0.55, -0.6, 1.2],
      rotation: [-0.08, -0.2, 0.02],
      scaling: 1.5,
      muzzleOffset: [0.7, -0.5, 1.3],
    },
  },
  awp: {
    id: "awp",
    label: "AWP",
    slot: 4,
    magazineSize: 5,
    reloadDuration: 2.4,
    fireInterval: 60 / 45,
    automatic: false,
    bodyDamage: 2,
    recoil: 1.1,
    cameraKick: 0.008,
    fireSound: "awpFire",
    reloadSound: "awpReload",
    iconPath: ASSET_PATHS.weapons.awp,
    tracerInterval: 1,
    display: { offsetX: 1.1, offsetY: -0.58, scale: 1.15, rotationZ: -0.32, flipX: true, flipY: false },
    // 3D 模型配置：狙击枪更长，初始值参考 glock17 粗调，后续浏览器微调。
    modelConfig: {
      position: [0.55, -0.55, 1.3],
      rotation: [-0.08, -0.2, 0.02],
      scaling: 1.7,
      muzzleOffset: [0.75, -0.45, 1.4],
    },
  },
  p90: {
    id: "p90",
    label: "P90",
    slot: 5,
    magazineSize: 50,
    reloadDuration: 2.1,
    fireInterval: 60 / 900,
    automatic: true,
    bodyDamage: 1,
    recoil: 0.46,
    cameraKick: 0.0028,
    fireSound: "p90Fire",
    reloadSound: "p90Reload",
    drawSound: "p90Draw",
    iconPath: ASSET_PATHS.weapons.p90,
    modelPath: ASSET_PATHS.weaponModels.p90,
    tracerInterval: 2,
    display: { offsetX: 1.02, offsetY: -0.68, scale: 0.95, rotationZ: 0.03, flipX: false, flipY: false },
  },
};

export function getWaveProfile(elapsed) {
  if (elapsed < 25) {
    return {
      phase: "warmup",
      allowCreeper: false,
      spawnMin: 1.18,
      spawnMax: 1.45,
      zombieSpeed: [1.25, 1.55],
      creeperSpeed: [1.45, 1.65],
    };
  }
  if (elapsed < 55) {
    return {
      phase: "mixed",
      allowCreeper: true,
      creeperChance: 0.42,
      spawnMin: 0.85,
      spawnMax: 1.12,
      zombieSpeed: [1.45, 1.9],
      creeperSpeed: [1.7, 2.2],
    };
  }
  return {
    phase: "rush",
    allowCreeper: true,
    creeperChance: 0.57,
    spawnMin: 0.56,
    spawnMax: 0.78,
    zombieSpeed: [1.75, 2.25],
    creeperSpeed: [2.15, 2.75],
  };
}

export function getRating({ victory, score, baseHealth }) {
  if (!victory) return score >= 120 ? "B" : "C";
  if (score >= 220 && baseHealth >= 4) return "S";
  if (score >= 150) return "A";
  if (score >= 90) return "B";
  return "C";
}
