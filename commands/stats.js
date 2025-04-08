const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { stats } = require('../utils/stats');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Посмотреть статистику')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Пользователь для просмотра статистики')
                .setRequired(true)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const userId = targetUser.id;

        // Собираем статистику
        const messageCount = stats.messageCount[userId] || 0;
        const voiceTime = stats.voiceActivity[userId] || 0;
        const rageTime = stats.rageActivity[userId] || 0;

        // Форматируем время
        const formatTime = (ms) => {
            const hours = Math.floor(ms / (1000 * 60 * 60));
            const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
            return `${hours}ч ${minutes}м`;
        };

        // Создаем эмбед
        const embed = new EmbedBuilder()
            .setTitle(`Статистика ${targetUser.tag}`)
            .setColor('#0099ff')
            .addFields(
                { name: 'Сообщений', value: messageCount.toString(), inline: true },
                { name: 'Время в голосовых каналах', value: formatTime(voiceTime), inline: true },
                { name: 'Время в RAGE:MP', value: formatTime(rageTime), inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
