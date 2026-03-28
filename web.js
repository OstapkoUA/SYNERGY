const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('SYNERGY Bot running!'));
app.get('/health', (req, res) => res.send('OK'));

app.listen(port, () => {
    console.log(`Web server running on port ${port}`);
});

// Start the bot
require('./bot');
