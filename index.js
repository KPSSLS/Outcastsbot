const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionsBitField, MessageFlags, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { addFinanceRecord, addStatsRecord } = require('./utils/baserow');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ]
});

// Константы
const APPLICATION_COOLDOWN = 30 * 60 * 1000; // 30 минут в миллисекундах

// Пути к файлам
const configPath = path.join(__dirname, 'config.json');
const statsPath = path.join(__dirname, 'stats.json');
const cooldownsPath = path.join(__dirname, 'cooldowns.json');

// Загрузка данных
let config = { 
    applicationChannelId: null, 
    acceptedRoleId: null,
    financeChannelId: null,
    financeMessageId: null
};
let stats = { 
    acceptedApplications: {},
    messageCount: {},
    rageActivity: {}, // Время в RAGE:MP в миллисекундах
    rageLastSeen: {}, // Время последнего обнаружения в игре
    voiceActivity: {}, // Время в голосовых каналах в миллисекундах
    voiceLastSeen: {} // Время последнего обнаружения в голосовом канале
};

// Инициализируем объекты статистики, если они не существуют
function initializeStats() {
    if (!stats.messageCount) stats.messageCount = {};
    if (!stats.rageActivity) stats.rageActivity = {};
    if (!stats.rageLastSeen) stats.rageLastSeen = {};
    if (!stats.voiceActivity) stats.voiceActivity = {};
    if (!stats.voiceLastSeen) stats.voiceLastSeen = {};
    if (!stats.acceptedApplications) stats.acceptedApplications = {};
}
let cooldowns = { applications: {} };

// Функция форматирования времени
function formatTime(ms) {
    const days = Math.floor(ms / (24 * 3600000));
    const hours = Math.floor((ms % (24 * 3600000)) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    
    const parts = [];
    if (days > 0) parts.push(`${days}д`);
    if (hours > 0) parts.push(`${hours}ч`);
    if (minutes > 0) parts.push(`${minutes}м`);
    
    return parts.length > 0 ? parts.join(' ') : '0м';
}

// Временные данные для отслеживания голосовых каналов
const voiceStates = new Map();

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
initializeStats();

// Функции для работы со статистикой
function updateVoiceTime(userId) {
    if (!stats.voiceTime[userId]) {
        stats.voiceTime[userId] = 0;
    }
    const state = voiceStates.get(userId);
    if (state) {
        const now = Date.now();
        stats.voiceTime[userId] += now - state.joinTime;
        state.joinTime = now;
        saveStats();
    }
}

function incrementMessageCount(userId) {
    if (!stats.messageCount[userId]) {
        stats.messageCount[userId] = 0;
    }
    stats.messageCount[userId]++;
    saveStats();
}

function updateRageActivity(userId) {
    if (!stats.rageActivity[userId]) {
        stats.rageActivity[userId] = 0;
    }
    stats.rageActivity[userId]++;
    saveStats();
}

// Обработчики событий
client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = oldState.member.user.id;
    const now = Date.now();

    // Пользователь присоединился к голосовому каналу
    if (!oldState.channelId && newState.channelId) {
        stats.voiceLastSeen[userId] = now;
        saveStats();
    }
    // Пользователь покинул голосовой канал
    else if (oldState.channelId && !newState.channelId) {
        if (stats.voiceLastSeen[userId]) {
            const timePassed = now - stats.voiceLastSeen[userId];
            stats.voiceActivity[userId] = (stats.voiceActivity[userId] || 0) + timePassed;
            delete stats.voiceLastSeen[userId];
            saveStats();
        }
    }
    // Пользователь переключился между каналами
    else if (oldState.channelId && newState.channelId) {
        if (stats.voiceLastSeen[userId]) {
            const timePassed = now - stats.voiceLastSeen[userId];
            stats.voiceActivity[userId] = (stats.voiceActivity[userId] || 0) + timePassed;
            stats.voiceLastSeen[userId] = now;
            saveStats();
        } else {
            stats.voiceLastSeen[userId] = now;
            saveStats();
        }
    }
});

