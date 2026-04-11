require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'services.json');
const ADMINS_FILE = path.join(__dirname, 'admins.json');

function loadData() {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function loadAdmins() {
    return JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8'));
}

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    ALTEGIO_API_KEY: process.env.ALTEGIO_API_KEY || '',
    ALTEGIO_URL: process.env.ALTEGIO_BOOKING_URL || 'https://n816358.alteg.io/company/766796/personal/menu?o=',
    ALTEGIO_LOCATION_ID: '766796',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
    GOOGLE_LOCATION_ID: process.env.GOOGLE_LOCATION_ID || '',
    data: loadData(),
    adminsData: loadAdmins(),
    ADMINS_FILE,
    DATA_FILE
};
