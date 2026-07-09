export interface Subject {
  id: number;
  code: string;
  name: string;
  semester?: number | null;
}

export interface Quiz {
  id: number;
  name: string;
  subjectTargetId: number;
  isExamOnly?: number;
}

export interface Answer {
  id: number;
  content: string;
  isCorrect: boolean;
  indexOrder: number;
  questionTargetId: number;
}

export interface Question {
  id: number;
  content: string;
  explanation: string;
  imageUrl?: string;        // Optional base64 data URI for question image
  explanationImage?: string; // Optional base64 data URI for explanation image
  quizTargetId: number;
  answersList?: Answer[];
}

export type LearningMode = 'study' | 'practice' | 'exam';

export interface LearningSession {
  id: number;
  quizTargetId: number;
  learningMode: LearningMode;
  startTime: string; // ISO string
  recentLearningDateTime?: string; // ISO string
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  currentIndex: number;
  studyTime: number; // in seconds
  timeLimit?: number; // in seconds, null if none
  isCompleted: boolean;
  endTime?: string; // ISO string
  totalCorrect: number;
  totalWrong: number;
  identifyingId?: number;
  lockToken?: string;
  sessionToken?: string;
  userEmail?: string;
  userName?: string;
  userMssv?: string;
  quizName?: string;
  subjectCode?: string;
  subjectName?: string;
  openCode?: string;
  allowReview?: number;
  showScore?: number;
  isScheduledExam?: boolean;
  examStarted?: number | boolean;
}

export interface LearningSessionDetail {
  id: number;
  learningSessionId: number;
  questionTargetId: number;
  isChecked: boolean;
  isSeen: boolean;
  isCorrect?: boolean | null;
  selectedAnswersList: number[]; // IDs of selected answers
}

export type ShortcutAction = 'nextQuestion' | 'previousQuestion' | 'toggleQuestion' | 'checkQuestion';

export interface AppConfig {
  id: number;
  fontFamily: string;
  fontSize: number;
  enableQuickAnswer: boolean;
  isMouseEnabled: boolean;
  keyBindings: Record<ShortcutAction, string[]>;
  examOpenCode?: string;
  aiEndpoint?: string;
  aiApiKey?: string;
  aiModel?: string;
}

export interface Exam {
  id?: number;
  examCode: string;
  quizTargetId: number;
  useSeb: number; // 0 or 1
  durationTime: number;
  attemptsAllowed: number;
  timeOpen: string;
  timeEnd: string;
  openCode?: string;
  allowedUsers: string; // JSON string array
  showScore: number; // 0 or 1
  allowReview: number; // 0 or 1
}

