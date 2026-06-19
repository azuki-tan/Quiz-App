import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../quiz.db');

let db: Database<sqlite3.Database, sqlite3.Statement>;

export async function initDb() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON');

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subjectTargetId INTEGER NOT NULL,
      FOREIGN KEY (subjectTargetId) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      explanation TEXT,
      quizTargetId INTEGER NOT NULL,
      FOREIGN KEY (quizTargetId) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      isCorrect INTEGER NOT NULL, -- 0 or 1
      indexOrder INTEGER NOT NULL,
      questionTargetId INTEGER NOT NULL,
      FOREIGN KEY (questionTargetId) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quizTargetId INTEGER NOT NULL,
      learningMode TEXT NOT NULL,
      startTime TEXT NOT NULL,
      recentLearningDateTime TEXT,
      shuffleQuestions INTEGER NOT NULL,
      shuffleAnswers INTEGER NOT NULL,
      currentIndex INTEGER NOT NULL,
      studyTime INTEGER NOT NULL,
      timeLimit INTEGER,
      isCompleted INTEGER NOT NULL,
      endTime TEXT,
      totalCorrect INTEGER NOT NULL,
      totalWrong INTEGER NOT NULL,
      identifyingId INTEGER,
      lockToken TEXT,
      sessionToken TEXT
    );

    CREATE TABLE IF NOT EXISTS session_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learningSessionId INTEGER NOT NULL,
      questionTargetId INTEGER NOT NULL,
      isChecked INTEGER NOT NULL,
      isSeen INTEGER NOT NULL,
      isCorrect INTEGER, -- NULL, 0 or 1
      selectedAnswersList TEXT NOT NULL, -- JSON array string
      FOREIGN KEY (learningSessionId) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY,
      fontFamily TEXT NOT NULL,
      fontSize INTEGER NOT NULL,
      enableQuickAnswer INTEGER NOT NULL,
      isMouseEnabled INTEGER NOT NULL,
      keyBindings TEXT NOT NULL -- JSON string
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      mssv TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  // Insert default config if empty
  const configExists = await db.get('SELECT 1 FROM config WHERE id = 1');
  if (!configExists) {
    const defaultKeyBindings = {
      nextQuestion: ["Space", "ArrowRight"],
      previousQuestion: ["ArrowLeft"],
      toggleQuestion: ["KeyH", "h", "H"],
      checkQuestion: ["Enter"]
    };
    await db.run(`
      INSERT INTO config (id, fontFamily, fontSize, enableQuickAnswer, isMouseEnabled, keyBindings)
      VALUES (1, 'Microsoft Sans Serif', 14, 0, 1, ?)
    `, JSON.stringify(defaultKeyBindings));
  }

  // Migrations: add new columns if they don't exist yet
  const pragmaInfo = await db.all('PRAGMA table_info(questions)');
  const columnNames = pragmaInfo.map((c: any) => c.name);
  if (!columnNames.includes('imageUrl')) {
    await db.run('ALTER TABLE questions ADD COLUMN imageUrl TEXT');
  }
  if (!columnNames.includes('explanationImage')) {
    await db.run('ALTER TABLE questions ADD COLUMN explanationImage TEXT');
  }

  // Migrations for sessions table
  const sessionPragma = await db.all('PRAGMA table_info(sessions)');
  const sessionCols = sessionPragma.map((c: any) => c.name);
  if (!sessionCols.includes('identifyingId')) {
    await db.run('ALTER TABLE sessions ADD COLUMN identifyingId INTEGER');
  }
  if (!sessionCols.includes('lockToken')) {
    await db.run('ALTER TABLE sessions ADD COLUMN lockToken TEXT');
  }
  if (!sessionCols.includes('sessionToken')) {
    await db.run('ALTER TABLE sessions ADD COLUMN sessionToken TEXT');
    // Generate secure token for existing sessions
    const rows = await db.all('SELECT id FROM sessions WHERE sessionToken IS NULL');
    for (const row of rows) {
      const token = crypto.randomBytes(16).toString('hex');
      await db.run('UPDATE sessions SET sessionToken = ? WHERE id = ?', [token, row.id]);
    }
  }

  if (!sessionCols.includes('userEmail')) {
    await db.run('ALTER TABLE sessions ADD COLUMN userEmail TEXT');
  }
  if (!sessionCols.includes('userName')) {
    await db.run('ALTER TABLE sessions ADD COLUMN userName TEXT');
  }
  if (!sessionCols.includes('userMssv')) {
    await db.run('ALTER TABLE sessions ADD COLUMN userMssv TEXT');
  }

  console.log('SQLite Database initialized successfully at:', dbPath);
}

