const { test, expect } = require('@playwright/test');

test('test kokoro tts generation', async ({ page }) => {
  test.setTimeout(180000); // 3 minutes

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  await page.goto('http://localhost:8003/');

  await page.waitForTimeout(1000); // Wait for modules

  console.log("Testing Kokoro...");
  await page.selectOption('#ttsEngineSelect', 'kokoro');
  await page.waitForTimeout(1000);

  console.log("Preloading Kokoro...");
  await page.click('#preloadModelsBtn');

  // Wait a few seconds to let any error trigger.
  await page.waitForTimeout(15000);

  // Check toasts
  const toasts = await page.locator('.toast').allTextContents();
  console.log("Toasts:", toasts);
});
