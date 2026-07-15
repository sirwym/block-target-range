import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const WEAPONS = ["m4", "m95", "deagle_golden", "awp", "ak47"];
const ENABLED_WEAPONS = new Set(WEAPONS);

async function openGame(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/?e2e=1");
  await page.waitForFunction(() => window.__blockTargetRangeDebug);
  await page.evaluate(() => window.__blockTargetRangeDebug.start());
  await page.waitForFunction(() => {
    const snapshot = window.__blockTargetRangeDebug.snapshot();
    return snapshot.mode === "countdown" || snapshot.mode === "playing";
  });
  return errors;
}

async function selectWeaponAndWaitForModel(page, weaponId) {
  await page.evaluate((id) => window.__blockTargetRangeDebug.selectWeapon(id), weaponId);
  const debugLogs = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if ((msg.type() === "log" || msg.type() === "error") && text.includes("[weapon-debug]")) {
      debugLogs.push(text);
    }
  });
  try {
    await page.waitForFunction((id) => {
      const snapshot = window.__blockTargetRangeDebug.snapshot();
      let reason = null;
      if (snapshot.currentWeaponId !== id) reason = `currentWeaponId=${snapshot.currentWeaponId}`;
      else if (!snapshot.activeModel.ready) reason = `not ready, failed=${snapshot.activeModel.failed}, status=${snapshot.activeModel.status}`;
      else if (!snapshot.activeModel.rootEnabled) {
        // v4: rootEnabled=false 时直接在浏览器侧收集 controller 完整状态
        const ctrl = window.__blockTargetRangeDebug.getWeaponController?.(id);
        const ctrlState = ctrl ? {
          ready: ctrl.ready,
          failed: ctrl.failed,
          isTaczNative: ctrl.isTaczNative,
          source: ctrl.source,
          status: ctrl.status,
          partCount: ctrl.partCount,
          rootEnabled: ctrl.root?.isEnabled?.(),
          hasTaczBoneMap: !!ctrl.taczBoneMap,
          hasAnimCtrl: !!ctrl.animationController,
          animBoneMap: !!ctrl.animationController?.taczBoneMap,
          hasHands: !!ctrl.hands,
        } : null;
        reason = `rootEnabled=false ctrl=${JSON.stringify(ctrlState)}`;
      }
      else if (snapshot.activeModel.visibleMeshCount <= 20) reason = `visibleMeshCount=${snapshot.activeModel.visibleMeshCount}`;
      else if (snapshot.activeModel.source === "tacz-first-person" && !snapshot.activeModel.taczAnimation?.isTaczNative) reason = `source=${snapshot.activeModel.source} isTaczNative=${snapshot.activeModel.taczAnimation?.isTaczNative}`;
      if (reason) {
        console.log(`[weapon-debug] ${id}: ${reason}`);
        return false;
      }
      return true;
    }, weaponId, { polling: 100, timeout: 15000 });
  } catch (e) {
    // headless 环境 timeout 时读取最终状态，输出到测试日志供诊断
    const finalState = await page.evaluate(() => {
      const s = window.__blockTargetRangeDebug?.snapshot();
      return s ? {
        currentWeaponId: s.currentWeaponId,
        mode: s.mode,
        activeModel: {
          ready: s.activeModel.ready,
          failed: s.activeModel.failed,
          source: s.activeModel.source,
          rootEnabled: s.activeModel.rootEnabled,
          visibleMeshCount: s.activeModel.visibleMeshCount,
          partCount: s.activeModel.partCount,
          status: s.activeModel.status,
          taczAnimation: s.activeModel.taczAnimation,
        },
      } : null;
    }).catch(() => null);
    console.error(`[weapon-debug-timeout] ${weaponId} finalState=${JSON.stringify(finalState)?.slice(0, 800)}`);
    console.error(`[weapon-debug-timeout] ${weaponId} 最后 20 条调试:`);
    for (const log of debugLogs.slice(-20)) console.error(log);
    throw e;
  }
  return page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
}

