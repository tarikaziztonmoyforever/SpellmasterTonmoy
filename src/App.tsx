import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BookOpen, 
  Zap, 
  CheckCircle2, 
  BarChart3, 
  Search, 
  ArrowRight, 
  RotateCcw, 
  Volume2, 
  X, 
  Check,
  ChevronRight,
  Trophy,
  History,
  SkipForward,
  Info,
  User,
  Github,
  Mail,
  Linkedin,
  Plus,
  FileText,
  Layers,
  Sparkles,
  LogOut,
  LogIn,
  ChevronLeft,
  Timer,
  LayoutGrid,
  Target,
  Calendar as CalendarIcon,
  Award
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart, 
  Pie, 
  Cell 
} from "recharts";
import confetti from "canvas-confetti";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { IELTS_WORDS, WordData } from "./data/words";
import { AppMode, UserStats } from "./types";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { ADVANCED_SYNONYMS, SynonymData } from "./data/synonyms";
import { TOPIC_VOCAB, TopicWord } from "./data/topics";

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const speak = (text: string) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.8;
  window.speechSynthesis.speak(utterance);
};

function generateSimilarWrongSpellings(word: string, count: number): string[] {
  const mistakes = new Set<string>();
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  
  while (mistakes.size < count) {
    let mistake = word;
    const rand = Math.random();
    
    if (rand < 0.3) {
      // Double a random letter
      const idx = Math.floor(Math.random() * word.length);
      mistake = word.slice(0, idx + 1) + word[idx] + word.slice(idx + 1);
    } else if (rand < 0.6) {
      // Undouble a double letter
      const doubleMatch = word.match(/(.)\1/);
      if (doubleMatch) {
        mistake = word.replace(doubleMatch[0], doubleMatch[1]);
      } else {
        // Swap vowels if no double letters
        const vowelIndices = [...word].map((c, i) => vowels.includes(c.toLowerCase()) ? i : -1).filter(i => i !== -1);
        if (vowelIndices.length >= 2) {
          const i1 = vowelIndices[Math.floor(Math.random() * vowelIndices.length)];
          const i2 = vowelIndices[Math.floor(Math.random() * vowelIndices.length)];
          const chars = [...word];
          [chars[i1], chars[i2]] = [chars[i2], chars[i1]];
          mistake = chars.join('');
        }
      }
    } else {
      // Replace a vowel
      const vowelIndices = [...word].map((c, i) => vowels.includes(c.toLowerCase()) ? i : -1).filter(i => i !== -1);
      if (vowelIndices.length > 0) {
        const idx = vowelIndices[Math.floor(Math.random() * vowelIndices.length)];
        const chars = [...word];
        chars[idx] = vowels[Math.floor(Math.random() * vowels.length)];
        mistake = chars.join('');
      }
    }
    
    if (mistake !== word && mistake.length > 2) {
      mistakes.add(mistake);
    }
    
    // Safety break
    if (mistakes.size < count && Math.random() < 0.01) break;
  }
  
  return Array.from(mistakes);
}

function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// --- Sound Effects ---
const playSound = (type: "correct" | "wrong" | "skip") => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === "correct") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } else if (type === "wrong") {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } else {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }
};

