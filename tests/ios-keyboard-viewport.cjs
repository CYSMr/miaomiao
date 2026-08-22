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

        // iOS may shrink visualViewport for the keyboard while leaving the
        // layout viewport unchanged. Reproduce that split explicitly.
        await page.addInitScript(() => {
            const viewport = new EventTarget();
            viewport.height = 844;
            viewport.width = 390;
            viewport.offsetTop = 0;
            viewport.offsetLeft = 0;
            viewport.scale = 1;
            window.__setTestVisualViewport = (height, offsetTop = 0) => {
                viewport.height = height;
                viewport.offsetTop = offsetTop;
                viewport.dispatchEvent(new Event('resize'));
            };
            Object.defineProperty(window, 'visualViewport', {
                configurable: true,
                value: viewport
            });
        });

        await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.classList.contains('user-platform-ios'));
        await page.evaluate(() => {
            document.getElementById('chat-screen').classList.add('active');
            document.getElementById('chat-input').focus();
        });

        const fullHeight = await page.evaluate(() =>
            document.getElementById('chat-screen').getBoundingClientRect().height
        );

        await page.evaluate(() => window.__setTestVisualViewport(520, 12));
        await page.waitForTimeout(50);

        const keyboardState = await page.evaluate(() => ({
            chatHeight: document.getElementById('chat-screen').getBoundingClientRect().height,
            phoneHeight: document.getElementById('phone-screen').getBoundingClientRect().height,
            hasKeyboardClass: document.documentElement.classList.contains('ios-keyboard-open')
        }));

        assert.equal(
            keyboardState.chatHeight,
            fullHeight,
            '聚焦输入框不能创建一套独立且可能残留的聊天页高度'
        );
        assert.equal(keyboardState.chatHeight, keyboardState.phoneHeight, '聊天页与根容器必须始终同高');
        assert.equal(keyboardState.hasKeyboardClass, false, '页面不应依赖输入焦点维护键盘高度状态');

        // Keyboard dismissal is not guaranteed to blur the textarea on iOS.
        // Keeping focus must therefore be harmless.
        await page.evaluate(() => window.__setTestVisualViewport(844, 0));
        await page.waitForTimeout(50);
        assert.equal(
            await page.evaluate(() => document.getElementById('chat-screen').getBoundingClientRect().height),
            fullHeight,
            '键盘收起后页面必须保持完整高度，即使 textarea 仍聚焦'
        );

        console.log('PASS: iOS input focus cannot leave a second chat viewport height behind');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
