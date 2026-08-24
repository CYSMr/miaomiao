(() => {
    const DEVICE_LOCAL_KEYS = new Set(['push_subscription', 'push_permission_status']);
    const GZIP_MIME = 'application/gzip';

    const blobToDataUrl = blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('读取本地媒体失败'));
        reader.readAsDataURL(blob);
    });

    const openDatabaseIfPresent = (name) => new Promise((resolve, reject) => {
        const known = typeof indexedDB.databases === 'function'
            ? indexedDB.databases().then(list => list.some(item => item.name === name))
            : Promise.resolve(true);
        known.then(exists => {
            if (!exists) return resolve(null);
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error(`打开 ${name} 失败`));
        }).catch(reject);
    });

    const readStore = (database, storeName, mode = 'readonly') => new Promise((resolve, reject) => {
        if (!database || !database.objectStoreNames.contains(storeName)) return resolve([]);
        const request = database.transaction(storeName, mode).objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error(`读取 ${storeName} 失败`));
    });

    const readOne = (database, storeName, key) => new Promise((resolve, reject) => {
        if (!database || !database.objectStoreNames.contains(storeName)) return resolve(null);
        const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error(`读取 ${storeName} 失败`));
    });

    const readMainDatabase = async () => {
        const database = await openDatabaseIfPresent('AIRP_Beautified_DB');
        if (!database) return {};
        try {
            const kvRecords = await readStore(database, 'kvStore');
            const result = {};
            for (const record of kvRecords) {
                if (typeof record?.key === 'string' && !DEVICE_LOCAL_KEYS.has(record.key)) {
                    result[record.key] = record.value;
                }
            }
            const wallet = await readOne(database, 'wallet', 'main');
            if (wallet) result.wallet = wallet;
            const shopItems = await readStore(database, 'shopItems');
            if (shopItems.length) result.shopItems = shopItems;
            const imageAssets = await readStore(database, 'imageAssets');
            if (imageAssets.length) {
                result.__imageAssets = [];
                for (const asset of imageAssets) {
                    if (!asset?.id || !asset.blob) continue;
                    result.__imageAssets.push({
                        id: asset.id,
                        mimeType: asset.mimeType || asset.blob.type || 'application/octet-stream',
                        size: asset.size || asset.blob.size,
                        createdAt: asset.createdAt || null,
                        dataUrl: await blobToDataUrl(asset.blob)
                    });
                }
            }
            return result;
        } finally {
            database.close();
        }
    };

    const readForumDatabase = async () => {
        const database = await openDatabaseIfPresent('ForumDatabase');
        if (!database) return null;
        try {
            const record = await readOne(database, 'forumData', 'forumState');
            return record?.data || null;
        } finally {
            database.close();
        }
    };

    const readPlayerMedia = async () => {
        const database = await openDatabaseIfPresent('miaomiaoPlayerMedia');
        if (!database) return null;
        try {
            const record = await readOne(database, 'media', 'current');
            if (!record?.blob) return null;
            return {
                name: record.name || '自定义播放器素材',
                type: record.type || record.blob.type || 'application/octet-stream',
                savedAt: record.savedAt || null,
                dataUrl: await blobToDataUrl(record.blob)
            };
        } finally {
            database.close();
        }
    };

    const readLocalStorage = () => {
        const values = {};
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key && !DEVICE_LOCAL_KEYS.has(key)) values[key] = localStorage.getItem(key);
        }
        return values;
    };

    const createMigrationBackup = async () => {
        const main = await readMainDatabase();
        const backup = {
            __metadata: {
                version: 'migration-1',
                exportDate: new Date().toISOString(),
                appVersion: 'AIRP-Enhanced',
                dataFormat: 'gzip-json',
                description: '喵喵机跨域迁移完整存档'
            },
            __localStorage: readLocalStorage()
        };
        for (const [key, value] of Object.entries(main)) backup[key] = value;
        const forumData = await readForumDatabase();
        if (forumData) backup.forum_data = forumData;
        const playerMedia = await readPlayerMedia();
        if (playerMedia) backup.__playerMedia = playerMedia;
        const farmUserId = localStorage.getItem('farm_user_id');
        if (farmUserId) backup.farmUserId = farmUserId;
        return backup;
    };

    const serializeMigrationBackup = async backup => {
        const json = JSON.stringify(backup);
        if (typeof CompressionStream !== 'function') {
            return new Blob([json], { type: 'application/json' });
        }
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        return new Response(stream, { headers: { 'Content-Type': GZIP_MIME } }).blob();
    };

    const downloadBackup = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };

    window.createMigrationBackup = createMigrationBackup;
    window.serializeMigrationBackup = serializeMigrationBackup;

    const exportButton = document.getElementById('export-migration-btn');
    const status = document.getElementById('migration-status');
    exportButton?.addEventListener('click', async () => {
        exportButton.disabled = true;
        status.textContent = '正在读取完整存档，请不要关闭页面…';
        try {
            const backup = await createMigrationBackup();
            const blob = await serializeMigrationBackup(backup);
            const extension = blob.type === GZIP_MIME ? 'json.gz' : 'json';
            const filename = `miaomiao-migration-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extension}`;
            downloadBackup(blob, filename);
            const itemCount = Object.keys(backup.__localStorage || {}).length
                + Object.keys(backup).filter(key => !key.startsWith('__')).length;
            status.textContent = `已导出完整存档（约 ${(blob.size / 1024 / 1024).toFixed(2)} MB，包含 ${itemCount} 项应用数据）。旧数据没有被删除。`;
        } catch (error) {
            console.error(error);
            status.textContent = `导出失败：${error.message || error}。旧数据未改变，可以重试。`;
        } finally {
            exportButton.disabled = false;
        }
    });
})();
