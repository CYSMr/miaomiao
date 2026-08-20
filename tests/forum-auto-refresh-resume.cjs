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

        const due = await page.evaluate(() => {
            const check = window.isForumRefreshDue;
            return {
                disabled: check({ autoRefresh: false, refreshInterval: 30, lastRefreshAt: 0 }, 2_000_000),
                neverRun: check({ autoRefresh: true, refreshInterval: 30, lastRefreshAt: 0 }, 2_000_000),
                recent: check({ autoRefresh: true, refreshInterval: 30, lastRefreshAt: 1_000_000 }, 2_000_000),
                overdue: check({ autoRefresh: true, refreshInterval: 10, lastRefreshAt: 1_000_000 }, 2_000_000)
            };
        });

        assert.deepEqual(due, {
            disabled: false,
            neverRun: true,
            recent: false,
            overdue: true
        });

        const source = fs.readFileSync(path.join(__dirname, '..', 'scripts.js'), 'utf8');
        assert.match(source, /visibilitychange[\s\S]*?refreshForumIfDue\(\)/,
            'returning to the foreground should catch up an overdue forum refresh');
        assert.match(source, /home-btn-forum[\s\S]*?loadForumData\(\)[\s\S]*?renderForumPosts\(\)[\s\S]*?refreshForumIfDue\(\)/,
            'opening the forum should render loaded data and catch up an overdue refresh');

        console.log('PASS: forum refresh catches up after suspension without refreshing early');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
