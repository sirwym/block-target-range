import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { ASSET_PATHS, GAME_CONFIG, WEAPON_CONFIG, WEAPON_ORDER, getRating, getWaveProfile } from "./config.js";
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
import { createP90WeaponModel, updateP90WeaponModel, createWeaponModel, updateWeaponModel } from "./weaponModel.js";
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
import { clearCrosshair, createGameUi, hideResult, setCrosshair, showCombo, showResult, showStart, updateHud } from "./ui.js";

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
camera.setTarget(new BABYLON.Vector3(0, 2.1, -24));

const textures = loadTextures(scene);
buildLighting(scene);
const sky = BABYLON.MeshBuilder.CreateSphere("sky-dome", { diameter: 170, segments: 16 }, scene);
sky.material = materialFromTexture(scene, createSkyTexture(scene));
sky.material.backFaceCulling = false;
sky.isPickable = false;
const world = createWorld(scene, textures);

const ui = createGameUi(scene, {
  onStart: startGame,
  onRestart: restartGame,
});

const keys = new Set();
const targets = [];
const previewMobs = [];
const projectiles = [];
const effects = [];
const debugMeshes = [];
const query = new URLSearchParams(window.location.search);
const debugHitbox = query.has("debugHitbox");
const debugActor = query.has("debugActor");
const debugWeapon = query.has("debugWeapon");
const debugWeapon2D = query.has("debugWeapon2D");

let weaponPlane;
let muzzleFlashPlane;
let p90Model;
const weaponModels = {}; // 通用 3D 武器模型控制器，按 weaponId 索引
let debugWeaponLabel;
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
};

buildWeaponOverlay();
resetGame({ preview: true });

document.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat && (state.mode === "playing" || state.mode === "countdown")) state.jumpRequested = true;
  }
  if ((state.mode === "playing" || state.mode === "countdown") && event.code === "KeyR") {
    event.preventDefault();
    reloadCurrentWeapon();
  }
  if ((state.mode === "playing" || state.mode === "countdown") && /^Digit[1-5]$/.test(event.code)) {
    selectWeaponSlot(Number(event.code.slice(-1)) - 1);
  }
});
document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});
document.addEventListener("pointerlockchange", () => {
  if (!isPointerLocked() && (state.mode === "playing" || state.mode === "countdown")) {
    state.weapons = setTriggerHeld(state.weapons, false);
    showStart(ui, true);
  }
});
canvas.addEventListener("pointerdown", () => {
  if ((state.mode === "playing" || state.mode === "countdown") && isPointerLocked()) {
    state.weapons = setTriggerHeld(state.weapons, true);
    shoot();
  }
});
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
  if (state.mode === "debugWeapon2D") updateDebugWeapon2D(delta, elapsed);
  if (state.mode === "countdown") updateCountdown(delta, elapsed);
  if (state.mode === "playing") updateGame(delta, elapsed);
  updateTemporaryMeshes(projectiles, effects, camera, scene, delta);
  updateCrystal(world.baseCrystal, delta, elapsed);
  updateWeapon(delta);
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

