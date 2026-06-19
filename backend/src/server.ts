import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import * as db from './db.js';
import authRouter, { requireAuth, requireAdmin, getAuthenticatedUser } from './auth.js';
import { verifySafeExamBrowser } from './middleware/seb.js';

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
        const list = await db.getQuizzesBySubject(Number(req.params.subjectId));
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
        const list = await db.getSessions(emailFilter);
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

          const userAgent = (req.headers['user-agent'] || '').toLowerCase();
          const hasSebHeader = !!req.headers['x-safeexambrowser-requesthash'] || 
                               !!req.headers['x-safeexambrowser-configkeyhash'];
          const isSebAgent = userAgent.includes('safeexambrowser') || userAgent.includes('seb/');
          const isSeb = isSebAgent || hasSebHeader;

          if (isSeb) {
            return sendExamData();
          }

          return res.json({
            session,
            requireSeb: true,
            message: 'Bạn bắt buộc phải sử dụng Safe Exam Browser để truy cập bài thi này.'
          });
        }

        // If it's a completed exam mode session, allow public access if queried by sessionToken (string ID)
        if (session.learningMode === 'exam' && session.isCompleted) {
          const isQueriedByToken = typeof idOrToken === 'string' && isNaN(Number(idOrToken));
          if (isQueriedByToken) {
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
          userMssv: user.mssv
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

        const handleSave = async (userEmail?: string, userName?: string, userMssv?: string) => {
          const sessionToSave = {
            ...session,
            id: targetSession.id,
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
        const sessionToken = req.query.sessionToken || req.query.sessionId;
        // Construct exam start URL dynamically based on requesting host
        let examStartUrl = '';

        if (host.includes('e-learning.myazuki.net') || host.includes('seb.myazuki.net') || host.includes('exam.myazuki.net')) {
          examStartUrl = 'https://seb.myazuki.net';
        } else if (host.includes('localhost') || host.includes('127.0.0.1')) {
          const portIndex = host.indexOf(':');
          const baseHost = portIndex !== -1 ? host.substring(0, portIndex) : host;
          examStartUrl = `http://${baseHost}:8100`;
        } else {
          // Fallback parsing for other custom domains
          const parts = host.split('.');
          if (parts.length > 2) {
            parts[0] = 'seb';
            examStartUrl = `https://${parts.join('.')}`;
          } else {
            examStartUrl = `https://seb.${host}`;
          }
        }

        if (sessionToken) {
          examStartUrl += `?sessionToken=${sessionToken}`;
        }

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const configPath = path.join(__dirname, '..', 'resources', 'exam_config.seb');

        if (!fs.existsSync(configPath)) {
          return res.status(404).json({ error: 'SEB config template not found' });
        }

        let xmlContent = fs.readFileSync(configPath, 'utf8');

        // Dynamically replace the startURL inside the XML template
        const startUrlRegex = /<key>startURL<\/key>\s*<string>[^<]*<\/string>/;
        xmlContent = xmlContent.replace(
          startUrlRegex,
          `<key>startURL</key>\n    <string>${examStartUrl}</string>`
        );

        res.setHeader('Content-Type', 'application/x-safeexambrowser');
        res.setHeader('Content-Disposition', 'attachment; filename="exam_config.seb"');
        res.send(xmlContent);
      } catch (err: any) {
        console.error('Error generating dynamic SEB config:', err);
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
