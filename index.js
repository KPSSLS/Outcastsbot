const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, StringSelectMenuBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// Константы
const APPLICATION_COOLDOWN = 30 * 60 * 1000; // 30 минут в миллисекундах

// Пути к файлам
const configPath = path.join(__dirname, 'config.json');
const statsPath = path.join(__dirname, 'stats.json');
const cooldownsPath = path.join(__dirname, 'cooldowns.json');

// Загрузка данных
let config = { applicationChannelId: null, acceptedRoleId: null };
let stats = { acceptedApplications: {} };
let cooldowns = { applications: {} };

// Функции загрузки и сохранения данных
function loadConfig() {
    try {
        const data = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(data);
        console.log('Configuration loaded successfully');
    } catch (error) {
        console.error('Error loading configuration:', error);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
        console.log('Configuration saved successfully');
    } catch (error) {
        console.error('Error saving configuration:', error);
    }
}

function loadStats() {
    try {
        const data = fs.readFileSync(statsPath, 'utf8');
        stats = JSON.parse(data);
        console.log('Statistics loaded successfully');
    } catch (error) {
        console.error('Error loading statistics:', error);
        // Если файл не существует, создаем его
        saveStats();
    }
}

function saveStats() {
    try {
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 4));
        console.log('Statistics saved successfully');
    } catch (error) {
        console.error('Error saving statistics:', error);
    }
}

function loadCooldowns() {
    try {
        const data = fs.readFileSync(cooldownsPath, 'utf8');
        cooldowns = JSON.parse(data);
        console.log('Cooldowns loaded successfully');
    } catch (error) {
        console.error('Error loading cooldowns:', error);
        saveCooldowns();
    }
}

function saveCooldowns() {
    try {
        fs.writeFileSync(cooldownsPath, JSON.stringify(cooldowns, null, 4));
        console.log('Cooldowns saved successfully');
    } catch (error) {
        console.error('Error saving cooldowns:', error);
    }
}

function incrementAcceptedApplications(userId) {
    if (!stats.acceptedApplications[userId]) {
        stats.acceptedApplications[userId] = 0;
    }
    stats.acceptedApplications[userId]++;
    saveStats();
}

