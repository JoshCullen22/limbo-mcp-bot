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

// ... (Startup checks from previous code) ...

// =========================================================================
//                             DISCORD CLIENT
// =========================================================================
const client = new Client({
  // ... (intents and partials from previous code) ...
});


// =========================================================================
//                              BOT EVENTS
// =========================================================================

// ... (Existing 'ready' event) ...

client.on('interactionCreate', async (interaction) => {
  if (!interaction.inGuild() || !hasPermission(interaction.member)) {
    return interaction.reply({ content: '❌ You do not have the required role to use the MCP.', ephemeral: true });
  }

  if (interaction.isStringSelectMenu()) {
    // This is the new, cleaner handler
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

// ... (Existing postMCPInterface function) ...


/**
 * NEW, CLEANER SELECT MENU HANDLER
 * Handles all String Select Menu interactions in the MCP flow.
 */
async function handleSelectMenu(interaction) {
    const [id, ...args] = interaction.customId.split('_');
    const value = interaction.values[0];

    // Ensure it's an MCP interaction
    if (id !== 'mcp') return;

    const command = args[0];

    switch (command) {
        case 'module': // Step 1: User selected a module
            await showTeamSelection(interaction, value);
            break;
        
        case 'team': // Step 2: User selected a team
            const [module] = args.slice(1);
            await showActionTypeSelection(interaction, module, value);
            break;

        case 'action': // Step 3: User selected an action type
            const [moduleFromAction, team] = args.slice(1);
            await showImpactSelection(interaction, moduleFromAction, team, value);
            break;
        
        case 'impact': // Step 4: User selected an impact level
            const [moduleFromImpact, teamFromImpact, actionType] = args.slice(1);
            await showQuickLogModal(interaction, moduleFromImpact, teamFromImpact, actionType, value);
            break;
    }
}

// ... (Existing handleButtonClick function) ...


/**
 * UPDATED MODAL SUBMISSION HANDLER
 * Handles all Modal Submit interactions.
 */
async function handleModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let mcpData;
    let customIdParts = interaction.customId.split('_');

    if (interaction.customId.startsWith('mcp_quick_modal')) {
        const [_, __, module, team, actionType, impactLevel] = customIdParts;
        mcpData = {
            "Staff": interaction.user.tag,
            "Module Affected": module,
            "Team": team, // <-- THE NEW FIELD
            "Type of Action": actionType,
            "Impact Level": impactLevel,
            "Action Summary": interaction.fields.getTextInputValue('action_summary'),
            "Blockers Encountered": interaction.fields.getTextInputValue('blockers'),
            // ... add any other modal fields here ...
        };
    } 
    // ... (Your 'detailed_modal' handler if you still use it) ...
    
    // Send data to n8n (existing logic)
    // ...
}

// =========================================================================
//                             RESPONSE GENERATORS
// =========================================================================

/**
 * NEW - STEP 2
 * Shows the team selection dropdown.
 */
async function showTeamSelection(interaction, selectedModule) {
    const teamSelect = new StringSelectMenuBuilder()
        .setCustomId(`mcp_team_${selectedModule}`) // Pass module info in the ID
        .setPlaceholder('👥 Select Your Team')
        .addOptions([
            { label: 'Creatives', value: 'Creatives', emoji: '🎨' },
            { label: 'Moderation', value: 'Moderation', emoji: '🛡️' },
            { label: 'Automations', value: 'Automations', emoji: '⚙️' },
            { label: 'Customer Service', value: 'Customer Service', emoji: '🎧' },
            { label: 'Council', value: 'Council', emoji: '👑' },
            { label: 'General', value: 'General', emoji: '📋' }
        ]);

    const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`🏢 ${selectedModule} Module Selected`)
        .setDescription('Next, please select which team this log is for.')
        .setTimestamp();

    // Use interaction.reply for the first response, or .update if it's a follow-up.
    // Assuming this is the first ephemeral reply in the chain.
    await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(teamSelect)],
        ephemeral: true
    });
}


/**
 * UPDATED - STEP 3
 * Shows the action type selection, now includes team info.
 */
async function showActionTypeSelection(interaction, module, team) {
    const actionSelect = new StringSelectMenuBuilder()
        .setCustomId(`mcp_action_${module}_${team}`) // Pass module AND team
        .setPlaceholder('⚡ Select Action Type...')
        // ... (your existing action options) ...
    
    const embed = new EmbedBuilder()
        .setColor(0x1abc9c)
        .setTitle(`👥 Team: ${team}`)
        .setDescription(`Now select the type of action performed in **${module}**.`);
    
    await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(actionSelect)] });
}


// All other functions (`showImpactSelection`, `showQuickLogModal`, etc.)
// must be updated to accept `team` as a parameter and pass it along in their `customId`.
// For example: .setCustomId(`mcp_impact_${module}_${team}_${actionType}`)

// ... (The rest of your bot code) ...