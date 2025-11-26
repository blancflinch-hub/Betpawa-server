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
        
        // LAUNCH OPTIONS (Simplified)
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
            // REMOVED executablePath line so it uses the downloaded version
        });

        const page = await browser.newPage();

        // Pretend to be Windows Chrome
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 720 });

        // BLOCK ASSETS
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if(['image', 'stylesheet', 'font', 'media'].includes(type)){
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
                    console.log(`Updated: ${liveData.match}`);
                } else {
                    liveData.status = "Scanning (Page Loaded)...";
                }
            } catch (err) {
                // Keep silent on small loop errors
            }
        }, 2000);

    } catch (e) {
        console.log("❌ CRITICAL ERROR:", e.message);
        liveData.status = "CRASHED - RESTARTING";
        liveData.debug_error = e.message; 
        
        // Restart after 15 seconds (give it time to cool down)
        setTimeout(startScraper, 15000);
    }
}
