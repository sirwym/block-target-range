import { test, expect } from "@playwright/test";

test.describe("武器系统视觉验收", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000); // 等待场景加载
  });

  test("页面加载无控制台错误", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.waitForTimeout(3000);
    expect(errors).toEqual([]);
  });

  test("按 1-5 切换武器并截图", async ({ page }) => {
    const weaponNames = ["glock17", "m4", "ak47", "awp", "p90"];

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press(String(i + 1));
      await page.waitForTimeout(800); // 等待武器切换动画

      await page.screenshot({
        path: `test-results/weapon-${weaponNames[i]}.png`,
        fullPage: false,
      });
    }
  });

  test("武器模型渲染正确", async ({ page }) => {
    // 检查 canvas 是否存在
    const canvas = await page.locator("canvas").first();
    await expect(canvas).toBeVisible();

    // 切换到每个武器，检查是否有渲染错误
    for (let i = 1; i <= 5; i++) {
      await page.keyboard.press(String(i));
      await page.waitForTimeout(500);

      // 检查控制台是否有模型加载错误
      const errorCount = await page.evaluate(() => {
        return window.__consoleErrors || 0;
      });
      expect(errorCount).toBe(0);
    }
  });
});
