/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { Upload, Mic, MicOff, ChevronRight, Lightbulb, CheckCircle, AlertCircle, Loader2, TrendingUp, Award, Target, BarChart3 } from 'lucide-react';

// Load PDF.js and Mammoth libraries
const loadExternalLibraries = () => {
  if (!document.getElementById('pdfjs-script')) {
    const pdfScript = document.createElement('script');
    pdfScript.id = 'pdfjs-script';
    pdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    document.head.appendChild(pdfScript);
  }
  
  if (!document.getElementById('mammoth-script')) {
    const mammothScript = document.createElement('script');
    mammothScript.id = 'mammoth-script';
    mammothScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    document.head.appendChild(mammothScript);
  }
};

loadExternalLibraries();

// Fixed Zustand-like Store
const createStore = (initialState) => {
  let state = initialState;
  const listeners = new Set();

  const getState = () => state;
  
  const setState = (partial) => {
    const newState = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...newState };
    // Use queueMicrotask to avoid synchronous updates during render
    queueMicrotask(() => {
      listeners.forEach(listener => listener());
    });
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getState, setState, subscribe };
};

const store = createStore({
  resumeFile: null,
  jobDescription: '',
  technicalQuestions: [],
  behavioralQuestions: [],
  interviewMode: null,
  currentQuestionIndex: 0,
  answers: {},
  feedback: {},
  suggestions: {},
  followUpQuestions: {},
  questionHistory: [],
  currentQuestion: '',
  difficultyLevel: 'medium',
  selectedLevel: null
});

const useStore = (selector = (state) => state) => {
  const state = useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
  
  return [state, store.setState];
};
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';

// Helper function to call Gemini API
const callGeminiAPI = async (prompt, fileData = null) => {
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

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error Details:', errorData);
      throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
};

// Check if text is a resume
const isResumeFormat = (text) => {
  if (!text || text.length < 100) return false;
  
  const lowercaseText = text.toLowerCase();
  
  // Common resume sections/keywords
  const resumeKeywords = [
    'resume', 'cv', 'curriculum vitae',
    'experience', 'work experience', 'employment history',
    'education', 'academic background',
    'skills', 'technical skills', 'professional skills',
    'projects', 'personal projects',
    'certifications', 'licenses',
    'summary', 'objective', 'profile',
    'contact', 'phone', 'email', 'linkedin',
    'achievements', 'accomplishments',
    'work history', 'professional experience'
  ];
  
  // Check for multiple resume indicators
  let score = 0;
  
  // Check for section headers
  const hasExperience = /(experience|work history|employment)/i.test(text);
  const hasEducation = /(education|academic)/i.test(text);
  const hasSkills = /(skills|technical|programming)/i.test(text);
  
  // Check for date formats common in resumes
  const hasDates = /\b(20\d{2}|19\d{2}|present|current)\b/i.test(text);
  
  // Check for bullet points or lists
  // eslint-disable-next-line no-useless-escape
  const hasBulletPoints = /(•|\-|\*|\d\.)/.test(text);
  
  // Check for job titles
  const hasJobTitles = /\b(intern|developer|engineer|analyst|manager|director|lead|senior|junior)\b/i.test(text);
  
  // Calculate score
  if (hasExperience) score += 2;
  if (hasEducation) score += 2;
  if (hasSkills) score += 1;
  if (hasDates) score += 1;
  if (hasBulletPoints) score += 1;
  if (hasJobTitles) score += 1;
  
  // At least 5 points to be considered a resume
  return score >= 5;
};

// Extract text from file
const extractTextFromFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const fileExt = file.name.split('.').pop().toLowerCase();
    const maxSize = 10 * 1024 * 1024;
    
    if (file.size > maxSize) {
      reject(new Error('File too large. Please upload a file smaller than 10MB.'));
      return;
    }
    
    reader.onload = async (e) => {
      try {
        let text = '';
        
        if (fileExt === 'txt') {
          text = e.target.result;
        } else if (fileExt === 'pdf') {
          try {
            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            
            const typedArray = new Uint8Array(e.target.result);
            const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
            
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items.map(item => item.str).join(' ');
              fullText += pageText + '\n';
            }
            text = fullText;
          } catch (pdfError) {
            console.error('PDF parsing error:', pdfError);
            reject(new Error('Failed to parse PDF file. Please ensure it is a valid PDF document.'));
            return;
          }
        } else if (fileExt === 'docx') {
          try {
            const mammoth = window.mammoth;
            const arrayBuffer = e.target.result;
            const result = await mammoth.extractRawText({ arrayBuffer });
            text = result.value;
          } catch (docxError) {
            console.error('DOCX parsing error:', docxError);
            reject(new Error('Failed to parse DOCX file. Please ensure it is a valid Word document.'));
            return;
          }
        } else if (fileExt === 'doc') {
          reject(new Error('Old .doc format detected. Please convert to .docx or .pdf.'));
          return;
        } else {
          reject(new Error('Unsupported file format. Please upload PDF, DOCX, DOC, or TXT files.'));
          return;
        }
        
        // Validate if it's a resume format
        if (!isResumeFormat(text)) {
          reject(new Error('The uploaded file does not appear to be a resume. Please upload a valid resume document.'));
          return;
        }
        
        resolve({
          isBase64: false,
          text: text.trim() || `Resume uploaded: ${file.name}`,
          fileName: file.name
        });
      } catch (error) {
        reject(new Error(`Failed to read file: ${error.message}`));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    
    if (fileExt === 'pdf' || fileExt === 'docx' || fileExt === 'doc') {
      reader.readAsArrayBuffer(file);
    } else if (fileExt === 'txt') {
      reader.readAsText(file);
    } else {
      reject(new Error('Unsupported file format'));
    }
  });
};

