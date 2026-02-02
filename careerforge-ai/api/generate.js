export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, fileData } = req.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        const parts = [];

        if (fileData && fileData.isBase64) {
            parts.push({
                inline_data: {
                    mime_type: fileData.mimeType,
                    data: fileData.data
                }
            });
            parts.push({ text: prompt });
        } else if (fileData && !fileData.isBase64) {
            parts.push({ text: `${prompt}\n\nResume Content:\n${fileData.text}` });
        } else {
            parts.push({ text: prompt });
        }

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: parts }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        // Return only the text to the client to keep it simple
        const text = data.candidates[0].content.parts[0].text;
        res.status(200).json({ text });
    } catch (error) {
        console.error('Proxy Error:', error);
        // Returns the actual error message for debugging
        res.status(500).json({
            error: error.message || 'Failed to fetch from Gemini',
            details: error.toString()
        });
    }
}
