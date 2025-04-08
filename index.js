const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ChannelType } = require('discord.js');
const { config, loadConfig } = require('./config/config');
const { getStats, loadStats, saveStats, initializeStats } = require('./utils/stats');
const { getCooldowns, loadCooldowns, saveCooldowns } = require('./utils/cooldowns');
const { addToSheet } = require('./utils/sheets');
const paths = require('./config/paths');

// Загружаем конфигурацию и данные
loadConfig();
loadStats();
loadCooldowns();

// Получаем загруженные данные
let stats = getStats();
let cooldowns = getCooldowns();

// Initialize client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

// Загружаем команды
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// Загружаем события
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Временные данные для отслеживания голосовых каналов
const voiceStates = new Map();

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

// Регистрация слэш-команд
// Функция для регистрации команд
async function deployCommands() {
    const rest = new REST().setToken('MTM1NTY4MzY0MTk1MDIxMjE2Nw.GxUue5.T6Ex-3NWhNwK0z9YzJvcRbbXBAfQJWL4sQQO-8');

    const commands = [
        new SlashCommandBuilder()
            .setName('table')
            .setDescription('Открыть форму для заполнения банковского счета'),
        
        new SlashCommandBuilder()
            .setName('application')
            .setDescription('Подать заявку на вступление'),

        new SlashCommandBuilder()
            .setName('accept')
            .setDescription('Принять заявку')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Пользователь для принятия')
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName('stats')
            .setDescription('Посмотреть статистику')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Пользователь для просмотра статистики')
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
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
    ];

    try {
        console.log('Started deploying slash commands...');

        // Регистрируем все команды
        await rest.put(
            Routes.applicationCommands('1355683641950212167'),
            { body: commands.map(command => command.toJSON()) }
        );

        console.log('Successfully deployed slash commands!');
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
}

// Регистрация команд
client.once('ready', async () => {
    console.log('Bot is ready!');
    await deployCommands();
    
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
    // Обрабатываем только нужные типы взаимодействий
    if (!interaction.isCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

    console.log('Interaction received:', interaction.type, interaction.commandName);

    // Обработка команды /table
    if (interaction.isCommand() && interaction.commandName === 'table') {
        const embed = new EmbedBuilder()
            .setTitle('Заполнение банковского счета')
            .setDescription('Нажмите на кнопку ниже, чтобы заполнить форму')
            .setColor('#0099ff');

        const button = new ButtonBuilder()
            .setCustomId('fill_form')
            .setLabel('Заполнить')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
        return;
    }

    // Обработка нажатия на кнопку
    if (interaction.customId === 'fill_form') {
        const modal = new ModalBuilder()
            .setCustomId('bank_form')
            .setTitle('Форма банковского счета');

        const bankAccountInput = new TextInputBuilder()
            .setCustomId('bank_account')
            .setLabel('Ваш банковский счет')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(bankAccountInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
        return;
    }

    // Обработка отправки формы
    if (interaction.customId === 'bank_form') {
        const bankAccount = interaction.fields.getTextInputValue('bank_account');
        const username = interaction.member.displayName;

        try {
            // Записываем данные в Google Sheets
            const success = await addToSheet(username, bankAccount);

            await interaction.reply({
                content: 'Ваши данные успешно сохранены!',
                ephemeral: true
            });
        } catch (error) {
            console.error('Error saving to Google Sheets:', error);
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
                case 'статистика':
                    // Собираем все виды статистики
                    const messageStats = Object.entries(stats.messageCount || {})
                        .sort(([, a], [, b]) => b - a)
                        .map(([userId, count]) => 
                            `<@${userId}> - ${count} сообщений`
                        );

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

client.login('MTM1NTY4MzY0MTk1MDIxMjE2Nw.GxUue5.T6Ex-3NWhNwK0z9YzJvcRbbXBAfQJWL4sQQO-8');
