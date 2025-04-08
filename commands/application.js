const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { config } = require('../config/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('application')
        .setDescription('Подать заявку на вступление'),

    async execute(interaction) {
        // Проверяем, настроен ли канал для заявок
        if (!config.applicationChannelId) {
            return interaction.reply({
                content: 'Канал для заявок еще не настроен. Попросите администратора настроить его с помощью команды /setup',
                ephemeral: true
            });
        }

        const applicationChannel = interaction.guild.channels.cache.get(config.applicationChannelId);
        if (!applicationChannel) {
            return interaction.reply({
                content: 'Канал для заявок не найден. Попросите администратора настроить его заново.',
                ephemeral: true
            });
        }

        // Создаем эмбед с заявкой
        const embed = new EmbedBuilder()
            .setTitle('Новая заявка на вступление')
            .setDescription(`От пользователя ${interaction.user.tag}`)
            .setColor('#00ff00')
            .setTimestamp();

        await applicationChannel.send({ embeds: [embed] });
        await interaction.reply({
            content: 'Ваша заявка успешно отправлена!',
            ephemeral: true
        });
    }
};
