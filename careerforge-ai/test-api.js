// Test with gemini-2.5-flash
const API_KEY = process.env.VITE_GEMINI_API_KEY || 'YOUR_API_KEY_HERE';
const API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';

async function testAPI() {
    try {
        const response = await fetch(`${API_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: 'Say hello in one word' }]
                }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ API Error:', data);
            console.error('Status:', response.status);
            console.error('Error Message:', data.error?.message || 'Unknown error');
        } else {
            console.log('✅ API Key is working with gemini-2.5-flash!');
            console.log('Response:', data.candidates[0].content.parts[0].text);
        }
    } catch (error) {
        console.error('Network Error:', error);
    }
}

testAPI();
