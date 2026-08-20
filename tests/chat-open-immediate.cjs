const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4183';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH
    || chromium.executablePath();

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: CHROMIUM_PATH
    });

    try {
        const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);

        await page.evaluate(async () => {
            const avatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';
            const history = Array.from({ length: 60 }, (_, index) => ({
                role: index % 2 ? 'assistant' : 'user',
                content: `延迟测试消息 ${index}`,
                timestamp: Date.now() + index
            }));

            await dbStorage.set(KEYS.CHATS, {
                latency_test: {
                    name: '延迟测试',
                    type: 'single',
                    history,
                    personas: {
                        ai: { name: 'AI', avatar },
                        my: { name: '我', avatar }
                    },
                    wallpaper: null,
                    memoryRounds: 0,
                    isOfflineMode: false,
                    heartVoiceMode: 'simple',
                    bubbleCSS: { online: '', offline: '' }
                }
            });
        });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
        await page.click('#home-btn-main-hub');
        await page.waitForSelector('#chat-list-container .list-item-content');

        await page.evaluate(() => {
            const originalWalletGet = db.wallet.get.bind(db.wallet);
            db.wallet.get = async (...args) => {
                await new Promise(resolve => setTimeout(resolve, 1500));
                return originalWalletGet(...args);
            };
        });

        const startedAt = Date.now();
        await page.click('#chat-list-container .list-item-content');
        await page.waitForSelector('#chat-screen.active', { timeout: 3000 });
        const navigationDelay = Date.now() - startedAt;

        assert.ok(
            navigationDelay < 500,
            `聊天页应立即显示，不应等待钱包读取；实际等待 ${navigationDelay}ms`
        );

        await page.waitForFunction(
            () => document.querySelectorAll('#chat-messages .message-wrapper').length === 60,
            null,
            { timeout: 3000 }
        );

        console.log(`PASS: chat screen became active in ${navigationDelay}ms`);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
