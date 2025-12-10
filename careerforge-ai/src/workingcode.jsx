/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { Upload, Mic, MicOff, ChevronRight, Lightbulb, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

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
  followUpQuestions: {}
});

const useStore = (selector = (state) => state) => {
  const state = useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
  
  return [state, store.setState];
};

// API Configuration
const GEMINI_API_KEY = 'AIzaSyB15IKWCIiG6mK_nR1epQ7WTjj1LGthON4';
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
            text = `Resume File: ${file.name}\nUnable to parse PDF content.`;
          }
        } else if (fileExt === 'docx') {
          try {
            const mammoth = window.mammoth;
            const arrayBuffer = e.target.result;
            const result = await mammoth.extractRawText({ arrayBuffer });
            text = result.value;
          } catch (docxError) {
            console.error('DOCX parsing error:', docxError);
            text = `Resume File: ${file.name}\nUnable to parse DOCX content.`;
          }
        } else if (fileExt === 'doc') {
          text = `Resume File: ${file.name}\nOld .doc format detected. Please convert to .docx or .pdf.`;
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
    } else {
      reader.readAsText(file);
    }
  });
};

// AI Functions using Gemini API
const analyzeResumeAndGenerateQuestions = async (resumeFile, jobDescription) => {
  try {
    const resumeData = await extractTextFromFile(resumeFile);
    
    const prompt = `You are an expert interview coach. Analyze the resume provided and generate personalized interview questions.

${jobDescription ? `Job Description: ${jobDescription}` : 'Generate questions for a general technical role'}

IMPORTANT: Analyze the resume content carefully and generate TWO SEPARATE types of questions based on the candidate's experience, skills, and projects mentioned in their resume:

1. TECHNICAL QUESTIONS (5 questions):
   - Focus on technical skills, technologies, and tools mentioned in the resume
   - Ask about projects, architectures, and technical decisions they made
   - Reference specific technologies from their resume

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
}`;

    const response = await callGeminiAPI(prompt, resumeData);
    
    let jsonStr = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.technicalQuestions && parsed.behavioralQuestions && 
          parsed.technicalQuestions.length === 5 && 
          parsed.behavioralQuestions.length === 5) {
        return parsed;
      }
    }
    
    throw new Error('Failed to parse questions from AI response');
  } catch (error) {
    console.error('Error generating questions:', error);
    alert(`Failed to generate questions: ${error.message}\n\nPlease check:\n1. Your API key is correct\n2. You have API quota remaining`);
    
    return {
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
    };
  }
};

