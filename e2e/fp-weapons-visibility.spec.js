import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const WEAPONS = ["deagle_golden", "m4", "m95", "ak47", "awp"];
const VIEWPORT = { width: 1280, height: 720 };
const RESULTS_DIR = "/Users/mymac/Downloads/AI课/我的方块靶场/test-results";

async function openWeaponLab(page, baseURL) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto(`${baseURL}/?e2e=1&mode=weaponLab`);
  await page.waitForFunction(() => window.__blockTargetRangeDebug, { timeout: 10000 });
  await page.waitForTimeout(5000);
  return errors;
}

async function waitForWeaponModelReady(page, weaponId, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
    if (snap.ready === true && snap.source === "tacz-first-person") {
      return snap;
    }
    await page.waitForTimeout(300);
  }
  return page.evaluate(() => window.__blockTargetRangeDebug.snapshot());
}

test.describe("第一人称武器可见性验证", () => {
  test("验证5把武器非静态模式下第一人称模型可见性", async ({ page, baseURL }) => {
    await page.setViewportSize(VIEWPORT);

    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }

    const results = {};

    for (const weaponId of WEAPONS) {
      console.log(`\n=== 测试武器: ${weaponId} ===`);

      const errors = await openWeaponLab(page, baseURL);

      await page.evaluate((id) => {
        window.__blockTargetRangeDebug.selectWeapon(id);
      }, weaponId);

      console.log(`已选择武器 ${weaponId}，等待模型加载...`);
      await page.waitForTimeout(3000);

      const snapshot = await waitForWeaponModelReady(page, weaponId);

      console.log(`ready: ${snapshot.ready}`);
      console.log(`source: ${snapshot.source}`);
      console.log(`currentWeaponId: ${snapshot.currentWeaponId}`);

      const screenBounds = snapshot.activeModel?.screenBounds || null;
      const markers = snapshot.activeModel?.markers || [];

      if (screenBounds) {
        console.log(`screenBounds:`);
        console.log(`  minX: ${screenBounds.minX?.toFixed(2)}`);
        console.log(`  minY: ${screenBounds.minY?.toFixed(2)}`);
        console.log(`  maxX: ${screenBounds.maxX?.toFixed(2)}`);
        console.log(`  maxY: ${screenBounds.maxY?.toFixed(2)}`);
        console.log(`  width: ${screenBounds.width?.toFixed(2)}`);
        console.log(`  height: ${screenBounds.height?.toFixed(2)}`);
        console.log(`  areaRatio: ${screenBounds.areaRatio?.toFixed(4)}`);
      } else {
        console.log(`screenBounds: null (无可见模型)`);
      }

      console.log(`markers 数量: ${markers.length}`);
      markers.forEach((m, i) => {
        console.log(`  marker[${i}]: name=${m.name}, x=${m.x?.toFixed(1)}, y=${m.y?.toFixed(1)}`);
      });

      const screenshotPath = path.join(RESULTS_DIR, `fp-fix-${weaponId}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`截图已保存: ${screenshotPath}`);

      results[weaponId] = {
        ready: snapshot.ready,
        source: snapshot.source,
        currentWeaponId: snapshot.currentWeaponId,
        screenBounds: screenBounds ? {
          minX: screenBounds.minX,
          minY: screenBounds.minY,
          maxX: screenBounds.maxX,
          maxY: screenBounds.maxY,
          width: screenBounds.width,
          height: screenBounds.height,
          areaRatio: screenBounds.areaRatio,
          heightPositive: (screenBounds.height || 0) > 0
        } : null,
        markers: markers.map(m => ({ name: m.name, x: m.x, y: m.y })),
        screenshotPath,
        errors
      };
    }

    console.log("\n\n========== 最终结果汇总 ==========\n");
    console.log(JSON.stringify(results, null, 2));

    const summaryPath = path.join(RESULTS_DIR, "fp-weapons-visibility-summary.json");
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2), "utf-8");
    console.log(`\n汇总报告已保存: ${summaryPath}`);

    for (const weaponId of WEAPONS) {
      const r = results[weaponId];
      console.log(`\n--- ${weaponId} ---`);
      console.log(`  ready: ${r.ready}`);
      console.log(`  source: ${r.source}`);
      console.log(`  height > 0: ${r.screenBounds?.heightPositive ?? "N/A (bounds=null)"}`);
      console.log(`  height: ${r.screenBounds?.height?.toFixed(2) ?? "N/A"}`);
      console.log(`  areaRatio: ${r.screenBounds?.areaRatio?.toFixed(4) ?? "N/A"}`);
      console.log(`  截图: ${r.screenshotPath}`);
    }

    expect(results).toBeTruthy();
  });
});