// --- SUBJECTS CRUD ---
export async function getSubjects() {
  return db.all('SELECT * FROM subjects');
}

export async function saveSubject(subject: { id?: number; code: string; name: string }) {
  if (subject.id) {
    await db.run(
      'UPDATE subjects SET code = ?, name = ? WHERE id = ?',
      [subject.code, subject.name, subject.id]
    );
    return subject.id;
  } else {
    const result = await db.run(
      'INSERT INTO subjects (code, name) VALUES (?, ?)',
      [subject.code, subject.name]
    );
    return result.lastID!;
  }
}

export async function deleteSubject(id: number) {
  await db.run('DELETE FROM subjects WHERE id = ?', [id]);
}

// --- QUIZZES CRUD ---
export async function getQuizzesBySubject(subjectId: number) {
  return db.all('SELECT * FROM quizzes WHERE subjectTargetId = ?', [subjectId]);
}

export async function getQuizById(id: number) {
  return db.get('SELECT * FROM quizzes WHERE id = ?', [id]);
}

export async function getQuizWithSubjectInfo(id: number) {
  return db.get(`
    SELECT q.*, s.code as subjectCode, s.name as subjectName
    FROM quizzes q
    JOIN subjects s ON q.subjectTargetId = s.id
    WHERE q.id = ?
  `, [id]);
}

export async function saveQuiz(quiz: { id?: number; name: string; subjectTargetId: number }) {
  if (quiz.id) {
    await db.run(
      'UPDATE quizzes SET name = ?, subjectTargetId = ? WHERE id = ?',
      [quiz.name, quiz.subjectTargetId, quiz.id]
    );
    return quiz.id;
  } else {
    const result = await db.run(
      'INSERT INTO quizzes (name, subjectTargetId) VALUES (?, ?)',
      [quiz.name, quiz.subjectTargetId]
    );
    return result.lastID!;
  }
}

export async function deleteQuiz(id: number) {
  await db.run('DELETE FROM quizzes WHERE id = ?', [id]);
}

// --- QUESTIONS & ANSWERS CRUD ---
export async function getQuestionsByQuiz(quizId: number) {
  const questions = await db.all('SELECT * FROM questions WHERE quizTargetId = ?', [quizId]);
  for (const q of questions) {
    const answers = await db.all('SELECT * FROM answers WHERE questionTargetId = ? ORDER BY indexOrder ASC', [q.id]);
    q.answersList = answers.map(a => ({ ...a, isCorrect: !!a.isCorrect }));
  }
  return questions;
}

export async function getQuestionById(id: number) {
  const q = await db.get('SELECT * FROM questions WHERE id = ?', [id]);
  if (q) {
    const answers = await db.all('SELECT * FROM answers WHERE questionTargetId = ? ORDER BY indexOrder ASC', [q.id]);
    q.answersList = answers.map(a => ({ ...a, isCorrect: !!a.isCorrect }));
  }
  return q;
}

export async function saveQuestion(question: {
  id?: number;
  content: string;
  explanation: string;
  imageUrl?: string | null;
  explanationImage?: string | null;
  quizTargetId: number;
  answersList?: Array<{ id?: number; content: string; isCorrect: boolean; indexOrder: number }>;
}) {
  let qId = question.id;
  if (qId) {
    await db.run(
      'UPDATE questions SET content = ?, explanation = ?, quizTargetId = ?, imageUrl = ?, explanationImage = ? WHERE id = ?',
      [question.content, question.explanation, question.quizTargetId, question.imageUrl ?? null, question.explanationImage ?? null, qId]
    );
  } else {
    const result = await db.run(
      'INSERT INTO questions (content, explanation, quizTargetId, imageUrl, explanationImage) VALUES (?, ?, ?, ?, ?)',
      [question.content, question.explanation, question.quizTargetId, question.imageUrl ?? null, question.explanationImage ?? null]
    );
    qId = result.lastID!;
  }

  // Save answers if provided
  if (question.answersList) {
    // Clear existing answers first
    await db.run('DELETE FROM answers WHERE questionTargetId = ?', [qId]);
    for (const ans of question.answersList) {
      await db.run(
        'INSERT INTO answers (content, isCorrect, indexOrder, questionTargetId) VALUES (?, ?, ?, ?)',
        [ans.content, ans.isCorrect ? 1 : 0, ans.indexOrder, qId]
      );
    }
  }

  return qId;
}

export async function deleteQuestion(id: number) {
  await db.run('DELETE FROM questions WHERE id = ?', [id]);
}

