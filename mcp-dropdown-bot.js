// =========================================================================
//                             IMPORTS & SETUP
// =========================================================================
require('dotenv').config(); // Loads variables from .env file

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
// All configuration is now loaded from your .env file or Railway variables.
const BOT_TOKEN = process.env.BOT_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const MCP_CHANNEL_ID = process.env.MCP_CHANNEL_ID;
const ALLOWED_ROLES = process.env.ALLOWED_ROLES ? process.env.ALLOWED_ROLES.split(',') : [];

// Startup checks
if (!BOT_TOKEN || !N8N_WEBHOOK_URL || !MCP_CHANNEL_ID || ALLOWED_ROLES.length === 0) {
    console.error('❌ Missing critical environment variables. Please check your .env file or Railway variables.');
    process.exit(1); // Exit the process if configuration is missing
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

// Bot Ready Event
client.once('ready', async () => {
  console.log(`🩸 LIMBO MCP Dropdown Logger is online as ${client.user.tag}!`);
  await postMCPInterface();
});

// Interaction Create Event
client.on('interactionCreate', async (interaction) => {
  if (!interaction.inGuild()) return;

  if (!hasPermission(interaction.member)) {
    return interaction.reply({ 
      content: '❌ You do not have the required role to use the MCP.', 
      ephemeral: true 
    });
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
//                            INTERFACE & HANDLERS
// =========================================================================

/**
 * Posts or updates the main MCP interface in the designated channel.
 */
async function postMCPInterface() {
  const channel = client.channels.cache.get(MCP_CHANNEL_ID);
  if (!channel) {
    console.error(`Error: MCP channel with ID '${MCP_CHANNEL_ID}' not found.`);
    return;
  }

  // Delete the old interface before posting a new one
  try {
    const messages = await channel.messages.fetch({ limit: 10 });
    const oldInterface = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title.includes('LIMBO MCP'));
    if (oldInterface) {
      await oldInterface.delete();
    }
  } catch (err) {
    console.warn("Could not delete old interface, possibly due to permissions. Continuing...");
  }

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🩸 LIMBO MCP (Master Control Panel)')
    .setDescription(`**Welcome to the Bloodline Operations Center**\n\nUse the dropdown and buttons below to log your work activities. All entries are automatically tracked for KPI analysis.\n\n📊 **Current Week:** ${getCurrentWeek()}`)
    .addFields(
      { name: '📋 Quick Log', value: 'Use dropdown for fast logging.', inline: true },
      { name: '📝 Detailed Log', value: 'Use button for a full form.', inline: true },
      { name: '📊 View Stats', value: 'Check your weekly progress.', inline: true }
    )
    .setThumbnail('https://i.imgur.com/K8M2K1R.png') // Your logo
    .setFooter({ text: 'LIMBO Bloodline Operations' })
    .setTimestamp();

  const moduleSelect = new StringSelectMenuBuilder()
    .setCustomId('mcp_module_select')
    .setPlaceholder('🏢 Select Your Department/Module...')
    .addOptions([
      { label: 'Onboarding', value: 'Onboarding', emoji: '🆕' },
      { label: 'Moderation', value: 'Moderation', emoji: '🛡️' },
      { label: 'Automations', value: 'Automations', emoji: '⚙️' },
      { label: 'Customer Service', value: 'Customer Service', emoji: '🎧' },
      { label: 'Creatives', value: 'Creatives', emoji: '🎨' },
      { label: 'Verification', value: 'Verification', emoji: '✅' },
      { label: 'Events', value: 'Events', emoji: '🎪' },
      { label: 'General', value: 'General', emoji: '📋' }
    ]);

  const actionButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId('mcp_detailed_form').setLabel('Detailed Log').setStyle(ButtonStyle.Primary).setEmoji('📝'),
      new ButtonBuilder().setCustomId('mcp_view_stats').setLabel('My Stats').setStyle(ButtonStyle.Secondary).setEmoji('📊'),
      new ButtonBuilder().setCustomId('mcp_team_stats').setLabel('Team Stats').setStyle(ButtonStyle.Secondary).setEmoji('👥'),
      new ButtonBuilder().setCustomId('mcp_refresh').setLabel('Refresh').setStyle(ButtonStyle.Success).setEmoji('🔄')
    );

  await channel.send({ 
    embeds: [embed], 
    components: [new ActionRowBuilder().addComponents(moduleSelect), actionButtons] 
  });
}

/**
 * Handles all String Select Menu interactions.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction 
 */
async function handleSelectMenu(interaction) {
    const [id, ...args] = interaction.customId.split('_');
    const value = interaction.values[0];

    switch (id) {
        case 'mcp':
            const subCommand = args[0];
            if (subCommand === 'module') { // Initial module selection
                await showActionSelection(interaction, value);
            } else if (subCommand === 'action') { // Action type selection
                const [module] = args.slice(1);
                await showImpactSelection(interaction, module, value);
            } else if (subCommand === 'impact') { // Impact level selection
                const [module, actionType] = args.slice(1);
                await showQuickLogModal(interaction, module, actionType, value);
            }
            break;
    }
}

/**
 * Handles all Button interactions.
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
async function handleButtonClick(interaction) {
  switch (interaction.customId) {
    case 'mcp_detailed_form':
      return showDetailedForm(interaction);
    case 'mcp_view_stats':
      return showUserStats(interaction);
    case 'mcp_team_stats':
      return showTeamStats(interaction);
    case 'mcp_refresh':
      await interaction.reply({ content: '🔄 Refreshing the interface...', ephemeral: true });
      await postMCPInterface();
      return interaction.deleteReply();
  }
}

/**
 * Handles all Modal Submit interactions.
 * @param {import('discord.js').ModalSubmitInteraction} interaction 
 */
async function handleModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  let mcpData;

  if (interaction.customId.startsWith('mcp_quick_modal')) {
    const [_, module, actionType, impactLevel] = interaction.customId.split('_');
    mcpData = {
      "Staff": interaction.user.tag,
      "Module Affected": module,
      "Type of Action": actionType,
      "Impact Level": impactLevel,
      "Action Summary": interaction.fields.getTextInputValue('action_summary'),
      "Blockers Encountered": interaction.fields.getTextInputValue('blockers'),
      "Recommendations": interaction.fields.getTextInputValue('recommendations') || 'None',
      "Reference Links": interaction.fields.getTextInputValue('links') || 'None',
      "Verified By": interaction.fields.getTextInputValue('verified_by') || 'N/A'
    };
  } else if (interaction.customId === 'mcp_detailed_modal') {
    mcpData = {
      "Staff": interaction.user.tag,
      "Module Affected": interaction.fields.getTextInputValue('module'),
      "Type of Action": interaction.fields.getTextInputValue('type'),
      "Impact Level": interaction.fields.getTextInputValue('impact'),
      "Action Summary": interaction.fields.getTextInputValue('action'),
      "Blockers Encountered": 'N/A (Use Quick Log for this field)',
      "Recommendations": 'N/A (Use Quick Log for this field)',
      "Reference Links": 'N/A (Use Quick Log for this field)',
      "Verified By": 'N/A (Use Quick Log for this field)'
    };
  } else {
    return;
  }

  // Add metadata
  mcpData.submittedBy = interaction.user.id;
  mcpData.submittedAt = new Date().toISOString();
  mcpData.submissionMethod = 'Discord MCP Interface';

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mcpData)
    });

    if (!response.ok) {
      throw new Error(`n8n webhook returned HTTP ${response.status}: ${response.statusText}`);
    }

    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🩸 MCP Log Submitted Successfully')
      .setDescription('Your entry has been added to the Bloodline archives.')
      .addFields(
        { name: '👤 Staff', value: mcpData.Staff, inline: true },
        { name: '🏢 Module', value: mcpData["Module Affected"], inline: true },
        { name: '📈 Impact', value: mcpData["Impact Level"], inline: true },
        { name: '📋 Action', value: `\`\`\`${mcpData["Action Summary"].slice(0, 1000)}\`\`\``, inline: false }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: '✅ Processed by LIMBO MCP System' });

    await interaction.editReply({ embeds: [successEmbed] });
  } catch (error) {
    console.error('Error submitting MCP log:', error);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Submission Failed')
      .setDescription('There was an error sending your log. Please check the bot console or contact an admin.')
      .addFields({ name: 'Error Details', value: `\`\`\`${error.message}\`\`\``, inline: false })
      .setTimestamp();
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

// =========================================================================
//                             RESPONSE GENERATORS
// =========================================================================

async function showActionSelection(interaction, module) {
  const actionSelect = new StringSelectMenuBuilder()
    .setCustomId(`mcp_action_${module}`)
    .setPlaceholder('⚡ Select Action Type...')
    .addOptions([
      { label: 'Create', value: 'Create', emoji: '🆕' },
      { label: 'Modify', value: 'Modify', emoji: '✏️' },
      { label: 'Fix', value: 'Fix', emoji: '🔧' },
      { label: 'Review', value: 'Review', emoji: '👀' },
      { label: 'Delete', value: 'Delete', emoji: '🗑️' },
      { label: 'Test', value: 'Test', emoji: '🧪' },
      { label: 'Deploy', value: 'Deploy', emoji: '🚀' }
    ]);
  const embed = new EmbedBuilder().setColor(0x3498db).setTitle(`🏢 ${module} Module`).setDescription(`Now, select the type of action you performed.`);
  await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(actionSelect)], ephemeral: true });
}

