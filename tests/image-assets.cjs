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
        await page.waitForFunction(() => typeof appState !== 'undefined' && Array.isArray(appState.aiStickers) && appState.aiStickers.length > 0);

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
                    wallpaper: source,
                    personas: {
                        ai: { name: '对方', avatar: source },
                        my: { name: '我', avatar: source }
                    },
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
            await dbStorage.set(KEYS.DIARY_ENTRIES, [{ id: 1, avatar: source, content: '日记' }]);
            await dbStorage.set(KEYS.FORUM_DATA, { posts: [{ authorAvatar: source, image: source }] });
            await dbStorage.set(KEYS.HOME_WALLPAPER, source);

            const migration = await window.migrateAllStoredImages();
            const storedDiary = await dbStorage.get(KEYS.DIARY_ENTRIES, []);
            const storedForum = await dbStorage.get(KEYS.FORUM_DATA, {});
            const storedWallpaper = await dbStorage.get(KEYS.HOME_WALLPAPER, '');
            const apiMessages = await window.resolveApiImageAssets([{
                role: 'user',
                content: [{ type: 'image_url', image_url: { url: appState.chats.demo.history[0].content.url } }]
            }]);

            const imageProbe = document.createElement('img');
            imageProbe.src = first;
            const backgroundProbe = document.createElement('div');
            backgroundProbe.style.backgroundImage = `url("${first}")`;
            document.body.append(imageProbe, backgroundProbe);
            await window.hydrateImageAssetReferences(document.body);

            return {
                first,
                second,
                rowsAfterDuplicate,
                dataUrl,
                gifType: gifRow.mimeType,
                migration,
                chatUrls: appState.chats.demo.history.map(item => item.content.url),
                chatAvatar: appState.chats.demo.personas.ai.avatar,
                chatWallpaper: appState.chats.demo.wallpaper,
                stickerUrl: appState.stickers[0].url,
                aiStickerUrl: appState.aiStickers[0].url,
                diaryAvatar: storedDiary[0].avatar,
                forumAvatar: storedForum.posts[0].authorAvatar,
                forumImage: storedForum.posts[0].image,
                homeWallpaper: storedWallpaper,
                rowCount: await db.imageAssets.count(),
                apiUrl: apiMessages[0].content[0].image_url.url,
                hydratedImage: imageProbe.src,
                hydratedBackground: backgroundProbe.style.backgroundImage,
                migrateButtonText: document.getElementById('image-storage-migrate-btn')?.textContent.trim(),
                migrateButtonInActionGrid: document.getElementById('image-storage-migrate-btn')?.parentElement?.style.gridTemplateColumns,
                oldToggleExists: Boolean(document.getElementById('image-storage-optimization-toggle'))
            };
        });

        assert.match(result.first, /^asset:\/\//);
        assert.equal(result.first, result.second);
        assert.equal(result.rowsAfterDuplicate, 1);
        assert.match(result.dataUrl, /^data:image\/webp;base64,/);
        assert.equal(result.gifType, 'image/gif');
        assert.ok(result.chatUrls.every(url => url === result.first));
        assert.equal(result.chatAvatar, result.first);
        assert.equal(result.chatWallpaper, result.first);
        assert.equal(result.stickerUrl, result.first);
        assert.equal(result.aiStickerUrl, result.first);
        assert.equal(result.diaryAvatar, result.first);
        assert.equal(result.forumAvatar, result.first);
        assert.equal(result.forumImage, result.first);
        assert.equal(result.homeWallpaper, result.first);
        assert.ok(result.rowCount >= 2);
        assert.equal(result.migration.failed, 0);
        assert.match(result.apiUrl, /^data:image\/webp;base64,/);
        assert.match(result.hydratedImage, /^blob:/);
        assert.match(result.hydratedBackground, /blob:/);
        assert.equal(result.migrateButtonText, '压缩并整理图片');
        assert.equal(result.migrateButtonInActionGrid, '1fr 1fr');
        assert.equal(result.oldToggleExists, false);

        console.log('PASS: image assets are compressed, deduplicated, migrated, and resolved for API calls');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
