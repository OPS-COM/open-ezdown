(function () {
    // ============================================================
    // DOMAIN GATE — Only run on supported yt-dlp sites
    // ============================================================
    const hostname = window.location.hostname.toLowerCase();

    function isSupportedSite(domains) {
        // Split hostname into individual dot-separated segments
        // e.g. "www.youtube.com" → ["www", "youtube", "com"]
        const parts = hostname.split('.');

        return domains.some(d => {
            const entry = d.toLowerCase();
            if (entry.includes('.')) {
                // Entry is a full domain like "56.com" or "abc.net.au"
                // Only match if hostname IS that domain or is a subdomain of it
                return hostname === entry || hostname.endsWith('.' + entry);
            } else {
                // Entry is a short name like "youtube", "twitter", "le"
                // Must match a COMPLETE hostname segment — no substring tricks
                return parts.includes(entry);
            }
        });
    }

    // Fetch supported domains JSON bundled with extension
    fetch(chrome.runtime.getURL('supported-domains.json'))
        .then(r => r.json())
        .then(domains => {
            if (!isSupportedSite(domains)) return; // Not a supported site — do nothing
            init(); // Site is supported — boot the extension
        })
        .catch(() => {
            // If JSON fails to load, fall back to allowing YouTube only
            if (hostname.includes('youtube.com')) init();
        });

    function init() {

        let currentData = null;
        let activeTab = 'video';
        let consentGiven = localStorage.getItem('ezdown_consent') === 'true';
        let extractionPending = false;

        // Detection & Injection logic
        function injectButton() {
            if (document.getElementById('ezdown-btn')) return;

            const btn = document.createElement('div');
            btn.id = 'ezdown-btn';
            btn.className = 'ezdown-title-btn';
            btn.innerHTML = `
            <span class="ezdown-btn-icon">⚡</span>
            <span class="ezdown-btn-text">EZDown</span>
        `;

            // Anchor to the YouTube player container
            const player = document.querySelector('.html5-video-player') || document.querySelector('#movie_player');
            if (player) {
                player.appendChild(btn);
                btn.style.cssText = `
                position: absolute;
                top: 20px;
                right: 60px;
                z-index: 2005;
                cursor: pointer;
            `;
            } else {
                document.body.appendChild(btn);
                btn.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 2147483647;
                cursor: pointer;
            `;
            }

            btn.onclick = handleButtonClick;
        }

        // Modal UI Initialization
        const overlay = document.createElement('div');
        overlay.id = 'ezdown-overlay';
        overlay.innerHTML = `
        <div id="ezdown-modal">
            <div id="ezdown-modal-header">
                <span id="ezdown-modal-title">EZDown</span>
                <button id="ezdown-close">&times;</button>
            </div>
            <div id="ezdown-body">
                <div id="ezdown-content"></div>
            </div>
        </div>
    `;
        document.body.appendChild(overlay);

        document.getElementById('ezdown-close').onclick = () => {
            overlay.style.display = 'none';
            resetButtonState();
        };

        async function handleButtonClick() {
            if (extractionPending) return;

            const btn = document.getElementById('ezdown-btn');
            const btnText = btn.querySelector('.ezdown-btn-text');

            if (currentData) {
                overlay.style.display = 'flex';
                renderState();
                return;
            }

            try {
                const res = await fetch('http://localhost:3000/session-status');
                if (!res.ok) throw new Error();
            } catch (e) {
                overlay.style.display = 'flex';
                renderOffline(document.getElementById('ezdown-content'));
                return;
            }

            extractionPending = true;
            btnText.textContent = 'Extracting...';
            btn.classList.add('loading-pulse');

            try {
                const url = window.location.href;
                chrome.runtime.sendMessage({ action: "fetchLinks", url: url }, (response) => {
                    extractionPending = false;
                    resetButtonState();

                    if (chrome.runtime.lastError || !response.success) {
                        alert("Extraction failed. Make sure the EZDown App is running.");
                        return;
                    }

                    currentData = response.data;
                    overlay.style.display = 'flex';
                    renderState();
                });
            } catch (err) {
                extractionPending = false;
                resetButtonState();
                alert("Connection error.");
            }
        }

        function resetButtonState() {
            const btnText = document.querySelector('#ezdown-btn .ezdown-btn-text');
            if (btnText) btnText.textContent = 'EZDown';
            const btn = document.getElementById('ezdown-btn');
            if (btn) btn.classList.remove('loading-pulse');
        }

        function renderState() {
            const content = document.getElementById('ezdown-content');
            if (!consentGiven) {
                renderConsent(content);
            } else {
                renderResults(content, currentData);
            }
        }

        function renderOffline(container) {
            container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <div style="font-size: 50px; margin-bottom: 20px;">🔌</div>
                <h3 style="color: white; margin-bottom: 15px;">App Offline</h3>
                <p style="color: rgba(255,255,255,0.5); font-size: 14px;">Open the <b>EZDown Desktop App</b> to continue.</p>
                <button class="ezdown-consent-btn" style="margin-top: 25px;" onclick="location.reload()">Retry Connection</button>
            </div>
        `;
        }

        function renderConsent(container) {
            container.innerHTML = `
            <div class="ezdown-consent">
                <p>To provide high-quality streams, EZDown needs to use site cookies synced to your Desktop App.</p>
                <button class="ezdown-consent-btn" id="ezdown-accept">I Consent, Let's Go!</button>
            </div>
        `;
            document.getElementById('ezdown-accept').onclick = () => {
                consentGiven = true;
                localStorage.setItem('ezdown_consent', 'true');
                chrome.runtime.sendMessage({ action: "prefetch", url: window.location.href });
                renderState();
            };
        }

        function renderResults(container, data) {
            const body = document.getElementById('ezdown-body');
            const existingHeader = document.getElementById('ezdown-results-header');
            if (existingHeader) existingHeader.remove();

            const resultsHeader = document.createElement('div');
            resultsHeader.id = 'ezdown-results-header';
            resultsHeader.innerHTML = `
            <div id="ezdown-video-title" title="${data.title}">${data.title}</div>
            <div id="ezdown-tabs">
                <button class="ezdown-tab ${activeTab === 'video' ? 'active' : ''}" id="ezdown-tab-video">Video</button>
                <button class="ezdown-tab ${activeTab === 'audio' ? 'active' : ''}" id="ezdown-tab-audio">Audio</button>
                <button class="ezdown-tab ${activeTab === 'combined' ? 'active' : ''}" id="ezdown-tab-combined">Combined</button>
            </div>
        `;
            body.insertBefore(resultsHeader, container);

            renderFormatList(container, data);

            document.getElementById('ezdown-tab-video').onclick = () => { activeTab = 'video'; renderResults(container, data); };
            document.getElementById('ezdown-tab-audio').onclick = () => { activeTab = 'audio'; renderResults(container, data); };
            document.getElementById('ezdown-tab-combined').onclick = () => { activeTab = 'combined'; renderResults(container, data); };
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

        function renderFormatList(container, data) {
            let formats = [];
            if (activeTab === 'video') formats = data.formats.filter(f => f.type !== 'audio' && f.filesize);
            else if (activeTab === 'audio') formats = data.formats.filter(f => f.type === 'audio' && f.filesize);
            else formats = data.formats.filter(f => f.type === 'video' && f.filesize);

            container.innerHTML = `
            <div id="ezdown-list">
                ${formats.map(format => `
                    <div class="ezdown-item">
                        <div class="ezdown-item-info">
                            <div class="ezdown-quality">
                                ${getFormatTitle(format)}
                                ${format.type === 'video' && activeTab === 'video' ? '<span class="ezdown-muted-tag">🔇 Muted</span>' :
                    (activeTab === 'audio' ? '' : '<span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(46, 213, 115, 0.12); color: #2ed573; font-weight: 700; text-transform: uppercase; margin-left: 8px;">🔊 Audio</span>')}
                            </div>
                            <div class="ezdown-meta">
                                <span>${format.extension.toUpperCase()}</span>
                                <span class="ezdown-dot">•</span>
                                <span>${Math.round(format.filesize / 1024 / 1024)} MB</span>
                            </div>
                        </div>
                        <button class="ezdown-dl-btn" data-id="${format.id}" data-type="${activeTab}" data-ext="${format.extension}">Download</button>
                    </div>
                `).join('')}
            </div>
        `;

            container.querySelectorAll('.ezdown-dl-btn').forEach(btn => {
                btn.onclick = async () => {
                    const fId = btn.getAttribute('data-id');
                    const type = btn.getAttribute('data-type');
                    const ext = btn.getAttribute('data-ext');
                    btn.disabled = true;
                    btn.innerText = 'Sending...';

                    try {
                        const endpoint = type === 'combined' ? '/merge' : '/download';
                        await fetch(`http://localhost:3000${endpoint}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                videoFormatId: fId,
                                url: window.location.href,
                                title: data.title,
                                extension: ext
                            })
                        });
                        renderDonationScreen(type);
                    } catch (e) {
                        alert("App disconnected!");
                        btn.disabled = false;
                    }
                };
            });
        }

        function renderDonationScreen(mediaType) {
            const container = document.getElementById('ezdown-content');
            const header = document.getElementById('ezdown-results-header');
            if (header) header.style.display = 'none';

            container.innerHTML = `
            <div class="ezdown-donation-container">
                <div class="ezdown-donation-icon">🚀</div>
                <div class="ezdown-donation-title">Sent to Desktop!</div>
                <div class="ezdown-donation-text">
                    The download has been handed over to the <b>EZDown App</b>. Please check the app window for progress and file location.
                </div>
                
                <div class="ezdown-donation-options">
                    <a href="https://ko-fi.com/opscom" target="_blank" class="ezdown-donation-btn ezdown-kofi">
                        <span>☕</span> Support on Ko-fi
                    </a>
                    <a href="https://app.binance.com/uni-qr/53UCq9d3" class="ezdown-donation-btn ezdown-binance">
                        <span>🪙</span> Binance Pay
                    </a>
                </div>
                
                <a href="https://github.com/ops-com/open-ezdown" target="_blank" class="ezdown-donation-btn ezdown-github">
                    <span>⭐</span> Star on GitHub
                </a>
            </div>
        `;
        }

        // Observer for YouTube's Dynamic Page Loading
        let lastUrl = window.location.href;
        setInterval(() => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                currentData = null;
                resetButtonState();
                injectButton();
            }
        }, 1000);

        // Initial Injection
        injectButton();

    } // end init()
})();
