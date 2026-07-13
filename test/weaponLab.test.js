import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import { WEAPON_LAB_CONFIG, GAME_CONFIG, getWaveProfile } from "../src/config.js";
import { spawnTarget, updateTarget, updateChasingTarget, updateRouteTarget } from "../src/actors.js";
import { createStats } from "../src/weaponLab.js";

test("WEAPON_LAB_CONFIG 有 playerBounds 限制玩家活动范围", () => {
  assert.ok(WEAPON_LAB_CONFIG.playerBounds, "playerBounds 必须存在");
  const { x, zMin, zMax } = WEAPON_LAB_CONFIG.playerBounds;
  assert.equal(typeof x, "number");
  assert.equal(typeof zMin, "number");
  assert.equal(typeof zMax, "number");
  // x 限制在地面范围内（groundSize=40，半边 20），留 2 单位余量
  assert.ok(x <= 20, "playerBounds.x 不能超过地面半边");
  // zMin 在弹道墙前方（墙在 z=-wallDistance），zMax 在玩家初始位之后
  assert.ok(zMin < 0, "zMin 应允许走到墙前");
  assert.ok(zMax > WEAPON_LAB_CONFIG.playerStart.z, "zMax 应允许走到初始位之后");
});

test("WEAPON_LAB_CONFIG playerBounds 与 GAME_CONFIG playerBounds 结构一致", () => {
  // movePlayer 按相同结构读取，weaponLab 用 WEAPON_LAB_CONFIG，靶场用 GAME_CONFIG
  assert.deepEqual(
    Object.keys(WEAPON_LAB_CONFIG.playerBounds).sort(),
    Object.keys(GAME_CONFIG.playerBounds).sort()
  );
});

test("WEAPON_LAB_CONFIG playerStart 在 playerBounds 范围内", () => {
  const { x, z } = WEAPON_LAB_CONFIG.playerStart;
  const { x: bx, zMin, zMax } = WEAPON_LAB_CONFIG.playerBounds;
  assert.ok(Math.abs(x) <= bx, "playerStart.x 应在 playerBounds.x 范围内");
  assert.ok(z >= zMin && z <= zMax, "playerStart.z 应在 playerBounds z 范围内");
});

test("WEAPON_LAB_CONFIG 含死靶参数 dummyMaxCount 和 dummyRespawnSeconds", () => {
  assert.equal(typeof WEAPON_LAB_CONFIG.dummyMaxCount, "number");
  assert.equal(WEAPON_LAB_CONFIG.dummyMaxCount, 8);
  assert.equal(typeof WEAPON_LAB_CONFIG.dummyRespawnSeconds, "number");
  assert.equal(WEAPON_LAB_CONFIG.dummyRespawnSeconds, 3);
});

// 死靶模式：spawnTarget 接受 customPosition/speed/isDummy，位置精确、不调 nextLaneIndex
test("spawnTarget customPosition 跳过 lane 分配并标记 isDummy", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const pos = new BABYLON.Vector3(3, 0.04, -5);
  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: { customPosition: pos, speed: 0, isDummy: true, forceCreeper: false },
  });

  // 位置应等于 customPosition
  assert.equal(target.group.position.x, 3);
  assert.equal(target.group.position.y, 0.04);
  assert.equal(target.group.position.z, -5);
  // metadata 标记
  assert.equal(target.group.metadata.isDummy, true);
  assert.equal(target.group.metadata.speed, 0);
  assert.equal(target.group.metadata.laneX, 3, "laneX 应等于 customPosition.x 让 lerp 无副作用");
  assert.equal(target.group.metadata.baseY, 0.04);

  scene.dispose();
  engine.dispose();
});