client.on('messageCreate', (message) => {
    if (!message.author.bot) {
        incrementMessageCount(message.author.id);
    }
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
    const userId = newPresence.userId;
    const activities = newPresence.activities;

    // Проверяем наличие активности RAGE:MP
    const rageActivity = activities.find(activity => 
        activity.name.toLowerCase().includes('rage') || 
        activity.name.toLowerCase().includes('rage:mp') ||
        activity.name.toLowerCase().includes('gta:mp'));

    const now = Date.now();
    
    if (rageActivity) {
        // Если пользователь уже был в игре, обновляем время
        if (stats.rageLastSeen[userId]) {
            const timePassed = now - stats.rageLastSeen[userId];
            stats.rageActivity[userId] = (stats.rageActivity[userId] || 0) + timePassed;
        }
        stats.rageLastSeen[userId] = now;
        saveStats();
    } else if (stats.rageLastSeen[userId]) {
        // Если пользователь вышел из игры, засчитываем время
        const timePassed = now - stats.rageLastSeen[userId];
        stats.rageActivity[userId] = (stats.rageActivity[userId] || 0) + timePassed;
        delete stats.rageLastSeen[userId];
        saveStats();
    }
});

client.once('ready', async () => {
    try {
        console.log('Bot is ready!');
        
        // Регистрируем команды
        const rest = new REST({ version: '10' }).setToken(client.token);
        
        const slashCommands = [
            new SlashCommandBuilder()
                .setName('setfinancechannel')
                .setDescription('Установить текущий канал как канал для финансовой статистики')
                .setDefaultMemberPermissions('0')
        ];
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: slashCommands.map(command => command.toJSON()) }
        );
        
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error('Error during bot initialization:', error);
    }
});

