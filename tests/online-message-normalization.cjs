const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
            const thought = { type: 'update_thoughts', innerThoughts: '心声' };
            return {
                legacyArray: window.normalizeAIResponse(JSON.stringify([
                    '第一条', '第二条', thought
                ])),
                wrappedArray: window.normalizeAIResponse(JSON.stringify({
                    response: ['第一条', '第二条', thought]
                })),
                canonical: window.normalizeAIResponse(JSON.stringify({
                    messages: [
                        { type: 'text', content: '第一条' },
                        { type: 'sticker', name: '猫猫', url: 'https://example.com/cat.webp' }
                    ],
                    thoughts: thought
                })),
                malformed: window.normalizeAIResponse('{"type":"sticker","url":"https://example.com/cat.webp"')
            };
        });

        for (const normalized of [result.legacyArray, result.wrappedArray]) {
            assert.deepEqual(normalized.messages.map(message => message.content), ['第一条', '第二条']);
            assert.equal(normalized.thoughts.innerThoughts, '心声');
        }
        assert.equal(result.canonical.messages.length, 2);
        assert.deepEqual(result.canonical.messages[1], {
            type: 'sticker',
            name: '猫猫',
            url: 'https://example.com/cat.webp'
        });
        assert.equal(result.canonical.thoughts.innerThoughts, '心声');
        assert.deepEqual(result.malformed.messages, [], '损坏的 JSON 不应把 type/name/url 拆成聊天文字');

        const history = await page.evaluate(() => window.processHistoryForAPI([
            {
                role: 'assistant',
                content: { type: 'sticker', name: '猫猫', url: 'https://example.com/cat.webp' }
            }
        ], {
            personas: { my: { name: '用户' }, ai: { name: 'AI' } },
            type: 'single'
        }));
        assert.equal(history[0].role, 'assistant');
        assert.ok(Array.isArray(history[0].content), 'AI 表情历史应保留图片内容，不能只降级成文字占位');
        assert.equal(history[0].content[0].image_url.url, 'https://example.com/cat.webp');

        const source = fs.readFileSync(path.join(__dirname, '..', 'scripts.js'), 'utf8');
        assert.match(source, /"messages"\s*:\s*\[/, '线上提示词应说明统一 messages 外壳');
        assert.match(source, /"thoughts"\s*:/, '线上提示词应说明统一 thoughts 字段');

        console.log('PASS: online replies share one stable message/thought/action schema');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
