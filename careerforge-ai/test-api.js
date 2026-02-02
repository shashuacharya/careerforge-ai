import fs from 'fs';
import path from 'path';

// Try to get API key from environment or .env file
let API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!API_KEY || API_KEY.includes('YOUR_API_KEY_HERE')) {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            // Look for either VITE_GEMINI_API_KEY or GEMINI_API_KEY
            const match = envContent.match(/VITE_GEMINI_API_KEY=(.*)/) || envContent.match(/GEMINI_API_KEY=(.*)/);
            if (match) {
                API_KEY = match[1].trim();
                // Remove quotes if present
                if ((API_KEY.startsWith('"') && API_KEY.endsWith('"')) || (API_KEY.startsWith("'") && API_KEY.endsWith("'"))) {
                    API_KEY = API_KEY.slice(1, -1);
                }
                console.log('✅ Loaded API Key from .env file');
            }
        }
    } catch (e) {
        console.warn('⚠️ Could not read .env file:', e.message);
    }
}

if (!API_KEY || API_KEY.includes('YOUR_API_KEY_HERE')) {
    console.error('❌ No API Key found. Please set VITE_GEMINI_API_KEY in .env');
    process.exit(1);
}
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
