import * as BABYLON from "@babylonjs/core";
import { ENEMY_STATS, GAME_CONFIG, getWaveProfile } from "./config.js";
import { CREEPER_SKIN_UV, ZOMBIE_SKIN_UV, colorMaterial, createSkinCuboid } from "./assets.js";
import { wouldEnemyCollide } from "./collision.js";

export function createZombieTarget(scene, textures) {
  const group = new BABYLON.TransformNode("zombie", scene);
  const skin = textures.zombie;
  const parts = {};
  const allParts = [];
  const uv = ZOMBIE_SKIN_UV;

  parts.head = skinPart(scene, 1.08, 1.08, 1.08, skin, uv, uv.parts.head, group, "zombie-head");
  parts.head.position.y = 2.38;
  allParts.push(parts.head);

  parts.body = skinPart(scene, 0.94, 1.18, 0.62, skin, uv, uv.parts.body, group, "zombie-body");
  parts.body.position.y = 1.25;
  allParts.push(parts.body);

  parts.leftArm = skinPart(scene, 0.44, 1.12, 0.44, skin, uv, uv.parts.leftArm, group, "zombie-left-arm");
  parts.leftArm.position.set(-0.78, 1.25, 0.03);
  allParts.push(parts.leftArm);

  parts.rightArm = skinPart(scene, 0.44, 1.12, 0.44, skin, uv, uv.parts.rightArm, group, "zombie-right-arm");
  parts.rightArm.position.set(0.78, 1.25, 0.03);
  allParts.push(parts.rightArm);

  parts.leftLeg = skinPart(scene, 0.44, 0.98, 0.44, skin, uv, uv.parts.leftLeg, group, "zombie-left-leg");
  parts.leftLeg.position.set(-0.25, 0.49, 0);
  allParts.push(parts.leftLeg);

  parts.rightLeg = skinPart(scene, 0.44, 0.98, 0.44, skin, uv, uv.parts.rightLeg, group, "zombie-right-leg");
  parts.rightLeg.position.set(0.25, 0.49, 0);
  allParts.push(parts.rightLeg);

  return { group, parts, allParts };
}

export function createCreeperTarget(scene, textures) {
  const group = new BABYLON.TransformNode("creeper", scene);
  const skin = textures.creeper;
  const parts = {};
  const allParts = [];
  const uv = CREEPER_SKIN_UV;

  parts.head = skinPart(scene, 1.22, 1.22, 1.22, skin, uv, uv.parts.head, group, "creeper-head");
  parts.head.position.y = 2.28;
  allParts.push(parts.head);

  parts.body = skinPart(scene, 0.78, 1.12, 0.72, skin, uv, uv.parts.body, group, "creeper-body");
  parts.body.position.y = 1.24;
  allParts.push(parts.body);

  parts.legs = [];
  [[-0.34, 0.36], [0.34, 0.36], [-0.34, -0.36], [0.34, -0.36]].forEach(([x, z], index) => {
    const leg = skinPart(scene, 0.36, 0.68, 0.36, skin, uv, uv.parts.leg, group, `creeper-leg-${index}`);
    leg.position.set(x, 0.34, z);
    parts.legs.push(leg);
    allParts.push(leg);
  });
  return { group, parts, allParts };
}

