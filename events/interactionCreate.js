const { Events } = require('discord.js');
const { addToSheet } = require('../utils/sheets');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Обрабатываем только нужные типы взаимодействий
        if (!interaction.isCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

        console.log('Interaction received:', interaction.type, interaction.commandName);

        // Если это команда
        if (interaction.isCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error('Error executing command:', error);
                await interaction.reply({
                    content: 'Произошла ошибка при выполнении команды!',
                    ephemeral: true
                });
            }
        }

        // Если это кнопка открытия формы
        if (interaction.isButton() && interaction.customId === 'open_form') {
            const modal = new ModalBuilder()
                .setCustomId('bank_form')
                .setTitle('Форма банковского счета');

            const accountInput = new TextInputBuilder()
                .setCustomId('account')
                .setLabel('Введите номер банковского счета')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(accountInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
        }

        // Если это отправка формы
        if (interaction.isModalSubmit() && interaction.customId === 'bank_form') {
            const account = interaction.fields.getTextInputValue('account');
            const username = interaction.user.tag;

            const success = await addToSheet(username, account);

            if (success) {
                await interaction.reply({
                    content: 'Ваши данные успешно сохранены!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'Произошла ошибка при сохранении данных. Пожалуйста, попробуйте позже.',
                    ephemeral: true
                });
            }
        }
    },
};
