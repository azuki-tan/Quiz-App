import 'dotenv/config';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import * as db from './db.js';
import authRouter, { requireAuth, requireAdmin, getAuthenticatedUser } from './auth.js';
import { verifySafeExamBrowser, checkSebCryptographicHash } from './middleware/seb.js';

function getClientIp(req: express.Request): string {
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return String(cfConnectingIp).trim();
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = String(forwarded).split(',');
    return list[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return String(realIp).trim();
  }
  return req.socket.remoteAddress || '';
}

function normalizeIp(ip: string): string {
  let cleaned = ip.trim();
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.substring(7);
  }
  if (cleaned === '::1') {
    cleaned = '127.0.0.1';
  }
  return cleaned;
}

function isIpMatch(ip1: string, ip2: string): boolean {
  const norm1 = normalizeIp(ip1);
  const norm2 = normalizeIp(ip2);
  if (norm1 === norm2) return true;

  // IPv4 /24 subnet comparison (same first 3 octets)
  // This allows users on multi-WAN networks to resume exams even if NAT IP changes slightly.
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match1 = norm1.match(ipv4Regex);
  const match2 = norm2.match(ipv4Regex);
  if (match1 && match2) {
    return match1[1] === match2[1] && match1[2] === match2[2] && match1[3] === match2[3];
  }

  // IPv6 /64 prefix comparison (same first 4 groups)
  const parts1 = norm1.split(':');
  const parts2 = norm2.split(':');
  if (parts1.length >= 4 && parts2.length >= 4) {
    return parts1[0] === parts2[0] &&
           parts1[1] === parts2[1] &&
           parts1[2] === parts2[2] &&
           parts1[3] === parts2[3];
  }

  return false;
}

const app = express();
const PORT = process.env.PORT || 3000;
const LITELLM_API_URL = process.env.LITELLM_API_URL || 'http://10.9.0.3:8091';

// Enable CORS for all requests (especially from http://localhost:5173 or 5174)
app.use(cors({
  origin: true,
  credentials: true,
}));

