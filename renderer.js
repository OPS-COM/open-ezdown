const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// State
let currentTab = 'home';
let supportedSites = [];
let lastExtractedData = null;
let activeResultTab = 'video';
let isModalOpen = false;

// Tab Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
    };
});

// Link Interception for External URLs
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && (link.href.startsWith('http') || link.href.startsWith('#'))) {
        if (link.href !== '#' && !link.href.includes('localhost')) {
            e.preventDefault();
            ipcRenderer.invoke('open-url', link.href);
        }
    }
});

function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
    currentTab = tabId;

    if (tabId === 'sites' && supportedSites.length === 0) loadSites();
    if (tabId === 'history') loadHistory();
    if (tabId === 'settings') loadSettings();
}

// Result Tab Navigation
document.querySelectorAll('.result-tab').forEach(btn => {
    btn.onclick = () => {
        activeResultTab = btn.dataset.type;
        document.querySelectorAll('.result-tab').forEach(b => {
            const isActive = b.dataset.type === activeResultTab;
            b.classList.toggle('active', isActive);
            b.style.background = isActive ? 'rgba(255,255,255,0.08)' : 'transparent';
            b.style.color = isActive ? 'white' : 'rgba(255,255,255,0.5)';
        });
        if (lastExtractedData) renderFormats(lastExtractedData);
    };
});

async function callApi(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`http://localhost:3000${endpoint}`, options);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Server Error');
    }
    return response.json();
}

const extractBtn = document.getElementById('extract-btn');
const urlInput = document.getElementById('direct-url');
const resultsArea = document.getElementById('extraction-result');
const formatsContainer = document.getElementById('formats-container');

extractBtn.onclick = async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    extractBtn.disabled = true;
    extractBtn.textContent = 'Extracting...';
    resultsArea.style.display = 'none';

    try {
        const result = await callApi('/extract', 'POST', { url });
        lastExtractedData = { ...result, originalUrl: url };
        displayResults(result);
    } catch (e) {
        alert(e.message);
    } finally {
        extractBtn.disabled = false;
        extractBtn.innerHTML = '✨ Extract';
    }
};

function displayResults(data) {
    console.log('[DEBUG] Full Backend Data:', data);
    resultsArea.style.display = 'block';
    document.getElementById('media-title').textContent = data.title;
    renderFormats(lastExtractedData);
}

function getFormatTitle(f) {
    if (f.type === 'audio') {
        const qualityMap = { 'low': 'Mobile Quality', 'medium': 'Standard Quality', 'high': 'High Fidelity' };
        return qualityMap[f.quality] || `${f.acodec ? f.acodec.toUpperCase() : 'Unknown'} Audio`;
    } else {
        const h = f.resolution.includes('x') ? f.resolution.split('x')[1] : f.resolution;
        let label = h ? (h >= 1080 ? `Full HD ${h}p` : (h >= 720 ? `HD ${h}p` : `${h}p`)) : (f.quality || 'Video');
        if (f.quality && f.quality.includes('60')) label += ' 60fps';
        return label;
    }
}

