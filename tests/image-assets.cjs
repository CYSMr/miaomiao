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
        await page.waitForFunction(() => typeof db !== 'undefined' && db?.isOpen?.());

        const result = await page.evaluate(async () => {
            await db.imageAssets.clear();
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/></svg>`;
            const source = `data:image/svg+xml;base64,${btoa(svg)}`;
            const first = await window.storeImageAsset(source);
            const second = await window.storeImageAsset(source);
            const rowsAfterDuplicate = await db.imageAssets.count();
            const dataUrl = await window.resolveImageSource(first, 'data-url');
            const gifSource = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
            const gifAsset = await window.storeImageAsset(gifSource);
            const gifRow = await db.imageAssets.get(gifAsset.slice('asset://'.length));

            appState.chats = {
                demo: {
                    history: [
                        { role: 'user', content: { type: 'just_image', url: source } },
                        { role: 'user', content: { type: 'sticker', url: source, name: '红色' } }
                    ]
                }
            };
            appState.stickers = [{ url: source, name: '我的红色' }];
            appState.aiStickers = [{ url: source, name: '对方红色' }];
            await dbStorage.set(KEYS.CHATS, appState.chats);
            await dbStorage.set(KEYS.STICKERS, appState.stickers);
            await dbStorage.set(KEYS.AI_STICKERS, appState.aiStickers);

            const migration = await window.migrateAllStoredImages();
            const apiMessages = await window.resolveApiImageAssets([{
                role: 'user',
                content: [{ type: 'image_url', image_url: { url: appState.chats.demo.history[0].content.url } }]
            }]);

            return {
                first,
                second,
                rowsAfterDuplicate,
                dataUrl,
                gifType: gifRow.mimeType,
                migration,
                chatUrls: appState.chats.demo.history.map(item => item.content.url),
                stickerUrl: appState.stickers[0].url,
                aiStickerUrl: appState.aiStickers[0].url,
                rowCount: await db.imageAssets.count(),
                apiUrl: apiMessages[0].content[0].image_url.url,
                migrateButtonText: document.getElementById('image-storage-migrate-btn')?.textContent.trim(),
                oldToggleExists: Boolean(document.getElementById('image-storage-optimization-toggle'))
            };
        });

        assert.match(result.first, /^asset:\/\//);
        assert.equal(result.first, result.second);
        assert.equal(result.rowsAfterDuplicate, 1);
        assert.match(result.dataUrl, /^data:image\/webp;base64,/);
        assert.equal(result.gifType, 'image/gif');
        assert.ok(result.chatUrls.every(url => url === result.first));
        assert.equal(result.stickerUrl, result.first);
        assert.equal(result.aiStickerUrl, result.first);
        assert.equal(result.rowCount, 2);
        assert.equal(result.migration.failed, 0);
        assert.match(result.apiUrl, /^data:image\/webp;base64,/);
        assert.equal(result.migrateButtonText, '压缩并整理图片');
        assert.equal(result.oldToggleExists, false);

        console.log('PASS: image assets are compressed, deduplicated, migrated, and resolved for API calls');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
