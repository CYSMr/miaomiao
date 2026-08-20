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
        await page.route('https://api.minimaxi.com/v1/models', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: [
                    { id: 'speech-02-hd' },
                    { id: 'abab6.5s-chat' },
                    { id: 'speech-02-turbo' }
                ]
            })
        }));

        await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);
        await page.click('#home-btn-settings');
        await page.click('#settings-hub-api-btn');
        await page.waitForSelector('#api-settings-screen.active');
        await page.fill('#minimax-voice-api-key', 'test-key');

        const fetchButton = page.locator('#fetch-minimax-models-btn');
        await assert.doesNotReject(() => fetchButton.waitFor({ state: 'visible', timeout: 1000 }));
        await fetchButton.click();

        const modelSelect = page.locator('#minimax-voice-model-select');
        await modelSelect.waitFor({ state: 'visible' });
        assert.deepEqual(
            await modelSelect.locator('option').evaluateAll(options => options.map(option => option.value)),
            ['', 'speech-02-hd', 'speech-02-turbo']
        );

        await modelSelect.selectOption('speech-02-turbo');
        assert.equal(await page.inputValue('#minimax-voice-model'), 'speech-02-turbo');
        console.log('PASS: MiniMax voice models can be fetched and selected');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