export function createTargetHitBoxes(scene, isCreeper, group, options = {}) {
  const headHitBox = BABYLON.MeshBuilder.CreateBox("enemy-head-hitbox", {
    width: isCreeper ? 1.28 : 1.12,
    height: isCreeper ? 1.25 : 1.1,
    depth: isCreeper ? 1.28 : 1.12,
  }, scene);
  headHitBox.position.y = isCreeper ? 2.28 : 2.38;

  const bodyHitBox = BABYLON.MeshBuilder.CreateBox("enemy-body-hitbox", {
    width: isCreeper ? 1.32 : 1.72,
    height: isCreeper ? 1.28 : 1.54,
    depth: isCreeper ? 1.22 : 1.08,
  }, scene);
  bodyHitBox.position.y = isCreeper ? 0.88 : 0.98;

  [headHitBox, bodyHitBox].forEach((mesh) => {
    mesh.parent = group;
    const debugVisible = Boolean(options.debugHitbox);
    mesh.visibility = debugVisible ? 0.32 : 0;
    mesh.isPickable = true;
    mesh.checkCollisions = false;
    mesh.material = colorMaterial(scene, mesh === headHitBox ? "#ffe36a" : "#53a7ff", {
      alpha: debugVisible ? 0.2 : 0,
      emissive: BABYLON.Color3.FromHexString(mesh === headHitBox ? "#6b5f17" : "#163f66"),
    });
    mesh.material.wireframe = debugVisible;
    if (debugVisible) {
      mesh.enableEdgesRendering();
      mesh.edgesWidth = 6;
      mesh.edgesColor = mesh === headHitBox
        ? new BABYLON.Color4(1, 0.89, 0.25, 0.95)
        : new BABYLON.Color4(0.33, 0.65, 1, 0.95);
    }
  });
  return { headHitBox, bodyHitBox };
}

export function createHealthBar(scene) {
  const group = new BABYLON.TransformNode("health-bar", scene);
  const back = BABYLON.MeshBuilder.CreatePlane("health-back", { width: 1.25, height: 0.12 }, scene);
  back.material = colorMaterial(scene, "#2a1820", { alpha: 0.72 });
  const fill = BABYLON.MeshBuilder.CreatePlane("health-fill", { width: 1.18, height: 0.07 }, scene);
  fill.material = colorMaterial(scene, "#65ff73", { alpha: 0.92 });
  fill.position.z = -0.01;
  back.parent = group;
  fill.parent = group;
  group.position.y = 3.05;
  group.setEnabled(false);
  return { group, fill };
}

export function spawnTarget({ scene, textures, state, initial = false, options = {}, nextLaneIndex }) {
  // options.elapsed 优先（weaponLab 敌人模式传入自定义 elapsed）；否则用靶场 state.timeLeft 计算
  const elapsed = options.elapsed ?? (GAME_CONFIG.duration - state.timeLeft);
  const wave = getWaveProfile(elapsed);
  const isCreeper = options.forceCreeper ?? (wave.allowCreeper && Math.random() < wave.creeperChance);
  const model = isCreeper ? createCreeperTarget(scene, textures) : createZombieTarget(scene, textures);
  const group = model.group;
  const hitBoxes = createTargetHitBoxes(scene, isCreeper, group, options);
  const healthBar = createHealthBar(scene);
  healthBar.group.parent = group;

  // customPosition 供 weaponLab 死靶放置：跳过 lane 分配，直接用指定坐标。
  // laneX 仍设为 customPosition.x，让 updateTarget 的 lerp 无副作用（lerp(x, x, t) = x）。
  const useCustomPosition = Boolean(options.customPosition);
  const laneIndex = useCustomPosition ? -1 : (initial ? Math.floor(Math.random() * GAME_CONFIG.lanes.length) : nextLaneIndex());
  const laneX = useCustomPosition ? options.customPosition.x : GAME_CONFIG.lanes[laneIndex];
  const z = useCustomPosition ? options.customPosition.z : (initial ? randFloat(-23, -11) : GAME_CONFIG.spawnZ);
  const baseY = useCustomPosition ? options.customPosition.y : 0.04;
  const kind = isCreeper ? "creeper" : "zombie";
  const maxHealth = ENEMY_STATS[kind]?.health ?? 1;
  group.position.set(laneX, baseY, z);
  group.scaling.setAll(isCreeper ? 1.22 : 1.18);

  // options.speed 优先（死靶传 0）；未传则按波次随机（靶场模式行为不变）
  const speed = options.speed ?? randFloat(...(isCreeper ? wave.creeperSpeed : wave.zombieSpeed));
  group.metadata = {
    baseY,
    laneX,
    health: maxHealth,
    maxHealth,
    speed,
    // 假人标记：updateTarget 据此跳过 z 后退，hitTarget 据此走隐藏+重生而非 dispose
    isDummy: Boolean(options.isDummy),
    // 敌人标记：hitTarget 据此走 dispose+统计，不走 defeatTarget 的 score/combo/targets.splice
    isEnemy: Boolean(options.isEnemy),
    // 动靶标记：updateTarget 据此跳过 z 后退（避免脱离固定 z 平面），hitTarget 据此走隐藏+重生换相位
    isMoving: Boolean(options.isMoving),
    collisionRadius: isCreeper ? 0.92 : 0.9,
    collisionHeight: isCreeper ? 3.4 : 3.35,
    points: isCreeper ? 12 : 10,
    phase: Math.random() * Math.PI * 2,
    kind,
    hitTimer: 0,
    healthVisibleTimer: 0,
  };

  const target = { group, hitBoxes, healthBar, parts: model.parts, allParts: model.allParts };
  hitBoxes.headHitBox.metadata = { target, hitType: "head" };
  hitBoxes.bodyHitBox.metadata = { target, hitType: "body" };
  tagTargetParts(target);
  return target;
}

