import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../quiz.db');
const userDbPath = process.env.USER_DB_PATH || path.resolve(path.dirname(dbPath), 'user_data.db');
const examDbPath = process.env.EXAM_DB_PATH || path.resolve(path.dirname(dbPath), 'exam_data.db');
export let quizDb;
export let userDb;
export let examDb;
export async function initDb() {
    // Connect to Static Quiz Database
    quizDb = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });
    await quizDb.run('PRAGMA foreign_keys = ON');
    // Connect to User Progress Database
    userDb = await open({
        filename: userDbPath,
        driver: sqlite3.Database
    });
    await userDb.run('PRAGMA foreign_keys = ON');
    // Connect to Exam Configuration Database
    examDb = await open({
        filename: examDbPath,
        driver: sqlite3.Database
    });
    await examDb.run('PRAGMA foreign_keys = ON');
    // Create exams table in examDb
    await examDb.exec(`
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examCode TEXT NOT NULL UNIQUE,
      quizTargetId INTEGER NOT NULL,
      useSeb INTEGER NOT NULL DEFAULT 0,
      durationTime INTEGER NOT NULL DEFAULT 60,
      attemptsAllowed INTEGER NOT NULL DEFAULT 1,
      timeOpen TEXT NOT NULL,
      timeEnd TEXT NOT NULL,
      openCode TEXT NOT NULL,
      allowedUsers TEXT NOT NULL,
      showScore INTEGER NOT NULL DEFAULT 1,
      allowReview INTEGER NOT NULL DEFAULT 1
    );
  `);
    // Create static tables in quizDb
    await quizDb.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      semester INTEGER DEFAULT NULL
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

    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY,
      fontFamily TEXT NOT NULL,
      fontSize INTEGER NOT NULL,
      enableQuickAnswer INTEGER NOT NULL,
      isMouseEnabled INTEGER NOT NULL,
      keyBindings TEXT NOT NULL, -- JSON string
      examOpenCode TEXT DEFAULT '123'
    );
  `);
    try {
        await quizDb.run("ALTER TABLE config ADD COLUMN aiEndpoint TEXT DEFAULT 'http://10.9.0.3:8091'");
    }
    catch (e) { }
    try {
        await quizDb.run("ALTER TABLE config ADD COLUMN aiApiKey TEXT DEFAULT ''");
    }
    catch (e) { }
    try {
        await quizDb.run("ALTER TABLE config ADD COLUMN aiModel TEXT DEFAULT 'gemini/gemini-1.5-flash'");
    }
    catch (e) { }
    try {
        await quizDb.run("ALTER TABLE subjects ADD COLUMN semester INTEGER DEFAULT NULL");
    }
    catch (e) { }
    // Create dynamic tables in userDb
    await userDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      mssv TEXT NOT NULL DEFAULT '',
      class TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
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
      sessionToken TEXT,
      userEmail TEXT,
      userName TEXT,
      userMssv TEXT,
      openCode TEXT,
      examStarted INTEGER DEFAULT 0,
      isScheduledExam INTEGER DEFAULT 0
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
  `);
    try {
        await userDb.run("ALTER TABLE users ADD COLUMN class TEXT DEFAULT ''");
    }
    catch (e) { }
    try {
        await userDb.run("ALTER TABLE sessions ADD COLUMN isScheduledExam INTEGER DEFAULT 0");
    }
    catch (e) { }
    // Insert default config if empty in config table
    const configExists = await quizDb.get('SELECT 1 FROM config WHERE id = 1');
    if (!configExists) {
        const defaultKeyBindings = {
            nextQuestion: ["Space", "ArrowRight"],
            previousQuestion: ["ArrowLeft"],
            toggleQuestion: ["KeyH", "h", "H"],
            checkQuestion: ["Enter"]
        };
        await quizDb.run(`
      INSERT INTO config (id, fontFamily, fontSize, enableQuickAnswer, isMouseEnabled, keyBindings, examOpenCode)
      VALUES (1, 'Microsoft Sans Serif', 14, 0, 1, ?, '123')
    `, JSON.stringify(defaultKeyBindings));
    }
    // Migrations: add new columns if they don't exist yet (questions table on quizDb)
    const pragmaInfo = await quizDb.all('PRAGMA table_info(questions)');
    const columnNames = pragmaInfo.map((c) => c.name);
    if (!columnNames.includes('imageUrl')) {
        await quizDb.run('ALTER TABLE questions ADD COLUMN imageUrl TEXT');
    }
    if (!columnNames.includes('explanationImage')) {
        await quizDb.run('ALTER TABLE questions ADD COLUMN explanationImage TEXT');
    }
    // Auto Migration logic: Move old user tables from quizDb to userDb if detected
    const hasUsersTable = await quizDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    const hasSessionsTable = await quizDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'");
    const hasDetailsTable = await quizDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='session_details'");
    if (hasUsersTable || hasSessionsTable || hasDetailsTable) {
        console.log('Detected user data in quizDb. Starting migration to userDb...');
        // A. Migrate users
        if (hasUsersTable) {
            const users = await quizDb.all('SELECT * FROM users');
            console.log(`Migrating ${users.length} users...`);
            for (const u of users) {
                await userDb.run('INSERT OR IGNORE INTO users (id, email, name, mssv, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)', [u.id, u.email, u.name, u.mssv, u.is_active, u.created_at]);
            }
        }
        // B. Migrate sessions (ensure sessions table in quizDb is fully migrated first)
        if (hasSessionsTable) {
            const sessionPragma = await quizDb.all('PRAGMA table_info(sessions)');
            const sessionCols = sessionPragma.map((c) => c.name);
            if (!sessionCols.includes('identifyingId'))
                await quizDb.run('ALTER TABLE sessions ADD COLUMN identifyingId INTEGER');
            if (!sessionCols.includes('lockToken'))
                await quizDb.run('ALTER TABLE sessions ADD COLUMN lockToken TEXT');
            if (!sessionCols.includes('sessionToken'))
                await quizDb.run('ALTER TABLE sessions ADD COLUMN sessionToken TEXT');
            if (!sessionCols.includes('userEmail'))
                await quizDb.run('ALTER TABLE sessions ADD COLUMN userEmail TEXT');
            if (!sessionCols.includes('userName'))
                await quizDb.run('ALTER TABLE sessions ADD COLUMN userName TEXT');
            if (!sessionCols.includes('userMssv'))
                await quizDb.run('ALTER TABLE sessions ADD COLUMN userMssv TEXT');
            const sessions = await quizDb.all('SELECT * FROM sessions');
            console.log(`Migrating ${sessions.length} sessions...`);
            for (const s of sessions) {
                let token = s.sessionToken;
                if (!token) {
                    token = crypto.randomBytes(16).toString('hex');
                }
                await userDb.run(`INSERT OR IGNORE INTO sessions (
            id, quizTargetId, learningMode, startTime, recentLearningDateTime,
            shuffleQuestions, shuffleAnswers, currentIndex, studyTime,
            timeLimit, isCompleted, endTime, totalCorrect, totalWrong,
            identifyingId, lockToken, sessionToken, userEmail, userName, userMssv
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    s.id, s.quizTargetId, s.learningMode, s.startTime, s.recentLearningDateTime,
                    s.shuffleQuestions, s.shuffleAnswers, s.currentIndex, s.studyTime,
                    s.timeLimit, s.isCompleted, s.endTime, s.totalCorrect, s.totalWrong,
                    s.identifyingId, s.lockToken, token, s.userEmail, s.userName, s.userMssv
                ]);
            }
        }
        // C. Migrate session_details
        if (hasDetailsTable) {
            const details = await quizDb.all('SELECT * FROM session_details');
            console.log(`Migrating ${details.length} session details...`);
            for (const d of details) {
                await userDb.run(`INSERT OR IGNORE INTO session_details (
            id, learningSessionId, questionTargetId, isChecked, isSeen, isCorrect, selectedAnswersList
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                    d.id, d.learningSessionId, d.questionTargetId, d.isChecked, d.isSeen,
                    d.isCorrect, d.selectedAnswersList
                ]);
            }
        }
        // D. Drop old tables from quizDb
        await quizDb.exec(`
      DROP TABLE IF EXISTS session_details;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS users;
    `);
        console.log('Migration complete. Old user tables dropped from quizDb.');
    }
    // Dynamic Column migrations for updates
    const sessionPragma = await userDb.all('PRAGMA table_info(sessions)');
    const sessionCols = sessionPragma.map((c) => c.name);
    if (!sessionCols.includes('openCode')) {
        await userDb.run('ALTER TABLE sessions ADD COLUMN openCode TEXT');
    }
    if (!sessionCols.includes('examStarted')) {
        await userDb.run('ALTER TABLE sessions ADD COLUMN examStarted INTEGER DEFAULT 0');
    }
    const configPragma = await quizDb.all('PRAGMA table_info(config)');
    const configCols = configPragma.map((c) => c.name);
    if (!configCols.includes('examOpenCode')) {
        await quizDb.run("ALTER TABLE config ADD COLUMN examOpenCode TEXT DEFAULT '123'");
    }
    // Quizzes table migration: add isExamOnly if not exists
    const quizzesPragma = await quizDb.all('PRAGMA table_info(quizzes)');
    const quizzesCols = quizzesPragma.map((c) => c.name);
    if (!quizzesCols.includes('isExamOnly')) {
        await quizDb.run('ALTER TABLE quizzes ADD COLUMN isExamOnly INTEGER DEFAULT 0');
    }
    // Create indexes to optimize queries
    await userDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userEmail);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(sessionToken);
    CREATE INDEX IF NOT EXISTS idx_session_details_session ON session_details(learningSessionId);
  `);
    await quizDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(questionTargetId);
    CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quizTargetId);
  `);
    console.log('SQLite Databases initialized successfully.');
    console.log('  - Static quiz database at:', dbPath);
    console.log('  - User progress database at:', userDbPath);
    console.log('  - Exam configuration database at:', examDbPath);
}
// --- SUBJECTS CRUD ---
export async function getSubjects() {
    return quizDb.all('SELECT * FROM subjects');
}
export async function saveSubject(subject) {
    if (subject.id) {
        await quizDb.run('UPDATE subjects SET code = ?, name = ?, semester = ? WHERE id = ?', [subject.code, subject.name, subject.semester ?? null, subject.id]);
        return subject.id;
    }
    else {
        const result = await quizDb.run('INSERT INTO subjects (code, name, semester) VALUES (?, ?, ?)', [subject.code, subject.name, subject.semester ?? null]);
        return result.lastID;
    }
}
export async function deleteSubject(id) {
    await quizDb.run('DELETE FROM subjects WHERE id = ?', [id]);
}
// --- QUIZZES CRUD ---
export async function getQuizzesBySubject(subjectId) {
    return quizDb.all('SELECT * FROM quizzes WHERE subjectTargetId = ?', [subjectId]);
}
export async function getQuizById(id) {
    return quizDb.get('SELECT * FROM quizzes WHERE id = ?', [id]);
}
export async function getQuizWithSubjectInfo(id) {
    return quizDb.get(`
    SELECT q.*, s.code as subjectCode, s.name as subjectName
    FROM quizzes q
    JOIN subjects s ON q.subjectTargetId = s.id
    WHERE q.id = ?
  `, [id]);
}
export async function saveQuiz(quiz) {
    if (quiz.id) {
        await quizDb.run('UPDATE quizzes SET name = ?, subjectTargetId = ?, isExamOnly = ? WHERE id = ?', [quiz.name, quiz.subjectTargetId, quiz.isExamOnly ?? 0, quiz.id]);
        return quiz.id;
    }
    else {
        const isExamOnlyVal = quiz.isExamOnly ?? 0;
        const result = await quizDb.run('INSERT INTO quizzes (name, subjectTargetId, isExamOnly) VALUES (?, ?, ?)', [quiz.name, quiz.subjectTargetId, isExamOnlyVal]);
        return result.lastID;
    }
}
export async function deleteQuiz(id) {
    await quizDb.run('DELETE FROM quizzes WHERE id = ?', [id]);
}
// --- QUESTIONS & ANSWERS CRUD ---
export async function getQuestionsByQuiz(quizId) {
    const questions = await quizDb.all('SELECT * FROM questions WHERE quizTargetId = ?', [quizId]);
    for (const q of questions) {
        const answers = await quizDb.all('SELECT * FROM answers WHERE questionTargetId = ? ORDER BY indexOrder ASC', [q.id]);
        q.answersList = answers.map(a => ({ ...a, isCorrect: !!a.isCorrect }));
    }
    return questions;
}
export async function getQuestionById(id) {
    const q = await quizDb.get('SELECT * FROM questions WHERE id = ?', [id]);
    if (q) {
        const answers = await quizDb.all('SELECT * FROM answers WHERE questionTargetId = ? ORDER BY indexOrder ASC', [q.id]);
        q.answersList = answers.map(a => ({ ...a, isCorrect: !!a.isCorrect }));
    }
    return q;
}
export async function saveQuestion(question) {
    let qId = question.id;
    if (qId) {
        await quizDb.run('UPDATE questions SET content = ?, explanation = ?, quizTargetId = ?, imageUrl = ?, explanationImage = ? WHERE id = ?', [question.content, question.explanation, question.quizTargetId, question.imageUrl ?? null, question.explanationImage ?? null, qId]);
    }
    else {
        const result = await quizDb.run('INSERT INTO questions (content, explanation, quizTargetId, imageUrl, explanationImage) VALUES (?, ?, ?, ?, ?)', [question.content, question.explanation, question.quizTargetId, question.imageUrl ?? null, question.explanationImage ?? null]);
        qId = result.lastID;
    }
    // Save answers if provided
    if (question.answersList) {
        // Clear existing answers first
        await quizDb.run('DELETE FROM answers WHERE questionTargetId = ?', [qId]);
        for (const ans of question.answersList) {
            await quizDb.run('INSERT INTO answers (content, isCorrect, indexOrder, questionTargetId) VALUES (?, ?, ?, ?)', [ans.content, ans.isCorrect ? 1 : 0, ans.indexOrder, qId]);
        }
    }
    return qId;
}
export async function deleteQuestion(id) {
    await quizDb.run('DELETE FROM questions WHERE id = ?', [id]);
}
// --- SESSIONS CRUD ---
export async function getSessions(userEmail) {
    let sessions;
    if (userEmail) {
        sessions = await userDb.all('SELECT * FROM sessions WHERE userEmail = ? ORDER BY startTime DESC', [userEmail]);
    }
    else {
        sessions = await userDb.all('SELECT * FROM sessions ORDER BY startTime DESC');
    }
    return sessions.map(s => ({
        ...s,
        shuffleQuestions: !!s.shuffleQuestions,
        shuffleAnswers: !!s.shuffleAnswers,
        isCompleted: !!s.isCompleted,
        examStarted: !!s.examStarted
    }));
}
export async function getSessionById(id) {
    const s = await userDb.get('SELECT * FROM sessions WHERE id = ?', [id]);
    if (s) {
        return {
            ...s,
            shuffleQuestions: !!s.shuffleQuestions,
            shuffleAnswers: !!s.shuffleAnswers,
            isCompleted: !!s.isCompleted,
            examStarted: !!s.examStarted
        };
    }
    return null;
}
export async function saveSession(session) {
    const sessionToken = session.sessionToken || (session.id ? null : crypto.randomBytes(16).toString('hex'));
    if (session.id) {
        await userDb.run(`UPDATE sessions SET 
        quizTargetId = ?, learningMode = ?, startTime = ?, recentLearningDateTime = ?, 
        shuffleQuestions = ?, shuffleAnswers = ?, currentIndex = ?, studyTime = ?, 
        timeLimit = ?, isCompleted = ?, endTime = ?, totalCorrect = ?, totalWrong = ?,
        identifyingId = ?, lockToken = ?, sessionToken = COALESCE(?, sessionToken),
        userEmail = COALESCE(?, userEmail), userName = COALESCE(?, userName), userMssv = COALESCE(?, userMssv),
        openCode = ?, examStarted = ?, isScheduledExam = ?
       WHERE id = ?`, [
            session.quizTargetId, session.learningMode, session.startTime, session.recentLearningDateTime,
            session.shuffleQuestions ? 1 : 0, session.shuffleAnswers ? 1 : 0, session.currentIndex, session.studyTime,
            session.timeLimit ?? null, session.isCompleted ? 1 : 0, session.endTime ?? null, session.totalCorrect, session.totalWrong,
            session.identifyingId ?? null, session.lockToken ?? null, sessionToken,
            session.userEmail ?? null, session.userName ?? null, session.userMssv ?? null,
            session.openCode ?? null, session.examStarted ? 1 : 0, session.isScheduledExam ?? 0,
            session.id
        ]);
        return session.id;
    }
    else {
        const finalToken = sessionToken || crypto.randomBytes(16).toString('hex');
        const result = await userDb.run(`INSERT INTO sessions (
        quizTargetId, learningMode, startTime, recentLearningDateTime, 
        shuffleQuestions, shuffleAnswers, currentIndex, studyTime, 
        timeLimit, isCompleted, endTime, totalCorrect, totalWrong,
        identifyingId, lockToken, sessionToken, userEmail, userName, userMssv, openCode, examStarted, isScheduledExam
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            session.quizTargetId, session.learningMode, session.startTime, session.recentLearningDateTime,
            session.shuffleQuestions ? 1 : 0, session.shuffleAnswers ? 1 : 0, session.currentIndex, session.studyTime,
            session.timeLimit ?? null, session.isCompleted ? 1 : 0, session.endTime ?? null, session.totalCorrect, session.totalWrong,
            session.identifyingId ?? null, session.lockToken ?? null, finalToken,
            session.userEmail ?? null, session.userName ?? null, session.userMssv ?? null,
            session.openCode ?? null, session.examStarted ? 1 : 0, session.isScheduledExam ?? 0
        ]);
        return result.lastID;
    }
}
export async function getSessionByIdOrToken(idOrToken) {
    let s;
    if (typeof idOrToken === 'string' && isNaN(Number(idOrToken))) {
        s = await userDb.get('SELECT * FROM sessions WHERE sessionToken = ?', [idOrToken]);
    }
    else {
        s = await userDb.get('SELECT * FROM sessions WHERE id = ?', [Number(idOrToken)]);
    }
    if (s) {
        let quizName = null;
        let subjectCode = null;
        let subjectName = null;
        if (s.quizTargetId < 0) {
            const subjectId = -s.quizTargetId;
            const subj = await quizDb.get('SELECT code, name FROM subjects WHERE id = ?', [subjectId]);
            if (subj) {
                subjectCode = subj.code;
                subjectName = subj.name;
            }
        }
        else {
            const qz = await quizDb.get('SELECT q.name AS quizName, subj.code AS subjectCode, subj.name AS subjectName FROM quizzes q JOIN subjects subj ON q.subjectTargetId = subj.id WHERE q.id = ?', [s.quizTargetId]);
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
            examStarted: !!s.examStarted,
            quizName,
            subjectCode,
            subjectName
        };
    }
    return null;
}
export async function clearSessionHistory() {
    await userDb.run('DELETE FROM session_details');
    await userDb.run('DELETE FROM sessions');
}
export async function deleteSession(id) {
    await userDb.run('DELETE FROM sessions WHERE id = ?', [id]);
}
// --- SESSION DETAILS ---
export async function getSessionDetails(sessionId) {
    const details = await userDb.all('SELECT * FROM session_details WHERE learningSessionId = ?', [sessionId]);
    return details.map(d => ({
        ...d,
        isChecked: !!d.isChecked,
        isSeen: !!d.isSeen,
        isCorrect: d.isCorrect === null ? null : !!d.isCorrect,
        selectedAnswersList: JSON.parse(d.selectedAnswersList)
    }));
}
export async function saveSessionDetailsBatch(details) {
    if (details.length === 0)
        return;
    const sessionId = details[0].learningSessionId;
    // Wrap inside a single SQLite transaction to speed up bulk inserts and prevent database locking issues
    await userDb.run('BEGIN TRANSACTION');
    try {
        // 1. Delete all existing details for this session to ensure order and avoid duplicates
        await userDb.run('DELETE FROM session_details WHERE learningSessionId = ?', [sessionId]);
        // 2. Insert all details as new rows
        for (const d of details) {
            const isCorrectVal = d.isCorrect === null || d.isCorrect === undefined ? null : (d.isCorrect ? 1 : 0);
            await userDb.run(`INSERT INTO session_details (
          learningSessionId, questionTargetId, isChecked, isSeen, isCorrect, selectedAnswersList
         ) VALUES (?, ?, ?, ?, ?, ?)`, [
                d.learningSessionId, d.questionTargetId, d.isChecked ? 1 : 0, d.isSeen ? 1 : 0,
                isCorrectVal, JSON.stringify(d.selectedAnswersList)
            ]);
        }
        await userDb.run('COMMIT');
    }
    catch (err) {
        await userDb.run('ROLLBACK');
        throw err;
    }
}
// --- CONFIG CRUD ---
export async function getConfig() {
    const cfg = await quizDb.get('SELECT * FROM config WHERE id = 1');
    if (cfg) {
        return {
            ...cfg,
            enableQuickAnswer: !!cfg.enableQuickAnswer,
            isMouseEnabled: !!cfg.isMouseEnabled,
            keyBindings: JSON.parse(cfg.keyBindings),
            examOpenCode: cfg.examOpenCode || '123',
            aiEndpoint: cfg.aiEndpoint || 'http://10.9.0.3:8091',
            aiApiKey: cfg.aiApiKey || '',
            aiModel: cfg.aiModel || 'gemini/gemini-1.5-flash'
        };
    }
    return null;
}
export async function saveConfig(cfg) {
    await quizDb.run(`UPDATE config SET 
      fontFamily = ?, fontSize = ?, enableQuickAnswer = ?, isMouseEnabled = ?, keyBindings = ?, examOpenCode = ?,
      aiEndpoint = ?, aiApiKey = ?, aiModel = ?
     WHERE id = 1`, [
        cfg.fontFamily, cfg.fontSize, cfg.enableQuickAnswer ? 1 : 0, cfg.isMouseEnabled ? 1 : 0,
        JSON.stringify(cfg.keyBindings), cfg.examOpenCode || '123',
        cfg.aiEndpoint || 'http://10.9.0.3:8091', cfg.aiApiKey || '', cfg.aiModel || 'gemini/gemini-1.5-flash'
    ]);
}
export async function getQuizByName(name) {
    return quizDb.get('SELECT * FROM quizzes WHERE LOWER(name) = LOWER(?)', [name]);
}
export async function wipeDatabase() {
    await userDb.run('DELETE FROM session_details');
    await userDb.run('DELETE FROM sessions');
    await quizDb.run('DELETE FROM answers');
    await quizDb.run('DELETE FROM questions');
    await quizDb.run('DELETE FROM quizzes');
    await quizDb.run('DELETE FROM subjects');
    if (examDb) {
        await examDb.run('DELETE FROM exams');
    }
}
// --- USERS CRUD ---
export async function getUsers() {
    return userDb.all('SELECT * FROM users ORDER BY created_at DESC');
}
export async function getUserByEmail(email) {
    return userDb.get('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
}
export async function getUserByEmailOrMssv(username) {
    const clean = username.toLowerCase().trim();
    return userDb.get('SELECT * FROM users WHERE (LOWER(email) = ? OR LOWER(mssv) = ?) AND is_active = 1', [clean, clean]);
}
export async function createUser(user) {
    const result = await userDb.run('INSERT INTO users (email, name, mssv, class, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)', [user.email.toLowerCase().trim(), user.name, user.mssv, user.class || '', new Date().toISOString()]);
    return result.lastID;
}
export async function deleteUser(id) {
    await userDb.run('DELETE FROM users WHERE id = ?', [id]);
}
export async function updateUser(id, user) {
    await userDb.run('UPDATE users SET email = ?, name = ?, mssv = ?, class = ? WHERE id = ?', [user.email.toLowerCase().trim(), user.name, user.mssv, user.class || '', id]);
}
export async function bulkDeleteUsers(ids) {
    const placeholders = ids.map(() => '?').join(',');
    await userDb.run(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
}
export async function bulkUpdateUsersClass(ids, userClass) {
    const placeholders = ids.map(() => '?').join(',');
    await userDb.run(`UPDATE users SET class = ? WHERE id IN (${placeholders})`, [userClass, ...ids]);
}
// --- EXAMS CRUD ---
export async function getExams() {
    return examDb.all('SELECT * FROM exams ORDER BY id DESC');
}
export async function getExamById(id) {
    return examDb.get('SELECT * FROM exams WHERE id = ?', [id]);
}
export async function getExamByCode(code) {
    return examDb.get('SELECT * FROM exams WHERE LOWER(examCode) = LOWER(?)', [code.trim()]);
}
export async function saveExam(exam) {
    const code = exam.examCode.trim();
    let openCode = exam.openCode;
    if (exam.id) {
        const existing = await examDb.get('SELECT openCode FROM exams WHERE id = ?', [exam.id]);
        if (!openCode || openCode.trim() === '') {
            openCode = existing ? existing.openCode : String(Math.floor(100 + Math.random() * 900));
        }
    }
    else {
        if (!openCode || openCode.trim() === '') {
            openCode = String(Math.floor(100 + Math.random() * 900));
        }
    }
    if (exam.id) {
        await examDb.run(`UPDATE exams SET 
        examCode = ?, quizTargetId = ?, useSeb = ?, durationTime = ?, attemptsAllowed = ?, 
        timeOpen = ?, timeEnd = ?, openCode = ?, allowedUsers = ?, showScore = ?, allowReview = ?
       WHERE id = ?`, [
            code, exam.quizTargetId, exam.useSeb, exam.durationTime, exam.attemptsAllowed,
            exam.timeOpen, exam.timeEnd, openCode, exam.allowedUsers, exam.showScore, exam.allowReview,
            exam.id
        ]);
        return exam.id;
    }
    else {
        const result = await examDb.run(`INSERT INTO exams (
        examCode, quizTargetId, useSeb, durationTime, attemptsAllowed, 
        timeOpen, timeEnd, openCode, allowedUsers, showScore, allowReview
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            code, exam.quizTargetId, exam.useSeb, exam.durationTime, exam.attemptsAllowed,
            exam.timeOpen, exam.timeEnd, openCode, exam.allowedUsers, exam.showScore, exam.allowReview
        ]);
        return result.lastID;
    }
}
export async function deleteExam(id) {
    await examDb.run('DELETE FROM exams WHERE id = ?', [id]);
}