// --- Main App Component ---
export default function App() {
  const [mode, setMode] = useState<AppMode>("home");
  const [isSyncing, setIsSyncing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showDailyChallenge, setShowDailyChallenge] = useState(false);
  const [stats, setStats] = useState<UserStats>(() => {
    const saved = localStorage.getItem("spellmaster_stats");
    if (saved) return JSON.parse(saved);
    return {
      totalAttempts: 0,
      correctAttempts: 0,
      streak: 0,
      lastPracticeDate: null,
      lastDailyChallengeDate: null,
      dailyGoal: 20,
      displayName: "Guest User",
      wordStats: {},
      history: [],
      customWords: []
    };
  });

  // Handle Auth State
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    
    supabase!.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (user && stats.lastDailyChallengeDate !== today) {
      const timer = setTimeout(() => setShowDailyChallenge(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [user, stats.lastDailyChallengeDate]);

  // Load from Supabase on mount
  useEffect(() => {
    const loadSupabaseStats = async () => {
      if (!isSupabaseConfigured() || !user) return;

      try {
        setIsSyncing(true);
        const { data, error } = await supabase!
          .from('user_stats')
          .select('stats')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching from Supabase:', error);
        } else if (data) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error('Supabase load error:', err);
      } finally {
        setIsSyncing(false);
      }
    };

    loadSupabaseStats();
  }, [user]);

  useEffect(() => {
    localStorage.setItem("spellmaster_stats", JSON.stringify(stats));
    
    // Sync to Supabase
    const syncToSupabase = async () => {
      if (!isSupabaseConfigured() || !user) return;

      try {
        await supabase!
          .from('user_stats')
          .upsert({ 
            user_id: user.id, 
            stats: stats,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
      } catch (err) {
        console.error('Supabase sync error:', err);
      }
    };

    const timeoutId = setTimeout(syncToSupabase, 2000); // Debounce sync
    return () => clearTimeout(timeoutId);
  }, [stats, user]);

  const updateStats = (word: string, isCorrect: boolean) => {
    setStats(prev => {
      const newWordStats = { ...prev.wordStats };
      const currentWordStat = newWordStats[word] ? { ...newWordStats[word] } : { correct: 0, wrong: 0 };
      
      if (isCorrect) currentWordStat.correct++;
      else currentWordStat.wrong++;
      
      newWordStats[word] = currentWordStat;

      const today = new Date().toISOString().split('T')[0];
      const newHistory = [...prev.history];
      const todayHistoryIndex = newHistory.findIndex(h => h.date === today);
      
      const total = prev.totalAttempts + 1;
      const correct = prev.correctAttempts + (isCorrect ? 1 : 0);
      const accuracy = Math.round((correct / total) * 100);

      if (todayHistoryIndex >= 0) {
        newHistory[todayHistoryIndex] = { 
          ...newHistory[todayHistoryIndex], 
          accuracy,
          wordsPracticed: (newHistory[todayHistoryIndex].wordsPracticed || 0) + 1
        };
      } else {
        newHistory.push({ date: today, accuracy, wordsPracticed: 1 });
      }

      return {
        ...prev,
        totalAttempts: total,
        correctAttempts: correct,
        streak: isCorrect ? prev.streak + 1 : 0,
        lastPracticeDate: today,
        wordStats: newWordStats,
        history: newHistory.slice(-14) // Keep last 14 days
      };
    });
  };

  const updateGoal = (goal: number) => {
    setStats(prev => ({ ...prev, dailyGoal: goal }));
  };

  if (!user && isSupabaseConfigured()) {
    return <AuthView onFinish={() => setMode("home")} />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => setMode("home")}
          >
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200 group-hover:scale-105 transition-transform">
              <Zap size={22} fill="currentColor" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">SpellMaster <span className="text-blue-600">IELTS</span></h1>
          </div>
          
          <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <NavButton active={mode === "home"} onClick={() => setMode("home")} icon={<History size={18} />} label="Dashboard" />
            <NavButton active={mode === "flash-write"} onClick={() => setMode("flash-write")} icon={<Zap size={18} />} label="Flash Write" />
            <NavButton active={mode === "mcq"} onClick={() => setMode("mcq")} icon={<CheckCircle2 size={18} />} label="MCQ" />
            <NavButton active={mode === "synonyms"} onClick={() => setMode("synonyms")} icon={<Sparkles size={18} />} label="Synonyms" />
            <NavButton active={mode === "topics"} onClick={() => setMode("topics")} icon={<Layers size={18} />} label="Topics" />
            <NavButton active={mode === "rapid"} onClick={() => setMode("rapid")} icon={<Timer size={18} />} label="Rapid Mode" />
            <NavButton active={mode === "leaderboard"} onClick={() => setMode("leaderboard")} icon={<Award size={18} />} label="Leaderboard" />
            <NavButton active={mode === "library"} onClick={() => setMode("library")} icon={<BookOpen size={18} />} label="Library" />
            <NavButton active={mode === "manage"} onClick={() => setMode("manage")} icon={<Plus size={18} />} label="Manage" />
            <NavButton active={mode === "stats"} onClick={() => setMode("stats")} icon={<BarChart3 size={18} />} label="Stats" />
            <NavButton active={mode === "about"} onClick={() => setMode("about")} icon={<User size={18} />} label="About" />
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <button 
                onClick={() => supabase!.auth.signOut()}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Sign Out"
              >
                <LogOut size={20} />
              </button>
            ) : (
              <button 
                onClick={() => setMode("auth")}
                className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                title="Sign In"
              >
                <LogIn size={20} />
              </button>
            )}
            {isSyncing && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-blue-400 animate-pulse">
                <RotateCcw size={10} className="animate-spin" /> SYNCING
              </div>
            )}
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Streak</span>
              <span className="text-sm font-bold text-orange-500 flex items-center gap-1">
                🔥 {stats.streak}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {mode === "home" && (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Dashboard stats={stats} onStart={(m) => setMode(m)} />
            </motion.div>
          )}
          {mode === "flash-write" && (
            <motion.div key="flash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <FlashWriteMode 
                onFinish={() => setMode("home")} 
                onUpdateStats={updateStats} 
                customWords={stats.customWords}
              />
            </motion.div>
          )}
          {mode === "mcq" && (
            <motion.div key="mcq" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MCQMode 
                onFinish={() => setMode("home")} 
                onUpdateStats={updateStats} 
                customWords={stats.customWords}
              />
            </motion.div>
          )}
          {mode === "library" && (
            <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <WordLibrary customWords={stats.customWords} />
            </motion.div>
          )}
          {mode === "stats" && (
            <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <StatsView stats={stats} onUpdateGoal={updateGoal} />
            </motion.div>
          )}
          {mode === "synonyms" && (
            <motion.div key="synonyms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SynonymsMode onFinish={() => setMode("home")} />
            </motion.div>
          )}
          {mode === "topics" && (
            <motion.div key="topics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TopicsMode onFinish={() => setMode("home")} />
            </motion.div>
          )}
          {mode === "manage" && (
            <motion.div key="manage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ManageWords stats={stats} setStats={setStats} user={user} />
            </motion.div>
          )}
          {mode === "auth" && (
            <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AuthView onFinish={() => setMode("home")} />
            </motion.div>
          )}
          {mode === "rapid" && (
            <motion.div key="rapid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <RapidMode onFinish={() => setMode("home")} stats={stats} onUpdateStats={updateStats} user={user} />
            </motion.div>
          )}
          {mode === "leaderboard" && (
            <motion.div key="leaderboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LeaderboardView />
            </motion.div>
          )}
          {mode === "about" && (
            <motion.div key="about" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AboutView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-6 left-4 right-4 z-50">
        <div className="bg-white shadow-2xl shadow-slate-200 border border-slate-100 rounded-2xl p-2 flex items-center justify-around backdrop-blur-lg bg-white/90">
          <MobileNavButton active={mode === "home"} onClick={() => setMode("home")} icon={<History size={20} />} />
          <MobileNavButton active={mode === "flash-write"} onClick={() => setMode("flash-write")} icon={<Zap size={20} />} />
          <MobileNavButton active={mode === "mcq"} onClick={() => setMode("mcq")} icon={<CheckCircle2 size={20} />} />
          <MobileNavButton active={mode === "synonyms"} onClick={() => setMode("synonyms")} icon={<Sparkles size={20} />} />
          <MobileNavButton active={mode === "topics"} onClick={() => setMode("topics")} icon={<Layers size={20} />} />
          <MobileNavButton active={mode === "rapid"} onClick={() => setMode("rapid")} icon={<Timer size={20} />} />
          <MobileNavButton active={mode === "leaderboard"} onClick={() => setMode("leaderboard")} icon={<Award size={20} />} />
          <MobileNavButton active={mode === "library"} onClick={() => setMode("library")} icon={<BookOpen size={20} />} />
          <MobileNavButton active={mode === "manage"} onClick={() => setMode("manage")} icon={<Plus size={20} />} />
          <MobileNavButton active={mode === "stats"} onClick={() => setMode("stats")} icon={<BarChart3 size={20} />} />
          <MobileNavButton active={mode === "about"} onClick={() => setMode("about")} icon={<User size={20} />} />
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
        active ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MobileNavButton({ active, onClick, icon }: { active: boolean, onClick: () => void, icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-3 rounded-xl transition-all",
        active ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-slate-400"
      )}
    >
      {icon}
    </button>
  );
}

// --- Dashboard ---
function Dashboard({ stats, onStart }: { stats: UserStats, onStart: (mode: AppMode) => void }) {
  const accuracy = stats.totalAttempts > 0 ? Math.round((stats.correctAttempts / stats.totalAttempts) * 100) : 0;
  const today = new Date().toISOString().split('T')[0];
  const wordsToday = stats.history.find(h => h.date === today)?.wordsPracticed || 0;

  return (
    <div className="space-y-12 py-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-2">
          <motion.h2 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-5xl font-black text-slate-900 tracking-tight leading-none"
          >
            Welcome back, <span className="text-emerald-600">{stats.displayName.split(' ')[0]}!</span>
          </motion.h2>
          <p className="text-slate-500 text-lg font-medium">You've mastered <span className="text-slate-900 font-bold">{stats.correctAttempts}</span> words so far. Keep it up!</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white px-8 py-5 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4 group hover:shadow-xl transition-all">
            <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
              <Zap size={24} fill="currentColor" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">{stats.streak}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Day Streak</p>
            </div>
          </div>
          <div className="bg-emerald-600 px-8 py-5 rounded-[32px] shadow-xl shadow-emerald-200 flex items-center gap-4 group hover:scale-105 transition-all text-white">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-white group-hover:rotate-12 transition-transform">
              <Target size={24} />
            </div>
            <div>
              <p className="text-2xl font-black">{wordsToday}</p>
              <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Today</p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ModeCard 
            title="Flash Write" 
            desc="Listen and type the spelling. The ultimate test for your ears and fingers."
            icon={<Zap size={24} />}
            onClick={() => onStart("flash-write")}
            color="blue"
          />
          <ModeCard 
            title="Smart MCQ" 
            desc="Choose the correct spelling from realistic common mistakes."
            icon={<CheckCircle2 size={24} />}
            onClick={() => onStart("mcq")}
            color="emerald"
          />
          <ModeCard 
            title="Rapid Mode" 
            desc="Timed challenge! Mixed questions to test your speed and accuracy."
            icon={<Timer size={24} />}
            onClick={() => onStart("rapid")}
            color="emerald"
          />
          <ModeCard 
            title="Leaderboard" 
            desc="See how you rank against other IELTS aspirants globally."
            icon={<Award size={24} />}
            onClick={() => onStart("leaderboard")}
            color="purple"
          />
          <ModeCard 
            title="Advanced Synonyms" 
            desc="Master high-level vocabulary with swipeable flashcards."
            icon={<Sparkles size={24} />}
            onClick={() => onStart("synonyms")}
            color="red"
          />
          <ModeCard 
            title="Topic Vocabulary" 
            desc="Learn words categorized by common IELTS topics."
            icon={<Layers size={24} />}
            onClick={() => onStart("topics")}
            color="blue"
          />
        </div>

        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-900">Quick Stats</h3>
              <BarChart3 size={20} className="text-blue-500" />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Accuracy</span>
                <span className="text-xl font-black text-blue-600">{accuracy}%</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Mastered</span>
                <span className="text-xl font-black text-emerald-600">{Object.keys(stats.wordStats).length}</span>
              </div>
            </div>
            <button 
              onClick={() => onStart("stats")}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 group"
            >
              View Detailed Stats <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-8 rounded-[40px] shadow-xl shadow-emerald-200 text-white space-y-4 relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
            <Trophy size={40} className="text-emerald-200 mb-2" />
            <h3 className="text-2xl font-black leading-tight">Ready for the Daily Challenge?</h3>
            <p className="text-emerald-100 text-sm font-medium">Complete your 1-minute test to climb the global leaderboard!</p>
            <button 
              onClick={() => onStart("rapid")}
              className="w-full py-4 bg-white text-emerald-700 rounded-2xl font-bold hover:bg-emerald-50 transition-all shadow-lg"
            >
              Start Challenge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, subValue, icon, color }: { label: string, value: string | number, subValue: string, icon: React.ReactNode, color: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-opacity-10", color === "blue" ? "bg-blue-500" : color === "emerald" ? "bg-emerald-500" : "bg-orange-500")}>
          {icon}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-3xl font-black text-slate-900">{value}</div>
        <div className="text-sm text-slate-500">{subValue}</div>
      </div>
    </div>
  );
}

function ModeCard({ title, desc, icon, onClick, color }: { title: string, desc: string, icon: React.ReactNode, onClick: () => void, color: string }) {
  return (
    <button 
      onClick={onClick}
      className="group flex items-start gap-4 p-6 bg-white rounded-3xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/5 transition-all text-left"
    >
      <div className={cn(
        "w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
        color === "blue" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
      )}>
        {icon}
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-900">{title}</h4>
          <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </button>
  );
}

// --- Flash Write Mode ---
function FlashWriteMode({ onFinish, onUpdateStats, customWords = [] }: { onFinish: () => void, onUpdateStats: (w: string, c: boolean) => void, customWords?: WordData[] }) {
  const [words, setWords] = useState<WordData[]>(() => shuffleArray([...IELTS_WORDS, ...customWords]));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showWord, setShowWord] = useState(true);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentWord = words[currentIndex];

  useEffect(() => {
    if (showWord) {
      const timer = setTimeout(() => {
        setShowWord(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, showWord]);

  useEffect(() => {
    if (!showWord && !feedback && !isRevealing) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showWord, feedback, isRevealing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback || isRevealing) return;

    const isCorrect = input.trim().toLowerCase() === currentWord.correct.toLowerCase();
    setFeedback(isCorrect ? "correct" : "wrong");
    playSound(isCorrect ? "correct" : "wrong");
    onUpdateStats(currentWord.word, isCorrect);

    if (isCorrect) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2563EB', '#10B981']
      });
      setTimeout(nextWord, 1500);
    } else {
      setIsRevealing(true);
    }
  };

  const nextWord = () => {
    setFeedback(null);
    setIsRevealing(false);
    setInput("");
    setShowWord(true);
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onFinish();
    }
  };

  const rewatchWord = () => {
    setShowWord(true);
    setInput("");
    setFeedback(null);
    setIsRevealing(false);
  };

  const retryWord = () => {
    setInput("");
    setFeedback(null);
    setIsRevealing(false);
    setShowWord(true);
  };

  const skipWord = () => {
    playSound("skip");
    nextWord();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <button onClick={onFinish} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
          <X size={24} />
        </button>
        <div className="flex items-center gap-4">
          <div className="h-2 w-48 bg-slate-200 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-blue-600"
              initial={{ width: 0 }}
              animate={{ width: `${((currentIndex + 1) / words.length) * 100}%` }}
            />
          </div>
          <span className="text-sm font-bold text-slate-500">{currentIndex + 1} / {words.length}</span>
        </div>
      </div>

      <div className="bg-white p-12 rounded-[40px] border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
        <AnimatePresence mode="wait">
          {showWord ? (
            <motion.div
              key="word"
              initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.1, filter: "blur(20px)" }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="text-6xl font-black tracking-tight text-slate-900 text-center"
            >
              {currentWord.word}
            </motion.div>
          ) : (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md space-y-8"
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={!!feedback}
                    placeholder="Type the word..."
                    className={cn(
                      "w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 py-5 text-2xl font-bold text-center transition-all outline-none",
                      feedback === "correct" && "border-emerald-500 bg-emerald-50 text-emerald-700",
                      feedback === "wrong" && "border-red-500 bg-red-50 text-red-700",
                      !feedback && "focus:border-blue-500 focus:bg-white focus:shadow-xl focus:shadow-blue-500/10"
                    )}
                  />
                  {feedback && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={cn(
                        "absolute -right-4 -top-4 w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg",
                        feedback === "correct" ? "bg-emerald-500" : "bg-red-500"
                      )}
                    >
                      {feedback === "correct" ? <Check size={20} /> : <X size={20} />}
                    </motion.div>
                  )}
                </div>
                {!feedback && (
                  <button 
                    type="submit"
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                  >
                    Check Answer
                  </button>
                )}
              </form>

              {isRevealing && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 bg-red-50 rounded-3xl border border-red-100 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-red-800 uppercase tracking-wider">Correct Spelling</span>
                    <span className="text-2xl font-black text-red-900 tracking-tight">{currentWord.correct}</span>
                  </div>
                  <div className="h-px bg-red-200/50" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-red-400 uppercase">Meaning</p>
                    <p className="text-red-900 font-medium">{currentWord.meaning_bn}</p>
                  </div>
                  <button 
                    onClick={nextWord}
                    className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    Got it, next <ArrowRight size={18} />
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-6">
        <button 
          onClick={rewatchWord}
          className="flex items-center gap-2 px-4 py-2 text-blue-600 font-bold hover:bg-blue-50 rounded-xl transition-all"
        >
          <RotateCcw size={18} /> Re-watch
        </button>
        <button 
          onClick={retryWord}
          className="flex items-center gap-2 px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
        >
          <RotateCcw size={18} /> Retry
        </button>
        <button 
          onClick={skipWord}
          className="flex items-center gap-2 px-4 py-2 text-slate-400 font-bold hover:text-slate-900 transition-colors"
        >
          Skip <SkipForward size={18} />
        </button>
      </div>
    </div>
  );
}

// --- MCQ Mode ---
function MCQMode({ onFinish, onUpdateStats, customWords = [] }: { onFinish: () => void, onUpdateStats: (w: string, c: boolean) => void, customWords?: WordData[] }) {
  const [words, setWords] = useState<WordData[]>(() => shuffleArray([...IELTS_WORDS, ...customWords]));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const currentWord = words[currentIndex];
  
  const options = useMemo(() => {
    const allOptions = new Set<string>();
    allOptions.add(currentWord.correct);
    
    // Add predefined mistakes first
    currentWord.common_mistakes.forEach(m => {
      if (m.toLowerCase() !== currentWord.correct.toLowerCase()) {
        allOptions.add(m);
      }
    });
    
    // If we need more, generate similar ones
    if (allOptions.size < 4) {
      const generated = generateSimilarWrongSpellings(currentWord.correct, 10);
      for (const g of generated) {
        if (allOptions.size >= 4) break;
        allOptions.add(g);
      }
    }
    
    // If still less than 4, pull from other words' mistakes
    if (allOptions.size < 4) {
      const otherMistakes = IELTS_WORDS
        .filter(w => w.word !== currentWord.word)
        .flatMap(w => w.common_mistakes);
      const additional = shuffleArray(Array.from(new Set(otherMistakes)));
      for (const a of additional) {
        if (allOptions.size >= 4) break;
        allOptions.add(a);
      }
    }
    
    return shuffleArray(Array.from(allOptions).slice(0, 4));
  }, [currentIndex, currentWord]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedOption) {
        if (e.code === "Space") {
          e.preventDefault();
          nextWord();
        }
        return;
      }

      if (["1", "2", "3", "4"].includes(e.key)) {
        const index = parseInt(e.key) - 1;
        if (options[index]) {
          handleSelect(options[index]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedOption, options, currentIndex]);

  const handleSelect = (option: string) => {
    if (selectedOption) return;
    
    const correct = option === currentWord.correct;
    setSelectedOption(option);
    setIsCorrect(correct);
    playSound(correct ? "correct" : "wrong");
    onUpdateStats(currentWord.word, correct);

    if (correct) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2563EB', '#10B981']
      });
      setTimeout(nextWord, 1500);
    }
  };

  const nextWord = () => {
    setSelectedOption(null);
    setIsCorrect(null);
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onFinish();
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <button onClick={onFinish} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
          <X size={24} />
        </button>
        <div className="flex items-center gap-4">
          <div className="h-2 w-48 bg-slate-200 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-emerald-600"
              initial={{ width: 0 }}
              animate={{ width: `${((currentIndex + 1) / words.length) * 100}%` }}
            />
          </div>
          <span className="text-sm font-bold text-slate-500">{currentIndex + 1} / {words.length}</span>
        </div>
      </div>

      <div className="bg-white p-12 rounded-[40px] border border-slate-200 shadow-xl shadow-slate-200/50 space-y-12 min-h-[400px]">
        <div className="text-center space-y-4">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em]">Select the correct spelling</span>
          <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <p className="text-xl font-medium text-slate-600 italic">"{currentWord.sentence.replace(currentWord.word, "_______")}"</p>
            <p className="mt-2 text-sm font-bold text-slate-400">Meaning: {currentWord.meaning_bn}</p>
          </div>
        </div>

        <div className="grid gap-4">
          {options.map((option, idx) => (
            <motion.button
              key={option}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              onClick={() => handleSelect(option)}
              className={cn(
                "w-full p-6 rounded-2xl text-xl font-bold transition-all border-2 text-left flex items-center justify-between group",
                !selectedOption && "bg-white border-slate-100 hover:border-blue-500 hover:bg-blue-50/50 hover:shadow-lg hover:shadow-blue-500/5",
                selectedOption === option && isCorrect && "bg-emerald-50 border-emerald-500 text-emerald-700",
                selectedOption === option && !isCorrect && "bg-red-50 border-red-500 text-red-700",
                selectedOption && option === currentWord.correct && !isCorrect && "bg-emerald-50 border-emerald-200 text-emerald-700"
              )}
            >
              <div className="flex items-center gap-4">
                <span className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-colors",
                  !selectedOption ? "bg-slate-50 border-slate-200 text-slate-400 group-hover:border-blue-200 group-hover:text-blue-500" : "bg-white/50 border-transparent text-current"
                )}>
                  {idx + 1}
                </span>
                {option}
              </div>
              {selectedOption === option && (
                isCorrect ? <CheckCircle2 className="text-emerald-500" /> : <X className="text-red-500" />
              )}
              {selectedOption && option === currentWord.correct && !isCorrect && (
                <CheckCircle2 className="text-emerald-300" />
              )}
            </motion.button>
          ))}
        </div>

        {selectedOption && !isCorrect && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 pt-4"
          >
            <button 
              onClick={nextWord}
              className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-slate-800 transition-colors flex items-center gap-2"
            >
              Next Word <ArrowRight size={18} />
            </button>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Press Space for next</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// --- Word Library ---
function WordLibrary({ customWords = [] }: { customWords?: WordData[] }) {
  const [search, setSearch] = useState("");
  const [selectedWord, setSelectedWord] = useState<WordData | null>(null);

  const allWords = useMemo(() => [...IELTS_WORDS, ...customWords], [customWords]);

  const filteredWords = allWords.filter(w => 
    w.word.toLowerCase().includes(search.toLowerCase()) || 
    w.meaning_bn.includes(search)
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-slate-900">Word Library</h2>
          <p className="text-slate-500">Explore essential IELTS words.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Search words or meaning..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredWords.map((word, idx) => (
          <motion.div
            key={word.word}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.02, 0.5) }}
            onClick={() => setSelectedWord(word)}
            className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 hover:border-blue-200 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{word.word}</h3>
              <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
            </div>
            <p className="text-sm text-slate-500 line-clamp-1">{word.meaning_bn}</p>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {selectedWord && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWord(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-8">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <h3 className="text-4xl font-black text-slate-900 tracking-tight">{selectedWord.word}</h3>
                    <button 
                      onClick={() => speak(selectedWord.word)}
                      className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full w-fit hover:bg-blue-100 transition-colors"
                    >
                      <Volume2 size={14} />
                      <span className="text-xs font-bold uppercase tracking-wider">Pronunciation</span>
                    </button>
                  </div>
                  <button onClick={() => setSelectedWord(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <X size={20} className="text-slate-400" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bengali Meaning</p>
                    <p className="text-lg font-bold text-slate-900">{selectedWord.meaning_bn}</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-2xl space-y-1">
                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Common Mistakes</p>
                    <p className="text-sm font-bold text-red-700">{selectedWord.common_mistakes.join(", ")}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Info size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest">Example Sentence</span>
                  </div>
                  <p className="text-xl text-slate-700 leading-relaxed font-medium italic">
                    "{selectedWord.sentence}"
                  </p>
                </div>

                <button 
                  onClick={() => setSelectedWord(null)}
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- About View ---
function AboutView() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
    >
      <div className="bg-white rounded-[40px] border border-slate-200 shadow-xl overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="relative h-[400px] md:h-auto bg-slate-100">
            <img 
              src="https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=800&auto=format&fit=crop&q=60" 
              alt="Tarik aziz Tonmoy" 
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent md:hidden" />
            <div className="absolute bottom-6 left-6 text-white md:hidden">
              <h2 className="text-2xl font-black">Tarik aziz Tonmoy</h2>
              <p className="text-slate-200 font-medium">Lead Developer</p>
            </div>
          </div>
          
          <div className="p-8 md:p-12 space-y-8">
            <div className="hidden md:block space-y-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em]">Developer Profile</span>
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">Tarik aziz Tonmoy</h2>
              <p className="text-lg text-slate-500 font-medium">The mind behind SpellMaster IELTS</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">About the Developer</h3>
              <p className="text-slate-600 leading-relaxed">
                Hi! I'm Tarik, the creator and lead developer of SpellMaster IELTS. As someone passionate about language learning and technology, I built this tool to help IELTS aspirants overcome the common hurdle of spelling mistakes.
              </p>
              <p className="text-slate-600 leading-relaxed">
                My goal was to create a clean, interactive, and effective platform that uses active recall and smart repetition to make learning stick.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <a href="#" className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all group">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 shadow-sm">
                  <Github size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">GitHub</p>
                  <p className="text-sm font-bold text-slate-900">@tarikaziztonmoy</p>
                </div>
              </a>
              
              <a href="#" className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all group">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 shadow-sm">
                  <Linkedin size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">LinkedIn</p>
                  <p className="text-sm font-bold text-slate-900">Tarik aziz Tonmoy</p>
                </div>
              </a>

              <a href="mailto:tarikaziztonmoy@gmail.com" className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all group">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 shadow-sm">
                  <Mail size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Email</p>
                  <p className="text-sm font-bold text-slate-900">tarikaziztonmoy@gmail.com</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-8 text-center">
        <p className="text-slate-400 text-sm font-medium">© 2024 SpellMaster IELTS. Crafted with ❤️ for IELTS aspirants.</p>
      </div>
    </motion.div>
  );
}

// --- Auth View ---
function AuthView({ onFinish }: { onFinish: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error } = await supabase!.auth.signUp({ email, password });
        if (error) throw error;
        alert("Check your email for confirmation!");
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      onFinish();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-xl space-y-8">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-200 mb-4">
            <Zap size={32} fill="currentColor" />
          </div>
          <h2 className="text-3xl font-black text-slate-900">{isSignUp ? "Create Account" : "Welcome Back"}</h2>
          <p className="text-slate-500">Sync your progress across all devices.</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium"
              placeholder="name@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm font-bold text-red-500 text-center">{error}</p>}

          <button 
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
          >
            {loading ? "Processing..." : (isSignUp ? "Sign Up" : "Sign In")}
          </button>
        </form>

        <div className="text-center">
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
          >
            {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Synonyms Mode ---
function SynonymsMode({ onFinish }: { onFinish: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [direction, setDirection] = useState(0);

  const current = ADVANCED_SYNONYMS[currentIndex];

  const next = () => {
    setDirection(1);
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % ADVANCED_SYNONYMS.length);
      setDirection(0);
    }, 200);
  };

  const prev = () => {
    setDirection(-1);
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + ADVANCED_SYNONYMS.length) % ADVANCED_SYNONYMS.length);
      setDirection(0);
    }, 200);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") setIsFlipped(!isFlipped);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFlipped, currentIndex]);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-slate-900">Advanced Synonyms</h2>
          <p className="text-slate-500">Swipe or use keys (← → Space) to navigate.</p>
        </div>
        <button onClick={onFinish} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all">
          <X size={24} />
        </button>
      </header>

      <div className="relative h-[450px] perspective-1000">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ x: direction * 300, opacity: 0, rotateY: 0, scale: 0.8 }}
            animate={{ x: 0, opacity: 1, rotateY: isFlipped ? 180 : 0, scale: 1 }}
            exit={{ x: -direction * 300, opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", damping: 20, stiffness: 100 }}
            onClick={() => setIsFlipped(!isFlipped)}
            className="w-full h-full relative cursor-pointer preserve-3d"
          >
            {/* Front - Red Theme (Starting Point) */}
            <div className={`absolute inset-0 bg-white rounded-[40px] border-4 border-red-50 shadow-2xl flex flex-col items-center justify-center p-12 backface-hidden transition-all group overflow-hidden ${isFlipped ? 'invisible' : ''}`}>
              {/* Decorative Background Elements */}
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-red-50 rounded-full blur-3xl opacity-50 group-hover:scale-110 transition-transform duration-700" />
              <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-red-50 rounded-full blur-3xl opacity-50 group-hover:scale-110 transition-transform duration-700" />
              
              <motion.div 
                animate={{ y: [0, -10, 0] }} 
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="relative z-10 flex flex-col items-center"
              >
                <span className="text-xs font-bold text-red-400 uppercase tracking-[0.4em] mb-6">Common Word</span>
                <h3 className="text-7xl font-black text-slate-900 text-center tracking-tight leading-none mb-4">{current.word}</h3>
                <div className="h-1 w-24 bg-red-100 rounded-full mb-12" />
                
                <div className="flex items-center gap-3 text-red-300 bg-red-50/50 px-6 py-3 rounded-full">
                  <Sparkles size={18} className="animate-pulse" />
                  <span className="text-sm font-bold uppercase tracking-widest">Tap to upgrade</span>
                </div>
              </motion.div>
            </div>

            {/* Back - Green Theme (Advanced Upgrade) */}
            <div className={`absolute inset-0 bg-emerald-600 rounded-[40px] shadow-2xl flex flex-col items-center justify-center p-12 backface-hidden rotate-y-180 transition-all group overflow-hidden ${!isFlipped ? 'invisible' : ''}`}>
              {/* Decorative Background Elements */}
              <div className="absolute -top-20 -left-20 w-80 h-80 bg-emerald-500 rounded-full blur-3xl opacity-40 group-hover:scale-110 transition-transform duration-700" />
              <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-emerald-700 rounded-full blur-3xl opacity-40 group-hover:scale-110 transition-transform duration-700" />

              <motion.div 
                animate={{ scale: [1, 1.02, 1] }} 
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="relative z-10 flex flex-col items-center w-full"
              >
                <span className="text-xs font-bold text-emerald-200 uppercase tracking-[0.4em] mb-6">Advanced Synonym</span>
                <h3 className="text-7xl font-black text-white text-center tracking-tight leading-none mb-2 drop-shadow-lg">{current.synonym}</h3>
                <p className="text-3xl font-bold text-emerald-100 mb-10">{current.meaning_bn}</p>
                
                <div className="w-full p-8 bg-white/10 backdrop-blur-md rounded-[32px] border border-white/20 shadow-inner">
                  <div className="flex items-center gap-2 mb-3 text-emerald-200">
                    <Info size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Contextual Example</span>
                  </div>
                  <p className="text-white text-center text-lg italic leading-relaxed font-medium">
                    "{current.sentence}"
                  </p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-6">
        <button onClick={prev} className="p-5 bg-white border border-slate-200 rounded-3xl text-slate-600 hover:border-red-500 hover:text-red-600 transition-all shadow-sm hover:shadow-xl hover:shadow-red-500/5">
          <ChevronLeft size={32} />
        </button>
        <div className="px-8 py-4 bg-slate-100 rounded-2xl font-black text-slate-500 tracking-widest text-sm">
          {currentIndex + 1} <span className="text-slate-300 mx-2">/</span> {ADVANCED_SYNONYMS.length}
        </div>
        <button onClick={next} className="p-5 bg-white border border-slate-200 rounded-3xl text-slate-600 hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-sm hover:shadow-xl hover:shadow-emerald-500/5">
          <ChevronRight size={32} />
        </button>
      </div>
    </div>
  );
}

