const fs = require('fs');
const path = require('path');


let stats = {
    messageCount: {},
    rageActivity: {},
    rageLastSeen: {},
    voiceActivity: {},
    voiceLastSeen: {},
    acceptedApplications: {}
};

function loadStats() {
    try {
        if (fs.existsSync(paths.statsPath)) {
            const data = JSON.parse(fs.readFileSync(paths.statsPath));
            stats = { ...stats, ...data };
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        saveStats(); // Create the file if it doesn't exist
    }
}

function saveStats() {
    try {
        fs.writeFileSync(paths.statsPath, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.error('Error saving stats:', error);
    }
}

function getStats() {
    return stats;
}

module.exports = {
    getStats,
    loadStats,
    saveStats
};