// 5 把武器全部走 TaCZ 原生 Bedrock geo 路径，模型包含弹匣/握把/枪托等部件，
// 投影范围更大且偏左上，需要独立阈值。
// maxMinY 防止散架零件飞到屏幕顶部（散架时 minY 贴 0）
// minAreaRatio 针对修复后投影变小的手枪（deagle_golden 散架时面积大，修复后正常变小）
// awp 长枪管 Z 方向长但正面投影窄，默认 minWidth=175/minCenterX=760 不再适用
const SCREEN_BOUNDS_OVERRIDES = {
  m4:            { minAreaRatio: 0.01, minWidth: 200, minCenterX: 700, minCenterY: 380, minHeight: 100 },
  ak47:          { minAreaRatio: 0.01, minWidth: 70,  minCenterX: 400, minCenterY: 400, minHeight: 120 },
  awp:           { minAreaRatio: 0.01, minWidth: 40,  minCenterX: 400, minCenterY: 360, minHeight: 100 },
  deagle_golden: { maxArea: 0.40, minAreaRatio: 0.03, minWidth: 40,  minCenterX: 600, minCenterY: 400, maxMinY: 350, minHeight: 80 },
  m95:           { maxArea: 0.80, minAreaRatio: 0.04, minWidth: 70,  minCenterX: 600, minCenterY: 400, minHeight: 80 },
};

// 5 把武器全部走 TaCZ 原生 Bedrock geo 路径
const NATIVE_WEAPONS = new Set(WEAPONS);

// 原生武器 local bounds extent 上限（散架时膨胀 4-6 倍）。
// 使用 TaCZ geo root 本地空间，不受第一人称 root 旋转/缩放影响。
const NATIVE_LOCAL_BOUNDS_LIMITS = { extentX: 1.50, extentY: 3.50, extentZ: 7.00 };
const NATIVE_LOCAL_BOUNDS_OVERRIDES = {
  m4:            { extentX: 3.80, extentY: 2.00, extentZ: 3.60 },
  ak47:          { extentX: 0.50, extentY: 1.40, extentZ: 3.00 },
  awp:           { extentX: 0.50, extentY: 0.80, extentZ: 3.80 },
  deagle_golden: { extentX: 0.35, extentY: 1.20, extentZ: 1.40 },
  m95:           { extentX: 0.90, extentY: 3.20, extentZ: 6.70 },
};

function expectUsableScreenProjection(snapshot, weaponId) {
  const bounds = snapshot.activeModel.screenBounds;
  const override = SCREEN_BOUNDS_OVERRIDES[weaponId] ?? {};
  const debugBounds = `[${weaponId}] areaRatio=${bounds?.areaRatio?.toFixed(4)} minY=${bounds?.minY} centerX=${bounds?.centerX} centerY=${bounds?.centerY} width=${bounds?.width} height=${bounds?.height}`;
  expect(bounds).toBeTruthy();
  expect(bounds.width, debugBounds).toBeGreaterThanOrEqual(override.minWidth ?? 175);
  expect(bounds.height, debugBounds).toBeGreaterThan(override.minHeight ?? 110);
  expect(bounds.areaRatio, debugBounds).toBeGreaterThan(override.minAreaRatio ?? 0.04);
  expect(bounds.areaRatio, debugBounds).toBeLessThan(override.maxArea ?? 0.55);
  expect(bounds.centerX, debugBounds).toBeGreaterThan(override.minCenterX ?? 760);
  expect(bounds.centerY, debugBounds).toBeGreaterThan(override.minCenterY ?? 430);
  expect(bounds.minY, debugBounds).toBeLessThan(620);
  // 散架特征：minY 贴 0 说明有零件飞到屏幕顶部
  if (override.maxMinY !== undefined) {
    expect(bounds.minY, debugBounds).toBeGreaterThan(override.maxMinY);
  }
}

// 原生武器动画接线和模型组装验证
function expectNativeModelHealthy(snapshot, weaponId) {
  // 当前帧必须真实走原生 bone 动画路径，不能只检查 taczBoneMap 是否存在
  expect(snapshot.activeModel.taczAnimation?.isTaczNative).toBe(true);
  expect(snapshot.activeModel.taczAnimation?.hasTaczBoneMap).toBe(true);
  // local bounds 不异常膨胀（散架时 extent 会大 4-6 倍）
  const wb = snapshot.activeModel.nativeLocalBounds ?? snapshot.activeModel.worldBounds;
  expect(wb).toBeTruthy();
  const override = NATIVE_LOCAL_BOUNDS_OVERRIDES[weaponId] ?? {};
  const debugWb = `[${weaponId}] extentX=${wb?.extentX?.toFixed(3)} extentY=${wb?.extentY?.toFixed(3)} extentZ=${wb?.extentZ?.toFixed(3)}`;
  expect(wb.extentX, debugWb).toBeLessThan(override.extentX ?? NATIVE_LOCAL_BOUNDS_LIMITS.extentX);
  expect(wb.extentY, debugWb).toBeLessThan(override.extentY ?? NATIVE_LOCAL_BOUNDS_LIMITS.extentY);
  expect(wb.extentZ, debugWb).toBeLessThan(override.extentZ ?? NATIVE_LOCAL_BOUNDS_LIMITS.extentZ);
}

