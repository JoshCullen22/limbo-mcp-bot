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

// Startup checks
if (!BOT_TOKEN || !N8N_WEBHOOK_URL || !MCP_CHANNEL_ID) {
    console.error('❌ Missing critical environment variables. Please check your Railway variables.');
    process.exit(1); 
}

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
  console.log(`🩸 LIMBO MCP Dropdown Logger is online as ${client.user.tag}!`);
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

    switch (command) {
        case 'module':
            await showTeamSelection(interaction, value);
            break;
        case 'team':
            const [module] = args;
            await showActionTypeSelection(interaction, module, value);
            break;
        case 'action':
            const [moduleFromAction, team] = args;
            await showImpactSelection(interaction, moduleFromAction, team, value);
            break;
        case 'impact':
            const [moduleFromImpact, teamFromImpact, actionType] = args;
            await showQuickLogModal(interaction, moduleFromImpact, teamFromImpact, actionType, value);
            break;
    }
}

async function handleButtonClick(interaction) {
  // Your existing button logic for detailed form, stats, refresh, etc.
  if (interaction.customId === 'mcp_refresh') {
      await interaction.deferUpdate();
      await postMCPInterface();
  } else {
      await interaction.reply({ content: 'This button feature is under construction.', ephemeral: true });
  }
}

async function handleModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const [_, __, module, team, actionType, impactLevel] = interaction.customId.split('_');
    const mcpData = {
      "Staff": interaction.user.tag,
      "Module Affected": module,
      "Team": team,
      "Log Type": actionType, // Or rename to "Action Type"
      "Impact Level": impactLevel,
      "Action Summary": interaction.fields.getTextInputValue('action_summary'),
      "Blockers Encountered": interaction.fields.getTextInputValue('blockers') || 'None',
      "Reference Links": interaction.fields.getTextInputValue('reference_links') || 'None',
      "Verified By": interaction.fields.getTextInputValue('verified_by') || 'N/A',
      "Duration": interaction.fields.getTextInputValue('duration') || 'N/A'
    };
  
    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mcpData)
        });

        if (!response.ok) {
            throw new Error(`n8n webhook failed with status ${response.status}`);
        }
        const successEmbed = new EmbedBuilder().setColor(0x00ff00).setTitle('✅ Log Submitted Successfully').setDescription(`Your log for the **${team}** team has been recorded.`);
        await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
        console.error("Error submitting to n8n:", error);
        const errorEmbed = new EmbedBuilder().setColor(0xff0000).setTitle('❌ Submission Failed').setDescription('Could not send data to the processing server. Please contact an admin.');
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// =========================================================================
//                       INTERFACE & MODAL GENERATORS
// =========================================================================

// STEP 1
async function postMCPInterface() {
  const channel = client.channels.cache.get(MCP_CHANNEL_ID);
  if (!channel) return console.error("MCP Channel not found.");
  // ... (Your embed and component code for the main panel) ...
}

// STEP 2
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
    await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(teamSelect)] });
}

// STEP 3 - THE MISSING FUNCTION
async function showActionTypeSelection(interaction, module, team) {
    const actionSelect = new StringSelectMenuBuilder()
        .setCustomId(`mcp_action_${module}_${team}`)
        .setPlaceholder('⚡ Select Action Type...')
        .addOptions([
            { label: 'Create', value: 'Create', emoji: '🆕' },
            { label: 'Modify', value: 'Modify', emoji: '✏️' },
            { label: 'Fix', value: 'Fix', emoji: '🔧' },
            { label: 'Review', value: 'Review', emoji: '👀' },
            { label: 'Sanction', value: 'Sanction', emoji: '⚖️'},
            { label: 'Ticket', value: 'Ticket', emoji: '🎫'}
        ]);
    const embed = new EmbedBuilder().setColor(0x1abc9c).setTitle(`👥 Team: ${team}`).setDescription(`Now select the type of action performed in **${module}**.`);
    await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(actionSelect)] });
}

// STEP 4
async function showImpactSelection(interaction, module, team, actionType) {
    const impactSelect = new StringSelectMenuBuilder()
        .setCustomId(`mcp_impact_${module}_${team}_${actionType}`)
        .setPlaceholder('📊 Select Impact Level...')
        .addOptions([
            { label: 'Low', value: 'Low', emoji: '🟢' },
            { label: 'Medium', value: 'Medium', emoji: '🟡' },
            { label: 'High', value: 'High', emoji: '🟠' },
            { label: 'Critical', value: 'Critical', emoji: '🔴' }
        ]);
    const embed = new EmbedBuilder().setColor(0xe67e22).setTitle(`⚡ Action: ${actionType}`).setDescription(`What was the impact level of this action?`);
    await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(impactSelect)] });
}

// STEP 5
async function showQuickLogModal(interaction, module, team, actionType, impactLevel) {
    const modal = new ModalBuilder()
        .setCustomId(`mcp_modal_${module}_${team}_${actionType}_${impactLevel}`)
        .setTitle(`Log: ${actionType} in ${team}`);
    
    // Add all your text inputs here...
    const actionInput = new TextInputBuilder().setCustomId('action_summary').setLabel('Action Summary').setStyle(TextInputStyle.Paragraph).setRequired(true);
    const blockersInput = new TextInputBuilder().setCustomId('blockers').setLabel('Blockers? (Type "None" if none)').setStyle(TextInputStyle.Short).setRequired(true);
    const durationInput = new TextInputBuilder().setCustomId('duration').setLabel('Duration (e.g., 30 mins)').setStyle(TextInputStyle.Short).setRequired(false);
    const linksInput = new TextInputBuilder().setCustomId('reference_links').setLabel('Reference Links (Optional)').setStyle(TextInputStyle.Short).setRequired(false);
    const verifiedInput = new TextInputBuilder().setCustomId('verified_by').setLabel('Verified By (Optional)').setStyle(TextInputStyle.Short).setRequired(false);
  
    modal.addComponents(
        new ActionRowBuilder().addComponents(actionInput),
        new ActionRowBuilder().addComponents(blockersInput),
        new ActionRowBuilder().addComponents(durationInput),
        new ActionRowBuilder().addComponents(linksInput),
        new ActionRowBuilder().addComponents(verifiedInput)
    );
    await interaction.showModal(modal);
}

// =========================================================================
//                             HELPER FUNCTIONS
// =========================================================================
function hasPermission(member) {
  if (!member) return false;
  return member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
}

async function postMCPInterface() {
    // This function needs to be filled out with your main interface code
    // from your working bot file. It creates the initial embed and buttons.
    // For now, I'll add a placeholder so the bot doesn't crash.
    const channel = client.channels.cache.get(MCP_CHANNEL_ID);
    if (!channel) return console.error("Channel not found in postMCPInterface.");

    const embed = new EmbedBuilder().setTitle("LIMBO MCP").setDescription("Select a module to begin logging.");
    const moduleSelect = new StringSelectMenuBuilder()
        .setCustomId('mcp_module_select')
        .setPlaceholder('🏢 Select Department...')
        .addOptions([
            { label: 'Moderation', value: 'Moderation', emoji: '🛡️' },
            { label: 'Automations', value: 'Automations', emoji: '⚙️' },
            { label: 'Creatives', value: 'Creatives', emoji: '🎨' }
            // Add all other modules...
        ]);
    await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(moduleSelect)] });
}


// Login
client.login(BOT_TOKEN);