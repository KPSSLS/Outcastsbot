const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'config.json');

let config = {
    applicationChannelId: null,
    acceptedRoleId: null
};

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath));
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving config:', error);
    }
}

module.exports = {
    config,
    loadConfig,
    saveConfig
};
