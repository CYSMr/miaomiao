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
        await page.waitForFunction(() => typeof db !== 'undefined' && db?.isOpen?.());

        const result = await page.evaluate(async () => {
            await db.imageAssets.clear();
            const fontFile = new File([new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0])], 'demo.ttf', {
                type: 'font/ttf'
            });
            const online = await window.storeFontAsset(fontFile);
            const offline = await window.storeFontAsset(fontFile);
            appState.customFontUrl = online;
            appState.customFontFamily = '';
            appState.offlineFontUrl = offline;
            appState.offlineFontFamily = '';
            await dbStorage.set(KEYS.CUSTOM_FONT_URL, online);
            await dbStorage.set(KEYS.OFFLINE_FONT_URL, offline);
            await window.applyCustomFont(online, '', offline, '');

            const style = document.getElementById('custom-font-style')?.textContent || '';
            document.getElementById('phone-screen').classList.add('offline-active');
            return {
                online,
                offline,
                assetCount: await db.imageAssets.count(),
                style,
                hasOnlineFileInput: Boolean(document.getElementById('online-font-file-input')),
                hasOfflineFileInput: Boolean(document.getElementById('offline-font-file-input')),
                offlineClass: document.getElementById('phone-screen').classList.contains('offline-active')
            };
        });

        assert.match(result.online, /^asset:\/\//);
        assert.equal(result.online, result.offline, 'identical fonts should be deduplicated');
        assert.equal(result.assetCount, 1);
        assert.match(result.style, /UserOnlineFont/);
        assert.match(result.style, /UserOfflineFont/);
        assert.match(result.style, /blob:/);
        assert.equal(result.hasOnlineFileInput, true);
        assert.equal(result.hasOfflineFileInput, true);
        assert.equal(result.offlineClass, true);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof db !== 'undefined' && db?.isOpen?.());
        await page.waitForFunction(() => document.getElementById('custom-font-style')?.textContent.includes('UserOfflineFont'));
        const restored = await page.evaluate(() => ({
            online: appState.customFontUrl,
            offline: appState.offlineFontUrl,
            style: document.getElementById('custom-font-style').textContent
        }));
        assert.equal(restored.online, result.online);
        assert.equal(restored.offline, result.offline);
        assert.match(restored.style, /blob:/);

        console.log('PASS: online and offline fonts support persistent local file assets');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
