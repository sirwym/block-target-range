import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { GAME_CONFIG, WEAPON_LAB_CONFIG, getWaveProfile } from "./config.js";
import { addSolidBox, makeBlock } from "./world.js";
import { createBulletHoleDecal } from "./effects.js";
import { spawnTarget, updateTarget } from "./actors.js";

// 复用 ui.js 的字体栈，保证试验场看板与靶场 HUD 风格一致
const FONT_TITLE = "MinecraftTitle, PingFang SC, Microsoft YaHei, system-ui";
const FONT_UI = "MinecraftUI, PingFang SC, Microsoft YaHei, system-ui";

// 创建武器试验场：地面 + 弹道墙 + 弹孔管理 + 双层统计 + 数据看板。
// 不建灯光（main.js 已调用 buildLighting），不建敌人/基地/倒计时。
export function createWeaponLab(scene, textures, camera) {
  const lab = {};

  // 碰撞器列表：weaponLab 模式下独立维护，供 movePlayer / 敌人碰撞使用。
  // 阶段 1 只放地面；后续阶段可加掩体等。
  lab.solidColliders = [];
  // Tab 锁定相机状态：true 时 movePlayer 和鼠标转向都暂停，方便观察弹孔
  lab.cameraLocked = false;
  // 当前模式：idle（无敌人）/ static（死靶）/ enemy（阶段4）/ moving（阶段5）。首次 spawnDummy 切 static
  lab.mode = "idle";
  // 死靶数组：独立于 main.js targets[]，避免 defeatTarget 误 splice
  lab.dummies = [];
  // 敌人模式状态（阶段 4）：enemies 独立于 dummies 和 targets[]
  lab.enemies = [];
  lab.enemyTimeLeft = 0;
  lab.enemyHP = 0;
  lab.enemyElapsed = 0;
  lab.enemySpawnTimer = 0;
  lab.enemyResult = null;    // null=进行中, "victory"=存活, "defeat"=阵亡
  lab.enemyLastLane = 1;
  // 动靶模式状态（阶段 5）：movingTargets 独立于 dummies/enemies/targets[]
  lab.movingTargets = [];

  // 1. 封闭试验空间：地面 + 正面弹道墙
  lab.ground = makeBlock(scene, WEAPON_LAB_CONFIG.groundSize, 0.5, WEAPON_LAB_CONFIG.groundSize, textures.cobble, "lab-ground");
  lab.ground.position.set(0, -0.25, 0);
  lab.ground.isPickable = true;
  // pickCenter 只 pick 有 metadata.solid 的 mesh，地面注册为 solid 让射线能命中。
  // addSolidBox 会同时设 checkCollisions=true / isPickable=true / metadata.solid=true，
  // 并把 AABB 推入 lab.solidColliders，让 resolveCircleCollision 能用。
  addSolidBox(lab.solidColliders, [], lab.ground);

  // 弹道墙：玩家前方 wallDistance，正对相机。不挡玩家移动（checkCollisions=false），但可被射线 pick
  lab.wall = makeBlock(scene, WEAPON_LAB_CONFIG.wallWidth, WEAPON_LAB_CONFIG.wallHeight, 0.5, textures.cobble, "lab-wall");
  lab.wall.position.set(0, WEAPON_LAB_CONFIG.wallHeight / 2, -WEAPON_LAB_CONFIG.wallDistance);
  lab.wall.checkCollisions = false;
  lab.wall.isPickable = true;
  lab.wall.metadata = { ...(lab.wall.metadata ?? {}), solid: true };

  // 2. 弹孔管理：累积 Decal，超 maxCount 滚动清除最早的
  lab.bulletHoles = [];
  function addBulletHole(point, normal) {
    const decal = createBulletHoleDecal(scene, lab.wall, point, normal, WEAPON_LAB_CONFIG.bulletHole);
    lab.bulletHoles.push(decal);
    while (lab.bulletHoles.length > WEAPON_LAB_CONFIG.bulletHole.maxCount) {
      const old = lab.bulletHoles.shift();
      old.dispose();
    }
  }
  lab.clearBulletHoles = () => {
    lab.bulletHoles.forEach((d) => d.dispose());
    lab.bulletHoles = [];
  };

  // 3. 统计：弹匣层（换弹重置）+ 会话层（切武器重置）
  lab.stats = createStats();

  // 命中接入：shoot 命中墙时调用 onShootHit，脱靶（打天空/地面外）调用 onShootMiss
  lab.onShootHit = (point, normal, weapon) => {
    addBulletHole(point, normal);
    lab.stats.recordHit(weapon);
  };
  lab.onShootMiss = (weapon) => lab.stats.recordShot(weapon);
  lab.onReload = () => lab.stats.commitMagazine();
  lab.onWeaponSwitch = () => lab.stats.resetSession();
  lab.getStats = () => lab.stats.snapshot();

  // 5. 死靶模式：按 G 在地面放置静止假人，支持爆头/身体分区，死后 3s 原地重生
  // 死靶独立于 main.js targets[]，不经过 defeatTarget/disposeTarget，避免被 splice
  function disposeDummy(dummy) {
    dummy.group.getChildMeshes(false).forEach((mesh) => mesh.dispose());
    dummy.group.dispose();
  }
  lab.spawnDummy = (position) => {
    const dummy = spawnTarget({
      scene,
      textures,
      state: { timeLeft: GAME_CONFIG.duration },
      options: {
        customPosition: position,
        speed: 0,
        isDummy: true,
        forceCreeper: false,
      },
    });
    lab.dummies.push(dummy);
    // 上限 8 个，滚动清除最早的
    while (lab.dummies.length > WEAPON_LAB_CONFIG.dummyMaxCount) {
      const old = lab.dummies.shift();
      disposeDummy(old);
    }
    lab.mode = "static";
    return dummy;
  };
  lab.clearDummies = () => {
    lab.dummies.forEach(disposeDummy);
    lab.dummies = [];
    lab.mode = "idle";
  };
  // 命中死靶：按 hitType 累加 headshots/bodyshots 和伤害
  lab.onDummyHit = (hitType, weapon, hitResult) => {
    lab.stats.recordDummyHit(hitType, weapon, hitResult.damage);
  };
  // 击死死靶：隐藏模型 + 设 3s 重生计时器（不 dispose，保留位置）
  lab.onDummyKilled = (dummy) => {
    const data = dummy.group.metadata;
    data.dead = true;
    data.respawnTimer = WEAPON_LAB_CONFIG.dummyRespawnSeconds;
    dummy.group.setEnabled(false);
    lab.stats.recordDummyKill();
  };

  // 6. 敌人模式（阶段 4）：按 B 启动 60s 生存，敌人从远处车道推进，抵达玩家扣 HP
  function disposeEnemy(enemy) {
    enemy.group.getChildMeshes(false).forEach((mesh) => mesh.dispose());
    enemy.group.dispose();
  }
  function nextEnemyLaneIndex() {
    let lane = Math.floor(Math.random() * GAME_CONFIG.lanes.length);
    if (lane === lab.enemyLastLane) lane = (lane + 1 + Math.floor(Math.random() * 2)) % GAME_CONFIG.lanes.length;
    lab.enemyLastLane = lane;
    return lane;
  }
  lab.startEnemyMode = () => {
    lab.clearDummies();   // 模式互斥：清空死靶
    lab.clearEnemies();   // 清空已有敌人
    lab.mode = "enemy";
    lab.enemyTimeLeft = WEAPON_LAB_CONFIG.enemyMode.duration;
    lab.enemyHP = WEAPON_LAB_CONFIG.enemyMode.playerHP;
    lab.enemyElapsed = 0;
    lab.enemySpawnTimer = WEAPON_LAB_CONFIG.enemyMode.firstSpawnDelay;
    lab.enemyResult = null;
  };
  lab.stopEnemyMode = () => {
    lab.clearEnemies();
    lab.mode = "idle";
    lab.enemyResult = null;
  };
  lab.clearEnemies = () => {
    lab.enemies.forEach(disposeEnemy);
    lab.enemies = [];
  };
  lab.onEnemyHit = (hitType, weapon, hitResult) => {
    lab.stats.recordEnemyHit(hitType, weapon, hitResult.damage);
  };
  // 击杀敌人：dispose + splice + 记 kills（敌人不重生，直接消失）
  lab.onEnemyKilled = (enemy) => {
    lab.stats.recordEnemyKill();
    const idx = lab.enemies.indexOf(enemy);
    if (idx >= 0) lab.enemies.splice(idx, 1);
    disposeEnemy(enemy);
  };

  // 7. 动靶模式（阶段 5）：按 V 启动水平振荡靶，击杀后 0.5s 原地重生换相位
  function disposeMovingTarget(mt) {
    mt.group.getChildMeshes(false).forEach((mesh) => mesh.dispose());
    mt.group.dispose();
  }
  lab.spawnMovingTarget = () => {
    const cfg = WEAPON_LAB_CONFIG.movingTarget;
    const mt = spawnTarget({
      scene,
      textures,
      state: { timeLeft: GAME_CONFIG.duration },
      options: {
        // 动靶固定在 z=6：相机射线在此 z 的 y≈2.69，命中 zombie head hitbox
        customPosition: new BABYLON.Vector3(0, 0.04, cfg.zPosition),
        speed: 0,        // speed=0 让 updateTarget 不移动 z，振荡由 update 循环处理
        isMoving: true,
        forceCreeper: false,
      },
    });
    // 随机相位让每个靶振荡起点不同，避免同步移动
    mt.group.metadata.phase = Math.random() * Math.PI * 2;
    lab.movingTargets.push(mt);
    return mt;
  };
  lab.startMovingMode = () => {
    lab.clearDummies();
    lab.clearEnemies();
    lab.clearMovingTargets();
    lab.mode = "moving";
    for (let i = 0; i < WEAPON_LAB_CONFIG.movingTarget.count; i += 1) {
      lab.spawnMovingTarget();
    }
  };
  lab.stopMovingMode = () => {
    lab.clearMovingTargets();
    lab.mode = "idle";
  };
  lab.clearMovingTargets = () => {
    lab.movingTargets.forEach(disposeMovingTarget);
    lab.movingTargets = [];
  };
  lab.onMovingHit = (hitType, weapon, hitResult) => {
    lab.stats.recordMovingHit(hitType, weapon, hitResult.damage);
  };
  // 击杀动靶：隐藏 + 设 0.5s 重生计时器（不 dispose，保留对象复用）
  lab.onMovingKilled = (mt) => {
    const data = mt.group.metadata;
    data.dead = true;
    data.respawnTimer = WEAPON_LAB_CONFIG.movingTarget.respawnDelay;
    mt.group.setEnabled(false);
    lab.stats.recordMovingKill();
  };

  // 4. 数据看板（GUI，左上）
  lab.panel = createStatsPanel(scene);

  lab.update = (delta, elapsed) => {
    lab.stats.tick(delta);
    // 遍历死靶：死态倒计时重生，活态走 updateTarget（speed=0 不动，保留摆动/血条朝向）
    for (const dummy of lab.dummies) {
      const data = dummy.group.metadata;
      if (data.dead) {
        data.respawnTimer -= delta;
        if (data.respawnTimer <= 0) {
          // 重生：恢复血量、重新显示、重置血条
          dummy.group.setEnabled(true);
          data.health = data.maxHealth;
          data.dead = false;
          data.healthVisibleTimer = 2.3;
          data.hitTimer = 0;
          dummy.healthBar.group.setEnabled(true);
          dummy.healthBar.fill.scaling.x = 1;
          dummy.healthBar.fill.position.x = 0;
        }
      } else {
        updateTarget(dummy, delta, elapsed, lab.solidColliders);
      }
    }
    // 敌人模式更新：刷怪 + 推进 + 抵达扣血 + 结束判定
    if (lab.mode === "enemy" && !lab.enemyResult) {
      lab.enemyElapsed += delta;
      lab.enemyTimeLeft = Math.max(0, lab.enemyTimeLeft - delta);
      // 刷怪计时
      lab.enemySpawnTimer -= delta;
      if (lab.enemySpawnTimer <= 0 && lab.enemies.length < WEAPON_LAB_CONFIG.enemyMode.maxTargets) {
        const laneIndex = nextEnemyLaneIndex();
        const laneX = GAME_CONFIG.lanes[laneIndex];
        const enemy = spawnTarget({
          scene,
          textures,
          state: { timeLeft: 0 },
          options: {
            customPosition: new BABYLON.Vector3(laneX, 0.04, WEAPON_LAB_CONFIG.enemyMode.spawnZ),
            isEnemy: true,
            elapsed: lab.enemyElapsed,
          },
        });
        lab.enemies.push(enemy);
        const wave = getWaveProfile(lab.enemyElapsed);
        lab.enemySpawnTimer = randFloat(wave.spawnMin, wave.spawnMax);
      }
      // 更新敌人位置 + 检查抵达玩家
      for (let i = lab.enemies.length - 1; i >= 0; i -= 1) {
        const enemy = lab.enemies[i];
        updateTarget(enemy, delta, elapsed, lab.solidColliders);
        if (enemy.group.position.z > WEAPON_LAB_CONFIG.enemyMode.goalZ) {
          lab.enemyHP = Math.max(0, lab.enemyHP - WEAPON_LAB_CONFIG.enemyMode.damagePerReach);
          disposeEnemy(enemy);
          lab.enemies.splice(i, 1);
        }
      }
      // 结束条件：计时归零=存活，HP 归零=阵亡
      if (lab.enemyTimeLeft <= 0) {
        lab.enemyResult = "victory";
        lab.clearEnemies();
      } else if (lab.enemyHP <= 0) {
        lab.enemyResult = "defeat";
        lab.clearEnemies();
      }
    }
    // 动靶模式更新：死态倒计时重生换相位，活态走 updateTarget + 水平振荡
    if (lab.mode === "moving") {
      const cfg = WEAPON_LAB_CONFIG.movingTarget;
      for (const mt of lab.movingTargets) {
        const data = mt.group.metadata;
        if (data.dead) {
          data.respawnTimer -= delta;
          if (data.respawnTimer <= 0) {
            // 重生：恢复血量、换随机相位、重新显示
            mt.group.setEnabled(true);
            data.health = data.maxHealth;
            data.dead = false;
            data.phase = Math.random() * Math.PI * 2;
            data.healthVisibleTimer = 0;
            data.hitTimer = 0;
            mt.healthBar.group.setEnabled(false);
            mt.healthBar.fill.scaling.x = 1;
            mt.healthBar.fill.position.x = 0;
          }
        } else {
          updateTarget(mt, delta, elapsed, lab.solidColliders);
          // 水平正弦振荡：x = amplitude * sin(t * speed + phase)
          // 覆盖 updateTarget 的 lerp，让靶在固定 z 平面左右移动
          // frozen 标记跳过振荡（E2E 调试 moveMovingTargetsToCenter 用，让靶停在 x=0 供射线命中）
          if (!data.frozen) {
            mt.group.position.x = Math.sin(elapsed * cfg.moveSpeed + data.phase) * cfg.xRange;
          }
        }
      }
    }
    updateStatsPanel(lab.panel, lab.stats.snapshot(), lab.dummies.length, lab.mode, {
      timeLeft: lab.enemyTimeLeft,
      hp: lab.enemyHP,
      result: lab.enemyResult,
    });
  };

  lab.dispose = () => {
    lab.clearBulletHoles();
    lab.dummies.forEach(disposeDummy);
    lab.dummies = [];
    lab.enemies.forEach(disposeEnemy);
    lab.enemies = [];
    lab.movingTargets.forEach(disposeMovingTarget);
    lab.movingTargets = [];
    lab.ground.dispose();
    lab.wall.dispose();
    lab.panel.texture.dispose();
  };

  // 相机初始位面向弹道墙中心，让墙在视野正中央
  camera.position.set(WEAPON_LAB_CONFIG.playerStart.x, WEAPON_LAB_CONFIG.playerStart.y, WEAPON_LAB_CONFIG.playerStart.z);
  camera.setTarget(new BABYLON.Vector3(0, WEAPON_LAB_CONFIG.wallHeight / 2, -WEAPON_LAB_CONFIG.wallDistance));

  return lab;
}

