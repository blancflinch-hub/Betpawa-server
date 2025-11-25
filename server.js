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
    last_updated: "Never"
};

// 2. START SERVER FIRST (Fixes the Boot Loop)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server is ALIVE on port ${PORT}`);
    startScraper(); 
});

// API ENDPOINT
app.get('/', (req, res) => {
    res.json(liveData);
});

// 3. BACKGROUND SCRAPER
async function startScraper() {
    try {
        console.log("🚀 Launching Browser...");
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
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
        });

        const page = await browser.newPage();

        // Block heavy assets
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['image', 'stylesheet', 'font'].includes(req.resourceType())){
                req.abort();
            } else {
                req.continue();
            }
        });

        // Go to BetPawa
        await page.goto('https://www.betpawa.com.gh/virtual-sports', {
            waitUntil: 'domcontentloaded',
            timeout: 0 
        });
        console.log("✅ Connected to BetPawa!");

        // The Loop
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
                        last_updated: new Date().toLocaleTimeString()
                    };
                    console.log(`Game: ${liveData.match}`);
                }
            } catch (err) {
                // Ignore glitch errors
            }
        }, 5000);

    } catch (e) {
        console.log("❌ Error:", e.message);
        liveData.status = "Restarting Scraper...";
    }
            }
