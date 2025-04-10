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
        await interaction.showModal(modal);
        return;
    }

    // Обработка отправки модальной формы
    if (interaction.isModalSubmit() && interaction.customId === 'financeModal') {
        try {
            const accountNumber = interaction.fields.getTextInputValue('accountNumber');
            const nickname = interaction.fields.getTextInputValue('nickname');

            await addFinanceRecord(accountNumber, nickname);
            await updateFinanceEmbed(interaction.guild);
            await interaction.reply({
                content: 'Ваши данные успешно сохранены!',
                ephemeral: true
            });
        } catch (error) {
            console.error('Ошибка при сохранении данных:', error);
            await interaction.reply({
                content: 'Произошла ошибка при сохранении данных.',
                ephemeral: true
            });
        }
        return;
    }

    try {
        if (interaction.isCommand()) {
            switch (interaction.commandName) {
                case 'финансы':
                    const financeButton = new ButtonBuilder()
                        .setCustomId('finance_button')
                        .setLabel('Заполнить данные')
                        .setStyle(ButtonStyle.Primary);

                    const financeRow = new ActionRowBuilder()
                        .addComponents(financeButton);

                    await interaction.reply({
                        content: 'Форма для заполнения финансовых данных:',
                        components: [financeRow],
                        ephemeral: false
                    });
                    break;
                case 'статистика':
                    // Собираем все виды статистики
                    const messageStats = Object.entries(stats.messageCount || {})
                        .sort(([, a], [, b]) => b - a)
                        .map(([userId, count]) => 
                            `<@${userId}> - ${count} сообщений`
                        );

                    // Отправляем статистику принятых заявок в Baserow
                    try {
                        const acceptedStats = stats.acceptedApplications || {};
                        for (const [userId, count] of Object.entries(acceptedStats)) {
                            await addStatsRecord(userId, count);
                        }
                    } catch (error) {
                        console.error('Ошибка при отправке статистики в Baserow:', error);
                    }

                    // Обновляем время для тех, кто сейчас в игре или в голосовом канале
                    const now = Date.now();
                    
                    // Обновляем время RAGE:MP
                    for (const [userId, lastSeen] of Object.entries(stats.rageLastSeen || {})) {
                        const timePassed = now - lastSeen;
                        stats.rageActivity[userId] = (stats.rageActivity[userId] || 0) + timePassed;
                        stats.rageLastSeen[userId] = now;
                    }

                    // Обновляем время в голосовых каналах
                    for (const [userId, lastSeen] of Object.entries(stats.voiceLastSeen || {})) {
                        const timePassed = now - lastSeen;
                        stats.voiceActivity[userId] = (stats.voiceActivity[userId] || 0) + timePassed;
                        stats.voiceLastSeen[userId] = now;
                    }

                    const voiceStats = Object.entries(stats.voiceActivity || {})
                        .sort(([, a], [, b]) => b - a)
                        .map(([userId, time]) => 
                            `<@${userId}> - ${formatTime(time)}`
                        );

                    const rageStats = Object.entries(stats.rageActivity || {})
                        .sort(([, a], [, b]) => b - a)
                        .map(([userId, time]) => 
                            `<@${userId}> - ${formatTime(time)}`
                        );

                    const acceptedStats = Object.entries(stats.acceptedApplications || {})
                        .sort(([, a], [, b]) => b - a)
                        .map(([userId, count]) => 
                            `<@${userId}> - ${count} принятых заявок`
                        );

                    // Создаем эмбеды для каждой категории
                    const messageEmbed = new EmbedBuilder()
                        .setTitle('💬 Статистика сообщений')
                        .setColor('#2b2d31')
                        .setDescription(messageStats.join('\n') || 'Пока нет данных');

                    const voiceEmbed = new EmbedBuilder()
                        .setTitle('🎤 Статистика времени в голосовых каналах')
                        .setColor('#2b2d31')
                        .setDescription(voiceStats.join('\n') || 'Пока нет данных');

                    const rageEmbed = new EmbedBuilder()
                        .setTitle('🎮 Статистика времени в RAGE:MP')
                        .setColor('#2b2d31')
                        .setDescription(rageStats.join('\n') || 'Пока нет данных');

                    const acceptedEmbed = new EmbedBuilder()
                        .setTitle('📈 Статистика принятых заявок')
                        .setColor('#2b2d31')
                        .setDescription(acceptedStats.join('\n') || 'Пока нет данных');

                    // Отправляем все эмбеды в одном сообщении
                    await interaction.reply({ embeds: [messageEmbed, voiceEmbed, rageEmbed, acceptedEmbed] });
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
                    await interaction.reply({ content: 'Форма для подачи заявки отправлена!', flags: MessageFlags.Ephemeral });
                    break;

                case 'установитьканалзаявок':
                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                        return await interaction.reply({ content: 'У вас нет прав для использования этой команды!', flags: MessageFlags.Ephemeral });
                    }
                    config.applicationChannelId = interaction.options.getChannel('канал').id;
                    saveConfig();
                    await interaction.reply({ content: 'Канал для заявок успешно установлен!', flags: MessageFlags.Ephemeral });
                    break;

                case 'установитьрольпринятия':
                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                        return await interaction.reply({ content: 'У вас нет прав для использования этой команды!', flags: MessageFlags.Ephemeral });
                    }
                    config.acceptedRoleId = interaction.options.getRole('роль').id;
                    saveConfig();
                    await interaction.reply({ content: 'Роль для принятых участников успешно установлена!', flags: MessageFlags.Ephemeral });
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
                            { name: 'Revolver Printed', value: '0', inline: true },
                            { name: 'Carbine Rifle Corp', value: '0', inline: true },
                            { name: 'Carbine Rifle Printed', value: '0', inline: true },
                            { name: 'Special Carbine Corp', value: '0', inline: true },
                            { name: '\u200B', value: '**⚪ Патроны:**', inline: false },
                            { name: '⚪ Sniper Ammo', value: '0', inline: true },
                            { name: '⚪ Pistol Ammo', value: '0', inline: true },
                            { name: '⚪ Rifle Ammo', value: '0', inline: true }
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
                            },
                            {
                                label: 'Sniper Ammo',
                                value: 'sniper_ammo',
                                emoji: '⚪'
                            },
                            {
                                label: 'Pistol Ammo',
                                value: 'pistol_ammo',
                                emoji: '⚪'
                            },
                            {
                                label: 'Rifle Ammo',
                                value: 'rifle_ammo',
                                emoji: '⚪'
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
                        flags: MessageFlags.Ephemeral
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
                        flags: MessageFlags.Ephemeral
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
                        flags: MessageFlags.Ephemeral
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
                            await interaction.reply({ content: 'Роль для принятых участников не установлена!', flags: MessageFlags.Ephemeral });
                            return;
                        }

                        const member = await interaction.guild.members.fetch(userId);
                        
                        // Получаем никнейм из сообщения заявки и очищаем его от бэктиков
                        const nickname = interaction.message.embeds[0].fields.find(f => f.name.includes('Игровой ник'))?.value
                            .replace(/```/g, '').trim();
                        
                        if (nickname) {
                            try {
                                // Проверяем права бота перед изменением никнейма
                                const botMember = await interaction.guild.members.fetchMe();
                                if (botMember.roles.highest.position > member.roles.highest.position && 
                                    interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
                                    await member.setNickname(nickname);
                                } else {
                                    console.log(`Недостаточно прав для изменения никнейма пользователя ${member.user.tag}`);
                                }
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

                    await interaction.reply({ content: 'Решение по заявке принято!', flags: MessageFlags.Ephemeral });
                } catch (error) {
                    console.error('Error handling application decision:', error);
                    await interaction.reply({ content: 'Произошла ошибка при обработке решения!', flags: MessageFlags.Ephemeral });
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

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'application_modal') {
                if (!config.applicationChannelId) {
                    await interaction.reply({
                        content: 'Канал для заявок не настроен! Обратитесь к администратору.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const nickname = interaction.fields.getTextInputValue('nickname');
                const age = interaction.fields.getTextInputValue('age');
                const about = interaction.fields.getTextInputValue('about');
                const activity = interaction.fields.getTextInputValue('activity');

                const applicationEmbed = new EmbedBuilder()
                    .setTitle('🎮 ЗАЯВКА В ФАМУ')
                    .setDescription('Новая заявка на рассмотрение')
                    .setColor('#2b2d31')
                    .addFields(
                        { 
                            name: '👤 Игровой ник и статик',
                            value: `\`\`\`${nickname}\`\`\``,
                            inline: false 
                        },
                        { 
                            name: '📝 О себе', 
                            value: `\`\`\`${about}\`\`\``,
                            inline: false 
                        },
                        {
                            name: '📅 Возраст',
                            value: `\`\`\`${age}\`\`\``,
                            inline: true
                        },
                        {
                            name: '⌚ Активность',
                            value: `\`\`\`${activity}\`\`\``,
                            inline: true
                        },
                        {
                            name: '🎮 Discord',
                            value: `<@${interaction.user.id}>`,
                            inline: false
                        }
                    )
                    .setTimestamp();

                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`accept_${interaction.user.id}`)
                            .setLabel('Принять')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`reject_${interaction.user.id}`)
                            .setLabel('Отклонить')
                            .setStyle(ButtonStyle.Danger)
                    );

                const channel = await client.channels.fetch(config.applicationChannelId);
                await channel.send({
                    embeds: [applicationEmbed],
                    components: [actionRow]
                });

                // Устанавливаем кулдаун
                setCooldown(interaction.user.id);

                await interaction.reply({
                    content: 'Ваша заявка успешно отправлена! Пожалуйста, ожидайте ответа от администрации.',
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.customId.startsWith('storage_modal_')) {
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

        // ... остальной код ...
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

// Обработчик команд
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    try {
        switch (commandName) {
            case 'setfinancechannel':
                // Проверка прав администратора
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    await interaction.reply({
                        content: 'У вас нет прав для использования этой команды!',
                        ephemeral: true
                    });
                    return;
                }

                // Устанавливаем канал для финансов
                config.financeChannelId = interaction.channelId;
                config.financeMessageId = null; // Сбрасываем ID сообщения
                saveConfig();

                await interaction.reply({
                    content: 'Канал для финансов успешно установлен!',
                    ephemeral: true
                });

                // Создаем новое эмбед-сообщение
                await updateFinanceEmbed(interaction.guild);
                break;

            default:
                await interaction.reply({
                    content: 'Неизвестная команда!',
                    ephemeral: true
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
