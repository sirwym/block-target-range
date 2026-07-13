import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const PHASE2_STATIC_WEAPONS = ["deagle_golden", "m107", "m95", "ak47", "m4"];
const STATIC_POSE_WEAPONS = new Set(["m107", "m95", "ak47", "m4"]);
const RESULT_DIR = "test-results";

async function openPhase2StaticLab(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/?e2e=1&mode=weaponLab&taczStatic=1");
  await page.waitForFunction(() => window.__blockTargetRangeDebug);
  await page.waitForFunction(() => {
    const snapshot = window.__blockTargetRangeDebug.snapshot();
    return snapshot.mode === "weaponLab" && snapshot.pureTaczStatic === true;
  });
  return errors;
}

async function selectPhase2Weapon(page, weaponId) {
  await page.evaluate((id) => window.__blockTargetRangeDebug.selectWeapon(id), weaponId);
  await page.waitForFunction((id) => {
    const snapshot = window.__blockTargetRangeDebug.snapshot();
    return (
      snapshot.currentWeaponId === id
      && snapshot.activeModel?.ready
      && snapshot.activeModel?.rootEnabled
      && snapshot.activeModel?.visibleMeshCount > 20
      && snapshot.activeModel?.source === "tacz-first-person"
    );
  }, weaponId, { polling: 100, timeout: 15000 });
  return page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
}

function mainStructureOutliers(snapshot) {
  return (snapshot.activeModel.debugGeometry?.screenOutliers ?? [])
    .filter((item) => item.isMainStructureCandidate && !item.hideAllowed);
}

function expectPhase2StaticSnapshot(snapshot, weaponId) {
  expect(snapshot.pureTaczStatic, `[${weaponId}] 应进入 taczStatic 纯静态模式`).toBe(true);
  expect(snapshot.activeModel.pureStatic, `[${weaponId}] controller 应为 pureStatic`).toBe(true);
  expect(snapshot.activeModel.source, `[${weaponId}] 应使用 TaCZ first-person adapter`).toBe("tacz-first-person");
  expect(snapshot.activeModel.failed, `[${weaponId}] 模型加载不应失败`).toBe(false);
  expect(snapshot.activeModel.hasHands, `[${weaponId}] Phase2 静态不应创建手臂`).toBe(false);
  expect(snapshot.activeModel.leftHandEnabled, `[${weaponId}] Phase2 静态左手不应启用`).toBe(false);
  expect(snapshot.activeModel.rightHandEnabled, `[${weaponId}] Phase2 静态右手不应启用`).toBe(false);
  expect(snapshot.activeModel.hasAnimationController, `[${weaponId}] Phase2 静态不应创建动画控制器`).toBe(false);
  expect(snapshot.runtime.muzzleFlashEnabled, `[${weaponId}] Phase2 静态不应显示枪口火焰`).toBe(false);

  if (STATIC_POSE_WEAPONS.has(weaponId)) {
    expect(snapshot.activeModel.staticPoseApplied, `[${weaponId}] 应应用 Phase2 静态 pose`).toBe(true);
    expect(snapshot.activeModel.staticPoseSource, `[${weaponId}] 静态 pose 来源应可追踪`).toBe("PHASE2_STATIC_POSE_CALIBRATION");
  }

  const bounds = snapshot.activeModel.screenBounds;
  const boundsDebug = `[${weaponId}] screenBounds=${JSON.stringify(bounds)}`;
  expect(bounds, boundsDebug).toBeTruthy();
  expect(bounds.width, boundsDebug).toBeGreaterThanOrEqual(40);
  expect(bounds.height, boundsDebug).toBeGreaterThanOrEqual(60);
  expect(bounds.areaRatio, boundsDebug).toBeGreaterThan(0.004);
  expect(bounds.areaRatio, boundsDebug).toBeLessThan(0.40);
  expect(bounds.maxY, boundsDebug).toBeGreaterThan(80);
  expect(bounds.minY, boundsDebug).toBeLessThan(720);

  const debugGeometry = snapshot.activeModel.debugGeometry;
  expect(debugGeometry, `[${weaponId}] 应暴露 debugGeometry`).toBeTruthy();
  expect(debugGeometry.screenDiagnosticsVersion, `[${weaponId}] 应使用屏幕诊断 v2`).toBe(2);

  const mainOutliers = mainStructureOutliers(snapshot);
  const unreliableMainOutliers = mainOutliers.filter((item) => item.projectionUnreliable);
  expect(
    unreliableMainOutliers,
    `[${weaponId}] 主结构 outlier 不应来自近裁面不可靠投影：${JSON.stringify(unreliableMainOutliers.slice(0, 3))}`
  ).toHaveLength(0);

  const tooCloseMainOutliers = mainOutliers.filter((item) => Number.isFinite(item.minCameraZ) && item.minCameraZ <= 0.11);
  expect(
    tooCloseMainOutliers,
    `[${weaponId}] 主结构不应贴到 camera.minZ：${JSON.stringify(tooCloseMainOutliers.slice(0, 3))}`
  ).toHaveLength(0);
}