test("spawnTarget customPosition 不调用 nextLaneIndex", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  // nextLaneIndex 若被调用会抛错
  let called = false;
  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: { customPosition: new BABYLON.Vector3(0, 0.04, -5), speed: 0, isDummy: true },
    nextLaneIndex: () => { called = true; return 0; },
  });
  assert.equal(called, false, "customPosition 模式不应调用 nextLaneIndex");
  assert.ok(target, "应正常返回 target");

  scene.dispose();
  engine.dispose();
});

// 靶场模式回归：不传 customPosition 时行为不变（走 lane 分配）
test("spawnTarget 不传 customPosition 时走 lane 分配（靶场回归）", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: { forceCreeper: false },
    nextLaneIndex: () => 1,
  });
  // lane=1 对应 GAME_CONFIG.lanes[1]=0
  assert.equal(target.group.position.x, GAME_CONFIG.lanes[1]);
  assert.equal(target.group.metadata.isDummy, false, "非 customPosition 模式 isDummy 应为 false");
  assert.equal(target.group.metadata.laneX, GAME_CONFIG.lanes[1]);

  scene.dispose();
  engine.dispose();
});

// 假人被击中时不 z 后退（避免累积前滑）
test("updateTarget 对 isDummy 跳过 z 后退", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: { customPosition: new BABYLON.Vector3(0, 0.04, -5), speed: 0, isDummy: true },
  });
  // 模拟被击中：hitTimer>0
  target.group.metadata.hitTimer = 0.2;
  const z0 = target.group.position.z;
  updateTarget(target, 0.016, 1.0, []);
  assert.equal(target.group.position.z, z0, "假人 z 不应因 hitTimer 后退");

  scene.dispose();
  engine.dispose();
});

// 普通敌人 hitTimer 时仍后退（验证分支不影响靶场行为）
test("updateTarget 对普通敌人保留 z 后退", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: { forceCreeper: false },
    nextLaneIndex: () => 1,
  });
  target.group.metadata.hitTimer = 0.2;
  const z0 = target.group.position.z;
  updateTarget(target, 0.016, 1.0, []);
  assert.ok(target.group.position.z < z0, "普通敌人 hitTimer 时应 z 后退");

  scene.dispose();
  engine.dispose();
});

// createStats dummy 字段：recordDummyHit/recordDummyKill/headshotRate
test("createStats dummy 统计记录爆头/身体/击杀/爆头率", () => {
  const stats = createStats();
  const weapon = { bodyDamage: 2 };
  // 爆头 3 发，身体 1 发
  stats.recordDummyHit("head", weapon, 3);
  stats.recordDummyHit("head", weapon, 3);
  stats.recordDummyHit("head", weapon, 3);
  stats.recordDummyHit("body", weapon, 2);
  stats.recordDummyKill();
  stats.recordDummyKill();

  const snap = stats.snapshot();
  assert.equal(snap.dummy.headshots, 3);
  assert.equal(snap.dummy.bodyshots, 1);
  assert.equal(snap.dummy.damage, 11);
  assert.equal(snap.dummy.kills, 2);
  // 爆头率 = 3/(3+1) = 75%
  assert.equal(snap.dummy.headshotRate, 75);
});

test("createStats resetSession 清零 dummy 统计", () => {
  const stats = createStats();
  const weapon = { bodyDamage: 2 };
  stats.recordDummyHit("head", weapon, 3);
  stats.recordDummyKill();
  assert.equal(stats.snapshot().dummy.headshots, 1);
  stats.resetSession();
  const snap = stats.snapshot();
  assert.equal(snap.dummy.headshots, 0);
  assert.equal(snap.dummy.bodyshots, 0);
  assert.equal(snap.dummy.damage, 0);
  assert.equal(snap.dummy.kills, 0);
  assert.equal(snap.dummy.headshotRate, 0);
});

test("createStats 无命中时 headshotRate 为 0 不除零", () => {
  const stats = createStats();
  const snap = stats.snapshot();
  assert.equal(snap.dummy.headshotRate, 0);
  assert.equal(snap.dummy.headshots, 0);
  assert.equal(snap.dummy.bodyshots, 0);
});

