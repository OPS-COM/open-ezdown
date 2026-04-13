const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const https = require('https');
const express = require('express');
const cors = require('cors');
const Store = require('electron-store');

const store = new Store();

// Initialize default settings
if (!store.has('downloadPath')) {
    store.set('downloadPath', path.join(app.getPath('downloads'), 'EZDown'));
}
if (!store.has('history')) {
    store.set('history', []);
}

const expressApp = express();
expressApp.use(cors());
expressApp.use(express.json());

let mainWindow;
let tray = null;
let activePort = 3000;
const COOKIES_PATH = path.join(app.getPath('userData'), 'ezdown_session.txt');
const basePath = app.isPackaged ? process.resourcesPath : __dirname;
const ytdlpPath = path.join(basePath, 'yt-dlp.exe');
const ffmpegPath = path.join(basePath, 'ffmpeg.exe');

let ffmpegStatus = { isInstalling: false, progress: 0, status: 'Idle', error: null };
let mergeTasks = {};

// Find an available port in range [start, start+10]
function findAvailablePort(start = 3000) {
    return new Promise((resolve, reject) => {
        const net = require('net');
        const tryPort = (port) => {
            if (port > start + 10) return reject(new Error('No available ports in range 3000-3010'));
            const server = net.createServer();
            server.once('error', () => tryPort(port + 1));
            server.once('listening', () => {
                server.close(() => resolve(port));
            });
            server.listen(port, '127.0.0.1');
        };
        tryPort(start);
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'res/icons/tray.png');
    let icon;
    try {
        icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) throw new Error('empty');
    } catch {
        icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('EZDown - Running in background');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show EZDown',
            click: () => {
                if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit EZDown',
            click: () => { app.isQuitting = true; app.quit(); }
        }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0a0a0a',
            symbolColor: '#7c5cff'
        },
        backgroundColor: '#0a0a0a',
        icon: path.join(__dirname, 'res/icons/icon.png'),
        show: false
    });

    mainWindow.loadFile('index.html');
    mainWindow.once('ready-to-show', () => mainWindow.show());

    // Intercept close: minimize to tray if background mode is ON
    mainWindow.on('close', (e) => {
        if (!app.isQuitting && store.get('backgroundMode', false)) {
            e.preventDefault();
            mainWindow.hide();
            if (!tray) createTray();
        }
    });
}

ipcMain.handle('open-url', (event, url) => {
    shell.openExternal(url);
});

// =========================
// UTILITIES
// =========================

function getCleanUrl(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
            urlObj.searchParams.delete('list');
            urlObj.searchParams.delete('index');
            urlObj.searchParams.delete('start_radio');
        }
        return urlObj.toString();
    } catch (e) { return url; }
}

function startHistoryItem(title, url, path) {
    const history = store.get('history');
    // Remove if already exists with same path (replacement)
    const filtered = history.filter(h => h.path !== path);
    filtered.unshift({ title, url, path, date: 'Starting...', status: 'active' });
    store.set('history', filtered.slice(0, 50));
    if (mainWindow) mainWindow.webContents.send('history-updated');
}

function updateStatusOnFailure(path, url) {
    const history = store.get('history');
    const item = history.find(h => h.path === path);
    if (item) {
        item.status = 'failed';
        item.date = 'Failed';
        store.set('history', history);
        if (mainWindow) mainWindow.webContents.send('history-updated');
    }
    if (mergeTasks[url]) {
        mergeTasks[url].status = 'failed';
        if (mainWindow) mainWindow.webContents.send('merge-progress', { url, ...mergeTasks[url] });
    }
}

async function ensureFFmpeg(force = false) {
    if (fs.existsSync(ffmpegPath) && !force) return true;
    if (ffmpegStatus.isInstalling) return false;

    ffmpegStatus = { isInstalling: true, progress: 0, status: 'Connecting...', error: null };
    if (mainWindow) mainWindow.webContents.send('ffmpeg-status', ffmpegStatus);

    // Direct binary link is smaller and faster than zip extraction
    const exeUrl = 'https://github.com/OPS-COM/ffmpeg-bin/releases/download/Relesease/ffmpeg.exe';

    return new Promise((resolve, reject) => {
        downloadWithRedirects(exeUrl, ffmpegPath)
            .then(() => {
                exec(`powershell -Command "Unblock-File -Path '${ffmpegPath}'"`, () => {
                    ffmpegStatus.status = 'Done';
                    ffmpegStatus.progress = 100;
                    ffmpegStatus.isInstalling = false;
                    if (mainWindow) mainWindow.webContents.send('ffmpeg-status', ffmpegStatus);
                    resolve(true);
                });
            })
            .catch(err => {
                ffmpegStatus.error = err.message;
                ffmpegStatus.isInstalling = false;
                if (mainWindow) mainWindow.webContents.send('ffmpeg-status', ffmpegStatus);
                reject(err);
            });
    });
}

