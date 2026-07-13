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
  zombie: { health: 100 },
  creeper: { health: 100 },
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
  // 像素准星贴图（16x16），每把武器配不同风格
  crosshair: {
    dot: "assets/tac/textures/crosshair/dot.png",
    circle: "assets/tac/textures/crosshair/circle.png",
    dynamic: "assets/tac/textures/crosshair/dynamic_default.png",
    better: "assets/tac/textures/crosshair/better_default.png",
    round: "assets/tac/textures/crosshair/round.png",
  },
  // GUI 像素素材
  gui: {
    reloadbar: "assets/tac/textures/gui/reloadbar.png",
    ammoslots: "assets/tac/textures/gui/ammoslots.png",
    firemodeAuto: "assets/tac/textures/gui/firemode_auto.png",
    firemodeSemi: "assets/tac/textures/gui/firemode_semi.png",
    armorBackdrop: "assets/tac/textures/gui/armor_backdrop.png",
    armorFiller: "assets/tac/textures/gui/armor_filler.png",
  },
  weapons: {
    glock17: "assets/tac/weapons/glock17.png",
    m4: "assets/tac/weapons/m4.png",
    ak47: "assets/tac/weapons/ak47.png",
    awp: "assets/tac/weapons/awp.png",
    p90: "assets/tac/weapons/p90.png",
    deagle_golden: "assets/tac/weapons/deagle_golden.png",
    rpg7: "assets/tac/weapons/rpg7.png",
    m107: "assets/tac/weapons/m107.png",
    m95: "assets/tac/weapons/m95.png",
  },
  weaponModels: {
    p90: "assets/tac/models/p90/p90_model.json",
    glock17: "assets/tac/models/glock17/glock17.json",
    m4: "assets/tac/models/m4/m4.json",
    ak47: "assets/tac/models/ak47/ak47.json",
    awp: "assets/tac/models/awp/awp.json",
    deagle_golden: "assets/tac/models/deagle_golden/deagle_golden.json",
    rpg7: "assets/tac/models/rpg7/rpg7.json",
    m107: "assets/tac/models/m107/m107.json",
    m95: "assets/tac/models/m95/m95.json",
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
  // TaCZ V2 原生 geo 路径（9 把武器全部走原生 Bedrock geo renderer）
  // 阶段 0：补全 5 把旧武器的 geo 路径，文件名用 display 命名空间中的武器名
  taczGeoModels: {
    glock17: "assets/tacz/geo_models/gun/glock_17_geo.json",
    m4: "assets/tacz/geo_models/gun/m4a1_geo.json",
    ak47: "assets/tacz/geo_models/gun/ak47_geo.json",
    awp: "assets/tacz/geo_models/gun/ai_awp_geo.json",
    p90: "assets/tacz/geo_models/gun/p90_geo.json",
    deagle_golden: "assets/tacz/geo_models/gun/deagle_golden_geo.json",
    rpg7: "assets/tacz/geo_models/gun/rpg7_geo.json",
    m107: "assets/tacz/geo_models/gun/m107_geo.json",
    m95: "assets/tacz/geo_models/gun/m95_geo.json",
  },
  // TaCZ V2 原生贴图（diffuse，路径符合 tacz:gun/uv/{weapon} → {weapon}/{weapon}.png 约定）
  taczWeaponTextures: {
    glock17: "assets/tac/textures/glock_17/glock_17.png",
    m4: "assets/tac/textures/m4a1/m4a1.png",
    ak47: "assets/tac/textures/ak47/ak47.png",
    awp: "assets/tac/textures/ai_awp/ai_awp.png",
    p90: "assets/tac/textures/p90/p90.png",
    deagle_golden: "assets/tac/textures/deagle_golden/deagle_golden.png",
    rpg7: "assets/tac/textures/rpg7/rpg7.png",
    m107: "assets/tac/textures/m107/m107.png",
    m95: "assets/tac/textures/m95/m95.png",
  },
  // TaCZ V2 display.json 入口（资源链解析，9 把武器全覆盖）
  taczDisplayJson: {
    glock17: "assets/tacz/display/guns/glock_17_display.json",
    m4: "assets/tacz/display/guns/m4a1_display.json",
    ak47: "assets/tacz/display/guns/ak47_display.json",
    awp: "assets/tacz/display/guns/ai_awp_display.json",
    p90: "assets/tacz/display/guns/p90_display.json",
    deagle_golden: "assets/tacz/display/guns/deagle_golden_display.json",
    rpg7: "assets/tacz/display/guns/rpg7_display.json",
    m107: "assets/tacz/display/guns/m107_display.json",
    m95: "assets/tacz/display/guns/m95_display.json",
  },
};

