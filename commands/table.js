const { SlashCommandBuilder } = require('discord.js');
const { addToSheet } = require('../utils/sheets');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('table')
        .setDescription('Открыть форму для заполнения банковского счета'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Заполнение банковского счета')
            .setDescription('Нажмите на кнопку ниже, чтобы заполнить форму')
            .setColor('#0099ff');

        const button = new ButtonBuilder()
            .setCustomId('open_form')
            .setLabel('Заполнить форму')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
    }
};
