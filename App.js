import React, { useState, useEffect } from 'react';
import { 
  Briefcase, GraduationCap, Code, TrendingUp, Mail, Linkedin, ChevronDown, 
  User, Menu, X, MapPin, Award, Globe, Loader2, Zap, Target, TerminalSquare
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp, runTransaction, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

// ==========================================
// 1. CONFIGURATION & GLOBAL CONTEXT
// ==========================================
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const API_KEY = ""; // Canvas will provide this at runtime if empty.
const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

// ==========================================
// 2. STATIC DATA & CONTENT
// ==========================================
const FULL_RESUME_TEXT = `
ANTHONY MALOUF - Atlanta, GA | 404-933-9729 | amalouf20@gmail.com | linkedin.com/in/anthonymalouf

WORK EXPERIENCE:
Lamb Insurance Services | Client Executive | Dec 2024 - Present | Atlanta, GA
- Leveraging first-principles thinking to design a dynamic outreach strategy, executing 200+ weekly prospecting calls.
- Partnering with marketing to refine messaging, boost lead quality, and increase conversion rates.
- Produced clear, data-backed deliverables—coverage comparisons, loss analyses—to guide client decision-making.

Cita Marketplace | Product Manager | July 2024 - Present | New York, NY (Remote)
- Fast-paced, dynamic startup environment focused on rapid iteration and high-impact feature development.
- Investigated user behavior and market dynamics through segmentation analysis and A/B testing, uncovering opportunities that drove a 32% increase in conversion rates.
- Innovated user engagement strategies by designing and rolling out review and social interaction features, resulting in higher repeat usage.
- Collaborating cross-functionally with engineering, marketing, and design to align messaging with product KPIs, improving GTM execution and internal reporting clarity.
- Iterating features continuously through a product roadmap framework, monitoring performance metrics and refining features based on data and user feedback.

KD Global LLC | Consulting Analyst Intern | July 2023 - Mar 2024 | Atlanta, GA
- Delivered investor-ready market analyses and risk assessments using SQL and Excel, providing European clients with actionable KPI insights that drove revenue outperformance of up to 20% in U.S. prod[...]
- Presented insights through clear, concise reporting and slide decks to inform client decision-making on legal, regulatory, and operational matters.

International Rescue Committee | Supply Chain Optimization Intern | May 2023 - Aug 2023 | Atlanta, GA
- Used Python and SQL to forecast demand trends, helping achieve a 20% reduction in program-level waste.

EDUCATION:
Georgia Institute of Technology | Bachelor of Science in Economics | May 2024 | Atlanta, GA
- GPA: 3.6, Highest Honors | Zell Miller & Gilman Citizen Diplomat Scholar
- Minors: International Affairs via EU Study Abroad Program, Computer Science.

SKILLS:
Business Strategy, Cross-functional Collaboration, Data Analysis & Visualization, Digital Marketing Strategy, Excel, Pendo (Product Analytics), Predictive Models, Problem Solving & Troubleshooting, Pr[...]
`;

const EXPERIENCES = [
  {
    company: "Lamb Insurance Services",
    role: "Client Executive",
    date: "Dec 2024 - Present",
    location: "Atlanta, GA",
    description: "Leveraging first-principles thinking to execute high-volume prospecting strategies. Partnering with marketing to refine messaging and boost lead quality.",
    tags: ["Sales Strategy", "Data Analysis", "Client Relations"],
    icon: <TrendingUp size={20} />
  },
  {
    company: "Cita Marketplace",
    role: "Product Manager",
    date: "July 2024 - Present",
    location: "Remote (NYC)",
    description: "Driving a 32% increase in conversion rates through A/B testing and segmentation. Leading cross-functional teams to launch social interaction features.",
    tags: ["Product Roadmap", "A/B Testing", "GTM Strategy"],
    icon: <Briefcase size={20} />
  },
  {
    company: "KD Global LLC",
    role: "Consulting Analyst Intern",
    date: "July 2023 - Mar 2024",
    location: "Atlanta, GA",
    description: "Delivered investor-ready market analyses driving 20% revenue outperformance for US product launches. Built SQL/Excel models for risk assessment.",
    tags: ["SQL", "Market Analysis", "Consulting"],
    icon: <Globe size={20} />
  },
  {
    company: "International Rescue Committee",
    role: "Supply Chain Optimization Intern",
    date: "May 2023 - Aug 2023",
    location: "Atlanta, GA",
    description: "Utilized Python and SQL to forecast demand trends, achieving a 20% reduction in program-level waste.",
    tags: ["Python", "Supply Chain", "Forecasting"],
    icon: <Code size={20} />
  }
];

const SKILLS_DATA = {
  Technical: ["SQL", "Python", "Excel (Advanced)", "Pendo", "Tableau"],
  Strategy: ["Product Management", "A/B Testing", "GTM Execution", "User Research", "Segmentation"],
  Soft: ["Cross-functional Collaboration", "Stakeholder Communication", "First-Principles Thinking", "Problem Solving"]
};

// ==========================================
// 3. UTILITY FUNCTIONS (API & RENDERERS)
// ==========================================

const callGeminiAPI = async (systemPrompt, userQuery) => {
  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    tools: [{ "google_search": {} }], 
  };

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 429 && attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) throw new Error(`API error: ${response.statusText}`);

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (text) {
        let sources = [];
        const groundingMetadata = result.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata && groundingMetadata.groundingAttributions) {
            sources = groundingMetadata.groundingAttributions
                .map(attr => ({ uri: attr.web?.uri, title: attr.web?.title }))
                .filter(source => source.uri && source.title);
        }
        return { text, sources };
      } else {
        throw new Error("Failed to extract text from Gemini response.");
      }
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
      if (attempt === MAX_RETRIES - 1) throw new Error("Gemini API call failed after multiple retries.");
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000 + Math.random() * 1000));
    }
  }
};

