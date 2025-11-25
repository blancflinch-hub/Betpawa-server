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

// 2. START SERVER IMMEDIATELY
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server is ALIVE on port ${PORT}`);
    startScraper(); 
});

app.get('/', (req, res) => {
    res.json(liveData);
});

// 3. STEALTH SCRAPER (Mobile Mode)
async function startScraper() {
    try {
        console.log("🚀 Launching Stealth Browser...");
        
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

        // TRICK: Pretend to be an iPhone to get the lightweight mobile site
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 375, height: 667 });

        // BLOCK IMAGES & FONTS (Speed Boost)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())){
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log("Navigating to BetPawa...");
        // Use the generic virtuals URL, it redirects to the correct country automatically
        await page.goto('https://www.betpawa.com.gh/virtual-sports', {
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        console.log("✅ Connected! Scanning for teams...");

        setInterval(async () => {
            try {
                // Try 3 different ways to find team names (BetPawa changes code often)
                const data = await page.evaluate(() => {
                    // Strategy 1: Standard Virtual Class
                    let teams = document.querySelectorAll('.virtual-match-team');
                    
                    // Strategy 2: If Mobile site uses different class
                    if (teams.length < 2) {
                        teams = document.querySelectorAll('.match-teams');
                    }
                    
                    // Strategy 3: Look for team-like text in the active match container
                    if (teams.length < 2) {
                        // Advanced: Find the "VS" text and look around it
                        const vsElement = Array.from(document.querySelectorAll('div, span')).find(el => el.innerText === 'v' || el.innerText === 'VS');
                        if (vsElement && vsElement.parentElement) {
                            return { 
                                home: vsElement.previousElementSibling?.innerText || "Scanning...", 
                                away: vsElement.nextElementSibling?.innerText || "Scanning..." 
                            };
                        }
                    }

                    if (teams && teams.length >= 2) {
                        return { home: teams[0].innerText, away: teams[1].innerText };
                    }
                    return null;
                });

                if (data && data.home !== "Scanning...") {
                    liveData = {
                        status: "Live",
                        match: `${data.home} vs ${data.away}`,
                        home_team: data.home,
                        away_team: data.away,
                        last_updated: new Date().toLocaleTimeString()
                    };
                    console.log(`Updated: ${liveData.match}`);
                }
            } catch (err) {
                // Keep silent on small errors
            }
        }, 3000); // Check every 3 seconds

    } catch (e) {
        console.log("❌ Browser Error:", e.message);
        liveData.status = "Restarting Scraper...";
        // If it crashes, wait 10 seconds and try again (Self-Healing)
        setTimeout(startScraper, 10000);
    }
}
