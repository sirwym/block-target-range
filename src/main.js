import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { ASSET_PATHS, GAME_CONFIG, WEAPON_CONFIG, WEAPON_ORDER, WEAPON_LAB_CONFIG, getRating, getWaveProfile } from "./config.js";
import {
  CREEPER_SKIN_UV,
  ZOMBIE_SKIN_UV,
  colorMaterial,
  createSkinPatchTexture,
  createSkyTexture,
  loadTextures,
  materialFromTexture,
} from "./assets.js";
import { animateTarget, spawnTarget, updateTarget } from "./actors.js";
import { applyDefeatCombo, decayCombo, getHitResult, scoreDefeat, shouldShowCombo } from "./combat.js";
import { resolveCircleCollision } from "./collision.js";
import { ensureAudio, playSound } from "./audio.js";
import { consumeJumpRequest, updateJumpState } from "./player.js";
import {
  createWeaponState,
  fireWeapon,
  getCurrentWeapon,
  selectWeapon,
  setTriggerHeld,
  startReload,
  updateWeaponState,
} from "./weapon.js";
import { createWeaponModel, updateWeaponModel } from "./weaponModel.js";
import { buildLighting, createWorld, updateCrystal } from "./world.js";
import {
  addBlockChips,
  addHitSpark,
  createBreakParticles,
  createFloatingText,
  flashBlock,
  flashMaterials,
  spawnProjectileTrail,
  updateTemporaryMeshes,
} from "./effects.js";
import { clearCrosshair, createGameUi, hideArenaHud, hideResult, setCrosshair, setCrosshairForWeapon, showCombo, showResult, showStart, updateHitMarker, updateHud } from "./ui.js";
import { createWeaponLab } from "./weaponLab.js";

const canvas = document.querySelector("#game");
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.48, 0.73, 1, 1);
scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
scene.fogColor = new BABYLON.Color3(0.59, 0.78, 1);
scene.fogStart = 40;
scene.fogEnd = 105;
scene.collisionsEnabled = true;

const camera = new BABYLON.UniversalCamera("player-camera", new BABYLON.Vector3(0, 2.25, 12), scene);
camera.fov = BABYLON.Tools.ToRadians(72);
const DEFAULT_FOV = camera.fov; // AWP 开镜/关镜时 lerp 回这个值
const DEFAULT_ANGULAR_SENSIBILITY = camera.angularSensibility; // 开镜降低灵敏度时 lerp 回这个值
camera.minZ = 0.1;
camera.maxZ = 180;
camera.speed = 0;
camera.inertia = 0.15;
camera.checkCollisions = true;
camera.ellipsoid = new BABYLON.Vector3(GAME_CONFIG.playerRadius, 1.1, GAME_CONFIG.playerRadius);
camera.keysUp = [];
camera.keysDown = [];
camera.keysLeft = [];
camera.keysRight = [];
camera.attachControl(canvas, true);
// 移除右键(button 2)从相机拖拽按钮列表，避免右键被 Babylon 当作相机拖拽
// 右键专用于 AWP 开镜切换，不能让相机输入抢占
const pointersInput = camera.inputs.attached.pointers;
if (pointersInput) {
  pointersInput.buttons = [0];
}
camera.setTarget(new BABYLON.Vector3(0, 2.1, -24));

// query 解析提前到 world 创建之前，weaponLabMode 决定是否建靶场环境
const query = new URLSearchParams(window.location.search);
const weaponLabMode = query.get("mode") === "weaponLab";
const debugHitbox = query.has("debugHitbox");
const debugActor = query.has("debugActor");
const debugWeapon = query.has("debugWeapon");
const e2eMode = query.has("e2e");
const textures = loadTextures(scene);
buildLighting(scene);
const sky = BABYLON.MeshBuilder.CreateSphere("sky-dome", { diameter: 170, segments: 16 }, scene);
sky.material = materialFromTexture(scene, createSkyTexture(scene));
sky.material.backFaceCulling = false;
sky.isPickable = false;
// weaponLab 不建靶场环境（地面/围墙/基地水晶），只建空数组供 weaponLab 注册碰撞
const world = weaponLabMode ? { solidColliders: [], solidMeshes: [], baseCrystal: null } : createWorld(scene, textures);

const ui = createGameUi(scene, {
  onStart: startGame,
  onRestart: restartGame,
  weaponLabMode,
});

const keys = new Set();
const targets = [];
const previewMobs = [];
const projectiles = [];
const effects = [];
const debugMeshes = [];
const muzzleFlashDuration = e2eMode ? 2 : 0.055;

let muzzleFlashPlane;
const weaponModels = {}; // 通用 3D 武器模型控制器，按 weaponId 索引
let debugWeaponLabel;
let weaponLab;             // weaponLab 模式下的试验场控制器
let wasReloading = false;  // 检测换弹边沿（true→false 时 commit magazine 统计）
let lastTime = performance.now();

const state = {
  mode: "preview",
  score: 0,
  hits: 0,
  combo: 0,
  bestCombo: 0,
  comboTimer: 0,
  timeLeft: GAME_CONFIG.duration,
  baseHealth: GAME_CONFIG.baseHealth,
  spawnTimer: 0.4,
  shootCooldown: 0,
  weaponAnimTimer: 0,
  weaponRecoil: 0,
  muzzleFlashTimer: 0,
  weapons: createWeaponState(WEAPON_ORDER, WEAPON_CONFIG),
  playerY: GAME_CONFIG.playerGroundY,
  verticalVelocity: 0,
  grounded: true,
  jumpRequested: false,
  introTimer: 0,
  crosshairHitTimer: 0,
  comboPopTimer: 0,
  lastLane: 1,
  shotCount: 0,
  ads: false, // AWP 开镜状态：true=开镜（FOV 缩小+瞄准镜蒙版）
};

buildWeaponOverlay();
if (weaponLabMode) {
  // weaponLab 模式：不走 resetGame（含刷怪/基地血量/倒计时），直接建试验场
  state.mode = "weaponLab";
  weaponLab = createWeaponLab(scene, textures, camera);
  // 隐藏靶场专属 HUD（Score/Time/基地血量/经验条/tip），保留准星+热栏
  hideArenaHud(ui);
  showStart(ui, false);
  // 设置当前武器的准星贴图
  setCrosshairForWeapon(ui, state.weapons.currentWeaponId);
} else {
  resetGame({ preview: true });
}
installE2eDebugHooks();

