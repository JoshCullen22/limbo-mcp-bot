// =========================================================================
//                             IMPORTS & SETUP
// =========================================================================
require('dotenv').config(); 

const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Partials
} = require('discord.js');
const fetch = require('node-fetch');

// =========================================================================
//                             CONFIGURATION
// =========================================================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const MCP_CHANNEL_ID = process.env.MCP_CHANNEL_ID;
const ALLOWED_ROLES = process.env.ALLOWED_ROLES ? process.env.ALLOWED_ROLES.split(',') : [];

// Startup checks...

// =========================================================================
//                             DISCORD CLIENT
// =========================================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// =========================================================================
//                              BOT EVENTS
// =========================================================================
client.once('ready', async () => {
  console.log(`🩸 LIMBO MCP OPTIMIZED LOGGER is online as ${client.user.tag}!`);
  await postMCPInterface();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.inGuild() || !hasPermission(interaction.member)) {
    return interaction.reply({ content: '❌ You do not have the required role to use the MCP.', ephemeral: true });
  }

  if (interaction.isStringSelectMenu()) {
    await handleSelectMenu(interaction);
  } else if (interaction.isButton()) {
    await handleButtonClick(interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
  }
});

// =========================================================================
//                            MAIN HANDLERS
// =========================================================================

async function handleSelectMenu(interaction) {
    const [id, command, ...args] = interaction.customId.split('_');
    const value = interaction.values[0];

    if (id !== 'mcp') return;

    try {
        switch (command) {
            case 'module':
                await showTeamSelection(interaction, value);
                break;
            case 'team':
                const [module] = args;
                await showLogTypeSelection(interaction, module, value);
                break;
            case 'logtype':
                const [moduleFromAction, team] = args;
                await showImpactSelection(interaction, moduleFromAction, team, value);
                break;
            case 'impact':
                const [moduleFromImpact, teamFromImpact, logType] = args;
                await showQuickLogModal(interaction, moduleFromImpact, teamFromImpact, logType, value);
                break;
        }
    } catch (error) {
        console.error("Error in handleSelectMenu:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred. Please try again.', ephemeral: true });
        } else {
            await interaction.followUp({ content: 'An error occurred. Please try again.', ephemeral: true });
        }
    }
}

async function handleButtonClick(interaction) {
  // Your button logic here...
  if (interaction.customId === 'mcp_refresh') {
    await interaction.deferUpdate();
    await postMCPInterface();
  } else {
    await interaction.reply({ content: 'This feature is under construction.', ephemeral: true });
  }
}

async function handleModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const [_, __, module, team, logType, impactLevel] = interaction.customId.split('_');
    
    const mcpData = {
      "Staff": interaction.user.tag,
      "Module Affected": module,
      "Team": team,
      "Log Type": logType,
      "Impact Level": impactLevel,
      "Action Summary": interaction.fields.getTextInputValue('action_summary'),
      "Blockers Encountered": interaction.fields.getTextInputValue('blockers') || 'None',
      "Reference Links": interaction.fields.getTextInputValue('reference_links') || 'None'
    };
  
    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mcpData)
        });
        if (!response.ok) throw new Error(`n8n webhook failed with status ${response.status}`);
        
        const successEmbed = new EmbedBuilder().setColor(0x00ff00).setTitle('✅ Log Submitted Successfully').setDescription(`Your **${logType}** log for the **${team}** team has been recorded.`);
        await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
        console.error("Error submitting to n8n:", error);
        const errorEmbed = new EmbedBuilder().setColor(0xff0000).setTitle('❌ Submission Failed').setDescription('Could not send data to the processing server.');
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// =========================================================================
//                       INTERFACE & RESPONSE GENERATORS
// =========================================================================

// STEP 1: Main Panel
async function postMCPInterface() { /* ... unchanged ... */ }

