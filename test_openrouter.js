require('dotenv').config();
const axios = require('axios');

(async () => {
  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions',
      {
        model: "deepseek-chat",
        messages: [{ role: "user", content: "Hello!" }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("✅ Response:", response.data.choices[0].message.content);
  } catch (error) {
    console.error("❌ OpenRouter Error:", error.response?.data || error.message);
  }
})();