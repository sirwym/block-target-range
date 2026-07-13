import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import {
  ASSET_PATHS,
  GAME_CONFIG,
  SCORE_VALUES,
  WEAPON_CONFIG,
  WEAPON_ORDER,
  WEAPON_LAB_CONFIG,
  WEAPON_CALIBRATION,
  PHASE2_STATIC_WEAPONS,
  PHASE2_STATIC_POSE_CALIBRATION,
  getRating,
  getWaveProfile,
} from "./config.js";
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
import { applyDefeatCombo, applyExplosionDamage, decayCombo, getHitResult, scoreDefeat, shouldShowCombo } from "./combat.js";
import { resolveCircleCollision } from "./collision.js";
import { ensureAudio, playSound, playSegmentedReload, cancelSegmentedReload } from "./audio.js";
import { consumeJumpRequest, updateJumpState } from "./player.js";
import {
  createWeaponState,
  fireWeapon,
  getCurrentWeapon,
  getReloadProgress,
  selectWeapon,
  setTriggerHeld,
  startReload,
  updateWeaponState,
} from "./weapon.js";
import { resetHandAnimationFlags, updateHands } from "./handModel.js";
import { loadTaczFirstPersonWeapon, updateTaczFirstPersonWeapon } from "./taczFirstPersonAdapter.js";
import { updateReloadAnimation } from "./reloadAnimation.js";
import { getV2Animation } from "./v2AnimationParser.js";
import { preloadTaczAnimations } from "./taczAnimationParser.js";
import { playWeaponAnimationAction, updateWeaponAnimation } from "./weaponAnimationController.js";
import { buildLighting, createWorld, updateCrystal } from "./world.js";
import {
  addBlockChips,
  addHitSpark,
  createBreakParticles,
  createExplosionEffect,
  createFloatingText,
  flashBlock,
  flashMaterials,
  spawnProjectileTrail,
  updateTemporaryMeshes,
} from "./effects.js";
import { clearCrosshair, closeInventory, createGameUi, hideArenaHud, hideResult, isInventoryOpen, openInventory, setCrosshair, setCrosshairForWeapon, showCombo, showResult, showStart, updateHitMarker, updateHud, updateInventoryPanel } from "./ui.js";
import { createWeaponLab } from "./weaponLab.js";
import { buildInventoryViewData } from "./inventoryView.js";

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
// Phase 2 纯枪模静态渲染模式：URL ?taczStatic=1 开启，仅渲染 TaCZ geo 模型 + rig，
// 切断手臂/动画/后坐力/换弹下沉/枪口火焰/camera kick 等动态视觉干扰。
const PURE_TACZ_STATIC = query.has("taczStatic");
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
// 面板武器槽点击切枪回调：selectWeaponSlot 是函数声明（hoist），此时可安全绑定
ui.onWeaponSlotClick = selectWeaponSlot;

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
  // adsProgress：0=完全腰射 hip pose，1=完全开镜 ads pose；用于驱动 rig.blendPose 平滑过渡，
  // 与 camera.fov / angularSensibility 一起插值，避免武器 rig 瞬切造成视觉跳变
  adsProgress: 0,
  paused: false, // Tab 面板打开时为 true，暂停倒计时/刷怪/敌人移动
};