export const SOUND_PATHS = {
  // 开火音（V2 shoot.ogg）
  glock17Shoot: "assets/tacz/sounds/glock17_shoot.ogg",
  m4Shoot: "assets/tacz/sounds/m4_shoot.ogg",
  ak47Shoot: "assets/tacz/sounds/ak47_shoot.ogg",
  awpShoot: "assets/tacz/sounds/awp_shoot.ogg",
  p90Shoot: "assets/tacz/sounds/p90_shoot.ogg",
  // 空仓换弹（弹匣打空后换弹）
  // Glock17/M4 有完整单文件；AK47/AWP/P90 只有分段音，用 magout+magin 两段
  glock17ReloadEmpty: "assets/tacz/sounds/glock17_reload_empty.ogg",
  m4ReloadEmpty: "assets/tacz/sounds/m4_reload_empty.ogg",
  ak47ReloadEmptyMagout: "assets/tacz/sounds/ak47_reload_empty_magout.ogg",
  ak47ReloadEmptyMagin: "assets/tacz/sounds/ak47_reload_empty_magin.ogg",
  awpReloadEmptyMagout: "assets/tacz/sounds/awp_reload_empty_magout.ogg",
  awpReloadEmptyMagin: "assets/tacz/sounds/awp_reload_empty_magin.ogg",
  p90ReloadEmptyMagout: "assets/tacz/sounds/p90_reload_empty_magout.ogg",
  p90ReloadEmptyMagin: "assets/tacz/sounds/p90_reload_empty_magin.ogg",
  // 战术换弹（弹匣还有子弹时换弹）
  glock17ReloadTactical: "assets/tacz/sounds/glock17_reload_tactical.ogg",
  m4ReloadTactical: "assets/tacz/sounds/m4_reload_tactical.ogg",
  ak47ReloadTacticalMagout: "assets/tacz/sounds/ak47_reload_tactical_magout.ogg",
  ak47ReloadTacticalMagin: "assets/tacz/sounds/ak47_reload_tactical_magin.ogg",
  awpReloadTacticalMagout: "assets/tacz/sounds/awp_reload_tactical_magout.ogg",
  awpReloadTacticalMagin: "assets/tacz/sounds/awp_reload_tactical_magin.ogg",
  p90ReloadTacticalMagout: "assets/tacz/sounds/p90_reload_tactical_magout.ogg",
  p90ReloadTacticalMagin: "assets/tacz/sounds/p90_reload_tactical_magin.ogg",
  // 抽枪音（V2 draw.ogg，每把枪独立）
  glock17Draw: "assets/tacz/sounds/glock17_draw.ogg",
  m4Draw: "assets/tacz/sounds/m4_draw.ogg",
  ak47Draw: "assets/tacz/sounds/ak47_draw.ogg",
  awpDraw: "assets/tacz/sounds/awp_draw.ogg",
  p90Draw: "assets/tacz/sounds/p90_draw.ogg",
  // V2 新增 4 把武器音效
  deagle_goldenShoot: "assets/tacz/sounds/deagle_golden_shoot.ogg",
  deagle_goldenReloadEmptyMagout: "assets/tacz/sounds/deagle_golden_reload_empty_magout.ogg",
  deagle_goldenReloadEmptyMagin: "assets/tacz/sounds/deagle_golden_reload_empty_magin.ogg",
  deagle_goldenReloadTacticalMagout: "assets/tacz/sounds/deagle_golden_reload_tactical_magout.ogg",
  deagle_goldenReloadTacticalMagin: "assets/tacz/sounds/deagle_golden_reload_tactical_magin.ogg",
  deagle_goldenDraw: "assets/tacz/sounds/deagle_golden_draw.ogg",
  rpg7Shoot: "assets/tacz/sounds/rpg7_shoot.ogg",
  rpg7ReloadEmpty: "assets/tacz/sounds/rpg7_reload_empty.ogg",
  rpg7ReloadTactical: "assets/tacz/sounds/rpg7_reload_tactical.ogg",
  rpg7Draw: "assets/tacz/sounds/rpg7_draw.ogg",
  m107Shoot: "assets/tacz/sounds/m107_shoot.ogg",
  m107ReloadEmptyMagout: "assets/tacz/sounds/m107_reload_empty_magout.ogg",
  m107ReloadEmptyMagin: "assets/tacz/sounds/m107_reload_empty_magin.ogg",
  m107ReloadTacticalMagout: "assets/tacz/sounds/m107_reload_tactical_magout.ogg",
  m107ReloadTacticalMagin: "assets/tacz/sounds/m107_reload_tactical_magin.ogg",
  m107Draw: "assets/tacz/sounds/m107_draw.ogg",
  m95Shoot: "assets/tacz/sounds/m95_shoot.ogg",
  m95ReloadEmptyMagout: "assets/tacz/sounds/m95_reload_empty_magout.ogg",
  m95ReloadEmptyMagin: "assets/tacz/sounds/m95_reload_empty_magin.ogg",
  m95ReloadTacticalMagout: "assets/tacz/sounds/m95_reload_tactical_magout.ogg",
  m95ReloadTacticalMagin: "assets/tacz/sounds/m95_reload_tactical_magin.ogg",
  m95Draw: "assets/tacz/sounds/m95_draw.ogg",
  // 旧版通用抽枪音，保留为 fallback
  weaponDraw: "assets/tac/sounds/draw.ogg",
};

// 第一人称视觉分层排查阶段：临时只保留 5 把枪参与运行/加载/切换。
// 其他枪（glock17、awp、p90、rpg7）的配置、资源、动画绑定均保留，仅从运行列表过滤，便于回滚。
export const WEAPON_ORDER = ["deagle_golden", "m107", "m95", "ak47", "m4"];

