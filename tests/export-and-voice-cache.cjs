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
        await page.waitForTimeout(600);

        const result = await page.evaluate(async () => {
            const clickedAnchors = [];
            const revokedUrls = [];
            const originalClick = HTMLAnchorElement.prototype.click;
            const originalCreateObjectURL = URL.createObjectURL;
            const originalRevokeObjectURL = URL.revokeObjectURL;

            HTMLAnchorElement.prototype.click = function () {
                clickedAnchors.push({ target: this.target, download: this.download, href: this.href });
            };
            URL.createObjectURL = () => 'blob:test-backup';
            URL.revokeObjectURL = url => revokedUrls.push(url);

            try {
                const blob = window.createCompactBackupBlob({ greeting: '喵', nested: { ok: true } });
                const blobText = await blob.text();
                window.downloadBackupBlob(blob, 'backup.json');

                const fakeCache = {
                    deleted: [],
                    async keys() {
                        return Array.from({ length: 35 }, (_, index) => ({ url: `https://cache/${index}` }));
                    },
                    async delete(request) {
                        this.deleted.push(request.url);
                        return true;
                    }
                };
                await window.trimMiniMaxVoiceCache(fakeCache, 30);

                const startupCache = {
                    deleted: [],
                    async keys() {
                        return Array.from({ length: 31 }, (_, index) => ({ url: `https://startup-cache/${index}` }));
                    },
                    async delete(request) {
                        this.deleted.push(request.url);
                        return true;
                    }
                };
                await window.cleanupMiniMaxVoiceCache({
                    async open() { return startupCache; }
                }, 30);

                return {
                    blobText,
                    clickedAnchors,
                    revokedImmediately: revokedUrls.length > 0,
                    deleted: fakeCache.deleted,
                    startupDeleted: startupCache.deleted
                };
            } finally {
                HTMLAnchorElement.prototype.click = originalClick;
                URL.createObjectURL = originalCreateObjectURL;
                URL.revokeObjectURL = originalRevokeObjectURL;
            }
        });

        assert.equal(result.blobText, '{"greeting":"喵","nested":{"ok":true}}');
        assert.equal(result.clickedAnchors.length, 1);
        assert.equal(result.clickedAnchors[0].target, '_blank', 'backup must never replace the PWA page');
        assert.equal(result.clickedAnchors[0].download, 'backup.json');
        assert.equal(result.revokedImmediately, false, 'blob URL must survive long enough for iOS to consume it');
        assert.deepEqual(result.deleted, [
            'https://cache/0',
            'https://cache/1',
            'https://cache/2',
            'https://cache/3',
            'https://cache/4'
        ]);
        assert.deepEqual(result.startupDeleted, ['https://startup-cache/0']);

        console.log('PASS: backup stays off the current page and voice cache remains bounded');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