async function writeContactSheet(context, weaponIds) {
  const page = await context.newPage();
  const tileWidth = 512;
  const tileHeight = 332;
  const columns = 3;
  const rows = Math.ceil(weaponIds.length / columns);
  await page.setViewportSize({ width: tileWidth * columns, height: tileHeight * rows });
  const tiles = weaponIds.map((weaponId, index) => {
    const data = readFileSync(`${RESULT_DIR}/phase2-static-${weaponId}.png`).toString("base64");
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * tileHeight;
    return `<section style="position:absolute;left:${left}px;top:${top}px;width:${tileWidth}px;height:${tileHeight}px;background:#191919;color:#ffffa0;font:14px monospace;padding:8px;box-sizing:border-box">
      <div>${weaponId}</div>
      <img src="data:image/png;base64,${data}" style="position:absolute;left:0;top:32px;width:${tileWidth}px;height:288px;object-fit:cover" />
    </section>`;
  }).join("");
  await page.setContent(`<main style="margin:0;width:${tileWidth * columns}px;height:${tileHeight * rows}px;background:#191919;position:relative">${tiles}</main>`);
  await page.screenshot({ path: `${RESULT_DIR}/phase2-static-contact-sheet.png`, fullPage: false });
  await page.close();
}

test.describe("Phase2 TaCZ 静态枪模验收", () => {
  test("五把 Phase2 静态枪模可诊断、可截图并生成姿态报告", async ({ page, context }) => {
    test.setTimeout(120000);
    mkdirSync(RESULT_DIR, { recursive: true });

    const errors = await openPhase2StaticLab(page);
    const report = {
      generatedAt: new Date().toISOString(),
      entry: "/?e2e=1&mode=weaponLab&taczStatic=1",
      weapons: {},
      poseSearch: null,
    };

    for (const weaponId of PHASE2_STATIC_WEAPONS) {
      const snapshot = await selectPhase2Weapon(page, weaponId);
      expectPhase2StaticSnapshot(snapshot, weaponId);
      const poseSearch = await page.evaluate((id) => window.__blockTargetRangeDebug.searchPhase2StaticPose(id), weaponId);
      await page.screenshot({ path: `${RESULT_DIR}/phase2-static-${weaponId}.png`, fullPage: false });

      report.weapons[weaponId] = {
        staticPoseApplied: snapshot.activeModel.staticPoseApplied,
        staticPoseSource: snapshot.activeModel.staticPoseSource,
        screenBounds: snapshot.activeModel.screenBounds,
        screenOutliers: (snapshot.activeModel.debugGeometry?.screenOutliers ?? []).slice(0, 10),
        topPoseCandidates: poseSearch.top ?? [],
      };
    }

    report.poseSearch = await page.evaluate(() => window.__blockTargetRangeDebug.searchPhase2StaticPoses());
    writeFileSync(`${RESULT_DIR}/phase2-static-pose-report.json`, JSON.stringify(report, null, 2));
    await writeContactSheet(context, PHASE2_STATIC_WEAPONS);

    expect(errors).toEqual([]);
  });
});
