const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const clientId = '1355683641950212167';
const guildId = '1170024768620277760'; // Замените на ID вашего сервера

const commands = [
    new SlashCommandBuilder()
        .setName('setfinancechannel')
        .setDescription('Установить текущий канал как канал для финансовой статистики')
        .setDefaultMemberPermissions('0'), // Только администраторы
];

const rest = new REST().setToken('MTM1NTY4MzY0MTk1MDIxMjE2Nw.GxUue5.T6Ex-3NWhNwK0z9YzJvcRbbXBAfQJWL4sQQO-8');

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