// New helper function to format answers with sections
const formatAnswerWithSections = (text) => {
  if (!text) return { isStructured: true, sections: [] };
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const sections = [];
  let currentSection = { title: '', points: [] };
  
  for (const line of lines) {
    // Check for section headers (ending with colon)
    if (line.match(/^[A-Z][A-Z\s]+:$/) || line.match(/^[A-Z][a-zA-Z\s]+:$/)) {
      if (currentSection.title || currentSection.points.length > 0) {
        sections.push({ ...currentSection });
      }
      currentSection = { 
        title: line.replace(':', '').trim(), 
        points: [],
        isParagraph: line.includes('SAMPLE ANSWER')
      };
    } 
    // Check for bullet points
    else if (line.match(/^[•\-–—]\s+/) || line.match(/^\d+\.\s+/)) {
      // eslint-disable-next-line no-useless-escape
      currentSection.points.push(line.replace(/^[•\-–—\d\.]\s+/, '').trim());
    }
    // Long lines might be paragraph content
    else if (currentSection.title === 'SAMPLE ANSWER' && line.length > 20) {
      currentSection.points.push(line);
    }
    // Regular content
    else if (line.length > 10) {
      currentSection.points.push(line);
    }
  }
  
  if (currentSection.title || currentSection.points.length > 0) {
    sections.push({ ...currentSection });
  }
  
  return {
    isStructured: true,
    sections: sections
  };
};

