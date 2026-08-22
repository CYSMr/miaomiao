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

        await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.classList.contains('user-platform-ios'));
        await page.waitForTimeout(800);
        await page.evaluate(() => window.showScreen('chat-screen'));
        await page.waitForSelector('#chat-screen.active');

        await page.click('#toggle-actions-panel-btn');
        await page.waitForFunction(() => document.querySelector('.chat-input-area').classList.contains('panel-open'));

        // Use a real pointer click: this is the interaction that previously left
        // the 280px custom panel occupying the bottom of the chat on iOS.
        await page.click('#chat-input');
        await page.waitForTimeout(400);

        const state = await page.evaluate(() => {
            const inputArea = document.querySelector('.chat-input-area');
            const inputRow = document.querySelector('.chat-input-row');
            const chatScreen = document.getElementById('chat-screen');
            const inputAreaRect = inputArea.getBoundingClientRect();
            const inputRowRect = inputRow.getBoundingClientRect();
            const chatRect = chatScreen.getBoundingClientRect();

            return {
                focused: document.activeElement?.id,
                panelOpen: inputArea.classList.contains('panel-open'),
                transform: getComputedStyle(inputArea).transform,
                blankSpaceBelowInput: Math.round(chatRect.bottom - inputRowRect.bottom),
                visibleFooterHeight: Math.round(chatRect.bottom - inputAreaRect.top)
            };
        });

        assert.equal(state.focused, 'chat-input', '点击后输入框应获得焦点');
        assert.equal(state.panelOpen, false, '点击输入框后必须关闭自定义操作面板');
        assert.ok(
            state.blankSpaceBelowInput < 100,
            `输入框下方不应残留约280px空区；实际 ${state.blankSpaceBelowInput}px，状态 ${JSON.stringify(state)}`
        );

        console.log('PASS: tapping the chat input closes the custom panel without a bottom gap');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