function buildWeaponOverlay() {
  const initialDisplay = WEAPON_CONFIG.glock17.display;
  weaponPlane = BABYLON.MeshBuilder.CreatePlane("weapon-overlay", { width: 0.98, height: 0.98 }, scene);
  weaponPlane.material = materialFromTexture(scene, textures.weapons.glock17, { transparent: true });
  weaponPlane.parent = camera;
  weaponPlane.position.set(initialDisplay.offsetX, initialDisplay.offsetY, 1.55);
  weaponPlane.rotation.z = initialDisplay.rotationZ;
  // flipX/flipY 通过 scaling 负值镜像贴图（平面 backFaceCulling=false，翻转后仍可见）。
  // TaC 背包图标不是第一人称 sprite：glock17/m4/ak47/awp 以 flipX 水平镜像校准到朝准星，
  // flipY 会破坏枪身上下关系并把枪口压向热栏；具体朝向以 ?debugWeapon2D=1 和真实页面验收为准。
  weaponPlane.scaling.set(initialDisplay.flipX ? -initialDisplay.scale : initialDisplay.scale, initialDisplay.flipY ? -initialDisplay.scale : initialDisplay.scale, initialDisplay.scale);
  weaponPlane.renderingGroupId = 2;
  weaponPlane.isPickable = false;

  muzzleFlashPlane = BABYLON.MeshBuilder.CreatePlane("muzzle-flash-overlay", { width: 0.42, height: 0.42 }, scene);
  muzzleFlashPlane.material = materialFromTexture(scene, textures.muzzleFlash, {
    transparent: true,
    emissiveColor: BABYLON.Color3.FromHexString("#fff2a8"),
  });
  muzzleFlashPlane.parent = camera;
  muzzleFlashPlane.position.set(0.64, -0.5, 1.2);
  muzzleFlashPlane.renderingGroupId = 3;
  muzzleFlashPlane.isPickable = false;
  muzzleFlashPlane.setEnabled(false);

  p90Model = createP90WeaponModel(scene, camera, (status) => {
    if (debugWeaponLabel) debugWeaponLabel.text = status;
  });

  // 通用 3D 武器模型加载：遍历所有配置了 modelConfig 的武器，创建 3D 模型控制器。
  // P90 走单独的 glTF 路径（createP90WeaponModel），不在此循环中。
  for (const id of WEAPON_ORDER) {
    if (!WEAPON_CONFIG[id].modelConfig) continue;
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
    if (debugWeapon2D) {
      state.mode = "debugWeapon2D";
      spawnDebugWeapon2D();
      showStart(ui, false);
    } else if (debugWeapon) {
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
  debugWeaponLabel = ui.addDebugLabel(p90Model?.status ?? "P90 model loading", p90Model.root, {
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
  if (debugWeaponLabel && p90Model) {
    let bboxInfo = "";
    let warn = false;
    if (p90Model.ready && p90Model.root) {
      try {
        p90Model.root.refreshBoundingInfo(true);
        const bb = p90Model.root.getBoundingInfo().boundingBox;
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
    debugWeaponLabel.text = `${p90Model.status ?? "loading"}${bboxInfo}${warn ? " WARN" : ""}`;
    debugWeaponLabel.color = warn ? "#ff4b4b" : "#ffffa0";
  }
  updateHud(ui, state);
}

function spawnDebugWeapon2D() {
  camera.position.set(0, GAME_CONFIG.playerGroundY, 12);
  camera.setTarget(new BABYLON.Vector3(0, 2.1, -24));
  if (weaponPlane) weaponPlane.setEnabled(false);
  if (muzzleFlashPlane) muzzleFlashPlane.setEnabled(false);
  if (p90Model?.root) p90Model.root.setEnabled(false);
  // debugWeapon2D 模式只校准 2D 贴图方向，必须关掉所有 3D 模型，
  // 否则 updateWeapon() 每帧仍会启用当前武器的 3D 模型，碎片叠在 2D 校准页上。
  for (const controller of Object.values(weaponModels)) {
    if (controller?.root) controller.root.setEnabled(false);
  }
  const cols = WEAPON_ORDER.length;
  const stepX = 2.0;
  const startX = -((cols - 1) * stepX) / 2;
  const variants = [
    { name: "native", flipX: false, flipY: false },
    { name: "flipH", flipX: true, flipY: false },
    { name: "flipV", flipX: false, flipY: true },
    { name: "flipHV", flipX: true, flipY: true },
  ];
  const rowStepY = 0.95;
  const startY = 1.2;
  WEAPON_ORDER.forEach((id, index) => {
    const weapon = WEAPON_CONFIG[id];
    const display = weapon.display;
    variants.forEach((variant, row) => {
      const plane = BABYLON.MeshBuilder.CreatePlane(`debug-2d-${id}-${variant.name}`, { width: 0.8, height: 0.8 }, scene);
      plane.material = materialFromTexture(scene, textures.weapons[id], { transparent: true });
      plane.parent = camera;
      plane.position.set(startX + index * stepX, startY - row * rowStepY, 1.6);
      plane.rotation.z = display.rotationZ;
      const s = display.scale * 0.65;
      plane.scaling.set(variant.flipX ? -s : s, variant.flipY ? -s : s, s);
      plane.renderingGroupId = 2;
      plane.isPickable = false;
      debugMeshes.push(plane);
      ui.addDebugLabel(`${id} ${variant.name}`, plane, { anchorY: 0, offsetY: 32, width: "140px", size: 12 });
    });
  });
  setCrosshair(ui, "normal", false);
}

function updateDebugWeapon2D(delta, elapsed) {
  void delta;
  void elapsed;
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
  state.muzzleFlashTimer = 0.055;
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
  if (!hit?.hit || !hit.pickedMesh) return;

  const target = hit.pickedMesh.metadata?.target;
  if (!target) {
    hitBlock(hit.pickedMesh, hit.pickedPoint);
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

  if (data.health <= 0) {
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

  const resolved = resolveCircleCollision(
    { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    world.solidColliders,
    GAME_CONFIG.playerRadius,
    GAME_CONFIG.playerBounds
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
  if ((state.mode === "playing" || state.mode === "countdown") && state.weapons.triggerHeld && weapon.automatic) {
    shoot();
  }

  state.weaponRecoil = Math.max(0, state.weaponRecoil - delta * 7);
  state.weaponAnimTimer = Math.max(0, state.weaponAnimTimer - delta);
  state.muzzleFlashTimer = Math.max(0, state.muzzleFlashTimer - delta);
  // debugWeapon2D 模式只校准 2D 贴图，跳过所有 3D 模型激活，防止碎片叠加到 2D 校准页上。
  const isDebug2D = state.mode === "debugWeapon2D";
  const p90Visible = isDebug2D ? false : updateP90WeaponModel(p90Model, {
    active: weapon.id === "p90",
    recoil: state.weaponRecoil,
    reloading: state.weapons.reloading,
  });
  // 通用 3D 模型切换：遍历所有已加载的 3D 武器，只激活当前武器
  let modelVisible = p90Visible;
  for (const [id, controller] of Object.entries(weaponModels)) {
    const visible = isDebug2D ? false : updateWeaponModel(controller, {
      active: weapon.id === id,
      recoil: state.weaponRecoil,
      reloading: state.weapons.reloading,
      modelConfig: WEAPON_CONFIG[id].modelConfig,
    });
    if (visible) modelVisible = true;
  }
  if (weaponPlane) {
    const display = weapon.display;
    const weaponTexture = textures.weapons[weapon.id];
    if (weaponPlane.material?.diffuseTexture !== weaponTexture) weaponPlane.material.diffuseTexture = weaponTexture;
    // 3D 模型加载成功时隐藏 2D weaponPlane，加载失败或未完成时回退到 2D
    weaponPlane.setEnabled(!modelVisible);
    const reloadDrop = state.weapons.reloading ? 0.1 : 0;
    weaponPlane.position.x = display.offsetX + state.weaponRecoil * 0.08;
    weaponPlane.position.y = display.offsetY - state.weaponRecoil * 0.08 - reloadDrop;
    weaponPlane.rotation.z = display.rotationZ - state.weaponRecoil * 0.14 + (state.weapons.reloading ? 0.08 : 0);
    const weaponScale = display.scale + state.weaponRecoil * 0.04;
    // 镜像符号必须与 buildWeaponOverlay 初始构建一致，否则切枪瞬间会闪一下反向；后坐力只放大绝对值不改符号。
    weaponPlane.scaling.set(display.flipX ? -weaponScale : weaponScale, display.flipY ? -weaponScale : weaponScale, weaponScale);
  }
  if (muzzleFlashPlane) {
    // 枪口火焰位置按当前武器的 modelConfig.muzzleOffset 切换，不共用固定值
    const muzzleOffset = weapon.modelConfig?.muzzleOffset ?? [0.64, -0.5, 1.2];
    muzzleFlashPlane.position.set(muzzleOffset[0], muzzleOffset[1], muzzleOffset[2]);
    muzzleFlashPlane.setEnabled(state.muzzleFlashTimer > 0);
    muzzleFlashPlane.rotation.z += delta * 20;
  }
  state.crosshairHitTimer = Math.max(0, state.crosshairHitTimer - delta);
  if (state.crosshairHitTimer <= 0 && (state.mode === "playing" || state.mode === "countdown")) {
    updateAimState();
  }

  state.comboPopTimer = Math.max(0, state.comboPopTimer - delta);
  if (state.comboPopTimer <= 0) ui.comboPopEl.isVisible = false;
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