export function updateTarget(target, delta, elapsed, solidColliders) {
  const group = target.group;
  const data = group.metadata;
  data.hitTimer = Math.max(0, data.hitTimer - delta);
  data.healthVisibleTimer = Math.max(0, data.healthVisibleTimer - delta);
  target.healthBar.group.setEnabled(data.healthVisibleTimer > 0);

  const nextPosition = {
    x: data.laneX,
    y: group.position.y,
    z: group.position.z + data.speed * delta,
  };
  if (!wouldEnemyCollide(nextPosition, solidColliders, data.collisionRadius ?? 0.9, data.collisionHeight ?? 3.5)) {
    group.position.z = nextPosition.z;
  }
  group.position.x = lerp(group.position.x, data.laneX, 0.2);
  group.position.y = data.baseY + Math.sin(elapsed * 8 + data.phase) * 0.055;
  // 假人/动靶被击中时不后退：否则 hitTimer 0.2s 内每帧 z-=0.08 会累积偏移，
  // 假人会前滑约 1 单位，动靶会脱离固定 z 平面破坏跟枪命中判定
  if (data.hitTimer > 0 && !data.isDummy && !data.isMoving) group.position.z -= 0.08;
  animateTarget(target, elapsed);
}

// 动靶三路线更新：horizontal（水平振荡）/ circular（圆形）/ pendulum（前后弹）
// frozen=true 时跳过路线计算但保留动画，供 E2E 调试用（moveMovingTargetsToCenter 设 frozen）
export function updateRouteTarget(target, delta, elapsed, cfg) {
  const group = target.group;
  const data = group.metadata;
  data.hitTimer = Math.max(0, data.hitTimer - delta);
  data.healthVisibleTimer = Math.max(0, data.healthVisibleTimer - delta);
  target.healthBar.group.setEnabled(data.healthVisibleTimer > 0);

  if (data.frozen) {
    animateTarget(target, elapsed);
    return;
  }
  const t = elapsed * cfg.moveSpeed + data.phase;
  const cx = cfg.center.x;
  const cz = cfg.center.z;
  const prevX = group.position.x;
  const prevZ = group.position.z;
  if (data.route === "horizontal") {
    // 水平正弦振荡：x = cx + sin(t) * range，z 固定
    group.position.x = cx + Math.sin(t) * cfg.xRange;
    group.position.z = cz;
  } else if (data.route === "circular") {
    // 圆形：x = cx + cos(t)*r，z = cz + sin(t)*r
    group.position.x = cx + Math.cos(t) * cfg.circularRadius;
    group.position.z = cz + Math.sin(t) * cfg.circularRadius;
  } else if (data.route === "pendulum") {
    // 钟摆：z 在 [cz, cz + range] 间来回弹（用 abs(sin) 避免 z 越界到 cz 以下）
    group.position.z = cz + Math.abs(Math.sin(t)) * cfg.pendulumRange;
    group.position.x = cx;
  }
  // 朝向移动方向（位置差分算 atan2，避免除零）
  const dx = group.position.x - prevX;
  const dz = group.position.z - prevZ;
  if (Math.abs(dx) > 1e-5 || Math.abs(dz) > 1e-5) {
    group.rotation.y = Math.atan2(dx, dz);
  }
  group.position.y = data.baseY + Math.sin(elapsed * 8 + data.phase) * 0.055;
  animateTarget(target, elapsed);
}

