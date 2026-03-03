export type AppMode = "home" | "flash-write" | "mcq" | "library" | "stats" | "about" | "synonyms" | "topics" | "manage" | "auth" | "rapid" | "leaderboard";

export interface UserStats {
  totalAttempts: number;
  correctAttempts: number;
  streak: number;
  lastPracticeDate: string | null;
  lastDailyChallengeDate: string | null;
  dailyGoal: number; // words per day
  displayName: string;
  wordStats: {
    [key: string]: {
      correct: number;
      wrong: number;
    };
  };
  history: {
    date: string;
    accuracy: number;
    wordsPracticed: number;
  }[];
  customWords: WordData[];
}

export interface WordData {
  word: string;
  correct: string;
  common_mistakes: string[];
  meaning_bn: string;
  sentence: string;
}