// Format suggestion text into structured format
const formatSuggestionText = (text) => {
  if (!text) return '';
  
  // Remove markdown formatting
  let formatted = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`/g, '');
  
  // Split into lines and clean up
  const lines = formatted.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Group lines into sections
  const sections = [];
  let currentSection = { title: '', points: [] };
  
  for (const line of lines) {
    if (line.match(/^(Structure|Key Points|Examples|Tips|Steps|Approach|What to Include|How to Structure|Important Notes|Do's and Don'ts):/i)) {
      if (currentSection.title || currentSection.points.length > 0) {
        sections.push({ ...currentSection });
      }
      currentSection = { title: line.replace(/:/, '').trim(), points: [] };
    } else if (line.match(/^[•\-–—]\s+/)) {
      currentSection.points.push(line.replace(/^[•\-–—]\s+/, '').trim());
    } else if (line.match(/^\d+\.\s+/)) {
      currentSection.points.push(line.replace(/^\d+\.\s+/, '').trim());
    } else if (currentSection.title) {
      currentSection.points.push(line);
    } else if (line.length > 50) { // Consider long lines as new section titles
      if (currentSection.points.length > 0) {
        sections.push({ ...currentSection });
      }
      currentSection = { title: line, points: [] };
    }
  }
  
  if (currentSection.title || currentSection.points.length > 0) {
    sections.push({ ...currentSection });
  }
  
  // If we couldn't parse into sections, return as bullet points
  if (sections.length === 0) {
    return {
      isStructured: false,
      content: formatted
    };
  }
  
  return {
    isStructured: true,
    sections: sections
  };
};

// AI Functions using Gemini API
const analyzeResumeAndGenerateQuestions = async (resumeFile, jobDescription, difficultyLevel = 'medium') => {
  try {
    console.log('Starting resume analysis...');
    const resumeData = await extractTextFromFile(resumeFile);
    console.log('Resume text extracted, length:', resumeData.text.length);
    
    const difficultyPrompt = {
      'beginner': 'Generate basic, fundamental questions suitable for entry-level/junior positions.',
      'medium': 'Generate practical, experience-based questions suitable for mid-level positions.',
      'advanced': 'Generate complex, system-level and leadership questions suitable for senior/expert positions.'
    }[difficultyLevel] || '';
    
    const prompt = `You are an expert interview coach. Analyze the resume provided and generate personalized interview questions.

Resume Content:
${resumeData.text}

${jobDescription ? `Target Job Description: ${jobDescription}` : 'Generate questions for a general technical role'}

${difficultyPrompt}

IMPORTANT: Analyze the resume content carefully and generate TWO SEPARATE types of questions based on the candidate's experience, skills, and projects mentioned in their resume:

1. TECHNICAL QUESTIONS (5 questions):
   - Focus on technical skills, technologies, and tools mentioned in the resume
   - Ask about projects, architectures, and technical decisions they made
   - Reference specific technologies from their resume
   - Difficulty level: ${difficultyLevel}

2. BEHAVIORAL QUESTIONS (5 questions):
   - Focus on past experiences, challenges, and achievements from their resume
   - Use STAR method format (Situation, Task, Action, Result)
   - Reference specific projects or roles from the resume
   - Start with: "Tell me about a time...", "Describe a situation...", "In your role at [company]..."

You MUST respond with ONLY valid JSON in this exact format (no extra text, no markdown):
{
  "technicalQuestions": [
    "technical question 1 based on resume",
    "technical question 2 based on resume",
    "technical question 3 based on resume",
    "technical question 4 based on resume",
    "technical question 5 based on resume"
  ],
  "behavioralQuestions": [
    "Tell me about a time when [behavioral question 1 based on resume]",
    "Describe a situation where [behavioral question 2 based on resume]",
    "In your experience with [behavioral question 3 based on resume]",
    "Share an example of [behavioral question 4 based on resume]",
    "Tell me about [behavioral question 5 based on resume]"
  ]
}

CRITICAL: The questions MUST be personalized based on the resume content. Reference specific technologies, projects, or experiences from the resume.`;

    console.log('Calling Gemini API for question generation...');
    const response = await callGeminiAPI(prompt, resumeData);
    console.log('API Response received:', response.substring(0, 200) + '...');
    
    let jsonStr = response.trim();
    
    // Clean JSON string
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    jsonStr = jsonStr.replace(/^[\s\S]*?\{/, '{');
    jsonStr = jsonStr.replace(/\}[\s\S]*$/, '}');
    
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('Parsed questions:', {
          technicalCount: parsed.technicalQuestions?.length,
          behavioralCount: parsed.behavioralQuestions?.length
        });
        
        if (parsed.technicalQuestions && parsed.behavioralQuestions && 
            Array.isArray(parsed.technicalQuestions) && 
            Array.isArray(parsed.behavioralQuestions)) {
          
          // Ensure we have exactly 5 questions each
          const technicalQuestions = parsed.technicalQuestions.slice(0, 5);
          const behavioralQuestions = parsed.behavioralQuestions.slice(0, 5);
          
          // Fill missing questions if needed
          while (technicalQuestions.length < 5) {
            technicalQuestions.push(`Technical question about ${difficultyLevel} concepts`);
          }
          while (behavioralQuestions.length < 5) {
            behavioralQuestions.push(`Behavioral question about teamwork and collaboration`);
          }
          
          return {
            technicalQuestions,
            behavioralQuestions
          };
        }
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Response that failed to parse:', jsonStr);
      }
    }
    
    console.log('Failed to parse valid questions from API, using fallback...');
    throw new Error('Failed to parse questions from AI response');
    
  } catch (error) {
    console.error('Error generating questions:', error);
    
    // Fallback questions based on difficulty level
    const fallbackQuestions = {
      'beginner': {
        technicalQuestions: [
          "Explain the concept of variables and data types in programming.",
          "What is version control and why is it important?",
          "Describe the difference between front-end and back-end development.",
          "What are the basic HTTP methods and their purposes?",
          "Explain what a database is and give an example of when you would use one."
        ],
        behavioralQuestions: [
          "Tell me about a time when you learned a new programming concept.",
          "Describe a group project you worked on and your role in it.",
          "How do you approach solving a coding problem you've never seen before?",
          "What do you do when you get stuck on a technical problem?",
          "Why are you interested in a career in this field?"
        ]
      },
      'medium': {
        technicalQuestions: [
          "Explain the concept of closures in JavaScript and provide a practical use case.",
          "What is the difference between SQL and NoSQL databases? When would you use each?",
          "Describe the SOLID principles in object-oriented programming.",
          "How does React's Virtual DOM work and what are its benefits?",
          "Explain the concept of CI/CD and its importance in modern software development."
        ],
        behavioralQuestions: [
          "Tell me about a time when you had to debug a critical production issue under pressure.",
          "Describe a situation where you disagreed with a team member. How did you handle it?",
          "Share an example of a project where you had to learn a new technology quickly.",
          "How do you prioritize tasks when working on multiple projects with tight deadlines?",
          "Tell me about a time when you received constructive criticism. How did you respond?"
        ]
      },
      'advanced': {
        technicalQuestions: [
          "Design a scalable microservices architecture for a high-traffic e-commerce platform.",
          "Explain how you would implement a distributed caching system and handle cache invalidation.",
          "Describe the trade-offs between different database replication strategies.",
          "How would you design a system to handle 1 million concurrent WebSocket connections?",
          "Explain the CAP theorem and its implications for distributed system design."
        ],
        behavioralQuestions: [
          "Describe a time when you had to lead a major architectural redesign. What challenges did you face?",
          "How do you mentor junior engineers and help them grow in their careers?",
          "Tell me about a time you had to make a critical technical decision with incomplete information.",
          "Describe your approach to managing technical debt in a large codebase.",
          "How do you handle conflict between engineering teams with different technical priorities?"
        ]
      }
    };
    
    return fallbackQuestions[difficultyLevel] || fallbackQuestions.medium;
  }
};

const analyzeCandidateAnswer = async (question, answer) => {
  try {
    const prompt = `You are a strict technical interview evaluator. Analyze this interview answer and provide ACCURATE scoring from 0-100.

Question: ${question}
Answer: ${answer}

CRITERIA FOR SCORING (0-100):
- 90-100: Excellent - Clear, detailed, specific examples, correct technical depth
- 80-89: Good - Covers main points, some examples, mostly correct
- 70-79: Average - Basic understanding, vague, lacks examples
- 60-69: Below Average - Incomplete, technical inaccuracies
- Below 60: Poor - Major gaps or incorrect information

You MUST provide an accurate score based on content quality. Provide specific, actionable feedback.

Respond with ONLY valid JSON (no markdown):
{
  "score": <integer 0-100>,
  "feedback": "<2-3 sentences of specific feedback>",
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"],
  "ratingExplanation": "<brief explanation of why this score>"
}`;

    const response = await callGeminiAPI(prompt);
    
    // Clean up response
    let jsonStr = response.trim()
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^[\s\S]*?\{/, '{')  // Remove any text before first {
      .replace(/\}[\s\S]*$/, '}');   // Remove any text after last }
    
    try {
      const parsed = JSON.parse(jsonStr);
      
      // Validate score
      if (parsed.score < 0 || parsed.score > 100) {
        parsed.score = Math.max(0, Math.min(100, parsed.score));
      }
      
      // Ensure all required fields
      return {
        score: parsed.score || 75,
        feedback: parsed.feedback || "Your answer shows understanding. Consider adding more specific examples.",
        strengths: parsed.strengths || ["Clear communication"],
        improvements: parsed.improvements || ["Add more specific examples"],
        ratingExplanation: parsed.ratingExplanation || "Based on general answer quality"
      };
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Response:', response);
      
      // Fallback: Analyze the response for score keywords
      const text = response.toLowerCase();
      let score = 75;
      
      if (text.includes('excellent') || text.includes('outstanding') || text.includes('perfect')) {
        score = 95;
      } else if (text.includes('very good') || text.includes('great')) {
        score = 85;
      } else if (text.includes('good') || text.includes('solid')) {
        score = 78;
      } else if (text.includes('average') || text.includes('adequate')) {
        score = 70;
      } else if (text.includes('below average') || text.includes('needs improvement')) {
        score = 60;
      } else if (text.includes('poor') || text.includes('weak')) {
        score = 50;
      }
      
      return {
        score: score,
        feedback: "Your answer has been evaluated. " + (response.length > 200 ? response.substring(0, 200) + "..." : response),
        strengths: ["Answer submitted", "Relevant to question"],
        improvements: ["Review feedback above for specific improvements"],
        ratingExplanation: "Score determined based on answer quality analysis"
      };
    }
  } catch (error) {
    console.error('Error analyzing answer:', error);
    return {
      score: 75,
      feedback: "Your answer has been received. For detailed feedback, ensure you're providing specific examples and clear explanations.",
      strengths: ["Answer submitted", "Timely response"],
      improvements: ["Add specific metrics", "Include real examples", "Explain technical concepts clearly"],
      ratingExplanation: "Default score - provide more details for accurate evaluation"
    };
  }
};

const suggestBestAnswer = async (question) => {
  try {
    const prompt = `You are an expert technical interviewer. Provide a COMPLETE SAMPLE ANSWER for this interview question that would score 95+/100.

Question: ${question}

Provide a complete, well-structured answer that includes:
1. Clear introduction/overview
2. Specific technical details and examples
3. Personal experience/real scenarios
4. Results/outcomes with metrics
5. Key takeaways/learnings

FORMAT THE ANSWER AS FOLLOWS:
SAMPLE ANSWER:
[Start with a complete paragraph introducing your approach]

DETAILED EXPLANATION:
• [Break down the key components]
• [Include specific examples]
• [Mention technologies/tools used]
• [Discuss challenges and solutions]

EXAMPLE SCENARIO:
• [Describe a real project/situation]
• [Include numbers/metrics/results]
• [Explain your role and actions]

KEY POINTS TO REMEMBER:
• [Summarize critical elements]
• [Common pitfalls to avoid]
• [How to adapt to similar questions]

Make the answer:
- 250-400 words total
- Professional but conversational
- Include specific numbers ("improved performance by 40%", "reduced latency from 200ms to 50ms")
- Reference real technologies and tools
- Show both technical depth and communication skills`;

    const response = await callGeminiAPI(prompt);
    
    // Format for display with sections
    const formatted = formatAnswerWithSections(response);
    return formatted;
  } catch (error) {
    console.error('Error suggesting answer:', error);
    return formatAnswerWithSections(`SAMPLE ANSWER:
When addressing "${question}", I would approach it by first understanding the core requirements and then applying systematic problem-solving.

DETAILED EXPLANATION:
• Start by clarifying the problem scope and constraints
• Break down complex problems into manageable components
• Apply relevant design patterns or architectural principles
• Consider edge cases and failure scenarios
• Optimize for performance, scalability, and maintainability

EXAMPLE SCENARIO:
• In my previous role, I implemented a caching solution using Redis
• This reduced API response times from 300ms to 50ms (83% improvement)
• The system handled 10,000+ concurrent users with 99.9% uptime
• I used monitoring tools like New Relic to track performance metrics

KEY POINTS TO REMEMBER:
• Always start with requirements clarification
• Discuss trade-offs between different approaches
• Include specific metrics and results
• Show how you learned from the experience
• Connect back to business impact`);
  }
};

const generateFollowUpQuestion = async (question, answer) => {
  try {
    const prompt = `You are an expert interviewer. Based on the candidate's answer, generate a relevant follow-up question that digs deeper.

Original Question: ${question}
Candidate's Answer: ${answer}

Generate one thoughtful follow-up question that helps explore their understanding further or clarifies specific points.`;

    return await callGeminiAPI(prompt);
  } catch (error) {
    console.error('Error generating follow-up:', error);
    return "Can you elaborate on how you would handle a situation where the initial approach doesn't work as expected?";
  }
};

// Toast Component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
      type === 'error' ? 'bg-red-500' : 'bg-green-500'
    } text-white`}>
      {type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
      <span>{message}</span>
    </div>
  );
};

