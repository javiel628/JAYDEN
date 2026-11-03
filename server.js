import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  // Replace this with the real bot connection state when integrating JAYDEN.
  res.json({ connected: false, status: "Not connected", integration: "pending" });
});

app.post("/api/pair", (_req, res) => {
  // Pairing must be implemented using the exact WhatsApp library in the bot.
  // Never accept/store WhatsApp session credentials in this public website.
  res.status(501).json({
    error: "Pairing integration is not connected yet.",
    message: "Upload the JAYDEN source ZIP so this endpoint can be wired to its WhatsApp client."
  });
});

app.listen(PORT, () => console.log(`SHADOW MD portal running on port ${PORT}`));
