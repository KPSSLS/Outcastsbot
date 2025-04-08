const fs = require('fs');
const path = require('path');

const statsPath = path.join(__dirname, '..', 'stats.json');
const cooldownsPath = path.join(__dirname, '..', 'cooldowns.json');

let stats = {
    acceptedApplications: {},
    messageCount: {},
    rageActivity: {}, // Время в RAGE:MP в миллисекундах
    rageLastSeen: {}, // Время последнего обнаружения в игре
    voiceActivity: {}, // Время в голосовых каналах в миллисекундах
    voiceLastSeen: {} // Время последнего обнаружения в голосовом канале
};

function loadStats() {
    try {
        if (fs.existsSync(statsPath)) {
            stats = JSON.parse(fs.readFileSync(statsPath));
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function saveStats() {
    try {
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.error('Error saving stats:', error);
    }
}

module.exports = {
    stats,
    loadStats,
    saveStats
};