document.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat && (state.mode === "playing" || state.mode === "countdown" || state.mode === "weaponLab")) state.jumpRequested = true;
  }
  if ((state.mode === "playing" || state.mode === "countdown" || state.mode === "weaponLab") && event.code === "KeyR") {
    event.preventDefault();
    reloadCurrentWeapon();
  }
  if ((state.mode === "playing" || state.mode === "countdown" || state.mode === "weaponLab") && /^Digit[1-5]$/.test(event.code)) {
    selectWeaponSlot(Number(event.code.slice(-1)) - 1);
  }
  // weaponLab 专属：T 键清除弹孔
  if (state.mode === "weaponLab" && event.code === "KeyT") {
    event.preventDefault();
    weaponLab?.clearBulletHoles();
  }
  // weaponLab 专属：G 键在准星命中点（仅地面）放置死靶（敌人/动靶模式下禁用）
  if (state.mode === "weaponLab" && event.code === "KeyG") {
    event.preventDefault();
    if (weaponLab?.mode === "enemy" || weaponLab?.mode === "moving") return;
    const hit = pickCenter();
    if (hit?.hit && hit.pickedMesh === weaponLab?.ground) {
      weaponLab.spawnDummy(hit.pickedPoint.clone());
    }
  }
  // weaponLab 专属：H 键清除所有死靶+敌人+动靶，回到 idle
  if (state.mode === "weaponLab" && event.code === "KeyH") {
    event.preventDefault();
    weaponLab?.clearDummies();
    weaponLab?.clearEnemies();
    weaponLab?.clearMovingTargets();
    if (weaponLab) weaponLab.mode = "idle";
  }
  // weaponLab 专属：B 键启动/重启敌人模式（60s 生存）
  if (state.mode === "weaponLab" && event.code === "KeyB") {
    event.preventDefault();
    weaponLab?.startEnemyMode();
  }
  // weaponLab 专属：V 键启动/重启动靶模式（水平振荡靶）
  if (state.mode === "weaponLab" && event.code === "KeyV") {
    event.preventDefault();
    weaponLab?.startMovingMode();
  }
  // weaponLab 专属：Tab 键临时锁定相机（按下锁定，松开恢复），方便观察弹孔分布
  if (state.mode === "weaponLab" && event.code === "Tab") {
    event.preventDefault();
    if (weaponLab) weaponLab.cameraLocked = true;
  }
});
document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  // Tab 松开时解锁相机
  if (state.mode === "weaponLab" && event.code === "Tab" && weaponLab) {
    weaponLab.cameraLocked = false;
  }
});
document.addEventListener("pointerlockchange", () => {
  if (isPointerLocked()) return;
  state.weapons = setTriggerHeld(state.weapons, false);
  // 指针锁定退出时关闭 AWP 开镜，避免状态残留
  if (state.ads) {
    state.ads = false;
    camera.fov = DEFAULT_FOV;
    camera.angularSensibility = DEFAULT_ANGULAR_SENSIBILITY;
    if (ui.scopeOverlay) ui.scopeOverlay.isVisible = false;
    if (ui.crosshairImage) ui.crosshairImage.isVisible = true;
  }
  // 靶场模式退出锁定后显示开始面板；weaponLab 模式不弹面板，点击 canvas 重新锁定
  if (state.mode === "playing" || state.mode === "countdown") showStart(ui, true);
});
canvas.addEventListener("pointerdown", (event) => {
  // 右键切换 AWP 开镜（仅 weaponLab 模式 + 当前武器是 AWP 时）
  if (event.button === 2 && state.mode === "weaponLab") {
    event.preventDefault(); // 阻止浏览器右键默认行为干扰
    const weapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
    if (weapon.id === "awp" && weapon.ads) {
      state.ads = !state.ads;
    }
    return;
  }
  if (state.mode === "weaponLab") {
    // weaponLab：第一次点击同时请求锁定+开火，后续点击直接开火
    if (!isPointerLocked()) lockPointer();
    state.weapons = setTriggerHeld(state.weapons, true);
    shoot();
    return;
  }
  if ((state.mode === "playing" || state.mode === "countdown") && isPointerLocked()) {
    state.weapons = setTriggerHeld(state.weapons, true);
    shoot();
  }
});
// 阻止右键菜单弹出（AWP 开镜需要右键）
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("pointerup", () => {
  state.weapons = setTriggerHeld(state.weapons, false);
});
window.addEventListener("resize", () => engine.resize());

engine.runRenderLoop(() => {
  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const elapsed = now / 1000;

  if (state.mode === "preview") updatePreview(delta, elapsed);
  if (state.mode === "debugActor") updateDebugActors(elapsed);
  if (state.mode === "debugWeapon") updateDebugWeapon(delta, elapsed);
  if (state.mode === "countdown") updateCountdown(delta, elapsed);
  if (state.mode === "playing") updateGame(delta, elapsed);
  updateTemporaryMeshes(projectiles, effects, camera, scene, delta);
  updateCrystal(world.baseCrystal, delta, elapsed);
  updateWeapon(delta);
  // weaponLab 分支放在 updateWeapon 之后，换弹检测能用本帧更新后的 state.weapons
  if (state.mode === "weaponLab") updateWeaponLab(delta, elapsed);
  scene.render();
});

function startGame() {
  ensureAudio();
  playSound("start");
  showStart(ui, false);
  hideResult(ui);
  resetGame({ preview: false });
  state.mode = "countdown";
  state.introTimer = 3.2;
  lockPointer();
}

function restartGame() {
  startGame();
}