// --- SESSIONS CRUD ---
export async function getSessions(userEmail?: string) {
  let sessions;
  if (userEmail) {
    sessions = await db.all('SELECT * FROM sessions WHERE userEmail = ? ORDER BY startTime DESC', [userEmail]);
  } else {
    sessions = await db.all('SELECT * FROM sessions ORDER BY startTime DESC');
  }
  return sessions.map(s => ({
    ...s,
    shuffleQuestions: !!s.shuffleQuestions,
    shuffleAnswers: !!s.shuffleAnswers,
    isCompleted: !!s.isCompleted
  }));
}

export async function getSessionById(id: number) {
  const s = await db.get('SELECT * FROM sessions WHERE id = ?', [id]);
  if (s) {
    return {
      ...s,
      shuffleQuestions: !!s.shuffleQuestions,
      shuffleAnswers: !!s.shuffleAnswers,
      isCompleted: !!s.isCompleted
    };
  }
  return null;
}

export async function saveSession(session: {
  id?: number;
  quizTargetId: number;
  learningMode: string;
  startTime: string;
  recentLearningDateTime?: string;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  currentIndex: number;
  studyTime: number;
  timeLimit?: number;
  isCompleted: boolean;
  endTime?: string;
  totalCorrect: number;
  totalWrong: number;
  identifyingId?: number | null;
  lockToken?: string | null;
  sessionToken?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  userMssv?: string | null;
}) {
  const sessionToken = session.sessionToken || (session.id ? null : crypto.randomBytes(16).toString('hex'));

  if (session.id) {
    await db.run(
      `UPDATE sessions SET 
        quizTargetId = ?, learningMode = ?, startTime = ?, recentLearningDateTime = ?, 
        shuffleQuestions = ?, shuffleAnswers = ?, currentIndex = ?, studyTime = ?, 
        timeLimit = ?, isCompleted = ?, endTime = ?, totalCorrect = ?, totalWrong = ?,
        identifyingId = ?, lockToken = ?, sessionToken = COALESCE(?, sessionToken),
        userEmail = COALESCE(?, userEmail), userName = COALESCE(?, userName), userMssv = COALESCE(?, userMssv)
       WHERE id = ?`,
      [
        session.quizTargetId, session.learningMode, session.startTime, session.recentLearningDateTime,
        session.shuffleQuestions ? 1 : 0, session.shuffleAnswers ? 1 : 0, session.currentIndex, session.studyTime,
        session.timeLimit ?? null, session.isCompleted ? 1 : 0, session.endTime ?? null, session.totalCorrect, session.totalWrong,
        session.identifyingId ?? null, session.lockToken ?? null, sessionToken,
        session.userEmail ?? null, session.userName ?? null, session.userMssv ?? null,
        session.id
      ]
    );
    return session.id;
  } else {
    const finalToken = sessionToken || crypto.randomBytes(16).toString('hex');
    const result = await db.run(
      `INSERT INTO sessions (
        quizTargetId, learningMode, startTime, recentLearningDateTime, 
        shuffleQuestions, shuffleAnswers, currentIndex, studyTime, 
        timeLimit, isCompleted, endTime, totalCorrect, totalWrong,
        identifyingId, lockToken, sessionToken, userEmail, userName, userMssv
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.quizTargetId, session.learningMode, session.startTime, session.recentLearningDateTime,
        session.shuffleQuestions ? 1 : 0, session.shuffleAnswers ? 1 : 0, session.currentIndex, session.studyTime,
        session.timeLimit ?? null, session.isCompleted ? 1 : 0, session.endTime ?? null, session.totalCorrect, session.totalWrong,
        session.identifyingId ?? null, session.lockToken ?? null, finalToken,
        session.userEmail ?? null, session.userName ?? null, session.userMssv ?? null
      ]
    );
    return result.lastID!;
  }
}

export async function getSessionByIdOrToken(idOrToken: string | number) {
  let s;
  if (typeof idOrToken === 'string' && isNaN(Number(idOrToken))) {
    s = await db.get('SELECT * FROM sessions WHERE sessionToken = ?', [idOrToken]);
  } else {
    s = await db.get('SELECT * FROM sessions WHERE id = ?', [Number(idOrToken)]);
  }
  if (s) {
    let quizName = null;
    let subjectCode = null;
    let subjectName = null;

    if (s.quizTargetId < 0) {
      const subjectId = -s.quizTargetId;
      const subj = await db.get('SELECT code, name FROM subjects WHERE id = ?', [subjectId]);
      if (subj) {
        subjectCode = subj.code;
        subjectName = subj.name;
      }
    } else {
      const qz = await db.get(
        'SELECT q.name AS quizName, subj.code AS subjectCode, subj.name AS subjectName FROM quizzes q JOIN subjects subj ON q.subjectTargetId = subj.id WHERE q.id = ?',
        [s.quizTargetId]
      );
      if (qz) {
        quizName = qz.quizName;
        subjectCode = qz.subjectCode;
        subjectName = qz.subjectName;
      }
    }

    return {
      ...s,
      shuffleQuestions: !!s.shuffleQuestions,
      shuffleAnswers: !!s.shuffleAnswers,
      isCompleted: !!s.isCompleted,
      quizName,
      subjectCode,
      subjectName
    };
  }
  return null;
}

export async function clearSessionHistory() {
  await db.run('DELETE FROM session_details');
  await db.run('DELETE FROM sessions');
}

export async function deleteSession(id: number) {
  await db.run('DELETE FROM sessions WHERE id = ?', [id]);
}

// --- SESSION DETAILS ---
export async function getSessionDetails(sessionId: number) {
  const details = await db.all('SELECT * FROM session_details WHERE learningSessionId = ?', [sessionId]);
  return details.map(d => ({
    ...d,
    isChecked: !!d.isChecked,
    isSeen: !!d.isSeen,
    isCorrect: d.isCorrect === null ? null : !!d.isCorrect,
    selectedAnswersList: JSON.parse(d.selectedAnswersList)
  }));
}

export async function saveSessionDetailsBatch(details: Array<{
  id?: number;
  learningSessionId: number;
  questionTargetId: number;
  isChecked: boolean;
  isSeen: boolean;
  isCorrect?: boolean | null;
  selectedAnswersList: number[];
}>) {
  if (details.length === 0) return;
  const sessionId = details[0].learningSessionId;

  // Wrap inside a single SQLite transaction to speed up bulk inserts and prevent database locking issues
  await db.run('BEGIN TRANSACTION');
  try {
    // 1. Delete all existing details for this session to ensure order and avoid duplicates
    await db.run('DELETE FROM session_details WHERE learningSessionId = ?', [sessionId]);

    // 2. Insert all details as new rows
    for (const d of details) {
      const isCorrectVal = d.isCorrect === null || d.isCorrect === undefined ? null : (d.isCorrect ? 1 : 0);
      await db.run(
        `INSERT INTO session_details (
          learningSessionId, questionTargetId, isChecked, isSeen, isCorrect, selectedAnswersList
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          d.learningSessionId, d.questionTargetId, d.isChecked ? 1 : 0, d.isSeen ? 1 : 0,
          isCorrectVal, JSON.stringify(d.selectedAnswersList)
        ]
      );
    }
    await db.run('COMMIT');
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }
}