function formatTimeLeft(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}м ${seconds}с`;
}

function checkCooldown(userId) {
    const lastApplication = cooldowns.applications[userId];
    if (!lastApplication) return null;

    const now = Date.now();
    const timePassed = now - lastApplication;
    if (timePassed < APPLICATION_COOLDOWN) {
        return APPLICATION_COOLDOWN - timePassed;
    }
    return null;
}

function setCooldown(userId) {
    cooldowns.applications[userId] = Date.now();
    saveCooldowns();
}

// Загружаем все данные при запуске
loadConfig();
loadStats();
loadCooldowns();

client.once('ready', async () => {
    console.log('Bot is ready!');
    
    const commands = [
        {
            name: 'заявка',
            description: 'Отправить форму заявки'
        },
        {
            name: 'установитьканалзаявок',
            description: 'Установить канал для заявок',
            options: [
                {
                    name: 'канал',
                    description: 'Выберите канал',
                    type: 7,
                    required: true
                }
            ]
        },
        {
            name: 'установитьрольпринятия',
            description: 'Установить роль для принятых участников',
            options: [
                {
                    name: 'роль',
                    description: 'Выберите роль',
                    type: 8,
                    required: true
                }
            ]
        },
        {
            name: 'статистика',
            description: 'Показать статистику принятых заявок'
        },
        {
            name: 'склад',
            description: 'Управление складом'
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
});

// Глобальная карта для хранения активных страниц статистики
const activeStatistics = new Map();

// Добавляем кэш для хранения сообщений
const storageMessages = new Map();

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isCommand()) {
            switch (interaction.commandName) {
                case 'статистика':
                    const sortedStats = Object.entries(stats.acceptedApplications)
                        .sort(([, a], [, b]) => b - a);
                    
                    if (sortedStats.length === 0) {
                        await interaction.reply({
                            content: 'Статистика пуста. Пока никто не принимал заявки.',
                            ephemeral: true
                        });
                        return;
                    }

                    const pages = [];
                    for (let i = 0; i < sortedStats.length; i += 10) {
                        const pageStats = sortedStats.slice(i, i + 10);
                        const embed = new EmbedBuilder()
                            .setTitle('📊 Статистика принятых заявок')
                            .setColor('#2b2d31')
                            .setDescription(
                                await Promise.all(pageStats.map(async ([userId, count], index) => {
                                    try {
                                        const user = await client.users.fetch(userId);
                                        return `${i + index + 1}. ${user.tag}: \`${count}\` принятых заявок`;
                                    } catch {
                                        return `${i + index + 1}. Неизвестный пользователь: \`${count}\` принятых заявок`;
                                    }
                                })).then(lines => lines.join('\n'))
                            )
                            .setFooter({ text: `Страница ${Math.floor(i / 10) + 1}/${Math.ceil(sortedStats.length / 10)}` });
                        pages.push(embed);
                    }

                    const uniqueId = Date.now().toString();
                    activeStatistics.set(uniqueId, { pages, currentPage: 0 });

                    const navigationRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`prev_${uniqueId}`)
                                .setLabel('◀')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId(`next_${uniqueId}`)
                                .setLabel('▶')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(pages.length <= 1)
                        );

                    await interaction.reply({
                        embeds: [pages[0]],
                        components: [navigationRow]
                    });
                    break;

                case 'заявка':
                    const embed = new EmbedBuilder()
                        .setTitle('Подача заявки')
                        .setDescription('Здесь Вы можете подать заявку\nПосле заполнения анкеты с вами свяжутся рекруты, которые работают с вашей заявкой')
                        .setImage('https://media.discordapp.net/attachments/1355673237320892436/1355682076380237894/zXxz.png')
                        .setColor('#2f3136');

                    const button = new ButtonBuilder()
                        .setCustomId('submit_application')
                        .setLabel('Подать заявку')
                        .setStyle(ButtonStyle.Primary);

                    const row = new ActionRowBuilder().addComponents(button);

                    // Отправляем сообщение в тот же канал, где была использована команда
                    await interaction.channel.send({ embeds: [embed], components: [row] });
                    // Скрытое подтверждение для пользователя
                    await interaction.reply({ content: 'Форма для подачи заявки отправлена!', ephemeral: true });
                    break;

                case 'установитьканалзаявок':
                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                        return await interaction.reply({ content: 'У вас нет прав для использования этой команды!', ephemeral: true });
                    }
                    config.applicationChannelId = interaction.options.getChannel('канал').id;
                    saveConfig();
                    await interaction.reply({ content: 'Канал для заявок успешно установлен!', ephemeral: true });
                    break;

                case 'установитьрольпринятия':
                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                        return await interaction.reply({ content: 'У вас нет прав для использования этой команды!', ephemeral: true });
                    }
                    config.acceptedRoleId = interaction.options.getRole('роль').id;
                    saveConfig();
                    await interaction.reply({ content: 'Роль для принятых участников успешно установлена!', ephemeral: true });
                    break;

                case 'склад':
                    const storageEmbed = new EmbedBuilder()
                        .setTitle('📦 Склад')
                        .setColor('#2b2d31')
                        .addFields(
                            { name: '🛠️ Материалы', value: '0', inline: true },
                            { name: '💰 Деньги', value: '0', inline: true },
                            { name: '\u200B', value: '**🔫 Оружие:**', inline: false },
                            { name: '🔴 Sniper Rifle Corp', value: '0', inline: true },
                            { name: '🔴 Heavy Sniper Corp', value: '0', inline: true },
                            { name: '🔴 Heavy Sniper Printed', value: '0', inline: true },
                            { name: 'Assault Rifle Printed', value: '0', inline: true },
                            { name: 'Bullpup Rifle Corp', value: '0', inline: true },
                            { name: 'Pumpshotgun Corp', value: '0', inline: true },
                            { name: 'Revolver Printed', value: '0', inline: true },
                            { name: 'Carbine Rifle Corp', value: '0', inline: true },
                            { name: 'Carbine Rifle Printed', value: '0', inline: true },
                            { name: 'Special Carbine Corp', value: '0', inline: true }
                        );

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('storage_select')
                        .setPlaceholder('Выберите категорию')
                        .addOptions([
                            {
                                label: 'Материалы',
                                value: 'materials',
                                emoji: '🛠️'
                            },
                            {
                                label: 'Деньги',
                                value: 'money',
                                emoji: '💰'
                            },
                            {
                                label: 'Sniper Rifle Corp',
                                value: 'sniper_rifle_corp',
                                emoji: '🔴'
                            },
                            {
                                label: 'Heavy Sniper Corp',
                                value: 'heavy_sniper_corp',
                                emoji: '🔴'
                            },
                            {
                                label: 'Heavy Sniper Printed',
                                value: 'heavy_sniper_printed',
                                emoji: '🔴'
                            },
                            {
                                label: 'Assault Rifle Printed',
                                value: 'assault_rifle_printed',
                                emoji: '🔫'
                            },
                            {
                                label: 'Bullpup Rifle Corp',
                                value: 'bullpup_rifle_corp',
                                emoji: '🔫'
                            },
                            {
                                label: 'Pumpshotgun Corp',
                                value: 'pumpshotgun_corp',
                                emoji: '🔫'
                            },
                            {
                                label: 'Revolver Printed',
                                value: 'revolver_printed',
                                emoji: '🔫'
                            },
                            {
                                label: 'Carbine Rifle Corp',
                                value: 'carbine_rifle_corp',
                                emoji: '🔫'
                            },
                            {
                                label: 'Carbine Rifle Printed',
                                value: 'carbine_rifle_printed',
                                emoji: '🔫'
                            },
                            {
                                label: 'Special Carbine Corp',
                                value: 'special_carbine_corp',
                                emoji: '🔫'
                            }
                        ]);

                    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

                    // Отправляем сообщение напрямую в канал
                    const message = await interaction.channel.send({
                        embeds: [storageEmbed],
                        components: [selectRow]
                    });

                    // Сохраняем сообщение в кэше
                    storageMessages.set(message.id, message);

                    // Отправляем скрытое подтверждение для слеш-команды
                    await interaction.reply({
                        content: 'Сообщение склада создано!',
                        ephemeral: true
                    });
                    break;
            }
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'submit_application') {
                // Проверяем кулдаун
                const timeLeft = checkCooldown(interaction.user.id);
                if (timeLeft) {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('⏳ Подождите')
                                .setDescription(`Вы сможете подать новую заявку через \`${formatTimeLeft(timeLeft)}\``)
                                .setColor('#f04747')
                        ],
                        ephemeral: true
                    });
                    return;
                }

                const modal = new ModalBuilder()
                    .setCustomId('application_modal')
                    .setTitle('Заявка на вступление');

                const nicknameInput = new TextInputBuilder()
                    .setCustomId('nickname')
                    .setLabel('Игровой ник и статик')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const ageInput = new TextInputBuilder()
                    .setCustomId('age')
                    .setLabel('Возраст')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const aboutInput = new TextInputBuilder()
                    .setCustomId('about')
                    .setLabel('О себе')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const activityInput = new TextInputBuilder()
                    .setCustomId('activity')
                    .setLabel('Активность')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const modalRows = [
                    new ActionRowBuilder().addComponents(nicknameInput),
                    new ActionRowBuilder().addComponents(ageInput),
                    new ActionRowBuilder().addComponents(aboutInput),
                    new ActionRowBuilder().addComponents(activityInput)
                ];

                modal.addComponents(...modalRows);
                await interaction.showModal(modal);
            } else if (interaction.customId.startsWith('prev_') || interaction.customId.startsWith('next_')) {
                const [action, id] = interaction.customId.split('_');
                const stats = activeStatistics.get(id);
                
                if (!stats) {
                    await interaction.reply({
                        content: 'Эта статистика устарела. Пожалуйста, используйте команду `/статистика` снова.',
                        ephemeral: true
                    });
                    return;
                }

                if (action === 'next') {
                    stats.currentPage = Math.min(stats.currentPage + 1, stats.pages.length - 1);
                } else {
                    stats.currentPage = Math.max(stats.currentPage - 1, 0);
                }

                const navigationRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`prev_${id}`)
                            .setLabel('◀')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(stats.currentPage === 0),
                        new ButtonBuilder()
                            .setCustomId(`next_${id}`)
                            .setLabel('▶')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(stats.currentPage === stats.pages.length - 1)
                    );

                await interaction.update({
                    embeds: [stats.pages[stats.currentPage]],
                    components: [navigationRow]
                });
            } else if (interaction.customId.startsWith('accept_') || interaction.customId.startsWith('reject_')) {
                const userId = interaction.customId.split('_')[1];
                const user = await client.users.fetch(userId);
                const isAccept = interaction.customId.startsWith('accept_');

                try {
                    if (isAccept) {
                        if (!config.acceptedRoleId) {
                            await interaction.reply({ content: 'Роль для принятых участников не установлена!', ephemeral: true });
                            return;
                        }

                        const member = await interaction.guild.members.fetch(userId);
                        
                        // Получаем никнейм из сообщения заявки и очищаем его от бэктиков
                        const nickname = interaction.message.embeds[0].fields.find(f => f.name.includes('Игровой ник'))?.value
                            .replace(/```/g, '').trim();
                        
                        if (nickname) {
                            try {
                                await member.setNickname(nickname);
                            } catch (error) {
                                console.error('Error setting nickname:', error);
                            }
                        }

                        await member.roles.add(config.acceptedRoleId);
                        
                        // Обновляем эмбед, добавляя информацию о принятии
                        const originalEmbed = interaction.message.embeds[0];
                        const updatedEmbed = EmbedBuilder.from(originalEmbed)
                            .setColor('#43b581')  // Зеленый цвет для принятых заявок
                            .addFields({ 
                                name: '\u200b', 
                                value: `Принято модератором \`${interaction.user.tag}\``, 
                                inline: false 
                            });
                        
                        // Отключаем кнопки
                        const disabledRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('accept_disabled')
                                    .setLabel('Принято')
                                    .setStyle(ButtonStyle.Success)
                                    .setDisabled(true)
                            );

                        await interaction.message.edit({ embeds: [updatedEmbed], components: [disabledRow] });
                        await user.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('💠 ЗАЯВКА В ФАМУ')
                                    .setDescription('```diff\n+ Ваша заявка была одобрена!\n```')
                                    .setColor('#43b581')
                            ]
                        });
                        incrementAcceptedApplications(interaction.user.id);
                    } else {
                        // Обновляем эмбед, добавляя информацию об отказе
                        const originalEmbed = interaction.message.embeds[0];
                        const updatedEmbed = EmbedBuilder.from(originalEmbed)
                            .setColor('#f04747')  // Красный цвет для отклоненных заявок
                            .addFields({ 
                                name: '\u200B', 
                                value: `Отклонено модератором \`${interaction.user.tag}\``, 
                                inline: false 
                            });
                        
                        // Отключаем кнопки
                        const disabledRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('reject_disabled')
                                    .setLabel('Отклонено')
                                    .setStyle(ButtonStyle.Danger)
                                    .setDisabled(true)
                            );

                        await interaction.message.edit({ embeds: [updatedEmbed], components: [disabledRow] });
                        await user.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('💠 ЗАЯВКА В ФАМУ')
                                    .setDescription('```diff\n- Ваша заявка была отклонена\n```\nПопробуйте подать заявку позже.')
                                    .setColor('#f04747')
                            ]
                        });
                    }

                    await interaction.reply({ content: 'Решение по заявке принято!', ephemeral: true });
                } catch (error) {
                    console.error('Error handling application decision:', error);
                    await interaction.reply({ content: 'Произошла ошибка при обработке решения!', ephemeral: true });
                }
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'storage_select') {
                // Сохраняем сообщение в кэше при взаимодействии
                storageMessages.set(interaction.message.id, interaction.message);

                const type = interaction.values[0];
                let typeName;
                let emoji;
                let fieldIndex;

                switch(type) {
                    case 'materials':
                        typeName = 'Материалы';
                        emoji = '🛠️';
                        fieldIndex = 0;
                        break;
                    case 'money':
                        typeName = 'Деньги';
                        emoji = '💰';
                        fieldIndex = 1;
                        break;
                    case 'assault_rifle_printed':
                        typeName = 'Assault Rifle Printed';
                        emoji = '🔫';
                        fieldIndex = 3;
                        break;
                    case 'bullpup_rifle_corp':
                        typeName = 'Bullpup Rifle Corp';
                        emoji = '🔫';
                        fieldIndex = 4;
                        break;
                    case 'carbine_rifle_corp':
                        typeName = 'Carbine Rifle Corp';
                        emoji = '🔫';
                        fieldIndex = 5;
                        break;
                    case 'sniper_rifle_corp':
                        typeName = '🔴 Sniper Rifle Corp';
                        emoji = '🔴';
                        fieldIndex = 6;
                        break;
                    case 'heavy_sniper_corp':
                        typeName = '🔴 Heavy Sniper Corp';
                        emoji = '🔴';
                        fieldIndex = 7;
                        break;
                    case 'heavy_sniper_printed':
                        typeName = '🔴 Heavy Sniper Printed';
                        emoji = '🔴';
                        fieldIndex = 8;
                        break;
                    case 'pumpshotgun_corp':
                        typeName = 'Pumpshotgun Corp';
                        emoji = '🔫';
                        fieldIndex = 9;
                        break;
                    case 'revolver_printed':
                        typeName = 'Revolver Printed';
                        emoji = '🔫';
                        fieldIndex = 10;
                        break;
                    case 'carbine_rifle_printed':
                        typeName = 'Carbine Rifle Printed';
                        emoji = '🔫';
                        fieldIndex = 11;
                        break;
                    case 'special_carbine_corp':
                        typeName = 'Special Carbine Corp';
                        emoji = '🔫';
                        fieldIndex = 12;
                        break;
                }

                console.log('Message ID:', interaction.message.id);

                const modal = new ModalBuilder()
                    .setCustomId(`storage_modal_${type}_${interaction.message.id}`)
                    .setTitle(`${emoji} ${typeName}`);

                const beforeInput = new TextInputBuilder()
                    .setCustomId('before')
                    .setLabel('Сколько было')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const afterInput = new TextInputBuilder()
                    .setCustomId('after')
                    .setLabel('Сколько стало')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const descriptionInput = new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('Описание')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const modalRows = [
                    new ActionRowBuilder().addComponents(beforeInput),
                    new ActionRowBuilder().addComponents(afterInput),
                    new ActionRowBuilder().addComponents(descriptionInput)
                ];

                modal.addComponents(...modalRows);
                await interaction.showModal(modal);
            }
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('storage_modal_')) {
            // Получаем messageId из последней части customId
            const parts = interaction.customId.split('_');
            const messageId = parts[parts.length - 1];
            // Получаем тип, объединяя все части между storage_modal_ и messageId
            const type = parts.slice(2, -1).join('_');

            console.log('Modal submit - Message ID:', messageId, 'Type:', type);

            let typeName;
            let emoji;
            let fieldIndex;

            switch(type) {
                case 'materials':
                    typeName = 'Материалы';
                    emoji = '🛠️';
                    fieldIndex = 0;
                    break;
                case 'money':
                    typeName = 'Деньги';
                    emoji = '💰';
                    fieldIndex = 1;
                    break;
                case 'assault_rifle_printed':
                    typeName = 'Assault Rifle Printed';
                    emoji = '🔫';
                    fieldIndex = 3;
                    break;
                case 'bullpup_rifle_corp':
                    typeName = 'Bullpup Rifle Corp';
                    emoji = '🔫';
                    fieldIndex = 4;
                    break;
                case 'carbine_rifle_corp':
                    typeName = 'Carbine Rifle Corp';
                    emoji = '🔫';
                    fieldIndex = 5;
                    break;
                case 'sniper_rifle_corp':
                    typeName = '🔴 Sniper Rifle Corp';
                    emoji = '🔴';
                    fieldIndex = 6;
                    break;
                case 'heavy_sniper_corp':
                    typeName = '🔴 Heavy Sniper Corp';
                    emoji = '🔴';
                    fieldIndex = 7;
                    break;
                case 'heavy_sniper_printed':
                    typeName = '🔴 Heavy Sniper Printed';
                    emoji = '🔴';
                    fieldIndex = 8;
                    break;
                case 'pumpshotgun_corp':
                    typeName = 'Pumpshotgun Corp';
                    emoji = '🔫';
                    fieldIndex = 9;
                    break;
                case 'revolver_printed':
                    typeName = 'Revolver Printed';
                    emoji = '🔫';
                    fieldIndex = 10;
                    break;
                case 'carbine_rifle_printed':
                    typeName = 'Carbine Rifle Printed';
                    emoji = '🔫';
                    fieldIndex = 11;
                    break;
                case 'special_carbine_corp':
                    typeName = 'Special Carbine Corp';
                    emoji = '🔫';
                    fieldIndex = 12;
                    break;
            }

            const before = interaction.fields.getTextInputValue('before');
            const after = interaction.fields.getTextInputValue('after');
            const description = interaction.fields.getTextInputValue('description');

            try {
                // Получаем сообщение напрямую из канала
                const message = await interaction.channel.messages.fetch(messageId);
                if (!message) {
                    await interaction.reply({
                        content: 'Не удалось найти сообщение склада. Пожалуйста, создайте новое.',
                        ephemeral: true
                    });
                    return;
                }

                // Создаем новый эмбед на основе старого
                const newEmbed = new EmbedBuilder()
                    .setTitle(message.embeds[0].title)
                    .setColor(message.embeds[0].color);

                // Копируем все поля из старого эмбеда с сохранением цветов
                const fields = message.embeds[0].fields.map(field => ({
                    name: field.name,
                    value: field.value,
                    inline: field.inline,
                    nameColor: ['Heavy Sniper Printed', 'Heavy Sniper Corp', 'Sniper Rifle Corp'].includes(field.name) ? '#ff0000' : undefined
                }));
                
                // Обновляем нужное поле
                fields[fieldIndex].value = after;
                
                // Добавляем все поля в новый эмбед
                newEmbed.addFields(fields);

                // Обновляем сообщение
                await message.edit({
                    embeds: [newEmbed]
                });

                // Отправляем лог в ветку
                const threadName = 'Логи';
                let thread = message.thread;
                
                // Если ветки нет у сообщения, создаем её
                if (!thread) {
                    thread = await message.startThread({
                        name: threadName,
                        type: ChannelType.PublicThread
                    });
                }

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

                await thread.send({
                    embeds: [logEmbed]
                });

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

        // ... остальной код ...
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: 'Произошла ошибка!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'Произошла ошибка!', ephemeral: true });
        }
    }
});

client.login('token here');