// --- Topics Mode ---
function TopicsMode({ onFinish }: { onFinish: () => void }) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const topics = Array.from(new Set(TOPIC_VOCAB.map(v => v.topic)));

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-slate-900">Topic-wise Vocabulary</h2>
          <p className="text-slate-500">Master words by specific IELTS categories.</p>
        </div>
        <button onClick={onFinish} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all">
          <X size={24} />
        </button>
      </header>

      {!selectedTopic ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {topics.map((topic) => (
            <motion.div
              key={topic}
              whileHover={{ scale: 1.02, y: -5 }}
              onClick={() => setSelectedTopic(topic)}
              className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all cursor-pointer group"
            >
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all mb-6">
                <Layers size={28} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">{topic}</h3>
              <p className="text-slate-500 font-medium">
                {TOPIC_VOCAB.filter(v => v.topic === topic).length} Essential Words
              </p>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <button 
            onClick={() => setSelectedTopic(null)}
            className="flex items-center gap-2 text-blue-600 font-bold hover:gap-3 transition-all"
          >
            <ChevronLeft size={20} /> Back to Topics
          </button>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TOPIC_VOCAB.filter(v => v.topic === selectedTopic).map((word, idx) => (
              <motion.div
                key={word.word}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white p-6 rounded-3xl border border-slate-200 flex items-center justify-between group hover:border-blue-200 transition-all"
              >
                <div>
                  <h4 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{word.word}</h4>
                  <p className="text-slate-500 font-medium">{word.meaning_bn}</p>
                </div>
                <button 
                  onClick={() => speak(word.word)}
                  className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all"
                >
                  <Volume2 size={20} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Manage Words ---
function ManageWords({ stats, setStats, user }: { stats: UserStats, setStats: any, user: any }) {
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddWords = () => {
    if (!inputText.trim()) return;
    setIsProcessing(true);

    // Simple parser: "Word - Meaning - Sentence" or just "Word"
    const lines = inputText.split('\n').filter(l => l.trim());
    const newWords: WordData[] = lines.map(line => {
      const parts = line.split(/[–-]/).map(p => p.trim());
      return {
        word: parts[0],
        meaning_bn: parts[1] || "Custom Word",
        common_mistakes: [],
        sentence: parts[2] || `Example sentence for ${parts[0]}`
      };
    });

    setStats((prev: UserStats) => ({
      ...prev,
      customWords: [...(prev.customWords || []), ...newWords]
    }));

    setInputText("");
    setIsProcessing(false);
    alert(`${newWords.length} words added successfully!`);
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20 space-y-6">
        <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mx-auto">
          <LogIn size={40} />
        </div>
        <h2 className="text-3xl font-black text-slate-900">Sign In Required</h2>
        <p className="text-slate-500 max-w-md mx-auto">You need to be logged in to manage your custom word lists and sync them across devices.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="space-y-1">
        <h2 className="text-3xl font-black text-slate-900">Manage Word Lists</h2>
        <p className="text-slate-500">Paste your custom words or upload a text file to expand your library.</p>
      </header>

      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Paste Words (Format: Word - Meaning - Sentence)</label>
          <textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full h-64 px-6 py-5 bg-slate-50 border border-slate-200 rounded-3xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium resize-none"
            placeholder="Important - Crucial - It is crucial to study hard.&#10;Big - Substantial - The building is substantial."
          />
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={handleAddWords}
            disabled={isProcessing}
            className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            {isProcessing ? "Processing..." : "Add to My Library"}
          </button>
          <label className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer">
            <FileText size={20} />
            Upload File
            <input type="file" className="hidden" accept=".txt,.csv" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => setInputText(e.target?.result as string);
                reader.readAsText(file);
              }
            }} />
          </label>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-bold text-slate-900">My Custom Words ({stats.customWords?.length || 0})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.customWords?.map((word, idx) => (
            <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">{word.word}</p>
                <p className="text-xs text-slate-500">{word.meaning_bn}</p>
              </div>
              <button 
                onClick={() => {
                  const newWords = [...stats.customWords];
                  newWords.splice(idx, 1);
                  setStats((prev: UserStats) => ({ ...prev, customWords: newWords }));
                }}
                className="p-2 text-slate-300 hover:text-red-500 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Daily Challenge Popup ---
function DailyChallengePopup({ onStart, onClose }: { onStart: () => void, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden border-4 border-emerald-500/20"
      >
        <div className="p-10 text-center space-y-8">
          <div className="w-24 h-24 bg-emerald-100 rounded-[32px] flex items-center justify-center text-emerald-600 mx-auto shadow-xl shadow-emerald-200 animate-bounce">
            <Timer size={48} />
          </div>
          <div className="space-y-3">
            <h3 className="text-3xl font-black text-slate-900">Daily Challenge!</h3>
            <p className="text-slate-500 font-medium">Ready for your 1-minute recall test? Boost your streak and climb the leaderboard!</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={onClose}
              className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
            >
              Maybe Later
            </button>
            <button 
              onClick={onStart}
              className="px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
            >
              Start Now
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// --- Rapid Mode ---
function RapidMode({ onFinish, stats, onUpdateStats, user }: { onFinish: () => void, stats: UserStats, onUpdateStats: (w: string, c: boolean) => void, user: any }) {
  const [timeLeft, setTimeLeft] = useState(60); // Default 1 min
  const [isActive, setIsActive] = useState(false);
  const [score, setScore] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questions, setQuestions] = useState<any[]>([]);
  const [results, setResults] = useState<{word: string, isCorrect: boolean}[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [selectedTime, setSelectedTime] = useState(60);
  const [input, setInput] = useState("");
  const [mcqOptions, setMcqOptions] = useState<string[]>([]);
  const [selectedMcq, setSelectedMcq] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  const allWords = useMemo(() => {
    const base = [...IELTS_WORDS, ...stats.customWords];
    return shuffleArray(base);
  }, [stats.customWords]);

  const startChallenge = (time: number) => {
    const q = allWords.slice(0, 50).map((w, i) => ({
      ...w,
      type: i % 2 === 0 ? "write" : "mcq"
    }));
    setQuestions(q);
    setSelectedTime(time);
    setTimeLeft(time);
    setIsActive(true);
    setScore(0);
    setCurrentIndex(0);
    setResults([]);
    setIsFinished(false);
  };

  useEffect(() => {
    let timer: any;
    if (isActive && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && isActive) {
      finishChallenge();
    }
    return () => clearInterval(timer);
  }, [isActive, timeLeft]);

  const finishChallenge = async () => {
    setIsActive(false);
    setIsFinished(true);
    
    if (user && isSupabaseConfigured()) {
      const today = new Date().toISOString().split('T')[0];
      // Save score to leaderboard
      await supabase!.from('daily_scores').upsert({
        user_id: user.id,
        score: score,
        date: today,
        user_name: stats.displayName || user.email?.split('@')[0] || 'Anonymous'
      });
    }
  };

  const handleWriteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || feedback) return;

    const isCorrect = input.trim().toLowerCase() === questions[currentIndex].word.toLowerCase();
    processAnswer(isCorrect);
  };

  const handleMcqSubmit = (option: string) => {
    if (selectedMcq || feedback) return;
    setSelectedMcq(option);
    const isCorrect = option === questions[currentIndex].word;
    processAnswer(isCorrect);
  };

  const processAnswer = (isCorrect: boolean) => {
    setFeedback(isCorrect ? "correct" : "wrong");
    playSound(isCorrect ? "correct" : "wrong");
    if (isCorrect) {
      setScore(prev => prev + 10);
      confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 }, colors: ['#10B981'] });
    }
    
    setResults(prev => [...prev, { word: questions[currentIndex].word, isCorrect }]);
    onUpdateStats(questions[currentIndex].word, isCorrect);

    setTimeout(() => {
      setFeedback(null);
      setInput("");
      setSelectedMcq(null);
      setCurrentIndex(prev => prev + 1);
      if (currentIndex + 1 >= questions.length) finishChallenge();
    }, 800);
  };

  useEffect(() => {
    if (isActive && questions[currentIndex]?.type === "mcq") {
      const options = shuffleArray([
        questions[currentIndex].word,
        ...generateSimilarWrongSpellings(questions[currentIndex].word, 3)
      ]);
      setMcqOptions(options);
    }
  }, [currentIndex, isActive, questions]);

  if (!isActive && !isFinished) {
    return (
      <div className="max-w-2xl mx-auto space-y-12 py-12">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center text-emerald-600 mx-auto shadow-xl shadow-emerald-200">
            <Timer size={40} />
          </div>
          <h2 className="text-4xl font-black text-slate-900">Rapid Mode</h2>
          <p className="text-slate-500 max-w-md mx-auto">Test your speed! Mixed questions under pressure. Choose your duration to begin.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[60, 120, 300, 600].map(time => (
            <button 
              key={time}
              onClick={() => startChallenge(time)}
              className="p-6 bg-white border-2 border-slate-100 rounded-[32px] hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
            >
              <p className="text-2xl font-black text-slate-900 group-hover:text-emerald-600">{time / 60}m</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Duration</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 py-8">
        <div className="bg-white p-12 rounded-[48px] border border-slate-200 shadow-2xl text-center space-y-8">
          <div className="space-y-2">
            <h2 className="text-5xl font-black text-slate-900">Challenge Complete!</h2>
            <p className="text-xl text-slate-500 font-medium">You scored <span className="text-emerald-600 font-black">{score}</span> points</p>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
              <p className="text-3xl font-black text-emerald-600">{results.filter(r => r.isCorrect).length}</p>
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Correct</p>
            </div>
            <div className="p-6 bg-red-50 rounded-3xl border border-red-100">
              <p className="text-3xl font-black text-red-600">{results.filter(r => !r.isCorrect).length}</p>
              <p className="text-xs font-bold text-red-400 uppercase tracking-widest">Wrong</p>
            </div>
            <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100">
              <p className="text-3xl font-black text-blue-600">{Math.round((results.filter(r => r.isCorrect).length / results.length) * 100 || 0)}%</p>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Accuracy</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900 text-left">Review Mistakes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {results.filter(r => !r.isCorrect).map((r, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-red-50/50 rounded-2xl border border-red-100">
                  <span className="font-bold text-slate-700">{r.word}</span>
                  <button onClick={() => speak(r.word)} className="p-2 text-red-400 hover:text-red-600"><Volume2 size={16} /></button>
                </div>
              ))}
              {results.filter(r => !r.isCorrect).length === 0 && <p className="text-slate-400 italic py-4">Perfect run! No mistakes to review.</p>}
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button onClick={onFinish} className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-[24px] font-bold hover:bg-slate-200 transition-all">Back to Home</button>
            <button onClick={() => startChallenge(selectedTime)} className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200">Try Again</button>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-8">
      <div className="flex items-center justify-between bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
            <Timer size={24} />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</p>
            <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-emerald-500"
                initial={{ width: "100%" }}
                animate={{ width: `${(timeLeft / selectedTime) * 100}%` }}
              />
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Score</p>
          <p className="text-3xl font-black text-emerald-600">{score}</p>
        </div>
      </div>

      <motion.div 
        key={currentIndex}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-12 rounded-[48px] border border-slate-200 shadow-2xl space-y-10 text-center relative overflow-hidden"
      >
        {feedback && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1.2 }}
            className={cn(
              "absolute top-10 right-10 w-16 h-16 rounded-full flex items-center justify-center text-white z-20",
              feedback === "correct" ? "bg-emerald-500" : "bg-red-500"
            )}
          >
            {feedback === "correct" ? <Check size={32} /> : <X size={32} />}
          </motion.div>
        )}

        <div className="space-y-2">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-[0.3em]">
            {currentQ.type === "write" ? "Type the Word" : "Choose Correct Spelling"}
          </span>
          <h3 className="text-3xl font-bold text-slate-900">{currentQ.meaning_bn}</h3>
        </div>

        {currentQ.type === "write" ? (
          <form onSubmit={handleWriteSubmit} className="space-y-6">
            <input 
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full text-4xl font-black text-center py-6 bg-slate-50 border-4 border-slate-100 rounded-[32px] focus:border-emerald-500 focus:bg-white outline-none transition-all uppercase tracking-widest"
              placeholder="TYPE HERE..."
            />
            <button className="hidden" type="submit">Submit</button>
          </form>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {mcqOptions.map((opt, i) => (
              <button 
                key={i}
                onClick={() => handleMcqSubmit(opt)}
                className={cn(
                  "w-full p-6 rounded-2xl text-xl font-bold transition-all border-2 text-left flex items-center gap-4",
                  !selectedMcq ? "bg-white border-slate-100 hover:border-emerald-500 hover:bg-emerald-50" :
                  opt === currentQ.word ? "bg-emerald-50 border-emerald-500 text-emerald-700" :
                  selectedMcq === opt ? "bg-red-50 border-red-500 text-red-700" : "bg-white border-slate-100 opacity-50"
                )}
              >
                <span className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-sm text-slate-400">{i + 1}</span>
                {opt}
              </button>
            ))}
          </div>
        )}

        <p className="text-slate-400 text-sm font-medium italic">"{currentQ.sentence}"</p>
      </motion.div>
    </div>
  );
}

