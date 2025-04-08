const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { config } = require('../config/config');
const { stats, saveStats } = require('../utils/stats');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('accept')
        .setDescription('Принять заявку')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Пользователь для принятия')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(targetUser.id);

        if (!config.acceptedRoleId) {
            return interaction.reply({
                content: 'Роль для принятых участников не настроена. Используйте команду /setup',
                ephemeral: true
            });
        }

        try {
            // Добавляем роль
            await member.roles.add(config.acceptedRoleId);

            // Обновляем статистику
            if (!stats.acceptedApplications[targetUser.id]) {
                stats.acceptedApplications[targetUser.id] = {
                    acceptedAt: new Date().toISOString(),
                    acceptedBy: interaction.user.id
                };
                saveStats();
            }

            await interaction.reply({
                content: `Пользователь ${targetUser.tag} успешно принят!`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error accepting application:', error);
            await interaction.reply({
                content: 'Произошла ошибка при принятии пользователя.',
                ephemeral: true
            });
        }
    }
};
