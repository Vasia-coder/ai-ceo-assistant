require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Настройка Google Sheets API
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const sheetId = process.env.GOOGLE_SHEET_ID;

// Обработка всех входящих сообщений
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  const userId = ctx.from.username || ctx.from.id;

  // Добавление задачи в таблицу
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'CEO!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[new Date().toISOString(), userId, userMessage]],
      },
    });
  } catch (err) {
    console.error('Ошибка записи в таблицу:', err.message);
  }

  // Ответ через OpenRouter (DeepSeek)
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Ты — виртуальный CEO помощник, помогаешь вести бизнес, думаешь стратегически.' },
          { role: 'user', content: userMessage },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const aiReply = response.data.choices?.[0]?.message?.content || 'Извините, произошла ошибка.';

    await ctx.reply(aiReply);
  } catch (err) {
    console.error('Ошибка запроса к OpenRouter:', err.message);
    await ctx.reply('Произошла ошибка при обращении к AI. Попробуйте позже.');
  }
});

bot.launch();
console.log('AI CEO бот запущен...');