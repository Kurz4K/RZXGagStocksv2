// server.js
// credits @sinontop | Channel: @mksln

// requirements
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fetch from 'node-fetch';
 
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const deepEqual = require('deep-equal');
const TelegramBot = require('node-telegram-bot-api');

// config
const PORT = process.env.PORT || 3000;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_MS, 10) || 60000;
const STOCK_API_URL = process.env.STOCK_API_URL;
const BOT_CONFIG_PATH = path.join(__dirname, 'bot_configs.json');

// validation
if (!STOCK_API_URL) { console.error("CRITICAL: STOCK_API_URL missing."); process.exit(1); }

// state (bot)
let activeBots = [];
let previousStockData = {};
let botCheckIntervalId = null;

// load (configs)
function loadBotConfigurationsFromFile() {
    try {
        if (fs.existsSync(BOT_CONFIG_PATH)) return JSON.parse(fs.readFileSync(BOT_CONFIG_PATH, 'utf-8')) || [];
        fs.writeFileSync(BOT_CONFIG_PATH, JSON.stringify([], null, 4)); return [];
    } catch (e) { console.error('Bot Config Read/Parse Error:', e); return []; }
}
// save (configs)
function saveBotConfigurationsToFile(c) { try { fs.writeFileSync(BOT_CONFIG_PATH, JSON.stringify(c, null, 4)); return true; } catch (e) { console.error('Bot Config Write Error:', e); return false; } }

// initialize (bots)
function initializeOrReinitializeBots() {
    console.log("Bot: Re/Initializing instances...");
    if (botCheckIntervalId) clearInterval(botCheckIntervalId);
    activeBots = []; const cfgs = loadBotConfigurationsFromFile();
    cfgs.forEach(c => {
        if (c.enabled && c.token && c.channelIds && Array.isArray(c.channelIds) && c.channelIds.length > 0) {
            try { activeBots.push({ id: c.id, botInstance: new TelegramBot(c.token), channelIds: c.channelIds }); console.log(`Bot: Initialized "${c.id}"`); }
            catch (e) { console.error(`Bot: Failed init for "${c.id}": ${e.message}`); }
        } else if (c.enabled) { console.warn(`Bot: Config for "${c.id}" enabled but invalid (missing token/channels or channels not array).`);}
    });
    if (activeBots.length > 0) {
        console.log(`Bot: ${activeBots.length} active. Starting checks.`);
        if (Object.keys(previousStockData).length === 0) fetchBotStockData().then(d => { if (d) previousStockData = d; checkForBotUpdates(); botCheckIntervalId = setInterval(checkForBotUpdates, CHECK_INTERVAL); });
        else { checkForBotUpdates(); botCheckIntervalId = setInterval(checkForBotUpdates, CHECK_INTERVAL); }
    } else console.warn("Bot: No active configs. Checks stopped.");
}

// fetch (stock)
async function fetchBotStockData() {
    try { const r = await fetch(STOCK_API_URL); if (!r.ok) { console.error(`Bot API Error: ${r.status}`); return null; } return await r.json(); }
    catch (e) { console.error('Bot Fetch error:', e.message); return null; }
}

// format
function formatConsolidatedBotMessage(updates) {
    if (updates.length === 0) return null;
    let msg = "Grow A Garden - Stock Update!\n\n";
    msg += "The following categories have been refreshed:\n\n";
    updates.forEach(u => {
        const categoryName = u.categoryData.name.replace(/ STOCK$/i, '');
        const countdownFormatted = u.categoryData.countdown.formatted;
        msg += `--- ${categoryName} ---\nNext Update: ${countdownFormatted}\n`; // No backticks
        if (u.categoryData.items && u.categoryData.items.length > 0) {
            u.categoryData.items.slice(0, 5).forEach(i => {
                const itemName = i.name;
                const itemQuantity = i.quantity;
                msg += `  - ${itemName} (x${itemQuantity})\n`; // Using dash for list
            });
            if (u.categoryData.items.length > 5) msg += `  ...and ${u.categoryData.items.length - 5} more items.\n`;
        } else msg += "  No items listed for this update.\n";
        msg += "\n";
    });
    msg += `----\nChannel: @mksln`; return msg;
}

// broadcast
async function broadcastToActiveBots(content) {
    for (const bot of activeBots) for (const id of bot.channelIds) {
        try {
            // Send as plain text by omitting parse_mode or setting it to null/undefined
            await bot.botInstance.sendMessage(id, content); // REMOVED parse_mode option
            console.log(`Bot: Sent via "${bot.id}" to ${id}`);
        }
        catch (e) { console.error(`Bot: Send fail via "${bot.id}" to ${id}:`, e.message); if (e.response && e.response.body) console.error('Bot TG API error:', JSON.stringify(e.response.body)); }
        await new Promise(r => setTimeout(r, 300)); // delay
    }
}