const analyzePortfolioWithGemini = (jobDescription) => {
    const systemPrompt = `You are a professional Career Analyst. Your task is to compare the provided candidate resume (FULL_RESUME_TEXT) against a job posting (JOB_DESCRIPTION). 
      Provide the analysis in two clear sections: 
      1. **Key Matches:** List 3-4 specific points from the resume that directly align with the job requirements.
      2. **Skill Gaps:** List 2-3 areas where the candidate's resume lacks direct experience or requires stronger emphasis to match the seniority/domain of the job.
      Format the output as clean Markdown for immediate display. The tone should be objective and professional.
    `;
    const userQuery = `FULL_RESUME_TEXT:\n\n${FULL_RESUME_TEXT}\n\nJOB_DESCRIPTION:\n\n${jobDescription}`;
    return callGeminiAPI(systemPrompt, userQuery);
};

const performDeepDiveWithGemini = (deepDivePrompt) => {
    const systemPrompt = `You are a Senior Product Strategy Mentor. Given the candidate's background in a dynamic startup environment (FULL_RESUME_TEXT) and the user's strategic query, provide a struc[...]
      Focus on strategic frameworks, common pitfalls, or advanced applications relevant to the query. 
      The output must be formatted as Markdown with numbered or bulleted lists.
    `;
    const userQuery = `CANDIDATE BACKGROUND:\n\n${FULL_RESUME_TEXT}\n\nSTRATEGIC QUERY:\n\n${deepDivePrompt}`;
    return callGeminiAPI(systemPrompt, userQuery);
};

