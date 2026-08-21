const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4183';

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || chromium.executablePath()
    });

    try {
        const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

        const result = await page.evaluate(() => {
            const sizeSetting = document.getElementById('home-time-size-setting');
            const beautifyButton = document.getElementById('settings-hub-beautify-btn');
            document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
            document.getElementById('settings-hub-screen').classList.add('active');
            sizeSetting.style.display = 'none';
            return {
                sizeSettingExists: Boolean(sizeSetting),
                beautifyButtonExists: Boolean(beautifyButton),
                beautifyNestedInsideHiddenTimeSetting: sizeSetting?.contains(beautifyButton) || false,
                beautifyVisibleWhenTimeSizeHidden: beautifyButton.getClientRects().length > 0
            };
        });

        assert.equal(result.sizeSettingExists, true);
        assert.equal(result.beautifyButtonExists, true);
        assert.equal(result.beautifyNestedInsideHiddenTimeSetting, false);
        assert.equal(result.beautifyVisibleWhenTimeSizeHidden, true);

        console.log('PASS: beautification entry stays independent from hidden time-size setting');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
