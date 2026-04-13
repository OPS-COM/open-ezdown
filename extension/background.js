const cache = new Map();
let cachedPort = null;

// Discover which port EZDown is running on
async function findEZDownPort() {
    if (cachedPort) return cachedPort;
    for (let port = 3000; port <= 3010; port++) {
        try {
            const resp = await fetch(`http://localhost:${port}/ping`, { signal: AbortSignal.timeout(500) });
            if (resp.ok) {
                const data = await resp.json();
                if (data.app === 'ezdown') {
                    cachedPort = port;
                    return port;
                }
            }
        } catch { /* port not available, try next */ }
    }
    throw new Error('EZDown Desktop App not found. Please make sure it is running.');
}

async function pingDesktopApp() {
    try {
        const port = await findEZDownPort();
        await fetch(`http://localhost:${port}/register-extension`);
    } catch {
        cachedPort = null; // Reset cache if connection lost
    }
    setTimeout(pingDesktopApp, 3000); // Check every 3 seconds
}

// Start heartbeat loop
pingDesktopApp();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {    if (request.action === "prefetch") {
        if (!cache.has(request.url)) {
            console.log("Prefetching:", request.url);
            handleFetch(request.url).then(data => {
                if (data.success) cache.set(request.url, data);
            });
        }
        return false;
    }

    if (request.action === "fetchLinks") {
        if (cache.has(request.url)) {
            console.log("Serving from cache:", request.url);
            sendResponse(cache.get(request.url));
        } else {
            handleFetch(request.url).then(sendResponse);
        }
        return true; // Keep channel open for async response
    }

    if (request.action === "downloadFile") {
        console.log("Downloading file:", request.filename);
        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            saveAs: true
        });
        return false;
    }
});

async function handleFetch(url) {
    try {
        // Clear cache if it gets too large (simple LRU-ish cleanup)
        if (cache.size > 20) cache.clear();

        // 1. Find the app port dynamically
        const port = await findEZDownPort();

        // 2. Get cookies for YouTube
        const cookies = await chrome.cookies.getAll({ domain: ".youtube.com" });
        
        // 3. Format as Netscape format
        const netscapeCookies = cookies.map(c => {
            const domain = c.domain;
            const hostOnly = !domain.startsWith('.');
            const path = c.path;
            const secure = c.secure ? "TRUE" : "FALSE";
            const expiry = c.expirationDate ? Math.round(c.expirationDate) : 0;
            const name = c.name;
            const value = c.value;
            
            return `${domain}\t${hostOnly ? "FALSE" : "TRUE"}\t${path}\t${secure}\t${expiry}\t${name}\t${value}`;
        }).join('\n');

        const cookieString = `# Netscape HTTP Cookie File\n${netscapeCookies}`;

        // 4. Send to local server (dynamic port)
        const response = await fetch(`http://localhost:${port}/extract`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                cookies: cookieString,
                userAgent: navigator.userAgent
            })
        });

        const data = await response.json();
        return { success: true, data: data };

    } catch (err) {
        console.error("Fetch Error:", err);
        cachedPort = null; // Reset cache so next attempt re-scans
        return { success: false, error: err.message };
    }
}
