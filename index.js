
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN');

bot.start((ctx) => ctx.reply('AI CEO Assistant is online!'));
bot.launch();

app.get('/', (req, res) => {
  res.send('AI CEO Assistant running...');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server is running...');
});