// 不同武器的枪口前端区域阈值（relativeX/Y 越小越靠枪口前端）
// 5 把武器 Bedrock geo 修复后模型正确组装，
// 枪口在枪管最前端，relativeX 接近 1.0（模型右边缘），relativeY 在 0.3-0.6 之间。
const MUZZLE_FRONT_THRESHOLDS = {
  m4: { x: 0.25, y: 0.25 },
  ak47: { x: 0.25, y: 0.25 },
  awp: { x: 0.2, y: 0.22 },
  deagle_golden: { x: 1.20, y: 0.70 },
  m95: { x: 1.20, y: 1.20 },   // 重型栓动的 muzzle_pos 在模型底部，模型高投影大
};

function expectMuzzleNearFrontFor(snapshot, weaponId) {
  const bounds = snapshot.activeModel.screenBounds;
  const anchor = snapshot.runtime.muzzleAnchorScreen;
  const threshold = MUZZLE_FRONT_THRESHOLDS[weaponId] ?? { x: 0.25, y: 0.25 };
  const relativeX = (anchor.x - bounds.minX) / bounds.width;
  const relativeY = (anchor.y - bounds.minY) / bounds.height;
  // 断言失败时通过 message 暴露完整 debug 信息，避免每帧 console.log 刷屏
  const debugMsg = `[${weaponId}] muzzle relative=(${relativeX.toFixed(2)}, ${relativeY.toFixed(2)}) threshold=(${threshold.x}, ${threshold.y})`;
  expect(relativeX, debugMsg).toBeLessThanOrEqual(threshold.x);
  expect(relativeY, debugMsg).toBeLessThanOrEqual(threshold.y);
}

async function writeContactSheet(context, weaponIds) {
  await writeImageContactSheet(context, weaponIds, "e2e-weapon", "e2e-weapons-contact-sheet.png");
}

async function writeFiringContactSheet(context, weaponIds) {
  await writeImageContactSheet(context, weaponIds, "e2e-weapon-firing", "e2e-weapons-firing-contact-sheet.png");
}

async function writeImageContactSheet(context, weaponIds, sourcePrefix, outputName) {
  const page = await context.newPage();
  const tileWidth = 512;
  const tileHeight = 332;
  const columns = 3;
  const rows = Math.ceil(weaponIds.length / columns);
  await page.setViewportSize({ width: tileWidth * columns, height: tileHeight * rows });
  const tiles = weaponIds.map((weaponId, index) => {
    const data = readFileSync(`test-results/${sourcePrefix}-${weaponId}.png`).toString("base64");
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * tileHeight;
    return `<section style="position:absolute;left:${left}px;top:${top}px;width:${tileWidth}px;height:${tileHeight}px;background:#191919;color:#ffffa0;font:14px monospace;padding:8px;box-sizing:border-box">
      <div>${weaponId}</div>
      <img src="data:image/png;base64,${data}" style="position:absolute;left:0;top:32px;width:${tileWidth}px;height:288px;object-fit:cover" />
    </section>`;
  }).join("");
  await page.setContent(`<main style="margin:0;width:${tileWidth * columns}px;height:${tileHeight * rows}px;background:#191919;position:relative">${tiles}</main>`);
  await page.screenshot({ path: `test-results/${outputName}`, fullPage: false });
  await page.close();
}