// Voice Recorder Component with Real Speech Recognition
const VoiceRecorder = ({ onTranscription }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const isStoppingRef = useRef(false);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('Speech recognition started');
      finalTranscriptRef.current = '';
      isStoppingRef.current = false;
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        finalTranscriptRef.current += finalTranscript;
      }

      console.log('Current transcript:', finalTranscriptRef.current + interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      // Ignore 'aborted' errors when we intentionally stop
      if (event.error === 'aborted' && isStoppingRef.current) {
        return;
      }
      
      // Ignore 'no-speech' errors
      if (event.error === 'no-speech') {
        console.log('No speech detected, continuing...');
        return;
      }
      
      // For other errors, stop recording and alert user
      if (event.error !== 'aborted') {
        setTimeout(() => {
          setIsRecording(false);
          setIsProcessing(false);
          alert(`Speech recognition error: ${event.error}. Please check your microphone and try again.`);
        }, 0);
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended, isRecording:', isRecordingRef.current, 'isStopping:', isStoppingRef.current);
      
      // Only restart if we're still supposed to be recording and not intentionally stopping
      if (isRecordingRef.current && !isStoppingRef.current) {
        try {
          console.log('Restarting recognition...');
          recognition.start();
        } catch (e) {
          console.error('Failed to restart recognition:', e);
          setTimeout(() => setIsRecording(false), 0);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        isStoppingRef.current = true;
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log('Cleanup stop failed:', e);
        }
      }
    };
  }, []);

  const handleRecord = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (!isRecording) {
      // Start recording
      finalTranscriptRef.current = '';
      isStoppingRef.current = false;
      setIsRecording(true);
      
      try {
        if (recognitionRef.current) {
          recognitionRef.current.start();
        }
      } catch (error) {
        console.error('Failed to start recording:', error);
        setIsRecording(false);
        alert('Failed to start recording. Please check microphone permissions and try again.');
      }
    } else {
      // Stop recording
      isStoppingRef.current = true;
      setIsRecording(false);
      setIsProcessing(true);
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log('Stop error:', e);
        }
      }
      
      // Wait a bit for final results to come in
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const transcript = finalTranscriptRef.current.trim();
      
      if (transcript && transcript.length > 0) {
        console.log('Final transcript:', transcript);
        onTranscription(' ' + transcript);
      } else {
        alert('No speech detected. Please speak clearly and try again. Make sure your microphone is working and you have granted permissions.');
      }
      
      setIsProcessing(false);
      finalTranscriptRef.current = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleRecord}
        disabled={isProcessing}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
          isRecording 
            ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
            : 'bg-blue-600 hover:bg-blue-700'
        } text-white disabled:opacity-50`}
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" size={20} />
        ) : isRecording ? (
          <MicOff size={20} />
        ) : (
          <Mic size={20} />
        )}
        {isProcessing ? 'Processing...' : isRecording ? 'Stop Recording' : 'Voice Answer'}
      </button>
      {isRecording && (
        <span className="text-sm text-red-400 animate-pulse">● Recording... Speak now!</span>
      )}
    </div>
  );
};

// Structured Suggestion Display Component
const StructuredSuggestion = ({ suggestion }) => {
  if (!suggestion) return null;
  
  if (!suggestion.isStructured) {
    return (
      <div className="text-sm whitespace-pre-line bg-gray-900/30 p-4 rounded-lg">
        {suggestion.content}
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {suggestion.sections.map((section, index) => (
        <div key={index} className="space-y-3">
          {section.title && (
            <h5 className={`font-bold ${
              section.title === 'SAMPLE ANSWER' 
                ? 'text-green-400 text-lg' 
                : 'text-blue-300 text-sm'
            }`}>
              {section.title}
              {section.title === 'SAMPLE ANSWER' && (
                <span className="ml-2 text-sm text-yellow-400">(Score: 95+/100)</span>
              )}
            </h5>
          )}
          
          {section.points.length > 0 && (
            <div className="pl-4 space-y-2">
              {section.title === 'SAMPLE ANSWER' ? (
                <div className="text-gray-200 bg-gray-900/50 p-4 rounded-lg border-l-4 border-green-500">
                  {section.points.map((point, pointIndex) => (
                    <p key={pointIndex} className="mb-2 last:mb-0">
                      {point}
                    </p>
                  ))}
                </div>
              ) : section.points.every(p => p.includes('•') || p.includes('-')) ? (
                <ul className="space-y-2">
                  {section.points.map((point, pointIndex) => (
                    <li key={pointIndex} className="flex items-start">
                      <span className="text-blue-400 mr-2 mt-1">•</span>
                      <span className="text-gray-300">{point}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-gray-300">
                  {section.points.map((point, pointIndex) => (
                    <div key={pointIndex} className="mb-2 last:mb-0">
                      {point}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// Question Card Component
const QuestionCard = ({ question, index, type }) => {
  const [state, setState] = useStore(s => s);
  const [answer, setAnswer] = useState(state.answers[`${type}-${index}`] || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleAnalyze = async () => {
    if (!answer.trim()) return;
    setIsAnalyzing(true);
    const result = await analyzeCandidateAnswer(question, answer);
    setState({
      feedback: { ...state.feedback, [`${type}-${index}`]: result }
    });
    setIsAnalyzing(false);
  };

  const handleSuggest = async () => {
    setIsSuggesting(true);
    const suggestion = await suggestBestAnswer(question);
    setState({
      suggestions: { ...state.suggestions, [`${type}-${index}`]: suggestion }
    });
    setIsSuggesting(false);
  };

  const handleAnswerChange = (value) => {
    setAnswer(value);
    setState({
      answers: { ...state.answers, [`${type}-${index}`]: value }
    });
  };

  const feedback = state.feedback[`${type}-${index}`];
  const suggestion = state.suggestions[`${type}-${index}`];

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800 transition-colors"
      >
        <span className="text-left font-medium">Question {index + 1}: {question}</span>
        <ChevronRight className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} size={20} />
      </button>
      
      {isOpen && (
        <div className="p-4 space-y-4 border-t border-gray-700">
          <div>
            <label className="block text-sm font-medium mb-2">Your Answer</label>
            <textarea
              value={answer}
              onChange={(e) => handleAnswerChange(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]"
              placeholder="Type your answer here..."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <VoiceRecorder onTranscription={(text) => handleAnswerChange(answer + ' ' + text)} />
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !answer.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
              {isAnalyzing ? 'Analyzing...' : 'Analyze Answer'}
            </button>
            <button
              onClick={handleSuggest}
              disabled={isSuggesting}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {isSuggesting ? <Loader2 className="animate-spin" size={20} /> : <Lightbulb size={20} />}
              {isSuggesting ? 'Generating...' : 'Get Suggestion'}
            </button>
          </div>

          {feedback && (
            <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">AI Feedback</h4>
                <span className="text-2xl font-bold text-green-400">{feedback.score}/100</span>
              </div>
              <p className="text-sm mb-3">{feedback.feedback}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-sm font-semibold text-green-400 mb-1">Strengths</h5>
                  <ul className="text-sm space-y-1">
                    {feedback.strengths.map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
                <div>
                  <h5 className="text-sm font-semibold text-yellow-400 mb-1">Areas to Improve</h5>
                  <ul className="text-sm space-y-1">
                    {feedback.improvements.map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
              </div>
              {feedback.ratingExplanation && (
                <div className="mt-2 text-xs text-gray-400 italic">
                  {feedback.ratingExplanation}
                </div>
              )}
            </div>
          )}

          {suggestion && (
            <div className="p-4 bg-purple-900/20 border border-purple-700 rounded-lg">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Lightbulb size={18} />
                Complete Sample Answer (95+/100)
              </h4>
              <div className="text-sm">
                <StructuredSuggestion suggestion={suggestion} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Interactive Interview Component
const InteractiveInterview = () => {
  const [state, setState] = useStore(s => s);
  const [currentType, setCurrentType] = useState('technical');
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false);

  const questions = currentType === 'technical' ? state.technicalQuestions : state.behavioralQuestions;
  const currentQuestion = questions[state.currentQuestionIndex];
  const key = `${currentType}-${state.currentQuestionIndex}`;
  const feedback = state.feedback[key];
  const suggestion = state.suggestions[key];
  const followUp = state.followUpQuestions[key];

  const handleSubmit = async () => {
    if (!answer.trim()) return;
    setIsSubmitting(true);
    
    setState({
      answers: { ...state.answers, [key]: answer }
    });

    const [feedbackResult, suggestionResult] = await Promise.all([
      analyzeCandidateAnswer(currentQuestion, answer),
      suggestBestAnswer(currentQuestion)
    ]);

    setState({
      feedback: { ...state.feedback, [key]: feedbackResult },
      suggestions: { ...state.suggestions, [key]: suggestionResult }
    });

    setIsSubmitting(false);
    setHasSubmitted(true);
  };

  const handleNext = () => {
    if (state.currentQuestionIndex < questions.length - 1) {
      setState({ currentQuestionIndex: state.currentQuestionIndex + 1 });
      setAnswer('');
      setHasSubmitted(false);
    } else if (currentType === 'technical') {
      setCurrentType('behavioral');
      setState({ currentQuestionIndex: 0 });
      setAnswer('');
      setHasSubmitted(false);
    }
  };

  const handleFollowUp = async () => {
    setIsGeneratingFollowUp(true);
    const followUpQuestion = await generateFollowUpQuestion(currentQuestion, answer);
    setState({
      followUpQuestions: { ...state.followUpQuestions, [key]: followUpQuestion }
    });
    setIsGeneratingFollowUp(false);
  };

  const progress = ((state.currentQuestionIndex + 1) / questions.length) * 100;
  const isLastQuestion = currentType === 'behavioral' && state.currentQuestionIndex === questions.length - 1;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold capitalize">{currentType} Questions</h2>
          <span className="text-sm text-gray-400">
            Question {state.currentQuestionIndex + 1} of {questions.length}
          </span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="text-lg font-medium">{currentQuestion}</div>

        <div>
          <label className="block text-sm font-medium mb-2">Your Answer</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={hasSubmitted}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[150px] disabled:opacity-50"
            placeholder="Type your answer here..."
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <VoiceRecorder onTranscription={(text) => setAnswer(answer + ' ' + text)} />
          {!hasSubmitted && (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !answer.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
              {isSubmitting ? 'Analyzing...' : 'Submit Answer'}
            </button>
          )}
          {hasSubmitted && !isLastQuestion && (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Next Question
              <ChevronRight size={20} />
            </button>
          )}
        </div>

        {feedback && (
          <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">AI Feedback</h4>
              <span className="text-2xl font-bold text-green-400">{feedback.score}/100</span>
            </div>
            <p className="text-sm mb-3">{feedback.feedback}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h5 className="text-sm font-semibold text-green-400 mb-1">Strengths</h5>
                <ul className="text-sm space-y-1">
                  {feedback.strengths.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
              <div>
                <h5 className="text-sm font-semibold text-yellow-400 mb-1">Areas to Improve</h5>
                <ul className="text-sm space-y-1">
                  {feedback.improvements.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
            </div>
            {feedback.ratingExplanation && (
              <div className="mt-2 text-xs text-gray-400 italic">
                {feedback.ratingExplanation}
              </div>
            )}
          </div>
        )}

        {suggestion && (
          <div className="p-4 bg-purple-900/20 border border-purple-700 rounded-lg">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Lightbulb size={18} />
              Complete Sample Answer (95+/100)
            </h4>
            <div className="text-sm">
              <StructuredSuggestion suggestion={suggestion} />
            </div>
          </div>
        )}

        {hasSubmitted && !followUp && (
          <button
            onClick={handleFollowUp}
            disabled={isGeneratingFollowUp}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {isGeneratingFollowUp ? <Loader2 className="animate-spin" size={20} /> : <ChevronRight size={20} />}
            {isGeneratingFollowUp ? 'Generating...' : 'Get Follow-up Question'}
          </button>
        )}

        {followUp && (
          <div className="p-4 bg-indigo-900/20 border border-indigo-700 rounded-lg">
            <h4 className="font-semibold mb-2">Follow-up Question</h4>
            <p className="text-sm">{followUp}</p>
          </div>
        )}
      </div>

      {isLastQuestion && hasSubmitted && (
        <div className="text-center p-6 bg-gray-800 border border-gray-700 rounded-lg">
          <h3 className="text-2xl font-bold mb-2">Interview Complete! 🎉</h3>
          <p className="text-gray-400">You've answered all questions. Great job!</p>
        </div>
      )}
    </div>
  );
};

// Interview Workspace Component
const InterviewWorkspace = () => {
  const [state] = useStore(s => s);
  const [activeTab, setActiveTab] = useState('technical');

  const questions = activeTab === 'technical' ? state.technicalQuestions : state.behavioralQuestions;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('technical')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'technical'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Technical ({state.technicalQuestions.length})
        </button>
        <button
          onClick={() => setActiveTab('behavioral')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'behavioral'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Behavioral ({state.behavioralQuestions.length})
        </button>
      </div>

      <div className="space-y-3">
        {questions.map((question, index) => (
          <QuestionCard
            key={index}
            question={question}
            index={index}
            type={activeTab}
          />
        ))}
      </div>
    </div>
  );
};

// Level Selection Component
const LevelSelection = ({ onNext }) => {
  const [, setState] = useStore();
  const [selectedLevel, setSelectedLevel] = useState(null);

  const levels = [
    { id: 'beginner', name: 'Beginner', icon: '🌱', description: 'Entry-level / Junior positions', details: ['Fundamental concepts', 'Basic implementations'] },
    { id: 'medium', name: 'Intermediate', icon: '🚀', description: 'Mid-level positions', details: ['Practical experience', 'Problem solving'] },
    { id: 'advanced', name: 'Advanced', icon: '⭐', description: 'Senior / Expert positions', details: ['System architecture', 'Leadership'] }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-3">Select Your Interview Level</h2>
        <p className="text-gray-400">Choose the difficulty level that matches your experience</p>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {levels.map((level) => (
          <button
            key={level.id}
            onClick={() => {
              setSelectedLevel(level.id);
              setState({ difficultyLevel: level.id, selectedLevel: level.id });
            }}
            className={`p-6 rounded-lg border-2 transition-all hover:scale-105 text-left ${
              selectedLevel === level.id ? 'border-blue-500 bg-blue-900/30' : 'border-gray-700 bg-gray-800'
            }`}
          >
            <div className="text-4xl mb-3">{level.icon}</div>
            <h3 className="text-xl font-bold mb-2">{level.name}</h3>
            <p className="text-sm text-gray-400 mb-4">{level.description}</p>
            <ul className="space-y-1">
              {level.details.map((detail, idx) => (
                <li key={idx} className="text-xs text-gray-300">• {detail}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      {selectedLevel && (
        <div className="text-center">
          <button onClick={onNext} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-lg font-semibold">
            Continue to Upload Resume <ChevronRight className="inline ml-2" size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

// Mode Selection Component
const ModeSelection = () => {
  const [, setState] = useStore(s => s);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-8">Choose Your Interview Mode</h2>
      <div className="grid md:grid-cols-3 gap-6">
        <button
          onClick={() => setState({ interviewMode: 'classic' })}
          className="p-8 bg-gray-800 border-2 border-gray-700 hover:border-blue-500 rounded-lg transition-all hover:scale-105"
        >
          <h3 className="text-2xl font-bold mb-4">Classic Mode</h3>
          <p className="text-gray-400 mb-4">
            View all questions at once in tabs. Perfect for structured practice and reviewing multiple questions.
          </p>
          <ul className="text-sm text-left space-y-2 text-gray-300">
            <li>• See all questions organized by type</li>
            <li>• Practice at your own pace</li>
            <li>• Easy comparison between answers</li>
          </ul>
        </button>

        <button
          onClick={() => setState({ interviewMode: 'interactive' })}
          className="p-8 bg-gray-800 border-2 border-gray-700 hover:border-blue-500 rounded-lg transition-all hover:scale-105"
        >
          <h3 className="text-2xl font-bold mb-4">Interactive Mode</h3>
          <p className="text-gray-400 mb-4">
            Answer one question at a time with guided feedback. Simulates a real interview experience.
          </p>
          <ul className="text-sm text-left space-y-2 text-gray-300">
            <li>• Step-by-step question flow</li>
            <li>• Immediate AI feedback</li>
            <li>• Follow-up questions available</li>
          </ul>
        </button>

        <button
          onClick={() => setState({ interviewMode: 'analytics' })}
          className="p-8 bg-gradient-to-br from-blue-900/50 to-purple-900/50 border-2 border-blue-700 hover:border-blue-500 rounded-lg transition-all hover:scale-105"
        >
          <div className="text-4xl mb-3">📊</div>
          <h3 className="text-2xl font-bold mb-4">Analytics Mode</h3>
          <p className="text-gray-400 mb-4">
            View your performance dashboard with detailed metrics and improvement insights.
          </p>
          <ul className="text-sm text-left space-y-2 text-gray-300">
            <li>• Performance tracking</li>
            <li>• Score analytics</li>
            <li>• Improvement suggestions</li>
          </ul>
        </button>
      </div>
    </div>
  );
};

// Performance Dashboard Component
const PerformanceDashboard = () => {
  const [state] = useStore();
  const { feedback, answers, technicalQuestions, behavioralQuestions } = state;

  const calculateStats = () => {
    const allFeedback = Object.values(feedback);
    const allAnswers = Object.values(answers);
    const totalQuestions = technicalQuestions.length + behavioralQuestions.length;
    const answeredQuestions = allAnswers.length;
    
    let avgScore = 0;
    if (allFeedback.length > 0) {
      avgScore = Math.round(allFeedback.reduce((sum, f) => sum + (f.score || 0), 0) / allFeedback.length);
    }
    
    const completionRate = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;
    
    // Calculate scores by question type
    const technicalScores = [];
    const behavioralScores = [];
    
    Object.keys(feedback).forEach(key => {
      if (key.startsWith('technical-') && feedback[key].score) {
        technicalScores.push(feedback[key].score);
      } else if (key.startsWith('behavioral-') && feedback[key].score) {
        behavioralScores.push(feedback[key].score);
      }
    });
    
    const avgTechnicalScore = technicalScores.length > 0 
      ? Math.round(technicalScores.reduce((a, b) => a + b, 0) / technicalScores.length)
      : 0;
      
    const avgBehavioralScore = behavioralScores.length > 0
      ? Math.round(behavioralScores.reduce((a, b) => a + b, 0) / behavioralScores.length)
      : 0;

    return {
      totalQuestions,
      answeredQuestions,
      averageScore: avgScore,
      completionRate,
      avgTechnicalScore,
      avgBehavioralScore,
      technicalAnswered: technicalScores.length,
      behavioralAnswered: behavioralScores.length
    };
  };

  const stats = calculateStats();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h2 className="text-3xl font-bold flex items-center gap-3">
        <BarChart3 size={32} /> Performance Analytics
      </h2>
      
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <Target className="text-blue-400 mb-2" size={24} />
          <div className="text-2xl font-bold">{stats.completionRate}%</div>
          <div className="text-sm text-gray-400">Completion Rate</div>
        </div>
        
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <Award className="text-green-400 mb-2" size={24} />
          <div className="text-2xl font-bold">{stats.averageScore}</div>
          <div className="text-sm text-gray-400">Average Score</div>
        </div>
        
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <TrendingUp className="text-yellow-400 mb-2" size={24} />
          <div className="text-2xl font-bold">{stats.avgTechnicalScore}</div>
          <div className="text-sm text-gray-400">Technical Score</div>
        </div>
        
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <CheckCircle className="text-purple-400 mb-2" size={24} />
          <div className="text-2xl font-bold">{stats.avgBehavioralScore}</div>
          <div className="text-sm text-gray-400">Behavioral Score</div>
        </div>
      </div>

      {stats.answeredQuestions > 0 ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4">Progress Overview</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm">Technical Questions</span>
                  <span className="text-sm">{stats.technicalAnswered}/{technicalQuestions.length}</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500"
                    style={{ width: `${(stats.technicalAnswered / technicalQuestions.length) * 100}%` }}
                  />
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm">Behavioral Questions</span>
                  <span className="text-sm">{stats.behavioralAnswered}/{behavioralQuestions.length}</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500"
                    style={{ width: `${(stats.behavioralAnswered / behavioralQuestions.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4">Improvement Tips</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <div className="text-green-400 mt-1">✓</div>
                <span>Focus on providing specific examples in your answers</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="text-green-400 mt-1">✓</div>
                <span>Use the STAR method for behavioral questions</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="text-green-400 mt-1">✓</div>
                <span>Practice explaining technical concepts in simple terms</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="text-green-400 mt-1">✓</div>
                <span>Review feedback for each question to identify patterns</span>
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-xl mb-2">Start answering questions to see your performance analytics!</p>
          <p className="text-gray-400">Your scores and improvement suggestions will appear here as you practice.</p>
        </div>
      )}
    </div>
  );
};

