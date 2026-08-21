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
            appState.customIcons = { 'icon-list-background': source };
            await dbStorage.set(KEYS.CHATS, appState.chats);
            await dbStorage.set(KEYS.STICKERS, appState.stickers);
            await dbStorage.set(KEYS.AI_STICKERS, appState.aiStickers);
            await dbStorage.set(KEYS.CUSTOM_ICONS, appState.customIcons);
            await dbStorage.set(KEYS.DIARY_ENTRIES, [{ id: 1, avatar: source, content: '日记' }]);
            await dbStorage.set(KEYS.FORUM_DATA, { posts: [{ authorAvatar: source, image: source }] });
            await dbStorage.set(KEYS.HOME_WALLPAPER, source);
            await dbStorage.set(KEYS.DEFAULT_BACKGROUND_TEXTURE, source);
            await db.kvStore.put({ key: 'unlisted_storage_probe', value: { audio: 'data:audio/wav;base64,AAAA' } });

            const forumDb = await openForumDB();
            const forumWrite = forumDb.transaction([FORUM_STORE_NAME], 'readwrite');
            forumWrite.objectStore(FORUM_STORE_NAME).put({
                id: 'forumState',
                data: { posts: [{ id: 'independent-forum-post', authorAvatar: source, image: source }] }
            });
            await new Promise((resolve, reject) => {
                forumWrite.oncomplete = resolve;
                forumWrite.onerror = () => reject(forumWrite.error);
                forumWrite.onabort = () => reject(forumWrite.error);
            });
            forumDb.close();

            const migration = await window.migrateAllStoredImages();
            const storedCustomIcons = await dbStorage.get(KEYS.CUSTOM_ICONS, {});
            const immediateListBackground = getComputedStyle(
                document.getElementById('chat-list-container')
            ).backgroundImage;
            const storedDiary = await dbStorage.get(KEYS.DIARY_ENTRIES, []);
            const storedForum = await dbStorage.get(KEYS.FORUM_DATA, {});
            const storedWallpaper = await dbStorage.get(KEYS.HOME_WALLPAPER, '');
            const storedDefaultBackground = await dbStorage.get(KEYS.DEFAULT_BACKGROUND_TEXTURE, '');
            const migratedForumDb = await openForumDB();
            const forumRead = migratedForumDb.transaction([FORUM_STORE_NAME], 'readonly');
            const independentForumRow = await new Promise((resolve, reject) => {
                const request = forumRead.objectStore(FORUM_STORE_NAME).get('forumState');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            migratedForumDb.close();
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
            const analysis = await window.analyzeStoredData();
            const hidingStyle = document.createElement('style');
            hidingStyle.textContent = '#compress-history-images-btn { display: none !important; }';
            document.head.appendChild(hidingStyle);
            const analysisButton = document.getElementById('compress-history-images-btn');
            return {
                originalSource: source,
                first,
                second,
                rowsAfterDuplicate,
                dataUrl,
                gifType: gifRow.mimeType,
                migration,
                storedListBackground: storedCustomIcons['icon-list-background'],
                immediateListBackground,
                chatUrls: appState.chats.demo.history.map(item => item.content.url),
                chatAvatar: appState.chats.demo.personas.ai.avatar,
                chatWallpaper: appState.chats.demo.wallpaper,
                stickerUrl: appState.stickers[0].url,
                aiStickerUrl: appState.aiStickers[0].url,
                diaryAvatar: storedDiary[0].avatar,
                forumAvatar: storedForum.posts[0].authorAvatar,
                forumImage: storedForum.posts[0].image,
                independentForumAvatar: independentForumRow.data.posts[0].authorAvatar,
                independentForumImage: independentForumRow.data.posts[0].image,
                homeWallpaper: storedWallpaper,
                defaultBackground: storedDefaultBackground,
                rowCount: await db.imageAssets.count(),
                apiUrl: apiMessages[0].content[0].image_url.url,
                hydratedImage: imageProbe.src,
                hydratedBackground: backgroundProbe.style.backgroundImage,
                analysisEntryCount: analysis.entries.length,
                analysisSorted: analysis.entries.every((entry, index, entries) => index === 0 || entries[index - 1].size >= entry.size),
                analysisHasAssets: analysis.entries.some(entry => entry.key === 'imageAssets' && entry.imageAssetCount >= 2),
                analysisDiaryRefs: analysis.entries.find(entry => entry.key === KEYS.DIARY_ENTRIES)?.assetRefCount || 0,
                analysisDiaryBase64: analysis.entries.find(entry => entry.key === KEYS.DIARY_ENTRIES)?.base64ImageCount || 0,
                analysisHasUnlistedKey: analysis.entries.some(entry => entry.key === 'unlisted_storage_probe' && entry.base64AudioCount === 1),
                analysisIndependentForumRefs: analysis.entries.find(entry => entry.key === 'ForumDatabase/forumState')?.assetRefCount || 0,
                analysisButtonDisplay: getComputedStyle(analysisButton).display,
                analysisButtonBackground: getComputedStyle(analysisButton).backgroundColor,
                analysisButtonText: analysisButton.textContent.trim(),
                migrateButtonText: document.getElementById('image-storage-migrate-btn')?.textContent.trim(),
                migrateButtonInActionGrid: document.getElementById('image-storage-migrate-btn')?.parentElement?.style.gridTemplateColumns,
                oldToggleExists: Boolean(document.getElementById('image-storage-optimization-toggle'))
            };
        });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof db !== 'undefined' && db?.isOpen?.());
        await page.waitForFunction(() => appState.customIcons?.['icon-list-background']);
        await page.waitForFunction(() => document.getElementById('custom-icon-styles')?.textContent.includes('data:image'));
        const reloadedStyle = await page.evaluate(() => {
            const listBackground = document.getElementById('chat-list-container');
            return {
                asset: appState.customIcons['icon-list-background'],
                rendered: getComputedStyle(listBackground).backgroundImage
            };
        });

        assert.match(result.first, /^asset:\/\//);
        assert.equal(result.first, result.second);
        assert.equal(result.rowsAfterDuplicate, 1);
        assert.match(result.dataUrl, /^data:image\/webp;base64,/);
        assert.equal(result.gifType, 'image/gif');
        assert.ok(result.chatUrls.every(url => url === result.first));
        assert.equal(result.chatAvatar, result.first);
        assert.equal(result.chatWallpaper, result.originalSource);
        assert.equal(result.stickerUrl, result.first);
        assert.equal(result.aiStickerUrl, result.first);
        assert.equal(result.diaryAvatar, result.originalSource);
        assert.equal(result.forumAvatar, result.first);
        assert.equal(result.forumImage, result.first);
        assert.equal(result.independentForumAvatar, result.first);
        assert.equal(result.independentForumImage, result.first);
        assert.equal(result.homeWallpaper, result.first);
        assert.equal(result.defaultBackground, result.originalSource);
        assert.equal(result.storedListBackground, result.originalSource);
        assert.match(result.immediateListBackground, /data:image/);
        assert.equal(reloadedStyle.asset, result.originalSource);
        assert.match(reloadedStyle.rendered, /data:image/);
        assert.ok(result.rowCount >= 2);
        assert.equal(result.migration.failed, 0);
        assert.match(result.apiUrl, /^data:image\/webp;base64,/);
        assert.match(result.hydratedImage, /^blob:/);
        assert.match(result.hydratedBackground, /blob:/);
        assert.ok(result.analysisEntryCount > 3);
        assert.equal(result.analysisSorted, true);
        assert.equal(result.analysisHasAssets, true);
        assert.equal(result.analysisDiaryRefs, 0);
        assert.ok(result.analysisDiaryBase64 >= 1);
        assert.equal(result.analysisHasUnlistedKey, true);
        assert.ok(result.analysisIndependentForumRefs >= 1);
        assert.notEqual(result.analysisButtonDisplay, 'none');
        assert.notEqual(result.analysisButtonBackground, 'rgba(0, 0, 0, 0)');
        assert.equal(result.analysisButtonText, '查看详细存储占用');
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