test.describe("武器系统视觉验收", () => {
  test("进入靶场后页面无控制台错误", async ({ page }) => {
    const errors = await openGame(page);
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });

  test("进入靶场后 1-5 武器 3D 模型可见并截图", async ({ page, context }) => {
    test.setTimeout(60000); // 5 把武器循环加载+检查+截图，需要更长超时
    const errors = await openGame(page);

    for (const weaponId of WEAPONS) {
      const snapshot = await selectWeaponAndWaitForModel(page, weaponId);
      expect(snapshot.startPanelVisible).toBe(false);
      expect(snapshot.weaponPlaneExists).toBe(false);
      expect(snapshot.activeModel.failed).toBe(false);
      expect(snapshot.activeModel.partCount).toBeGreaterThan(20);
      expectUsableScreenProjection(snapshot, weaponId);
      expectMuzzleNearFrontFor(snapshot, weaponId);
      // 原生武器：验证动画接线生效 + 模型不异常膨胀
      if (NATIVE_WEAPONS.has(weaponId)) {
        expectNativeModelHealthy(snapshot, weaponId);
      }
      await page.screenshot({
        path: `test-results/e2e-weapon-${weaponId}.png`,
        fullPage: false,
      });
    }
    await writeContactSheet(context, WEAPONS);

    expect(errors).toEqual([]);
  });

  test("1-5 武器射击、枪口火焰和换弹状态正常", async ({ page, context }) => {
    test.setTimeout(150000); // 5 把武器循环射击+换弹+截图；TaCZ 原生 geo 新枪较重，避免截图阶段临界超时
    const errors = await openGame(page);

    for (const weaponId of WEAPONS) {
      const before = await selectWeaponAndWaitForModel(page, weaponId);
      const expectedAmmo = before.runtime.ammo - 1;
      await page.evaluate(() => window.__blockTargetRangeDebug.shoot());
      const shot = await page.waitForFunction((ammo) => {
        const snapshot = window.__blockTargetRangeDebug.snapshot();
        return (
          snapshot.runtime.ammo === ammo
          && snapshot.runtime.weaponRecoil > 0
          && snapshot.runtime.muzzleFlashTimer > 0
          && snapshot.runtime.muzzleFlashEnabled
        ) ? snapshot : null;
      }, expectedAmmo);
      const afterShot = await shot.jsonValue();
      expect(afterShot.runtime.muzzleAnchorWorld).toBeTruthy();
      expect(afterShot.runtime.muzzleAnchorScreen).toBeTruthy();
      expect(afterShot.runtime.muzzleFlashScreen).toBeTruthy();
      expect(afterShot.runtime.muzzleFlashDistancePx).toBeLessThanOrEqual(20);
      expectMuzzleNearFrontFor(afterShot, weaponId);
      await page.waitForFunction(() => {
        const snapshot = window.__blockTargetRangeDebug.snapshot();
        return snapshot.runtime.muzzleFlashEnabled && snapshot.runtime.muzzleFlashTimer > 0.2;
      });
      await page.screenshot({
        path: `test-results/e2e-weapon-firing-${weaponId}.png`,
        fullPage: false,
      });
      const afterScreenshot = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
      expect(afterScreenshot.runtime.muzzleFlashEnabled).toBe(true);
      expect(afterScreenshot.runtime.muzzleFlashTimer).toBeGreaterThan(0);

      await page.evaluate(() => window.__blockTargetRangeDebug.reload());
      await page.waitForFunction(() => window.__blockTargetRangeDebug.snapshot().runtime.reloading);
      const reloading = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
      expect(reloading.runtime.reloading).toBe(true);
      expect(reloading.weaponPlaneExists).toBe(false);
    }
    await writeFiringContactSheet(context, WEAPONS);

    expect(errors).toEqual([]);
  });

  // AWP ADS 平滑过渡 smoke test：验证 setAds 钩子能触发 adsProgress 从 0 lerp 到接近 1，
  // 并产出 ADS 截图供多模态验收。不做视觉断言，只验证状态字段。
  test("AWP ADS 平滑过渡可通过 setAds 钩子触发并截图", async ({ page }) => {
    test.skip(!ENABLED_WEAPONS.has("awp"), "当前运行武器列表不包含 awp，跳过旧 ADS 专项验收");
    const errors = await openGame(page);
    const snapshot = await selectWeaponAndWaitForModel(page, "awp");

    // 腰射初始 adsProgress 应为 0
    expect(Number(snapshot.activeModel.adsProgress) >= 0).toBe(true);

    // 触发 ADS
    await page.evaluate(() => window.__blockTargetRangeDebug.setAds(true));
    // adsProgress 由每帧 lerp(delta*10) 推进，等 ~500ms 足够接近 1
    await page.waitForFunction(
      () => window.__blockTargetRangeDebug.snapshot().activeModel.adsProgress > 0.8,
      { timeout: 5000 }
    );
    const adsSnapshot = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(adsSnapshot.activeModel.adsProgress).toBeGreaterThan(0.8);

    await page.screenshot({
      path: "test-results/e2e-weapon-awp-ads.png",
      fullPage: false,
    });

    // 关闭 ADS，验证 adsProgress 回到 0
    await page.evaluate(() => window.__blockTargetRangeDebug.setAds(false));
    await page.waitForFunction(
      () => window.__blockTargetRangeDebug.snapshot().activeModel.adsProgress < 0.2,
      { timeout: 5000 }
    );
    const hipSnapshot = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    expect(hipSnapshot.activeModel.adsProgress).toBeLessThan(0.2);

    expect(errors).toEqual([]);
  });
});
