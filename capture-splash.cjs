const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1024, height: 1792 }
  });
  const page = await context.newPage();
  
  await page.goto('http://localhost:5000/splash-generator.html');
  await page.waitForTimeout(2000);
  
  await page.screenshot({ 
    path: 'client/public/splash.png',
    fullPage: false
  });
  
  console.log('Splash screenshot saved!');
  await browser.close();
})();
