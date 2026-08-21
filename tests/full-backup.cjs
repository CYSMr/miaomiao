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

        const backup = await page.evaluate(async () => {
            await db.imageAssets.clear();
            await db.kvStore.bulkPut([
                { key: 'minimaxVoiceConfig', value: { apiKey: 'voice-secret', groupId: 'voice-group' } },
                { key: 'mcp_secret_tokens_v1', value: { mcp_demo: 'mcp-secret' } },
                { key: 'imageStorageOptimization', value: true },
                { key: 'push_subscription', value: { endpoint: 'device-only' } }
            ]);
            localStorage.setItem('customDialogSummaryPrompt', 'custom-summary');
            localStorage.setItem('musicTheme', 'vinyl');
            await saveLocalPlayerMedia(
                new File([new Uint8Array([1, 2, 3, 4])], 'tiny.bin', { type: 'application/octet-stream' }),
                'application/octet-stream'
            );
            const imageAssetUrl = await window.storeImageAsset(
                new Blob([new Uint8Array([71, 73, 70, 56, 57, 97])], { type: 'image/gif' }),
                { compress: false }
            );
            await db.kvStore.put({
                key: 'chats',
                value: { demo: { history: [{ role: 'user', content: { type: 'sticker', url: imageAssetUrl } }] } }
            });

            const backup = {};
            for await (const [key, value] of window.createFullBackupEntries()) {
                backup[key] = value;
            }
            return backup;
        });

        assert.deepEqual(backup.minimaxVoiceConfig, { apiKey: 'voice-secret', groupId: 'voice-group' });
        assert.deepEqual(backup.mcp_secret_tokens_v1, { mcp_demo: 'mcp-secret' });
        assert.equal(backup.imageStorageOptimization, true);
        assert.equal(backup.push_subscription, undefined, 'device push subscriptions must stay device-local');
        assert.equal(backup.__localStorage.customDialogSummaryPrompt, 'custom-summary');
        assert.equal(backup.__localStorage.musicTheme, 'vinyl');
        assert.equal(backup.__playerMedia.name, 'tiny.bin');
        assert.match(backup.__playerMedia.dataUrl, /^data:application\/octet-stream;base64,/);
        assert.equal(backup.__imageAssets.length, 1);
        assert.match(backup.__imageAssets[0].dataUrl, /^data:image\/gif;base64,/);

        const restored = await page.evaluate(async backupData => {
            await db.kvStore.bulkDelete([
                'minimaxVoiceConfig',
                'mcp_secret_tokens_v1',
                'imageStorageOptimization'
            ]);
            await db.imageAssets.clear();
            await db.kvStore.put({ key: 'push_subscription', value: { endpoint: 'keep-current-device' } });
            localStorage.removeItem('customDialogSummaryPrompt');
            localStorage.removeItem('musicTheme');
            await deleteLocalPlayerMedia();

            await window.restoreFullBackupStorage(backupData, backupData.__metadata);
            const media = await getLocalPlayerMedia();
            return {
                voice: (await db.kvStore.get('minimaxVoiceConfig'))?.value,
                mcpSecrets: (await db.kvStore.get('mcp_secret_tokens_v1'))?.value,
                imageOptimization: (await db.kvStore.get('imageStorageOptimization'))?.value,
                push: (await db.kvStore.get('push_subscription'))?.value,
                summaryPrompt: localStorage.getItem('customDialogSummaryPrompt'),
                musicTheme: localStorage.getItem('musicTheme'),
                mediaName: media?.name,
                mediaSize: media?.blob?.size,
                assetCount: await db.imageAssets.count(),
                assetBytes: Array.from(new Uint8Array(await (await db.imageAssets.toCollection().first()).blob.arrayBuffer()))
            };
        }, backup);

        assert.deepEqual(restored.voice, { apiKey: 'voice-secret', groupId: 'voice-group' });
        assert.deepEqual(restored.mcpSecrets, { mcp_demo: 'mcp-secret' });
        assert.equal(restored.imageOptimization, true);
        assert.deepEqual(restored.push, { endpoint: 'keep-current-device' });
        assert.equal(restored.summaryPrompt, 'custom-summary');
        assert.equal(restored.musicTheme, 'vinyl');
        assert.equal(restored.mediaName, 'tiny.bin');
        assert.equal(restored.mediaSize, 4);
        assert.equal(restored.assetCount, 1);
        assert.deepEqual(restored.assetBytes, [71, 73, 70, 56, 57, 97]);

        console.log('PASS: full backup round-trips secrets and local settings but excludes device push state');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
