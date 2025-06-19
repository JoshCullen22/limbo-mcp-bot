// =========================================================================
//                             IMPORTS & SETUP
// =========================================================================
require('dotenv').config();

const { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, 
  TextInputBuilder, TextInputStyle, Partials 
} = require('discord.js');
const fetch = require('node-fetch');

// =========================================================================
//                             CONFIGURATION
// =========================================================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const MCP_CHANNEL_ID = process.env.MCP_CHANNEL_ID;
const ALLOWED_ROLES = process.env.ALLOWED_ROLES ? process.env.ALLOWED_ROLES.split(',') : [];

// --- SCALABLE LOGGING CONFIGURATION ---
// This is the single source of truth for all logging options.
// To add/remove/edit a department or task, you only need to change it here.
const departmentConfig = {
    'MOD': {
        label: 'Moderation', emoji: '🛡️',
        tasks: [
            { label: 'Warn a User', value: 'USER_WARN' }, { label: 'Mute/Timeout a User', value: 'USER_MUTE' },
            { label: 'Kick a User', value: 'USER_KICK' }, { label: 'Ban a User', value: 'USER_BAN' },
            { label: 'Review User Reports', value: 'REPORTS_REVIEW' }, { label: 'Resolve Dispute', value: 'DISPUTE_RESOLVE' },
            { label: 'Other (Specify in Form)', value: 'OTHER', emoji: '✍️' }
        ]
    },
    'CREA': {
        label: 'Creatives', emoji: '🎨',
        tasks: [
            { label: 'Create Graphic/Image', value: 'GRAPHIC_CREATE' }, { label: 'Edit Video', value: 'VIDEO_EDIT' },
            { label: 'Write Announcement/Copy', value: 'COPY_WRITE' }, { label: 'Plan Content Schedule', value: 'CONTENT_PLAN' },
            { label: 'Other (Specify in Form)', value: 'OTHER', emoji: '✍️' }
        ]
    },
    'AUTO': {
        label: 'Automations', emoji: '⚙️',
        tasks: [
            { label: 'Fix Bot/Workflow Bug', value: 'BUG_FIX' }, { label: 'Deploy New Feature', value: 'FEATURE_DEPLOY' },
            { label: 'Create New Workflow', value: 'WORKFLOW_CREATE' }, { label: 'Perform System Maintenance', value: 'SYS_MAINTENANCE' },
            { label: 'Other (Specify in Form)', value: 'OTHER', emoji: '✍️' }
        ]
    },
    'CS': {
        label: 'Customer Service', emoji: '🎧',
        tasks: [
            { label: 'Answer Support Ticket', value: 'TICKET_ANSWER' }, { label: 'Resolve Member Issue', value: 'ISSUE_RESOLVE' },
            { label: 'Update Knowledge Base', value: 'KB_UPDATE' }, { label: 'Guide New Member', value: 'MEMBER_GUIDE' },
            { label: 'Other (Specify in Form)', value: 'OTHER', emoji: '✍️' }
        ]
    },
    'GEN': {
        label: 'General', emoji: '📋',
        tasks: [
            { label: 'Team Meeting', value: 'MEETING_ATTEND' }, { label: 'Weekly Report', value: 'REPORT_SUBMIT' },
            { label: 'Administrative Task', value: 'ADMIN_TASK' },
            { label: 'Other (Specify in Form)', value: 'OTHER', emoji: '✍️' }
        ]
    }
};

// Startup check for configuration
if (!BOT_TOKEN || !N8N_WEBHOOK_URL || !MCP_CHANNEL_ID || !ALLOWED_ROLES || ALLOWED_ROLES.length === 0) {
    console.error('❌ FATAL: Missing critical environment variables in .env file or hosting service.');
    process.exit(1);
}

// =========================================================================
//                             DISCORD CLIENT
// =========================================================================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