function installE2eDebugHooks() {
  if (!e2eMode) return;
  window.__blockTargetRangeDebug = {
    start: () => startGame(),
    selectWeapon: (weaponId) => {
      const index = WEAPON_ORDER.indexOf(weaponId);
      if (index >= 0) selectWeaponSlot(index);
    },
    shoot: () => shoot(),
    reload: () => reloadCurrentWeapon(),
    // 死靶调试钩子：绕过 ray pick 直接在指定坐标放假人，供 E2E 精确验证
    spawnDummyAt: (x, z) => {
      if (state.mode !== "weaponLab" || !weaponLab) return null;
      return weaponLab.spawnDummy(new BABYLON.Vector3(x, 0.04, z));
    },
    clearDummies: () => weaponLab?.clearDummies(),
    // 敌人模式调试钩子：E2E 直接启动/停止敌人模式，无需按 B 键
    startEnemyMode: () => weaponLab?.startEnemyMode(),
    stopEnemyMode: () => weaponLab?.stopEnemyMode(),
    // 将所有敌人瞬移到抵达位置，触发扣血/结束判定（E2E 专用，跳过等待行进时间）
    advanceEnemiesToGoal: () => {
      if (!weaponLab) return;
      for (const enemy of weaponLab.enemies) {
        enemy.group.position.z = WEAPON_LAB_CONFIG.enemyMode.goalZ + 1;
      }
    },
    // 动靶模式调试钩子：E2E 直接启动/停止动靶模式，无需按 V 键
    startMovingMode: () => weaponLab?.startMovingMode(),
    stopMovingMode: () => weaponLab?.stopMovingMode(),
    // 将所有动靶 x 设为 0 并冻结振荡，让 E2E shoot() 中心射线能命中（动靶振荡中 x 可能偏离中心）
    moveMovingTargetsToCenter: () => {
      if (!weaponLab) return;
      for (const mt of weaponLab.movingTargets) {
        mt.group.metadata.frozen = true;
        mt.group.position.x = 0;
      }
    },
    // 读取动靶位置数组，E2E 用来验证振荡
    getMovingTargetPositions: () => {
      if (!weaponLab) return [];
      return weaponLab.movingTargets.map((mt) => ({
        x: mt.group.position.x,
        z: mt.group.position.z,
        dead: Boolean(mt.group.metadata.dead),
      }));
    },
    setModelConfig: (weaponId, modelConfig) => {
      if (!WEAPON_CONFIG[weaponId]?.modelConfig || !modelConfig) return;
      WEAPON_CONFIG[weaponId].modelConfig = {
        ...WEAPON_CONFIG[weaponId].modelConfig,
        ...modelConfig,
      };
      const controller = getWeaponController(weaponId);
      if (controller?.root && typeof WEAPON_CONFIG[weaponId].modelConfig.scaling === "number") {
        controller.root.scaling.setAll(WEAPON_CONFIG[weaponId].modelConfig.scaling);
      }
    },
    snapshot: () => {
      const weapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
      const controller = weaponModels[weapon.id];
      const visibleMeshCount = controller?.root
        ?.getChildMeshes(false)
        .filter((mesh) => mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices?.() > 0)
        .length ?? 0;
      const screenBounds = getModelScreenBounds(controller);
      return {
        mode: state.mode,
        currentWeaponId: weapon.id,
        weaponLabel: weapon.label,
        modelConfig: weapon.modelConfig ?? null,
        muzzleFlash: getMuzzleFlashConfig(weapon.id),
        startPanelVisible: Boolean(ui.startPanel?.isVisible),
        weaponPlaneExists: Boolean(scene.getMeshByName("weapon-overlay")),
        activeModel: {
          ready: Boolean(controller?.ready),
          failed: Boolean(controller?.failed),
          source: controller?.source ?? "blockbench-json",
          partCount: controller?.partCount ?? 0,
          status: controller?.status ?? "missing",
          rootEnabled: Boolean(controller?.root?.isEnabled()),
          visibleMeshCount,
          screenBounds,
        },
        runtime: {
          ammo: state.weapons.ammo[weapon.id] ?? 0,
          magazineSize: weapon.magazineSize,
          reloading: state.weapons.reloading,
          weaponRecoil: state.weaponRecoil,
          muzzleFlashTimer: state.muzzleFlashTimer,
          muzzleFlashEnabled: Boolean(muzzleFlashPlane?.isEnabled()),
          ...getMuzzleDebug(controller),
        },
        // weaponLab 模式下暴露弹孔数、双层统计、死靶状态、相机锁定、玩家位置、AWP 开镜，供 e2e 探针验证
        ...(state.mode === "weaponLab" && weaponLab ? {
          weaponLab: {
            bulletHoleCount: weaponLab.bulletHoles.length,
            stats: weaponLab.getStats(),
            dummiesCount: weaponLab.dummies.length,
            aliveDummies: weaponLab.dummies.filter((d) => !d.group.metadata.dead).length,
            mode: weaponLab.mode,
            headshots: weaponLab.getStats().dummy.headshots,
            bodyshots: weaponLab.getStats().dummy.bodyshots,
            headshotRate: weaponLab.getStats().dummy.headshotRate,
            enemiesCount: weaponLab.enemies.length,
            enemyTimeLeft: weaponLab.enemyTimeLeft,
            enemyHP: weaponLab.enemyHP,
            enemyResult: weaponLab.enemyResult,
            enemyKills: weaponLab.getStats().enemy.kills,
            enemyHeadshots: weaponLab.getStats().enemy.headshots,
            enemyHeadshotRate: weaponLab.getStats().enemy.headshotRate,
            movingTargetsCount: weaponLab.movingTargets.length,
            aliveMovingTargets: weaponLab.movingTargets.filter((m) => !m.group.metadata.dead).length,
            movingKills: weaponLab.getStats().moving.kills,
            movingHeadshots: weaponLab.getStats().moving.headshots,
            movingHeadshotRate: weaponLab.getStats().moving.headshotRate,
            cameraLocked: Boolean(weaponLab.cameraLocked),
            playerPosition: {
              x: camera.position.x,
              y: camera.position.y,
              z: camera.position.z,
            },
            ads: state.ads,
            crosshair: WEAPON_CONFIG[state.weapons.currentWeaponId]?.crosshair?.image ?? null,
            fov: camera.fov,
          },
        } : {}),
      };
    },
  };
}

function getModelScreenBounds(controller) {
  if (!controller?.root?.isEnabled()) return null;
  const meshes = controller.root
    .getChildMeshes(false)
    .filter((mesh) => mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices?.() > 0);
  if (meshes.length === 0) return null;

  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const transform = scene.getTransformMatrix();
  const points = [];
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(true);
    const projected = BABYLON.Vector3.Project(
      mesh.getBoundingInfo().boundingBox.centerWorld,
      BABYLON.Matrix.Identity(),
      transform,
      viewport
    );
    if (Number.isFinite(projected.x) && Number.isFinite(projected.y)) points.push(projected);
  }
  if (points.length === 0) return null;

  const renderWidth = engine.getRenderWidth();
  const renderHeight = engine.getRenderHeight();
  const nearViewportPoints = points.filter((point) => (
    point.x >= -renderWidth * 0.25
    && point.x <= renderWidth * 1.25
    && point.y >= -renderHeight * 0.25
    && point.y <= renderHeight * 1.25
  ));
  const boundedPoints = nearViewportPoints.length >= 8 ? nearViewportPoints : points;
  const xs = boundedPoints.map((point) => point.x).sort((a, b) => a - b);
  const ys = boundedPoints.map((point) => point.y).sort((a, b) => a - b);
  const lowIndex = Math.floor(boundedPoints.length * 0.1);
  const highIndex = Math.max(lowIndex, Math.ceil(boundedPoints.length * 0.9) - 1);
  const minX = Math.max(0, xs[lowIndex]);
  const maxX = Math.min(renderWidth, xs[highIndex]);
  const minY = Math.max(0, ys[lowIndex]);
  const maxY = Math.min(renderHeight, ys[highIndex]);
  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
    areaRatio: (width * height) / (renderWidth * renderHeight),
  };
}

