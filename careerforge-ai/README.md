# 🚀 CareerForge AI

An AI-powered interview preparation coach that helps you practice and improve your interview skills.

## ✨ Features

- 🎯 **Difficulty Levels** - Beginner, Intermediate, and Advanced
- 📄 **Resume Analysis** - Upload PDF/DOCX resumes for personalized questions
- 🎤 **Voice Recording** - Answer questions using voice input
- 🤖 **AI Feedback** - Get instant feedback on your answers with scores
- 📊 **Performance Analytics** - Track your progress and improvement areas
- 💡 **Smart Suggestions** - Get AI-powered answer suggestions
- 🔄 **Two Interview Modes** - Classic (all questions) and Interactive (step-by-step)

## 🛠️ Technologies Used

- React (with Hooks)
- Google Gemini AI API
- Web Speech API (voice recording)
- PDF.js & Mammoth.js (document parsing)
- Tailwind CSS (styling)

## 🚀 Live Demo

[View Live Demo](https://yourusername.github.io/careerforge-ai/)

## 💻 How to Use

1. **Select Difficulty Level** - Choose Beginner, Intermediate, or Advanced
2. **Upload Resume** - Upload your resume (PDF, DOCX, DOC)
3. **Add Job Description** (Optional) - Paste job description for tailored questions
4. **Choose Interview Mode**:
   - **Classic Mode** - View all questions at once
   - **Interactive Mode** - Answer one question at a time
5. **Practice** - Answer questions with text or voice
6. **Get Feedback** - Receive AI-powered feedback and suggestions
7. **Track Progress** - View your performance analytics

## 🎯 Features in Detail

### Difficulty Levels
- **Beginner**: Fundamental concepts, basic implementations
- **Intermediate**: Practical experience, problem-solving
- **Advanced**: System architecture, leadership, complex scenarios

### Performance Analytics
- Overall completion rate
- Average score tracking
- Technical vs Behavioral performance
- Top strengths identification
- Areas for improvement
- Visual progress indicators

## 📝 Browser Compatibility

- ✅ Chrome (Recommended)
- ✅ Edge
- ✅ Safari
- ⚠️ Firefox (Voice recording may not work)

## 🔒 Privacy & Security

- All processing happens in your browser
- Resume data is analyzed by Gemini AI API
- No data is stored permanently
- Voice recordings are processed locally

## 📄 License

MIT License - Feel free to use and modify!

## 👨‍💻 Author

[Your Name](https://github.com/yourusername)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## ⭐ Show your support

Give a ⭐️ if this project helped you!
```

### Create `.gitignore`
1. Create new file: `.gitignore`
2. Add this content:
```
# Dependencies
node_modules/
package-lock.json
yarn.lock

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# OS files
Thumbs.db
.DS_Store

# Build files
dist/
build/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*