// Функция форматирования времени
function formatTime(ms) {
    const days = Math.floor(ms / (24 * 3600000));
    const hours = Math.floor((ms % (24 * 3600000)) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    
    const parts = [];
    if (days > 0) parts.push(`${days}д`);
    if (hours > 0) parts.push(`${hours}ч`);
    if (minutes > 0) parts.push(`${minutes}м`);
    
    return parts.length > 0 ? parts.join(' ') : '0м';
}

client.once('ready', async () => {
    try {
        const appCommands = [
            new SlashCommandBuilder()
                .setName('заявка')
                .setDescription('Отправить форму заявки'),
            new SlashCommandBuilder()
                .setName('установитьканалзаявок')
                .setDescription('Установить канал для заявок')
                .addChannelOption(option =>
                    option.setName('канал')
                        .setDescription('Выберите канал')
                        .setRequired(true)),
            new SlashCommandBuilder()
                .setName('установитьрольпринятия')
                .setDescription('Установить роль для принятых участников')
                .addRoleOption(option =>
                    option.setName('роль')
                        .setDescription('Выберите роль')
                        .setRequired(true)),
            new SlashCommandBuilder()
                .setName('статистика')
                .setDescription('Показать статистику принятых заявок'),
            new SlashCommandBuilder()
                .setName('склад')
                .setDescription('Управление складом'),
            new SlashCommandBuilder()
                .setName('финансы')
                .setDescription('Заполнить финансовые данные')
        ].map(command => command.toJSON());

        const rest = new REST({ version: '10' }).setToken(client.token);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: appCommands }
        );
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
    // Обработка нажатия на кнопку
    if (interaction.isButton() && interaction.customId === 'finance_button') {
        const modal = new ModalBuilder()
            .setCustomId('financeModal')
            .setTitle('Финансовые данные');

        const accountNumberInput = new TextInputBuilder()
            .setCustomId('accountNumber')
            .setLabel('Номер счета')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const nicknameInput = new TextInputBuilder()
            .setCustomId('nickname')
            .setLabel('Никнейм')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(accountNumberInput);
        const secondActionRow = new ActionRowBuilder().addComponents(nicknameInput);

        modal.addComponents(firstActionRow, secondActionRow);

    // Обработка отправки модальной формы
    if (interaction.isModalSubmit() && interaction.customId === 'financeModal') {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const accountNumber = interaction.fields.getTextInputValue('accountNumber');
            const nickname = interaction.fields.getTextInputValue('nickname');

            await addFinanceRecord(accountNumber, nickname);
            await updateFinanceEmbed(interaction.guild);
            await interaction.followUp({
                content: 'Ваши данные успешно сохранены!',
                flags: MessageFlags.Ephemeral
            });
        } catch (commandError) {
            console.error('Error handling command:', commandError);
            try {
                await interaction.followUp({
                    content: 'Произошла ошибка при выполнении команды!',
                    flags: MessageFlags.Ephemeral
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
        return;
    }

    // ...

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('storage_modal_')) {
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
                case 'sniper_rifle_corp':
                    typeName = '🔴 Sniper Rifle Corp';
                    emoji = '🔴';
                    fieldIndex = 3;
                    break;                        
                case 'heavy_sniper_corp':
                    typeName = '🔴 Heavy Sniper Corp';
                    emoji = '🔴';
                    fieldIndex = 4;
                    break;                        
                case 'heavy_sniper_printed':
                    typeName = '🔴 Heavy Sniper Printed';
                    emoji = '🔴';
                    fieldIndex = 5;
                    break;
                case 'revolver_printed':
                    typeName = 'Revolver Printed';
                    emoji = '🔫';
                    fieldIndex = 6;
                    break;
                case 'carbine_rifle_corp':
                    typeName = 'Carbine Rifle Corp';
                    emoji = '🔫';
                    fieldIndex = 7;
                    break;
                case 'carbine_rifle_printed':
                    typeName = 'Carbine Rifle Printed';
                    emoji = '🔫';
                    fieldIndex = 8;
                    break;
                case 'special_carbine_corp':
                    typeName = 'Special Carbine Corp';
                    emoji = '🔫';
                    fieldIndex = 9;
                    break;
                case 'sniper_ammo':
                    typeName = '⚪ Sniper Ammo';
                    emoji = '⚪';
                    fieldIndex = 11;
                    break;
                case 'pistol_ammo':
                    typeName = '⚪ Pistol Ammo';
                    emoji = '⚪';
                    fieldIndex = 12;
                    break;
                case 'rifle_ammo':
                    typeName = '⚪ Rifle Ammo';
                    emoji = '⚪';
                    fieldIndex = 13;
                    break;
            }

            console.log('Message ID:', interaction.message.id);

            const before = interaction.fields.getTextInputValue('before');
            const after = interaction.fields.getTextInputValue('after');
            const description = interaction.fields.getTextInputValue('description');

            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                // Получаем сообщение напрямую из канала
                const message = await interaction.channel.messages.fetch(messageId);
                if (!message) {
                    await interaction.reply({
                        content: 'Не удалось найти сообщение склада. Пожалуйста, создайте новое.',

                    case 'setfinancechannel':
                        try {
                            // Проверка прав администратора
                            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                                await interaction.reply({
                                    content: 'У вас нет прав для использования этой команды!',
                                    flags: MessageFlags.Ephemeral
                                });
                                return;
                            }
                            config.financeChannelId = interaction.channelId;
                            saveConfig();
                            await interaction.reply({
                                content: 'Канал для финансов успешно установлен!',
                                flags: MessageFlags.Ephemeral
                            });
                        } catch (error) {
                            console.error('Error setting finance channel:', error);
                            await interaction.reply({
                                content: 'Произошла ошибка при установке канала!',
                                flags: MessageFlags.Ephemeral
                            });
                        }
                        break;
                }

                // Устанавливаем канал для финансов
                config.financeChannelId = interaction.channelId;
                config.financeMessageId = null; // Сбрасываем ID сообщения
                saveConfig();

                await interaction.reply({
                    content: 'Канал для финансов успешно установлен!',
                    flags: MessageFlags.Ephemeral
                });

                // Создаем новое эмбед-сообщение
                const financeEmbed = new EmbedBuilder()
                    .setTitle('Финансовая статистика')
                    .setColor('#2b2d31')
                    .setDescription('Здесь будет отображаться финансовая статистика');

                await interaction.channel.send({ embeds: [financeEmbed] });
            } catch (error) {
                console.error('Error handling command:', error);
                try {
                    await interaction.followUp({
                        content: 'Произошла ошибка при выполнении команды!',
                        flags: MessageFlags.Ephemeral
                    });
                } catch (replyError) {
                    console.error('Error sending error message:', replyError);
                }
            }
        } else if (interaction.isButton() && interaction.customId === 'finance_button') {
            const modal = new ModalBuilder()
                .setCustomId('financeModal')
                .setTitle('Финансовые данные');

            const accountNumberInput = new TextInputBuilder()
                .setCustomId('accountNumber')
                .setLabel('Номер счета')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const nicknameInput = new TextInputBuilder()
                .setCustomId('nickname')
                .setLabel('Никнейм')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(accountNumberInput);
            const secondActionRow = new ActionRowBuilder().addComponents(nicknameInput);

            modal.addComponents(firstActionRow, secondActionRow);

            await interaction.showModal(modal);
        } else if (interaction.isModalSubmit() && interaction.customId === 'financeModal') {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const accountNumber = interaction.fields.getTextInputValue('accountNumber');
                const nickname = interaction.fields.getTextInputValue('nickname');

                await addFinanceRecord(accountNumber, nickname);
                await updateFinanceEmbed(interaction.guild);
                await interaction.followUp({
                    content: 'Ваши данные успешно сохранены!',
                    flags: MessageFlags.Ephemeral
                });
            } catch (commandError) {
                console.error('Error handling command:', commandError);
                try {
                    await interaction.followUp({
                        content: 'Произошла ошибка при выполнении команды!',
                        flags: MessageFlags.Ephemeral
                    });
                } catch (replyError) {
                    console.error('Error sending error message:', replyError);
                }
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('storage_modal_')) {
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
                    case 'sniper_rifle_corp':
                        typeName = '🔴 Sniper Rifle Corp';
                        emoji = '🔴';
                        fieldIndex = 3;
                        break;                        
                    case 'heavy_sniper_corp':
                        typeName = '🔴 Heavy Sniper Corp';
                        emoji = '🔴';
                        fieldIndex = 4;
                        break;                        
                    case 'heavy_sniper_printed':
                        typeName = '🔴 Heavy Sniper Printed';
                        emoji = '🔴';
                        fieldIndex = 5;
                        break;
                    case 'revolver_printed':
                        typeName = 'Revolver Printed';
                        emoji = '🔫';
                        fieldIndex = 6;
                        break;
                    case 'carbine_rifle_corp':
                        typeName = 'Carbine Rifle Corp';
                        emoji = '🔫';
                        fieldIndex = 7;
                        break;
                    case 'carbine_rifle_printed':
                        typeName = 'Carbine Rifle Printed';
                        emoji = '🔫';
                        fieldIndex = 8;
                        break;
                    case 'special_carbine_corp':
                        typeName = 'Special Carbine Corp';
                        emoji = '🔫';
                        fieldIndex = 9;
                        break;
                    case 'sniper_ammo':
                        typeName = '⚪ Sniper Ammo';
                        emoji = '⚪';
                        fieldIndex = 11;
                        break;
                    case 'pistol_ammo':
                        typeName = '⚪ Pistol Ammo';
                        emoji = '⚪';
                        fieldIndex = 12;
                        break;
                    case 'rifle_ammo':
                        typeName = '⚪ Rifle Ammo';
                        emoji = '⚪';
                        fieldIndex = 13;
                        break;
                }

                console.log('Message ID:', interaction.message.id);

                const before = interaction.fields.getTextInputValue('before');
                const after = interaction.fields.getTextInputValue('after');
                const description = interaction.fields.getTextInputValue('description');

                try {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    // Получаем сообщение напрямую из канала
                    const message = await interaction.channel.messages.fetch(messageId);
                    if (!message) {
                        await interaction.reply({
                            content: 'Не удалось найти сообщение склада. Пожалуйста, создайте новое.',
                            flags: MessageFlags.Ephemeral
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
                    
                    await interaction.deferReply();
                    // Отправляем статистику принятых заявок в Baserow
                    try {
                        const acceptedStats = stats.acceptedApplications || {};
                        for (const [userId, count] of Object.entries(acceptedStats)) {
                            await addStatsRecord(userId, count);
                        }
                    } catch (error) {
                        console.error('Error:', error);
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
                            flags: MessageFlags.Ephemeral
                        });
                    } catch (error) {
                        console.error('Error updating storage:', error);
                        await interaction.reply({
                            content: 'Произошла ошибка при обновлении склада.',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        try {
            // Check if the error is an Unknown Interaction error
            if (error.code === 10062) {
                // Interaction token has expired, we can't respond anymore
                console.log('Interaction expired, unable to respond');
                return;
            }
            
            // Try to respond with error message
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: 'Произошла ошибка!', flags: MessageFlags.Ephemeral }).catch(console.error);
            } else {
                await interaction.reply({ content: 'Произошла ошибка!', flags: MessageFlags.Ephemeral }).catch(console.error);
            }
        } catch (e) {
            console.error('Failed to send error response:', e);
        }
    }
});

// ...
                    }
                    break;
                }

                // Устанавливаем канал для финансов
                config.financeChannelId = interaction.channelId;
                config.financeMessageId = null; // Сбрасываем ID сообщения
                saveConfig();

                await interaction.reply({
                    content: 'Канал для финансов успешно установлен!',
                    flags: MessageFlags.Ephemeral
                });

                // Создаем новое эмбед-сообщение
                await updateFinanceEmbed(interaction.guild);
                break;

            default:
                await interaction.reply({
                    content: 'Неизвестная команда!',
                    flags: MessageFlags.Ephemeral
                });
        }
    } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        const errorMessage = 'Произошла ошибка при выполнении команды!';
        
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (e) {
            console.error('Failed to send error response:', e);
        }
    }
});