// STEP 2: Team Selection
async function showTeamSelection(interaction, selectedModule) {
    const teamSelect = new StringSelectMenuBuilder()
        .setCustomId(`mcp_team_${selectedModule}`)
        .setPlaceholder('👥 Select Your Team')
        .addOptions([
            { label: 'Creatives', value: 'Creatives', emoji: '🎨' },
            { label: 'Moderation', value: 'Moderation', emoji: '🛡️' },
            { label: 'Automations', value: 'Automations', emoji: '⚙️' },
            { label: 'Customer Service', value: 'Customer Service', emoji: '🎧' },
            { label: 'Council', value: 'Council', emoji: '👑' },
            { label: 'General', value: 'General', emoji: '📋' }
        ]);
    const embed = new EmbedBuilder().setColor(0x3498db).setTitle(`🏢 ${selectedModule} Module`).setDescription('Next, please select your team for this log.');
    // Check if we need to reply or update
    if (interaction.isReplied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(teamSelect)] });
    } else {
        await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(teamSelect)], ephemeral: true });
    }
}

// STEP 3: NEW Log Type Selection (Replaces Action Type)
async function showLogTypeSelection(interaction, module, team) {
    const logTypeSelect = new StringSelectMenuBuilder()
        .setCustomId(`mcp_logtype_${module}_${team}`)
        .setPlaceholder('📋 Select the Type of Work...')
        .addOptions([
            { label: 'Issue a Sanction', value: 'Sanction', emoji: '⚖️' },
            { label: 'Resolve a Member Ticket', value: 'Ticket Resolution', emoji: '🎫' },
            { label: 'Update a System/Bot', value: 'System Update', emoji: '🤖' },
            { label: 'Fix a Bug/Error', value: 'Error Fix', emoji: '🔧' },
            { label: 'Review a Log/Appeal', value: 'Review', emoji: '👀' },
            { label: 'Perform Server Cleanup', value: 'Cleanup', emoji: '🧹' },
            { label: 'Post New Content', value: 'Content Creation', emoji: '📝' },
            { label: 'Manual Role/XP Change', value: 'Manual Adjustment', emoji: '⭐' },
            { label: 'General Task', value: 'General Task', emoji: '📋' }
        ]);
    const embed = new EmbedBuilder().setColor(0x1abc9c).setTitle(`👥 Team: ${team}`).setDescription(`What kind of work did you do in **${module}**?`);
    await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(logTypeSelect)] });
}

// STEP 4: Impact Selection (Unchanged logic, updated Custom ID)
async function showImpactSelection(interaction, module, team, logType) {
    const impactSelect = new StringSelectMenuBuilder()
        .setCustomId(`mcp_impact_${module}_${team}_${logType}`)
        .setPlaceholder('📊 Select Impact Level...')
        .addOptions([
            { label: 'Low', value: 'Low', emoji: '🟢' },
            { label: 'Medium', value: 'Medium', emoji: '🟡' },
            { label: 'High', value: 'High', emoji: '🟠' },
            { label: 'Critical', value: 'Critical', emoji: '🔴' }
        ]);
    const embed = new EmbedBuilder().setColor(0xe67e22).setTitle(`📋 Log Type: ${logType}`).setDescription(`What was the impact level of this work?`);
    await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(impactSelect)] });
}

// STEP 5: Modal Form (Unchanged logic, updated Custom ID)
async function showQuickLogModal(interaction, module, team, logType, impactLevel) {
    const modal = new ModalBuilder()
        .setCustomId(`mcp_modal_${module}_${team}_${logType}_${impactLevel}`)
        .setTitle(`Log: ${logType}`);
    
    const actionInput = new TextInputBuilder().setCustomId('action_summary').setLabel('Action Summary').setStyle(TextInputStyle.Paragraph).setRequired(true);
    const blockersInput = new TextInputBuilder().setCustomId('blockers').setLabel('Blockers? ("None" if none)').setStyle(TextInputStyle.Short).setRequired(true).setValue("None");
    const linksInput = new TextInputBuilder().setCustomId('reference_links').setLabel('Reference Links (Optional)').setStyle(TextInputStyle.Short).setRequired(false);
  
    modal.addComponents(
        new ActionRowBuilder().addComponents(actionInput),
        new ActionRowBuilder().addComponents(blockersInput),
        new ActionRowBuilder().addComponents(linksInput)
    );
    await interaction.showModal(modal);
}

// =========================================================================
//                             HELPER FUNCTIONS & LOGIN
// =========================================================================
function hasPermission(member) { /* ... unchanged ... */ }
async function postMCPInterface() { /* ... fill with your main panel code ... */ }
client.login(BOT_TOKEN);