const renderMarkdown = (markdown, isAnalyzer) => {
  if (!markdown) return null;
  const sections = markdown.split(/\n##\s*/).filter(s => s.trim());
  const markerColor = isAnalyzer ? 'text-sky-400' : 'text-cyan-400';
  
  return sections.map((section, index) => {
    const headingMatch = section.match(/^(.*?)\n/);
    const heading = headingMatch ? headingMatch[1].trim().replace('#', '') : `Analysis Point ${index + 1}`;
    const content = headingMatch ? section.substring(headingMatch[0].length).trim() : section.trim();
    
    const listItems = content.split('\n').filter(line => line.startsWith('- ') || line.match(/^\d+\./)).map((line, i) => {
      const isBullet = line.startsWith('- ');
      const text = isBullet ? line.substring(2).trim() : line.substring(line.indexOf('.') + 1).trim();
      const number = isBullet ? null : line.substring(0, line.indexOf('.')).trim();

      return (
        <li key={i} className="mb-2 text-slate-300 flex items-start">
          {isBullet ? (
            <ChevronDown size={16} className={`${markerColor} mr-2 mt-1 transform rotate-90 flex-shrink-0`} />
          ) : (
            <span className={`${markerColor} font-bold mr-2 mt-0.5 flex-shrink-0`}>{number}.</span>
          )}
          {text}
        </li>
      );
    });

    const isGap = isAnalyzer && heading.includes('Gaps');
    const headerColor = isAnalyzer ? (isGap ? 'text-red-400' : 'text-sky-400') : 'text-cyan-400';
    
    return (
      <div key={index} className={`mb-8 p-6 bg-slate-800/50 rounded-lg border ${isAnalyzer ? (isGap ? 'border-red-700/50' : 'border-sky-700/50') : 'border-slate-700'}`}>
        <h3 className={`text-xl font-semibold mb-4 ${headerColor}`}>
          {heading}
        </h3>
        <ul className="list-none pl-0 space-y-2">{listItems}</ul>
      </div>
    );
  });
};

// ==========================================
// 4. MAIN COMPONENT
// ==========================================

const Portfolio = () => {
  // UI State
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  // Firebase State
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [visitCount, setVisitCount] = useState(null);

  // Feature State
  const [jobDescription, setJobDescription] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  const [deepDivePrompt, setDeepDivePrompt] = useState('');
  const [deepDiveResult, setDeepDiveResult] = useState(null);
  const [isDeepDiveLoading, setIsDeepDiveLoading] = useState(false);
  const [deepDiveError, setDeepDiveError] = useState(null);

  // --- Effect: Firebase Init & Auth ---
  useEffect(() => {
    if (!firebaseConfig.projectId) return;

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const auth = getAuth(app);
      setDb(firestore);

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          try {
            if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
            else await signInAnonymously(auth);
          } catch (e) {
            console.error("Firebase Sign-In Failed:", e);
            setUserId(crypto.randomUUID()); 
          }
        }
        setIsAuthReady(true);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase Initialization Failed:", e);
      setIsAuthReady(true);
    }
  }, []);

  // --- Effect: Logging Visits ---
  useEffect(() => {
    if (db && userId) {
      const logVisit = async () => {
        try {
          const visitDocRef = doc(db, "artifacts", appId, "public", "data", "traffic", "visits");
          const userLogCollectionRef = collection(db, "artifacts", appId, "public", "data", "user_logs");
          const uniqueUserQuery = query(userLogCollectionRef, where("userId", "==", userId));
          const querySnapshot = await getDocs(uniqueUserQuery);

          if (querySnapshot.empty) {
            await setDoc(doc(userLogCollectionRef), { userId: userId, timestamp: serverTimestamp(), firstVisit: true });
            await runTransaction(db, async (transaction) => {
              const docSnapshot = await transaction.get(visitDocRef);
              const newCount = (docSnapshot.exists() ? docSnapshot.data().count : 0) + 1;
              transaction.set(visitDocRef, { count: newCount, lastUpdate: serverTimestamp() }, { merge: true });
              setVisitCount(newCount);
            });
          } else {
            const docSnapshot = await getDoc(visitDocRef);
            if (docSnapshot.exists()) setVisitCount(docSnapshot.data().count);
          }
        } catch (e) {
          console.error("Error logging visit:", e);
        }
      };
      logVisit();
    }
  }, [db, userId]);

  // --- Effect: Scroll Handling ---
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
      const sections = ['home', 'about', 'experience', 'education', 'analyzer', 'contact'];
      const current = sections.find(section => {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          return rect.top >= -100 && rect.top <= 300;
        }
        return false;
      });
      if (current) setActiveSection(current);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // --- Handlers ---
  const handleAnalyze = async () => {
    if (!jobDescription.trim()) { setAnalysisError('Please paste a job description.'); return; }
    setIsAnalysisLoading(true); setAnalysisResult(null); setAnalysisError(null);
    try { setAnalysisResult(await analyzePortfolioWithGemini(jobDescription)); } 
    catch (e) { setAnalysisError(e.message || 'Error occurred.'); } 
    finally { setIsAnalysisLoading(false); }
  };

  const handleDeepDive = async () => {
    if (!deepDivePrompt.trim()) { setDeepDiveError('Please enter a query.'); return; }
    setIsDeepDiveLoading(true); setDeepDiveResult(null); setDeepDiveError(null);
    try { setDeepDiveResult(await performDeepDiveWithGemini(deepDivePrompt)); } 
    catch (e) { setDeepDiveError(e.message || 'Error occurred.'); } 
    finally { setIsDeepDiveLoading(false); }
  };

  const scrollToSection = (id) => {
    setIsMenuOpen(false);
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-900">
      
      {/* Navigation */}
      <nav className={`fixed w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-slate-900/90 backdrop-blur-md shadow-xl border-b border-slate-800' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="text-2xl font-bold bg-gradient-to-r from-sky-400 to-cyan-500 bg-clip-text text-transparent cursor-pointer" onClick={() => scrollToSection('home')}>
            A.M.
          </div>
          <div className="hidden md:flex space-x-8 text-sm font-medium">
            {['Home', 'About', 'Experience', 'Education', 'Analyzer', 'Contact'].map((item) => (
              <button
                key={item}
                onClick={() => scrollToSection(item.toLowerCase())}
                className={`hover:text-sky-400 transition-colors ${activeSection === item.toLowerCase() ? 'text-sky-400 border-b-2 border-sky-400 pb-1' : 'text-slate-400'}`}
              >
                {item}
              </button>
            ))}
          </div>
          <button className="md:hidden text-slate-300" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {isMenuOpen && (
          <div className="md:hidden bg-slate-800 border-t border-slate-700 absolute w-full">
            <div className="flex flex-col p-4 space-y-4">
              {['Home', 'About', 'Experience', 'Education', 'Analyzer', 'Contact'].map((item) => (
                <button key={item} onClick={() => scrollToSection(item.toLowerCase())} className="text-left text-slate-300 hover:text-sky-400 py-2">{item}</button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section id="home" className="min-h-screen flex items-center justify-center relative overflow-hidden pt-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse delay-1000"></div>

        <div className="max-w-4xl mx-auto px-6 text-center z-10">
          <div className="inline-block mb-4 px-4 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-sm font-medium tracking-wide animate-fade-in-up">
            STRATEGY | PRODUCT | DATA
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            I'm <span className="bg-gradient-to-r from-sky-400 to-cyan-500 bg-clip-text text-transparent">Anthony Malouf</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-400 mb-8 max-w-2xl mx-auto leading-relaxed">
            A dynamic Product Manager bridging <span className="text-slate-200">strategic analysis</span> and <span className="text-slate-200">engineering execution</span> to deliver measurable business impact.
          </p>
          
          <div className="flex flex-col md:flex-row justify-center gap-4">
            <button 
              onClick={() => scrollToSection('experience')}
              className="px-8 py-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg transition-all shadow-[0_0_20px_rgba(14,165,233,0.3)] hover:shadow-[0_0_30px_rgba(14,165,233,0.5)]"
            >
              View Projects
            </button>
            <button 
              onClick={() => scrollToSection('analyzer')}
              className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg border border-slate-700 transition-all flex items-center justify-center gap-2"
            >
              <Zap size={18} className="text-yellow-400" />
              Use AI Tools
            </button>
          </div>
          {visitCount !== null && (
            <div className="mt-8 text-sm text-slate-500 flex items-center justify-center gap-2">
              <Globe size={16} className="text-cyan-400" />
              <span className="font-semibold text-slate-300">{visitCount}</span> unique visitors have viewed this portfolio.
            </div>
          )}
        </div>

        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 animate-bounce text-slate-500">
          <ChevronDown size={24} />
        </div>
      </section>

      {/* About Section - Simplified Layout (No Headshot) */}
      <section id="about" className="py-20 bg-slate-900/50">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-12 flex items-center">
            <User className="mr-3 text-sky-400" /> 
            About Anthony
          </h2>
          <div className="bg-slate-800/50 p-8 rounded-2xl border border-slate-700/50 backdrop-blur-sm shadow-sm">
            <p className="text-lg text-slate-300 leading-relaxed mb-6">
              I am a <strong className="text-sky-400">Georgia Tech graduate</strong> with dual minors in <strong className="text-white">Computer Science</strong> and International Affairs. I currently thrive in environments where data meets strategy.
            </p>
            <p className="text-lg text-slate-300 leading-relaxed">
              My core strength lies in translating complex quantitative analysis (Python, SQL) and user data (Pendo, A/B testing) into actionable product roadmaps and revenue-driving features. My background spans from optimizing supply chains to launching fintech products in startup environments.
            </p>
          </div>
        </div>
      </section>

      {/* Experience Section */}
      <section id="experience" className="py-20 relative">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-16 flex items-center">
            <Briefcase className="mr-3 text-sky-400" />
            Experience
          </h2>

          <div className="relative border-l-2 border-slate-800 ml-4 md:ml-6 space-y-12">
            {EXPERIENCES.map((exp, index) => (
              <div key={index} className="relative pl-8 md:pl-12 group">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-900 border-2 border-sky-500 group-hover:bg-sky-500 transition-colors shadow-[0_0_10px_rgba(14,165,233,0.5)]"></div>
                <div className="flex flex-col md:flex-row md:items-start justify-between mb-2">
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                      {exp.role}
                      <span className="text-sky-400 text-sm font-normal px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 md:hidden inline-block">
                        {exp.company}
                      </span>
                    </h3>
                    <div className="text-lg text-sky-400 font-medium hidden md:block">{exp.company}</div>
                  </div>
                  <div className="text-sm text-slate-500 font-medium mt-1 md:mt-0 flex flex-col md:items-end">
                    <span>{exp.date}</span>
                    <span className="flex items-center gap-1"><MapPin size={12}/> {exp.location}</span>
                  </div>
                </div>
                <p className="text-slate-400 mb-4 leading-relaxed max-w-2xl">{exp.description}</p>
                <div className="flex flex-wrap gap-2">
                  {exp.tags.map((tag, i) => (
                    <span key={i} className="text-xs font-medium px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Skills Section */}
      <section className="py-20 bg-slate-800/30 border-y border-slate-800">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-12 text-center">Technical & Strategic Toolkit</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {Object.entries(SKILLS_DATA).map(([category, items]) => (
              <div key={category} className="bg-slate-900 p-6 rounded-xl border border-slate-800 hover:border-sky-500/30 transition-colors">
                <h3 className="text-xl font-semibold mb-6 text-sky-400 border-b border-slate-800 pb-2">{category}</h3>
                <div className="flex flex-wrap gap-3">
                  {items.map((skill) => (
                    <div key={skill} className="flex items-center gap-2 text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                      {skill}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* Portfolio Analyzer Section (LLM Features) */}
      <section id="analyzer" className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-12 flex items-center">
            <Zap className="mr-3 text-yellow-400" />
            AI Strategy & Analysis Tools
          </h2>
          
          {/* Feature 1: Job Fit Analyzer */}
          <div className="bg-slate-800/50 p-8 rounded-2xl border border-slate-700/50 backdrop-blur-sm mb-12">
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2 text-sky-400">
              Job Fit Analyzer ✨
            </h3>
            <p className="text-lg text-slate-300 mb-6">
              Paste any job description to get an instant, AI-powered fit analysis against my full experience profile (Matches & Gaps).
            </p>
            <textarea
              className="w-full h-32 p-4 mb-4 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 resize-none focus:outline-none focus:border-sky-500 placeholder-slate-500"
              placeholder="Paste job description here (e.g., Senior PM, Consulting Analyst, etc.)"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              disabled={isAnalysisLoading}
            />
            <button
              onClick={handleAnalyze}
              disabled={isAnalysisLoading || !jobDescription.trim()}
              className={`w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-lg transition-all ${
                isAnalysisLoading || !jobDescription.trim()
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-sky-600 hover:bg-sky-700 text-white shadow-[0_0_20px_rgba(14,165,233,0.3)]'
              }`}
            >
              {isAnalysisLoading ? <><Loader2 className="animate-spin" size={20} />Analyzing Fit...</> : <><Target size={20} />Generate Fit Analysis</>}
            </button>
            {analysisError && <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300">Error: {analysisError}</div>}
            {analysisResult && (
              <div className="mt-8 pt-6 border-t border-slate-700">
                <h3 className="text-2xl font-bold mb-4 text-sky-400">Analysis Results</h3>
                <div className="text-base">{renderMarkdown(analysisResult.text, true)}</div>
                {analysisResult.sources?.length > 0 && (
                  <div className="mt-6 text-xs text-slate-500">
                    <p className="font-semibold mb-1">Sources used for context:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {analysisResult.sources.map((source, idx) => (
                        <li key={idx}><a href={source.uri} target="_blank" rel="noopener noreferrer" className="hover:text-sky-400 underline">{source.title || source.uri}</a></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Feature 2: Strategic Deep Dive */}
          <div className="bg-slate-800/50 p-8 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2 text-cyan-400">
              Strategic Deep Dive 🧠
            </h3>
            <p className="text-lg text-slate-300 mb-6">
              Enter any product management concept or strategic query to receive a structured explanation.
            </p>
            <input
              type="text"
              className="w-full p-4 mb-4 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 placeholder-slate-500"
              placeholder="E.g., How do you measure product success in a new market?"
              value={deepDivePrompt}
              onChange={(e) => setDeepDivePrompt(e.target.value)}
              disabled={isDeepDiveLoading}
            />
            <button
              onClick={handleDeepDive}
              disabled={isDeepDiveLoading || !deepDivePrompt.trim()}
              className={`w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-lg transition-all ${
                isDeepDiveLoading || !deepDivePrompt.trim()
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)]'
              }`}
            >
              {isDeepDiveLoading ? <><Loader2 className="animate-spin" size={20} />Generating Strategy...</> : <><TerminalSquare size={20} />Deep Dive on Concept</>}
            </button>
            {deepDiveError && <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300">Error: {deepDiveError}</div>}
            {deepDiveResult && (
              <div className="mt-8 pt-6 border-t border-slate-700">
                <h3 className="text-2xl font-bold mb-4 text-cyan-400">Deep Dive Analysis</h3>
                <div className="text-base">{renderMarkdown(deepDiveResult.text, false)}</div>
                {deepDiveResult.sources?.length > 0 && (
                  <div className="mt-6 text-xs text-slate-500">
                    <p className="font-semibold mb-1">Sources used for context:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {deepDiveResult.sources.map((source, idx) => (
                        <li key={idx}><a href={source.uri} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 underline">{source.title || source.uri}</a></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Education Section */}
      <section id="education" className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-12 flex items-center">
            <GraduationCap className="mr-3 text-sky-400" />
            Education
          </h2>
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-2xl border border-slate-700 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10"><Award size={120} /></div>
            <div className="relative z-10">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">Georgia Institute of Technology</h3>
                  <p className="text-sky-400 text-lg">Bachelor of Science in Economics</p>
                </div>
                <div className="text-right mt-2 md:mt-0">
                  <p className="text-slate-300 font-mono">May 2024</p>
                  <p className="text-slate-400 text-sm">Atlanta, GA</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-slate-300">
                  <div className="px-2 py-1 bg-sky-500/20 text-sky-400 text-sm font-bold rounded">GPA 3.6</div>
                  <span>Highest Honors | Zell Miller Scholar</span>
                </div>
                <div className="border-t border-slate-700 pt-4 mt-4">
                  <p className="text-slate-400 text-sm mb-2 uppercase tracking-wider font-semibold">Key Highlights</p>
                  <ul className="text-slate-300 space-y-2">
                    <li className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 bg-cyan-500 rounded-full"></span><strong className="text-white">Minor in Computer Science</strong></li>
                    <li className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 bg-cyan-500 rounded-full"></span><span>Minor in International Affairs via EU Study Abroad Program</span></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 bg-slate-900 relative">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-6">Let's Connect</h2>
          <p className="text-slate-400 mb-10 text-lg">
            I'm currently based in Atlanta but open to remote opportunities. Let's discuss product, data strategy, or future roles.
          </p>
          <div className="flex flex-col md:flex-row justify-center gap-6 mb-12">
            <a href="mailto:amalouf20@gmail.com" className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all group">
              <Mail className="text-sky-400 group-hover:scale-110 transition-transform" />
              <span className="text-lg font-medium">amalouf20@gmail.com</span>
            </a>
            <a href="https://linkedin.com/in/anthonymalouf" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 px-8 py-4 bg-[#0077b5] hover:bg-[#006396] text-white rounded-xl transition-all group shadow-lg">
              <Linkedin className="group-hover:scale-110 transition-transform" />
              <span className="text-lg font-medium">LinkedIn Profile</span>
            </a>
          </div>
          <div className="text-slate-500 text-sm">
            <p>Atlanta, GA • 404-933-9729</p>
            <p className="mt-8">© {new Date().getFullYear()} Anthony Malouf. Designed for impact.</p>
            {isAuthReady && userId && <p className="mt-2 text-xs text-slate-600">User ID: {userId}</p>}
          </div>
        </div>
      </section>

    </div>
  );
};

export default Portfolio;