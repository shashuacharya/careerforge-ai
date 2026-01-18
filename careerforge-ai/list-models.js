// List available models
const API_KEY = 'AIzaSyC-7HJhxy-3RRYfj99L9Z3pVPmJNNUlNzs';

async function listModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${API_KEY}`);
        const data = await response.json();

        console.log('Available models:');
        data.models.forEach(model => {
            if (model.supportedGenerationMethods?.includes('generateContent')) {
                console.log(`✅ ${model.name}`);
            }
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

listModels();
