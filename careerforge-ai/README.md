# 🚀 CareerForge AI

An AI-powered interview preparation coach that helps you practice and improve your interview skills using the power of Google Gemini AI.

## ✨ Features

- 🎯 **Difficulty Levels** - Choose from Beginner, Intermediate, and Advanced tiers.
- 📄 **Smart Resume Analysis** - Upload PDF or DOCX resumes; the AI analyzes your specific experience to generate personalized questions.
- 🎤 **Voice Interaction** - Practice speaking your answers using built-in voice-to-text recording.
- 🤖 **Instant AI Feedback** - Get a score from 0-100 and detailed feedback on your technical and behavioral performance.
- 📊 **Performance Analytics** - Track your progress with visual charts and score breakdowns.
- 💡 **Best Answer Suggestions** - Learn what a high-scoring answer looks like for every question.
- 🔄 **Two Interview Modes** - Choose "Classic" to see all questions at once or "Interactive" for a step-by-step mock interview experience.

## 🚀 Live Demo

Check out the live application here:  
**[https://careerforge-ai-pied.vercel.app](https://careerforge-ai-pied.vercel.app)**

## 💻 Tech Stack

- **Frontend**: React.js with Vite
- **Styling**: Tailwind CSS & Lucide Icons
- **AI Engine**: Google Gemini 2.0 Flash
- **Backend/Security**: Vercel Serverless Functions (Proxying API requests)
- **Libraries**: 
  - `marked`: For AI response formatting
  - `PDF.js`: For client-side resume parsing
  - `Mammoth.js`: For Word document processing

## 🛠️ How to Use

1. **Select Difficulty**: Choose the level that matches the job you are targeting.
2. **Upload Resume**: Provide your resume so the AI can tailor questions to your projects and skills.
3. **Add Job Description (Optional)**: Paste a JD to make the interview even more targeted.
4. **Choose Mode**: 
   - **Classic**: Bulk analysis and preparation.
   - **Interactive**: Real-time simulation.
5. **Answer Questions**: Use your keyboard or the **Voice Answer** button to respond.
6. **Get Feedback**: Receive detailed scores, strengths, and areas for improvement.

## 🔒 Security & Privacy

This project is built with security best practices:
- **API Protection**: Your API keys are never exposed to the frontend. All AI calls are proxied through secure Vercel Serverless Functions.
- **Privacy**: Resume data is processed in real-time to generate questions and is not stored permanently.
- **Client-Side Parsing**: Documents are parsed locally in your browser before being sent to the AI.

## 📝 License

MIT License - feel free to build upon and improve this project!

---
*Created with ❤️ to help developers ace their next interview.*