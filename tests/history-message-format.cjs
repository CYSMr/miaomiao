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

        const history = await page.evaluate(() => window.processHistoryForAPI([
            { role: 'assistant', content: { type: 'send_voice', text: '语音正文', duration: 3 } },
            { role: 'assistant', content: { type: 'just_image', url: 'https://example.com/a.jpg' } },
            { role: 'assistant', content: { type: 'html_page', html: '<html></html>' } },
            { role: 'user', content: { type: 'location', address: '上海' } },
            { role: 'system', content: { type: 'status_update', status: '忙碌' }, hidden: true },
            { role: 'assistant', content: { type: 'future_unknown_action', payload: 1 } }
        ], {
            personas: { my: { name: '用户' }, ai: { name: 'AI' } },
            type: 'single'
        }));

        const serialized = JSON.stringify(history);
        assert.equal(serialized.includes('特殊訊息'), false);
        assert.equal(serialized.includes('特殊消息'), false);
        assert.match(history[0].content, /你发送了一段语音.*语音正文/);
        assert.match(history[1].content, /你发送了一张图片/);
        assert.match(history[2].content, /你发送了一个互动页面/);
        assert.match(history[3].content, /用户分享了一个位置.*上海/);
        assert.match(history[4].content, /状态.*忙碌/);
        assert.equal(history.length, 5, '无法识别的对象应跳过，不能伪造成用户消息');

        console.log('PASS: structured chat history keeps message meaning without generic placeholders');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