async function showImpactSelection(interaction, module, actionType) {
  const impactSelect = new StringSelectMenuBuilder()
    .setCustomId(`mcp_impact_${module}_${actionType}`)
    .setPlaceholder('📊 Select Impact Level...')
    .addOptions([
      { label: 'Low', value: 'Low', emoji: '🟢' },
      { label: 'Medium', value: 'Medium', emoji: '🟡' },
      { label: 'High', value: 'High', emoji: '🟠' },
      { label: 'Critical', value: 'Critical', emoji: '🔴' }
    ]);
  const embed = new EmbedBuilder().setColor(0xe67e22).setTitle(`⚡ ${actionType} Action`).setDescription(`What was the impact level of this action?`);
  await interaction.update({ embeds: [embed], components: [new ActionRowRowBuilder().addComponents(impactSelect)] });
}

async function showQuickLogModal(interaction, module, actionType, impactLevel) {
  const modal = new ModalBuilder()
    .setCustomId(`mcp_quick_modal_${module}_${actionType}_${impactLevel}`)
    .setTitle(`📋 Quick Log: ${module}`);
  
  const actionInput = new TextInputBuilder().setCustomId('action_summary').setLabel('What did you do?').setStyle(TextInputStyle.Short).setPlaceholder('e.g., Fixed the verification flow bug').setRequired(true);
  const blockersInput = new TextInputBuilder().setCustomId('blockers').setLabel('Any blockers or issues?').setStyle(TextInputStyle.Paragraph).setPlaceholder('e.g., The API was down for 20 minutes.').setRequired(true).setValue('None');
  const recommendationsInput = new TextInputBuilder().setCustomId('recommendations').setLabel('Recommendations for the future? (Optional)').setStyle(TextInputStyle.Paragraph).setRequired(false);
  const linksInput = new TextInputBuilder().setCustomId('links').setLabel('Reference Links (Optional)').setStyle(TextInputStyle.Short).setPlaceholder('e.g., Trello card, Google Doc, etc.').setRequired(false);
  const verifiedInput = new TextInputBuilder().setCustomId('verified_by').setLabel('Verified/Approved By? (Optional)').setStyle(TextInputStyle.Short).setPlaceholder('e.g., @Username').setRequired(false);
  
  modal.addComponents(
    new ActionRowBuilder().addComponents(actionInput),
    new ActionRowBuilder().addComponents(blockersInput),
    new ActionRowBuilder().addComponents(recommendationsInput),
    new ActionRowBuilder().addComponents(linksInput),
    new ActionRowBuilder().addComponents(verifiedInput)
  );

  await interaction.showModal(modal);
}