// --- CONFIG CRUD ---
export async function getConfig() {
  const cfg = await db.get('SELECT * FROM config WHERE id = 1');
  if (cfg) {
    return {
      ...cfg,
      enableQuickAnswer: !!cfg.enableQuickAnswer,
      isMouseEnabled: !!cfg.isMouseEnabled,
      keyBindings: JSON.parse(cfg.keyBindings)
    };
  }
  return null;
}

export async function saveConfig(cfg: {
  fontFamily: string;
  fontSize: number;
  enableQuickAnswer: boolean;
  isMouseEnabled: boolean;
  keyBindings: Record<string, string[]>;
}) {
  await db.run(
    `UPDATE config SET 
      fontFamily = ?, fontSize = ?, enableQuickAnswer = ?, isMouseEnabled = ?, keyBindings = ?
     WHERE id = 1`,
    [
      cfg.fontFamily, cfg.fontSize, cfg.enableQuickAnswer ? 1 : 0, cfg.isMouseEnabled ? 1 : 0,
      JSON.stringify(cfg.keyBindings)
    ]
  );
}

export async function wipeDatabase() {
  await db.run('DELETE FROM session_details');
  await db.run('DELETE FROM sessions');
  await db.run('DELETE FROM answers');
  await db.run('DELETE FROM questions');
  await db.run('DELETE FROM quizzes');
  await db.run('DELETE FROM subjects');
}

// --- USERS CRUD ---
export async function getUsers() {
  return db.all('SELECT * FROM users ORDER BY created_at DESC');
}

export async function getUserByEmail(email: string) {
  return db.get('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
}

export async function createUser(user: { email: string; name: string; mssv: string }) {
  const result = await db.run(
    'INSERT INTO users (email, name, mssv, is_active, created_at) VALUES (?, ?, ?, 1, ?)',
    [user.email.toLowerCase().trim(), user.name, user.mssv, new Date().toISOString()]
  );
  return result.lastID!;
}

export async function deleteUser(id: number) {
  await db.run('DELETE FROM users WHERE id = ?', [id]);
}

export async function updateUser(id: number, user: { email: string; name: string; mssv: string }) {
  await db.run(
    'UPDATE users SET email = ?, name = ?, mssv = ? WHERE id = ?',
    [user.email.toLowerCase().trim(), user.name, user.mssv, id]
  );
}