// 追踪 AI 更新：朝玩家位置（camera.position）移动，接触判定由 weaponLab update 负责
// 击中时（hitTimer > 0）停顿 0.2s 不前进，保留手感但不复杂化方向计算
export function updateChasingTarget(target, delta, elapsed, chasePosition, solidColliders) {
  const group = target.group;
  const data = group.metadata;
  data.hitTimer = Math.max(0, data.hitTimer - delta);
  data.healthVisibleTimer = Math.max(0, data.healthVisibleTimer - delta);
  target.healthBar.group.setEnabled(data.healthVisibleTimer > 0);

  // 朝玩家方向的水平向量
  const dx = chasePosition.x - group.position.x;
  const dz = chasePosition.z - group.position.z;
  const dist = Math.hypot(dx, dz);
  // 击中瞬间停顿：hitTimer > 0 时不前进，让玩家有"打中有效"的反馈
  if (dist > 0.001 && data.hitTimer <= 0) {
    const nx = dx / dist;
    const nz = dz / dist;
    const nextX = group.position.x + nx * data.speed * delta;
    const nextZ = group.position.z + nz * data.speed * delta;
    if (!wouldEnemyCollide({ x: nextX, y: group.position.y, z: nextZ }, solidColliders, data.collisionRadius ?? 0.9, data.collisionHeight ?? 3.5)) {
      group.position.x = nextX;
      group.position.z = nextZ;
    }
    // 朝向移动方向（让僵尸面朝玩家）
    group.rotation.y = Math.atan2(nx, nz);
  }
  group.position.y = data.baseY + Math.sin(elapsed * 8 + data.phase) * 0.055;
  animateTarget(target, elapsed);
}

export function animateTarget(target, elapsed) {
  const data = target.group.metadata;
  const phase = elapsed * 7 + data.phase;
  const hitTilt = data.hitTimer > 0 ? -0.28 : 0;
  target.group.rotation.x = hitTilt;
  target.group.rotation.y = 0;
  target.healthBar.group.lookAt(target.group.getScene().activeCamera.position);

  if (data.kind === "zombie") {
    const swing = Math.sin(phase) * 0.55;
    target.parts.leftArm.rotation.x = swing;
    target.parts.rightArm.rotation.x = -swing;
    target.parts.leftLeg.rotation.x = -swing;
    target.parts.rightLeg.rotation.x = swing;
    target.parts.head.rotation.y = Math.sin(phase * 0.45) * 0.08;
  } else {
    const pulse = 1 + Math.max(0, target.group.position.z - 6) * 0.01 + Math.sin(phase * 0.65) * 0.012;
    target.parts.body.scaling.set(pulse, 1, pulse);
    target.parts.head.scaling.set(pulse, pulse, pulse);
    target.parts.legs.forEach((leg, index) => {
      leg.rotation.x = Math.sin(phase + index) * 0.32;
    });
  }
}

function skinPart(scene, width, height, depth, skin, uv, faces, parent, name) {
  const mesh = createSkinCuboid(scene, {
    name,
    width,
    height,
    depth,
    texture: skin,
    sourceWidth: uv.sourceWidth,
    sourceHeight: uv.sourceHeight,
    faces,
  });
  mesh.parent = parent;
  return mesh;
}

function tagTargetParts(target) {
  const headParts = new Set([target.parts.head]);
  target.allParts.forEach((mesh) => {
    mesh.isPickable = true;
    mesh.metadata = {
      ...(mesh.metadata ?? {}),
      target,
      hitType: headParts.has(mesh) ? "head" : "body",
    };
  });
}

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
