const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('склад')
        .setDescription('Управление складом'),

    async execute(interaction) {
        // Создаем эмбед для склада
        const storageEmbed = new EmbedBuilder()
            .setTitle('Склад')
            .setColor('#2b2d31')
            .addFields(
                { name: 'Heavy Sniper Printed', value: '0', inline: true },
                { name: 'Heavy Sniper Corp', value: '0', inline: true },
                { name: 'Sniper Rifle Corp', value: '0', inline: true },
                { name: 'Материалы', value: '0', inline: true }
            );

        // Создаем кнопки для управления
        const addButton = new ButtonBuilder()
            .setCustomId('add_item')
            .setLabel('Добавить')
            .setStyle(ButtonStyle.Success);

        const removeButton = new ButtonBuilder()
            .setCustomId('remove_item')
            .setLabel('Убрать')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(addButton, removeButton);

        // Отправляем сообщение
        const message = await interaction.reply({
            embeds: [storageEmbed],
            components: [row],
            fetchReply: true
        });

        // Создаем ветку для логов
        await message.startThread({
            name: 'Логи',
            type: ChannelType.PublicThread
        });
    }
};
