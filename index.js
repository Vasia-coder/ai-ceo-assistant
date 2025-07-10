require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;
const bot = new Telegraf(process.env.BOT_TOKEN);

// Google Sheets Setup
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// ChatGPT via OpenRouter
async function askOpenRouter(message) {
  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions',
      {
        model: "deepseek-chat",
        messages: [{ role: "user", content: message }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (
      response.data &&
      response.data.choices &&
      response.data.choices.length > 0
    ) {
      return response.data.choices[0].message.content;
    } else {
      return "🤖 Sorry, I didn't get a valid response from the AI.";
    }
  } catch (error) {
    console.error("❌ OpenRouter API error:", error.message);
    return "🤖 Sorry, I couldn't process that due to an API error.";
  }
}

// Handle messages
bot.start((ctx) => ctx.reply('🤖 AI CEO is online and ready to help you!'));
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;

  // Respond like an AI assistant
  const aiResponse = await askOpenRouter(userMessage);
  ctx.reply(aiResponse);

  // Log to Google Sheets
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'CEO!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[new Date().toISOString(), ctx.message.from.username || ctx.message.from.first_name, userMessage]]
      }
    });
  } catch (err) {
    console.error("❌ Google Sheets error:", err.message);
  }
});

// Webhook placeholder for Render
app.get('/', (req, res) => res.send('🤖 AI CEO is running!'));
app.listen(PORT, () => console.log(`✅ Server is running on port ${PORT}`));

bot.launch();
