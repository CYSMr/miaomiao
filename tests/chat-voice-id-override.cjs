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
                voiceId: 'global-default-voice'
            });
            await dbStorage.set(KEYS.CHATS, {
                voice_test: {
                    name: '音色测试',
                    type: 'single',
                    history: [{
                        role: 'assistant',
                        content: { type: 'voice', text: '唯一语音测试文本', duration: 2 },
                        timestamp: Date.now()
                    }],
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
        await page.waitForTimeout(1000);
        await page.click('#home-btn-main-hub');
        await page.click('#chat-list-container .list-item-content');
        await page.waitForSelector('#chat-screen.active');
        await page.click('#chat-settings-btn');
        await page.waitForSelector('#chat-settings-screen.active');

        const voiceIdInput = page.locator('#chat-minimax-voice-id');
        await assert.doesNotReject(() => voiceIdInput.waitFor({ state: 'visible', timeout: 1000 }));
        assert.equal(await voiceIdInput.inputValue(), '', '未单独配置的聊天应显示为空，表示继承全局默认音色');

        await voiceIdInput.fill('chat-specific-voice');
        await page.click('#save-chat-settings-btn');
        await page.waitForSelector('#chat-screen.active');

        const savedVoiceId = await page.evaluate(() => appState.chats.voice_test.minimaxVoiceId);
        assert.equal(savedVoiceId, 'chat-specific-voice');

        let requestedVoiceId = null;
        await page.route('https://api.minimaxi.com/v1/t2a_v2**', async route => {
            requestedVoiceId = JSON.parse(route.request().postData()).voice_setting.voice_id;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: { audio: '494433' }, base_resp: { status_code: 0 } })
            });
        });

        await page.evaluate(async () => {
            const message = appState.chats.voice_test.history[0];
            await Promise.race([
                window.synthesizeMiniMaxVoice(message.content.text, message).catch(() => false),
                new Promise(resolve => setTimeout(resolve, 1000))
            ]);
        });
        assert.equal(requestedVoiceId, 'chat-specific-voice', '语音请求应优先使用当前聊天的音色 ID');

        await page.click('#chat-settings-btn');
        await voiceIdInput.fill('');
        await page.click('#save-chat-settings-btn');
        await page.waitForSelector('#chat-screen.active');
        requestedVoiceId = null;
        await page.evaluate(async () => {
            const message = appState.chats.voice_test.history[0];
            message.content.text = '唯一默认音色测试文本';
            await Promise.race([
                window.synthesizeMiniMaxVoice(message.content.text, message).catch(() => false),
                new Promise(resolve => setTimeout(resolve, 1000))
            ]);
        });
        assert.equal(requestedVoiceId, 'global-default-voice', '聊天音色留空时应使用 API 设置中的默认音色 ID');

        console.log('PASS: per-chat MiniMax voice ID overrides and falls back to the global default');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