function getWeaponController(weaponId) {
  return weaponModels[weaponId];
}

function updateMuzzleFlash(controller, weaponId) {
  if (!muzzleFlashPlane) return;
  if (!controller?.ready || !controller.root?.isEnabled() || !controller.muzzleAnchor) {
    muzzleFlashPlane.setEnabled(false);
    return;
  }
  controller.muzzleAnchor.computeWorldMatrix(true);
  muzzleFlashPlane.position.copyFrom(controller.muzzleAnchor.getAbsolutePosition());
  // 按当前武器的 muzzleFlash 配置应用大小和透明度
  const cfg = getMuzzleFlashConfig(weaponId);
  muzzleFlashPlane.scaling.setAll(cfg.size);
  muzzleFlashPlane.material.alpha = cfg.alpha;
  muzzleFlashPlane.setEnabled(state.muzzleFlashTimer > 0);
  // 不再写 rotation.z：BILLBOARDMODE_ALL 每帧覆盖 mesh rotation；旋转改用贴图 wAng 在 shoot() 里设置
}

function getMuzzleFlashConfig(weaponId) {
  const cfg = WEAPON_CONFIG[weaponId]?.muzzleFlash;
  return {
    size: cfg?.size ?? 0.3,
    alpha: cfg?.alpha ?? 0.85,
    rotationRandom: cfg?.rotationRandom ?? Math.PI * 2,
  };
}

function getMuzzleDebug(controller) {
  const muzzleAnchorWorld = getMuzzleAnchorWorld(controller);
  const muzzleFlashWorld = muzzleFlashPlane
    ? vectorToArray(muzzleFlashPlane.position)
    : null;
  const muzzleAnchorScreen = projectWorldToScreen(muzzleAnchorWorld);
  const muzzleFlashScreen = projectWorldToScreen(muzzleFlashPlane?.position ?? null);
  return {
    muzzleAnchorWorld: muzzleAnchorWorld ? vectorToArray(muzzleAnchorWorld) : null,
    muzzleAnchorScreen,
    muzzleFlashWorld,
    muzzleFlashScreen,
    muzzleFlashDistancePx: screenDistance(muzzleAnchorScreen, muzzleFlashScreen),
  };
}

function getMuzzleAnchorWorld(controller) {
  if (!controller?.muzzleAnchor) return null;
  controller.muzzleAnchor.computeWorldMatrix(true);
  return controller.muzzleAnchor.getAbsolutePosition().clone();
}

function projectWorldToScreen(point) {
  if (!point) return null;
  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const projected = BABYLON.Vector3.Project(
    point,
    BABYLON.Matrix.Identity(),
    scene.getTransformMatrix(),
    viewport
  );
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null;
  return {
    x: projected.x,
    y: projected.y,
    z: projected.z,
  };
}

function screenDistance(a, b) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function vectorToArray(vector) {
  return [vector.x, vector.y, vector.z];
}

function buildWeaponOverlay() {
  // 基础 plane 用 1×1，实际大小由 updateMuzzleFlash 按 muzzleFlash.size 走 scaling 控制
  muzzleFlashPlane = BABYLON.MeshBuilder.CreatePlane("muzzle-flash-overlay", { width: 1, height: 1 }, scene);
  muzzleFlashPlane.material = materialFromTexture(scene, textures.muzzleFlash, {
    transparent: true,
    emissiveColor: BABYLON.Color3.FromHexString("#fff2a8"),
  });
  muzzleFlashPlane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  muzzleFlashPlane.renderingGroupId = 3;
  muzzleFlashPlane.isPickable = false;
  muzzleFlashPlane.setEnabled(false);

  // 通用 3D 武器模型加载：5 把武器统一走 createWeaponModel
  for (const id of WEAPON_ORDER) {
    weaponModels[id] = createWeaponModel(
      scene,
      camera,
      id,
      WEAPON_CONFIG[id].modelConfig,
      ASSET_PATHS.weaponModelTextures[id],
      (status) => { if (debugWeaponLabel) debugWeaponLabel.text = status; }
    );
  }
}

function resetGame({ preview }) {
  clearTargets();
  clearEffects();
  camera.position.set(0, GAME_CONFIG.playerGroundY, 12);
  camera.setTarget(new BABYLON.Vector3(0, 2.1, -24));
  Object.assign(state, {
    score: 0,
    hits: 0,
    combo: 0,
    bestCombo: 0,
    comboTimer: 0,
    timeLeft: GAME_CONFIG.duration,
    baseHealth: GAME_CONFIG.baseHealth,
    spawnTimer: 0.4,
    shootCooldown: 0,
    weaponAnimTimer: 0,
    weaponRecoil: 0,
    muzzleFlashTimer: 0,
    weapons: createWeaponState(WEAPON_ORDER, WEAPON_CONFIG),
    playerY: GAME_CONFIG.playerGroundY,
    verticalVelocity: 0,
    grounded: true,
    jumpRequested: false,
    crosshairHitTimer: 0,
    comboPopTimer: 0,
    lastLane: 1,
    shotCount: 0,
  });
  ui.countdownEl.isVisible = false;
  ui.comboPopEl.isVisible = false;
  clearCrosshair(ui);

  if (preview) {
    if (debugWeapon) {
      state.mode = "debugWeapon";
      spawnDebugWeapon();
      showStart(ui, false);
    } else if (debugActor) {
      state.mode = "debugActor";
      spawnDebugActors();
      showStart(ui, false);
    } else {
      state.mode = "preview";
      spawnPreviewMobs();
    }
  } else {
    state.mode = "countdown";
    for (let i = 0; i < 4; i += 1) spawnGameTarget(true);
  }
  updateHud(ui, state);
}

function clearTargets() {
  targets.splice(0).forEach(disposeTarget);
  previewMobs.splice(0).forEach(disposeTarget);
}

function clearEffects() {
  projectiles.splice(0).forEach((mesh) => mesh.dispose());
  effects.splice(0).forEach((effect) => {
    effect.control?.dispose();
    effect.mesh.dispose();
  });
  debugMeshes.splice(0).forEach((mesh) => mesh.dispose());
  ui.debugControls.splice(0).forEach((control) => control.dispose());
}

function spawnPreviewMobs() {
  GAME_CONFIG.lanes.forEach((laneX, index) => {
    const target = spawnGameTarget(true, { forceCreeper: index === 1, preview: true });
    target.group.position.set(laneX, 0.15, -14 - index * 4);
    target.group.metadata.speed = 0.32;
    previewMobs.push(target);
    targets.splice(targets.indexOf(target), 1);
  });
}

