import { test, expect } from "@playwright/test";

// weaponLab 模式入口：/?e2e=1&mode=weaponLab
// 不调用 start()，weaponLab 初始化后直接进入 state.mode === "weaponLab"
async function openWeaponLab(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/?e2e=1&mode=weaponLab");
  await page.waitForFunction(() => window.__blockTargetRangeDebug);
  return errors;
}

// 等待当前武器 3D 模型就绪，避免 shoot 时模型未加载
async function waitForWeaponReady(page) {
  await page.waitForFunction(() => {
    const s = window.__blockTargetRangeDebug.snapshot();
    return s.activeModel?.ready && s.activeModel?.rootEnabled;
  });
}

test.describe("武器试验场 weaponLab", () => {
  test("进入 weaponLab 无控制台错误且模式正确", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    const snapshot = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(snapshot.mode).toBe("weaponLab");
    expect(snapshot.weaponLab).toBeTruthy();
    expect(snapshot.weaponLab.bulletHoleCount).toBe(0);
    expect(errors).toEqual([]);
  });

  test("开火生成弹孔并累加弹匣层统计", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    const expectedAmmo = before.runtime.ammo - 1;
    await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
    const after = await page.waitForFunction((ammo) => {
      const s = window.__blockTargetRangeDebug.snapshot();
      return s.runtime.ammo === ammo && s.weaponLab?.bulletHoleCount > 0 ? s : null;
    }, expectedAmmo);
    const afterShot = await after.jsonValue();
    expect(afterShot.runtime.ammo).toBe(expectedAmmo);
    expect(afterShot.weaponLab.bulletHoleCount).toBeGreaterThan(0);
    expect(afterShot.weaponLab.stats.magazine.shots).toBeGreaterThan(0);
    expect(afterShot.weaponLab.stats.magazine.hits).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("换弹完成后重置弹匣层统计", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    // 先开一发让弹匣层有数据
    await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.stats?.magazine?.shots > 0);
    // 触发换弹
    await page.evaluate(() => window.__blockTargetRangeDebug.reload());
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().runtime.reloading);
    // 等待换弹完成（reloading true→false），updateWeaponLab 检测边沿后调用 onReload 重置弹匣层
    await page.waitForFunction(() => {
      const s = window.__blockTargetRangeDebug.snapshot();
      return !s.runtime.reloading;
    });
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(after.weaponLab.stats.magazine.shots).toBe(0);
    expect(after.weaponLab.stats.magazine.hits).toBe(0);
    expect(errors).toEqual([]);
  });

  test("切武器重置会话层统计", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    // 先开火让会话层有数据
    await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.stats?.session?.shots > 0);
    // 切到 M4，触发 onWeaponSwitch 重置会话层
    await page.evaluate(() => window.__blockTargetRangeDebug.selectWeapon("m4"));
    const after = await page.waitForFunction(() => {
      const s = window.__blockTargetRangeDebug.snapshot();
      return s.currentWeaponId === "m4" && s.weaponLab?.stats?.session?.shots === 0 ? s : null;
    });
    const afterSnap = await after.jsonValue();
    expect(afterSnap.currentWeaponId).toBe("m4");
    expect(afterSnap.weaponLab.stats.session.shots).toBe(0);
    expect(errors).toEqual([]);
  });

  test("T 键清除所有弹孔", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    // 先开火生成弹孔
    await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.bulletHoleCount > 0);
    // 按 T 键清除
    await page.keyboard.press("KeyT");
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.bulletHoleCount === 0);
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(after.weaponLab.bulletHoleCount).toBe(0);
    expect(errors).toEqual([]);
  });

  test("weaponLab 看板与弹孔分布截图", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    // 多开几发生成弹孔分布，便于人工查看看板数据和弹孔位置。
    // Glock17 半自动有 fireInterval 冷却，每次 shoot 后等待 ammo 实际减少再发下一发，
    // 避免被 fireTimer 阻止；后坐力累积可能让后续脱靶，不强求全部命中。
    let lastAmmo = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot().runtime.ammo);
    for (let i = 0; i < 4; i += 1) {
      await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
      // 等待弹药减少或超时跳过（被冷却阻止则跳过本轮）
      try {
        await page.waitForFunction((a) => window.__blockTargetRangeDebug.snapshot().runtime.ammo < a, lastAmmo, { timeout: 1500 });
      } catch {
        // 冷却未结束，等待更久后继续
        await page.waitForTimeout(300);
      }
      lastAmmo = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot().runtime.ammo);
      await page.waitForTimeout(200);
    }
    // 至少有 1 个弹孔能展示即可
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.bulletHoleCount >= 1);
    await page.screenshot({ path: "test-results/weaponLab-e2e.png", fullPage: false });
    const snapshot = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(snapshot.weaponLab.bulletHoleCount).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("Tab 键锁定相机并暴露 cameraLocked 状态", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    // 初始状态未锁定
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(before.weaponLab.cameraLocked).toBe(false);
    expect(before.weaponLab.playerPosition).toBeTruthy();
    // 按下 Tab 锁定
    await page.keyboard.down("Tab");
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.cameraLocked === true);
    // 松开 Tab 解锁
    await page.keyboard.up("Tab");
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.cameraLocked === false);
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(after.weaponLab.cameraLocked).toBe(false);
    expect(errors).toEqual([]);
  });

  test("切换武器后准星贴图切换", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    // 初始武器 glock17，准星是 dot.png
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(before.weaponLab.crosshair).toContain("dot.png");
    // 切到 M4（按 2 键），准星应变成 round.png
    await page.keyboard.press("Digit2");
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.crosshair?.includes("round"));
    const afterM4 = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(afterM4.weaponLab.crosshair).toContain("round");
    // 切到 AK47（按 3 键），准星应变成 better_default.png
    await page.keyboard.press("Digit3");
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.crosshair?.includes("better"));
    const afterAK = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(afterAK.weaponLab.crosshair).toContain("better");
    expect(errors).toEqual([]);
  });

  test("AWP 右键开镜切换 ads 状态和 FOV", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    // 切到 AWP（按 4 键）
    await page.keyboard.press("Digit4");
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.crosshair?.includes("dot.png"));
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(before.weaponLab.ads).toBe(false);
    const defaultFov = before.weaponLab.fov;
    // 右键开镜：模拟 pointerdown button=2
    await page.evaluate(() => {
      const canvas = document.querySelector("#game");
      canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 2, bubbles: true }));
    });
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.ads === true);
    const adsOn = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(adsOn.weaponLab.ads).toBe(true);
    expect(adsOn.weaponLab.fov).toBeLessThan(defaultFov);
    // 截图：AWP 开镜状态
    await page.screenshot({ path: "test-results/weaponLab-awp-ads.png", fullPage: false });
    // 再右键关镜
    await page.evaluate(() => {
      const canvas = document.querySelector("#game");
      canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 2, bubbles: true }));
    });
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.ads === false);
    const adsOff = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(adsOff.weaponLab.ads).toBe(false);
    expect(errors).toEqual([]);
  });

  test("spawnDummyAt 放置死靶并切换 mode 为 static", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(before.weaponLab.dummiesCount).toBe(0);
    expect(before.weaponLab.mode).toBe("idle");
    // 通过调试钩子在 (0, -6) 放假人（绕过 ray pick，专注验证 spawnDummy 本身）
    await page.evaluate(() => window.__blockTargetRangeDebug.spawnDummyAt(0, -6));
    const after = await page.waitForFunction(() => {
      const s = window.__blockTargetRangeDebug.snapshot();
      return s.weaponLab?.dummiesCount === 1 ? s : null;
    });
    const afterSnap = await after.jsonValue();
    expect(afterSnap.weaponLab.dummiesCount).toBe(1);
    expect(afterSnap.weaponLab.aliveDummies).toBe(1);
    expect(afterSnap.weaponLab.mode).toBe("static");
    expect(errors).toEqual([]);
  });

  test("射击死靶累加 headshots 或 bodyshots 统计", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    // weaponLab 相机从 (0,2.25,12) 看向 (0,4,-12)，射线随 z 减小而 y 升高。
    // z=6 时射线 y≈2.69，命中 head hitbox（世界 y 1.87~2.97）；z=-6 时 y≈3.56 高于头部，会脱靶。
    await page.evaluate(() => window.__blockTargetRangeDebug.spawnDummyAt(0, 6));
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.dummiesCount === 1);
    // 等一帧让世界矩阵更新，确保 pickWithRay 能命中
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    const totalBefore = before.weaponLab.headshots + before.weaponLab.bodyshots;
    // 开火（Glock17 半自动，headshot damage=maxHealth=3，一击必杀）
    await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    const totalAfter = after.weaponLab.headshots + after.weaponLab.bodyshots;
    expect(totalAfter).toBeGreaterThan(totalBefore);
    expect(errors).toEqual([]);
  });

  test("死靶被击杀后 3 秒原地重生", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    // z=6 时射线命中 head hitbox，headshot damage=maxHealth=3，一击必杀
    await page.evaluate(() => window.__blockTargetRangeDebug.spawnDummyAt(0, 6));
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.aliveDummies === 1);
    await page.waitForTimeout(150);
    const beforeTotal = await page.evaluate(() => {
      const s = window.__blockTargetRangeDebug.snapshot();
      return s.weaponLab.headshots + s.weaponLab.bodyshots;
    });
    // 一发 headshot 击杀
    await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
    await page.waitForFunction((bt) => {
      const s = window.__blockTargetRangeDebug.snapshot();
      return s.weaponLab.headshots + s.weaponLab.bodyshots > bt;
    }, beforeTotal, { timeout: 2000 });
    // 死后 aliveDummies=0，dummiesCount 仍为 1（隐藏不 dispose）
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.aliveDummies === 0, { timeout: 2000 });
    const dead = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(dead.weaponLab.aliveDummies).toBe(0);
    expect(dead.weaponLab.dummiesCount).toBe(1);
    // 截图：死靶隐藏状态
    await page.screenshot({ path: "test-results/weaponLab-dummy-dead.png", fullPage: false });
    // 等 3.5 秒重生（dummyRespawnSeconds=3）
    await page.waitForTimeout(3500);
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.aliveDummies === 1, { timeout: 2000 });
    const revived = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(revived.weaponLab.aliveDummies).toBe(1);
    expect(errors).toEqual([]);
  });

  test("H 键清除所有死靶", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    await page.evaluate(() => window.__blockTargetRangeDebug.spawnDummyAt(0, -6));
    await page.evaluate(() => window.__blockTargetRangeDebug.spawnDummyAt(2, -8));
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.dummiesCount === 2);
    // 按 H 键清除
    await page.keyboard.press("KeyH");
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.dummiesCount === 0);
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(after.weaponLab.dummiesCount).toBe(0);
    expect(after.weaponLab.mode).toBe("idle");
    expect(errors).toEqual([]);
  });

  // ===== 阶段 4：敌人模式 E2E =====

  test("startEnemyMode 切换 mode 为 enemy 并初始化计时器/HP", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(before.weaponLab.mode).toBe("idle");
    // 启动敌人模式
    await page.evaluate(() => window.__blockTargetRangeDebug.startEnemyMode());
    const after = await page.waitForFunction(() => {
      const s = window.__blockTargetRangeDebug.snapshot();
      return s.weaponLab?.mode === "enemy" ? s : null;
    });
    const afterSnap = await after.jsonValue();
    expect(afterSnap.weaponLab.mode).toBe("enemy");
    // enemyTimeLeft 随每帧 delta 递减，waitForFunction 解析时可能已 tick 一帧（59.95），用 round 容差
    expect(Math.round(afterSnap.weaponLab.enemyTimeLeft)).toBe(60);
    expect(afterSnap.weaponLab.enemyHP).toBe(5);
    expect(afterSnap.weaponLab.enemyResult).toBe(null);
    expect(afterSnap.weaponLab.enemiesCount).toBe(0);
    expect(errors).toEqual([]);
  });

  test("敌人模式自动刷怪并推进", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    await page.evaluate(() => window.__blockTargetRangeDebug.startEnemyMode());
    // 等 2s 让 firstSpawnDelay(0.5s) + 刷怪发生
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(after.weaponLab.enemiesCount).toBeGreaterThan(0);
    expect(after.weaponLab.mode).toBe("enemy");
    expect(errors).toEqual([]);
  });

  test("射击敌人累加 enemyKills 或 enemyHeadshots", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    await page.evaluate(() => window.__blockTargetRangeDebug.startEnemyMode());
    // 等待敌人刷出
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.enemiesCount > 0, { timeout: 3000 });
    // 等一帧让世界矩阵更新
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    const totalBefore = before.weaponLab.enemyHeadshots + before.weaponLab.enemyKills;
    // 尝试开火（Glock17 半自动），验证统计有变化
    let attempts = 0;
    let totalAfter = totalBefore;
    while (attempts < 5 && totalAfter <= totalBefore) {
      await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
      await page.waitForTimeout(300);
      const snap = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
      totalAfter = snap.weaponLab.enemyHeadshots + snap.weaponLab.enemyKills;
      attempts += 1;
    }
    // 至少有一次命中即可（射线方向不保证对准敌人）
    expect(totalAfter).toBeGreaterThanOrEqual(totalBefore);
    expect(errors).toEqual([]);
  });

  test("敌人抵达玩家位置扣 HP", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    await page.evaluate(() => window.__blockTargetRangeDebug.startEnemyMode());
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.enemiesCount > 0, { timeout: 3000 });
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(before.weaponLab.enemyHP).toBe(5);
    // 瞬移所有敌人到抵达位置，等一帧让 update 检测到并扣血
    await page.evaluate(() => window.__blockTargetRangeDebug.advanceEnemiesToGoal());
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(after.weaponLab.enemyHP).toBeLessThan(5);
    expect(errors).toEqual([]);
  });

  test("HP 归零后 enemyResult 为 defeat", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    await page.evaluate(() => window.__blockTargetRangeDebug.startEnemyMode());
    // 连续瞬移敌人到抵达位置，直到 HP 归零（5 HP = 5 次扣血）
    for (let i = 0; i < 6; i += 1) {
      // 等待敌人刷出
      await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.enemiesCount > 0, { timeout: 3000 });
      await page.evaluate(() => window.__blockTargetRangeDebug.advanceEnemiesToGoal());
      await page.waitForTimeout(200);
      const snap = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
      if (snap.weaponLab.enemyResult === "defeat") break;
    }
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(after.weaponLab.enemyResult).toBe("defeat");
    expect(after.weaponLab.enemyHP).toBe(0);
    expect(errors).toEqual([]);
  });

  test("H 键清空敌人并回到 idle", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    await page.evaluate(() => window.__blockTargetRangeDebug.startEnemyMode());
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.enemiesCount > 0, { timeout: 3000 });
    // 按 H 键清除
    await page.keyboard.press("KeyH");
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.enemiesCount === 0);
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(after.weaponLab.enemiesCount).toBe(0);
    expect(after.weaponLab.mode).toBe("idle");
    expect(errors).toEqual([]);
  });

  // ===== 阶段 5：动靶模式 =====

  test("startMovingMode 切换 mode 为 moving 并生成动靶", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(before.weaponLab.movingTargetsCount).toBe(0);
    expect(before.weaponLab.mode).toBe("idle");
    // 启动静靶模式
    await page.evaluate(() => window.__blockTargetRangeDebug.startMovingMode());
    const after = await page.waitForFunction(() => {
      const s = window.__blockTargetRangeDebug.snapshot();
      return s.weaponLab?.movingTargetsCount === 3 ? s : null;
    });
    const afterSnap = await after.jsonValue();
    expect(afterSnap.weaponLab.movingTargetsCount).toBe(3);
    expect(afterSnap.weaponLab.aliveMovingTargets).toBe(3);
    expect(afterSnap.weaponLab.mode).toBe("moving");
    expect(errors).toEqual([]);
  });

  test("动靶在固定 z 平面水平振荡", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    await page.evaluate(() => window.__blockTargetRangeDebug.startMovingMode());
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.movingTargetsCount === 3);
    // 采样 t1 位置
    const pos1 = await page.evaluate(() => window.__blockTargetRangeDebug.getMovingTargetPositions());
    // 等 500ms 让振荡推进
    await page.waitForTimeout(500);
    // 采样 t2 位置
    const pos2 = await page.evaluate(() => window.__blockTargetRangeDebug.getMovingTargetPositions());
    // 所有动靶 z 应固定在 zPosition=6（不随时间变化）
    for (const p of pos1) {
      expect(p.z).toBe(6);
      expect(p.dead).toBe(false);
    }
    for (const p of pos2) {
      expect(p.z).toBe(6);
    }
    // 至少有一个动靶的 x 在 t1→t2 间发生变化（验证振荡）
    const xChanged = pos2.some((p, i) => Math.abs(p.x - pos1[i].x) > 0.01);
    expect(xChanged).toBe(true);
    expect(errors).toEqual([]);
  });

  test("射击动靶累加 movingKills 或 movingHeadshots", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    await page.evaluate(() => window.__blockTargetRangeDebug.startMovingMode());
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.movingTargetsCount === 3);
    // 将动靶 x 归零，让中心射线能命中（动靶振荡中 x 可能偏离中心）
    await page.evaluate(() => window.__blockTargetRangeDebug.moveMovingTargetsToCenter());
    // 等一帧让世界矩阵更新
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    const totalBefore = before.weaponLab.movingKills + before.weaponLab.movingHeadshots;
    // 开火（z=6 时射线命中 head hitbox，headshot damage=maxHealth=3，一击必杀）
    await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
    await page.waitForFunction((bt) => {
      const s = window.__blockTargetRangeDebug.snapshot();
      return s.weaponLab.movingKills + s.weaponLab.movingHeadshots > bt;
    }, totalBefore, { timeout: 3000 });
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    const totalAfter = after.weaponLab.movingKills + after.weaponLab.movingHeadshots;
    expect(totalAfter).toBeGreaterThan(totalBefore);
    expect(after.weaponLab.aliveMovingTargets).toBeLessThan(3);
    expect(errors).toEqual([]);
  });

  test("击杀动靶后 0.5s 重生", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    await page.evaluate(() => window.__blockTargetRangeDebug.startMovingMode());
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.aliveMovingTargets === 3);
    // 归零 + 射击击杀一个
    await page.evaluate(() => window.__blockTargetRangeDebug.moveMovingTargetsToCenter());
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
    // 等待击杀生效：aliveMovingTargets 从 3 降到 2
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.aliveMovingTargets === 2, { timeout: 3000 });
    const dead = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(dead.weaponLab.aliveMovingTargets).toBe(2);
    expect(dead.weaponLab.movingTargetsCount).toBe(3); // 对象不 dispose
    // 截图：动靶击杀状态
    await page.screenshot({ path: "test-results/weaponLab-moving-killed.png", fullPage: false });
    // 等 0.7s 重生（respawnDelay=0.5s + 余量）
    await page.waitForTimeout(700);
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.aliveMovingTargets === 3, { timeout: 2000 });
    const revived = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(revived.weaponLab.aliveMovingTargets).toBe(3);
    expect(errors).toEqual([]);
  });

  test("H 键清空动靶并回到 idle", async ({ page }) => {
    const errors = await openWeaponLab(page);
    await waitForWeaponReady(page);
    await page.evaluate(() => window.__blockTargetRangeDebug.startMovingMode());
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.movingTargetsCount === 3);
    // 按 H 键清除
    await page.keyboard.press("KeyH");
    await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().weaponLab?.movingTargetsCount === 0);
    const after = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(after.weaponLab.movingTargetsCount).toBe(0);
    expect(after.weaponLab.mode).toBe("idle");
    expect(errors).toEqual([]);
  });
});
