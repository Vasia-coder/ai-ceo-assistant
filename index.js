require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const speech = require('@google-cloud/speech');
const { fileURLToPath } = require('url');
const { createWriteStream } = require('fs');
const https = require('https');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Google Sheets Setup
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const SHEET_ID = '1nMldr5S_8bZvJwZRPhGtavH6P7Tjj0IWyjDg-eAFF_U';

// Speech to Text client
const speechClient = new speech.SpeechClient({
  keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH
});

// ChatGPT via OpenRouter
async function askOpenRouter(message) {
  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
      messages: [{ role: "user", content: message }]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      return response.data.choices[0].message.content;
    } else {
      return "🤖 Sorry, I didn't get a valid response from the AI.";
    }
  } catch (error) {
    console.error("❌ OpenRouter API error:", error.message);
    return "🤖 Sorry, I couldn't process that due to an API error.";
  }
}

bot.start((ctx) => ctx.reply('🤖 AI CEO is online and ready to help you!'));

bot.on('voice', async (ctx) => {
  const fileId = ctx.message.voice.file_id;
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const filePath = `./voice_${Date.now()}.ogg`;

  const file = fs.createWriteStream(filePath);
  https.get(fileLink.href, (response) => {
    response.pipe(file);
    file.on('finish', async () => {
      file.close();

      const audioBytes = fs.readFileSync(filePath).toString('base64');
      const audio = {
        content: audioBytes,
      };
      const config = {
        encoding: 'OGG_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'ru-RU',
      };
      const request = {
        audio: audio,
        config: config,
      };

      try {
        const [response] = await speechClient.recognize(request);
        const transcription = response.results.map(r => r.alternatives[0].transcript).join(' ');
        ctx.reply(`🗣️ Распознано: ${transcription}`);

        // Добавим задачу в таблицу
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'CEO!A1',
          valueInputOption: 'RAW',
          requestBody: {
            values: [[
              new Date().toLocaleDateString(),
              transcription,
              'new',
              ctx.message.from.username || 'CEO',
              ''
            ]]
          }
        });

        ctx.reply('✅ Задача добавлена из голосового сообщения.');
      } catch (err) {
        console.error('❌ Ошибка распознавания или записи:', err.message);
        ctx.reply('⚠️ Не удалось обработать голосовое сообщение.');
      }
    });
  });
});

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
        values: [[
          new Date().toLocaleDateString(),           // Date
          userMessage,                               // Task
          'new',                                      // Status
          ctx.message.from.username || 'CEO',        // AssignedTo
          ''                                          // Notes
        ]]
      }
    });
  } catch (err) {
    console.error("❌ Google Sheets error:", err.message);
  }
});

bot.launch({
  webhook: {
    domain: process.env.RENDER_EXTERNAL_HOSTNAME,
    port: process.env.PORT || 10000
  }
});

console.log(`✅ Bot is running via webhook at https://${process.env.RENDER_EXTERNAL_HOSTNAME}`);