function renderFormats(data) {
    formatsContainer.innerHTML = '';
    const originalUrl = data.originalUrl;

    let filtered = data.formats.filter(f => {
        if (activeResultTab === 'video') return f.type === 'video' || f.type === 'muxed';
        if (activeResultTab === 'audio') return f.type === 'audio';
        if (activeResultTab === 'combined') return f.type === 'muxed' || f.type === 'video';
        return true;
    });

    filtered.sort((a, b) => b.filesize - a.filesize);

    if (filtered.length === 0) {
        formatsContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.3);">No available formats for this category.</div>';
        return;
    }

    filtered.forEach(f => {
        const sizeStr = (f.filesize / (1024 * 1024)).toFixed(1) + ' MB';
        const isMuted = f.type === 'video';
        const isCombined = activeResultTab === 'combined';

        if (!f.filesize / (1024 * 1024).toFixed(1) || !f.filesize / (1024 * 1024).toFixed(1)) {
            return;
        }

        const card = document.createElement('div');
        card.className = 'ezdown-format-item';
        card.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 16px;
            margin-bottom: 12px;
            transition: all 0.25s ease;
        `;

        card.onmouseover = () => { card.style.background = 'rgba(255,255,255,0.08)'; card.style.borderColor = 'rgba(255,255,255,0.12)'; };
        card.onmouseout = () => { card.style.background = 'rgba(255, 255, 255, 0.04)'; card.style.borderColor = 'rgba(255, 255, 255, 0.06)'; };

        card.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 700; font-size: 16px; color: white;">${getFormatTitle(f)}</span>
                    ${isMuted ? '<span style="font-size: 10px; padding: 2px 8px; border-radius: 6px; background: rgba(255, 82, 82, 0.12); color: #ff5252; font-weight: 700; text-transform: uppercase;">🔇 Muted</span>' :
                (f.type === 'audio' ? '' : '<span style="font-size: 10px; padding: 2px 8px; border-radius: 6px; background: rgba(46, 213, 115, 0.12); color: #2ed573; font-weight: 700; text-transform: uppercase;">🔊 With Audio</span>')}
                </div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.4); font-weight: 500;">
                    ${f.extension.toUpperCase()} • ${f.vcodec || f.acodec || 'Unknown Codec'} • ${sizeStr}
                </div>
            </div>
            <button class="ez-btn ${isCombined ? 'primary' : ''}">
                ${isCombined ? '📦 Merge & Save' : '⬇️ Download'}
            </button>
        `;

        card.querySelector('button').onclick = async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = '🚀 Starting...';
            try {
                await callApi(isCombined ? '/merge' : '/download', 'POST', {
                    videoFormatId: f.id,
                    url: originalUrl,
                    title: data.title,
                    extension: f.extension
                });
            } catch (e) {
                alert("Failed: " + e.message);
                btn.disabled = false;
                btn.innerHTML = isCombined ? '📦 Merge & Save' : '⬇️ Download';
            }
        };

        formatsContainer.appendChild(card);
    });
}

// SITES Logic
async function loadSites() {
    try {
        const isPackaged = __dirname.includes('app.asar');
        const basePath = isPackaged ? process.resourcesPath : __dirname;
        const content = fs.readFileSync(path.join(basePath, 'supportedsites.md'), 'utf-8');
        const lines = content.split('\n');
        const siteRegex = /^\s*-\s*\*\*([^*]+)\*\*(?::\s*(.*))?/;

        supportedSites = [];
        lines.forEach(line => {
            const match = line.match(siteRegex);
            if (match) {
                supportedSites.push({
                    name: match[1].trim(),
                    description: match[2]?.trim() || 'No description available'
                });
            }
        });

        renderSites(supportedSites);
    } catch (e) {
        console.error("Failed to load sites:", e);
    }
}

function renderSites(sites) {
    const grid = document.getElementById('sites-grid');
    grid.innerHTML = '';
    sites.forEach(site => {
        const card = document.createElement('div');
        card.className = 'site-card';
        card.innerHTML = `
            <div style="font-weight: 600; color: #7c5cff;">${site.name}</div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${site.description}">${site.description}</div>
        `;
        grid.appendChild(card);
    });
}

document.getElementById('site-search').oninput = (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = supportedSites.filter(s => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query));
    renderSites(filtered);
};

// SETTINGS & HISTORY Logic
async function loadSettings() {
    const settings = await ipcRenderer.invoke('get-settings');
    const ffmpegServerStatus = await callApi('/check-ffmpeg');
    const session = await callApi('/session-status');

    document.getElementById('current-path').textContent = settings.downloadPath;
    document.getElementById('startup-toggle').checked = settings.startup;
    document.getElementById('background-toggle').checked = settings.backgroundMode || false;
    document.getElementById('ffmpeg-check').textContent = ffmpegServerStatus.exists ? 'Installed & Ready' : 'FFmpeg missing';
    document.getElementById('ffmpeg-check').style.color = ffmpegServerStatus.exists ? '#5cff9e' : '#ff5c5c';

    updateSessionUI(session);
}