// ===== 阶段 4：敌人模式测试 =====

test("WEAPON_LAB_CONFIG 含 enemyMode 参数", () => {
  const em = WEAPON_LAB_CONFIG.enemyMode;
  assert.ok(em, "enemyMode 配置必须存在");
  assert.equal(typeof em.duration, "number");
  assert.equal(em.duration, 60);
  assert.equal(typeof em.maxTargets, "number");
  assert.equal(typeof em.playerHP, "number");
  assert.equal(em.playerHP, 200);
  assert.equal(typeof em.spawnZ, "number");
  assert.equal(typeof em.goalZ, "number");
  assert.equal(typeof em.firstSpawnDelay, "number");
  // 追踪 AI 模式下 goalZ 作兜底清理边界（玩家 z=12，goalZ=18 让敌人穿透后能被清理）
  assert.ok(em.goalZ > WEAPON_LAB_CONFIG.playerStart.z, "goalZ 应大于玩家初始位（兜底清理边界）");
  // 接触判定与无敌冷却字段
  assert.equal(typeof em.contactRange, "number");
  assert.ok(em.contactRange > 0, "contactRange 应为正数");
  assert.equal(typeof em.playerDamageCooldown, "number");
  assert.ok(em.playerDamageCooldown > 0, "playerDamageCooldown 应为正数");
  // spawnZ 应在墙后方（墙在 z=-wallDistance=-12）
  assert.ok(em.spawnZ < -WEAPON_LAB_CONFIG.wallDistance, "spawnZ 应在墙后方");
});

test("spawnTarget options.elapsed 覆盖波次计算", () => {
  // elapsed=30 应返回 mixed 波次（25~55s），而非 warmup（0~25s）
  const wave30 = getWaveProfile(30);
  assert.equal(wave30.phase, "mixed", "elapsed=30 应为 mixed 波次");
  const wave0 = getWaveProfile(0);
  assert.equal(wave0.phase, "warmup", "elapsed=0 应为 warmup 波次");

  // 验证 spawnTarget 使用 options.elapsed 而非 state.timeLeft 计算
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  // 传 state.timeLeft=75（靶场满血）但 options.elapsed=30，应走 mixed 波次
  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: {
      customPosition: new BABYLON.Vector3(0, 0.04, -18),
      isEnemy: true,
      forceCreeper: false, // 强制 zombie，避免随机 creeper 速度范围不同导致断言失败
      elapsed: 30,
    },
  });
  // mixed 波次的 zombieSpeed=[1.45, 1.9]，warmup=[1.25, 1.55]
  // 若用 state.timeLeft(75) 算 elapsed=0，speed 会在 [1.25, 1.55] 范围
  // 用 options.elapsed=30 算，speed 会在 [1.45, 1.9] 范围
  const speed = target.group.metadata.speed;
  assert.ok(speed >= 1.45 && speed <= 1.9, `elapsed=30 时 speed 应在 mixed 范围 [1.45, 1.9]，实际 ${speed}`);

  scene.dispose();
  engine.dispose();
});

test("spawnTarget isEnemy 标记 metadata", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: {
      customPosition: new BABYLON.Vector3(0, 0.04, -18),
      isEnemy: true,
      forceCreeper: false,
      elapsed: 0,
    },
  });
  assert.equal(target.group.metadata.isEnemy, true, "isEnemy 应为 true");
  assert.equal(target.group.metadata.isDummy, false, "isDummy 应为 false（互斥）");
  assert.ok(target.group.metadata.speed > 0, "未传 speed 时应用波次随机速度 > 0");
  assert.equal(target.group.position.z, -18, "z 应等于 customPosition.z");

  scene.dispose();
  engine.dispose();
});

