const { Events } = require('discord.js');
const { loadStats } = require('../utils/stats');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log('Bot is ready!');
        
        // Загружаем статистику при запуске
        loadStats();

        // Регистрируем команды
        try {
            const commands = [];
            client.commands.forEach(command => {
                commands.push(command.data.toJSON());
            });

            await client.application.commands.set(commands);
            console.log('Successfully registered application commands.');
        } catch (error) {
            console.error('Error registering application commands:', error);
        }
    },
};