function downloadWithRedirects(url, dest) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Follow redirect recursively
                downloadWithRedirects(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'], 10) || 0;
            let downloadedSize = 0;
            const file = fs.createWriteStream(dest);

            ffmpegStatus.status = 'Downloading FFmpeg...';
            if (mainWindow) mainWindow.webContents.send('ffmpeg-status', ffmpegStatus);

            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (totalSize > 0) {
                    ffmpegStatus.progress = Math.round((downloadedSize / totalSize) * 100);
                    if (mainWindow) mainWindow.webContents.send('ffmpeg-status', ffmpegStatus);
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                // Basic validation: ffmpeg should be > 30MB
                const stats = fs.statSync(dest);
                if (stats.size < 1000000) {
                    fs.unlinkSync(dest);
                    reject(new Error("Downloaded file is too small (likely corrupted)"));
                } else {
                    resolve();
                }
            });

            file.on('error', (err) => {
                fs.unlinkSync(dest);
                reject(err);
            });
        });

        request.on('error', (err) => {
            reject(err);
        });
    });
}

// =========================
// EXPRESS ROUTES (The Bridge)
// =========================

// Discovery endpoint for dynamic port scanning from extension
expressApp.get('/ping', (req, res) => {
    res.json({ app: 'ezdown', port: activePort });
});

expressApp.get('/check-ffmpeg', (req, res) => {
    res.json({ exists: fs.existsSync(ffmpegPath), isInstalling: ffmpegStatus.isInstalling });
});

expressApp.post('/setup-ffmpeg', (req, res) => {
    if (!ffmpegStatus.isInstalling) ensureFFmpeg(true).catch(console.error);
    res.json({ success: true });
});

expressApp.get('/ffmpeg-status', (req, res) => {
    res.json(ffmpegStatus);
});

expressApp.post('/extract', (req, res) => {
    const rawUrl = req.body.url;
    const url = getCleanUrl(rawUrl);
    const cookies = req.body.cookies;
    const userAgent = req.body.userAgent;

    if (userAgent) store.set('userAgent', userAgent);

    if (cookies && typeof cookies === 'string') {
        try {
            fs.writeFileSync(COOKIES_PATH, cookies);
            store.set('lastSyncTime', new Date().toLocaleString());
            if (mainWindow) mainWindow.webContents.send('session-updated');
        } catch (e) { console.error("Failed to save cookies:", e); }
    }

    const args = [
        '--dump-json',
        '--no-playlist',
        '--js-runtimes', 'node',
        url
    ];

    console.log(`[DEBUG] Extraction Args: ${args.join(' ')}`);

    const savedUA = store.get('userAgent');
    if (savedUA) args.push('--user-agent', savedUA);
    if (fs.existsSync(COOKIES_PATH)) args.push('--cookies', COOKIES_PATH);

    const ytdlp = spawn(ytdlpPath, args);
    let output = '';
    let errorOutput = '';

    ytdlp.stdout.on('data', d => output += d);
    ytdlp.stderr.on('data', d => errorOutput += d);

    ytdlp.on('close', code => {
        console.log(`[DEBUG] yt-dlp close code: ${code}, output length: ${output.length}`);
        if (code !== 0) {
            console.error(`[DEBUG] Extraction Error Log: ${errorOutput}`);
            return res.status(500).json({ error: errorOutput || 'Extraction failed' });
        }
        try {
            const data = JSON.parse(output);
            console.log(`[DEBUG] Found ${data.formats.length} formats in raw data`);
            const formats = data.formats.map(f => ({
                id: f.format_id,
                url: f.url,
                extension: f.ext,
                quality: f.format_note || f.quality_label || 'Unknown',
                resolution: f.resolution || (f.width && f.height ? `${f.width}x${f.height}` : 'Audio Only'),
                filesize: f.filesize || f.filesize_approx,
                type: f.vcodec === 'none' ? 'audio' : (f.acodec === 'none' ? 'video' : 'muxed'),
                vcodec: f.vcodec,
                acodec: f.acodec
            }));
            res.json({ title: data.title, formats });
        } catch (e) { res.status(500).json({ error: 'Parse Error' }); }
    });
});