test("createStats enemy 统计记录爆头/身体/击杀/爆头率", () => {
  const stats = createStats();
  const weapon = { bodyDamage: 2 };
  // 2 爆头 + 1 身体 + 1 击杀
  stats.recordEnemyHit("head", weapon, 3);
  stats.recordEnemyHit("head", weapon, 3);
  stats.recordEnemyHit("body", weapon, 2);
  stats.recordEnemyKill();

  const snap = stats.snapshot();
  assert.equal(snap.enemy.headshots, 2);
  assert.equal(snap.enemy.bodyshots, 1);
  assert.equal(snap.enemy.damage, 8);
  assert.equal(snap.enemy.kills, 1);
  // 爆头率 = 2/(2+1) = 67%
  assert.equal(snap.enemy.headshotRate, 67);
});

test("createStats resetSession 清零 enemy 统计", () => {
  const stats = createStats();
  const weapon = { bodyDamage: 2 };
  stats.recordEnemyHit("head", weapon, 3);
  stats.recordEnemyKill();
  assert.equal(stats.snapshot().enemy.headshots, 1);
  stats.resetSession();
  const snap = stats.snapshot();
  assert.equal(snap.enemy.headshots, 0);
  assert.equal(snap.enemy.bodyshots, 0);
  assert.equal(snap.enemy.damage, 0);
  assert.equal(snap.enemy.kills, 0);
  assert.equal(snap.enemy.headshotRate, 0);
});

// ===== 阶段 5：动靶模式测试 =====

test("WEAPON_LAB_CONFIG 含 movingTarget 参数", () => {
  const mt = WEAPON_LAB_CONFIG.movingTarget;
  assert.ok(mt, "movingTarget 配置必须存在");
  assert.equal(typeof mt.count, "number");
  assert.equal(mt.count, 3);
  assert.equal(typeof mt.zPosition, "number");
  assert.equal(mt.zPosition, 6);
  assert.equal(typeof mt.xRange, "number");
  assert.equal(typeof mt.moveSpeed, "number");
  assert.equal(typeof mt.respawnDelay, "number");
  assert.equal(mt.respawnDelay, 0.5);
  // zPosition=6 时相机射线 y≈2.69 命中 head hitbox
  assert.ok(mt.zPosition > 0, "zPosition 应为正值（墙前方）");
  assert.ok(mt.xRange > 0, "xRange 应为正值");
});

test("spawnTarget isMoving 标记 metadata", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: {
      customPosition: new BABYLON.Vector3(0, 0.04, 6),
      speed: 0,
      isMoving: true,
      forceCreeper: false,
    },
  });
  assert.equal(target.group.metadata.isMoving, true, "isMoving 应为 true");
  assert.equal(target.group.metadata.isDummy, false, "isDummy 应为 false（互斥）");
  assert.equal(target.group.metadata.isEnemy, false, "isEnemy 应为 false（互斥）");
  assert.equal(target.group.metadata.speed, 0, "speed 应为 0");
  assert.equal(target.group.position.z, 6, "z 应等于 customPosition.z");

  scene.dispose();
  engine.dispose();
});

test("updateTarget 对 isMoving 跳过 z 后退", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: {
      customPosition: new BABYLON.Vector3(0, 0.04, 6),
      speed: 0,
      isMoving: true,
      forceCreeper: false,
    },
  });
  // 模拟被击中：hitTimer>0
  target.group.metadata.hitTimer = 0.2;
  const z0 = target.group.position.z;
  updateTarget(target, 0.016, 1.0, []);
  assert.equal(target.group.position.z, z0, "动靶 z 不应因 hitTimer 后退");

  scene.dispose();
  engine.dispose();
});

