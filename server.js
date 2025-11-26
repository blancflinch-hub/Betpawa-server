const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());

// 1. DATA STORE (With Error Reporting)
let liveData = {
    status: "Initializing...",
    match: "Waiting for sync...",
    home_team: "Loading...",
    away_team: "Loading...",
    last_updated: "Never",
    debug_error: "No Errors Yet" // <--- This will show us the problem if it fails
};

// 2. START SERVER FIRST (To satisfy Render immediately)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server is ALIVE on port ${PORT}`);
    // Start the heavy browser in the background
    startScraper(); 
});

app.get('/', (req, res) => {
    res.json(liveData);
});

// 3. ROBUST SCRAPER ENGINE
async function startScraper() {
    try {
        console.log("🚀 Launching Browser...");
        
        // Launch with extreme memory saving settings
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
            ignoreHTTPSErrors: true, 
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
        });

        const page = await browser.newPage();

        // Pretend to be a standard Desktop Browser (More stable than mobile)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 720 });

        // BLOCK EVERYTHING except Text (Speed Boost)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if(['image', 'stylesheet', 'font', 'media', 'other'].includes(type)){
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log("Navigating to BetPawa...");
        
        // CRITICAL FIX: Only wait for DOM to load, not the network
        await page.goto('https://www.betpawa.com.gh/virtual-sports', {
            waitUntil: 'domcontentloaded',
            timeout: 45000 // 45 second timeout
        });

        console.log("✅ Page Loaded! Starting scan loop...");

        setInterval(async () => {
            try {
                const data = await page.evaluate(() => {
                    // Try the standard selector
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
                    liveData.debug_error = "Selectors found no teams (Check BetPawa HTML)";
                }
            } catch (err) {
                // Keep silent on small loop errors
            }
        }, 2000);

    } catch (e) {
        console.log("❌ CRITICAL ERROR:", e.message);
        // REPORT THE ERROR TO THE USER
        liveData.status = "CRASHED - RESTARTING";
        liveData.debug_error = e.message; 
        
        // Auto-Restart after 10 seconds
        setTimeout(startScraper, 10000);
    }
}
