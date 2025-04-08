const { Events, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isButton() && !interaction.isModalSubmit()) return;

        // Обработка кнопок склада
        if (interaction.isButton() && (interaction.customId === 'add_item' || interaction.customId === 'remove_item')) {
            const modal = new ModalBuilder()
                .setCustomId(`storage_${interaction.customId}`)
                .setTitle(interaction.customId === 'add_item' ? 'Добавить на склад' : 'Убрать со склада');

            // Поле для выбора типа предмета
            const typeInput = new TextInputBuilder()
                .setCustomId('type')
                .setLabel('Тип предмета (1-4)')
                .setPlaceholder('1 - Heavy Sniper Printed, 2 - Heavy Sniper Corp, 3 - Sniper Rifle Corp, 4 - Материалы')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // Поле для количества
            const amountInput = new TextInputBuilder()
                .setCustomId('amount')
                .setLabel('Количество')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // Поле для описания
            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Описание изменения')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const firstRow = new ActionRowBuilder().addComponents(typeInput);
            const secondRow = new ActionRowBuilder().addComponents(amountInput);
            const thirdRow = new ActionRowBuilder().addComponents(descriptionInput);

            modal.addComponents(firstRow, secondRow, thirdRow);
            await interaction.showModal(modal);
        }

        // Обработка отправки формы
        if (interaction.isModalSubmit() && interaction.customId.startsWith('storage_')) {
            const isAdding = interaction.customId === 'storage_add_item';
            const type = interaction.fields.getTextInputValue('type');
            const amount = interaction.fields.getTextInputValue('amount');
            const description = interaction.fields.getTextInputValue('description');

            // Получаем сообщение со складом
            const message = interaction.message;
            const embed = message.embeds[0];

            try {
                // Определяем тип предмета и эмодзи
                let typeName, fieldIndex, emoji;
                switch (type) {
                    case '1':
                        typeName = 'Heavy Sniper Printed';
                        fieldIndex = 0;
                        emoji = '🔫';
                        break;
                    case '2':
                        typeName = 'Heavy Sniper Corp';
                        fieldIndex = 1;
                        emoji = '🎯';
                        break;
                    case '3':
                        typeName = 'Sniper Rifle Corp';
                        fieldIndex = 2;
                        emoji = '🎪';
                        break;
                    case '4':
                        typeName = 'Материалы';
                        fieldIndex = 3;
                        emoji = '📦';
                        break;
                    default:
                        throw new Error('Неверный тип предмета');
                }

                // Получаем текущее значение
                const currentValue = parseInt(embed.fields[fieldIndex].value) || 0;
                const amountNum = parseInt(amount);

                // Вычисляем новое значение
                const before = currentValue.toString();
                const after = (isAdding ? currentValue + amountNum : currentValue - amountNum).toString();

                // Создаем новый эмбед
                const newEmbed = new EmbedBuilder()
                    .setTitle(embed.title)
                    .setColor(embed.color);

                // Копируем все поля
                embed.fields.forEach((field, index) => {
                    newEmbed.addFields({
                        name: field.name,
                        value: index === fieldIndex ? after : field.value,
                        inline: field.inline
                    });
                });

                // Обновляем сообщение
                await message.edit({ embeds: [newEmbed] });

                // Отправляем лог в ветку
                const thread = message.thread;
                if (thread) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle(`${emoji} Изменение в складе: ${typeName}`)
                        .setColor('#2b2d31')
                        .addFields(
                            { name: 'Было', value: before, inline: true },
                            { name: 'Стало', value: after, inline: true },
                            { name: 'Описание', value: description },
                            { name: 'Автор', value: `<@${interaction.user.id}>` }
                        )
                        .setTimestamp();

                    await thread.send({ embeds: [logEmbed] });
                }

                await interaction.reply({
                    content: 'Изменения сохранены!',
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error updating storage:', error);
                await interaction.reply({
                    content: 'Произошла ошибка при обновлении склада.',
                    ephemeral: true
                });
            }
        }
    }
};