test("createStats moving 统计记录爆头/身体/击杀/爆头率", () => {
  const stats = createStats();
  const weapon = { bodyDamage: 2 };
  // 2 爆头 + 1 身体 + 1 击杀
  stats.recordMovingHit("head", weapon, 3);
  stats.recordMovingHit("head", weapon, 3);
  stats.recordMovingHit("body", weapon, 2);
  stats.recordMovingKill();

  const snap = stats.snapshot();
  assert.equal(snap.moving.headshots, 2);
  assert.equal(snap.moving.bodyshots, 1);
  assert.equal(snap.moving.damage, 8);
  assert.equal(snap.moving.kills, 1);
  // 爆头率 = 2/(2+1) = 67%
  assert.equal(snap.moving.headshotRate, 67);
});

test("createStats resetSession 清零 moving 统计", () => {
  const stats = createStats();
  const weapon = { bodyDamage: 2 };
  stats.recordMovingHit("head", weapon, 3);
  stats.recordMovingKill();
  assert.equal(stats.snapshot().moving.headshots, 1);
  stats.resetSession();
  const snap = stats.snapshot();
  assert.equal(snap.moving.headshots, 0);
  assert.equal(snap.moving.bodyshots, 0);
  assert.equal(snap.moving.damage, 0);
  assert.equal(snap.moving.kills, 0);
  assert.equal(snap.moving.headshotRate, 0);
});

test("updateChasingTarget 朝玩家方向移动（距离单调递减）", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  // 敌人从 z=-18 出生，玩家在 z=12
  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: {
      customPosition: new BABYLON.Vector3(0, 0.04, -18),
      speed: 2.0,
      isEnemy: true,
      forceCreeper: false,
    },
  });
  const chasePos = new BABYLON.Vector3(0, 2, 12);
  let prevDist = BABYLON.Vector3.Distance(target.group.position, chasePos);
  // 模拟 30 帧，每帧 16ms，敌人应朝玩家方向走
  for (let i = 0; i < 30; i += 1) {
    updateChasingTarget(target, 0.016, i * 0.016, chasePos, []);
    const dist = BABYLON.Vector3.Distance(target.group.position, chasePos);
    assert.ok(dist <= prevDist + 1e-6, `第 ${i} 帧距离应单调递减或不变（prev=${prevDist}, cur=${dist}）`);
    prevDist = dist;
  }
  // 30 帧后应至少走了 0.5 单位
  const initialDist = Math.hypot(0, 12 - (-18));
  assert.ok(prevDist < initialDist - 0.5, "敌人应朝玩家走了至少 0.5 单位");

  scene.dispose();
  engine.dispose();
});

test("updateChasingTarget 击中时停顿（hitTimer>0 不前进）", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: {
      customPosition: new BABYLON.Vector3(0, 0.04, -18),
      speed: 2.0,
      isEnemy: true,
      forceCreeper: false,
    },
  });
  const chasePos = new BABYLON.Vector3(0, 2, 12);
  target.group.metadata.hitTimer = 0.2; // 模拟刚被击中
  const z0 = target.group.position.z;
  updateChasingTarget(target, 0.016, 1.0, chasePos, []);
  assert.equal(target.group.position.z, z0, "击中期间敌人不应前进");

  scene.dispose();
  engine.dispose();
});

test("updateRouteTarget horizontal 路线：x 振荡，z 不变", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: {
      customPosition: new BABYLON.Vector3(0, 0.04, 6),
      speed: 0,
      isMoving: true,
      forceCreeper: false,
    },
  });
  target.group.metadata.route = "horizontal";
  target.group.metadata.phase = 0;
  const cfg = { moveSpeed: 1.0, center: { x: 0, z: 6 }, xRange: 7, circularRadius: 4, pendulumRange: 5 };

  // 跑 100 帧采样，验证 x 在 [-7, 7]，z 恒为 6
  let xMin = Infinity, xMax = -Infinity, zChanged = false;
  for (let i = 0; i < 100; i += 1) {
    updateRouteTarget(target, 0.016, i * 0.016, cfg);
    const x = target.group.position.x;
    const z = target.group.position.z;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (Math.abs(z - 6) > 1e-6) zChanged = true;
  }
  assert.ok(xMin >= -7 - 1e-6 && xMax <= 7 + 1e-6, "horizontal x 应在 [-7, 7] 内");
  assert.ok(xMax - xMin > 5, "horizontal x 应有显著振荡范围");
  assert.ok(!zChanged, "horizontal z 应恒等于中心 z=6");

  scene.dispose();
  engine.dispose();
});

