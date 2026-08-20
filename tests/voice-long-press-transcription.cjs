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

        await page.evaluate(async () => {
            const avatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';
            await dbStorage.set(KEYS.MINIMAX_VOICE_CONFIG, {
                enabled: true,
                region: 'cn',
                apiKey: 'test-key',
                groupId: 'test-group',
                model: 'speech-02-hd',
                voiceId: 'test-voice'
            });
            await dbStorage.set(KEYS.CHATS, {
                voice_press_test: {
                    name: '长按测试',
                    type: 'single',
                    history: [
                        {
                            role: 'assistant',
                            content: { type: 'voice', text: 'AI 长按后才应显示这段文字', duration: 2 },
                            timestamp: 123456789
                        },
                        {
                            role: 'user',
                            content: { type: 'voice', text: '用户长按后才应显示这段文字', duration: 2 },
                            timestamp: 123456790
                        }
                    ],
                    personas: {
                        ai: { name: 'AI', avatar },
                        my: { name: '我', avatar }
                    },
                    wallpaper: null,
                    isOfflineMode: false,
                    bubbleCSS: { online: '', offline: '' }
                }
            });
        });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);
        await page.click('#home-btn-main-hub');
        await page.click('#chat-list-container .list-item-content');
        await page.waitForSelector('#chat-screen.active');

        let voiceRequestCount = 0;
        await page.route('https://api.minimaxi.com/v1/t2a_v2**', async route => {
            voiceRequestCount++;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: { audio: '494433' }, base_resp: { status_code: 0 } })
            });
        });

        const aiVoice = page.locator('#message-123456789 .voice-message-body');
        const userVoice = page.locator('#message-123456790 .voice-message-body');
        await aiVoice.click();
        await page.waitForTimeout(500);
        assert.equal(await page.locator('.voice-text-bubble').count(), 0, '短点语音条不应展开文字');
        assert.equal(voiceRequestCount, 1, '短点 AI 语音应请求真实语音');

        await userVoice.click();
        await page.waitForTimeout(400);
        assert.equal(voiceRequestCount, 1, '用户自己的语音不应请求语音合成');
        assert.equal(await page.locator('.voice-text-bubble').count(), 0, '短点用户语音也不应展开文字');

        const box = await userVoice.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(550);
        await page.mouse.up();
        await page.waitForTimeout(100);

        assert.equal(await page.locator('.voice-text-bubble').count(), 1, '长按语音条应展开文字');
        assert.match(await page.locator('.voice-text-bubble').innerText(), /用户长按后才应显示这段文字/);

        console.log('PASS: voice transcription is shown by long press, not by a short tap');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