export const V2_WEAPON_ANIMATION_BINDINGS = {
  glock17: {
    profile: {
      animationPath: "assets/tacz/animations/glock_17.animation.json",
      type: "pistol",
      playerAnimationPath: "assets/tacz/player_animator/pistol_default.player_animation.json",
      idle: "static_idle",
      draw: "draw",
      putAway: "put_away",
      shoot: "shoot",
      reloadTactical: "reload_tactical",
      reloadEmpty: "reload_empty",
      inspect: "inspect",
      inspectEmpty: "inspect_empty",
      staticBoltCaught: "static_bolt_caught",
    },
    boneMap: {
      root: "root",
      rightHand: "righthand",
      leftHand: "lefthand",
      heldMagazine: ["additional_magazine", "mag_and_bullet"],
      magazinePart: ["additional_magazine", "mag_and_bullet"],
      slidePart: "slide",
      constraint: "constraint",
    },
    calibration: { positionScale: 0.034, rootScale: 0.018, handScale: 0.034, heldDistance: 0.28, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
  },
  m4: {
    profile: {
      animationPath: "assets/tacz/animations/m4a1.animation.json",
      type: "rifle",
      playerAnimationPath: "assets/tacz/player_animator/rifle_default.player_animation.json",
      idle: "static_idle",
      draw: "draw",
      putAway: "put_away",
      shoot: "shoot",
      reloadTactical: "reload_tactical",
      reloadEmpty: "reload_empty",
      inspect: "inspect",
      inspectEmpty: "inspect_empty",
      staticBoltCaught: "static_bolt_caught",
    },
    boneMap: {
      root: "root",
      rightHand: "righthand",
      leftHand: "lefthand",
      heldMagazine: "mag_and_lefthand",
      weaponWithRightHand: "gun_and_righthand",
      magazinePart: ["mag_and_lefthand", "additional_magazine"],
      slidePart: ["m4a1_bolt", "m4a1_pull"],
      boltPart: "m4a1_bolt",
      constraint: "constraint",
    },
    calibration: { positionScale: 0.031, rootScale: 0.016, handScale: 0.031, heldDistance: 0.32, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
  },
  ak47: {
    profile: {
      animationPath: "assets/tacz/animations/ak47.animation.json",
      type: "rifle",
      playerAnimationPath: "assets/tacz/player_animator/rifle_default.player_animation.json",
      idle: "static_idle",
      draw: "draw",
      putAway: "put_away",
      shoot: "shoot",
      reloadTactical: "reload_tactical",
      reloadEmpty: "reload_empty",
      inspect: "inspect",
      inspectEmpty: "inspect_empty",
    },
    boneMap: {
      root: "root",
      rightHand: "righthand",
      leftHand: "lefthand",
      heldMagazine: "lefthand_and_mag",
      magazinePart: ["lefthand_and_mag", "additional_magazine", "mag_and_bullet"],
      slidePart: "bolt",
      boltPart: "bolt",
      constraint: "constraint",
    },
    calibration: { positionScale: 0.027, rootScale: 0.015, handScale: 0.03, heldDistance: 0.34, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
  },
  awp: {
    profile: {
      animationPath: "assets/tacz/animations/ai_awp.animation.json",
      type: "sniper",
      playerAnimationPath: "assets/tacz/player_animator/rifle_default.player_animation.json",
      idle: "static_idle",
      draw: "draw",
      putAway: "put_away",
      shoot: "shoot",
      reloadTactical: "reload_tactical",
      reloadEmpty: "reload_empty",
      inspect: "inspect",
      inspectEmpty: "inspect_empty",
      bolt: "bolt",
      staticBoltCaught: "static_bolt_caught",
    },
    boneMap: {
      root: "root",
      rightHand: "righthand",
      leftHand: "lefthand",
      heldMagazine: "mag_and_lefthand",
      weaponWithRightHand: "gun_and_righthand",
      magazinePart: ["mag_and_lefthand", "magzine_and_bullet", "bullet_in_mag"],
      slidePart: ["bolt_group", "bolt_rotate"],
      boltPart: ["bolt_group", "bolt_rotate"],
      constraint: "constraint",
    },
    calibration: { positionScale: 0.026, rootScale: 0.014, handScale: 0.029, heldDistance: 0.3, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
  },
  p90: {
    profile: {
      animationPath: "assets/tacz/animations/p90.animation.json",
      type: "rifle",
      playerAnimationPath: "assets/tacz/player_animator/rifle_default.player_animation.json",
      idle: "static_idle",
      draw: "draw",
      putAway: "put_away",
      shoot: "shoot",
      reloadTactical: "reload_tactical",
      reloadEmpty: "reload_empty",
      inspect: "inspect",
      inspectEmpty: "inspect_empty",
    },
    boneMap: {
      root: "root",
      rightHand: "righthand",
      leftHand: "lefthand",
      heldMagazine: "p90_mag_standard",
      magazinePart: "p90_mag_standard",
      slidePart: ["pull", "ump45_bolt"],
      boltPart: ["pull", "ump45_bolt"],
      constraint: "constraint",
    },
    calibration: { positionScale: 0.026, rootScale: 0.006, rootRotationScale: 0, handScale: 0.028, heldDistance: 0.26, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
  },
  deagle_golden: {
    profile: {
      animationPath: "assets/tacz/animations/deagle_golden.animation.json",
      type: "pistol",
      playerAnimationPath: "assets/tacz/player_animator/pistol_default.player_animation.json",
      idle: "static_idle",
      draw: "draw",
      putAway: "put_away",
      shoot: "shoot",
      reloadTactical: "reload_tactical",
      reloadEmpty: "reload_empty",
      inspect: "inspect",
      inspectEmpty: "inspect_empty",
      staticBoltCaught: "static_bolt_caught",
    },
    boneMap: {
      root: "root",
      rightHand: "righthand",
      leftHand: "lefthand",
      heldMagazine: "mag_and_lefthand",
      weaponWithRightHand: "gun_and_righthand",
      magazinePart: ["mag_and_lefthand", "additional_magazine", "mag_and_bullet"],
      slidePart: "slide2",
      boltPart: "slide2",
      constraint: "constraint",
    },
    // bone 别名：inspect 动画用 Deagle，geo 中是 Deagle_golden
    boneAliases: { "Deagle": "Deagle_golden" },
    calibration: { positionScale: 0.033, rootScale: 0.017, handScale: 0.034, heldDistance: 0.28, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
  },
  rpg7: {
    profile: {
      animationPath: "assets/tacz/animations/rpg7.animation.json",
      type: "launcher",
      playerAnimationPath: "assets/tacz/player_animator/rifle_default.player_animation.json",
      idle: "static_idle",
      draw: "draw",
      putAway: "put_away",
      shoot: "shoot",
      reloadTactical: "reload_empty",
      reloadEmpty: "reload_empty",
      inspect: "inspect",
      inspectEmpty: "inspect_empty",
      staticBoltCaught: "static_bolt_caught",
    },
    boneMap: {
      root: "root",
      rightHand: "righthand",
      leftHand: "lefthand",
      heldRocket: "mag_hand",
      heldMagazine: "mag_hand",
      magazinePart: "rocket",
      constraint: "constraint",
    },
    calibration: { positionScale: 0.023, rootScale: 0.006, rootRotationScale: 0, handScale: 0.027, heldDistance: 0.42, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
  },
  m107: {
    profile: {
      animationPath: "assets/tacz/animations/m107.animation.json",
      type: "sniper",
      playerAnimationPath: "assets/tacz/player_animator/rifle_default.player_animation.json",
      idle: "static_idle",
      draw: "draw",
      putAway: "put_away",
      shoot: "shoot",
      reloadTactical: "reload_tactical",
      reloadEmpty: "reload_empty",
      inspect: "inspect",
      inspectEmpty: "inspect_empty",
    },
    boneMap: {
      root: "root",
      rightHand: "righthand",
      leftHand: "lefthand",
      heldMagazine: ["mags", "mag_and_bullet"],
      magazinePart: ["mags", "mag_and_bullet"],
      slidePart: "bolt",
      boltPart: "bolt",
      // m107 shoot 动画误用 m95_barrel bone 名，实际 geo 中是 gun_barrel
      barrelPart: ["gun_barrel", "m95_barrel"],
      constraint: "constraint",
    },
    // bone 别名：动画 bone 名 → geo bone 名（V2 源 copy-paste 错误修正）
    boneAliases: { "m95_barrel": "gun_barrel" },
    calibration: { positionScale: 0.023, rootScale: 0.006, rootRotationScale: 0, handScale: 0.027, heldDistance: 0.34, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
  },
  m95: {
    profile: {
      animationPath: "assets/tacz/animations/m95.animation.json",
      type: "sniper",
      playerAnimationPath: "assets/tacz/player_animator/rifle_default.player_animation.json",
      idle: "static_idle",
      draw: "draw",
      putAway: "put_away",
      shoot: "shoot",
      reloadTactical: "reload_tactical",
      reloadEmpty: "reload_empty",
      inspect: "inspect",
      inspectEmpty: "inspect_empty",
      bolt: "bolt",
    },
    boneMap: {
      root: "root",
      rightHand: "righthand",
      leftHand: "lefthand",
      heldMagazine: "mag_and_lefthand",
      weaponWithRightHand: "gun_and_righthand",
      magazinePart: ["mag_and_lefthand", "mag_and_bullet"],
      slidePart: ["m95_bolt", "bolt"],
      boltPart: ["m95_bolt", "bolt"],
      constraint: "constraint",
    },
    calibration: { positionScale: 0.022, rootScale: 0.006, rootRotationScale: 0, handScale: 0.026, heldDistance: 0.32, axisMap: ["x", "y", "z"], sign: [1, 1, 1] },
  },
};

// 第一人称 rig 校准数据：9 把武器各含 hipPose/adsPose/inspectPose/握把/枪口/瞄具/缩放等字段。
// 数据从原 modelConfig 推导，hipPose.rotation 已并入 PI Y 翻转（旧 weapon.model.root.rotation=[0,PI,0]）。
// 原 4 把原生武器 modelScale = viewTransform.scale * 1.05（保留旧 weapon.model.root.scaling=1.05 base）。
export const WEAPON_CALIBRATION = {
  glock17: {
    hipPose: { position: [0.56, -0.46, 1.22], rotation: [-0.08, Math.PI - 0.22, 0.02] },
    adsPose: null,
    inspectPose: { position: [0.35, -0.30, 0.60], rotation: [0.15, Math.PI - 0.25, 0.1] },
    rightGrip: [0.12, -0.28, 0.05],
    leftGrip: [0.05, -0.22, 0.25],
    muzzle: [-0.20, 0.12, 0.45],
    aim: [-0.20, 0.12, 0.45],
    screenOffset: [0, 0, 0],
    fovScale: 1,
    modelScale: 1.40,
    handScale: 1,
    rootMotionScale: 1,
  },
  m4: {
    hipPose: { position: [0.56, -0.46, 1.22], rotation: [-0.08, Math.PI - 0.26, 0.02] },
    adsPose: null,
    inspectPose: { position: [0.35, -0.32, 0.65], rotation: [0.15, Math.PI - 0.25, 0.1] },
    rightGrip: [0.15, -0.32, 0.1],
    leftGrip: [0.0, -0.28, 0.35],
    muzzle: [-0.25, 0.20, 0.55],
    aim: [-0.25, 0.20, 0.55],
    screenOffset: [0, 0, 0],
    fovScale: 1,
    modelScale: 0.88,
    handScale: 1,
    rootMotionScale: 1,
  },
  ak47: {
    hipPose: { position: [0.55, -0.46, 1.2], rotation: [-0.08, Math.PI - 0.25, 0.02] },
    adsPose: null,
    inspectPose: { position: [0.35, -0.32, 0.65], rotation: [0.15, Math.PI - 0.25, 0.1] },
    rightGrip: [0.15, -0.32, 0.1],
    leftGrip: [0.0, -0.28, 0.35],
    muzzle: [-0.10, 0.05, 1.1],
    aim: [-0.10, 0.05, 1.1],
    screenOffset: [0, 0, 0],
    fovScale: 1,
    modelScale: 0.92,
    handScale: 1,
    rootMotionScale: 1,
  },
  awp: {
    hipPose: { position: [0.56, -0.46, 1.22], rotation: [-0.08, Math.PI - 0.24, 0.02] },
    adsPose: null,
    inspectPose: { position: [0.35, -0.30, 0.70], rotation: [0.15, Math.PI - 0.25, 0.1] },
    rightGrip: [0.15, -0.3, 0.1],
    leftGrip: [0.0, -0.25, 0.4],
    muzzle: [-0.40, 0.15, 0.20],
    aim: [-0.40, 0.15, 0.20],
    screenOffset: [0, 0, 0],
    fovScale: 1,
    // TaCZ geo 模型默认竖直朝向，identity rotation 下投影 w≈53 偏小，
    // 配合 modelScale=2.5 让 w≈88 达标（rotationOverride 会导致 idle 动画 progress=1 时投影爆炸，故不使用）。
    modelScale: 2.50,
    handScale: 1,
    rootMotionScale: 1,
  },
  p90: {
    hipPose: { position: [0.58, -0.62, 1.18], rotation: [-0.08, Math.PI - 0.2, 0.02] },
    adsPose: null,
    inspectPose: { position: [0.38, -0.45, 0.65], rotation: [0.15, Math.PI - 0.25, 0.1] },
    rightGrip: [0.15, -0.42, 0.15],
    leftGrip: [0.0, -0.38, 0.3],
    muzzle: [-0.35, 0.24, 0.06],
    aim: [-0.35, 0.24, 0.06],
    screenOffset: [0, 0, 0],
    fovScale: 1,
    modelScale: 1.55,
    handScale: 1,
    rootMotionScale: 1,
  },
  deagle_golden: {
    hipPose: { position: [0.54, -0.43, 1.15], rotation: [-0.08, Math.PI - 0.22, 0.02] },
    adsPose: null,
    inspectPose: { position: [0.35, -0.30, 0.60], rotation: [0.15, Math.PI - 0.25, 0.1] },
    rightGrip: [0.12, -0.28, 0.05],
    leftGrip: [0.05, -0.22, 0.25],
    muzzle: [-0.20, 0.12, 0.45],
    aim: [-0.20, 0.12, 0.45],
    screenOffset: [0, 0, 0],
    fovScale: 1,
    modelScale: 1.00 * 1.05,
    handScale: 0.52,
    rootMotionScale: 1.0,
  },
  rpg7: {
    hipPose: { position: [0.57, -0.45, 1.20], rotation: [-0.08, Math.PI - 0.35, 0.02] },
    adsPose: null,
    inspectPose: { position: [0.38, -0.35, 0.70], rotation: [0.15, Math.PI - 0.30, 0.1] },
    rightGrip: [0.15, -0.30, 0.10],
    leftGrip: [0.10, -0.25, 0.30],
    muzzle: [-0.25, 0.10, 0.60],
    aim: [-0.25, 0.10, 0.60],
    screenOffset: [0, 0, 0],
    fovScale: 1,
    modelScale: 1.50 * 1.05,
    handScale: 0.44,
    rootMotionScale: 1.0,
  },
  m107: {
    hipPose: { position: [0.56, -0.46, 1.22], rotation: [-0.08, Math.PI - 0.10, 0.02] },
    adsPose: null,
    inspectPose: { position: [0.35, -0.30, 0.70], rotation: [0.15, Math.PI - 0.25, 0.1] },
    rightGrip: [0.12, -0.28, 0.05],
    leftGrip: [0.05, -0.22, 0.30],
    muzzle: [-0.25, 0.12, 0.55],
    aim: [-0.25, 0.12, 0.55],
    screenOffset: [0, 0, 0],
    fovScale: 1,
    // TaCZ geo 模型在 idle 动画 progress≈0.88 时投影占满屏幕（w=699,h=638,minY=0）。
    // modelScale 从 1.25 大幅降到 0.6 让投影收敛到合理范围（w≈221,h≈193）。
    modelScale: 0.60,
    handScale: 0.42,
    rootMotionScale: 1.0,
  },
  m95: {
    hipPose: { position: [0.56, -0.46, 1.22], rotation: [-0.08, Math.PI - 0.22, 0.02] },
    adsPose: null,
    inspectPose: { position: [0.35, -0.30, 0.70], rotation: [0.15, Math.PI - 0.25, 0.1] },
    rightGrip: [0.12, -0.28, 0.05],
    leftGrip: [0.05, -0.22, 0.30],
    muzzle: [-0.25, 0.12, 0.55],
    aim: [-0.25, 0.12, 0.55],
    screenOffset: [0, 0, 0],
    fovScale: 1,
    modelScale: 0.50,
    handScale: 0.42,
    rootMotionScale: 1.0,
  },
};

// 第一人称 marker 后处理校准：对 TaCZ geo 中的 idle_view / iron_view / lefthand_pos / righthand_pos
// marker position 做 per-weapon 修正。marker rotation 不做 offset（角度加法易破坏朝向）。
// markerScale 仍保留为整体缩放（一般保持 1，仅在坐标系差异明显时使用）。
// invertPosePosition 默认 false：对 idle_view/iron_view position 整体取反（相机 locator 坐标系转换）。
// 实测简单全坐标取反会让 z 变负导致武器飞到相机后方，因此默认不取反，改用 per-weapon hipOffset 微调。
// hipOffset/adsOffset/leftGripOffset/rightGripOffset 在 marker position 处理（取反+缩放）之后叠加。
// 这些值是 TaCZ 原生 geo marker 与本项目第一人称 rig 期望姿态之间的差异校准，不是资源数据。
export const WEAPON_MARKER_CALIBRATION = {
  glock17: { markerScale: 1, invertPosePosition: false, hipOffset: [0, -0.9, 0], adsOffset: [0, 0, 0], leftGripOffset: [0, 0, 0], rightGripOffset: [0, 0, 0] },
  // m4 横向投影飞出右侧（cx=901），hipOffset.x 从 0 大幅改为 -0.5 让武器左移到视口中部
  m4: { markerScale: 1, invertPosePosition: false, hipOffset: [-0.5, -1.3, 0.4], adsOffset: [0, 0, 0], leftGripOffset: [0, 0, 0], rightGripOffset: [0, 0, 0] },
  // ak47 geo 默认竖直，identity 投影 w=83,h=510 达标。rotationOverride 会导致 idle 动画 progress=1 时投影爆炸，故不使用
  ak47: { markerScale: 1, invertPosePosition: false, hipOffset: [0, -0.4, 0.4], adsOffset: [0, 0, 0], leftGripOffset: [0, 0, 0], rightGripOffset: [0, 0, 0] },
  // awp geo 默认竖直，identity 投影 w=53 偏小，配合 modelScale=2.5 让 w≈88 达标。rotationOverride 会导致 idle 动画 progress=1 时投影爆炸，故不使用
  awp: { markerScale: 1, invertPosePosition: false, hipOffset: [0, -0.4, 0], adsOffset: [0, 0, 0], leftGripOffset: [0, 0, 0], rightGripOffset: [0, 0, 0] },
  // p90 横向投影飞出右侧（cx=809），hipOffset.x 从 0 改为 -0.3 让武器左移
  p90: { markerScale: 1, invertPosePosition: false, hipOffset: [-0.3, -1.1, 0], adsOffset: [0, 0, 0], leftGripOffset: [0, 0, 0], rightGripOffset: [0, 0, 0] },
  // deagle geo 默认竖直，rotationOverride=(0,π/2,0) 转成横向，投影 w=314,h=111 合理
  deagle_golden: { markerScale: 1, invertPosePosition: false, hipOffset: [0, -0.8, 0], adsOffset: [0, 0, 0], leftGripOffset: [0, 0, 0], rightGripOffset: [0, 0, 0], rotationOverride: [0, Math.PI / 2, 0] },
  // rpg7 geo 默认竖直，rotationOverride=(0,π/2,0) 转成横向，投影 w=354,h=71 合理
  rpg7: { markerScale: 1, invertPosePosition: false, hipOffset: [0, -0.7, 0], adsOffset: [0, 0, 0], leftGripOffset: [0, 0, 0], rightGripOffset: [0, 0, 0], rotationOverride: [0, Math.PI / 2, 0] },
  m107: { markerScale: 1, invertPosePosition: false, hipOffset: [0, -1.3, 0], adsOffset: [0, 0, 0], leftGripOffset: [0, 0, 0], rightGripOffset: [0, 0, 0] },
  // m95 geo 默认竖直，rotationOverride=(0,π,π/2) 转成斜向投影。hipOffset.x 从 0 改为 -0.5 让 cx 从 898 回到视口内
  m95: { markerScale: 1, invertPosePosition: false, hipOffset: [-0.5, -1.2, 0], adsOffset: [0, 0, 0], leftGripOffset: [0, 0, 0], rightGripOffset: [0, 0, 0], rotationOverride: [0, Math.PI, Math.PI / 2] },
};

// Phase2 纯静态枪模验收专用姿态：只在 URL ?taczStatic=1 / pureStatic 模式生效。
// 不复用普通 hipOffset 或 WEAPON_MARKER_CALIBRATION，避免把静态验收校准带入 Phase3 射击、ADS 和换弹动画。
export const PHASE2_STATIC_WEAPONS = ["deagle_golden", "m107", "m95", "ak47", "m4"];

export const PHASE2_STATIC_POSE_CALIBRATION = {
  m4: { position: [-0.30, -0.25, 1.35], rotation: [0, 0, 0] },
  ak47: { position: [-0.18, -0.34, 1.15], rotation: [0, 0, 0] },
  m95: { position: [-0.30, -0.28, 1.40], rotation: [0, Math.PI, Math.PI / 2] },
  m107: { position: [0.08, -0.32, 1.55], rotation: [0, 0, 0] },
};

// 9 把武器全部走 TaCZ 原生 Bedrock geo + animation 路径（Phase 5 统一迁移）
export const TAIZ_NATIVE_WEAPONS = ["glock17", "m4", "ak47", "awp", "p90", "deagle_golden", "rpg7", "m107", "m95"];

export function isTaczNativeWeapon(weaponId) {
  return TAIZ_NATIVE_WEAPONS.includes(weaponId);
}

export const WEAPON_CONFIG = {
  glock17: {
    id: "glock17",
    label: "Glock 17",
    slot: 1,
    magazineSize: 17,
    reloadDuration: 1.88,
    fireInterval: 60 / 400,
    automatic: false,
    bodyDamage: 6,
    headShotMultiplier: 1.5,
    recoil: 0.74,
    cameraKick: 0.004,
    fireSound: "glock17Shoot",
    reloadEmptySound: "glock17ReloadEmpty",
    reloadTacticalSound: "glock17ReloadTactical",
    drawSound: "glock17Draw",
    // 空仓/战术换弹配置：duration=总时长(V2 cooldown)，feedTime=弹匣插入时间点(V2 feed)，soundScheme=single(单文件)/segmented(magout+magin 两段)
    reloadEmpty:    { duration: 1.88, feedTime: 1.63, soundScheme: "single" },
    reloadTactical: { duration: 1.50, feedTime: 1.05, soundScheme: "single" },
    iconPath: ASSET_PATHS.weapons.glock17,
    tracerInterval: 1,
    // 像素准星：手枪用 dot（单点，精准瞄准）
    crosshair: { image: ASSET_PATHS.crosshair.dot },
    // 3D 模型配置：position/rotation/scaling 控制模型在相机坐标系中的变换，
    // muzzleLocalPosition 是枪口锚点在武器 root 下的位置，枪口火焰会跟随该锚点。
    modelConfig: {
      position: [0.54, -0.43, 1.15],
      rotation: [-0.08, -0.22, 0.02],
      scaling: 0.95,
      // 手枪枪管短，锚点略前推到枪口位置
      muzzleLocalPosition: [-0.20, 0.12, 0.45],
      // 方块手锚点（武器 root 坐标系）：右手握把，左手换弹时伸向弹匣
      handAnchors: {
        rightHand: [0.12, -0.28, 0.05],
        leftHand: [0.05, -0.22, 0.25],
      },
      // 换弹部件绑定：显式 element index 列表驱动弹匣/套筒 pivot，避免 yRange 粗筛误选枪身。
      reloadParts: {
        magazine: {
          elementIndices: [81, 82, 83, 86, 88],
          animation: { sourcePart: "magazine", distance: 0.18, axisMap: ["x", "y", "z"], sign: [1, 1, 1], returnToBaseAtEnd: true },
        },
        slide: {
          elementIndices: [112, 113, 117, 118, 119, 120, 121, 122, 123, 124],
          animation: { sourcePart: "slide", distance: 0.08, axisMap: ["x", "y", "z"], sign: [1, 1, 1], rotationScale: 1 },
        },
      },
    },
    // 枪口火焰视觉参数：size=世界单位大小，alpha=透明度，rotationRandom=每次开火贴图随机旋转弧度
    muzzleFlash: { size: 0.22, alpha: 0.8, rotationRandom: Math.PI * 2 },
  },
  m4: {
    id: "m4",
    label: "M4",
    slot: 2,
    magazineSize: 30,
    reloadDuration: 2.20,
    fireInterval: 60 / 810,
    automatic: true,
    bodyDamage: 6.5,
    headShotMultiplier: 1.5,
    recoil: 0.52,
    cameraKick: 0.003,
    fireSound: "m4Shoot",
    reloadEmptySound: "m4ReloadEmpty",
    reloadTacticalSound: "m4ReloadTactical",
    drawSound: "m4Draw",
    reloadEmpty:    { duration: 2.20, feedTime: 1.87, soundScheme: "single" },
    reloadTactical: { duration: 1.87, feedTime: 1.40, soundScheme: "single" },
    iconPath: ASSET_PATHS.weapons.m4,
    tracerInterval: 2,
    // 像素准星：步枪用 round（圆形+中心十字，清晰瞄准）
    crosshair: { image: ASSET_PATHS.crosshair.round },
    // 3D 模型配置：步枪比手枪大，保持右下角可见且不压住准星。
    modelConfig: {
      position: [0.56, -0.46, 1.22],
      rotation: [-0.08, -0.26, 0.02],
      scaling: 1.08,
      muzzleLocalPosition: [-0.25, 0.20, 0.55],
      handAnchors: {
        rightHand: [0.15, -0.32, 0.1],
        leftHand: [0.0, -0.28, 0.35],
      },
      reloadParts: {
        magazine: {
          elementIndices: [148, 170, 171, 172, 189, 191],
          animation: { sourcePart: "magazine", distance: 0.2, axisMap: ["x", "y", "z"], sign: [1, 1, 1], returnToBaseAtEnd: true },
        },
      },
    },
    // M4 枪火保持当前视觉，仅补配置避免回归
    muzzleFlash: { size: 0.32, alpha: 0.85, rotationRandom: Math.PI * 2 },
  },
  ak47: {
    id: "ak47",
    label: "AK47",
    slot: 3,
    magazineSize: 30,
    reloadDuration: 2.60,
    fireInterval: 60 / 600,
    automatic: true,
    bodyDamage: 9,
    headShotMultiplier: 1.5,
    recoil: 0.68,
    cameraKick: 0.004,
    fireSound: "ak47Shoot",
    // AK47 无 reload 单文件，用 magout+magin 两段音
    reloadEmptySound: { magout: "ak47ReloadEmptyMagout", magin: "ak47ReloadEmptyMagin" },
    reloadTacticalSound: { magout: "ak47ReloadTacticalMagout", magin: "ak47ReloadTacticalMagin" },
    drawSound: "ak47Draw",
    reloadEmpty:    { duration: 2.60, feedTime: 2.25, soundScheme: "segmented" },
    reloadTactical: { duration: 2.00, feedTime: 1.55, soundScheme: "segmented" },
    iconPath: ASSET_PATHS.weapons.ak47,
    tracerInterval: 2,
    // 像素准星：AK47 用 better_default（精细十字，高后坐力武器配清晰准星）
    crosshair: { image: ASSET_PATHS.crosshair.better },
    // 3D 模型配置：步枪比手枪大，保持右下角可见且不压住准星。
    modelConfig: {
      position: [0.55, -0.46, 1.2],
      rotation: [-0.08, -0.25, 0.02],
      scaling: 1.12,
      muzzleLocalPosition: [-0.10, 0.05, 1.1],
      handAnchors: {
        rightHand: [0.15, -0.32, 0.1],
        leftHand: [0.0, -0.28, 0.35],
      },
      reloadParts: {
        magazine: {
          elementIndices: [84, 85, 88, 92],
          animation: { sourcePart: "magazine", distance: 0.22, axisMap: ["x", "y", "z"], sign: [1, 1, 1], returnToBaseAtEnd: true },
        },
        slide: {
          elementIndices: [5, 6, 24, 204, 210, 211],
          animation: { sourcePart: "slide", distance: 0.08, axisMap: ["x", "y", "z"], sign: [1, 1, 1], rotationScale: 1 },
        },
      },
    },
    // AK47 枪火保持当前视觉，仅补配置避免回归
    muzzleFlash: { size: 0.34, alpha: 0.85, rotationRandom: Math.PI * 2 },
  },
  awp: {
    id: "awp",
    label: "AWP",
    slot: 4,
    magazineSize: 5,
    reloadDuration: 3.25,
    fireInterval: 60 / 171,
    automatic: false,
    bodyDamage: 42,
    headShotMultiplier: 2,
    recoil: 1.1,
    cameraKick: 0.008,
    fireSound: "awpShoot",
    // AWP 无 reload 单文件，用 magout+magin 两段音
    reloadEmptySound: { magout: "awpReloadEmptyMagout", magin: "awpReloadEmptyMagin" },
    reloadTacticalSound: { magout: "awpReloadTacticalMagout", magin: "awpReloadTacticalMagin" },
    drawSound: "awpDraw",
    reloadEmpty:    { duration: 3.25, feedTime: 2.85, soundScheme: "segmented" },
    reloadTactical: { duration: 2.25, feedTime: 2.05, soundScheme: "segmented" },
    iconPath: ASSET_PATHS.weapons.awp,
    tracerInterval: 1,
    // 像素准星：AWP 不用普通准星，右键开镜时显示瞄准镜蒙版
    crosshair: { image: ASSET_PATHS.crosshair.dot, hiddenByAds: true },
    // AWP 开镜配置：fov=开镜后视野角度，sensitivityScale=鼠标灵敏度倍率
    ads: { fov: 0.35, sensitivityScale: 0.5 },
    // 3D 模型配置：狙击枪更长，缩放更克制以减少热栏遮挡。
    modelConfig: {
      position: [0.55, -0.42, 1.28],
      rotation: [-0.08, -0.24, 0.02],
      scaling: 1.15,
      // AWP 枪管长，锚点大幅前推到长枪管前端，避免落在枪身中段
      muzzleLocalPosition: [-0.40, 0.15, 0.20],
      handAnchors: {
        rightHand: [0.15, -0.3, 0.1],
        leftHand: [0.0, -0.25, 0.4],
      },
      reloadParts: {
        magazine: {
          elementIndices: [300, 302, 303, 304, 305, 306, 307, 308, 309, 310, 313],
          animation: { sourcePart: "magazine", distance: 0.18, axisMap: ["x", "y", "z"], sign: [1, 1, 1], returnToBaseAtEnd: true },
        },
        slide: {
          elementIndices: [177, 178, 179, 180, 181],
          animation: { sourcePart: "slide", distance: 0.08, axisMap: ["x", "y", "z"], sign: [1, 1, 1], rotationScale: 1 },
        },
      },
    },
    // AWP 枪火略大，配合长枪管视觉
    muzzleFlash: { size: 0.38, alpha: 0.82, rotationRandom: Math.PI * 2 },
  },
  p90: {
    id: "p90",
    label: "P90",
    slot: 5,
    magazineSize: 50,
    reloadDuration: 3.04,
    fireInterval: 60 / 810,
    automatic: true,
    bodyDamage: 5.5,
    headShotMultiplier: 1.25,
    recoil: 0.46,
    cameraKick: 0.0028,
    fireSound: "p90Shoot",
    // P90 无 reload 单文件，用 magout+magin 两段音
    reloadEmptySound: { magout: "p90ReloadEmptyMagout", magin: "p90ReloadEmptyMagin" },
    reloadTacticalSound: { magout: "p90ReloadTacticalMagout", magin: "p90ReloadTacticalMagin" },
    drawSound: "p90Draw",
    reloadEmpty:    { duration: 3.04, feedTime: 2.45, soundScheme: "segmented" },
    reloadTactical: { duration: 2.71, feedTime: 2.01, soundScheme: "segmented" },
    iconPath: ASSET_PATHS.weapons.p90,
    modelPath: ASSET_PATHS.weaponModels.p90,
    tracerInterval: 2,
    // 像素准星：冲锋枪用 circle（圆圈，近距离快速瞄准）
    crosshair: { image: ASSET_PATHS.crosshair.circle },
    modelConfig: {
      position: [0.58, -0.62, 1.18],
      rotation: [-0.08, -0.2, 0.02],
      scaling: 1.28,
      // P90 紧凑 PDW，锚点前推贴近枪口，避免贴在枪身中间或热栏附近
      muzzleLocalPosition: [-0.35, 0.24, 0.06],
      handAnchors: {
        rightHand: [0.15, -0.42, 0.15],
        leftHand: [0.0, -0.38, 0.3],
      },
      reloadParts: {
        magazine: {
          elementIndices: [
            79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94,
            95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
            109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122,
          ],
          animation: { sourcePart: "magazine", distance: 0.2, axisMap: ["x", "y", "z"], sign: [1, 1, 1], returnToBaseAtEnd: true },
        },
      },
    },
    // P90 枪火中等大小，配合紧凑枪身
    muzzleFlash: { size: 0.3, alpha: 0.82, rotationRandom: Math.PI * 2 },
  },
  // ===== V2 新增 4 把武器 =====
  deagle_golden: {
    id: "deagle_golden",
    label: "黄金沙鹰",
    slot: 6,
    magazineSize: 9,
    reloadDuration: 2.00,
    fireInterval: 60 / 350,
    automatic: false,
    bodyDamage: 12,
    headShotMultiplier: 1.8,
    recoil: 1.6,
    cameraKick: 0.012,
    fireSound: "deagle_goldenShoot",
    reloadEmptySound: { magout: "deagle_goldenReloadEmptyMagout", magin: "deagle_goldenReloadEmptyMagin" },
    reloadTacticalSound: { magout: "deagle_goldenReloadTacticalMagout", magin: "deagle_goldenReloadTacticalMagin" },
    drawSound: "deagle_goldenDraw",
    reloadEmpty:    { duration: 2.00, feedTime: 1.65, soundScheme: "segmented" },
    reloadTactical: { duration: 1.64, feedTime: 1.30, soundScheme: "segmented" },
    iconPath: ASSET_PATHS.weapons.deagle_golden,
    tracerInterval: 1,
    crosshair: { image: ASSET_PATHS.crosshair.dot },
    modelConfig: {
      position: [0.54, -0.43, 1.15],
      rotation: [-0.08, -0.22, 0.02],
      scaling: 1.00,
      muzzleLocalPosition: [-0.20, 0.12, 0.45],
      handAnchors: {
        rightHand: [0.12, -0.28, 0.05],
        leftHand: [0.05, -0.22, 0.25],
      },
      // 第一人称 transform 标准（TaCZ 原生路径使用）
      // scale 与旧 modelConfig.scaling 一致，weapon.model.root.scaling=1.05 提供 base 缩放
      viewTransform: {
        position: [0.54, -0.43, 1.15],
        rotation: [-0.08, -0.22, 0.02],
        scale: 1.00,
        handScale: 0.52,
        rootMotionScale: 1.0,
      },
      // 原生武器走 taczBoneMap 驱动 bone，reloadParts.elementIndices 不再生效
      reloadParts: {},
    },
    muzzleFlash: { size: 0.28, alpha: 0.85, rotationRandom: Math.PI * 2 },
  },
  rpg7: {
    id: "rpg7",
    label: "RPG-7",
    slot: 7,
    magazineSize: 1,
    reloadDuration: 3.20,
    fireInterval: 60 / 150,
    automatic: false,
    bodyDamage: 20,
    headShotMultiplier: 1,
    recoil: 2.5,
    cameraKick: 0.02,
    fireSound: "rpg7Shoot",
    reloadEmptySound: "rpg7ReloadEmpty",
    reloadTacticalSound: "rpg7ReloadTactical",
    drawSound: "rpg7Draw",
    reloadEmpty:    { duration: 3.20, feedTime: 2.50, soundScheme: "single" },
    reloadTactical: { duration: 3.20, feedTime: 2.50, soundScheme: "single" },
    iconPath: ASSET_PATHS.weapons.rpg7,
    tracerInterval: 1,
    crosshair: { image: "assets/tac/textures/crosshair/rpg7.png" },
    modelConfig: {
      position: [0.57, -0.45, 1.20],
      rotation: [-0.08, -0.35, 0.02],
      scaling: 1.95,
      muzzleLocalPosition: [-0.25, 0.10, 0.60],
      handAnchors: {
        rightHand: [0.15, -0.30, 0.10],
        leftHand: [0.10, -0.25, 0.30],
      },
      viewTransform: {
        position: [0.57, -0.45, 1.20],
        rotation: [-0.08, -0.35, 0.02],
        scale: 1.50,
        handScale: 0.44,
        rootMotionScale: 1.0,
      },
      reloadParts: {},
    },
    muzzleFlash: { size: 0.40, alpha: 0.9, rotationRandom: Math.PI * 2 },
    // RPG7 爆炸 AoE：直击伤害 20，命中后爆炸 120 伤害半径 3
    explosion: { damage: 120, radius: 3, knockback: true },
  },
  m107: {
    id: "m107",
    label: "M107",
    slot: 8,
    magazineSize: 10,
    reloadDuration: 5.25,
    fireInterval: 60 / 400,
    automatic: false,
    bodyDamage: 55,
    headShotMultiplier: 1.5,
    recoil: 1.8,
    cameraKick: 0.015,
    fireSound: "m107Shoot",
    reloadEmptySound: { magout: "m107ReloadEmptyMagout", magin: "m107ReloadEmptyMagin" },
    reloadTacticalSound: { magout: "m107ReloadTacticalMagout", magin: "m107ReloadTacticalMagin" },
    drawSound: "m107Draw",
    reloadEmpty:    { duration: 5.25, feedTime: 4.20, soundScheme: "segmented" },
    reloadTactical: { duration: 4.35, feedTime: 3.50, soundScheme: "segmented" },
    iconPath: ASSET_PATHS.weapons.m107,
    tracerInterval: 1,
    crosshair: { image: ASSET_PATHS.crosshair.dot, hiddenByAds: true },
    ads: { fov: 0.35, sensitivityScale: 0.5 },
    modelConfig: {
      position: [0.54, -0.43, 1.20],
      rotation: [-0.08, -0.22, 0.02],
      scaling: 1.65,
      muzzleLocalPosition: [-0.25, 0.12, 0.55],
      handAnchors: {
        rightHand: [0.12, -0.28, 0.05],
        leftHand: [0.05, -0.22, 0.30],
      },
      viewTransform: {
        position: [0.54, -0.43, 1.20],
        rotation: [-0.08, -0.22, 0.02],
        scale: 1.00,
        handScale: 0.42,
        rootMotionScale: 1.0,
      },
      // 原生武器走 taczBoneMap 驱动 bone，reloadParts.elementIndices 不再生效
      reloadParts: {},
    },
    muzzleFlash: { size: 0.35, alpha: 0.85, rotationRandom: Math.PI * 2 },
  },
  m95: {
    id: "m95",
    label: "M95",
    slot: 9,
    magazineSize: 5,
    reloadDuration: 5.23,
    fireInterval: 60 / 151,
    automatic: false,
    bodyDamage: 75,
    headShotMultiplier: 2.5,
    bolt: true,
    recoil: 2.2,
    cameraKick: 0.018,
    fireSound: "m95Shoot",
    reloadEmptySound: { magout: "m95ReloadEmptyMagout", magin: "m95ReloadEmptyMagin" },
    reloadTacticalSound: { magout: "m95ReloadTacticalMagout", magin: "m95ReloadTacticalMagin" },
    drawSound: "m95Draw",
    reloadEmpty:    { duration: 5.23, feedTime: 4.10, soundScheme: "segmented" },
    reloadTactical: { duration: 4.07, feedTime: 3.20, soundScheme: "segmented" },
    iconPath: ASSET_PATHS.weapons.m95,
    tracerInterval: 1,
    crosshair: { image: ASSET_PATHS.crosshair.dot, hiddenByAds: true },
    ads: { fov: 0.35, sensitivityScale: 0.5 },
    modelConfig: {
      position: [0.54, -0.43, 1.20],
      rotation: [-0.08, -0.22, 0.02],
      scaling: 2.05,
      muzzleLocalPosition: [-0.25, 0.12, 0.55],
      handAnchors: {
        rightHand: [0.12, -0.28, 0.05],
        leftHand: [0.05, -0.22, 0.30],
      },
      viewTransform: {
        position: [0.54, -0.43, 1.20],
        rotation: [-0.08, -0.22, 0.02],
        scale: 1.00,
        handScale: 0.42,
        rootMotionScale: 1.0,
      },
      // 原生武器走 taczBoneMap 驱动 bone，reloadParts.elementIndices 不再生效
      reloadParts: {},
    },
    muzzleFlash: { size: 0.35, alpha: 0.85, rotationRandom: Math.PI * 2 },
  },
};

for (const [weaponId, binding] of Object.entries(V2_WEAPON_ANIMATION_BINDINGS)) {
  if (!WEAPON_CONFIG[weaponId]) continue;
  WEAPON_CONFIG[weaponId].v2AnimationProfile = binding.profile;
  WEAPON_CONFIG[weaponId].v2BoneMap = binding.boneMap;
  WEAPON_CONFIG[weaponId].v2PoseCalibration = binding.calibration;
  if (binding.boneAliases) WEAPON_CONFIG[weaponId].v2BoneAliases = binding.boneAliases;
}

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

// 武器试验场配置：无敌人/倒计时/基地血量，只保留地面+弹道墙+弹孔+数据看板
export const WEAPON_LAB_CONFIG = {
  wallDistance: 12,          // 弹道墙距玩家相机的 Z 距离（玩家在 z=12，墙在 z=0 附近）
  wallWidth: 20,
  wallHeight: 8,
  groundSize: 40,
  // 弹孔 Decal 参数
  bulletHole: {
    size: 0.18,              // Decal 三维尺寸（世界单位）
    maxCount: 200,           // 滚动上限，超出清除最早的，防性能崩
    zOffset: -2,             // 防 z-fighting，让弹孔贴在墙面上方
  },
  // 玩家初始位（与靶场一致，便于复用相机/碰撞）
  playerStart: { x: 0, y: 2.25, z: 12 },
  cameraTarget: { x: 0, y: 2.1, z: -24 },
  // weaponLab 玩家活动边界：groundSize=40 地面从 -20 到 20，
  // 弹道墙在 z=0 附近，玩家活动区限制在墙前 z∈[-2,18]，x 限制在 ±18 避免走出地面边缘。
  playerBounds: { x: 18, zMin: -2, zMax: 18 },
  // 死靶模式参数（阶段 3）
  dummyMaxCount: 8,            // 死靶上限，超出滚动清除最早的
  dummyRespawnSeconds: 3,      // 死靶被击死后原地重生时间
  // 敌人模式参数（阶段 4）：按 B 启动 60s 生存挑战，敌人追踪玩家
  enemyMode: {
    duration: 60,                // 生存时长（秒）
    maxTargets: 8,               // 同屏敌人上限
    playerHP: 200,                // 玩家生命值（敌人 HP=100 后提升至 200 保持生存体验）
    damagePerReach: 40,           // 每次接触玩家扣血量（200 HP / 40 = 5 次接触阵亡，保持原 5 HP/1 伤害生存节奏）
    spawnZ: -18,                 // 敌人生成 z 坐标（地面边缘，墙后方）
    goalZ: 18,                    // 兜底清理边界（玩家 z=12，contactRange 接触判定已够，goalZ 仅防穿透）
    contactRange: 1.6,           // 接触判定距离（玩家半径 0.62 + 敌人半径 0.9 + 容差 0.08）
    playerDamageCooldown: 0.8,   // 玩家受击无敌时长（秒），避免连续帧扣血
    firstSpawnDelay: 0.5,        // 模式开始后首次刷怪延迟
  },
  // 动靶模式参数（阶段 5）：按 V 启动 3 路线动靶（horizontal/circular/pendulum）
  movingTarget: {
    count: 3,              // 同屏动靶数量（3 条路线各 1 个）
    zPosition: 6,          // 动靶中心 z（相机射线在此 z 命中 head hitbox）
    xRange: 7,             // horizontal 路线 x 振幅（±xRange）
    circularRadius: 4,     // circular 路线半径
    pendulumRange: 5,      // pendulum 路线 z 振幅（从 zPosition 向前弹）
    moveSpeed: 1.2,        // 振荡角速度（弧度/秒），周期 ≈ 2π/1.2 ≈ 5.2s
    respawnDelay: 0.5,      // 击杀后重生延迟（秒）
  },
};