// =========================================================================
//                              BOT EVENTS
// =========================================================================
client.once('ready', () => {
  console.log(`🩸 LIMBO MCP Logger is online as ${client.user.tag}!`);
  postMCPInterface();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.inGuild() || !hasPermission(interaction.member)) {
    if (interaction.isRepliable()) {
        interaction.reply({ content: 'You do not have permission to use this.', ephemeral: true });
    }
    return;
  }

  if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction);
  else if (interaction.isButton()) await handleButtonClick(interaction);
  else if (interaction.isModalSubmit()) await handleModalSubmit(interaction);
});

// =========================================================================
//                          INTERFACE & HANDLERS
// =========================================================================

async function postMCPInterface() {
    const channel = client.channels.cache.get(MCP_CHANNEL_ID);
    if (!channel) return console.error(`[ERROR] MCP channel with ID '${MCP_CHANNEL_ID}' not found.`);

    try {
        const messages = await channel.messages.fetch({ limit: 20 });
        const oldInterface = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title.includes('LIMBO MCP'));
        if (oldInterface) await oldInterface.delete();
    } catch (err) {
        console.warn("[WARN] Could not delete old interface, probably due to permissions. Skipping.");
    }

    const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🩸 LIMBO MCP (Master Control Panel)')
        .setDescription(`**Welcome to the Bloodline Operations Center**\n\nSelect your department from the dropdown to log your tasks. Your options will be tailored to your role.`)
        .setThumbnail('https://i.imgur.com/K8M2K1R.png') // Your logo here
        .setFooter({ text: 'LIMBO Bloodline Operations • Data-driven decisions' })
        .setTimestamp();

    const departmentSelect = new StringSelectMenuBuilder()
        .setCustomId('mcp_department_select')
        .setPlaceholder('🏢 Select Your Department to Begin...')
        .addOptions(Object.entries(departmentConfig).map(([id, { label, emoji }]) => ({
            label: label,
            value: id, // Use the short, unique ID as the value
            emoji: emoji
        })));

    const actionButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('mcp_view_stats').setLabel('My Stats').setStyle(ButtonStyle.Secondary).setEmoji('📊'),
            new ButtonBuilder().setCustomId('mcp_refresh').setLabel('Refresh').setStyle(ButtonStyle.Success).setEmoji('🔄')
        );

    await channel.send({ 
        embeds: [embed], 
        components: [new ActionRowBuilder().addComponents(departmentSelect), actionButtons] 
    });
}

async function handleSelectMenu(interaction) {
    const [prefix, stage, ...args] = interaction.customId.split('_');
    if (prefix !== 'mcp') return;

    if (stage === 'department') { // Stage 1: Department selected
        const deptId = interaction.values[0];
        const department = departmentConfig[deptId];
        if (!department) return interaction.reply({ content: 'Error: Invalid department selected.', ephemeral: true });

        const taskSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`mcp_task_${deptId}`)
            .setPlaceholder(`👇 Select a task for ${department.label}...`)
            .addOptions(department.tasks);
        
        const embed = new EmbedBuilder().setColor(0x3498db).setTitle(`${department.emoji} ${department.label} Department`).setDescription(`Please select the specific task you performed.`);
        await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(taskSelectMenu)], ephemeral: true });
    } else if (stage === 'task') { // Stage 2: Task selected
        const deptId = args[0];
        const taskId = interaction.values[0];
        await showLogModal(interaction, deptId, taskId);
    }
}

