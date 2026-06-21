import 'dotenv/config';
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
          examStarted: 0
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
        const { email, name, mssv } = req.body;
        if (!email || !name) {
          res.status(400).json({ error: 'Email và Tên là bắt buộc' });
          return;
        }
        const id = await db.createUser({ email, name, mssv: mssv || '' });
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
        const { email, name, mssv } = req.body;
        if (!email || !name) {
          res.status(400).json({ error: 'Email và Tên là bắt buộc' });
          return;
        }
        await db.updateUser(Number(req.params.id), { email, name, mssv: mssv || '' });
        res.json({ success: true });
      } catch (err: any) {
        if (err.message?.includes('UNIQUE')) {
          res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống' });
        } else {
          res.status(500).json({ error: err.message });
        }
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
            if (exam) {
              const maskScore = !user.isAdmin && exam.showScore === 0;
              return {
                ...s,
                totalCorrect: maskScore ? null : s.totalCorrect,
                totalWrong: maskScore ? null : s.totalWrong,
                allowReview: exam.allowReview,
                showScore: exam.showScore
              };
            }
          }
          return s;
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

        if (exam) {
          (session as any).examEnd = exam.timeEnd;
          (session as any).durationTime = exam.durationTime;
          (session as any).isScheduledExam = true;
        }

        // Apply score mask policy if not admin
        if (exam && !authenticatedUser?.isAdmin) {
          if (exam.showScore === 0) {
            session.totalCorrect = null;
            session.totalWrong = null;
          }
        }

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
              session,
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
            res.json({ session, details, questions });
          };

          // Bypass SEB verification if useSeb is 0
          const useSeb = exam ? exam.useSeb : 1;
          const isSebVerified = useSeb === 0 ? true : checkSebCryptographicHash(req);

          if (isSebVerified) {
            return sendExamData();
          }

          return res.json({
            session,
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

            return res.json({ session, details, questions });
          }
        }

        // For non-exam mode sessions, require standard authentication
        requireAuth(req, res, async () => {
          const user = (req as any).user;
          if (!user.isAdmin && session.userEmail && session.userEmail !== user.email) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          const details = await db.getSessionDetails(session.id);
          res.json({ session, details });
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
          openCode: req.body.openCode || '12345'
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

        // Extract sessionToken from query (supporting ??sessionToken as well due to front-end link structure)
        const sessionToken = req.query.sessionToken || req.query['?sessionToken'];
        let startUrl = '';

        if (sessionToken) {
          const session = await db.getSessionByIdOrToken(String(sessionToken));
          if (session) {
            const exam = (await db.getExams()).find(e => e.quizTargetId === session.quizTargetId);
            if (exam) {
              // Scheduled exam: start at exam portal
              if (isLocalhost) {
                startUrl = `http://${baseHost}:8100`;
              } else {
                startUrl = `https://exam.myazuki.net`;
              }
            } else {
              // Self-practice exam: start at play page in candidate portal
              if (isLocalhost) {
                startUrl = `http://${baseHost}:5173/learning/play/${session.sessionToken || session.id}`;
              } else {
                startUrl = `https://myazuki.net/learning/play/${session.sessionToken || session.id}`;
              }
            }
          }
        }

        if (!startUrl) {
          // Default startURL fallback
          if (isLocalhost) {
            startUrl = `http://${baseHost}:8100`;
          } else {
            startUrl = `https://exam.myazuki.net`;
          }
        }

        // Replace startURL in the XML template
        const startUrlRegex = /<key>startURL<\/key>\s*<string>[^<]*<\/string>/;
        xmlContent = xmlContent.replace(
          startUrlRegex,
          `<key>startURL</key>\n    <string>${startUrl}</string>`
        );

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