// Resume Uploader Component
const ResumeUploader = ({ onAnalyze }) => {
  const [state, setState] = useStore(s => s);
  const [file, setFile] = useState(null);
  const [jobDesc, setJobDesc] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop().toLowerCase();
      if (!['pdf', 'docx', 'doc', 'txt'].includes(ext)) {
        setToast({ message: 'Please upload only PDF, Word documents, or text files (.pdf, .docx, .doc, .txt)', type: 'error' });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setToast({ message: 'Please upload your resume first', type: 'error' });
      return;
    }

    setIsAnalyzing(true);
    try {
      console.log('Starting resume analysis and question generation...');
      const result = await analyzeResumeAndGenerateQuestions(file, jobDesc, state.difficultyLevel);
      console.log('Questions generated successfully:', {
        technical: result.technicalQuestions?.length,
        behavioral: result.behavioralQuestions?.length
      });
      
      setState({
        resumeFile: file,
        jobDescription: jobDesc,
        technicalQuestions: result.technicalQuestions || [],
        behavioralQuestions: result.behavioralQuestions || []
      });
      
      onAnalyze();
      setToast({ message: 'Resume analyzed successfully! Questions generated.', type: 'success' });
    } catch (error) {
      console.error('Error in handleAnalyze:', error);
      setToast({ 
        message: error.message || 'Failed to analyze resume. Please try again with a valid resume document.', 
        type: 'error' 
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      
      {state.selectedLevel && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 text-center">
          <span className="text-lg font-semibold">
            Selected Level: {state.selectedLevel.charAt(0).toUpperCase() + state.selectedLevel.slice(1)}
          </span>
          <button 
            onClick={() => setState({ selectedLevel: null, difficultyLevel: 'medium' })}
            className="ml-4 text-sm text-blue-300 hover:text-blue-100"
          >
            Change
          </button>
        </div>
      )}
      
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-3">Upload Your Resume *</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-3 px-4 py-8 border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-lg transition-colors"
          >
            <Upload size={24} />
            <span>{file ? file.name : 'Click to upload resume (PDF, DOCX, DOC, TXT)'}</span>
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Accepted formats: PDF, DOCX, DOC, TXT. File must contain resume content with sections like Experience, Education, Skills.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-3">Job Description (Optional)</label>
          <textarea
            value={jobDesc}
            onChange={(e) => setJobDesc(e.target.value)}
            placeholder="Paste the job description here to get tailored questions..."
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[150px]"
          />
        </div>

        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || !file}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors text-lg font-semibold"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="animate-spin" size={24} />
              Analyzing Resume & Generating Questions...
            </>
          ) : (
            <>
              Analyze & Generate Questions
              <ChevronRight size={24} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// Main App Component
export default function CareerForgeAI() {
  const [state] = useStore(s => s);
  const [page, setPage] = useState('home');
  const [showLevelSelection, setShowLevelSelection] = useState(true);

  const hasQuestions = state.technicalQuestions.length > 0 || state.behavioralQuestions.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              CareerForge AI
            </h1>
            <div className="flex items-center gap-3">
              {page === 'interview' && state.interviewMode && (
                <button
                  onClick={() => store.setState({ interviewMode: null })}
                  className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  Change Mode
                </button>
              )}
              {page === 'interview' && (
                <button
                  onClick={() => {
                    setPage('home');
                    setShowLevelSelection(true);
                    window.location.reload();
                  }}
                  className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Start New Session
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        {page === 'home' && (
          <div className="space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-bold">The Personal AI Interview Coach</h2>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                Upload your resume and get AI-powered interview preparation
              </p>
            </div>
            
            {showLevelSelection ? (
              <LevelSelection onNext={() => setShowLevelSelection(false)} />
            ) : (
              <ResumeUploader onAnalyze={() => setPage('interview')} />
            )}
          </div>
        )}

        {page === 'interview' && hasQuestions && (
          <div className="space-y-8">
            {!state.interviewMode ? (
              <ModeSelection />
            ) : state.interviewMode === 'classic' ? (
              <InterviewWorkspace />
            ) : state.interviewMode === 'interactive' ? (
              <InteractiveInterview />
            ) : (
              <PerformanceDashboard />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-900/50 backdrop-blur-sm mt-20">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-gray-400 text-sm">
            © {new Date().getFullYear()} CareerForge AI. Powered by AI to help you succeed.
          </p>
        </div>
      </footer>
    </div>
  );
}
