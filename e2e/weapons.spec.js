import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const WEAPONS = ["glock17", "m4", "ak47", "awp", "p90"];

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
  await page.waitForFunction((id) => {
    const snapshot = window.__blockTargetRangeDebug.snapshot();
    return (
      snapshot.currentWeaponId === id
      && snapshot.activeModel.ready
      && snapshot.activeModel.rootEnabled
      && snapshot.activeModel.visibleMeshCount > 20
    );
  }, weaponId);
  return page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
}

function expectUsableScreenProjection(snapshot) {
  const bounds = snapshot.activeModel.screenBounds;
  expect(bounds).toBeTruthy();
  expect(bounds.width).toBeGreaterThan(180);
  expect(bounds.height).toBeGreaterThan(110);
  expect(bounds.areaRatio).toBeGreaterThan(0.04);
  expect(bounds.areaRatio).toBeLessThan(0.55);
  expect(bounds.centerX).toBeGreaterThan(760);
  expect(bounds.centerY).toBeGreaterThan(430);
  expect(bounds.minY).toBeLessThan(620);
}

// 不同武器的枪口前端区域阈值（relativeX/Y 越小越靠枪口前端）
// Glock17/AWP/P90 收紧，M4/AK47 保持现状避免回归
const MUZZLE_FRONT_THRESHOLDS = {
  glock17: { x: 0.24, y: 0.24 },
  m4: { x: 0.25, y: 0.25 },
  ak47: { x: 0.25, y: 0.25 },
  awp: { x: 0.2, y: 0.22 },
  p90: { x: 0.24, y: 0.24 },
};

function expectMuzzleNearFrontFor(snapshot, weaponId) {
  const bounds = snapshot.activeModel.screenBounds;
  const anchor = snapshot.runtime.muzzleAnchorScreen;
  const threshold = MUZZLE_FRONT_THRESHOLDS[weaponId] ?? { x: 0.25, y: 0.25 };
  const relativeX = (anchor.x - bounds.minX) / bounds.width;
  const relativeY = (anchor.y - bounds.minY) / bounds.height;
  expect(relativeX).toBeLessThanOrEqual(threshold.x);
  expect(relativeY).toBeLessThanOrEqual(threshold.y);
}

async function writeContactSheet(context, weaponIds) {
  await writeImageContactSheet(context, weaponIds, "e2e-weapon", "e2e-weapons-contact-sheet.png");
}

async function writeFiringContactSheet(context, weaponIds) {
  await writeImageContactSheet(context, weaponIds, "e2e-weapon-firing", "e2e-weapons-firing-contact-sheet.png");
}

async function writeImageContactSheet(context, weaponIds, sourcePrefix, outputName) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1024, height: 996 });
  const tiles = weaponIds.map((weaponId, index) => {
    const data = readFileSync(`test-results/${sourcePrefix}-${weaponId}.png`).toString("base64");
    const left = index < 4 ? (index % 2) * 512 : 256;
    const top = index < 4 ? Math.floor(index / 2) * 332 : 664;
    return `<section style="position:absolute;left:${left}px;top:${top}px;width:512px;height:332px;background:#191919;color:#ffffa0;font:14px monospace;padding:8px;box-sizing:border-box">
      <div>${weaponId}</div>
      <img src="data:image/png;base64,${data}" style="position:absolute;left:0;top:32px;width:512px;height:288px;object-fit:cover" />
    </section>`;
  }).join("");
  await page.setContent(`<main style="margin:0;width:1024px;height:996px;background:#191919;position:relative">${tiles}</main>`);
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
    const errors = await openGame(page);

    for (const weaponId of WEAPONS) {
      const snapshot = await selectWeaponAndWaitForModel(page, weaponId);
      expect(snapshot.startPanelVisible).toBe(false);
      expect(snapshot.weaponPlaneExists).toBe(false);
      expect(snapshot.activeModel.failed).toBe(false);
      expect(snapshot.activeModel.partCount).toBeGreaterThan(20);
      expectUsableScreenProjection(snapshot);
      expectMuzzleNearFrontFor(snapshot, weaponId);
      await page.screenshot({
        path: `test-results/e2e-weapon-${weaponId}.png`,
        fullPage: false,
      });
    }
    await writeContactSheet(context, WEAPONS);

    expect(errors).toEqual([]);
  });

  test("1-5 武器射击、枪口火焰和换弹状态正常", async ({ page, context }) => {
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

  test("P90 使用 3D 模型路径而不是 2D fallback", async ({ page }) => {
    const errors = await openGame(page);
    const canvas = await page.locator("canvas").first();
    await expect(canvas).toBeVisible();

    const snapshot = await selectWeaponAndWaitForModel(page, "p90");
    expect(snapshot.activeModel.failed).toBe(false);
    expect(snapshot.activeModel.source).toBe("blockbench-json");
    expect(snapshot.activeModel.partCount).toBeGreaterThan(20);
    expect(snapshot.activeModel.visibleMeshCount).toBeGreaterThan(20);
    expectUsableScreenProjection(snapshot);
    expect(snapshot.weaponPlaneExists).toBe(false);
    expect(errors).toEqual([]);
  });
});