// Parse JSON bodies with a limit of 15MB for large JSON imports
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// Initialize DB and start server
async function startServer() {
  try {
    await db.initDb();

    // ─── AUTH ROUTES (no auth needed) ────────────────────────────────────────
    app.use('/api/auth', authRouter);

    // ─── EXAMS MANAGEMENT (admin only) ───────────────────────────────────────
    app.get('/api/exams', requireAuth, requireAdmin, async (req, res) => {
      try {
        const exams = await db.getExams();
        const now = new Date();
        const processed = exams.map(e => {
          const openTime = new Date(e.timeOpen);
          const endTime = new Date(e.timeEnd);
          if (now < openTime || now > endTime) {
            return { ...e, openCode: '' };
          }
          return e;
        });
        res.json(processed);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/exams', requireAuth, requireAdmin, async (req, res) => {
      try {
        const id = await db.saveExam(req.body);
        res.json({ id });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete('/api/exams/:id', requireAuth, requireAdmin, async (req, res) => {
      try {
        await db.deleteExam(Number(req.params.id));
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── EXAMS RESULTS LOOKUP (no auth needed) ──────────────────────────────
    app.post('/api/exams/lookup', async (req, res) => {
      try {
        const { examCode, userName } = req.body;
        if (!examCode || !userName) {
          return res.status(400).json({ error: 'Vui lòng điền đầy đủ Exam Code và User Name.' });
        }

        const trimmedExamCode = String(examCode).trim();
        const trimmedUserName = String(userName).trim();

        // 1. Find the scheduled exam
        const exam = await db.getExamByCode(trimmedExamCode);
        if (!exam) {
          return res.status(404).json({ error: 'Không tìm thấy thông tin kỳ thi với mã này.' });
        }

        // 2. Check if showScore is disabled
        if (exam.showScore === 0) {
          return res.status(403).json({ error: 'Khảo thí không công bố điểm thi cho đợt thi này.' });
        }

        // 3. Find registered user
        const registeredUser = await db.getUserByEmailOrMssv(trimmedUserName);
        if (!registeredUser) {
          return res.status(404).json({ error: 'Thí sinh (User Name) không có tên trong danh sách thi.' });
        }

        // Check if allowed
        let allowed = [];
        try {
          allowed = JSON.parse(exam.allowedUsers) || [];
        } catch (e) {
          console.error(e);
        }
        const userEmailLower = registeredUser.email.toLowerCase().trim();
        const userMssvLower = registeredUser.mssv.toLowerCase().trim();
        const isAllowed = allowed.some((u: string) => {
          const clean = u.toLowerCase().trim();
          return clean === userEmailLower || clean === userMssvLower;
        });

        if (!isAllowed) {
          return res.status(403).json({ error: 'Bạn không thuộc danh sách dự thi của kỳ thi này.' });
        }

        // 4. Retrieve all completed sessions for this user on this quizTargetId in exam mode
        const allSessions = await db.getSessions();
        const candidateSessions = allSessions.filter(s => 
          s.quizTargetId === exam.quizTargetId && 
          s.learningMode === 'exam' &&
          s.isCompleted &&
          (s.userEmail === registeredUser.email || s.userMssv === registeredUser.mssv)
        );

        // Map session data to return
        const mappedSessions = candidateSessions.map(s => {
          const totalQ = s.totalCorrect + s.totalWrong;
          const score = totalQ > 0 ? (s.totalCorrect * 10 / totalQ).toFixed(2) : '0.00';
          return {
            id: s.id,
            sessionToken: s.sessionToken,
            startTime: s.startTime,
            endTime: s.endTime,
            studyTime: s.studyTime,
            totalCorrect: s.totalCorrect,
            totalWrong: s.totalWrong,
            score: s.totalCorrect !== null ? score : null,
            allowReview: exam.allowReview === 1
          };
        });

        res.json({
          exam: {
            id: exam.id,
            examCode: exam.examCode,
            durationTime: exam.durationTime,
            allowReview: exam.allowReview === 1,
            showScore: exam.showScore === 1,
            quizTargetId: exam.quizTargetId
          },
          user: {
            name: registeredUser.name,
            email: registeredUser.email,
            mssv: registeredUser.mssv
          },
          sessions: mappedSessions
        });
      } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Lỗi hệ thống tra cứu.' });
      }
    });

    // ─── EXAMS AUTH LOGIN (no auth needed) ───────────────────────────────────
    app.post('/api/auth/exam-login', async (req, res) => {
      try {
        const { examCode, userName } = req.body;
        if (!examCode || !userName) {
          return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin Exam Code và User Name.' });
        }

        const trimmedExamCode = String(examCode).trim();
        const trimmedUserName = String(userName).trim();

        // 1. Find the scheduled exam by examCode
        const exam = await db.getExamByCode(trimmedExamCode);
        if (!exam) {
          return res.status(404).json({ error: 'Exam Code not Available' });
        }

        // 2. Validate current time vs timeOpen & timeEnd
        const now = new Date();
        const openTime = new Date(exam.timeOpen);
        const endTime = new Date(exam.timeEnd);

        if (now < openTime) {
          return res.status(403).json({ error: 'Exam Code not Available' });
        }
        if (now > endTime) {
          return res.status(403).json({ error: 'Exam Code not Available' });
        }

        // 3. Find candidate user profile in registered users db
        const registeredUser = await db.getUserByEmailOrMssv(trimmedUserName);
        if (!registeredUser) {
          return res.status(403).json({ error: 'Thí sinh (User Name) không có tên trong danh sách đăng ký thi.' });
        }

        // 4. Validate allowed candidates list
        let allowed = [];
        try {
          allowed = JSON.parse(exam.allowedUsers) || [];
        } catch (e) {
          console.error('Failed to parse allowedUsers JSON:', e);
        }

        const userEmailLower = registeredUser.email.toLowerCase().trim();
        const userMssvLower = registeredUser.mssv.toLowerCase().trim();
        const isAllowed = allowed.some((u: string) => {
          const clean = u.toLowerCase().trim();
          return clean === userEmailLower || clean === userMssvLower;
        });

        if (!isAllowed) {
          return res.status(403).json({ error: 'Thí sinh không được cấp quyền tham gia kỳ thi này.' });
        }

        // 5. Check attempts limits and active sessions
        const sessions = await db.getSessions();
        const examSessions = sessions.filter(s => 
          s.quizTargetId === exam.quizTargetId && 
          (s.userMssv === registeredUser.mssv || s.userEmail === registeredUser.email) && 
          s.learningMode === 'exam'
        );

        let activeSession = examSessions.find(s => !s.isCompleted);

        // SEB Verification check helper
        const isSebOk = () => {
          if (exam.useSeb === 1) {
            return checkSebCryptographicHash(req);
          }
          return true; // bypassed if useSeb is 0
        };

        if (activeSession) {
          if (!isSebOk()) {
            return res.status(403).json({ error: 'Bạn bắt buộc phải sử dụng Safe Exam Browser để truy cập bài thi này.' });
          }
          // Resume existing active session
          return res.json({ success: true, sessionToken: activeSession.sessionToken });
        }

        // Check attempt limit
        if (examSessions.length >= exam.attemptsAllowed) {
          return res.status(403).json({ error: 'Bạn đã hết lượt tham gia kỳ thi này.' });
        }

        // If starting a new session, check SEB header requirements
        if (!isSebOk()) {
          return res.status(403).json({ error: 'Bạn bắt buộc phải sử dụng Safe Exam Browser để truy cập bài thi này.' });
        }

        // 6. Dynamic duration calculation
        const examRemainingSeconds = (endTime.getTime() - now.getTime()) / 1000;
        if (examRemainingSeconds <= 0) {
          return res.status(403).json({ error: 'Exam Code not Available' });
        }

        const durationSeconds = exam.durationTime * 60;
        const timeLimit = durationSeconds; // Set initial limit to full duration, late deduction calculated upon openCode entry.

        // 7. Get questions to construct the quiz session
        const questions = await db.getQuestionsByQuiz(exam.quizTargetId);
        if (questions.length === 0) {
          return res.status(400).json({ error: 'Đề thi này chưa có câu hỏi nào để bắt đầu.' });
        }

        // Shuffle questions
        const shuffledQuestions = [...questions].sort(() => Math.random() - 0.5);

        // Save session with exam properties
        const sessionData = {
          quizTargetId: exam.quizTargetId,
          learningMode: 'exam',
          startTime: now.toISOString(),
          recentLearningDateTime: now.toISOString(),
          shuffleQuestions: true,
          shuffleAnswers: true,
          currentIndex: 0,
          studyTime: 0,
          timeLimit: timeLimit,
          isCompleted: false,
          totalCorrect: 0,
          totalWrong: 0,
          userEmail: registeredUser.email,
          userName: registeredUser.name,
          userMssv: registeredUser.mssv || trimmedUserName,
          openCode: exam.openCode,
          examStarted: 0,
          isScheduledExam: 1
        };

        const sessionId = await db.saveSession(sessionData);
        const savedSession = await db.getSessionById(sessionId);

        // Create details list
        const detailsList = shuffledQuestions.map((q, idx) => ({
          learningSessionId: sessionId,
          questionTargetId: q.id,
          isChecked: false,
          isSeen: idx === 0,
          isCorrect: null,
          selectedAnswersList: []
        }));

        await db.saveSessionDetailsBatch(detailsList);

        res.json({ success: true, sessionToken: savedSession?.sessionToken });
      } catch (err: any) {
        console.error('Exam login error:', err);
        res.status(500).json({ error: err.message || 'Lỗi server khi xác thực phòng thi.' });
      }
    });


    // ─── USER MANAGEMENT (admin only) ────────────────────────────────────────
    app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
      try {
        const users = await db.getUsers();
        res.json(users);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { email, name, mssv, class: userClass } = req.body;
        if (!email || !name) {
          res.status(400).json({ error: 'Email và Tên là bắt buộc' });
          return;
        }
        const id = await db.createUser({ email, name, mssv: mssv || '', class: userClass || '' });
        res.json({ id });
      } catch (err: any) {
        if (err.message?.includes('UNIQUE')) {
          res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống' });
        } else {
          res.status(500).json({ error: err.message });
        }
      }
    });

    app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
      try {
        await db.deleteUser(Number(req.params.id));
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { email, name, mssv, class: userClass } = req.body;
        if (!email || !name) {
          res.status(400).json({ error: 'Email và Tên là bắt buộc' });
          return;
        }
        await db.updateUser(Number(req.params.id), { email, name, mssv: mssv || '', class: userClass || '' });
        res.json({ success: true });
      } catch (err: any) {
        if (err.message?.includes('UNIQUE')) {
          res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống' });
        } else {
          res.status(500).json({ error: err.message });
        }
      }
    });

    app.post('/api/users/bulk-delete', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
          res.status(400).json({ error: 'Danh sách ID không hợp lệ' });
          return;
        }
        await db.bulkDeleteUsers(ids);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/users/bulk-update-class', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { ids, class: userClass } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
          res.status(400).json({ error: 'Danh sách ID không hợp lệ' });
          return;
        }
        await db.bulkUpdateUsersClass(ids, userClass || '');
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/users/import-ai', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { rawText, class: userClass } = req.body;
        if (!rawText || !rawText.trim()) {
          res.status(400).json({ error: 'Dữ liệu văn bản trống' });
          return;
        }

        const prompt = `You are a data parser assistant. Your task is to parse a text list of students (which might be tab-separated, comma-separated, space-separated, or in any copy-pasted tabular format) and extract their:
1. Email (required, string)
2. Name (required, string, combine first/middle/last name if separate)
3. MSSV (Student ID/Code, string, e.g. DE190305, or empty string if not found)

Input text:
"""
${rawText}
"""

Instructions:
1. Output ONLY a valid JSON array of objects. Do not include markdown code block syntax (like \`\`\`json) or any explanations or intro text. Just output raw JSON.
2. Each object in the array must have the following keys: "email", "name", "mssv".
3. Verify that the email is a valid email format.
4. If a name has multiple parts, combine them cleanly into a single string (e.g. "Võ Phan Huy").
5. If no valid students can be parsed, return an empty array: []`;

        const responseText = await callAI(prompt);
        let cleanText = responseText.trim();
        
        let students: any[] = [];
        try {
          // Remove potential markdown code blocks first
          if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
          }
          
          // Locate the JSON structure
          const firstBracket = cleanText.indexOf('[');
          const lastBracket = cleanText.lastIndexOf(']');
          
          if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            cleanText = cleanText.substring(firstBracket, lastBracket + 1);
            students = JSON.parse(cleanText);
          } else {
            const firstCurly = cleanText.indexOf('{');
            const lastCurly = cleanText.lastIndexOf('}');
            if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
              cleanText = cleanText.substring(firstCurly, lastCurly + 1);
              const parsed = JSON.parse(cleanText);
              // Check if the object contains a list of students
              let foundArray = false;
              for (const val of Object.values(parsed)) {
                if (Array.isArray(val)) {
                  students = val;
                  foundArray = true;
                  break;
                }
              }
              if (!foundArray) {
                students = [parsed];
              }
            } else {
              // Try parsing the whole thing directly
              const parsed = JSON.parse(cleanText);
              students = Array.isArray(parsed) ? parsed : [parsed];
            }
          }
        } catch (jsonErr: any) {
          console.error('Failed to parse AI response as JSON:', responseText);
          res.status(500).json({ 
            error: `Không thể phân tích cú pháp dữ liệu JSON từ AI. Vui lòng thử lại. Chi tiết: ${jsonErr.message}`,
            debugResponse: responseText 
          });
          return;
        }

        if (!Array.isArray(students)) {
          res.status(500).json({ error: 'AI không trả về danh sách sinh viên hợp lệ' });
          return;
        }

        let importedCount = 0;
        for (const student of students) {
          if (student.email && student.name) {
            try {
              await db.createUser({
                email: student.email,
                name: student.name,
                mssv: student.mssv || '',
                class: userClass || ''
              });
              importedCount++;
            } catch (err: any) {
              if (err.message?.includes('UNIQUE')) {
                // If user exists, update their class and metadata to match import
                const existing = await db.getUserByEmail(student.email);
                if (existing) {
                  await db.updateUser(existing.id, {
                    email: existing.email,
                    name: student.name || existing.name,
                    mssv: student.mssv || existing.mssv || '',
                    class: userClass || existing.class || ''
                  });
                  importedCount++;
                }
              } else {
                console.error('Failed to import user:', err);
              }
            }
          }
        }

        res.json({ success: true, count: importedCount });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── SUBJECTS API ─────────────────────────────────────────────────────────
    app.get('/api/subjects', requireAuth, async (req, res) => {
      try {
        const list = await db.getSubjects();
        res.json(list);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/subjects', requireAuth, requireAdmin, async (req, res) => {
      try {
        const id = await db.saveSubject(req.body);
        res.json({ id });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete('/api/subjects/:id', requireAuth, requireAdmin, async (req, res) => {
      try {
        await db.deleteSubject(Number(req.params.id));
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── QUIZZES API ──────────────────────────────────────────────────────────
    app.get('/api/subjects/:subjectId/quizzes', requireAuth, async (req, res) => {
      try {
        const user = (req as any).user;
        let list = await db.getQuizzesBySubject(Number(req.params.subjectId));
        if (!user || !user.isAdmin) {
          list = list.filter((q: any) => q.isExamOnly !== 1);
        }
        res.json(list);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/quizzes/:id', requireAuth, async (req, res) => {
      try {
        const item = await db.getQuizById(Number(req.params.id));
        if (!item) return res.status(404).json({ error: 'Quiz not found' });
        res.json(item);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/quizzes', requireAuth, requireAdmin, async (req, res) => {
      try {
        const id = await db.saveQuiz(req.body);
        res.json({ id });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete('/api/quizzes/:id', requireAuth, requireAdmin, async (req, res) => {
      try {
        await db.deleteQuiz(Number(req.params.id));
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── AI & TOOLS API ────────────────────────────────────────────────────────
    app.get('/api/ai/models', requireAuth, async (req, res) => {
      try {
        const customUrl = req.headers['x-litellm-url'] as string || LITELLM_API_URL;
        const customKey = req.headers['x-litellm-key'] as string || process.env.LITELLM_API_KEY || '';
        
        const response = await fetch(`${customUrl}/v1/models`, {
          headers: {
            ...(customKey ? { 'Authorization': `Bearer ${customKey}` } : {})
          }
        });
        if (!response.ok) {
          throw new Error(`LiteLLM status: ${response.status}`);
        }
        const data: any = await response.json();
        const models = data?.data?.map((m: any) => m.id) || [];
        res.json(models);
      } catch (err: any) {
        console.error('Error fetching LiteLLM models:', err);
        // Fallback standard models
        res.json([
          'gemini/gemini-1.5-flash',
          'gemini/gemini-1.5-pro',
          'openai/gpt-4o-mini',
          'openai/gpt-4o'
        ]);
      }
    });

    app.post('/api/ai/analyze-image', requireAuth, async (req, res) => {
      try {
        const { imageBase64, model } = req.body;
        if (!imageBase64) {
          res.status(400).json({ error: 'Hình ảnh là bắt buộc' });
          return;
        }

        const selectedModel = model || 'gemini/gemini-1.5-flash';

        let dataUri = imageBase64;
        if (!imageBase64.startsWith('data:')) {
          dataUri = `data:image/png;base64,${imageBase64}`;
        }

        const prompt = `You are a helpful education assistant.
Your task is to analyze the quiz question screenshot.
1. Extract the question content (it may include text in English or Vietnamese).
2. Extract all the options/answers.
3. Identify the correct answer option.
4. Write a detailed explanation in Vietnamese consisting of two parts:
   a) "💡 Mẹo nhớ siêu tốc": A short, memorable shortcut, trick, keyword, or summary to quickly recall the answer.
   b) "🔍 Phân tích Đúng/Sai": A line-by-line analysis explaining why each option is correct or incorrect.
   Format the explanation as clean HTML (using <strong>, <ul>, <li>, etc.) to look professional. Do not use Markdown tags inside the HTML string.
   
If the question, options, or explanation contain any mathematical formulas, calculations, equations, indices, powers, or mathematical expressions, you MUST format them using standard LaTeX syntax. 
Wrap inline math with \\( ... \\) and display/block math with \\[ ... \\]. For example, write 2^{16} as \\(2^{16}\\), block size as \\(\\text{block\\ size}\\).

You MUST respond strictly with a JSON object matching this schema:
{
  "question": "string containing the extracted question text",
  "answers": [
    { "content": "Option A text", "isCorrect": false },
    { "content": "Option B text", "isCorrect": false },
    ...
  ],
  "explanation": "string containing HTML-formatted explanation"
}

Do not include any markdown backticks (like \`\`\`json) in your response, return ONLY the raw JSON text.`;

        const payload = {
          model: selectedModel,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUri
                  }
                }
              ]
            }
          ],
          temperature: 0.2
        };

        const customUrl = req.headers['x-litellm-url'] as string || LITELLM_API_URL;
        const customKey = req.headers['x-litellm-key'] as string || process.env.LITELLM_API_KEY || '';

        const url = `${customUrl}/v1/chat/completions`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(customKey ? { 'Authorization': `Bearer ${customKey}` } : {})
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Lỗi từ LiteLLM API: ${errText}`);
        }

        const result: any = await response.json();
        const responseText = result?.choices?.[0]?.message?.content;
        
        if (!responseText) {
          throw new Error('LiteLLM không phản hồi dữ liệu.');
        }

        let cleanJson = responseText.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```(json)?/, '');
          cleanJson = cleanJson.replace(/```$/, '').trim();
        }
        
        const parsed = JSON.parse(cleanJson);
        res.json(parsed);
      } catch (err: any) {
        console.error('Error analyzing image:', err);
        res.status(500).json({ error: err.message || 'Lỗi xử lý ảnh bằng AI' });
      }
    });

    app.get('/api/tools/desktop-app', requireAuth, (req, res) => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const scriptPath = path.join(__dirname, '..', 'src', 'desktop_app.py');
      res.download(scriptPath, 'desktop_app.py');
    });

    // ─── QUESTIONS & ANSWERS API ──────────────────────────────────────────────
    app.get('/api/quizzes/:quizId/questions', requireAuth, async (req, res) => {
      try {
        const list = await db.getQuestionsByQuiz(Number(req.params.quizId));
        res.json(list);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/questions/:id', requireAuth, async (req, res) => {
      try {
        const q = await db.getQuestionById(Number(req.params.id));
        if (!q) return res.status(404).json({ error: 'Question not found' });
        res.json(q);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/questions', requireAuth, requireAdmin, async (req, res) => {
      try {
        const id = await db.saveQuestion(req.body);
        res.json({ id });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete('/api/questions/:id', requireAuth, requireAdmin, async (req, res) => {
      try {
        await db.deleteQuestion(Number(req.params.id));
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── SESSIONS API ─────────────────────────────────────────────────────────
    app.get('/api/sessions', requireAuth, async (req, res) => {
      try {
        const user = (req as any).user;
        const emailFilter = user.isAdmin ? undefined : user.email;
        let list = await db.getSessions(emailFilter);

        const exams = await db.getExams();
        const examMap = new Map(exams.map(e => [e.quizTargetId, e]));

        list = list.map(s => {
          if (s.learningMode === 'exam') {
            const exam = examMap.get(s.quizTargetId);
            const isScheduled = s.isScheduledExam === 1 || 
                                (exam && s.openCode === exam.openCode && exam.openCode !== '123');
            if (exam && isScheduled) {
              const maskScore = !user.isAdmin && exam.showScore === 0;
              return {
                ...s,
                totalCorrect: maskScore ? null : s.totalCorrect,
                totalWrong: maskScore ? null : s.totalWrong,
                allowReview: exam.allowReview,
                showScore: exam.showScore,
                isScheduledExam: true
              };
            }
          }
          return {
            ...s,
            isScheduledExam: false
          };
        });

        res.json(list);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/sessions/:idOrToken', async (req, res) => {
      try {
        const idOrToken = req.params.idOrToken;
        const session = await db.getSessionByIdOrToken(idOrToken);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const authenticatedUser = getAuthenticatedUser(req);

        // Retrieve the exam configuration if this is an exam mode session
        let exam = null;
        if (session.learningMode === 'exam') {
          exam = (await db.getExams()).find(e => e.quizTargetId === session.quizTargetId);
        }

        const isScheduled = session.isScheduledExam === 1 || 
                            (exam && session.openCode === exam.openCode && exam.openCode !== '123');

        if (exam && isScheduled) {
          (session as any).examEnd = exam.timeEnd;
          (session as any).durationTime = exam.durationTime;
          (session as any).isScheduledExam = true;
          (session as any).allowReview = exam.allowReview;
          (session as any).showScore = exam.showScore;
        } else {
          (session as any).isScheduledExam = false;
        }

        // Apply score mask policy if not admin
        let maskScore = false;
        if (exam && !authenticatedUser?.isAdmin) {
          if (exam.showScore === 0) {
            maskScore = true;
          }
        }

        const prepareSessionResponse = (s: any) => {
          if (!s) return s;
          if (maskScore) {
            return {
              ...s,
              totalCorrect: null,
              totalWrong: null
            };
          }
          return s;
        };

        // Mask openCode if the exam has ended
        if (exam) {
          const now = new Date();
          const endTime = new Date(exam.timeEnd);
          if (now > endTime) {
            session.openCode = '';
          }
        }

        // IP Lock check for active exam sessions
        if (session.learningMode === 'exam' && !session.isCompleted) {
          const clientIp = getClientIp(req);
          if (!session.lockToken) {
            // First time starting the exam: bind to this IP address
            session.lockToken = clientIp;
            await db.saveSession(session);
          } else if (!isIpMatch(session.lockToken, clientIp) && !authenticatedUser?.isAdmin) {
            // Access from a different IP: block the user
            return res.json({
              session: prepareSessionResponse(session),
              isIpBlocked: true,
              message: 'Bài thi bị khóa do phát hiện truy cập từ địa chỉ IP khác.'
            });
          }
        }

        // If it's an active exam mode session, verify SEB
        if (session.learningMode === 'exam' && !session.isCompleted) {
          const sendExamData = async () => {
            const details = await db.getSessionDetails(session.id);
            // Fetch questions for this session
            let questions: any[] = [];
            if (session.quizTargetId < 0) {
              const subjectId = -session.quizTargetId;
              const subjectQuizzes = await db.getQuizzesBySubject(subjectId);
              const questionsResults = await Promise.all(
                subjectQuizzes.map(q => db.getQuestionsByQuiz(q.id))
              );
              questions = questionsResults.flat();
            } else {
              questions = await db.getQuestionsByQuiz(session.quizTargetId);
            }
            res.json({ session: prepareSessionResponse(session), details, questions });
          };

          // Bypass SEB verification if useSeb is 0
          const useSeb = exam ? exam.useSeb : 1;
          const isSebVerified = useSeb === 0 ? true : checkSebCryptographicHash(req);

          if (isSebVerified) {
            return sendExamData();
          }

          return res.json({
            session: prepareSessionResponse(session),
            requireSeb: true,
            message: 'Bạn bắt buộc phải sử dụng Safe Exam Browser để truy cập bài thi này.'
          });
        }

        // If it's a completed exam mode session, return details & questions based on allowReview policy
        if (session.learningMode === 'exam' && session.isCompleted) {
          const isQueriedByToken = typeof idOrToken === 'string' && isNaN(Number(idOrToken));
          const isOwner = authenticatedUser && session.userEmail === authenticatedUser.email;
          const isAdmin = authenticatedUser?.isAdmin;

          if (isQueriedByToken || isOwner || isAdmin) {
            let details = await db.getSessionDetails(session.id);
            // Fetch questions for this session
            let questions: any[] = [];
            if (session.quizTargetId < 0) {
              const subjectId = -session.quizTargetId;
              const subjectQuizzes = await db.getQuizzesBySubject(subjectId);
              const questionsResults = await Promise.all(
                subjectQuizzes.map(q => db.getQuestionsByQuiz(q.id))
              );
              questions = questionsResults.flat();
            } else {
              questions = await db.getQuestionsByQuiz(session.quizTargetId);
            }

            // Apply allowReview policy if not admin
            if (exam && !isAdmin) {
              if (exam.allowReview === 0) {
                details = [];
                questions = []; // return empty arrays if allowReview is 0 to prevent api snooping
              }
            }

            return res.json({ session: prepareSessionResponse(session), details, questions });
          }
        }

        // For non-exam mode sessions, require standard authentication
        requireAuth(req, res, async () => {
          const user = (req as any).user;
          if (!user.isAdmin && session.userEmail && session.userEmail !== user.email) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          const details = await db.getSessionDetails(session.id);
          let questions: any[] = [];
          if (session.quizTargetId < 0) {
            const subjectId = -session.quizTargetId;
            const subjectQuizzes = await db.getQuizzesBySubject(subjectId);
            const questionsResults = await Promise.all(
              subjectQuizzes.map(q => db.getQuestionsByQuiz(q.id))
            );
            questions = questionsResults.flat();
          } else {
            questions = await db.getQuestionsByQuiz(session.quizTargetId);
          }
          res.json({ session: prepareSessionResponse(session), details, questions });
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/sessions', requireAuth, async (req, res) => {
      try {
        const user = (req as any).user;
        const sessionData = {
          ...req.body,
          userEmail: user.email,
          userName: user.name,
          userMssv: user.mssv,
          openCode: req.body.openCode || '123'
        };
        const id = await db.saveSession(sessionData);
        const saved = await db.getSessionById(id);
        res.json({ id, sessionToken: saved?.sessionToken });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.put('/api/sessions/:idOrToken', async (req, res) => {
      try {
        const idOrToken = req.params.idOrToken;
        const { session, details } = req.body;

        const targetSession = await db.getSessionByIdOrToken(idOrToken);
        if (!targetSession) {
          return res.status(404).json({ error: 'Session not found' });
        }

        const authenticatedUser = getAuthenticatedUser(req);

        // Lock completed sessions to prevent stale requests from overwriting results
        if (targetSession.isCompleted && !authenticatedUser?.isAdmin) {
          return res.status(400).json({
            error: 'SESSION_LOCKED',
            message: 'Phiên thi này đã kết thúc và không thể sửa đổi.'
          });
        }

        // IP Lock check: prevent updating exam sessions from a different IP
        if (targetSession.learningMode === 'exam' && !targetSession.isCompleted) {
          const clientIp = getClientIp(req);
          if (targetSession.lockToken && !isIpMatch(targetSession.lockToken, clientIp) && !authenticatedUser?.isAdmin) {
            return res.status(403).json({
              error: 'IP_BLOCKED',
              message: 'Bài thi bị khóa do phát hiện truy cập từ địa chỉ IP khác.'
            });
          }
        }

        const handleSave = async (userEmail?: string, userName?: string, userMssv?: string) => {
          const sessionToSave = {
            ...session,
            id: targetSession.id,
            totalCorrect: session.totalCorrect ?? targetSession.totalCorrect ?? 0,
            totalWrong: session.totalWrong ?? targetSession.totalWrong ?? 0,
            openCode: session.openCode || targetSession.openCode || '123',
            lockToken: targetSession.lockToken,
            userEmail: targetSession.userEmail || userEmail || null,
            userName: targetSession.userName || userName || null,
            userMssv: targetSession.userMssv || userMssv || null
          };

          await db.saveSession(sessionToSave);

          if (details && Array.isArray(details)) {
            await db.saveSessionDetailsBatch(details);
          }
          res.json({ success: true });
        };

        if (targetSession.learningMode === 'exam') {
          if (authenticatedUser?.isAdmin) {
            return handleSave(authenticatedUser.email, authenticatedUser.name, authenticatedUser.mssv);
          }

          // Check if the update contains any actual answers.
          // If it is just initializing the session (no answers selected), we allow it outside SEB.
          const hasAnswers = details && Array.isArray(details) && details.some((d: any) => 
            d.isChecked === true || 
            (d.selectedAnswersList && d.selectedAnswersList.length > 0)
          );

          if (!hasAnswers) {
            return handleSave(
              authenticatedUser?.email,
              authenticatedUser?.name,
              authenticatedUser?.mssv
            );
          }

          // Retrieve the exam config for this quiz to check useSeb configuration
          const exam = (await db.getExams()).find(e => e.quizTargetId === targetSession.quizTargetId);
          const useSeb = exam ? exam.useSeb : 1;

          if (useSeb === 0) {
            return handleSave(
              authenticatedUser?.email,
              authenticatedUser?.name,
              authenticatedUser?.mssv
            );
          }

          return verifySafeExamBrowser(req, res, () => {
            handleSave(
              authenticatedUser?.email,
              authenticatedUser?.name,
              authenticatedUser?.mssv
            );
          });
        }

        // For non-exam sessions, require standard authentication
        requireAuth(req, res, () => {
          const user = (req as any).user;
          handleSave(user.email, user.name, user.mssv);
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
      try {
        await db.deleteSession(Number(req.params.id));
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/sessions/clear-history', requireAuth, requireAdmin, async (req, res) => {
      try {
        await db.clearSessionHistory();
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Helper function to call the AI model
    async function callAI(
      prompt: string,
      customUrl?: string,
      customKey?: string,
      customModel?: string
    ): Promise<string> {
      const config = await db.getConfig();
      const url = customUrl || process.env.AI_ENDPOINT || config?.aiEndpoint || process.env.LITELLM_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
      const key = customKey || process.env.AI_API_KEY || config?.aiApiKey || process.env.LITELLM_API_KEY || '';
      const model = customModel || process.env.AI_MODEL || config?.aiModel || 'gemini-1.5-flash';

      if (!url) {
        throw new Error('AI Endpoint URL is not configured. Please set AI_ENDPOINT in your .env file.');
      }
      if (!key) {
        throw new Error('AI API Key is not configured. Please set AI_API_KEY in your .env file.');
      }

      const payload = {
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3
      };

      // Standard Gemini API direct call
      if (url.includes('generativelanguage.googleapis.com')) {
        const cleanUrl = url.includes('?') ? `${url}&key=${key}` : `${url}?key=${key}`;
        const response = await fetch(cleanUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt }
                ]
              }
            ]
          })
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
        }
        const data: any = await response.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }

      // OpenAI-compatible / LiteLLM endpoint call
      let targetUrl = url;
      if (!targetUrl.endsWith('/chat/completions') && !targetUrl.endsWith('/v1/chat/completions')) {
        targetUrl = targetUrl.replace(/\/+$/, '');
        if (targetUrl.endsWith('/v1')) {
          targetUrl = `${targetUrl}/chat/completions`;
        } else {
          targetUrl = `${targetUrl}/v1/chat/completions`;
        }
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { 'Authorization': `Bearer ${key}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI API Error: ${response.status} - ${errText}`);
      }

      const data: any = await response.json();
      return data?.choices?.[0]?.message?.content || '';
    }

    // ─── AI ASSISTANT API ──────────────────────────────────────────────────────
    app.post('/api/ai/analyze-progress', requireAuth, async (req, res) => {
      try {
        const { subjectId } = req.body;
        const user = getAuthenticatedUser(req);
        if (!user) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        
        let quizzes;
        let subjectName = '';
        if (subjectId) {
          const subject = await db.quizDb.get('SELECT name FROM subjects WHERE id = ?', [subjectId]);
          subjectName = subject ? subject.name : '';
          quizzes = await db.quizDb.all('SELECT id FROM quizzes WHERE subjectTargetId = ?', [subjectId]);
        } else {
          quizzes = await db.quizDb.all('SELECT id FROM quizzes');
        }

        const quizIds = quizzes.map((q: any) => q.id);
        if (quizIds.length === 0) {
          res.json({ report: 'Không có dữ liệu đề thi hoặc câu hỏi nào cho môn học này để phân tích.' });
          return;
        }

        // Fetch user sessions
        const quizPlaceholders = quizIds.map(() => '?').join(',');
        const sessions = await db.userDb.all(
          `SELECT id, totalCorrect, totalWrong FROM sessions 
           WHERE quizTargetId IN (${quizPlaceholders}) AND userEmail = ?`,
          [...quizIds, user.email]
        );

        if (sessions.length === 0) {
          res.json({ report: 'Bạn chưa thực hiện lượt làm bài nào cho môn học này. Hãy thử sức với ít nhất một đề thi để AI có thể đánh giá năng lực của bạn!' });
          return;
        }

        const sessionIds = sessions.map((s: any) => s.id);
        const sessionPlaceholders = sessionIds.map(() => '?').join(',');

        // Find all unique question IDs answered incorrectly by the user in this subject
        const wrongDetails = await db.userDb.all(
          `SELECT DISTINCT questionTargetId FROM session_details 
           WHERE learningSessionId IN (${sessionPlaceholders}) AND isCorrect = 0`,
          sessionIds
        );

        let totalCorrect = 0;
        let totalWrong = 0;
        sessions.forEach((s: any) => {
          totalCorrect += s.totalCorrect || 0;
          totalWrong += s.totalWrong || 0;
        });

        if (wrongDetails.length === 0 && totalCorrect > 0) {
          res.json({ report: `🎉 **Đánh giá năng lực tuyệt vời!** Bạn đã làm đúng toàn bộ ${totalCorrect} câu hỏi đã thử sức. Hệ thống không ghi nhận bất kỳ điểm yếu hay câu làm sai nào của bạn đối với môn học này. Hãy tiếp tục duy trì phong độ xuất sắc này nhé!` });
          return;
        }

        // Limit list to top 15 incorrect questions for AI analysis to avoid prompt overload
        const limitWrongIds = wrongDetails.slice(0, 15).map((d: any) => d.questionTargetId);
        const wrongPlaceholders = limitWrongIds.map(() => '?').join(',');

        // Fetch question texts
        const questions = await db.quizDb.all(
          `SELECT id, content, explanation FROM questions WHERE id IN (${wrongPlaceholders})`,
          limitWrongIds
        );

        // Fetch answers options for these questions
        const answers = await db.quizDb.all(
          `SELECT id, content, isCorrect, questionTargetId FROM answers WHERE questionTargetId IN (${wrongPlaceholders})`,
          limitWrongIds
        );

        // Construct incorrect questions text for the AI prompt
        let incorrectQuestionsText = '';
        questions.forEach((q: any, index: number) => {
          const qAnswers = answers.filter((a: any) => a.questionTargetId === q.id);
          incorrectQuestionsText += `\nCâu ${index + 1}: ${q.content}\n`;
          qAnswers.forEach((a: any, idx: number) => {
            incorrectQuestionsText += ` - ${String.fromCharCode(65 + idx)}. ${a.content}${a.isCorrect ? ' (Đáp án ĐÚNG)' : ''}\n`;
          });
          if (q.explanation) {
            incorrectQuestionsText += ` Giải thích gốc: ${q.explanation}\n`;
          }
        });

        const accuracyRate = Math.round((totalCorrect / (totalCorrect + totalWrong || 1)) * 100);

        const prompt = `Bạn là Trợ lý Học tập AI tại FPT University. Hãy phân tích tiến trình học tập của sinh viên dựa trên số liệu sau:
- Tỉ lệ làm đúng: ${accuracyRate}% (${totalCorrect}/${totalCorrect + totalWrong} câu).
- Môn học: ${subjectName || 'Tất cả các môn'}.

Dưới đây là danh sách một số câu hỏi tiêu biểu mà sinh viên này làm SAI gần đây. Hãy xem xét kỹ các câu hỏi, đáp án đúng và phần giải thích của chúng để đúc kết lỗi sai:
${incorrectQuestionsText}

Hãy viết một báo cáo đánh giá chi tiết bằng tiếng Việt dưới định dạng Markdown, bao gồm các mục chính sau:
1. **Đánh giá tổng quan**: Phân tích ngắn gọn về tỉ lệ chính xác và phong độ làm bài.
2. **Chương học & Kiến thức còn hổng**: Dựa trên các câu hỏi làm sai ở trên, hãy chỉ ra cụ thể những mảng kiến thức, định lý, công thức hay khái niệm nào mà sinh viên đang bị hổng hoặc nhầm lẫn.
3. **Đề xuất & Lộ trình cải thiện**: Đưa ra lời khuyên cụ thể, mẹo nhớ nhanh hoặc các bước rèn luyện để sinh viên bổ sung kiến thức thiếu sót hiệu quả nhất.

Lưu ý: Viết báo cáo thật cuốn hút, trực quan, sử dụng các ký hiệu emoji phù hợp và định dạng Markdown để hiển thị đẹp mắt.`;

        const report = await callAI(prompt);
        res.json({ report });
      } catch (err: any) {
        console.error('Error in analyze-progress:', err.message, err.cause);
        res.status(500).json({ error: err.cause?.message || err.message || String(err) });
      }
    });

    app.get('/api/ai/analyze-repetition/:subjectId', requireAuth, async (req, res) => {
      try {
        const subjectId = Number(req.params.subjectId);
        
        const subject = await db.quizDb.get('SELECT code, name FROM subjects WHERE id = ?', [subjectId]);
        if (!subject) {
          res.status(404).json({ error: 'Môn học không tồn tại' });
          return;
        }

        const quizzes = await db.quizDb.all('SELECT id, name FROM quizzes WHERE subjectTargetId = ?', [subjectId]);
        if (quizzes.length === 0) {
          res.json({ repetitionRate: 0, totalQuestions: 0, uniqueQuestionsCount: 0, duplicatesList: [], aiSummary: 'Môn học này chưa có bộ đề nào để phân tích trùng lặp.' });
          return;
        }

        const quizIds = quizzes.map((q: any) => q.id);
        const quizPlaceholders = quizIds.map(() => '?').join(',');

        // Fetch all questions and their parent quiz names
        const questions = await db.quizDb.all(
          `SELECT q.id, q.content, q.quizTargetId, quiz.name as quizName 
           FROM questions q
           JOIN quizzes quiz ON q.quizTargetId = quiz.id
           WHERE q.quizTargetId IN (${quizPlaceholders})`,
          quizIds
        );

        if (questions.length === 0) {
          res.json({ repetitionRate: 0, totalQuestions: questions.length, uniqueQuestionsCount: 0, duplicatesList: [], aiSummary: 'Các bộ đề chưa có câu hỏi nào để phân tích.' });
          return;
        }

        // Helper string cleaning for Jaccard word overlap similarity
        const cleanStringForSimilarity = (str: string): string => {
          return str
            .toLowerCase()
            .replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        };

        const getWordOverlapSimilarity = (str1: string, str2: string): number => {
          const s1 = cleanStringForSimilarity(str1);
          const s2 = cleanStringForSimilarity(str2);
          if (!s1 || !s2) return 0;
          if (s1 === s2) return 1.0;

          const words1 = new Set(s1.split(' '));
          const words2 = new Set(s2.split(' '));
          
          let intersection = 0;
          words1.forEach(w => {
            if (words2.has(w)) intersection++;
          });
          
          const union = new Set([...words1, ...words2]).size;
          return union > 0 ? intersection / union : 0;
        };

        // Group similar questions
        const groups: { rep: any; items: any[] }[] = [];
        const threshold = 0.85;

        for (const q of questions) {
          let foundGroup = false;
          for (const g of groups) {
            if (getWordOverlapSimilarity(q.content, g.rep.content) >= threshold) {
              g.items.push(q);
              foundGroup = true;
              break;
            }
          }
          if (!foundGroup) {
            groups.push({ rep: q, items: [q] });
          }
        }

        // Duplicate groups list
        const duplicates = groups
          .filter(g => g.items.length > 1)
          .map(g => {
            const quizOccurrences = g.items.map(item => item.quizName);
            return {
              text: g.rep.content,
              quizzes: [...new Set(quizOccurrences)],
              occurrences: g.items.length
            };
          })
          .sort((a, b) => b.occurrences - a.occurrences);

        const totalQuestions = questions.length;
        const uniqueQuestionsCount = groups.length;
        const duplicateCount = totalQuestions - uniqueQuestionsCount;
        const repetitionRate = Math.round((duplicateCount / totalQuestions) * 100);

        // Fetch top duplicate samples for AI prompt
        const topDuplicatesSamples = duplicates.slice(0, 5);
        let duplicateSamplesText = '';
        topDuplicatesSamples.forEach((d: any, idx: number) => {
          duplicateSamplesText += `\nCâu ${idx + 1} (Lặp ${d.occurrences} lần ở các đề: ${d.quizzes.join(', ')}):\n> ${d.text}\n`;
        });

        const prompt = `Bạn là Trợ lý Giáo vụ AI tại FPT University. Hãy đánh giá tình trạng lặp câu hỏi giữa các đề thi cũ của môn học:
- Mã môn: ${subject.code} - ${subject.name}
- Tổng số câu hỏi trong ngân hàng đề: ${totalQuestions}
- Số câu hỏi duy nhất (không trùng lặp): ${uniqueQuestionsCount}
- Tỉ lệ lặp câu hỏi: ${repetitionRate}% (Số câu trùng: ${duplicateCount})

Dưới đây là một số mẫu các câu hỏi bị trùng lặp nhiều lần nhất giữa các kỳ thi gần đây:
${duplicateSamplesText || 'Không có câu hỏi lặp cụ thể.'}

Hãy viết một báo cáo phân tích ngắn gọn, trực quan bằng tiếng Việt (Markdown) bao gồm:
1. **Nhận xét tỉ lệ trùng lặp đề**: Tỉ lệ lặp này là cao hay thấp, có bình thường đối với đề thi trắc nghiệm FPT không?
2. **Xu hướng phân bổ câu hỏi**: Những nội dung/kiến thức nào thường có tỷ lệ lặp lại cao nhất?
3. **Mẹo ôn tập ứng phó**: Hướng dẫn sinh viên cách ôn thi hiệu quả dựa trên xu hướng lặp đề này.

Lưu ý: Trình bày đẹp mắt với các tiêu đề rõ ràng.`;

        const aiSummary = duplicateCount > 0 ? await callAI(prompt) : 'Hệ thống không phát hiện thấy bất kỳ câu hỏi trùng lặp nào giữa các bộ đề thi hiện tại.';

        res.json({
          repetitionRate,
          totalQuestions,
          uniqueQuestionsCount,
          duplicatesList: duplicates.slice(0, 30), // return top 30 duplicates
          aiSummary
        });
      } catch (err: any) {
        console.error('Error in analyze-repetition:', err.message, err.cause);
        res.status(500).json({ error: err.cause?.message || err.message || String(err) });
      }
    });

    app.post('/api/ai/recommend-questions', requireAuth, async (req, res) => {
      try {
        const { subjectId } = req.body;
        const user = getAuthenticatedUser(req);
        if (!user) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        if (!subjectId) {
          res.status(400).json({ error: 'Mã môn học (subjectId) là bắt buộc.' });
          return;
        }

        // Fetch all questions of this subject
        const quizzes = await db.quizDb.all('SELECT id FROM quizzes WHERE subjectTargetId = ?', [subjectId]);
        const quizIds = quizzes.map((q: any) => q.id);
        if (quizIds.length === 0) {
          res.status(400).json({ error: 'Môn học này chưa có câu hỏi nào.' });
          return;
        }

        const quizPlaceholders = quizIds.map(() => '?').join(',');
        const allQuestions = await db.quizDb.all(
          `SELECT id, content FROM questions WHERE quizTargetId IN (${quizPlaceholders})`,
          quizIds
        );

        if (allQuestions.length === 0) {
          res.status(400).json({ error: 'Không tìm thấy câu hỏi nào trong môn học này.' });
          return;
        }

        // Fetch incorrect questions answered by the user
        const sessions = await db.userDb.all(
          `SELECT id FROM sessions WHERE quizTargetId IN (${quizPlaceholders}) AND userEmail = ?`,
          [...quizIds, user.email]
        );

        let incorrectQuestionIds: number[] = [];
        if (sessions.length > 0) {
          const sessionIds = sessions.map((s: any) => s.id);
          const sessionPlaceholders = sessionIds.map(() => '?').join(',');
          const wrongDetails = await db.userDb.all(
            `SELECT DISTINCT questionTargetId FROM session_details 
             WHERE learningSessionId IN (${sessionPlaceholders}) AND isCorrect = 0`,
            sessionIds
          );
          incorrectQuestionIds = wrongDetails.map((d: any) => d.questionTargetId);
        }

        let recommendedIds: number[] = [];

        if (incorrectQuestionIds.length > 0) {
          try {
            // Ask AI to pick the best 10 questions targeting weak spots
            const wrongQuestions = await db.quizDb.all(
              `SELECT id, content FROM questions WHERE id IN (${incorrectQuestionIds.slice(0, 10).map(() => '?').join(',')})`,
              incorrectQuestionIds.slice(0, 10)
            );
            
            let incorrectText = '';
            wrongQuestions.forEach((q: any) => {
              incorrectText += `ID: ${q.id} - ${q.content}\n`;
            });

            // Sample some random questions from the pool to let the AI select from
            const randomSample = allQuestions.sort(() => Math.random() - 0.5).slice(0, 30);
            let poolText = '';
            randomSample.forEach((q: any) => {
              poolText += `ID: ${q.id} - ${q.content}\n`;
            });

            const prompt = `Học viên đang ôn tập môn này và làm sai các câu sau:
${incorrectText}

Hãy chọn ra 10 câu hỏi hữu ích nhất để luyện tập khắc phục điểm yếu từ danh sách ngân hàng câu hỏi dưới đây:
${poolText}

Chỉ trả về kết quả là một mảng JSON chứa các ID câu hỏi được lựa chọn (các số nguyên), ví dụ: [12, 14, 55, 66]. KHÔNG viết thêm bất kỳ lời bình luận hay giải thích nào, chỉ trả về đúng định dạng JSON mảng.`;

            const aiResponseText = await callAI(prompt);
            const parsed = JSON.parse(aiResponseText.trim().replace(/```json/g, '').replace(/```/g, ''));
            if (Array.isArray(parsed)) {
              recommendedIds = parsed.filter(id => allQuestions.some((q: any) => q.id === id));
            }
          } catch (e) {
            console.error('AI question recommendation failed, falling back to database selection:', e);
          }
        }

        // Fallback selection if AI fails or user has no mistakes yet
        if (recommendedIds.length === 0) {
          // Select all incorrect questions first, fill up to 10 with random questions
          const incorrectInSubject = allQuestions.filter((q: any) => incorrectQuestionIds.includes(q.id));
          const remainingCount = 10 - incorrectInSubject.length;
          
          let selected = [...incorrectInSubject];
          if (remainingCount > 0) {
            const others = allQuestions.filter((q: any) => !incorrectQuestionIds.includes(q.id));
            const shuffledOthers = others.sort(() => Math.random() - 0.5).slice(0, remainingCount);
            selected = [...selected, ...shuffledOthers];
          }
          recommendedIds = selected.map((q: any) => q.id);
        }

        res.json({ recommendedQuestionIds: recommendedIds.slice(0, 10) });
      } catch (err: any) {
        console.error('Error in recommend-questions:', err.message, err.cause);
        res.status(500).json({ error: err.cause?.message || err.message || String(err) });
      }
    });

    app.get('/api/ai/fpt-syllabus/:subjectCode', requireAuth, async (req, res) => {
      try {
        const { subjectCode } = req.params;

        const prompt = `Bạn là Chuyên gia Học thuật tại FPT University. Hãy đúc kết thông tin chi tiết và cẩm nang ôn thi cho môn học có mã: ${subjectCode}.
Hãy viết một cẩm nang giáo trình chi tiết bằng tiếng Việt dưới định dạng Markdown, bao gồm các phần sau:
1. **Mô tả môn học**: Tóm tắt môn học này học về cái gì, tầm quan trọng của nó trong ngành học.
2. **Các chương học cốt lõi & Kiến thức trọng tâm**: Liệt kê các chương chính theo giáo trình FPT, kèm theo các định lý, công thức và chủ đề cốt lõi cần phải nhớ trong mỗi chương.
3. **Cấu trúc đề thi & Tỷ lệ điểm**: Phân tích cấu trúc đề thi FE (Final Exam) điển hình của môn này (số lượng câu hỏi, thời gian làm bài, tỷ lệ lý thuyết vs bài tập).
4. **Bí kíp cày điểm A/A+**: Các mẹo thi cử đặc quyền, lưu ý phòng tránh bẫy đề thi và phương pháp ôn luyện hiệu quả nhất để đạt điểm cao môn này tại FPT University.

Hãy viết thật chi tiết, có tổ chức rõ ràng bằng Markdown, chia tiêu đề hợp lý để sinh viên dễ theo dõi.`;

        const syllabus = await callAI(prompt);
        res.json({ syllabus });
      } catch (err: any) {
        console.error('Error in fpt-syllabus:', err.message, err.cause);
        res.status(500).json({ error: err.cause?.message || err.message || String(err) });
      }
    });

    // ─── CONFIG API ───────────────────────────────────────────────────────────
    app.get('/api/config', requireAuth, async (req, res) => {
      try {
        const config = await db.getConfig();
        res.json(config);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/config', requireAuth, requireAdmin, async (req, res) => {
      try {
        await db.saveConfig(req.body);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/reset', requireAuth, requireAdmin, async (req, res) => {
      try {
        await db.wipeDatabase();
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/config/seb', async (req, res) => {
      try {
        const host = req.get('host') || '';
        const portIndex = host.indexOf(':');
        const baseHost = portIndex !== -1 ? host.substring(0, portIndex) : host;
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const configPath = path.join(__dirname, '..', 'resources', 'exam_config.seb');

        if (!fs.existsSync(configPath)) {
          return res.status(404).json({ error: 'SEB config template not found' });
        }

        let xmlContent = fs.readFileSync(configPath, 'utf8');

        // Extract sessionToken from query (supporting ??sessionToken as well)
        const sessionToken = req.query.sessionToken || req.query['?sessionToken'];

        if (isLocalhost) {
          let startUrl = '';
          if (sessionToken) {
            const session = await db.getSessionByIdOrToken(String(sessionToken));
            if (session) {
              const exam = (await db.getExams()).find(e => e.quizTargetId === session.quizTargetId);
              if (exam) {
                // Scheduled exam: start at exam portal localhost port 8100
                startUrl = `http://${baseHost}:8100`;
              } else {
                // Self-practice exam: start at play page in candidate portal localhost port 5173
                startUrl = `http://${baseHost}:5173/learning/play/${session.sessionToken || session.id}`;
              }
            }
          }

          if (!startUrl) {
            startUrl = `http://${baseHost}:8100`;
          }

          // Replace startURL in the XML template for localhost testing
          const startUrlRegex = /<key>startURL<\/key>\s*<string>[^<]*<\/string>/;
          xmlContent = xmlContent.replace(
            startUrlRegex,
            `<key>startURL</key>\n    <string>${startUrl}</string>`
          );
        }

        res.setHeader('Content-Type', 'application/x-safeexambrowser');
        res.setHeader('Content-Disposition', 'attachment; filename="exam_config.seb"');
        res.send(xmlContent);
      } catch (err: any) {
        console.error('Error serving SEB config:', err);
        res.status(500).json({ error: err.message });
      }
    });

    // Catch-all route
    app.use('*', (req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });

    app.listen(PORT, () => {
      console.log(`Express API Server is running on port ${PORT}`);
    });

  } catch (err) {
    console.error('Failed to start API server:', err);
    process.exit(1);
  }
}

startServer();
