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
  },
  weaponModels: {
    p90: "assets/tac/models/p90/p90_model.json",
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
    },
    // 枪口火焰视觉参数：size=世界单位大小，alpha=透明度，rotationRandom=每次开火贴图随机旋转弧度
    muzzleFlash: { size: 0.22, alpha: 0.8, rotationRandom: Math.PI * 2 },
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
    // 像素准星：步枪用 round（圆形+中心十字，清晰瞄准）
    crosshair: { image: ASSET_PATHS.crosshair.round },
    // 3D 模型配置：步枪比手枪大，保持右下角可见且不压住准星。
    modelConfig: {
      position: [0.56, -0.46, 1.22],
      rotation: [-0.08, -0.26, 0.02],
      scaling: 1.08,
      muzzleLocalPosition: [-0.25, 0.20, 0.55],
    },
    // M4 枪火保持当前视觉，仅补配置避免回归
    muzzleFlash: { size: 0.32, alpha: 0.85, rotationRandom: Math.PI * 2 },
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
    // 像素准星：AK47 用 better_default（精细十字，高后坐力武器配清晰准星）
    crosshair: { image: ASSET_PATHS.crosshair.better },
    // 3D 模型配置：步枪比手枪大，保持右下角可见且不压住准星。
    modelConfig: {
      position: [0.55, -0.46, 1.2],
      rotation: [-0.08, -0.25, 0.02],
      scaling: 1.12,
      muzzleLocalPosition: [-0.10, 0.05, 1.1],
    },
    // AK47 枪火保持当前视觉，仅补配置避免回归
    muzzleFlash: { size: 0.34, alpha: 0.85, rotationRandom: Math.PI * 2 },
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
    },
    // AWP 枪火略大，配合长枪管视觉
    muzzleFlash: { size: 0.38, alpha: 0.82, rotationRandom: Math.PI * 2 },
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
    // 像素准星：冲锋枪用 circle（圆圈，近距离快速瞄准）
    crosshair: { image: ASSET_PATHS.crosshair.circle },
    modelConfig: {
      position: [0.58, -0.62, 1.18],
      rotation: [-0.08, -0.2, 0.02],
      scaling: 1.15,
      // P90 紧凑 PDW，锚点前推贴近枪口，避免贴在枪身中间或热栏附近
      muzzleLocalPosition: [-0.35, 0.24, 0.06],
    },
    // P90 枪火中等大小，配合紧凑枪身
    muzzleFlash: { size: 0.3, alpha: 0.82, rotationRandom: Math.PI * 2 },
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
  // 敌人模式参数（阶段 4）：按 B 启动 60s 生存挑战
  enemyMode: {
    duration: 60,           // 生存时长（秒）
    maxTargets: 8,          // 同屏敌人上限
    playerHP: 5,            // 玩家生命值
    damagePerReach: 1,      // 每个抵达玩家的敌人扣血量
    spawnZ: -18,            // 敌人生成 z 坐标（地面边缘，墙后方）
    goalZ: 10,              // 敌人抵达此 z 视为到达玩家位置（玩家初始 z=12）
    firstSpawnDelay: 0.5,   // 模式开始后首次刷怪延迟
  },
  // 动靶模式参数（阶段 5）：按 V 启动水平振荡靶，练跟枪
  movingTarget: {
    count: 3,           // 同屏动靶数量
    zPosition: 6,       // 动靶固定 z（相机射线在此 z 命中 head hitbox）
    xRange: 7,          // 水平振荡幅度（±xRange）
    moveSpeed: 1.2,     // 振荡角速度（弧度/秒），周期 ≈ 2π/1.2 ≈ 5.2s
    respawnDelay: 0.5,  // 击杀后重生延迟（秒）
  },
};
