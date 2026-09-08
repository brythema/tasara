const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log('Opening Supabase Dashboard...');
  await page.goto('https://supabase.com/dashboard', { waitUntil: 'networkidle' });

  console.log('Please log in and navigate to your Tasara project.');
  console.log('Once on the project dashboard, press Enter to continue...');
  await new Promise(r => process.stdin.once('data', r));

  // Navigate to API settings
  console.log('Navigating to API settings...');
  await page.goto('https://supabase.com/dashboard/project/_/settings/api');

  // Wait for the page to load
  await page.waitForSelector('.code-block, [data-testid="api-url"]', { timeout: 30000 }).catch(() => null);

  // Try to find and extract the project URL
  const urlField = await page.locator('input[placeholder*="project"], input[placeholder*="supabase"], .code-block').first();
  if (await urlField.isVisible().catch(() => false)) {
    const url = await urlField.inputValue().catch(() => '');
    console.log('Found URL field:', url ? url.substring(0, 50) + '...' : 'empty');
  }

  // Try to find and extract the anon key
  const keyField = await page.locator('input[placeholder*="key"], input[placeholder*="anon"]').first();
  if (await keyField.isVisible().catch(() => false)) {
    const key = await keyField.inputValue().catch(() => '');
    console.log('Found key field:', key ? key.substring(0, 50) + '...' : 'empty');
  }

  // Take a screenshot for the user to see
  await page.screenshot({ path: 'supabase-api-page.png', fullPage: true });
  console.log('Screenshot saved to supabase-api-page.png');
  console.log('Please copy the Project URL and Anon key from the screen.');
  console.log('Then close the browser and provide the values.');

  // Keep browser open for user interaction
  await browser.waitForEvent('close').catch(() => {});
  await browser.close();
})();
