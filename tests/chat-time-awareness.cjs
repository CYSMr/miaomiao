const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4183';

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || chromium.executablePath()
    });

    try {
        const page = await browser.newPage();
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);

        const result = await page.evaluate(() => {
            const first = Date.parse('2026-08-19T23:10:00+08:00');
            const history = [
                { role: 'user', content: '我去睡了', timestamp: first },
                { role: 'assistant', content: '晚安', timestamp: first + 60_000 },
                { role: 'user', content: '我下班了', timestamp: Date.parse('2026-08-20T19:30:00+08:00') }
            ];
            const baseChat = {
                personas: { my: { name: '用户' }, ai: { name: 'AI' } },
                type: 'single'
            };
            return {
                enabled: window.processHistoryForAPI(history, { ...baseChat, timeAwareness: true }),
                disabled: window.processHistoryForAPI(history, { ...baseChat, timeAwareness: false }),
                currentPrompt: window.buildCurrentTimeAwarenessPrompt(Date.parse('2026-08-20T19:30:00+08:00'))
            };
        });

        assert.match(result.enabled[0].content, /时间节点.*2026年8月19日.*23:10/);
        assert.equal(result.enabled[1].content, '晚安', 'continuous messages should not repeat timestamps');
        assert.match(result.enabled[2].content, /时间已经过去约20小时.*2026年8月20日.*19:30/);
        assert.equal(result.disabled[0].content, '我去睡了');
        assert.equal(result.disabled[2].content, '我下班了');
        assert.match(result.currentPrompt, /2026年8月20日.*19:30/);
        assert.match(result.currentPrompt, /区分当前时间与历史消息时间/);

        console.log('PASS: time awareness preserves meaningful conversation gaps without timestamp noise');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
