const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());

// GLOBAL VARIABLE TO STORE LATEST MATCH
let liveData = {
    status: "Starting...",
    match: "Waiting for data...",
    home_team: "",
    away_team: "",
    last_updated: "Never"
};

// THE SCRAPER FUNCTION
async function runScraper() {
    console.log("Launching Browser...");
    
    // Launch Chrome with settings optimized for Cloud Servers
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--single-process", 
            "--no-zygote"
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
    });

    const page = await browser.newPage();

    // Block images to save speed and data
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if(['image', 'stylesheet', 'font'].includes(req.resourceType())){
            req.abort();
        } else {
            req.continue();
        }
    });

    console.log("Going to BetPawa...");
    
    try {
        // We use the Ghanaian site. It might redirect, but the scraper handles it.
        await page.goto('https://www.betpawa.com.gh/virtual-sports', {
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // Loop forever: Check for matches every 5 seconds
        setInterval(async () => {
            try {
                // READ THE PAGE
                const result = await page.evaluate(() => {
                    // This selector looks for the team names. 
                    // BetPawa structure changes, but this is the most common class.
                    const teams = document.querySelectorAll('.virtual-match-team');
                    
                    if (teams && teams.length >= 2) {
                        return {
                            home: teams[0].innerText,
                            away: teams[1].innerText
                        };
                    }
                    return null;
                });

                if (result) {
                    liveData = {
                        status: "Live",
                        match: `${result.home} vs ${result.away}`,
                        home_team: result.home,
                        away_team: result.away,
                        last_updated: new Date().toLocaleTimeString()
                    };
                    console.log(`Updated: ${liveData.match}`);
                } else {
                    console.log("Scanning... No matches found yet.");
                }

            } catch (err) {
                console.log("Scrape Error:", err.message);
            }
        }, 5000); // 5000ms = 5 seconds

    } catch (e) {
        console.log("Browser Crash:", e.message);
        browser.close();
    }
}

// Start the Scraper
runScraper();

// API ENDPOINT: This is what your phone app will talk to
app.get('/', (req, res) => {
    res.json(liveData);
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
