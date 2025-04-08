const fs = require('fs');
const paths = require('../config/paths');

let cooldowns = {};

function loadCooldowns() {
    try {
        if (fs.existsSync(paths.cooldownsPath)) {
            cooldowns = JSON.parse(fs.readFileSync(paths.cooldownsPath));
        }
    } catch (error) {
        console.error('Error loading cooldowns:', error);
        saveCooldowns(); // Create the file if it doesn't exist
    }
}

function saveCooldowns() {
    try {
        fs.writeFileSync(paths.cooldownsPath, JSON.stringify(cooldowns, null, 2));
    } catch (error) {
        console.error('Error saving cooldowns:', error);
    }
}

function getCooldowns() {
    return cooldowns;
}

module.exports = {
    getCooldowns,
    loadCooldowns,
    saveCooldowns
};