function spawnDebugActors() {
  const zombie = spawnGameTarget(true, { forceCreeper: false, debugActor: true });
  zombie.group.position.set(-5.8, 0.04, -9);
  zombie.group.metadata.laneX = -5.8;
  zombie.group.metadata.speed = 0;
  zombie.group.metadata.phase = 0;
  zombie.group.metadata.debugRotation = 0;
  ui.addDebugLabel("zombie 正面", zombie.group, { anchorY: 3.55, offsetY: -42, width: "128px", size: 15 });

  const zombieSide = spawnGameTarget(true, { forceCreeper: false, debugActor: true });
  zombieSide.group.position.set(-2, 0.04, -9);
  zombieSide.group.metadata.laneX = -2;
  zombieSide.group.metadata.speed = 0;
  zombieSide.group.metadata.phase = Math.PI * 0.5;
  zombieSide.group.metadata.debugRotation = Math.PI / 2;
  ui.addDebugLabel("zombie 侧面", zombieSide.group, { anchorY: 3.55, offsetY: -78, width: "128px", size: 15 });

  const creeperFront = spawnGameTarget(true, { forceCreeper: true, debugActor: true });
  creeperFront.group.position.set(1.8, 0.04, -9);
  creeperFront.group.metadata.laneX = 1.8;
  creeperFront.group.metadata.speed = 0;
  creeperFront.group.metadata.phase = Math.PI;
  creeperFront.group.metadata.debugRotation = 0;
  ui.addDebugLabel("creeper 正面", creeperFront.group, { anchorY: 3.45, offsetY: -42, width: "132px", size: 15 });

  const creeperSide = spawnGameTarget(true, { forceCreeper: true, debugActor: true });
  creeperSide.group.position.set(5.6, 0.04, -9);
  creeperSide.group.metadata.laneX = 5.6;
  creeperSide.group.metadata.speed = 0;
  creeperSide.group.metadata.phase = Math.PI * 0.5;
  creeperSide.group.metadata.debugRotation = Math.PI / 2;
  ui.addDebugLabel("creeper 侧面", creeperSide.group, { anchorY: 3.45, offsetY: -78, width: "132px", size: 15 });

  spawnSkinSamples();
}

function spawnDebugWeapon() {
  camera.position.set(0, GAME_CONFIG.playerGroundY, 12);
  camera.setTarget(new BABYLON.Vector3(0, 2.1, -24));
  state.weapons = selectWeapon(state.weapons, "p90", WEAPON_CONFIG);
  state.weaponRecoil = 0.2;
  state.muzzleFlashTimer = 0;
  debugWeaponLabel = ui.addDebugLabel(weaponModels.p90?.status ?? "P90 model loading", weaponModels.p90.root, {
    anchorY: 0.7,
    offsetY: -82,
    width: "380px",
    size: 15,
  });
  setCrosshair(ui, "normal", true);
  updateHud(ui, state);
}

function updateDebugWeapon(delta, elapsed) {
  state.weapons = updateWeaponState(state.weapons, delta, WEAPON_CONFIG);
  state.weaponRecoil = 0.18 + Math.sin(elapsed * 1.5) * 0.04;
  if (debugWeaponLabel && weaponModels.p90) {
    let bboxInfo = "";
    let warn = false;
    if (weaponModels.p90.ready && weaponModels.p90.root) {
      try {
        weaponModels.p90.root.refreshBoundingInfo(true);
        const bb = weaponModels.p90.root.getBoundingInfo().boundingBox;
        const sx = bb.maximumWorld.x - bb.minimumWorld.x;
        const sy = bb.maximumWorld.y - bb.minimumWorld.y;
        const sz = bb.maximumWorld.z - bb.minimumWorld.z;
        const cx = bb.centerWorld.x;
        const cy = bb.centerWorld.y;
        const cz = bb.centerWorld.z;
        const oversized = sx > 3 || sy > 3 || sz > 3;
        const offCenter = Math.abs(cx) > 1.5 || Math.abs(cy) > 1.5 || Math.abs(cz) > 1.5;
        warn = oversized || offCenter;
        bboxInfo = ` | bb ${sx.toFixed(2)}x${sy.toFixed(2)}x${sz.toFixed(2)} c(${cx.toFixed(1)},${cy.toFixed(1)},${cz.toFixed(1)})`;
      } catch (error) {
        bboxInfo = " | bb n/a";
      }
    }
    debugWeaponLabel.text = `${weaponModels.p90.status ?? "loading"}${bboxInfo}${warn ? " WARN" : ""}`;
    debugWeaponLabel.color = warn ? "#ff4b4b" : "#ffffa0";
  }
  updateHud(ui, state);
}

function spawnGameTarget(initial = false, options = {}) {
  const target = spawnTarget({
    scene,
    textures,
    state,
    initial,
    options: { ...options, debugHitbox },
    nextLaneIndex,
  });
  targets.push(target);
  return target;
}

function nextLaneIndex() {
  let lane = Math.floor(Math.random() * GAME_CONFIG.lanes.length);
  if (lane === state.lastLane) lane = (lane + 1 + Math.floor(Math.random() * 2)) % GAME_CONFIG.lanes.length;
  state.lastLane = lane;
  return lane;
}

function getSpawnInterval() {
  const elapsed = GAME_CONFIG.duration - state.timeLeft;
  const wave = getWaveProfile(elapsed);
  return randFloat(wave.spawnMin, wave.spawnMax);
}