async function showDetailedForm(interaction) {
    const modal = new ModalBuilder().setCustomId('mcp_detailed_modal').setTitle('📋 Detailed MCP Log Entry');
    const moduleInput = new TextInputBuilder().setCustomId('module').setLabel('Module (e.g., Onboarding)').setStyle(TextInputStyle.Short).setRequired(true);
    const actionInput = new TextInputBuilder().setCustomId('action').setLabel('Action Summary').setStyle(TextInputStyle.Paragraph).setRequired(true);
    const typeInput = new TextInputBuilder().setCustomId('type').setLabel('Type (e.g., Create, Fix)').setStyle(TextInputStyle.Short).setRequired(true);
    const impactInput = new TextInputBuilder().setCustomId('impact').setLabel('Impact Level (Low, Medium, High, Critical)').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(
        new ActionRowBuilder().addComponents(moduleInput),
        new ActionRowBuilder().addComponents(actionInput),
        new ActionRowBuilder().addComponents(typeInput),
        new ActionRowBuilder().addComponents(impactInput)
    );
    await interaction.showModal(modal);
}

// =========================================================================
//                             HELPER FUNCTIONS
// =========================================================================

/**
 * Checks if a member has one of the allowed roles.
 * @param {import('discord.js').GuildMember} member 
 * @returns {boolean}
 */
function hasPermission(member) {
  if (!member) return false;
  return member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
}

/**
 * Gets the current week range as a string.
 * @returns {string}
 */
function getCurrentWeek() {
  const now = new Date();
  const firstDay = new Date(now.setDate(now.getDate() - now.getDay() + 1));
  const lastDay = new Date(firstDay);
  lastDay.setDate(lastDay.getDate() + 6);
  return `${firstDay.toLocaleDateString()} - ${lastDay.toLocaleDateString()}`;
}

// Placeholder stat functions
async function showUserStats(interaction) {
  const embed = new EmbedBuilder().setColor(0x3498db).setTitle(`📊 ${interaction.user.username}'s Stats`).setDescription('This feature is coming soon!');
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function showTeamStats(interaction) {
  const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle('🏢 Team Overview').setDescription('This feature is coming soon!');
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// =========================================================================
//                                  LOGIN
// =========================================================================
client.login(BOT_TOKEN);