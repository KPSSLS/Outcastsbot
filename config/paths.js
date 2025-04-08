const path = require('path');

// Define root directory
const rootDir = path.join(__dirname, '..');

// Export all paths
module.exports = {
    configPath: path.join(rootDir, 'config.json'),
    statsPath: path.join(rootDir, 'stats.json'),
    cooldownsPath: path.join(rootDir, 'cooldowns.json'),
    credentialsPath: path.join(rootDir, 'credentials.json')
};