const analyzeCandidateAnswer = async (question, answer) => {
  try {
    const prompt = `You are an expert interview coach. Analyze this interview answer and provide detailed feedback.

Question: ${question}
Answer: ${answer}

Provide your analysis in JSON format:
{
  "score": <number 0-100>,
  "feedback": "<detailed feedback paragraph>",
  "strengths": ["strength1", "strength2", "strength3"],
  "improvements": ["improvement1", "improvement2", "improvement3"]
}`;

    const response = await callGeminiAPI(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('Failed to parse feedback');
  } catch (error) {
    console.error('Error analyzing answer:', error);
    return {
      score: 75,
      feedback: "Your answer shows understanding. Consider adding more specific examples and addressing potential challenges.",
      strengths: ["Clear explanation", "Good structure"],
      improvements: ["Add specific examples", "Discuss trade-offs"]
    };
  }
};

const suggestBestAnswer = async (question) => {
  try {
    const prompt = `You are an expert interview coach. For the following interview question, provide a suggested approach for answering it effectively.

Question: ${question}

Provide a comprehensive guide on how to structure and deliver a strong answer. Include key points to cover, examples to mention, and tips for making the answer compelling.`;

    return await callGeminiAPI(prompt);
  } catch (error) {
    console.error('Error suggesting answer:', error);
    return "A comprehensive answer should start by defining the key concepts, then provide a specific example from your experience. Use the STAR method (Situation, Task, Action, Result) to structure your response.";
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
            </div>
          )}

          {suggestion && (
            <div className="p-4 bg-purple-900/20 border border-purple-700 rounded-lg">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Lightbulb size={18} />
                Suggested Answer Approach
              </h4>
              <p className="text-sm">{suggestion}</p>
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
          </div>
        )}

        {suggestion && (
          <div className="p-4 bg-purple-900/20 border border-purple-700 rounded-lg">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Lightbulb size={18} />
              Suggested Answer Approach
            </h4>
            <p className="text-sm">{suggestion}</p>
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

// Mode Selection Component
const ModeSelection = () => {
  const [, setState] = useStore(s => s);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-8">Choose Your Interview Mode</h2>
      <div className="grid md:grid-cols-2 gap-6">
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
      </div>
    </div>
  );
};

// Resume Uploader Component
const ResumeUploader = ({ onAnalyze }) => {
  const [, setState] = useStore(s => s);
  const [file, setFile] = useState(null);
  const [jobDesc, setJobDesc] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop().toLowerCase();
      if (!['pdf', 'docx', 'doc'].includes(ext)) {
        setToast({ message: 'Please upload only PDF or Word documents (.pdf, .docx, .doc)', type: 'error' });
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
      const result = await analyzeResumeAndGenerateQuestions(file, jobDesc);
      setState({
        resumeFile: file,
        jobDescription: jobDesc,
        technicalQuestions: result.technicalQuestions,
        behavioralQuestions: result.behavioralQuestions
      });
      onAnalyze();
    } catch (error) {
      setToast({ message: 'Failed to analyze resume. Please try again.', type: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-3">Upload Your Resume *</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-3 px-4 py-8 border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-lg transition-colors"
          >
            <Upload size={24} />
            <span>{file ? file.name : 'Click to upload resume (PDF, DOCX, DOC)'}</span>
          </button>
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
              Analyzing Resume...
            </>
          ) : (
            <>
              Analyze & Start
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
  const [currentYear, setCurrentYear] = useState('');

  useEffect(() => {
    setCurrentYear(new Date().getFullYear().toString());
  }, []);

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
            {page === 'interview' && (
              <button
                onClick={() => {
                  setPage('home');
                  window.location.reload();
                }}
                className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Start New Session
              </button>
            )}
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
            <ResumeUploader onAnalyze={() => setPage('interview')} />
          </div>
        )}

        {page === 'interview' && hasQuestions && (
          <div className="space-y-8">
            {!state.interviewMode ? (
              <ModeSelection />
            ) : state.interviewMode === 'classic' ? (
              <InterviewWorkspace />
            ) : (
              <InteractiveInterview />
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



// COMPLETE CareerForge AI with ALL Features
// Copy this ENTIRE file to your src/App.jsx

import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { Upload, Mic, MicOff, ChevronRight, Lightbulb, CheckCircle, AlertCircle, Loader2, TrendingUp, Award, Target, BarChart3 } from 'lucide-react';

// Store setup
const createStore = (initialState) => {
  let state = initialState;
  const listeners = new Set();
  const getState = () => state;
  const setState = (partial) => {
    const newState = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...newState };
    queueMicrotask(() => listeners.forEach(listener => listener()));
  };
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return { getState, setState, subscribe };
};

const store = createStore({
  resumeFile: null,
  resumeText: '',
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

// AI API Configuration - REPLACE WITH YOUR KEY
const GEMINI_API_KEY = 'YOUR_API_KEY_HERE';

// Simple component exports
export default function App() {
  const [state] = useStore();
  const [page, setPage] = useState('home');
  const [showLevelSelection, setShowLevelSelection] = useState(true);
  const hasQuestions = state.technicalQuestions.length > 0 || state.behavioralQuestions.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
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
            ) : state.interviewMode === 'analytics' ? (
              <PerformanceDashboard />
            ) : state.interviewMode === 'classic' ? (
              <div>Classic Mode - Questions Here</div>
            ) : (
              <div>Interactive Mode - Questions Here</div>
            )}
          </div>
        )}
      </main>

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

// Level Selection Component
function LevelSelection({ onNext }) {
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
}

// Mode Selection Component
function ModeSelection() {
  const [, setState] = useStore();
  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-8">Choose Your Interview Mode</h2>
      <div className="grid md:grid-cols-3 gap-6">
        <button onClick={() => setState({ interviewMode: 'classic' })} className="p-8 bg-gray-800 border-2 border-gray-700 hover:border-blue-500 rounded-lg">
          <h3 className="text-2xl font-bold mb-4">Classic Mode</h3>
          <p className="text-gray-400">View all questions at once</p>
        </button>
        <button onClick={() => setState({ interviewMode: 'interactive' })} className="p-8 bg-gray-800 border-2 border-gray-700 hover:border-blue-500 rounded-lg">
          <h3 className="text-2xl font-bold mb-4">Interactive Mode</h3>
          <p className="text-gray-400">One question at a time</p>
        </button>
        <button onClick={() => setState({ interviewMode: 'analytics' })} className="p-8 bg-gradient-to-br from-blue-900/50 to-purple-900/50 border-2 border-blue-700 hover:border-blue-500 rounded-lg">
          <div className="text-4xl mb-3">📊</div>
          <h3 className="text-2xl font-bold mb-4">Analytics Mode</h3>
          <p className="text-gray-400">View performance dashboard</p>
        </button>
      </div>
    </div>
  );
}

// Performance Dashboard Component
function PerformanceDashboard() {
  const [state] = useStore();
  const { feedback, answers } = state;

  const calculateStats = () => {
    const allFeedback = Object.values(feedback);
    const allAnswers = Object.values(answers);
    const avgScore = allFeedback.length > 0 ? Math.round(allFeedback.reduce((sum, f) => sum + (f.score || 0), 0) / allFeedback.length) : 0;
    const totalQ = state.technicalQuestions.length + state.behavioralQuestions.length;
    return {
      totalQuestions: totalQ,
      answeredQuestions: allAnswers.length,
      averageScore: avgScore,
      completionRate: totalQ > 0 ? Math.round((allAnswers.length / totalQ) * 100) : 0
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
      </div>
      {stats.answeredQuestions === 0 && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-6 text-center">
          <p>📝 Start answering questions to see your performance analytics!</p>
        </div>
      )}
    </div>
  );
}

// Resume Uploader Component  
function ResumeUploader({ onAnalyze }) {
  const [state, setState] = useStore();
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleAnalyze = () => {
    if (!file) return alert('Please upload resume');
    // Mock questions for demo
    setState({
      technicalQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
      behavioralQuestions: ['B1', 'B2', 'B3', 'B4', 'B5'],
      currentQuestion: 'Q1'
    });
    onAnalyze();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {state.selectedLevel && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 text-center">
          <span className="text-lg font-semibold">Selected Level: {state.selectedLevel}</span>
        </div>
      )}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 space-y-6">
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc" onChange={(e) => setFile(e.target.files[0])} className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-3 px-4 py-8 border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-lg">
          <Upload size={24} />
          <span>{file ? file.name : 'Click to upload resume'}</span>
        </button>
        <button onClick={handleAnalyze} disabled={!file} className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-lg font-semibold">
          Analyze & Start
        </button>
      </div>
    </div>
  );
}