// Функция для создания и обновления эмбед-сообщения с финансами
async function updateFinanceEmbed(guild) {
    if (!config.financeChannelId) return;

    const channel = await guild.channels.fetch(config.financeChannelId);
    if (!channel) return;

    try {
        const records = await getFinanceRecords();
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Финансовая статистика')
            .setColor('#2b2d31')
            .setTimestamp();

        // Группируем записи по никнейму
        const groupedRecords = records.reduce((acc, record) => {
            const nickname = record['Никнейм'];
            if (!acc[nickname]) {
                acc[nickname] = [];
            }
            acc[nickname].push(record);
            return acc;
        }, {});

        // Создаем поля для каждого игрока
        Object.entries(groupedRecords).forEach(([nickname, records]) => {
            const totalAmount = records.reduce((sum, record) => sum + parseFloat(record['Номер счета']), 0);
            embed.addFields({
                name: nickname,
                value: `Всего: ${totalAmount.toFixed(2)}$\nПоследний платеж: ${records[records.length - 1]['Номер счета']}$`,
                inline: true
            });
        });

        if (config.financeMessageId) {
            try {
                const message = await channel.messages.fetch(config.financeMessageId);
                await message.edit({ embeds: [embed] });
            } catch (error) {
                // Если сообщение не найдено, создаем новое
                const message = await channel.send({ embeds: [embed] });
                config.financeMessageId = message.id;
                saveConfig();
            }
        } else {
            const message = await channel.send({ embeds: [embed] });
            config.financeMessageId = message.id;
            saveConfig();
        }
    } catch (error) {
        console.error('Error updating finance embed:', error);
    }
}

client.login('MTM1NTY4MzY0MTk1MDIxMjE2Nw.GxUue5.T6Ex-3NWhNwK0z9YzJvcRbbXBAfQJWL4sQQO-8');
