require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🔄 Enregistrement de ${commands.length} commande(s)...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID || "missing",
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log(`✅ ${data.length} commande(s) enregistrée(s) avec succès !`);
    console.log(
      "Commandes :",
      data.map((c) => `/${c.name}`).join(", ")
    );
  } catch (error) {
    console.error("❌ Erreur lors de l'enregistrement :", error);
  }
})();