buildWeaponOverlay().catch((e) => {
  console.warn("[buildWeaponOverlay] failed:", e);
});
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
  if ((state.mode === "playing" || state.mode === "countdown" || state.mode === "weaponLab") && /^Digit[1-9]$/.test(event.code)) {
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
  // Tab 切换人物+背包面板：playing/countdown/weaponLab 三种模式都生效
  // 打开时暂停游戏+释放鼠标，关闭时重新锁定指针恢复射击
  // !event.repeat 防止长按 Tab 反复触发开/关闪烁
  if (event.code === "Tab" && !event.repeat && (state.mode === "playing" || state.mode === "countdown" || state.mode === "weaponLab")) {
    event.preventDefault();
    if (isInventoryOpen(ui)) {
      closeInventory(ui);
      state.paused = false;
      if (state.mode !== "ended") lockPointer();
    } else {
      state.weapons = setTriggerHeld(state.weapons, false);
      state.paused = true;
      openInventory(ui, buildInventoryContext(), weaponLabMode);
      exitPointerLock();
    }
  }
  // Esc 关闭 inventory 面板（与浏览器默认 Esc 退出指针锁定一致）
  if (event.code === "Escape" && isInventoryOpen(ui)) {
    closeInventory(ui);
    state.paused = false;
    if (state.mode !== "ended") lockPointer();
  }
});
document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});
document.addEventListener("pointerlockchange", () => {
  if (isPointerLocked()) return;
  state.weapons = setTriggerHeld(state.weapons, false);
  // 指针锁定退出时关闭 AWP 开镜，避免状态残留
  if (state.ads) {
    state.ads = false;
    state.adsProgress = 0;
    camera.fov = DEFAULT_FOV;
    camera.angularSensibility = DEFAULT_ANGULAR_SENSIBILITY;
    if (ui.scopeOverlay) ui.scopeOverlay.isVisible = false;
    if (ui.crosshairImage) ui.crosshairImage.isVisible = true;
  }
  // Tab 打开 inventory 面板时退出指针锁定，不弹开始面板（面板本身已遮挡游戏画面）
  if (isInventoryOpen(ui)) return;
  // 靶场模式退出锁定后显示开始面板；weaponLab 模式不弹面板，点击 canvas 重新锁定
  if (state.mode === "playing" || state.mode === "countdown") showStart(ui, true);
});
canvas.addEventListener("pointerdown", (event) => {
  // inventory 面板打开时不响应射击/锁定（面板已释放鼠标，点击应穿透到 GUI）
  if (isInventoryOpen(ui)) return;
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

  try {
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
    // inventory 面板打开期间每帧刷新武器详情+选中态+统计（同步反映切枪和 lab.stats 变化）
    if (isInventoryOpen(ui)) updateInventoryPanel(ui, buildInventoryContext());
  } catch (renderError) {
    if (!window.__renderErrorCount) window.__renderErrorCount = 0;
    window.__renderErrorCount++;
    if (window.__renderErrorCount <= 5) {
      console.error(`[render-loop] 异常 #${window.__renderErrorCount}: ${renderError.message}\nstack: ${renderError.stack}`);
    }
  }
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
  // v4 调试：在浏览器侧收集 error，超时时可通过 page.evaluate 读取
  const collectedErrors = [];
  window.addEventListener("error", (event) => {
    collectedErrors.push(`[error] ${event.message} @ ${event.filename}:${event.lineno}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    collectedErrors.push(`[unhandledrejection] ${event.reason}`);
  });
  const origConsoleError = console.error.bind(console);
  console.error = (...args) => {
    collectedErrors.push(`[console.error] ${args.map(String).join(" ")}`);
    origConsoleError(...args);
  };
  window.__blockTargetRangeDebug = {
    __collectedErrors: collectedErrors,
    start: () => startGame(),
    selectWeapon: (weaponId) => {
      const index = WEAPON_ORDER.indexOf(weaponId);
      if (index >= 0) selectWeaponSlot(index);
    },
    shoot: () => shoot(),
    reload: () => reloadCurrentWeapon(),
    // ADS 调试钩子：仅在当前武器支持 ADS（weapon.ads 配置存在）时切换 state.ads。
    // 与右键交互一致，state.ads 配合 adsProgress 在每帧 lerp，E2E 可读取 adsProgress > 0.8 验证过渡。
    setAds: (enabled) => {
      const weapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
      if (weapon?.ads) state.ads = Boolean(enabled);
      return window.__blockTargetRangeDebug.snapshot();
    },
    // 死靶调试钩子：绕过 ray pick 直接在指定坐标放假人，供 E2E 精确验证
    spawnDummyAt: (x, z) => {
      if (state.mode !== "weaponLab" || !weaponLab) return null;
      return weaponLab.spawnDummy(new BABYLON.Vector3(x, 0.04, z));
    },
    clearDummies: () => weaponLab?.clearDummies(),
    // 敌人模式调试钩子：E2E 直接启动/停止敌人模式，无需按 B 键
    startEnemyMode: () => weaponLab?.startEnemyMode(),
    stopEnemyMode: () => weaponLab?.stopEnemyMode(),
    // 将所有敌人瞬移到玩家位置触发接触扣血判定（E2E 专用，跳过等待追踪 AI 行进时间）
    // 追踪 AI 模式下不再用 goalZ 扣血，必须靠 contactRange 距离判定
    // 重置无敌冷却让 E2E 能连续多次扣血到 HP 归零（正常游戏需等 0.8s 冷却）
    advanceEnemiesToGoal: () => {
      if (!weaponLab) return;
      weaponLab.enemyInvulnTimer = 0;
      const playerPos = camera.position;
      for (const enemy of weaponLab.enemies) {
        enemy.group.position.x = playerPos.x;
        enemy.group.position.z = playerPos.z - 0.1; // 略偏移避免完全重合
      }
    },
    // 动靶模式调试钩子：E2E 直接启动/停止动靶模式，无需按 V 键
    startMovingMode: () => weaponLab?.startMovingMode(),
    stopMovingMode: () => weaponLab?.stopMovingMode(),
    // 将所有动靶瞬移到中心 (0, 0, 6) 并冻结振荡，让 E2E shoot() 中心射线能命中
    // 三路线（horizontal/circular/pendulum）z 可能偏离 6，全部归到 z=6 才能被中心射线命中
    moveMovingTargetsToCenter: () => {
      if (!weaponLab) return;
      for (const mt of weaponLab.movingTargets) {
        mt.group.metadata.frozen = true;
        mt.group.position.x = 0;
        mt.group.position.z = WEAPON_LAB_CONFIG.movingTarget.zPosition;
      }
    },
    // 读取动靶位置数组，E2E 用来验证振荡和路线
    getMovingTargetPositions: () => {
      if (!weaponLab) return [];
      return weaponLab.movingTargets.map((mt) => ({
        x: mt.group.position.x,
        z: mt.group.position.z,
        dead: Boolean(mt.group.metadata.dead),
        route: mt.group.metadata.route ?? "horizontal",
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
    // 检查 V2 动画缓存和部件 pivot 状态（调试部件级动画）
    getPartAnimStatus: (weaponId, isEmpty) => {
      const anim = getV2Animation(weaponId, isEmpty);
      const controller = weaponModels[weaponId];
      return {
        weaponId,
        isEmpty,
        hasMagazineAnim: Boolean(anim?.magazine),
        hasSlideAnim: Boolean(anim?.slide),
        magazineFrames: anim?.magazine?.times?.length ?? 0,
        slideFrames: anim?.slide?.times?.length ?? 0,
        hasMagazinePivot: Boolean(controller?.magazinePivot),
        hasSlidePivot: Boolean(controller?.slidePivot),
      };
    },
    snapshot: () => {
      const weapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
      const controller = weaponModels[weapon.id];
      const visibleMeshCount = controller?.root
        ?.getChildMeshes(false)
        .filter((mesh) => mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices?.() > 0)
        .length ?? 0;
      const screenBounds = getModelScreenBounds(controller);
      const screenGeometry = computeNativeScreenFragments(controller);
      return {
        mode: state.mode,
        pureTaczStatic: PURE_TACZ_STATIC,
        inventoryOpen: isInventoryOpen(ui),
        inventoryCurrentWeaponId: ui.inventoryContext?.currentWeaponId ?? null,
        paused: state.paused,
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
          pureStatic: Boolean(controller?.pureStatic),
          staticPoseApplied: Boolean(controller?.staticPoseApplied),
          staticPoseSource: controller?.staticPoseSource ?? null,
          phase2StaticPose: controller?.phase2StaticPose ?? null,
          hasHands: Boolean(controller?.hands),
          leftHandEnabled: controller?.hands?.leftHand?.root ? Boolean(controller.hands.leftHand.root.isEnabled()) : false,
          rightHandEnabled: controller?.hands?.rightHand?.root ? Boolean(controller.hands.rightHand.root.isEnabled()) : false,
          hasAnimationController: Boolean(controller?.animationController),
          partCount: controller?.partCount ?? 0,
          status: controller?.status ?? "missing",
          rootEnabled: Boolean(controller?.root?.isEnabled()),
          visibleMeshCount,
          screenBounds,
          // 部件级动画 pivot 位置（换弹时应非零）
          magazinePivot: controller?.magazinePivot
            ? [controller.magazinePivot.position.x, controller.magazinePivot.position.y, controller.magazinePivot.position.z]
            : null,
          slidePivot: controller?.slidePivot
            ? [controller.slidePivot.position.x, controller.slidePivot.position.y, controller.slidePivot.position.z]
            : null,
          boltPivot: controller?.boltPivot
            ? [controller.boltPivot.position.x, controller.boltPivot.position.y, controller.boltPivot.position.z]
            : null,
          heldMagazineVisible: Boolean(controller?.heldMagazinePivot?.isEnabled()),
          heldRocketVisible: Boolean(controller?.heldRocketPivot?.isEnabled()),
          taczAnimation: controller?.animationController ? {
            status: controller.animationController.status,
            warning: controller.animationController.warning,
            action: controller.animationController.action,
            animationName: controller.animationController.animationName,
            progress: controller.animationController.lastPose?.progress ?? 0,
            hasLeftHand: Boolean(controller.animationController.lastPose?.lefthand),
            hasRightHand: Boolean(controller.animationController.lastPose?.righthand),
            hasHeld: Boolean(controller.animationController.lastPose?.held),
            hasTaczBoneMap: Boolean(controller.animationController.taczBoneMap),
            // 当前帧真实采样路径。hasTaczBoneMap 只能证明已接线，不能证明 lastPose 已走原生路径。
            isTaczNative: Boolean(controller.animationController.lastPose?.isTaczNative),
          } : null,
          // 原生武器 bounds：worldBounds 用于屏幕/枪口调试；nativeLocalBounds 用于散架检测，
          // 避免长枪经第一人称 root 旋转后把长度投到世界 X 轴造成误判。
          worldBounds: controller?.isTaczNative ? computeNativeWorldBounds(controller) : null,
          nativeLocalBounds: controller?.isTaczNative ? computeNativeLocalBounds(controller) : null,
          debugGeometry: controller?.taczGeoModel?.debugGeometry ? {
            coordinateMode: controller.taczGeoModel.debugGeometry.coordinateMode,
            cubeCount: controller.taczGeoModel.debugGeometry.cubeCount,
            bounds: controller.taczGeoModel.debugGeometry.bounds,
            rawBounds: controller.taczGeoModel.debugGeometry.rawBounds,
            visibleBounds: controller.taczGeoModel.debugGeometry.visibleBounds,
            outliers: controller.taczGeoModel.debugGeometry.outliers?.slice(0, 10) ?? [],
            rawOutliers: controller.taczGeoModel.debugGeometry.rawOutliers?.slice(0, 10) ?? [],
            visibleOutliers: controller.taczGeoModel.debugGeometry.visibleOutliers?.slice(0, 10) ?? [],
            screenFragments: screenGeometry.fragments,
            screenOutliers: screenGeometry.outliers,
            screenDiagnosticsVersion: screenGeometry.version,
            semantics: controller.taczGeoModel.debugGeometry.semantics,
          } : null,
          // 原生第一人称定位组诊断：用于排查 marker 是否读取、calibration 是否被覆盖、
          // rig 当前 pose 与 weaponRoot transform 是否符合预期
          firstPersonMarkers: controller?.firstPersonMarkers ? {
            idleView: Boolean(controller.firstPersonMarkers.idleView),
            ironView: Boolean(controller.firstPersonMarkers.ironView),
            leftHand: Boolean(controller.firstPersonMarkers.leftHand),
            rightHand: Boolean(controller.firstPersonMarkers.rightHand),
          } : null,
          calibrationSource: controller?.calibrationSource ?? controller?.rig?.calibration?.markerSource ?? null,
          // 枪口锚点来源诊断：{ boneName, position } 或 null（fallback 到 calibration.muzzle）
          nativeMuzzleSource: controller?.nativeMuzzleSource ?? null,
          rigCurrentPose: controller?.rig?.currentPose ?? null,
          weaponRootPosition: controller?.rig?.weaponRoot ? {
            x: controller.rig.weaponRoot.position.x,
            y: controller.rig.weaponRoot.position.y,
            z: controller.rig.weaponRoot.position.z,
          } : null,
          weaponRootRotation: controller?.rig?.weaponRoot ? {
            x: controller.rig.weaponRoot.rotation.x,
            y: controller.rig.weaponRoot.rotation.y,
            z: controller.rig.weaponRoot.rotation.z,
          } : null,
          adsProgress: state.adsProgress,
        },
        runtime: {
          ammo: state.weapons.ammo[weapon.id] ?? 0,
          magazineSize: weapon.magazineSize,
          reloading: state.weapons.reloading,
          weaponRecoil: state.weaponRecoil,
          muzzleFlashTimer: state.muzzleFlashTimer,
          muzzleFlashEnabled: Boolean(muzzleFlashPlane?.isEnabled()),
          cameraFov: camera.fov,
          ads: state.ads,
          adsProgress: state.adsProgress,
          ...getMuzzleDebug(controller),
        },
        // weaponLab 模式下暴露弹孔数、双层统计、死靶状态、inventory 面板状态、玩家位置、AWP 开镜，供 e2e 探针验证
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
            inventoryOpen: isInventoryOpen(ui),
            paused: state.paused,
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
    highlightBone: (name, colorHex = "#ff3333") => {
      const weapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
      const controller = weaponModels[weapon.id];
      controller?.taczGeoModel?.highlightBone?.(name, colorHex);
      return window.__blockTargetRangeDebug.snapshot();
    },
    clearHighlights: () => {
      for (const controller of Object.values(weaponModels)) {
        controller?.taczGeoModel?.clearHighlights?.();
      }
      return window.__blockTargetRangeDebug.snapshot();
    },
    getVisibleOutliers: () => {
      const weapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
      return weaponModels[weapon.id]?.taczGeoModel?.debugGeometry?.visibleOutliers ?? [];
    },
    getScreenOutliers: () => {
      const weapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
      return computeNativeScreenFragments(weaponModels[weapon.id]).outliers;
    },
    snapshotPoseVariants: (weaponId = null) => {
      const currentWeapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
      return snapshotPoseVariants(weaponModels[weaponId || currentWeapon.id], weaponId || currentWeapon.id);
    },
    searchPhase2StaticPose: (weaponId = null) => {
      const currentWeapon = getCurrentWeapon(state.weapons, WEAPON_CONFIG);
      return searchPhase2StaticPose(weaponModels[weaponId || currentWeapon.id], weaponId || currentWeapon.id);
    },
    searchPhase2StaticPoses: (weaponIds = PHASE2_STATIC_WEAPONS) => searchPhase2StaticPoses(weaponIds),
    // v4 调试：暴露 weapon controller 供 E2E 直接检查 rootEnabled 根因
    getWeaponController: (id) => weaponModels[id],
    getWeaponControllers: () => weaponModels,
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

function isMeshEffectivelyVisible(mesh) {
  if (!mesh || mesh.isVisible === false || (mesh.getTotalVertices?.() ?? 0) <= 0) return false;
  let current = mesh;
  while (current) {
    if (typeof current.isEnabled === "function" && !current.isEnabled()) return false;
    current = current.parent;
  }
  return true;
}

function distanceOutsideRect(point, rect) {
  const dx = point.x < rect.minX ? rect.minX - point.x : Math.max(0, point.x - rect.maxX);
  const dy = point.y < rect.minY ? rect.minY - point.y : Math.max(0, point.y - rect.maxY);
  return Math.hypot(dx, dy);
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(sortedValues.length * ratio)));
  return sortedValues[index];
}

function summarizeMainScreenCluster(fragments) {
  if (fragments.length === 0) return null;
  const renderWidth = engine.getRenderWidth();
  const renderHeight = engine.getRenderHeight();
  const reliableFragments = fragments.filter((fragment) => !fragment.projectionUnreliable);
  const clusterSource = reliableFragments.length >= 8 ? reliableFragments : fragments;
  const nearFragments = clusterSource.filter((fragment) => (
    fragment.screenCenter.x >= -renderWidth * 0.25
    && fragment.screenCenter.x <= renderWidth * 1.25
    && fragment.screenCenter.y >= -renderHeight * 0.25
    && fragment.screenCenter.y <= renderHeight * 1.25
  ));
  const clusterFragments = nearFragments.length >= 8 ? nearFragments : clusterSource;
  const xs = clusterFragments.map((fragment) => fragment.screenCenter.x).sort((a, b) => a - b);
  const ys = clusterFragments.map((fragment) => fragment.screenCenter.y).sort((a, b) => a - b);
  return {
    minX: percentile(xs, 0.1) - 32,
    maxX: percentile(xs, 0.9) + 32,
    minY: percentile(ys, 0.1) - 24,
    maxY: percentile(ys, 0.9) + 24,
  };
}

function getCameraDepth(point) {
  const origin = camera.globalPosition ?? camera.position;
  const forward = camera.getForwardRay(1).direction.normalize();
  return BABYLON.Vector3.Dot(point.subtract(origin), forward);
}

function projectWorldPoint(point, viewport, transform) {
  const projected = BABYLON.Vector3.Project(point, BABYLON.Matrix.Identity(), transform, viewport);
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null;
  return projected;
}

function createDebugCubeLookup(controller) {
  const debugCubes = controller?.taczGeoModel?.debugGeometry?.cubes;
  if (!Array.isArray(debugCubes)) return new Map();
  return new Map(debugCubes.map((cube) => [`${cube.boneName}:${cube.cubeIndex}`, cube]));
}

function computeNativeScreenFragments(controller) {
  const cubes = controller?.taczGeoModel?.cubes;
  if (!controller?.root?.isEnabled() || !Array.isArray(cubes) || cubes.length === 0) {
    return { version: 2, fragments: [], outliers: [] };
  }

  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const transform = scene.getTransformMatrix();
  const cubeDebugLookup = createDebugCubeLookup(controller);
  const fragments = [];
  for (const cube of cubes) {
    const mesh = cube?.mesh;
    if (!isMeshEffectivelyVisible(mesh)) continue;
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    const worldCenter = bb.centerWorld;
    const cameraSpaceCenter = BABYLON.Vector3.TransformCoordinates(worldCenter, camera.getViewMatrix());
    const centerDepth = getCameraDepth(worldCenter);
    const centerProjection = projectWorldPoint(worldCenter, viewport, transform);
    if (!centerProjection) continue;

    const cornerDepths = bb.vectorsWorld.map((corner) => getCameraDepth(corner));
    const minCameraZ = Math.min(...cornerDepths);
    const maxCameraZ = Math.max(...cornerDepths);
    const validProjectedCorners = bb.vectorsWorld
      .map((corner, index) => ({
        point: projectWorldPoint(corner, viewport, transform),
        depth: cornerDepths[index],
      }))
      .filter((entry) => entry.point && entry.depth > camera.minZ)
      .map((entry) => entry.point);
    const behindNearPlane = centerDepth <= camera.minZ || minCameraZ <= camera.minZ;
    const projectedFromClippedAabb = validProjectedCorners.length !== bb.vectorsWorld.length;
    const projectionUnreliable = behindNearPlane || validProjectedCorners.length < 4;
    const points = validProjectedCorners.length >= 2 ? validProjectedCorners : [centerProjection];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(0, maxX - minX);
    const height = Math.max(0, maxY - minY);
    const cubeDebug = cubeDebugLookup.get(`${cube.boneName}:${cube.cubeIndex}`) ?? {};
    fragments.push({
      boneName: cube.boneName,
      cubeIndex: cube.cubeIndex,
      screenRect: { minX, maxX, minY, maxY, width, height },
      screenCenter: { x: centerProjection.x, y: centerProjection.y },
      areaPx: width * height,
      worldCenter: { x: worldCenter.x, y: worldCenter.y, z: worldCenter.z },
      cameraSpaceCenter: { x: cameraSpaceCenter.x, y: cameraSpaceCenter.y, z: centerDepth },
      minCameraZ,
      maxCameraZ,
      behindNearPlane,
      projectedFromClippedAabb,
      projectionUnreliable,
      boneChain: cubeDebug.boneChain ?? [cube.boneName],
      rootBoneName: cubeDebug.rootBoneName ?? cube.boneName,
      isProfileHiddenCandidate: Boolean(cubeDebug.isProfileHiddenCandidate),
      isMainStructureCandidate: Boolean(cubeDebug.isMainStructureCandidate),
      hideAllowed: Boolean(cubeDebug.hideAllowed),
      distanceToMainCluster: 0,
    });
  }

  const mainCluster = summarizeMainScreenCluster(fragments);
  if (!mainCluster) return { version: 2, fragments, outliers: [] };
  const reliableFragments = fragments.filter((fragment) => !fragment.projectionUnreliable);
  const areaSource = reliableFragments.length >= 8 ? reliableFragments : fragments;
  const areaValues = areaSource.map((fragment) => fragment.areaPx).sort((a, b) => a - b);
  const medianArea = percentile(areaValues, 0.5);
  const outliers = fragments
    .map((fragment) => ({
      ...fragment,
      distanceToMainCluster: distanceOutsideRect(fragment.screenCenter, mainCluster),
    }))
    .filter((fragment) => (
      fragment.distanceToMainCluster > 0
      || (medianArea > 0 && fragment.areaPx > medianArea * 12 && fragment.areaPx > 15000)
      || fragment.projectionUnreliable
    ))
    .sort((a, b) => (
      Number(a.projectionUnreliable) - Number(b.projectionUnreliable)
      || b.distanceToMainCluster - a.distanceToMainCluster
      || b.areaPx - a.areaPx
    ))
    .slice(0, 20);

  return {
    version: 2,
    fragments: fragments.slice(0, 80),
    outliers,
    mainCluster,
    medianArea,
  };
}

function cloneWeaponRootPose(controller) {
  const weaponRoot = controller?.rig?.weaponRoot;
  if (!weaponRoot) return null;
  return {
    position: weaponRoot.position.clone(),
    rotation: weaponRoot.rotation.clone(),
    rotationQuaternion: weaponRoot.rotationQuaternion?.clone() ?? null,
  };
}

function restoreWeaponRootPose(controller, pose) {
  const weaponRoot = controller?.rig?.weaponRoot;
  if (!weaponRoot || !pose) return;
  weaponRoot.position.copyFrom(pose.position);
  weaponRoot.rotation.copyFrom(pose.rotation);
  weaponRoot.rotationQuaternion = pose.rotationQuaternion?.clone() ?? null;
  weaponRoot.computeWorldMatrix(true);
}

function applyWeaponRootPose(controller, pose) {
  const weaponRoot = controller?.rig?.weaponRoot;
  if (!weaponRoot || !pose) return;
  weaponRoot.rotationQuaternion = null;
  weaponRoot.position.set(...pose.position);
  weaponRoot.rotation.set(...pose.rotation);
  weaponRoot.computeWorldMatrix(true);
}

function capturePoseVariant(controller, variant) {
  const screenGeometry = computeNativeScreenFragments(controller);
  const weaponRoot = controller?.rig?.weaponRoot;
  return {
    name: variant.name,
    source: variant.source,
    screenBounds: getModelScreenBounds(controller),
    screenOutliers: screenGeometry.outliers.slice(0, 10),
    nativeLocalBounds: computeNativeLocalBounds(controller),
    weaponRootPosition: weaponRoot ? {
      x: weaponRoot.position.x,
      y: weaponRoot.position.y,
      z: weaponRoot.position.z,
    } : null,
    weaponRootRotation: weaponRoot ? {
      x: weaponRoot.rotation.x,
      y: weaponRoot.rotation.y,
      z: weaponRoot.rotation.z,
    } : null,
  };
}

function snapshotPoseVariants(controller, weaponId) {
  const savedPose = cloneWeaponRootPose(controller);
  const weaponRoot = controller?.rig?.weaponRoot;
  if (!savedPose || !weaponRoot) return [];

  const variants = [
    { name: "current-marker-hip", source: "active", pose: null },
    {
      name: "fallback-calibration-hip",
      source: "WEAPON_CALIBRATION",
      pose: WEAPON_CALIBRATION[weaponId]?.hipPose ?? null,
    },
    {
      name: "identity-weapon-root",
      source: "zero-position-zero-rotation",
      pose: { position: [0, 0, 0], rotation: [0, 0, 0] },
    },
  ];
  if (PHASE2_STATIC_POSE_CALIBRATION[weaponId]) {
    variants.push({
      name: "phase2-static-config",
      source: "PHASE2_STATIC_POSE_CALIBRATION",
      pose: PHASE2_STATIC_POSE_CALIBRATION[weaponId],
    });
  }

  const results = [];
  try {
    for (const variant of variants) {
      if (variant.pose) applyWeaponRootPose(controller, variant.pose);
      results.push(capturePoseVariant(controller, variant));
      restoreWeaponRootPose(controller, savedPose);
    }
  } finally {
    restoreWeaponRootPose(controller, savedPose);
  }
  return results;
}

function rangeValues(min, max, step) {
  const values = [];
  const count = Math.round((max - min) / step);
  for (let i = 0; i <= count; i += 1) {
    values.push(Number((min + step * i).toFixed(4)));
  }
  return values;
}

function scorePhase2StaticPoseCandidate(controller, weaponId, source) {
  const screenGeometry = computeNativeScreenFragments(controller);
  const bounds = getModelScreenBounds(controller);
  if (!bounds) return null;

  const renderWidth = engine.getRenderWidth();
  const renderHeight = engine.getRenderHeight();
  const fragments = screenGeometry.fragments ?? [];
  const mainFragments = fragments.filter((fragment) => fragment.isMainStructureCandidate && !fragment.hideAllowed);
  const depthSource = mainFragments.length > 0 ? mainFragments : fragments;
  const minMainZ = depthSource.reduce((min, fragment) => Math.min(min, fragment.minCameraZ ?? fragment.cameraSpaceCenter?.z ?? Infinity), Infinity);
  const mainOutliers = (screenGeometry.outliers ?? []).filter((fragment) => fragment.isMainStructureCandidate && !fragment.hideAllowed);
  const reliableMainOutliers = mainOutliers.filter((fragment) => !fragment.projectionUnreliable);
  const unreliableMainOutliers = mainOutliers.filter((fragment) => fragment.projectionUnreliable);
  const unreliableCount = (screenGeometry.outliers ?? []).filter((fragment) => fragment.projectionUnreliable).length;
  const aspectRatio = bounds.height > 0 ? bounds.width / bounds.height : 0;
  const weaponType = WEAPON_CONFIG[weaponId]?.v2AnimationProfile?.type ?? WEAPON_CONFIG[weaponId]?.type ?? "unknown";
  const targetArea = 0.045;
  const areaPenalty = bounds.areaRatio < 0.018
    ? (0.018 - bounds.areaRatio) * 2600
    : bounds.areaRatio > 0.09
      ? (bounds.areaRatio - 0.09) * 2600
      : Math.abs(bounds.areaRatio - targetArea) * 450;
  const targetX = renderWidth * 0.66;
  const targetY = renderHeight * 0.58;
  const centerPenalty = (Math.abs(bounds.centerX - targetX) / renderWidth + Math.abs(bounds.centerY - targetY) / renderHeight) * 180;
  const edgePenalty = (
    Math.max(0, 48 - bounds.minX)
    + Math.max(0, bounds.maxX - (renderWidth - 24))
    + Math.max(0, 48 - bounds.minY)
    + Math.max(0, bounds.maxY - (renderHeight - 24))
  ) * 0.6;
  const depthPenalty = Number.isFinite(minMainZ) && minMainZ >= 0.28 ? 0 : (0.28 - (Number.isFinite(minMainZ) ? minMainZ : 0)) * 3500;
  const score = (
    depthPenalty
    + reliableMainOutliers.length * 320
    + mainOutliers.length * 90
    + unreliableCount * 180
    + areaPenalty
    + centerPenalty
    + edgePenalty
  );
  const weaponRoot = controller?.rig?.weaponRoot;
  return {
    weaponId,
    source,
    score,
    pose: weaponRoot ? {
      position: [weaponRoot.position.x, weaponRoot.position.y, weaponRoot.position.z],
      rotation: [weaponRoot.rotation.x, weaponRoot.rotation.y, weaponRoot.rotation.z],
    } : null,
    metrics: {
      weaponType,
      minMainZ,
      mainOutlierCount: mainOutliers.length,
      reliableMainOutlierCount: reliableMainOutliers.length,
      unreliableMainOutlierCount: unreliableMainOutliers.length,
      unreliableOutlierCount: unreliableCount,
      areaRatio: bounds.areaRatio,
      aspectRatio,
      centerX: bounds.centerX,
      centerY: bounds.centerY,
      width: bounds.width,
      height: bounds.height,
    },
    topOutliers: (screenGeometry.outliers ?? []).slice(0, 5).map((fragment) => ({
      boneName: fragment.boneName,
      cubeIndex: fragment.cubeIndex,
      hideAllowed: fragment.hideAllowed,
      projectionUnreliable: fragment.projectionUnreliable,
      isMainStructureCandidate: fragment.isMainStructureCandidate,
      distanceToMainCluster: fragment.distanceToMainCluster,
      areaPx: fragment.areaPx,
      minCameraZ: fragment.minCameraZ,
      boneChain: fragment.boneChain,
    })),
  };
}

function pushPhase2StaticCandidate(results, controller, weaponId, source) {
  const scored = scorePhase2StaticPoseCandidate(controller, weaponId, source);
  if (!scored) return;
  results.push(scored);
}

function searchPhase2StaticPose(controller, weaponId) {
  const savedPose = cloneWeaponRootPose(controller);
  const weaponRoot = controller?.rig?.weaponRoot;
  if (!savedPose || !weaponRoot) return { weaponId, candidates: [], top: [] };

  const basePose = PHASE2_STATIC_POSE_CALIBRATION[weaponId] ?? {
    position: [savedPose.position.x, savedPose.position.y, savedPose.position.z],
    rotation: [savedPose.rotation.x, savedPose.rotation.y, savedPose.rotation.z],
  };
  const xOffsets = rangeValues(-0.8, 0.4, 0.1);
  const yOffsets = rangeValues(-0.6, 0.4, 0.1);
  const zOffsets = rangeValues(0.2, 1.6, 0.1);
  const rotationOffsets = rangeValues(-0.25, 0.25, 0.05);
  const needsRotationSweep = new Set(["m4", "ak47", "m95", "m107"]).has(weaponId);
  const results = [];

  try {
    for (const dx of xOffsets) {
      for (const dy of yOffsets) {
        for (const dz of zOffsets) {
          applyWeaponRootPose(controller, {
            position: [
              basePose.position[0] + dx,
              basePose.position[1] + dy,
              basePose.position[2] + dz,
            ],
            rotation: basePose.rotation,
          });
          pushPhase2StaticCandidate(results, controller, weaponId, "position-grid");
        }
      }
    }

    if (needsRotationSweep) {
      const positionSeeds = [...results]
        .sort((a, b) => a.score - b.score)
        .slice(0, 12);
      for (const seed of positionSeeds) {
        for (const yaw of rotationOffsets) {
          for (const roll of rotationOffsets) {
            applyWeaponRootPose(controller, {
              position: seed.pose.position,
              rotation: [
                basePose.rotation[0],
                basePose.rotation[1] + yaw,
                basePose.rotation[2] + roll,
              ],
            });
            pushPhase2StaticCandidate(results, controller, weaponId, "position-grid+yaw-roll");
          }
        }
      }
    }
  } finally {
    restoreWeaponRootPose(controller, savedPose);
  }

  const top = results
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
  return {
    weaponId,
    basePose,
    candidateCount: results.length,
    searchSpace: {
      xOffset: [-0.8, 0.4, 0.1],
      yOffset: [-0.6, 0.4, 0.1],
      zOffset: [0.2, 1.6, 0.1],
      yawRollOffset: needsRotationSweep ? [-0.25, 0.25, 0.05] : null,
      rotationSweepSeeds: needsRotationSweep ? 12 : 0,
    },
    top,
  };
}

function waitForNextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForRenderStateRefresh() {
  await waitForNextFrame();
  await waitForNextFrame();
}

async function searchPhase2StaticPoses(weaponIds = PHASE2_STATIC_WEAPONS) {
  const originalWeaponId = state.weapons.currentWeaponId;
  const requested = Array.isArray(weaponIds) && weaponIds.length > 0 ? weaponIds : PHASE2_STATIC_WEAPONS;
  const validWeaponIds = requested.filter((weaponId) => WEAPON_ORDER.includes(weaponId));
  const weapons = {};

  try {
    for (const weaponId of validWeaponIds) {
      selectWeaponSlot(WEAPON_ORDER.indexOf(weaponId));
      // root 的启用状态在主循环里刷新；等两个渲染帧后再计算屏幕投影，避免把未激活 controller 当作失败。
      await waitForRenderStateRefresh();
      const result = searchPhase2StaticPose(weaponModels[weaponId], weaponId);
      weapons[weaponId] = result;
    }
  } finally {
    if (WEAPON_ORDER.includes(originalWeaponId)) {
      selectWeaponSlot(WEAPON_ORDER.indexOf(originalWeaponId));
      await waitForRenderStateRefresh();
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    pureTaczStatic: PURE_TACZ_STATIC,
    weaponIds: validWeaponIds,
    weapons,
    topSummary: validWeaponIds.map((weaponId) => {
      const best = weapons[weaponId]?.top?.[0] ?? null;
      return {
        weaponId,
        score: best?.score ?? null,
        pose: best?.pose ?? null,
        metrics: best?.metrics ?? null,
      };
    }),
  };
}

// 计算原生 TaCZ 武器的世界包围盒（遍历 geo model 所有 cube mesh 的 world bounding box 求并集）
// 用于 E2E 断言模型不异常膨胀：散架时 extent 会比正常状态大 4-6 倍
function computeNativeWorldBounds(controller) {
  const cubes = controller?.taczGeoModel?.cubes;
  if (!Array.isArray(cubes) || cubes.length === 0) return null;
  const min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  const max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  for (const cube of cubes) {
    const mesh = cube?.mesh;
    if (!mesh) continue;
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    if (bb.minimumWorld.x < min.x) min.x = bb.minimumWorld.x;
    if (bb.minimumWorld.y < min.y) min.y = bb.minimumWorld.y;
    if (bb.minimumWorld.z < min.z) min.z = bb.minimumWorld.z;
    if (bb.maximumWorld.x > max.x) max.x = bb.maximumWorld.x;
    if (bb.maximumWorld.y > max.y) max.y = bb.maximumWorld.y;
    if (bb.maximumWorld.z > max.z) max.z = bb.maximumWorld.z;
  }
  if (!Number.isFinite(min.x)) return null;
  return {
    minX: min.x, minY: min.y, minZ: min.z,
    maxX: max.x, maxY: max.y, maxZ: max.z,
    extentX: max.x - min.x,
    extentY: max.y - min.y,
    extentZ: max.z - min.z,
  };
}

function computeNativeLocalBounds(controller) {
  const cubes = controller?.taczGeoModel?.cubes;
  const modelRoot = controller?.taczGeoModel?.root;
  if (!Array.isArray(cubes) || cubes.length === 0 || !modelRoot) return null;
  modelRoot.computeWorldMatrix(true);
  const rootInverse = modelRoot.getWorldMatrix().clone().invert();
  const min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  const max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  for (const cube of cubes) {
    const mesh = cube?.mesh;
    if (!mesh) continue;
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    for (const corner of bb.vectorsWorld) {
      const local = BABYLON.Vector3.TransformCoordinates(corner, rootInverse);
      if (local.x < min.x) min.x = local.x;
      if (local.y < min.y) min.y = local.y;
      if (local.z < min.z) min.z = local.z;
      if (local.x > max.x) max.x = local.x;
      if (local.y > max.y) max.y = local.y;
      if (local.z > max.z) max.z = local.z;
    }
  }
  if (!Number.isFinite(min.x)) return null;
  return {
    minX: min.x, minY: min.y, minZ: min.z,
    maxX: max.x, maxY: max.y, maxZ: max.z,
    extentX: max.x - min.x,
    extentY: max.y - min.y,
    extentZ: max.z - min.z,
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
  // 原生武器 muzzleAnchor 从 bone 计算，射击时 bone 动画（slide 后坐）会移动 muzzle bone
  // snapshot 跨帧读取时 muzzleFlashPlane.position（上一帧）和 muzzleAnchor.getAbsolutePosition()（当前帧）不同步
  // 这里先同步 position 到当前 muzzleAnchor 位置，让距离检测反映位置有效性而非帧间抖动
  if (muzzleFlashPlane && controller?.muzzleAnchor && controller?.root?.isEnabled()) {
    controller.muzzleAnchor.computeWorldMatrix(true);
    muzzleFlashPlane.position.copyFrom(controller.muzzleAnchor.getAbsolutePosition());
  }
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

async function buildWeaponOverlay() {
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

  // Phase 8: 9 把武器统一走 loadTaczFirstPersonWeapon adapter 路径
  // adapter 内部创建 rig + weapon model + hands + animationController，并消费 display.json 资源链
  for (const id of WEAPON_ORDER) {
    const controller = await loadTaczFirstPersonWeapon(scene, camera, id, {
      weaponConfig: WEAPON_CONFIG[id],
      modelConfig: WEAPON_CONFIG[id].modelConfig,
      pureStatic: PURE_TACZ_STATIC,
    });
    weaponModels[id] = controller;
  }

  // 预解析 9 把枪的 TaCZ animation.json；正式运行路径不再静默退回旧四段式换弹。
  preloadTaczAnimations(WEAPON_CONFIG, WEAPON_ORDER).then((results) => {
    for (const [weaponId, result] of Object.entries(results)) {
      const animationController = weaponModels[weaponId]?.animationController;
      if (!animationController) continue;
      if (result.error) {
        animationController.status = "error";
        animationController.warning = result.error.message;
      } else {
        animationController.animationData = result.animation;
        animationController.status = "ready";
      }
    }
    if (!PURE_TACZ_STATIC) {
      playWeaponAnimationAction(weaponModels[state.weapons.currentWeaponId]?.animationController, "draw", { force: true });
    }
  }).catch((e) => {
    console.warn("[TaCZ anim] preload failed:", e);
  });
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
    paused: false,
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
  const activeAnimationController = getWeaponController(weapon.id)?.animationController;
  if (activeAnimationController?.locked) return;
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
  if (PURE_TACZ_STATIC) {
    // Phase 2 纯枪模模式：不写视觉 recoil/muzzle flash timer，避免主循环和 adapter 叠加动态偏移。
    state.weaponAnimTimer = 0;
    state.weaponRecoil = 0;
    state.muzzleFlashTimer = 0;
    if (muzzleFlashPlane?.isEnabled()) muzzleFlashPlane.setEnabled(false);
  } else {
    state.weaponAnimTimer = Math.min(0.16, weapon.fireInterval);
    state.weaponRecoil = weapon.recoil;
    state.muzzleFlashTimer = muzzleFlashDuration;
    // 每次开火随机化枪火贴图旋转，避免一坨白色；用 wAng 而非 mesh rotation（billboard 会覆盖后者）
    const flashCfg = getMuzzleFlashConfig(weapon.id);
    if (muzzleFlashPlane?.material?.diffuseTexture) {
      muzzleFlashPlane.material.diffuseTexture.wAng = (Math.random() - 0.5) * flashCfg.rotationRandom;
    }
  }
  state.crosshairHitTimer = 0;
  clearCrosshair(ui);
  playSound(weapon.fireSound);
  if (!PURE_TACZ_STATIC) {
    const animationController = getWeaponController(weapon.id)?.animationController;
    playWeaponAnimationAction(animationController, "shoot", {
      force: true,
      queueNext: weapon.v2AnimationProfile?.bolt ? "bolt" : null,
    });
    camera.rotation.x -= weapon.cameraKick;
  }
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
  state.weapons.reloadIsEmpty = reload.isEmpty;

  // 根据 soundScheme 选择换弹音播放方式：
  // single = Glock17/M4 有完整 reload 单文件
  // segmented = AK47/AWP/P90 只有分段音，用 magout+magin 两段按时序播放
  const reloadConfig = reload.isEmpty ? weapon.reloadEmpty : weapon.reloadTactical;
  const action = reload.isEmpty ? "reload_empty" : "reload_tactical";
  if (!PURE_TACZ_STATIC) {
    playWeaponAnimationAction(getWeaponController(weapon.id)?.animationController, action, { force: true });
  }
  if (reloadConfig.soundScheme === "single") {
    playSound(reload.isEmpty ? weapon.reloadEmptySound : weapon.reloadTacticalSound);
  } else if (!weapon.v2AnimationProfile) {
    const sounds = reload.isEmpty ? weapon.reloadEmptySound : weapon.reloadTacticalSound;
    playSegmentedReload(sounds.magout, sounds.magin, reloadConfig.feedTime);
  }
  updateHud(ui, state);
}

function selectWeaponSlot(index) {
  const weaponId = WEAPON_ORDER[index];
  if (!weaponId) return;
  const previous = state.weapons.currentWeaponId;
  state.weapons = selectWeapon(state.weapons, weaponId, WEAPON_CONFIG);
  if (state.weapons.currentWeaponId !== previous) {
    ensureAudio();
    cancelSegmentedReload(); // 切枪时取消上一把枪待播放的 magin 音
    playSound(WEAPON_CONFIG[weaponId].drawSound ?? "weaponDraw");
    if (!PURE_TACZ_STATIC) {
      playWeaponAnimationAction(getWeaponController(weaponId)?.animationController, "draw", { force: true });
    }
    updateHud(ui, state);
    // 切换准星贴图（每把武器配不同准星）
    setCrosshairForWeapon(ui, weaponId);
    // 切换武器时重置 AWP 开镜状态
    if (state.ads) {
      state.ads = false;
      state.adsProgress = 0;
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

  // 爆炸 AoE：在死亡判定前触发，让直击目标也受到爆炸伤害（直击+爆炸双重伤害）
  // 直击目标的死亡判定交给下方现有逻辑，避免双重 dispose
  if (weapon.explosion) {
    triggerExplosion(point, weapon, target);
  }

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

// 爆炸 AoE：在命中点引爆，对半径内所有目标施加衰减伤害
// directTarget 是直击目标（已在 hitTarget 中应用直击伤害），AoE 会额外扣血但死亡判定交给 hitTarget
function triggerExplosion(point, weapon, directTarget) {
  const allTargets = [
    ...targets,
    ...(weaponLab?.dummies ?? []),
    ...(weaponLab?.enemies ?? []),
    ...(weaponLab?.movingTargets ?? []),
  ];
  const hits = applyExplosionDamage(point, allTargets, weapon.explosion);
  for (const hit of hits) {
    applyAoEDamage(hit.target, hit.damage, point);
    // 非直击目标的死亡判定（直击目标由 hitTarget 统一判定，避免双重 dispose）
    if (hit.target !== directTarget && hit.target.group.metadata.health <= 0) {
      killAoETarget(hit.target, hit.damage, point);
    }
  }
  createExplosionEffect(scene, effects, point);
  playSound("burst");
}

// AoE 伤害：只扣血 + 视觉反馈，不做死亡判定（由调用方决定）
function applyAoEDamage(target, damage, point) {
  const data = target.group.metadata;
  if (data.health <= 0) return; // 已死亡目标不再受 AoE 伤害
  data.health -= damage;
  data.hitTimer = 0.2;
  data.healthVisibleTimer = 2.3;
  target.healthBar.group.setEnabled(true);
  const healthRatio = Math.max(0, data.health / data.maxHealth);
  target.healthBar.fill.scaling.x = healthRatio;
  target.healthBar.fill.position.x = -0.59 * (1 - healthRatio);
  flashMaterials(target.allParts, 0xff8c1a);
  addHitSpark(scene, effects, point, false);
}

// AoE 击杀判定：按目标类型走对应死亡分支（与 hitTarget 死亡分支对齐）
function killAoETarget(target, damage, point) {
  const data = target.group.metadata;
  const aoEHitResult = {
    damage,
    critical: false,
    label: "",
    damageLabel: `-${damage}`,
    basePoints: SCORE_VALUES[data.kind] ?? 0,
    comboGain: 1,
  };
  if (data.isDummy) {
    weaponLab?.onDummyKilled(target);
  } else if (data.isEnemy) {
    weaponLab?.onEnemyKilled(target);
  } else if (data.isMoving) {
    weaponLab?.onMovingKilled(target);
  } else {
    defeatTarget(target, point, aoEHitResult);
  }
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
  if (state.paused) return;
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
  if (state.paused) return;
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
  // Phase 2 纯枪模模式固定 hip pose + 默认 FOV，不进入 ADS 插值。
  const canAds = !PURE_TACZ_STATIC && state.mode === "weaponLab" && weapon.id === "awp" && weapon.ads;
  // adsProgress 驱动 rig.blendPose("hip","ads",weight)，与 FOV/灵敏度同速插值，
  // 避免武器 pose 瞬切而相机平滑造成的视觉撕裂
  const adsTarget = canAds && state.ads ? 1 : 0;
  state.adsProgress = BABYLON.Scalar.Lerp(
    state.adsProgress,
    adsTarget,
    Math.min(1, delta * 10)
  );
  if (!canAds && state.adsProgress < 0.001) {
    state.adsProgress = 0;
  }
  // FOV 由 adsProgress 混合，保证相机视角与武器 pose 同步过渡
  const adsFov = canAds && weapon.ads ? weapon.ads.fov : DEFAULT_FOV;
  const targetFov = BABYLON.Scalar.Lerp(DEFAULT_FOV, adsFov, state.adsProgress);
  camera.fov = BABYLON.Scalar.Lerp(camera.fov, targetFov, Math.min(1, delta * 10));
  if (canAds) {
    // 蒙版/准星仍用布尔 state.ads 控制显隐，不做透明度动画，避免扩大 UI 范围
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

  // Phase 2 纯枪模模式：强制 ADS/FOV 归零，避免上一帧残留的 adsProgress/fov 影响静态画面。
  if (PURE_TACZ_STATIC) {
    state.ads = false;
    state.adsProgress = 0;
    camera.fov = DEFAULT_FOV;
    camera.angularSensibility = DEFAULT_ANGULAR_SENSIBILITY;
    if (ui.scopeOverlay?.isVisible) ui.scopeOverlay.isVisible = false;
    if (ui.crosshairImage && !ui.crosshairImage.isVisible) ui.crosshairImage.isVisible = true;
  }

  if (PURE_TACZ_STATIC) {
    // 视觉 timer 每帧强制清零，确保 adapter 不会拿到非零 recoil/reloadProgress 叠加偏移
    state.weaponRecoil = 0;
    state.weaponAnimTimer = 0;
    state.muzzleFlashTimer = 0;
  } else {
    state.weaponRecoil = Math.max(0, state.weaponRecoil - delta * 7);
    state.weaponAnimTimer = Math.max(0, state.weaponAnimTimer - delta);
    state.muzzleFlashTimer = Math.max(0, state.muzzleFlashTimer - delta);
  }
  // 通用 3D 模型切换：遍历所有已加载的 3D 武器，只激活当前武器。
  const reloadProgress = getReloadProgress(state.weapons);
  for (const [id, controller] of Object.entries(weaponModels)) {
    const isActive = weapon.id === id;
    // Phase 8: adapter 路径用 updateTaczFirstPersonWeapon 替代 updateWeaponModel
    updateTaczFirstPersonWeapon(controller, {
      active: isActive,
      recoil: PURE_TACZ_STATIC ? 0 : state.weaponRecoil,
      reloading: PURE_TACZ_STATIC ? false : state.weapons.reloading,
      reloadProgress: PURE_TACZ_STATIC ? 0 : reloadProgress,
      ads: PURE_TACZ_STATIC ? false : (state.ads && isActive),
      // adsProgress 仅对激活武器生效；非激活武器传 0 让 rig 回到 hip pose
      adsProgress: PURE_TACZ_STATIC ? 0 : (isActive ? state.adsProgress : 0),
      pureStatic: PURE_TACZ_STATIC,
    });
    // 方块手动画：只在激活武器上更新，避免非激活武器的手部干扰
    // Phase 2 纯枪模模式：跳过 hand/animation/reload 整块，避免动画残留驱动 bone pose
    if (!PURE_TACZ_STATIC && isActive && controller.hands) {
      resetHandAnimationFlags(controller.hands);
      // 方式 B（兜底）：方式 A 已在 loadWeaponModel 中同步，正常情况下此处条件为 false 直接跳过
      // 保留作为兜底，防止方式 A 因时序异常未执行
      if (controller.isTaczNative && controller.taczBoneMap && !controller.animationController.taczBoneMap) {
        controller.animationController.taczBoneMap = controller.taczBoneMap;
        controller.animationController.taczGeoModel = controller.taczGeoModel;
      }
      const taczPose = updateWeaponAnimation(controller.animationController, delta);
      playTaczAnimationEvents(weapon, taczPose?.events ?? []);
      const reloadConfig = state.weapons.reloading
        ? (state.weapons.reloadIsEmpty ? WEAPON_CONFIG[id].reloadEmpty : WEAPON_CONFIG[id].reloadTactical)
        : null;
      // TaCZ animation.json 正式接管双手、root、部件 pivot 和手持弹匣/火箭弹。
      updateReloadAnimation(controller.hands, {
        reloading: state.weapons.reloading,
        reloadProgress,
        reloadIsEmpty: state.weapons.reloadIsEmpty,
        weaponId: id,
        reloadConfig,
        modelConfig: WEAPON_CONFIG[id].modelConfig,
        controller,
        taczPose,
        allowLegacy: false,
      });
      // 再叠加后坐力；V2 pose 已应用时不会覆盖双手姿势。
      updateHands(controller.hands, {
        recoil: state.weaponRecoil,
        reloading: state.weapons.reloading,
        reloadProgress,
        animationPoseApplied: Boolean(taczPose?.valid),
      });
    }
  }
  if (PURE_TACZ_STATIC) {
    if (muzzleFlashPlane?.isEnabled()) muzzleFlashPlane.setEnabled(false);
  } else {
    updateMuzzleFlash(getWeaponController(weapon.id), weapon.id);
  }
  state.crosshairHitTimer = Math.max(0, state.crosshairHitTimer - delta);
  // weaponLab 模式也需触发准星恢复，否则命中色卡住不回到 aiming/normal
  if (state.crosshairHitTimer <= 0 && (state.mode === "playing" || state.mode === "countdown" || state.mode === "weaponLab")) {
    updateAimState();
  }

  // 命中标记淡出
  updateHitMarker(ui, delta);

  state.comboPopTimer = Math.max(0, state.comboPopTimer - delta);
  if (state.comboPopTimer <= 0) ui.comboPopEl.isVisible = false;
}

function playTaczAnimationEvents(weapon, events) {
  if (!events?.length || !weapon) return;
  for (const event of events) {
    const effect = String(event.effect ?? "").toLowerCase();
    if (!effect) continue;
    if (effect.includes("draw")) {
      playSound(weapon.drawSound ?? "weaponDraw");
      continue;
    }
    const reloadSounds = state.weapons.reloadIsEmpty ? weapon.reloadEmptySound : weapon.reloadTacticalSound;
    if (effect.includes("magout") && reloadSounds?.magout) {
      playSound(reloadSounds.magout);
      continue;
    }
    if ((effect.includes("magin") || effect.includes("maghit")) && reloadSounds?.magin) {
      playSound(reloadSounds.magin);
      continue;
    }
    if ((effect.includes("boltclose") || effect.includes("charge") || effect.includes("chamber")) && reloadSounds?.magin) {
      playSound(reloadSounds.magin);
    }
  }
}

// weaponLab 模式每帧更新：统计 tick + 换弹完成检测。
// 武器状态/后坐力/模型/枪火已在 updateWeapon 中更新，这里只处理 weaponLab 特有逻辑。
// 统计渲染迁移到 Tab inventory 面板，由 main.js 通过 lab.getStats() 读取后填入。
function updateWeaponLab(delta, elapsed) {
  if (!weaponLab) return;
  if (state.paused) return;
  movePlayer(delta);
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

// 组装 Tab inventory 面板所需数据：从 state/weaponLab 收集后交给 buildInventoryViewData
function buildInventoryContext() {
  const enemyState = weaponLab
    ? {
        timeLeft: weaponLab.enemyTimeLeft,
        hp: weaponLab.enemyHP,
        result: weaponLab.enemyResult,
        playerMaxHP: WEAPON_LAB_CONFIG.enemyMode.playerHP,
      }
    : null;
  return buildInventoryViewData(state, weaponLab, enemyState);
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
