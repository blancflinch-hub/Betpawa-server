// --- CRITICAL FIX: DELETE STUCK SETTINGS ---
delete process.env.PUPPETEER_EXECUTABLE_PATH;
delete process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD;

const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());

// 1. DATA STORE
let liveData = {
    status: "Initializing...",
    match: "Waiting for sync...",
    home_team: "Loading...",
    away_team: "Loading...",
    last_updated: "Never",
    debug_error: "None"
};

// 2. START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server is ALIVE on port ${PORT}`);
    startScraper(); 
});

app.get('/', (req, res) => {
    res.json(liveData);
});

// 3. SCRAPER
async function startScraper() {
    try {
        console.log("🚀 Launching Browser...");
        
        // Launch using the internal downloaded browser
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--single-process", 
                "--disable-gpu"
            ],
            ignoreHTTPSErrors: true
        });

        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 720 });

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())){
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log("Navigating to BetPawa...");
        
        await page.goto('https://www.betpawa.com.gh/virtual-sports', {
            waitUntil: 'domcontentloaded',
            timeout: 60000 
        });

        console.log("✅ Page Loaded! Starting scan loop...");

        setInterval(async () => {
            try {
                const data = await page.evaluate(() => {
                    const teams = document.querySelectorAll('.virtual-match-team');
                    if (teams && teams.length >= 2) {
                        return { home: teams[0].innerText, away: teams[1].innerText };
                    }
                    return null;
                });

                if (data) {
                    liveData = {
                        status: "Live",
                        match: `${data.home} vs ${data.away}`,
                        home_team: data.home,
                        away_team: data.away,
                        last_updated: new Date().toLocaleTimeString(),
                        debug_error: "None"
                    };
                } else {
                    liveData.status = "Scanning...";
                }
            } catch (err) {
                // Ignore errors
            }
        }, 2000);

    } catch (e) {
        console.log("❌ CRITICAL ERROR:", e.message);
        liveData.status = "CRASHED - RESTARTING";
        liveData.debug_error = e.message; 
        setTimeout(startScraper, 15000);
    }
}