// --- Leaderboard View ---
function LeaderboardView() {
  const [scores, setScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      if (!isSupabaseConfigured()) return;
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase!
        .from('daily_scores')
        .select('*')
        .eq('date', today)
        .order('score', { ascending: false })
        .limit(10);
      
      if (data) setScores(data);
      setLoading(false);
    };
    fetchLeaderboard();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8">
      <header className="text-center space-y-2">
        <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 mx-auto mb-4">
          <Award size={32} />
        </div>
        <h2 className="text-4xl font-black text-slate-900">Daily Leaderboard</h2>
        <p className="text-slate-500">Top performers of the day. Reset in 24 hours.</p>
      </header>

      <div className="bg-white rounded-[48px] border border-slate-200 shadow-2xl overflow-hidden">
        {loading ? (
          <div className="p-20 text-center text-slate-400">Loading rankings...</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {scores.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-6 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-6">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center font-black",
                    i === 0 ? "bg-yellow-400 text-white" : 
                    i === 1 ? "bg-slate-300 text-white" :
                    i === 2 ? "bg-orange-400 text-white" : "bg-slate-100 text-slate-400"
                  )}>
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-lg">{s.user_name}</p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Aspirant</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-emerald-600">{s.score}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Points</p>
                </div>
              </div>
            ))}
            {scores.length === 0 && (
              <div className="p-20 text-center space-y-4">
                <p className="text-slate-400 italic">No scores yet today. Be the first to challenge!</p>
                <button className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold">Start Challenge</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Stats View ---
function StatsView({ stats, onUpdateGoal }: { stats: UserStats, onUpdateGoal: (g: number) => void }) {
  const accuracy = stats.totalAttempts > 0 ? Math.round((stats.correctAttempts / stats.totalAttempts) * 100) : 0;
  
  const pieData = [
    { name: "Correct", value: stats.correctAttempts, color: "#10B981" },
    { name: "Wrong", value: stats.totalAttempts - stats.correctAttempts, color: "#EF4444" }
  ];

  const today = new Date().toISOString().split('T')[0];
  const todayStats = stats.history.find(h => h.date === today);
  const wordsToday = todayStats?.wordsPracticed || 0;
  const goalProgress = Math.min(Math.round((wordsToday / stats.dailyGoal) * 100), 100);

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Your Progress</h2>
          <p className="text-slate-500 font-medium">Tracking your journey to IELTS excellence.</p>
        </div>
        <div className="flex items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
            <Target size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Daily Goal</p>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                value={stats.dailyGoal} 
                onChange={(e) => onUpdateGoal(parseInt(e.target.value) || 0)}
                className="w-16 font-black text-xl text-slate-900 outline-none focus:text-emerald-600 transition-colors"
              />
              <span className="text-slate-300 font-bold">words</span>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Stats Card */}
        <div className="md:col-span-2 bg-white p-10 rounded-[48px] border border-slate-200 shadow-2xl space-y-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="space-y-1">
              <p className="text-4xl font-black text-slate-900">{stats.totalAttempts}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Words</p>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-black text-emerald-600">{stats.correctAttempts}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Correct</p>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-black text-blue-600">{accuracy}%</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Accuracy</p>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-black text-orange-500">{stats.streak}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Streak</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <History size={20} className="text-blue-500" /> Accuracy Trend
              </h3>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Last 14 Days</span>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.history}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                    tickFormatter={(str) => str.split('-').slice(1).join('/')}
                  />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontWeight: 800, color: '#2563eb' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="accuracy" 
                    stroke="#2563eb" 
                    strokeWidth={4} 
                    dot={{ r: 6, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 8, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Side Stats */}
        <div className="space-y-6">
          {/* Goal Progress */}
          <div className="bg-emerald-600 p-8 rounded-[40px] shadow-xl shadow-emerald-200 text-white space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold uppercase tracking-widest opacity-80">Today's Goal</p>
              <Sparkles size={20} className="text-emerald-300" />
            </div>
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <p className="text-5xl font-black">{wordsToday}</p>
                <p className="text-xl font-bold opacity-60">/ {stats.dailyGoal}</p>
              </div>
              <div className="w-full h-3 bg-white/20 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${goalProgress}%` }}
                  className="h-full bg-white"
                />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-80 text-right">{goalProgress}% Complete</p>
            </div>
          </div>

          {/* Success Ratio */}
          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl space-y-6">
            <h3 className="text-lg font-bold text-slate-900 text-center">Success Ratio</h3>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Correct</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Wrong</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Word Mastery Grid */}
      <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-2xl space-y-8">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-black text-slate-900">Word Mastery</h3>
          <div className="flex gap-2">
            <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Mastered</div>
            <div className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Needs Work</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Object.entries(stats.wordStats).sort((a, b) => (b[1] as any).correct - (a[1] as any).correct).slice(0, 18).map(([word, s]: [string, any]) => (
            <div key={word} className={cn(
              "p-4 rounded-2xl border transition-all text-center space-y-1",
              s.correct > s.wrong ? "bg-emerald-50/50 border-emerald-100" : "bg-red-50/50 border-red-100"
            )}>
              <p className="font-bold text-slate-800 truncate">{word}</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-[10px] font-black text-emerald-600">{s.correct}</span>
                <div className="w-1 h-1 bg-slate-300 rounded-full" />
                <span className="text-[10px] font-black text-red-600">{s.wrong}</span>
              </div>
            </div>
          ))}
          {Object.keys(stats.wordStats).length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 italic">
              Start practicing to see your word mastery!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
