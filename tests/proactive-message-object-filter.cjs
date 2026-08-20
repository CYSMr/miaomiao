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
        await page.waitForTimeout(500);

        const result = await page.evaluate(() => {
            const parsed = parseAIResponse(JSON.stringify([
                { type: 'status', text: '忙碌' },
                { type: 'text', content: '正常消息' },
                { type: 'update_thoughts', innerThoughts: '不应显示' },
                { unexpected: 'object without a message type' }
            ]));

            return {
                parsed,
                visibleMessages: extractProactiveTextMessages(parsed)
            };
        });

        assert.deepEqual(result.visibleMessages, ['正常消息']);
        assert.equal(
            JSON.stringify(result).includes('[object Object]'),
            false,
            '主动消息解析结果中不得出现 [object Object]'
        );

        console.log('PASS: proactive special-action objects are not rendered as text');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