function shoot() {
  const weapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
  if (state.weapons.reloading) return;
  if ((state.weapons.ammo[weapon.id] ?? 0) <= 0) {
    reloadCurrentWeapon();
    return;
  }
  const shot = fireWeapon(state.weapons, weapon);
  if (!shot.fired) return;
  state.weapons = shot.state;
  state.shootCooldown = weapon.fireInterval;
  ensureAudio();
  state.weaponAnimTimer = Math.min(0.16, weapon.fireInterval);
  state.weaponRecoil = weapon.recoil;
  state.muzzleFlashTimer = muzzleFlashDuration;
  // 每次开火随机化枪火贴图旋转，避免一坨白色；用 wAng 而非 mesh rotation（billboard 会覆盖后者）
  const flashCfg = getMuzzleFlashConfig(weapon.id);
  if (muzzleFlashPlane?.material?.diffuseTexture) {
    muzzleFlashPlane.material.diffuseTexture.wAng = (Math.random() - 0.5) * flashCfg.rotationRandom;
  }
  state.crosshairHitTimer = 0;
  clearCrosshair(ui);
  playSound(weapon.fireSound);
  camera.rotation.x -= weapon.cameraKick;
  state.shotCount += 1;
  if (state.shotCount % Math.max(1, weapon.tracerInterval) === 0) {
    spawnProjectileTrail(scene, projectiles, camera);
  }
  updateHud(ui, state);

  const hit = pickCenter();
  if (!hit?.hit || !hit.pickedMesh) {
    // weaponLab 脱靶（射线打天空/未命中 solid mesh）记录射击但不记命中
    if (state.mode === "weaponLab") weaponLab?.onShootMiss(weapon);
    return;
  }

  const target = hit.pickedMesh.metadata?.target;
  if (!target) {
    hitBlock(hit.pickedMesh, hit.pickedPoint);
    if (state.mode === "weaponLab") {
      // 命中 lab.wall 算命中并贴弹孔；命中地面算脱靶（记射击不记命中）
      if (hit.pickedMesh === weaponLab.wall) {
        weaponLab?.onShootHit(hit.pickedPoint, hit.getNormal(true), weapon);
      } else {
        weaponLab?.onShootMiss(weapon);
      }
    }
    return;
  }
  hitTarget(target, hit.pickedMesh.metadata.hitType, hit.pickedPoint, weapon);
}

function reloadCurrentWeapon() {
  const weapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
  const reload = startReload(state.weapons, weapon);
  if (!reload.started) return;
  ensureAudio();
  state.weapons = reload.state;
  playSound(weapon.reloadSound);
  updateHud(ui, state);
}

function selectWeaponSlot(index) {
  const weaponId = WEAPON_ORDER[index];
  if (!weaponId) return;
  const previous = state.weapons.currentWeaponId;
  state.weapons = selectWeapon(state.weapons, weaponId, WEAPON_CONFIG);
  if (state.weapons.currentWeaponId !== previous) {
    ensureAudio();
    playSound(WEAPON_CONFIG[weaponId].drawSound ?? "weaponDraw");
    updateHud(ui, state);
    // 切换准星贴图（每把武器配不同准星）
    setCrosshairForWeapon(ui, weaponId);
    // 切换武器时重置 AWP 开镜状态
    if (state.ads) {
      state.ads = false;
      camera.fov = DEFAULT_FOV;
      camera.angularSensibility = DEFAULT_ANGULAR_SENSIBILITY;
      if (ui.scopeOverlay) ui.scopeOverlay.isVisible = false;
      if (ui.crosshairImage) ui.crosshairImage.isVisible = true;
    }
    // weaponLab 切武器重置会话统计（弹匣层+会话层都清零）
    if (state.mode === "weaponLab") weaponLab?.onWeaponSwitch();
  }
}

function hitTarget(target, hitType, point, weapon) {
  const data = target.group.metadata;
  const hitResult = getHitResult(hitType, data.kind, weapon);
  data.health -= hitResult.damage;
  data.hitTimer = 0.2;
  data.healthVisibleTimer = 2.3;
  target.healthBar.group.setEnabled(true);
  const healthRatio = Math.max(0, data.health / data.maxHealth);
  target.healthBar.fill.scaling.x = healthRatio;
  target.healthBar.fill.position.x = -0.59 * (1 - healthRatio);

  flashMaterials(target.allParts, hitResult.critical ? 0xffe36a : data.kind === "creeper" ? 0xa9ff8d : 0xfff2a8);
  addHitSpark(scene, effects, point, hitResult.critical);
  const now = performance.now() / 1000;
  const showFloatText = hitResult.critical || (now - (data.lastFloatTextTime ?? 0) > 0.12);
  data.lastFloatTextTime = now;
  if (showFloatText) {
    effects.push(createFloatingText(
      ui,
      scene,
      hitResult.damageLabel,
      point.clone().add(new BABYLON.Vector3(0, 0.45, 0)),
      hitResult.critical
    ));
  }
  state.crosshairHitTimer = 0.14;
  setCrosshair(ui, hitResult.critical ? "critical-hit" : "hit", true);
  playSound(hitResult.critical ? "critical" : "hit");

  // 死靶走隐藏+重生分支（onDummyHit 记爆头/身体统计，onDummyKilled 设 3s 重生）；
  // 敌人走 dispose+统计分支（onEnemyHit 记统计，onEnemyKilled dispose+splice lab.enemies）；
  // 动靶走隐藏+重生换相位分支（onMovingHit 记统计，onMovingKilled 设 0.5s 重生）；
  // 普通敌人走 defeatTarget（dispose+score+combo+splice targets[]）
  if (data.isDummy) {
    weaponLab?.onDummyHit(hitType, weapon, hitResult);
    if (data.health <= 0) weaponLab?.onDummyKilled(target, point, hitResult);
  } else if (data.isEnemy) {
    weaponLab?.onEnemyHit(hitType, weapon, hitResult);
    if (data.health <= 0) weaponLab?.onEnemyKilled(target, point, hitResult);
  } else if (data.isMoving) {
    weaponLab?.onMovingHit(hitType, weapon, hitResult);
    if (data.health <= 0) weaponLab?.onMovingKilled(target, point, hitResult);
  } else if (data.health <= 0) {
    defeatTarget(target, point, hitResult);
  }
  updateHud(ui, state);
}

function hitBlock(mesh, point) {
  addBlockChips(scene, effects, point, mesh);
  flashBlock(mesh);
  state.crosshairHitTimer = 0.13;
  setCrosshair(ui, "block-hit", true);
  playSound("blockHit");
}

function defeatTarget(target, point, hitResult) {
  const nextComboState = applyDefeatCombo(state, hitResult.comboGain);
  state.combo = nextComboState.combo;
  state.comboTimer = nextComboState.comboTimer;
  state.bestCombo = nextComboState.bestCombo;
  const scored = scoreDefeat({ basePoints: hitResult.basePoints, combo: state.combo });
  state.score += scored.earned;
  state.hits += 1;

  createBreakParticles(scene, effects, target.group.position.clone(), target.group.metadata.kind);
  effects.push(createFloatingText(ui, scene, `${hitResult.label ? "精准 " : ""}+${scored.earned}`, point.clone().add(new BABYLON.Vector3(0, 0.8, 0)), hitResult.critical));
  if (shouldShowCombo(state.combo)) {
    showCombo(ui, state.combo);
    state.comboPopTimer = 0.9;
    if (state.combo % 3 === 0 || hitResult.critical) playSound("combo");
  }
  playSound(target.group.metadata.kind === "creeper" ? "burst" : "defeat");
  disposeTarget(target);
  targets.splice(targets.indexOf(target), 1);
}

