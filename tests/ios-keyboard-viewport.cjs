const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4183';

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || chromium.executablePath()
    });

    try {
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true
        });
        const page = await context.newPage();

        await page.addInitScript(() => {
            const viewport = new EventTarget();
            viewport.height = 844;
            viewport.width = 390;
            viewport.offsetTop = 0;
            viewport.offsetLeft = 0;
            viewport.scale = 1;
            window.__setTestVisualViewport = (height, offsetTop, emitResize = true) => {
                viewport.height = height;
                viewport.offsetTop = offsetTop;
                if (emitResize) viewport.dispatchEvent(new Event('resize'));
            };
            Object.defineProperty(window, 'visualViewport', {
                configurable: true,
                value: viewport
            });
        });

        await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.classList.contains('user-platform-ios'));

        await page.evaluate(() => {
            window.showScreen('chat-screen');
            document.getElementById('chat-input').focus();
            window.__setTestVisualViewport(520, 12, true);
        });
        await page.waitForTimeout(50);

        const keyboardOpen = await page.evaluate(() => ({
            chatHeight: document.getElementById('chat-screen').getBoundingClientRect().height,
            chatTop: getComputedStyle(document.getElementById('chat-screen')).top,
            phoneHeight: document.getElementById('phone-screen').getBoundingClientRect().height
        }));
        assert.equal(keyboardOpen.chatHeight, 520, 'iOS 聊天页应跟随键盘缩小后的可视高度');
        assert.equal(keyboardOpen.chatTop, '12px', 'iOS 聊天页应跟随 visualViewport 的顶部偏移');
        assert.equal(keyboardOpen.phoneHeight, 844, '键盘适配不能改变首页使用的完整根视口');

        await page.evaluate(() => {
            window.__setTestVisualViewport(844, 0, false);
            document.getElementById('chat-input').blur();
        });
        await page.waitForTimeout(400);

        const keyboardClosed = await page.evaluate(() => ({
            chatHeight: document.getElementById('chat-screen').getBoundingClientRect().height,
            chatTop: getComputedStyle(document.getElementById('chat-screen')).top
        }));
        assert.equal(keyboardClosed.chatHeight, 844, '键盘收起即使没有最终 resize 事件也应恢复聊天页高度');
        assert.equal(keyboardClosed.chatTop, '0px', '键盘收起后不应残留顶部偏移或底部空区');

        console.log('PASS: iOS chat viewport follows keyboard and restores after blur');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