// 双层统计：magazine（弹匣层，换弹重置）+ session（会话层，切武器重置）。
// DPS 时间口径：弹匣层从首发到末发（不含换弹间隙）；会话层从首枪到当前 tick。
// 导出供测试直接验证 dummy 统计字段，不必走完整 createWeaponLab
export function createStats() {
  const magazine = { shots: 0, hits: 0, damage: 0, firstShotTime: 0, lastShotTime: 0 };
  const session = { shots: 0, hits: 0, damage: 0, firstShotTime: 0, lastShotTime: 0 };
  // 死靶统计：headshots/bodyshots 按命中部位分，kills 计击杀数，damage 累计造成伤害
  const dummy = { headshots: 0, bodyshots: 0, damage: 0, kills: 0 };
  // 敌人统计（阶段 4）：结构与 dummy 一致，但敌人击杀后直接 dispose 不重生
  const enemy = { kills: 0, headshots: 0, bodyshots: 0, damage: 0 };
  // 动靶统计（阶段 5）：结构与 dummy 一致，击杀后 0.5s 重生换相位
  const moving = { headshots: 0, bodyshots: 0, damage: 0, kills: 0 };
  let currentTime = 0;

  function recordShot(weapon) {
    const t = currentTime;
    magazine.shots += 1;
    session.shots += 1;
    if (magazine.firstShotTime === 0) magazine.firstShotTime = t;
    magazine.lastShotTime = t;
    if (session.firstShotTime === 0) session.firstShotTime = t;
    session.lastShotTime = t;
  }

  // 命中墙视为 body 命中，伤害 = weapon.bodyDamage
  function recordHit(weapon) {
    recordShot(weapon);
    magazine.hits += 1;
    session.hits += 1;
    magazine.damage += weapon.bodyDamage;
    session.damage += weapon.bodyDamage;
  }

  // 死靶命中：按 hitType 分累加 headshots/bodyshots，伤害累计到 dummy.damage
  function recordDummyHit(hitType, weapon, damage) {
    if (hitType === "head") dummy.headshots += 1;
    else dummy.bodyshots += 1;
    dummy.damage += damage;
  }
  function recordDummyKill() {
    dummy.kills += 1;
  }

  // 敌人命中：按 hitType 分累加 headshots/bodyshots，伤害累计到 enemy.damage
  function recordEnemyHit(hitType, weapon, damage) {
    if (hitType === "head") enemy.headshots += 1;
    else enemy.bodyshots += 1;
    enemy.damage += damage;
  }
  function recordEnemyKill() {
    enemy.kills += 1;
  }

  // 动靶命中：按 hitType 分累加 headshots/bodyshots，伤害累计到 moving.damage
  function recordMovingHit(hitType, weapon, damage) {
    if (hitType === "head") moving.headshots += 1;
    else moving.bodyshots += 1;
    moving.damage += damage;
  }
  function recordMovingKill() {
    moving.kills += 1;
  }

  function commitMagazine() {
    magazine.shots = 0;
    magazine.hits = 0;
    magazine.damage = 0;
    magazine.firstShotTime = 0;
    magazine.lastShotTime = 0;
  }

  function resetSession() {
    commitMagazine();
    session.shots = 0;
    session.hits = 0;
    session.damage = 0;
    session.firstShotTime = 0;
    session.lastShotTime = 0;
    // 切武器时死靶统计也清零（会话层口径）
    dummy.headshots = 0;
    dummy.bodyshots = 0;
    dummy.damage = 0;
    dummy.kills = 0;
    // 敌人统计同样清零
    enemy.headshots = 0;
    enemy.bodyshots = 0;
    enemy.damage = 0;
    enemy.kills = 0;
    // 动靶统计同样清零
    moving.headshots = 0;
    moving.bodyshots = 0;
    moving.damage = 0;
    moving.kills = 0;
  }

  function tick(delta) {
    currentTime += delta;
  }

  function computeLayer(layer, isSession) {
    const hitRate = layer.shots > 0 ? layer.hits / layer.shots : 0;
    // 弹匣层：span=末发-首发（不含换弹间隙）；会话层：span=当前-首发（停火后随时间下降）
    const span = isSession
      ? (layer.firstShotTime > 0 ? currentTime - layer.firstShotTime : 0)
      : layer.lastShotTime - layer.firstShotTime;
    const dps = span > 0.05 ? layer.damage / span : 0;
    const fireRate = span > 0.05 ? layer.shots / span : 0;
    return {
      shots: layer.shots,
      hits: layer.hits,
      damage: Math.round(layer.damage * 10) / 10,
      hitRate: Math.round(hitRate * 100),
      dps: Math.round(dps * 10) / 10,
      fireRate: Math.round(fireRate * 10) / 10,
    };
  }

  function computeDummy() {
    const total = dummy.headshots + dummy.bodyshots;
    const headshotRate = total > 0 ? Math.round((dummy.headshots / total) * 100) : 0;
    return {
      headshots: dummy.headshots,
      bodyshots: dummy.bodyshots,
      damage: Math.round(dummy.damage * 10) / 10,
      kills: dummy.kills,
      headshotRate,
    };
  }

  function computeEnemy() {
    const total = enemy.headshots + enemy.bodyshots;
    const headshotRate = total > 0 ? Math.round((enemy.headshots / total) * 100) : 0;
    return {
      kills: enemy.kills,
      headshots: enemy.headshots,
      bodyshots: enemy.bodyshots,
      damage: Math.round(enemy.damage * 10) / 10,
      headshotRate,
    };
  }

  function computeMoving() {
    const total = moving.headshots + moving.bodyshots;
    const headshotRate = total > 0 ? Math.round((moving.headshots / total) * 100) : 0;
    return {
      headshots: moving.headshots,
      bodyshots: moving.bodyshots,
      damage: Math.round(moving.damage * 10) / 10,
      kills: moving.kills,
      headshotRate,
    };
  }

  function snapshot() {
    return {
      magazine: computeLayer(magazine, false),
      session: computeLayer(session, true),
      dummy: computeDummy(),
      enemy: computeEnemy(),
      moving: computeMoving(),
    };
  }

  return { recordShot, recordHit, recordDummyHit, recordDummyKill, recordEnemyHit, recordEnemyKill, recordMovingHit, recordMovingKill, commitMagazine, resetSession, tick, snapshot };
}