function updatePreview(delta, elapsed) {
  previewMobs.forEach((target) => {
    const group = target.group;
    group.position.x = group.metadata.laneX;
    group.position.z += group.metadata.speed * delta;
    if (group.position.z > 8) group.position.z = -22;
    animateTarget(target, elapsed);
  });
}

function updateDebugActors(elapsed) {
  targets.forEach((target) => {
    target.group.rotation.y = target.group.metadata.debugRotation ?? 0;
    target.healthBar.group.setEnabled(false);
  });
}

function spawnSkinSamples() {
  const samples = [
    ["zombie head/front", textures.zombie, ZOMBIE_SKIN_UV, ZOMBIE_SKIN_UV.parts.head.front],
    ["zombie body/front", textures.zombie, ZOMBIE_SKIN_UV, ZOMBIE_SKIN_UV.parts.body.front],
    ["zombie arm/front", textures.zombie, ZOMBIE_SKIN_UV, ZOMBIE_SKIN_UV.parts.leftArm.front],
    ["zombie arm/side", textures.zombie, ZOMBIE_SKIN_UV, ZOMBIE_SKIN_UV.parts.leftArm.right],
    ["zombie leg/front", textures.zombie, ZOMBIE_SKIN_UV, ZOMBIE_SKIN_UV.parts.leftLeg.front],
    ["zombie leg/side", textures.zombie, ZOMBIE_SKIN_UV, ZOMBIE_SKIN_UV.parts.leftLeg.right],
    ["creeper head/front", textures.creeper, CREEPER_SKIN_UV, CREEPER_SKIN_UV.parts.head.front],
    ["creeper body/front", textures.creeper, CREEPER_SKIN_UV, CREEPER_SKIN_UV.parts.body.front],
    ["creeper leg/front", textures.creeper, CREEPER_SKIN_UV, CREEPER_SKIN_UV.parts.leg.front],
  ];

  samples.forEach(([label, texture, uv, rect], index) => {
    const patch = createSkinPatchTexture(scene, texture, uv.sourceWidth, uv.sourceHeight, rect, `skin-sample-${index}-texture`);
    const row = ui.addDebugSkinSample({ label, index, metrics: patch.metadata?.skinPatchMetrics ?? null });
    patch.metadata?.onSkinPatchMetrics?.((metrics) => row.updateMetrics(metrics));

    const sampleWidth = 0.11;
    const sampleHeight = sampleWidth * (rect[3] / rect[2]);
    const frame = BABYLON.MeshBuilder.CreatePlane(`skin-sample-${index}-frame`, {
      width: sampleWidth + 0.026,
      height: sampleHeight + 0.026,
    }, scene);
    frame.material = colorMaterial(scene, "#111111", {
      alpha: 0.78,
      emissive: BABYLON.Color3.FromHexString("#111111"),
    });
    frame.parent = camera;
    frame.position.set(-1.34, 0.62 - index * 0.18, 1.2);
    frame.renderingGroupId = 2;
    frame.isPickable = false;

    const mesh = BABYLON.MeshBuilder.CreatePlane(`skin-sample-${index}`, { width: sampleWidth, height: sampleHeight }, scene);
    const material = materialFromTexture(scene, patch, {
      name: `skin-sample-${index}-material`,
      transparent: true,
    });
    material.backFaceCulling = false;
    material.useAlphaFromDiffuseTexture = true;
    mesh.material = material;
    mesh.parent = camera;
    mesh.position.set(-1.34, 0.62 - index * 0.18, 1.19);
    mesh.renderingGroupId = 2;
    mesh.isPickable = false;
    patch.metadata?.onSkinPatchMetrics?.((metrics) => {
      if (metrics.warning) {
        frame.material.diffuseColor = BABYLON.Color3.FromHexString("#ff4b4b");
        frame.material.emissiveColor = BABYLON.Color3.FromHexString("#431010");
      }
    });
    debugMeshes.push(frame);
    debugMeshes.push(mesh);
  });
}

function updateCountdown(delta, elapsed) {
  state.introTimer -= delta;
  const shown = Math.ceil(state.introTimer);
  ui.countdownEl.text = shown > 0 ? String(shown) : "守住!";
  ui.countdownEl.isVisible = true;
  camera.position.z = lerp(camera.position.z, 10.5, 0.05);
  movePlayer(delta * 0.35);
  updateTargets(delta * 0.35, elapsed);
  if (state.introTimer <= 0) {
    ui.countdownEl.isVisible = false;
    state.mode = "playing";
    state.spawnTimer = 0.4;
  }
}

function updateGame(delta, elapsed) {
  state.timeLeft = Math.max(0, state.timeLeft - delta);
  const comboState = decayCombo(state, delta);
  state.comboTimer = comboState.comboTimer;
  state.combo = comboState.combo;

  state.spawnTimer -= delta;
  if (state.spawnTimer <= 0 && targets.length < GAME_CONFIG.maxTargets) {
    spawnGameTarget();
    state.spawnTimer = getSpawnInterval();
  }

  movePlayer(delta);
  updateTargets(delta, elapsed);
  updateAimState();
  updateHud(ui, state);
  if (state.timeLeft <= 0) finishGame(true);
}

function movePlayer(delta) {
  if (!isPointerLocked()) return;
  Object.assign(state, consumeJumpRequest(state, GAME_CONFIG));
  Object.assign(state, updateJumpState(state, delta, GAME_CONFIG));
  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 12 : 7.4;
  const forward = camera.getDirection(BABYLON.Axis.Z);
  forward.y = 0;
  forward.normalize();
  const right = camera.getDirection(BABYLON.Axis.X);
  right.y = 0;
  right.normalize();

  const move = BABYLON.Vector3.Zero();
  if (keys.has("KeyW")) move.addInPlace(forward.scale(speed * delta));
  if (keys.has("KeyS")) move.addInPlace(forward.scale(-speed * delta));
  if (keys.has("KeyA")) move.addInPlace(right.scale(-speed * delta));
  if (keys.has("KeyD")) move.addInPlace(right.scale(speed * delta));
  camera.position.addInPlace(move);

  // weaponLab 模式读 weaponLab 的 solidColliders 和 WEAPON_LAB_CONFIG.playerBounds；
  // 靶场模式读 world.solidColliders 和 GAME_CONFIG.playerBounds
  const colliders = weaponLabMode ? weaponLab.solidColliders : world.solidColliders;
  const bounds = weaponLabMode ? WEAPON_LAB_CONFIG.playerBounds : GAME_CONFIG.playerBounds;
  const resolved = resolveCircleCollision(
    { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    colliders,
    GAME_CONFIG.playerRadius,
    bounds
  );
  camera.position.set(resolved.x, state.playerY, resolved.z);
}

function updateTargets(delta, elapsed) {
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    const target = targets[i];
    updateTarget(target, delta, elapsed, world.solidColliders);
    if (target.group.position.z > GAME_CONFIG.goalZ) {
      disposeTarget(target);
      targets.splice(i, 1);
      damageBase();
    }
  }
}