expressApp.post('/download', async (req, res) => {
    const { videoFormatId, url, title, extension = 'mp4' } = req.body;
    const cleanUrl = getCleanUrl(url);
    const downloadDir = store.get('downloadPath');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

    const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
    const localPath = path.join(downloadDir, `${(title || 'download').replace(/[\\/:*?"<>|]/g, '_')}_${Date.now()}${safeExt}`);
    mergeTasks[cleanUrl] = { progress: 0, status: 'downloading', title: title, path: localPath };
    startHistoryItem(title, cleanUrl, localPath);

    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('merge-progress', { url: cleanUrl, ...mergeTasks[cleanUrl] });
    }

    const args = [
        '-f', videoFormatId,
        '--no-part', '--no-playlist',
        '--newline',
        '--js-runtimes', 'node',
        '--ffmpeg-location', ffmpegPath,
        '-o', localPath,
        cleanUrl
    ];

    const savedUA = store.get('userAgent');
    if (savedUA) args.push('--user-agent', savedUA);
    if (fs.existsSync(COOKIES_PATH)) args.push('--cookies', COOKIES_PATH);

    console.log(`[YT-DLP] Starting: ${ytdlpPath} ${args.join(' ')}`);
    const ytdlp = spawn(ytdlpPath, args);

    ytdlp.stdout.on('data', data => {
        const line = data.toString().trim();
        if (line.includes('%')) {
            const match = line.match(/(\d+(\.\d+)?)%/);
            if (match) {
                mergeTasks[cleanUrl].progress = parseFloat(match[1]);
                if (mainWindow) mainWindow.webContents.send('merge-progress', { url: cleanUrl, ...mergeTasks[cleanUrl] });
            }
        }
    });

    ytdlp.stderr.on('data', data => {
        console.error(`[YT-DLP Error] ${data.toString().trim()}`);
    });

    ytdlp.on('error', err => {
        console.error(`[YT-DLP Spawn Error] ${err.message}`);
        updateStatusOnFailure(localPath, cleanUrl);
    });

    ytdlp.on('close', code => {
        const history = store.get('history');
        const item = history.find(h => h.path === localPath);
        if (code === 0) {
            mergeTasks[cleanUrl].status = 'done';
            mergeTasks[cleanUrl].progress = 100;
            if (item) {
                item.date = new Date().toLocaleString();
                item.status = 'done';
                store.set('history', history);
                if (mainWindow) mainWindow.webContents.send('history-updated');
            }
        } else {
            mergeTasks[cleanUrl].status = 'failed';
            if (item) {
                item.status = 'failed';
                store.set('history', history);
                if (mainWindow) mainWindow.webContents.send('history-updated');
            }
        }
        if (mainWindow) mainWindow.webContents.send('merge-progress', { url: cleanUrl, ...mergeTasks[cleanUrl] });
    });

    res.json({ success: true });
});

expressApp.post('/merge', async (req, res) => {
    const { videoFormatId, audioFormatId = 'bestaudio', url, title } = req.body;
    const cleanUrl = getCleanUrl(url);
    const downloadDir = store.get('downloadPath');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

    const localPath = path.join(downloadDir, `${(title || 'merged').replace(/[\\/:*?"<>|]/g, '_')}_${Date.now()}.mp4`);
    mergeTasks[cleanUrl] = { progress: 0, status: 'downloading', title: title };
    startHistoryItem(title, cleanUrl, localPath);

    if (mainWindow) {
        mainWindow.show();
    }

    const args = [
        '-f', `${videoFormatId}+${audioFormatId}`,
        '--merge-output-format', 'mp4',
        '--no-part',
        '--ffmpeg-location', ffmpegPath,
        '--js-runtimes', 'node',
        '--no-playlist', '--newline',
        '-o', localPath,
        cleanUrl
    ];

    const savedUA = store.get('userAgent');
    if (savedUA) args.push('--user-agent', savedUA);
    if (fs.existsSync(COOKIES_PATH)) args.push('--cookies', COOKIES_PATH);

    console.log(`[YT-DLP Merge] Starting: ${ytdlpPath} ${args.join(' ')}`);
    const ytdlp = spawn(ytdlpPath, args);

    ytdlp.stdout.on('data', data => {
        const line = data.toString().trim();
        if (line.includes('%')) {
            const match = line.match(/(\d+(\.\d+)?)%/);
            if (match) {
                mergeTasks[cleanUrl].progress = parseFloat(match[1]);
                if (line.includes('Merging')) mergeTasks[cleanUrl].status = 'merging';
                if (mainWindow) mainWindow.webContents.send('merge-progress', { url: cleanUrl, ...mergeTasks[cleanUrl] });
            }
        }
    });

    ytdlp.stderr.on('data', data => {
        console.error(`[YT-DLP Merge Error] ${data.toString().trim()}`);
    });

    ytdlp.on('error', err => {
        console.error(`[YT-DLP Merge Spawn Error] ${err.message}`);
        updateStatusOnFailure(localPath, cleanUrl);
    });

    ytdlp.on('close', code => {
        const history = store.get('history');
        const item = history.find(h => h.path === localPath);
        if (code === 0) {
            mergeTasks[cleanUrl].status = 'done';
            mergeTasks[cleanUrl].progress = 100;
            if (item) {
                item.date = new Date().toLocaleString();
                item.status = 'done';
                store.set('history', history);
                if (mainWindow) mainWindow.webContents.send('history-updated');
            }
        } else {
            mergeTasks[cleanUrl].status = 'failed';
            if (item) {
                item.status = 'failed';
                item.date = 'Failed';
                store.set('history', history);
                if (mainWindow) mainWindow.webContents.send('history-updated');
            }
        }
        if (mainWindow) mainWindow.webContents.send('merge-progress', { url: cleanUrl, ...mergeTasks[cleanUrl] });
    });

    res.json({ success: true });
});