// 左上数据看板：标题 + 弹匣层 5 行 + 会话层 4 行 + 死靶层 4 行（死靶数/爆头/身体/爆头率）
function createStatsPanel(scene) {
  const texture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("weapon-lab-ui", true, scene);
  texture.idealWidth = 1280;
  texture.idealHeight = 720;

  const panel = new GUI.Rectangle("weapon-lab-panel");
  panel.width = "320px";
  panel.height = "460px";
  panel.cornerRadius = 0;
  panel.thickness = 4;
  panel.color = "#151515";
  panel.background = "rgba(20, 20, 20, 0.82)";
  panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  panel.left = 18;
  panel.top = 18;
  texture.addControl(panel);

  const title = textBlock("武器试验场", 22, "#ffffa0", FONT_TITLE);
  title.height = "34px";
  title.top = 8;
  panel.addControl(title);

  const magTitle = textBlock("弹匣", 16, "#d5d5d5", FONT_UI);
  magTitle.height = "24px";
  magTitle.top = 46;
  panel.addControl(magTitle);

  const magLines = [];
  const magLabels = ["射击", "命中", "命中率", "DPS", "射速"];
  magLabels.forEach((_, i) => {
    const line = textBlock("", 15, "#ffffff", FONT_UI);
    line.height = "22px";
    line.top = 72 + i * 22;
    panel.addControl(line);
    magLines.push(line);
  });

  const sessTitle = textBlock("会话", 16, "#d5d5d5", FONT_UI);
  sessTitle.height = "24px";
  sessTitle.top = 190;
  panel.addControl(sessTitle);

  const sessLines = [];
  const sessLabels = ["累计射击", "累计命中", "累计伤害", "会话DPS"];
  sessLabels.forEach((_, i) => {
    const line = textBlock("", 15, "#ffffff", FONT_UI);
    line.height = "22px";
    line.top = 216 + i * 22;
    panel.addControl(line);
    sessLines.push(line);
  });

  // 死靶区块：阶段 3 新增，显示当前死靶数、爆头/身体命中数、爆头率
  const dummyTitle = textBlock("死靶", 16, "#d5d5d5", FONT_UI);
  dummyTitle.height = "24px";
  dummyTitle.top = 312;
  panel.addControl(dummyTitle);

  const dummyLines = [];
  const dummyLabels = ["死靶数", "爆头", "身体", "爆头率"];
  dummyLabels.forEach((_, i) => {
    const line = textBlock("", 15, "#ffffff", FONT_UI);
    line.height = "22px";
    line.top = 338 + i * 22;
    panel.addControl(line);
    dummyLines.push(line);
  });

  return { texture, panel, magLines, sessLines, dummyLines, dummyTitle };
}