function damageBase() {
  state.baseHealth = Math.max(0, state.baseHealth - 1);
  state.combo = 0;
  state.comboTimer = 0;
  playSound("damage");
  createBreakParticles(scene, effects, world.baseCrystal.group.position.clone().add(new BABYLON.Vector3(0, 1.5, 0)), "creeper");
  world.baseCrystal.light.intensity = 3.8;
  setTimeout(() => {
    world.baseCrystal.light.intensity = 1.4;
  }, 140);
  updateHud(ui, state);
  if (state.baseHealth <= 0) finishGame(false);
}

function updateAimState() {
  if (state.crosshairHitTimer > 0) return;
  const hit = pickCenter();
  if (hit?.hit && hit.pickedMesh?.metadata?.target) setCrosshair(ui, "aiming", true);
  else setCrosshair(ui, "normal", true);
}

function updateWeapon(delta) {
  state.weapons = updateWeaponState(state.weapons, delta, WEAPON_CONFIG);
  state.shootCooldown = state.weapons.fireTimer;
  const weapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
  if ((state.mode === "playing" || state.mode === "countdown" || state.mode === "weaponLab") && state.weapons.triggerHeld && weapon.automatic) {
    shoot();
  }

  // AWP 开镜：FOV 平滑过渡 + 瞄准镜蒙版 + 准星显隐 + 鼠标灵敏度
  const canAds = state.mode === "weaponLab" && weapon.id === "awp" && weapon.ads;
  const targetFov = canAds && state.ads ? weapon.ads.fov : DEFAULT_FOV;
  camera.fov = BABYLON.Scalar.Lerp(camera.fov, targetFov, Math.min(1, delta * 10));
  if (canAds) {
    const scopeVisible = state.ads;
    if (ui.scopeOverlay) ui.scopeOverlay.isVisible = scopeVisible;
    if (ui.crosshairImage) ui.crosshairImage.isVisible = !scopeVisible;
    // 开镜时降低鼠标灵敏度（angularSensibility 越大越慢）
    const targetSensibility = scopeVisible
      ? DEFAULT_ANGULAR_SENSIBILITY / (weapon.ads.sensitivityScale ?? 1)
      : DEFAULT_ANGULAR_SENSIBILITY;
    camera.angularSensibility = BABYLON.Scalar.Lerp(camera.angularSensibility, targetSensibility, Math.min(1, delta * 10));
  } else {
    // 非 AWP 武器：确保开镜蒙版隐藏、准星显示
    if (ui.scopeOverlay?.isVisible) ui.scopeOverlay.isVisible = false;
    if (ui.crosshairImage && !ui.crosshairImage.isVisible) ui.crosshairImage.isVisible = true;
  }

  state.weaponRecoil = Math.max(0, state.weaponRecoil - delta * 7);
  state.weaponAnimTimer = Math.max(0, state.weaponAnimTimer - delta);
  state.muzzleFlashTimer = Math.max(0, state.muzzleFlashTimer - delta);
  // 通用 3D 模型切换：遍历所有已加载的 3D 武器，只激活当前武器。
  for (const [id, controller] of Object.entries(weaponModels)) {
    updateWeaponModel(controller, {
      active: weapon.id === id,
      recoil: state.weaponRecoil,
      reloading: state.weapons.reloading,
      modelConfig: WEAPON_CONFIG[id].modelConfig,
    });
  }
  updateMuzzleFlash(getWeaponController(weapon.id), weapon.id);
  state.crosshairHitTimer = Math.max(0, state.crosshairHitTimer - delta);
  if (state.crosshairHitTimer <= 0 && (state.mode === "playing" || state.mode === "countdown")) {
    updateAimState();
  }

  // 命中标记淡出
  updateHitMarker(ui, delta);

  state.comboPopTimer = Math.max(0, state.comboPopTimer - delta);
  if (state.comboPopTimer <= 0) ui.comboPopEl.isVisible = false;
}

// weaponLab 模式每帧更新：统计 tick + 看板刷新 + 换弹完成检测。
// 武器状态/后坐力/模型/枪火已在 updateWeapon 中更新，这里只处理 weaponLab 特有逻辑。
let savedAngularSensibility = null;
function updateWeaponLab(delta, elapsed) {
  if (!weaponLab) return;
  // Tab 锁定时暂停移动和鼠标转向（angularSensibility 设极大值），方便观察弹孔分布
  if (weaponLab.cameraLocked) {
    if (savedAngularSensibility === null) {
      savedAngularSensibility = camera.angularSensibility;
      camera.angularSensibility = 1e9;
    }
  } else {
    if (savedAngularSensibility !== null) {
      camera.angularSensibility = savedAngularSensibility;
      savedAngularSensibility = null;
    }
    movePlayer(delta);
  }
  weaponLab.update(delta, elapsed);
  // 换弹完成检测：reloading 从 true→false 时 commit magazine 统计
  if (wasReloading && !state.weapons.reloading) weaponLab.onReload();
  wasReloading = state.weapons.reloading;
}

function finishGame(victory) {
  if (state.mode === "ended") return;
  state.mode = "ended";
  exitPointerLock();
  showResult(ui, {
    victory,
    rating: getRating({ victory, score: state.score, baseHealth: state.baseHealth }),
    score: state.score,
    hits: state.hits,
    bestCombo: state.bestCombo,
    baseHealth: state.baseHealth,
  });
  playSound(victory ? "win" : "lose");
}

function pickCenter() {
  const ray = camera.getForwardRay(140);
  return scene.pickWithRay(ray, (mesh) => Boolean(mesh.metadata?.target || mesh.metadata?.solid), false);
}

function disposeTarget(target) {
  target.group.getChildMeshes(false).forEach((mesh) => mesh.dispose());
  target.group.dispose();
}

function lockPointer() {
  if (document.pointerLockElement !== canvas) {
    const result = canvas.requestPointerLock?.();
    if (result && typeof result.catch === "function") {
      result.catch((error) => {
        console.warn("[pointerLock] request rejected (non-gesture or embedded context).", error?.message ?? error);
      });
    }
  }
}

function exitPointerLock() {
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();
}

function isPointerLocked() {
  return document.pointerLockElement === canvas;
}

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
