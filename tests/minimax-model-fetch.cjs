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
        await page.waitForTimeout(800);
        await page.click('#home-btn-settings');
        await page.click('#settings-hub-api-btn');
        await page.waitForSelector('#api-settings-screen.active');
        const modelSelect = page.locator('#minimax-voice-model-select');
        await modelSelect.waitFor({ state: 'visible', timeout: 1000 });
        assert.deepEqual(
            await modelSelect.locator('option').evaluateAll(options => options.map(option => option.value)),
            [
                '',
                'speech-2.8-hd',
                'speech-2.8-turbo',
                'speech-2.6-hd',
                'speech-2.6-turbo',
                'speech-2.5-hd-preview',
                'speech-2.5-turbo-preview',
                'speech-02-hd',
                'speech-02-turbo'
            ]
        );

        await modelSelect.selectOption('speech-02-turbo');
        assert.equal(await page.inputValue('#minimax-voice-model'), 'speech-02-turbo');
        console.log('PASS: verified MiniMax voice models can be selected');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