expressApp.get('/session-status', (req, res) => {
    res.json({
        synced: fs.existsSync(COOKIES_PATH),
        lastSync: store.get('lastSyncTime') || 'Never'
    });
});

expressApp.post('/clear-session', (req, res) => {
    if (fs.existsSync(COOKIES_PATH)) fs.unlinkSync(COOKIES_PATH);
    store.delete('lastSyncTime');
    res.json({ success: true });
});

expressApp.get('/merge-status', (req, res) => {
    const url = getCleanUrl(req.query.url);
    res.json(mergeTasks[url] || { progress: 0, status: 'unknown' });
});

expressApp.get('/register-extension', (req, res) => {
    if (mainWindow) {
        mainWindow.webContents.send('extension-connected');
    }
    res.json({ success: true, status: 'registered' });
});

// =========================
// IPC HANDLERS (Native Only)
// =========================

ipcMain.handle('get-settings', () => ({
    downloadPath: store.get('downloadPath'),
    startup: app.getLoginItemSettings().openAtLogin,
    ffmpegExists: fs.existsSync(ffmpegPath),
    backgroundMode: store.get('backgroundMode', false)
}));

ipcMain.handle('set-background-mode', (event, value) => {
    store.set('backgroundMode', value);
    if (!value && tray) {
        tray.destroy();
        tray = null;
    } else if (value && !tray) {
        createTray();
    }
    return value;
});

ipcMain.handle('set-download-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (!result.canceled) {
        store.set('downloadPath', result.filePaths[0]);
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('toggle-startup', (event, value) => {
    app.setLoginItemSettings({ openAtLogin: value });
    return value;
});

ipcMain.handle('get-history', () => store.get('history'));

ipcMain.handle('clear-history', () => {
    store.set('history', []);
    return [];
});

ipcMain.handle('get-onboarding-status', () => {
    return store.get('onboardingComplete', false);
});

ipcMain.handle('complete-onboarding', () => {
    store.set('onboardingComplete', true);
    return true;
});

ipcMain.handle('open-path', (event, filePath) => {
    exec(`explorer /select,"${filePath}"`);
});

ipcMain.handle('open-extension-folder', () => {
    const isPackaged = app.isPackaged;
    const targetPath = isPackaged
        ? path.join(process.resourcesPath, 'extension')
        : path.join(__dirname, 'extension');
    exec(`explorer "${targetPath}"`);
});

// =========================
// APP LIFECYCLE
// =========================

app.whenReady().then(async () => {
    createWindow();

    // Create tray immediately if background mode is already enabled
    if (store.get('backgroundMode', false)) createTray();

    try {
        activePort = await findAvailablePort(3000);
        expressApp.listen(activePort, () => {
            console.log(`Unified Bridge listening on port ${activePort}`);
        });
    } catch (err) {
        console.error('Failed to find available port:', err.message);
    }
});

app.on('before-quit', () => { app.isQuitting = true; });

app.on('window-all-closed', () => {
    // Don't quit if minimized to tray
    if (process.platform !== 'darwin' && !store.get('backgroundMode', false)) {
        app.quit();
    }
});