// check (updates)
async function checkForBotUpdates() {
    if (activeBots.length === 0) return;
    const current = await fetchBotStockData(); if (!current) return;
    if (Object.keys(previousStockData).length === 0) { previousStockData = current; return; }
    const changed = [];
    for (const k in current) if (current.hasOwnProperty(k)) {
        const curCat = current[k]; const prevCat = previousStockData[k]; let c = false;
        if (!prevCat) c = true;
        else if (curCat.countdown && prevCat.countdown && curCat.countdown.formatted !== prevCat.countdown.formatted) c = true;
        else if (!deepEqual(curCat.items, prevCat.items) && !(curCat.countdown && prevCat.countdown && curCat.countdown.formatted !== prevCat.countdown.formatted)) c = true;
        if (c) changed.push({ categoryKey: k, categoryData: curCat });
    }
    if (changed.length > 0) { console.log(`Bot: ${changed.length} updates.`); const msg = formatConsolidatedBotMessage(changed); if (msg) await broadcastToActiveBots(msg); }
    previousStockData = current;
}

// server
const app = express(); app.use(express.json()); app.use(express.static(path.join(__dirname, 'public')));
// route (pages)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/bot-admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bot-admin.html')));
app.get('/add-my-bot', (req, res) => res.sendFile(path.join(__dirname, 'public', 'add-my-bot.html')));

// api (proxy)
app.get('/api/v1/stock', async (req, res) => {
    try {
        const r = await fetch(STOCK_API_URL); if (!r.ok) { let b = 'Upstream API fail'; try { b = (await r.json()).message || JSON.stringify(await r.json()); } catch(e){} return res.status(r.status).json({ error: 'Upstream fail.', details:b, upstreamStatus:r.status }); }
        res.json(await r.json());
    } catch (e) { console.error('API Proxy error:', e); res.status(500).json({ error: 'Proxy Internal Server Error.' }); }
});
const response = await fetch(process.env.STOCK_API_URL);
const data = await response.json();

console.log("📦 Raw stock API data:", JSON.stringify(data, null, 2));

const now = new Date();

const formatSection = (key, label) => {
  const sectionData = data[key] || [];

  return {
    name: label,
    last_updated: now.toISOString(),
    countdown: {
      formatted: "00h 00m 00s", // ✅ Required by frontend
      hours: 0,
      minutes: 0,
      seconds: 0,
      total_seconds: 0
    },
    items: sectionData.map(item => ({
      name: item.name,
      quantity: item.value // Map "value" to "quantity"
    }))
  };
};

const formatted = {
  cosmetics_stock: formatSection("cosmetic", "COSMETICS STOCK"),
  egg_stock: formatSection("egg", "EGG STOCK"),
  gear_stock: formatSection("gear", "GEAR STOCK"),
  honey_stock: formatSection("honey", "HONEY STOCK"),
  seeds_stock: formatSection("seed", "SEEDS STOCK"),
  night_stock: formatSection("night", "NIGHT STOCK"),
  easter_stock: formatSection("easter", "EASTER STOCK")
};

console.log("✅ Final formatted stock response:", JSON.stringify(formatted, null, 2));

res.json(formatted);

// api (get configs)
app.get('/api/bot-configs', (req, res) => res.json(loadBotConfigurationsFromFile().map(c=>({id:c.id,token:c.token?`${c.token.substring(0,8)}...`:'N/A',channelIds:c.channelIds,enabled:c.enabled}))));
// api (post config)
app.post('/api/bot-configs', (req, res) => {
    const n = req.body; if (!n || !n.id || !n.token || !n.channelIds || !Array.isArray(n.channelIds)) return res.status(400).json({ message: 'Invalid data. ID, token, and channelIds array required.' });
    let c = loadBotConfigurationsFromFile(); const i = c.findIndex(x => x.id === n.id);
    const newEntry = { id: n.id, token: n.token, channelIds: n.channelIds, enabled: typeof n.enabled === 'boolean' ? n.enabled : true };
    if (i > -1) c[i] = newEntry; else c.push(newEntry);
    if (saveBotConfigurationsToFile(c)) { initializeOrReinitializeBots(); res.status(200).json({ message: `Config "${n.id}" saved.` }); }
    else res.status(500).json({ message: 'Save failed.' });
});
// api (delete config)
app.delete('/api/bot-configs/:id', (req, res) => {
    const id = req.params.id; let c = loadBotConfigurationsFromFile(); const l = c.length; c = c.filter(x => x.id !== id);
    if (c.length === l) return res.status(404).json({ message: `Config "${id}" not found.` });
    if (saveBotConfigurationsToFile(c)) { initializeOrReinitializeBots(); res.status(200).json({ message: `Config "${id}" deleted.` }); }
    else res.status(500).json({ message: 'Save failed post-delete.' });
});

// listen
app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`); console.log(`API: http://localhost:${PORT}/api/v1/stock`);
    console.log(`User Bot Add: http://localhost:${PORT}/add-my-bot`); console.log(`Admin Bot Manage: http://localhost:${PORT}/bot-admin`);
    console.log(`Credits: @sinontop | Channel: @mksln`);
    initializeOrReinitializeBots();
});
