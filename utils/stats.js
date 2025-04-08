const fs = require('fs');
const path = require('path');
const paths = require('../config/paths');

let stats = {};

function initializeStats() {
    if (!stats.messageCount) stats.messageCount = {};
    if (!stats.rageActivity) stats.rageActivity = {};
    if (!stats.rageLastSeen) stats.rageLastSeen = {};
    if (!stats.voiceActivity) stats.voiceActivity = {};
    if (!stats.voiceLastSeen) stats.voiceLastSeen = {};
    if (!stats.acceptedApplications) stats.acceptedApplications = {};
}

function loadStats() {
    try {
        if (fs.existsSync(paths.statsPath)) {
            const data = JSON.parse(fs.readFileSync(paths.statsPath));
            stats = { ...stats, ...data };
        }
        initializeStats(); // Инициализируем отсутствующие поля
    } catch (error) {
        console.error('Error loading stats:', error);
        initializeStats(); // Инициализируем поля при ошибке
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
    saveStats,
    initializeStats
};