function updateSessionUI(session) {
    const timeEl = document.getElementById('session-time');
    const statusEl = document.getElementById('session-status-text');
    if (timeEl) timeEl.textContent = session.synced ? session.lastSync : 'Never Synced';
    if (statusEl) {
        statusEl.textContent = session.synced ? `Synced: ${session.lastSync}` : 'Disconnected';
        statusEl.style.color = session.synced ? '#5cff9e' : '#ff5c5c';
    }
}

document.getElementById('clear-cookies').onclick = async () => {
    if (confirm("Clear saved YouTube session? You will need to use the browser extension to re-sync.")) {
        await callApi('/clear-session', 'POST');
        const session = await callApi('/session-status');
        updateSessionUI(session);
    }
};

document.getElementById('change-path').onclick = async () => {
    const newPath = await ipcRenderer.invoke('set-download-path');
    if (newPath) document.getElementById('current-path').textContent = newPath;
};

document.getElementById('startup-toggle').onchange = (e) => {
    ipcRenderer.invoke('toggle-startup', e.target.checked);
};

document.getElementById('background-toggle').onchange = (e) => {
    ipcRenderer.invoke('set-background-mode', e.target.checked);
};

document.getElementById('setup-ffmpeg-btn').onclick = async () => {
    const btn = document.getElementById('setup-ffmpeg-btn');
    btn.disabled = true;
    btn.textContent = 'Requesting Setup...';
    await callApi('/setup-ffmpeg', 'POST');

    const poll = setInterval(async () => {
        const status = await callApi('/ffmpeg-status');
        document.getElementById('ffmpeg-check').textContent = `${status.status} (${status.progress}%)`;
        if (status.status === 'Done' || status.error) {
            clearInterval(poll);
            btn.disabled = false;
            btn.textContent = 'Reinstall';
            loadSettings();
        }
    }, 1000);
};

async function loadHistory() {
    const history = await ipcRenderer.invoke('get-history');
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    updateDashboardRecent(history);

    if (history.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.3); margin-top: 100px;">No downloads yet.</div>';
        return;
    }

    history.forEach(item => {
        const isPending = item.status === 'active' || item.date === 'Starting...';
        const el = document.createElement('div');
        el.className = 'history-item';
        const safeUrlId = btoa(item.url || 'x').replace(/=/g, '');

        el.innerHTML = `
            <div class="history-info" style="flex: 1;">
                <h4 style="display: flex; align-items: center; gap: 8px;">
                    ${item.title}
                    ${isPending ? '<span class="status-badge" style="background: rgba(124, 92, 255, 0.2); color: #7c5cff; font-size: 10px; padding: 2px 8px; border-radius: 4px;">ACTIVE</span>' : ''}
                </h4>
                <p>${item.date} • <span style="color: rgba(255,255,255,0.4); font-size: 11px;">${item.url}</span></p>
                <div class="progress-container" id="prog-${safeUrlId}" style="margin-top: 10px; display: ${isPending ? 'block' : 'none'};">
                    <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; width: 100%;">
                        <div class="progress-bar" style="height: 100%; background: #7c5cff; width: 0%; border-radius: 2px; transition: width 0.3s;"></div>
                    </div>
                </div>
            </div>
            <button class="ez-btn small" style="visibility: ${isPending ? 'hidden' : 'visible'};">📂 Folder</button>
        `;
        el.querySelector('button').onclick = () => ipcRenderer.invoke('open-path', item.path);
        list.appendChild(el);
    });
}