async function handleButtonClick(interaction) {
    const [prefix, action] = interaction.customId.split('_');
    if (prefix !== 'mcp') return;

    if (action === 'refresh') {
        await interaction.deferUpdate();
        await postMCPInterface();
    } else if (action === 'view') {
        const embed = new EmbedBuilder().setColor(0x3498db).setTitle(`📊 ${interaction.user.username}'s Stats`).setDescription('This feature is coming soon!');
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function handleModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const [prefix, deptId, taskId] = interaction.customId.split('_');
    const department = departmentConfig[deptId];
    const task = department.tasks.find(t => t.value === taskId);

    if (!department || !task) {
        return interaction.editReply({ content: 'An error occurred with the data submission. Please try again.' });
    }
    
    // --- DYNAMICALLY GET TASK LABEL ---
    // If the task was 'OTHER', get the custom description from the modal.
    // Otherwise, use the predefined label.
    let finalTaskLabel = task.label;
    if (taskId === 'OTHER') {
        finalTaskLabel = interaction.fields.getTextInputValue('other_task_description');
    }
    // ------------------------------------

    const mcpData = {
        staff_tag: interaction.user.tag,
        staff_id: interaction.user.id,
        department_id: deptId,
        department_label: department.label,
        task_id: taskId, // This will be 'OTHER' for custom tasks
        task_label: finalTaskLabel, // This will be the user's custom text
        summary: interaction.fields.getTextInputValue('summary'),
        impact_level: interaction.fields.getTextInputValue('impact_level'),
        reference_link: interaction.fields.getTextInputValue('reference_link') || 'None',
        submitted_at: new Date().toISOString()
    };

    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mcpData)
        });
        if (!response.ok) throw new Error(`n8n webhook returned HTTP ${response.status}: ${await response.text()}`);

        const successEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🩸 MCP Log Submitted Successfully')
            .addFields(
                { name: '🏢 Department', value: mcpData.department_label, inline: true },
                { name: '✅ Task', value: mcpData.task_label, inline: true }, // Shows the custom task if applicable
                { name: '📈 Impact', value: mcpData.impact_level, inline: true },
                { name: '📋 Summary', value: `\`\`\`${mcpData.summary.slice(0, 1000)}\`\`\``, inline: false }
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();
        await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
        console.error('[FATAL] Error submitting MCP log:', error);
        const errorEmbed = new EmbedBuilder().setColor(0xff0000).setTitle('❌ Submission Failed').setDescription(`There was a critical error sending your log.\n\`\`\`${error.message}\`\`\``);
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// =========================================================================
//                             MODAL & HELPERS
// =========================================================================

async function showLogModal(interaction, deptId, taskId) {
    const department = departmentConfig[deptId];
    const task = department.tasks.find(t => t.value === taskId);

    const modal = new ModalBuilder()
        .setCustomId(`logmodal_${deptId}_${taskId}`)
        .setTitle(`Log: ${department.label} Task`);
  
    // --- DYNAMICALLY ADD "OTHER" FIELD ---
    if (taskId === 'OTHER') {
        const otherTaskInput = new TextInputBuilder()
            .setCustomId('other_task_description')
            .setLabel('Describe the custom task you performed')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., Coordinated with a partner server')
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(otherTaskInput));
    }
    // ------------------------------------

    const summaryInput = new TextInputBuilder().setCustomId('summary').setLabel('Summary of Action').setStyle(TextInputStyle.Paragraph).setPlaceholder('e.g., Banned user XYZ#1234 for spamming links in #general.').setRequired(true);
    const impactInput = new TextInputBuilder().setCustomId('impact_level').setLabel('Impact Level').setStyle(TextInputStyle.Short).setPlaceholder('Low, Medium, High, or Critical').setRequired(true);
    const linkInput = new TextInputBuilder().setCustomId('reference_link').setLabel('Reference Link (Optional)').setStyle(TextInputStyle.Short).setPlaceholder('Link to ticket, user profile, Google Doc, etc.').setRequired(false);
  
    modal.addComponents(
        new ActionRowBuilder().addComponents(summaryInput),
        new ActionRowBuilder().addComponents(impactInput),
        new ActionRowBuilder().addComponents(linkInput)
    );
    
    await interaction.showModal(modal);
}

function hasPermission(member) {
    if (!member) return false;
    return member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
}

function getCurrentWeek() {
    const now = new Date();
    const firstDay = new Date(now);
    firstDay.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); // Monday as start
    const lastDay = new Date(firstDay);
    lastDay.setDate(firstDay.getDate() + 6);
    return `${firstDay.toLocaleDateString()} - ${lastDay.toLocaleDateString()}`;
}

// =========================================================================
//                                  LOGIN
// =========================================================================
client.login(BOT_TOKEN);