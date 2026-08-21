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
            const sharedFiles = [];
            const revokedUrls = [];
            const originalClick = HTMLAnchorElement.prototype.click;
            const originalCreateObjectURL = URL.createObjectURL;
            const originalRevokeObjectURL = URL.revokeObjectURL;

            HTMLAnchorElement.prototype.click = function () {
                clickedAnchors.push({ target: this.target, download: this.download, href: this.href });
            };
            URL.createObjectURL = () => 'blob:test-backup';
            URL.revokeObjectURL = url => revokedUrls.push(url);

            Object.defineProperty(navigator, 'canShare', {
                configurable: true,
                value: data => Array.isArray(data?.files) && data.files.length === 1
            });
            Object.defineProperty(navigator, 'share', {
                configurable: true,
                value: async data => sharedFiles.push({
                    name: data.files[0].name,
                    type: data.files[0].type,
                    size: data.files[0].size
                })
            });
            Object.defineProperty(navigator, 'userAgent', {
                configurable: true,
                value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
            });

            try {
                const blob = window.createCompactBackupBlob({ greeting: '喵', nested: { ok: true } });
                const blobText = await blob.text();
                const deliveryMethod = await window.downloadBackupBlob(blob, 'backup.json');
                const exportProgress = window.showBackupExportProgress();
                const initialProgressText = document.getElementById('backup-export-progress').textContent;
                exportProgress.close();
                const originalChats = {
                    chat_1: {
                        history: [
                            { role: 'user', content: { type: 'just_image', url: 'data:image/webp;base64,LOCAL' } },
                            { role: 'assistant', content: { type: 'just_image', url: 'https://example.com/image.webp' } },
                            { role: 'user', content: { type: 'sticker', url: 'data:image/webp;base64,STICKER', name: '喵' } }
                        ]
                    }
                };
                const optimizedChats = window.sanitizeChatsForOptimizedBackup(originalChats);

                const repeatedStickerPayload = `data:image/webp;base64,${'A'.repeat(30 * 1024)}`;
                const realisticChatHistory = Array.from({ length: 10240 }, (_, index) => ({
                    role: index % 2 ? 'assistant' : 'user',
                    content: { type: 'sticker', url: repeatedStickerPayload, name: `sticker-${index % 20}` },
                    timestamp: 1700000000000 + index
                }));
                const progressUpdates = [];
                const largeGzipBlob = await window.createStreamingJsonGzipBlob([
                    ['chats', { chat_1: { history: realisticChatHistory } }]
                ], processed => progressUpdates.push(processed));
                const decompressedReader = largeGzipBlob.stream()
                    .pipeThrough(new DecompressionStream('gzip'))
                    .getReader();
                let decompressedBytes = 0;
                while (true) {
                    const { value, done } = await decompressedReader.read();
                    if (done) break;
                    decompressedBytes += value.byteLength;
                }
                window.presentBackupSaveBlob(largeGzipBlob, 'AIRP-Backup-large.json.gz');
                const saveOverlay = document.getElementById('backup-save-overlay');
                const saveLink = saveOverlay.querySelector('a[download]');
                const shareButton = Array.from(saveOverlay.querySelectorAll('button'))
                    .find(button => button.textContent.includes('系统分享'));
                Object.defineProperty(navigator, 'share', {
                    configurable: true,
                    value: () => new Promise(() => {})
                });
                shareButton.click();
                await new Promise(resolve => setTimeout(resolve, 0));

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
                    deliveryMethod,
                    initialProgressText,
                    optimizedLocalImageType: optimizedChats.chat_1.history[0].content.type,
                    optimizedLocalImageText: optimizedChats.chat_1.history[0].content.text,
                    optimizedRemoteImageUrl: optimizedChats.chat_1.history[1].content.url,
                    optimizedStickerUrl: optimizedChats.chat_1.history[2].content.url,
                    originalLocalImageUrl: originalChats.chat_1.history[0].content.url,
                    sharedFiles,
                    largeGzipSize: largeGzipBlob.size,
                    decompressedBytes,
                    progressUpdateCount: progressUpdates.length,
                    hasDirectDownloadLink: Boolean(saveLink),
                    hasShareButton: Array.from(saveOverlay.querySelectorAll('button'))
                        .some(button => button.textContent.includes('系统分享')),
                    shareButtonTextAfterClick: shareButton.textContent,
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
        assert.equal(result.deliveryMethod, 'shared');
        assert.equal(result.initialProgressText.includes('300MB'), false, 'export hint must not assume every backup is 300 MB');
        assert.equal(result.optimizedLocalImageType, 'image');
        assert.match(result.optimizedLocalImageText, /原图未保存/);
        assert.equal(result.optimizedRemoteImageUrl, 'https://example.com/image.webp');
        assert.equal(result.optimizedStickerUrl, 'data:image/webp;base64,STICKER');
        assert.equal(result.originalLocalImageUrl, 'data:image/webp;base64,LOCAL', 'backup optimization must not mutate live chat data');
        assert.deepEqual(result.sharedFiles, [{
            name: 'backup.json',
            type: 'application/json',
            size: Buffer.byteLength(result.blobText)
        }]);
        assert.equal(result.clickedAnchors.length, 0, 'native file sharing must avoid blob navigation');
        assert.ok(result.decompressedBytes > 300 * 1024 * 1024, 'large backup must stream all 300 MB');
        assert.ok(result.largeGzipSize < 5 * 1024 * 1024, 'repeated image payloads must compress below 5 MB');
        assert.ok(result.progressUpdateCount > 50, 'large structured backup must yield progress updates');
        assert.equal(result.hasDirectDownloadLink, false, 'iOS must not offer a blob download that opens as a broken page');
        assert.equal(result.hasShareButton, true, 'prepared backup must require a fresh user tap for iOS sharing');
        assert.match(result.shareButtonTextAfterClick, /正在/, 'large file sharing must acknowledge the tap immediately');
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
