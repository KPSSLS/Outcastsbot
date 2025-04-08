const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { config, saveConfig } = require('../config/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Настроить канал для заявок')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Канал для заявок')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Роль для принятых заявок')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');

        // Сохраняем настройки
        config.applicationChannelId = channel.id;
        config.acceptedRoleId = role.id;
        saveConfig();

        await interaction.reply({
            content: `Настройки успешно сохранены!\nКанал для заявок: ${channel}\nРоль для принятых: ${role}`,
            ephemeral: true
        });
    }
};
