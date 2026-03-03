require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  ActivityType,
  MessageFlags,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// ============================================
// INITIALISATION DU CLIENT
// ============================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

// ============================================
// CHARGEMENT DES COMMANDES
// ============================================

client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
    console.log(`📦 Commande chargée : /${command.data.name}`);
  }
}

// ============================================
// CHARGEMENT DES EVENTS
// ============================================

const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  client.on(event.name, (...args) => event.execute(...args));
  console.log(`📡 Event chargé : ${event.name}`);
}

// ============================================
// GESTION DES SLASH COMMANDS
// ============================================

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Erreur commande /${interaction.commandName}:`, error);
    const reply = {
      content: "❌ Une erreur est survenue. Réessaie plus tard.",
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// ============================================
// READY
// ============================================

client.once(Events.ClientReady, (c) => {
  console.log(`\n🎲 Bot connecté en tant que ${c.user.tag}`);
  console.log(`📡 Serveurs : ${c.guilds.cache.size}`);
  console.log(`✅ Prêt !\n`);

  c.user.setActivity("les tables de wargame", {
    type: ActivityType.Watching,
  });
});

// ============================================
// LANCEMENT
// ============================================

client.login(process.env.DISCORD_TOKEN);
