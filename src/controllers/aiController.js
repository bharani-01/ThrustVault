'use strict';

const systemPrompt = `You are the ThrustVault AI Copilot, an expert UAV propulsion systems specialist and drone aerospace engineer.
Your purpose is to answer users' questions about motor specifications, stator sizes, KV selections, propeller matching, ESC configurations, battery choices, and test bench run interpretations.
Give detailed, technical, data-centric, and clear answers. Keep advice actionable and reference typical industry standards (e.g. BrotherHobby, T-Motor, KDE Direct, APC, Carbon Fiber props, LiPo batteries).
Refuse to discuss topics unrelated to aerospace propulsion systems, ThrustVault platform, or general drone engineering. Keep your tone helpful, professional, and precise.`;

async function getChatCompletions(req, res) {
  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing or invalid messages list' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  const modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  if (!apiKey) {
    return res.status(500).json({ error: 'Groq API Key is not configured on the server.' });
  }

  try {
    // Inject system prompt at the beginning of message list
    const outboundMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages: outboundMessages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Groq API Error] Status: ${response.status}, Details: ${errorText}`);
      return res.status(response.status).json({ error: `Groq API error: Status ${response.status}` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    return res.json({ reply });

  } catch (err) {
    console.error('[AI Controller Error]', err.message);
    return res.status(500).json({ error: 'Failed to communicate with AI chat completions.' });
  }
}

module.exports = {
  getChatCompletions
};