function textBlock(value, size, color, fontFamily) {
  const block = new GUI.TextBlock();
  block.text = value;
  block.color = color;
  block.fontSize = size;
  block.fontFamily = fontFamily;
  block.textWrapping = true;
  block.resizeToFit = false;
  block.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  block.left = 12;
  return block;
}

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

// dummiesCount/mode/enemyState 由 lab.update 传入（stats 不持有 lab 引用）
// mode="enemy" 时共用区块显示敌人信息（时间/生命/击杀/爆头率），否则显示死靶信息
function updateStatsPanel(panel, stats, dummiesCount, mode, enemyState) {
  const magLabels = ["射击", "命中", "命中率", "DPS", "射速"];
  const magValues = [stats.magazine.shots, stats.magazine.hits, `${stats.magazine.hitRate}%`, stats.magazine.dps, stats.magazine.fireRate];
  panel.magLines.forEach((line, i) => {
    line.text = `${magLabels[i]}：${magValues[i]}`;
  });
  const sessLabels = ["累计射击", "累计命中", "累计伤害", "会话DPS"];
  const sessValues = [stats.session.shots, stats.session.hits, stats.session.damage, stats.session.dps];
  panel.sessLines.forEach((line, i) => {
    line.text = `${sessLabels[i]}：${sessValues[i]}`;
  });
  // 共用区块：enemy 模式显示敌人信息，moving 模式显示动靶信息，其他模式显示死靶信息
  if (mode === "enemy") {
    panel.dummyTitle.text = "敌人";
    const timeText = enemyState?.result === "victory" ? "存活！"
      : enemyState?.result === "defeat" ? "阵亡！"
      : `${Math.ceil(enemyState?.timeLeft ?? 0)}s`;
    const enemyLabels = ["时间", "生命", "击杀", "爆头率"];
    const enemyValues = [timeText, `${enemyState?.hp ?? 0}/${WEAPON_LAB_CONFIG.enemyMode.playerHP}`, stats.enemy.kills, `${stats.enemy.headshotRate}%`];
    panel.dummyLines.forEach((line, i) => {
      line.text = `${enemyLabels[i]}：${enemyValues[i]}`;
    });
  } else if (mode === "moving") {
    panel.dummyTitle.text = "动靶";
    const movingLabels = ["动靶数", "爆头", "身体", "爆头率"];
    const movingValues = [dummiesCount ?? 0, stats.moving.headshots, stats.moving.bodyshots, `${stats.moving.headshotRate}%`];
    panel.dummyLines.forEach((line, i) => {
      line.text = `${movingLabels[i]}：${movingValues[i]}`;
    });
  } else {
    panel.dummyTitle.text = "死靶";
    const dummyLabels = ["死靶数", "爆头", "身体", "爆头率"];
    const dummyValues = [dummiesCount ?? 0, stats.dummy.headshots, stats.dummy.bodyshots, `${stats.dummy.headshotRate}%`];
    panel.dummyLines.forEach((line, i) => {
      line.text = `${dummyLabels[i]}：${dummyValues[i]}`;
    });
  }
}