function updateDashboardRecent(history) {
    const recentList = document.getElementById('recent-list');
    if (!recentList) return;

    const recent = history.slice(0, 3);
    if (recent.length === 0) {
        recentList.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.1); font-size: 13px;">No recent downloads.</div>';
        return;
    }

    recentList.innerHTML = '';
    recent.forEach(item => {
        const div = document.createElement('div');
        div.className = 'recent-item';
        div.innerHTML = `
            <div class="info" style="flex: 1;">
                <h4 title="${item.title}">${item.title}</h4>
                <span>${item.date}</span>
                <div class="progress-container" id="dash-prog-${btoa(item.url || 'x').replace(/=/g, '')}" style="margin-top: 5px; display: ${item.status === 'active' ? 'block' : 'none'};">
                    <div style="height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; width: 100%;">
                        <div class="progress-bar" style="height: 100%; background: #7c5cff; width: 0%; border-radius: 2px; transition: width 0.3s;"></div>
                    </div>
                </div>
            </div>
            <button class="ez-btn small">📂 Folder</button>
        `;
        div.querySelector('button').onclick = () => ipcRenderer.invoke('open-path', item.path);
        recentList.appendChild(div);
    });
}

// MODAL LOGIC
function showModal(data) {
    const modal = document.getElementById('progress-modal');
    document.getElementById('modal-title').textContent = data.title;
    document.getElementById('modal-bar').style.width = '0%';
    document.getElementById('modal-status').textContent = 'Starting download...';
    document.getElementById('modal-open').style.display = 'none';
    modal.style.display = 'flex';
    isModalOpen = true;

    document.getElementById('modal-close').onclick = () => {
        modal.style.display = 'none';
        isModalOpen = false;
    };
}

function updateModal(data) {
    if (!isModalOpen) return;
    document.getElementById('modal-bar').style.width = data.progress + '%';
    document.getElementById('modal-status').textContent = data.status === 'merging' ? 'Merging streams...' : `Downloading... ${Math.round(data.progress)}%`;

    if (data.status === 'done') {
        document.getElementById('modal-status').textContent = '🎉 Download Completed!';
        document.getElementById('modal-open').style.display = 'inline-flex';
        document.getElementById('modal-open').onclick = () => ipcRenderer.invoke('open-path', data.path);
    }
}

document.getElementById('clear-history').onclick = async () => {
    if (confirm("Clear all download history?")) {
        await ipcRenderer.invoke('clear-history');
        loadHistory();
    }
};

// GLOBAL EVENTS
ipcRenderer.on('merge-progress', (event, data) => {
    // Check if we should open the modal (if not open and this just started)
    if (!isModalOpen && data.progress < 5 && data.status !== 'done') {
        showModal(data);
    }

    updateModal(data);

    // Update in-list progress bars (Dashboard & History)
    const safeUrlId = btoa(data.url || 'x').replace(/=/g, '');
    const ids = [`prog-${safeUrlId}`, `dash-prog-${safeUrlId}`];
    ids.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.style.display = 'block';
            container.querySelector('.progress-bar').style.width = data.progress + '%';
            if (data.status === 'done') {
                setTimeout(() => container.style.display = 'none', 3000);
            }
        }
    });
});

ipcRenderer.on('session-updated', async () => {
    const session = await callApi('/session-status');
    updateSessionUI(session);
});

// Initial UI Load
(async () => {
    const session = await callApi('/session-status');
    updateSessionUI(session);
    loadHistory();

    const isComplete = await ipcRenderer.invoke('get-onboarding-status');
    if (!isComplete) {
        document.getElementById('onboarding-modal').style.display = 'flex';
    }
})();

document.getElementById('ob-finish-btn').onclick = async () => {
    await ipcRenderer.invoke('complete-onboarding');
    document.getElementById('onboarding-modal').style.display = 'none';
};

ipcRenderer.on('extension-connected', () => {
    // Automatically transition to step 3 when extension pings the app
    const step2 = document.getElementById('ob-step-2');
    if (step2 && step2.style.display !== 'none') {
        step2.style.display = 'none';
        document.getElementById('ob-step-3').style.display = 'block';
    }
});

ipcRenderer.on('history-updated', () => {    loadHistory(); // This now updates dashboard items too
});