test("updateRouteTarget circular 路线：距中心半径≈circularRadius", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: {
      customPosition: new BABYLON.Vector3(0, 0.04, 6),
      speed: 0,
      isMoving: true,
      forceCreeper: false,
    },
  });
  target.group.metadata.route = "circular";
  target.group.metadata.phase = 0;
  const cfg = { moveSpeed: 1.0, center: { x: 0, z: 6 }, xRange: 7, circularRadius: 4, pendulumRange: 5 };

  // 跑 100 帧验证 sqrt(x² + (z-6)²) ≈ 4
  for (let i = 0; i < 100; i += 1) {
    updateRouteTarget(target, 0.016, i * 0.016, cfg);
    const dx = target.group.position.x;
    const dz = target.group.position.z - 6;
    const r = Math.hypot(dx, dz);
    assert.ok(Math.abs(r - 4) < 0.01, `circular 路线半径应 ≈ 4（实际 ${r}）`);
  }

  scene.dispose();
  engine.dispose();
});

test("updateRouteTarget pendulum 路线：z 在 [cz, cz+range] 内", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: {
      customPosition: new BABYLON.Vector3(0, 0.04, 6),
      speed: 0,
      isMoving: true,
      forceCreeper: false,
    },
  });
  target.group.metadata.route = "pendulum";
  target.group.metadata.phase = 0;
  const cfg = { moveSpeed: 1.0, center: { x: 0, z: 6 }, xRange: 7, circularRadius: 4, pendulumRange: 5 };

  // 跑 100 帧，验证 z 在 [6, 11] 内，x 恒为 0
  for (let i = 0; i < 100; i += 1) {
    updateRouteTarget(target, 0.016, i * 0.016, cfg);
    const z = target.group.position.z;
    const x = target.group.position.x;
    assert.ok(z >= 6 - 1e-6 && z <= 11 + 1e-6, `pendulum z 应在 [6, 11] 内（实际 ${z}）`);
    assert.ok(Math.abs(x) < 1e-6, "pendulum x 应恒等于中心 x=0");
  }

  scene.dispose();
  engine.dispose();
});

test("updateRouteTarget frozen=true 时位置不变", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.activeCamera = new BABYLON.FreeCamera("test-camera", new BABYLON.Vector3(0, 2, 12), scene);
  const skin = rawTexture(scene, [80, 180, 80, 255], 64, 64);

  const target = spawnTarget({
    scene,
    textures: { zombie: skin, creeper: skin },
    state: { timeLeft: 75 },
    options: {
      customPosition: new BABYLON.Vector3(0, 0.04, 6),
      speed: 0,
      isMoving: true,
      forceCreeper: false,
    },
  });
  target.group.metadata.route = "horizontal";
  target.group.metadata.frozen = true;
  const cfg = { moveSpeed: 1.0, center: { x: 0, z: 6 }, xRange: 7, circularRadius: 4, pendulumRange: 5 };

  const x0 = target.group.position.x;
  const z0 = target.group.position.z;
  for (let i = 0; i < 10; i += 1) {
    updateRouteTarget(target, 0.016, i * 0.016, cfg);
  }
  assert.equal(target.group.position.x, x0, "frozen 时 x 不应变");
  assert.equal(target.group.position.z, z0, "frozen 时 z 不应变");

  scene.dispose();
  engine.dispose();
});

function rawTexture(scene, rgba, width = 1, height = 1) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return BABYLON.RawTexture.CreateRGBATexture(data, width, height, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
}
