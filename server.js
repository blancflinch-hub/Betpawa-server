const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());

// 1. DATA STORE (Keeps the app alive even if scraper fails)
let liveData = {
    status: "Initializing...",
    match: "Waiting for sync...",
    home_team: "Loading...",
    away_team: "Loading...",
    last_updated: "Never"
};

// 2. THE TRICK: Start the Server FIRST (Before launching Chrome)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server is ALIVE on port ${PORT}`);
    // Only launch the heavy browser AFTER the server is running
    startScraper(); 
});

// API ENDPOINT
app.get('/', (req, res) => {
    res.json(liveData);
});

// 3. THE HEAVY LIFTING (Background Scraper)
async function startScraper() {
    try {
        console.log("🚀 Launching Background Browser...");
        
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--single-process", 
                "--disable-gpu"
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
        });

        const page = await browser.newPage();

        // Speed Optimization: Block Images/Fonts
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())){
                req.abort();
            } else {
                req.continue();
            }
        });

        // Go to BetPawa (Allowing generous timeout)
        console.log("Navigating to BetPawa...");
        await page.goto('https://www.betpawa.com.gh/virtual-sports', {
            waitUntil: 'domcontentloaded',
            timeout: 0 
        });

        console.log("✅ Browser Connected! Watching for matches...");

        // The Loop
        setInterval(async () => {
            try {
                const data = await page.evaluate(() => {
                    // Generic selector for virtual teams
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
                        last_updated: new Date().toLocaleTimeString()
                    };
                    console.log(`Game Found: ${liveData.match}`);
                }
            } catch (err) {
                // Ignore small errors, just keep loop running
            }
        }, 5000);

    } catch (e) {
        console.log("❌ Browser Error:", e.message);
        // Important: Do not exit process, keep the server API alive
        liveData.status = "Scraper Restarting...";
    }
}
