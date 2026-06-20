import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Subject, Quiz, Question, LearningSession, LearningSessionDetail, AppConfig } from '../types';
import { QuizDB } from '../db';
import { useNavigate, useLocation } from 'react-router-dom';

export type ActivePage =
  | { type: 'dashboard' }
  | { type: 'library' }
  | { type: 'subject-detail'; subjectId: number }
  | { type: 'quiz-detail'; quizId: number }
  | { type: 'learning' }
  | { type: 'learning-play'; sessionTokenOrId: string }
  | { type: 'learning-result'; sessionTokenOrId: string }
  | { type: 'learning-review'; sessionTokenOrId: string }
  | { type: 'setting' }
  | { type: 'history' }
  | { type: 'users' }
  | { type: 'login-exam' };

interface AppContextType {
  // Navigation
  activePage: ActivePage;
  navigateTo: (page: ActivePage) => void;
  breadcrumbs: { label: string; action: () => void }[];

  // Global Lists
  subjects: Subject[];
  quizzes: Quiz[];
  sessions: LearningSession[];
  config: AppConfig;

  // DB Sync functions
  loadData: () => Promise<void>;

  // Subject Actions
  createSubject: (code: string, name: string) => Promise<number>;
  updateSubject: (id: number, code: string, name: string) => Promise<void>;
  deleteSubject: (id: number) => Promise<void>;

  // Quiz Actions
  createQuiz: (name: string, subjectId: number) => Promise<number>;
  updateQuiz: (id: number, name: string, subjectId: number) => Promise<void>;
  deleteQuiz: (id: number) => Promise<void>;

  // Question Actions
  saveQuestion: (question: Omit<Question, 'id'> & { id?: number }) => Promise<number>;
  deleteQuestion: (id: number) => Promise<void>;
  getQuestionsForQuiz: (quizId: number) => Promise<Question[]>;
  getQuestionById: (id: number) => Promise<Question | null>;

  // Session Actions
  startNewSession: (quizId: number, mode: 'study' | 'practice' | 'exam', settings: { shuffleQuestions: boolean; shuffleAnswers: boolean; timeLimit?: number; subjectId?: number; questionLimit?: number }) => Promise<string>;
  updateSession: (session: LearningSession, details: LearningSessionDetail[]) => Promise<void>;
  deleteSession: (id: number) => Promise<void>;
  getSessionWithDetails: (idOrToken: string | number) => Promise<{ session: LearningSession; details: LearningSessionDetail[] } | null>;

  // Config Actions
  saveConfig: (config: AppConfig) => Promise<void>;
  resetAllData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}${path}`;
  const response = await fetch(url, {
    credentials: 'include', // Send auth cookie
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errMsg = errorData.message || errorData.error || `HTTP error! status: ${response.status}`;
    const debugStr = errorData.debug ? ` | Debug: ${JSON.stringify(errorData.debug)}` : '';
    throw new Error(`${errMsg}${debugStr}`);
  }
  return response.json();
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const getPathFromActivePage = (page: ActivePage): string => {
    switch (page.type) {
      case 'dashboard':
        return '/dashboard';
      case 'library':
        return '/library';
      case 'subject-detail':
        return `/subject/${page.subjectId}`;
      case 'quiz-detail':
        return `/quiz/${page.quizId}`;
      case 'learning':
        return '/learning';
      case 'learning-play':
        return `/learning/play/${page.sessionTokenOrId}`;
      case 'learning-result':
        return `/learning/result/${page.sessionTokenOrId}`;
      case 'learning-review':
        return `/learning/review/${page.sessionTokenOrId}`;
      case 'setting':
        return '/settings';
      case 'history':
        return '/history';
      case 'users':
        return '/users';
      case 'login-exam':
        return '/login-exam';
      default:
        return '/dashboard';
    }
  };

  const getActivePageFromPath = (path: string): ActivePage => {
    // Support query parameters for Safe Exam Browser launch integration
    const urlParams = new URLSearchParams(window.location.search);
    const queryToken = urlParams.get('sessionToken') || urlParams.get('sessionId');
    if (queryToken) {
      return { type: 'learning-play', sessionTokenOrId: queryToken };
    }

    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return { type: 'dashboard' };

    if (parts[0] === 'dashboard') return { type: 'dashboard' };
    if (parts[0] === 'library') return { type: 'library' };
    if (parts[0] === 'subject' && parts[1]) {
      return { type: 'subject-detail', subjectId: Number(parts[1]) };
    }
    if (parts[0] === 'quiz' && parts[1]) {
      return { type: 'quiz-detail', quizId: Number(parts[1]) };
    }
    if (parts[0] === 'learning') {
      if (!parts[1]) return { type: 'learning' };
      if (parts[1] === 'play' && parts[2]) {
        return { type: 'learning-play', sessionTokenOrId: parts[2] };
      }
      if (parts[1] === 'result' && parts[2]) {
        return { type: 'learning-result', sessionTokenOrId: parts[2] };
      }
      if (parts[1] === 'review' && parts[2]) {
        return { type: 'learning-review', sessionTokenOrId: parts[2] };
      }
    }
    if (parts[0] === 'settings') return { type: 'setting' };
    if (parts[0] === 'history') return { type: 'history' };
    if (parts[0] === 'users') return { type: 'users' };
    if (parts[0] === 'login-exam') return { type: 'login-exam' };

    return { type: 'dashboard' };
  };

  const [activePage, setActivePage] = useState<ActivePage>(() => getActivePageFromPath(window.location.pathname));

  useEffect(() => {
    const page = getActivePageFromPath(location.pathname);
    const currentPath = getPathFromActivePage(activePage);
    if (location.pathname !== currentPath) {
      setActivePage(page);
    }
  }, [location.pathname]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    id: 1,
    fontFamily: 'Microsoft Sans Serif',
    fontSize: 14,
    enableQuickAnswer: true,
    isMouseEnabled: true,
    keyBindings: {
      nextQuestion: ['Space', 'ArrowRight'],
      previousQuestion: ['ArrowLeft'],
      toggleQuestion: ['KeyH'],
      checkQuestion: ['Enter'],
    },
    examOpenCode: '12345'
  });

  const loadData = async () => {
    // Initialize local IndexedDB in case there's old data to migrate
    await QuizDB.init();

    // Check if we need to migrate local IndexedDB data to server SQLite DB
    let localSubjects: Subject[] = [];
    try {
      localSubjects = await QuizDB.getSubjects();
    } catch (err) {
      console.warn('No local IndexedDB found or failed to read:', err);
    }

    let serverSubjects: Subject[] = [];
    try {
      serverSubjects = await apiCall<Subject[]>('/subjects');
    } catch (err) {
      console.error('Failed to fetch subjects from server:', err);
    }

    if (localSubjects.length > 0 && serverSubjects.length === 0) {
      console.log('Local IndexedDB data detected but Server database is empty. Starting migration...');
      try {
        const subjectIdMap = new Map<number, number>();
        const quizIdMap = new Map<number, number>();
        const questionIdMap = new Map<number, number>();

        // 1. Migrate subjects
        for (const subj of localSubjects) {
          const { id: newSubjectId } = await apiCall<{ id: number }>('/subjects', {
            method: 'POST',
            body: JSON.stringify({ code: subj.code, name: subj.name }),
          });
          subjectIdMap.set(subj.id, newSubjectId);
        }

        // 2. Migrate quizzes & questions
        for (const localSubj of localSubjects) {
          const newSubjId = subjectIdMap.get(localSubj.id)!;
          const localQuizzes = await QuizDB.getQuizzesBySubject(localSubj.id);
          for (const qz of localQuizzes) {
            const { id: newQuizId } = await apiCall<{ id: number }>('/quizzes', {
              method: 'POST',
              body: JSON.stringify({ name: qz.name, subjectTargetId: newSubjId }),
            });
            quizIdMap.set(qz.id, newQuizId);

            const localQuestions = await QuizDB.getQuestionsByQuiz(qz.id);
            for (const q of localQuestions) {
              const answersList = (q.answersList || []).map(a => ({
                content: a.content,
                isCorrect: a.isCorrect,
                indexOrder: a.indexOrder,
              }));
              const { id: newQuestionId } = await apiCall<{ id: number }>('/questions', {
                method: 'POST',
                body: JSON.stringify({
                  content: q.content,
                  explanation: q.explanation,
                  quizTargetId: newQuizId,
                  answersList,
                }),
              });
              questionIdMap.set(q.id, newQuestionId);
            }
          }
        }

        // 3. Migrate config
        const localConfig = await QuizDB.getConfig();
        if (localConfig) {
          await apiCall('/config', {
            method: 'POST',
            body: JSON.stringify(localConfig),
          });
        }

        // 4. Migrate sessions & details
        const localSessions = await QuizDB.getSessions();
        for (const ssn of localSessions) {
          let mappedQuizTargetId = ssn.quizTargetId;
          if (ssn.quizTargetId < 0) {
            const oldSubjectId = -ssn.quizTargetId;
            const newSubjectId = subjectIdMap.get(oldSubjectId);
            if (newSubjectId !== undefined) {
              mappedQuizTargetId = -newSubjectId;
            }
          } else {
            const newQuizId = quizIdMap.get(ssn.quizTargetId);
            if (newQuizId !== undefined) {
              mappedQuizTargetId = newQuizId;
            }
          }

          const { id: newSessionId } = await apiCall<{ id: number }>('/sessions', {
            method: 'POST',
            body: JSON.stringify({
              quizTargetId: mappedQuizTargetId,
              learningMode: ssn.learningMode,
              startTime: ssn.startTime,
              recentLearningDateTime: ssn.recentLearningDateTime,
              shuffleQuestions: ssn.shuffleQuestions,
              shuffleAnswers: ssn.shuffleAnswers,
              currentIndex: ssn.currentIndex,
              studyTime: ssn.studyTime,
              timeLimit: ssn.timeLimit,
              isCompleted: ssn.isCompleted,
              endTime: ssn.endTime,
              totalCorrect: ssn.totalCorrect,
              totalWrong: ssn.totalWrong,
            }),
          });

          const localDetails = await QuizDB.getSessionDetails(ssn.id);
          const mappedDetails = localDetails.map(d => {
            const newQuestionId = questionIdMap.get(d.questionTargetId);
            return {
              learningSessionId: newSessionId,
              questionTargetId: newQuestionId || d.questionTargetId,
              isChecked: d.isChecked,
              isSeen: d.isSeen,
              isCorrect: d.isCorrect,
              selectedAnswersList: d.selectedAnswersList,
            };
          });

          if (mappedDetails.length > 0) {
            await apiCall(`/sessions/${newSessionId}`, {
              method: 'PUT',
              body: JSON.stringify({
                session: {
                  id: newSessionId,
                  quizTargetId: mappedQuizTargetId,
                  learningMode: ssn.learningMode,
                  startTime: ssn.startTime,
                  recentLearningDateTime: ssn.recentLearningDateTime,
                  shuffleQuestions: ssn.shuffleQuestions,
                  shuffleAnswers: ssn.shuffleAnswers,
                  currentIndex: ssn.currentIndex,
                  studyTime: ssn.studyTime,
                  timeLimit: ssn.timeLimit,
                  isCompleted: ssn.isCompleted,
                  endTime: ssn.endTime,
                  totalCorrect: ssn.totalCorrect,
                  totalWrong: ssn.totalWrong,
                },
                details: mappedDetails,
              }),
            });
          }
        }

        console.log('Migration completed successfully. Wiping local IndexedDB...');
        await QuizDB.wipeDatabase();
      } catch (migrationError) {
        console.error('Migration failed:', migrationError);
      }
    }

    // Load data from Server
    try {
      const subjs = await apiCall<Subject[]>('/subjects');
      const ssns = await apiCall<LearningSession[]>('/sessions');
      const cfg = await apiCall<AppConfig>('/config');

      setSubjects(subjs);

      const quizzesResults = await Promise.all(
        subjs.map(s => apiCall<Quiz[]>(`/subjects/${s.id}/quizzes`))
      );
      const allQuizzes = quizzesResults.flat();
      setQuizzes(allQuizzes);
      setSessions(ssns);
      setConfig(cfg);

      // Apply config styling variables
      document.documentElement.style.setProperty('--font-family', `"${cfg.fontFamily}", 'Segoe UI', Arial, sans-serif`);
      document.documentElement.style.setProperty('--font-size-base', `${cfg.fontSize}px`);
    } catch (loadError) {
      console.error('Failed to load data from server:', loadError);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const navigateTo = (page: ActivePage) => {
    setActivePage(page);
    const path = getPathFromActivePage(page);
    if (location.pathname !== path) {
      navigate(path);
    }
  };

  // Generate breadcrumbs dynamically based on activePage
  const [breadcrumbs, setBreadcrumbs] = useState<{ label: string; action: () => void }[]>([]);

  useEffect(() => {
    const list: { label: string; action: () => void }[] = [{ label: 'Trang chủ', action: () => navigateTo({ type: 'dashboard' }) }];

    if (activePage.type === 'library') {
      list.push({ label: 'Thư viện môn học', action: () => { } });
    } else if (activePage.type === 'subject-detail') {
      const subj = subjects.find(s => s.id === activePage.subjectId);
      list.push({ label: 'Thư viện môn học', action: () => navigateTo({ type: 'library' }) });
      list.push({ label: subj ? `${subj.code} - ${subj.name}` : 'Môn học', action: () => { } });
    } else if (activePage.type === 'quiz-detail') {
      const qz = quizzes.find(q => q.id === activePage.quizId);
      const subj = qz ? subjects.find(s => s.id === qz.subjectTargetId) : null;
      list.push({ label: 'Thư viện môn học', action: () => navigateTo({ type: 'library' }) });
      if (subj) {
        list.push({ label: `${subj.code} - ${subj.name}`, action: () => navigateTo({ type: 'subject-detail', subjectId: subj.id }) });
      }
      list.push({ label: qz ? qz.name : 'Bộ đề', action: () => { } });
    } else if (activePage.type === 'learning') {
      list.push({ label: 'Học tập & Luyện đề', action: () => { } });
    } else if (activePage.type === 'learning-play') {
      const ssn = sessions.find(s => s.sessionToken === activePage.sessionTokenOrId || String(s.id) === activePage.sessionTokenOrId);
      const qz = ssn ? quizzes.find(q => q.id === ssn.quizTargetId) : null;
      const isSubjectWide = ssn && ssn.quizTargetId < 0;
      const subject = isSubjectWide ? subjects.find(s => s.id === -ssn.quizTargetId) : null;
      const labelText = isSubjectWide
        ? `${ssn.learningMode === 'study' ? 'Học tập' : 'Luyện tập'} - ${subject?.code || ''} (Tất cả)`
        : (qz ? `${ssn?.learningMode === 'study' ? 'Học tập' : ssn?.learningMode === 'practice' ? 'Luyện tập' : 'Thi cử'} - ${qz.name}` : 'Phiên học');
      list.push({ label: 'Học tập & Luyện đề', action: () => navigateTo({ type: 'learning' }) });
      list.push({ label: labelText, action: () => { } });
    } else if (activePage.type === 'learning-result') {
      list.push({ label: 'Học tập & Luyện đề', action: () => navigateTo({ type: 'learning' }) });
      list.push({ label: 'Kết quả học tập', action: () => { } });
    } else if (activePage.type === 'learning-review') {
      list.push({ label: 'Học tập & Luyện đề', action: () => navigateTo({ type: 'learning' }) });
      list.push({ label: 'Chi tiết bài làm', action: () => { } });
    } else if (activePage.type === 'setting') {
      list.push({ label: 'Cài đặt ứng dụng', action: () => { } });
    } else if (activePage.type === 'history') {
      list.push({ label: 'Lịch sử thi cử', action: () => { } });
    } else if (activePage.type === 'users') {
      list.push({ label: 'Quản lý Người dùng', action: () => { } });
    }

    setBreadcrumbs(list);
  }, [activePage, subjects, quizzes, sessions]);

  // --- CRUD ACTIONS ---
  const createSubject = async (code: string, name: string) => {
    const { id } = await apiCall<{ id: number }>('/subjects', {
      method: 'POST',
      body: JSON.stringify({ code, name }),
    });
    await loadData();
    return id;
  };

  const deleteSubject = async (id: number) => {
    await apiCall(`/subjects/${id}`, {
      method: 'DELETE',
    });
    await loadData();
  };

  const updateSubject = async (id: number, code: string, name: string) => {
    await apiCall('/subjects', {
      method: 'POST',
      body: JSON.stringify({ id, code, name }),
    });
    await loadData();
  };

  const createQuiz = async (name: string, subjectId: number) => {
    const { id } = await apiCall<{ id: number }>('/quizzes', {
      method: 'POST',
      body: JSON.stringify({ name, subjectTargetId: subjectId }),
    });
    await loadData();
    return id;
  };

  const updateQuiz = async (id: number, name: string, subjectId: number) => {
    await apiCall('/quizzes', {
      method: 'POST',
      body: JSON.stringify({ id, name, subjectTargetId: subjectId }),
    });
    await loadData();
  };

  const deleteQuiz = async (id: number) => {
    await apiCall(`/quizzes/${id}`, {
      method: 'DELETE',
    });
    await loadData();
  };

  const saveQuestion = async (question: Omit<Question, 'id'> & { id?: number }) => {
    const { id } = await apiCall<{ id: number }>('/questions', {
      method: 'POST',
      body: JSON.stringify(question),
    });
    return id;
  };

  const deleteQuestion = async (id: number) => {
    await apiCall(`/questions/${id}`, {
      method: 'DELETE',
    });
  };

  const getQuestionsForQuiz = async (quizId: number) => {
    return apiCall<Question[]>(`/quizzes/${quizId}/questions`);
  };

  const getQuestionById = async (id: number): Promise<Question | null> => {
    try {
      return await apiCall<Question>(`/questions/${id}`);
    } catch {
      return null;
    }
  };

  // --- LEARNING SESSIONS ---
  const startNewSession = async (
    quizId: number,
    mode: 'study' | 'practice' | 'exam',
    settings: { shuffleQuestions: boolean; shuffleAnswers: boolean; timeLimit?: number; subjectId?: number; questionLimit?: number }
  ) => {
    // 1. Load questions
    let questions: Question[] = [];
    if ((mode === 'study' || mode === 'practice') && settings.subjectId) {
      const subjectQuizzes = await apiCall<Quiz[]>(`/subjects/${settings.subjectId}/quizzes`);
      for (const qz of subjectQuizzes) {
        const qzQuestions = await apiCall<Question[]>(`/quizzes/${qz.id}/questions`);
        questions.push(...qzQuestions);
      }
    } else {
      questions = await apiCall<Question[]>(`/quizzes/${quizId}/questions`);
    }

    if (mode === 'study') {
      const originalCount = questions.length;
      questions = questions.filter(q => {
        const progress = localStorage.getItem(`study_progress_${q.id}`);
        return progress !== '2';
      });
      if (originalCount > 0 && questions.length === 0) {
        throw new Error('Bạn đã nắm vững (Đã biết) toàn bộ câu hỏi trong bộ đề này rồi!');
      }
    }

    if (questions.length === 0) {
      throw new Error(
        mode === 'exam'
          ? 'Bộ đề không có câu hỏi nào để thi.'
          : 'Môn học chưa có câu hỏi nào để học/luyện tập.'
      );
    }

    // Shuffle questions if config enabled OR if it is exam mode (always shuffled)
    if (settings.shuffleQuestions || mode === 'exam') {
      questions = [...questions].sort(() => Math.random() - 0.5);
    }

    // Apply question limit (especially for Exam mode)
    if (mode === 'exam' && settings.questionLimit && settings.questionLimit > 0) {
      questions = questions.slice(0, settings.questionLimit);
    }

    // 2. Create session record
    const finalQuizId = (mode === 'study' || mode === 'practice') && settings.subjectId ? -settings.subjectId : quizId;

    const session: Omit<LearningSession, 'id'> = {
      quizTargetId: finalQuizId,
      learningMode: mode,
      startTime: new Date().toISOString(),
      recentLearningDateTime: new Date().toISOString(),
      shuffleQuestions: settings.shuffleQuestions || mode === 'exam',
      shuffleAnswers: false,
      currentIndex: 0,
      studyTime: 0,
      timeLimit: settings.timeLimit,
      isCompleted: false,
      totalCorrect: 0,
      totalWrong: 0,
      identifyingId: Math.floor(10000 + Math.random() * 90000),
    };

    const { id: sessionId, sessionToken } = await apiCall<{ id: number; sessionToken: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify(session),
    });

    // 3. Create session details
    const detailsList = questions.map((q, idx) => {
      const detail: Omit<LearningSessionDetail, 'id'> = {
        learningSessionId: sessionId,
        questionTargetId: q.id,
        isChecked: false,
        isSeen: idx === 0, // First question is seen initially
        isCorrect: null,
        selectedAnswersList: [],
      };
      return detail as LearningSessionDetail;
    });

    await apiCall(`/sessions/${sessionToken || sessionId}`, {
      method: 'PUT',
      body: JSON.stringify({
        session: { ...session, id: sessionId, sessionToken },
        details: detailsList,
      }),
    });
    await loadData();
    return sessionToken || String(sessionId);
  };

  const updateSession = async (session: LearningSession, details: LearningSessionDetail[]) => {
    const detailsToSave = details.map(d => ({
      ...d,
      id: d.id < 0 ? 0 : d.id
    }));
    await apiCall(`/sessions/${session.sessionToken || session.id}`, {
      method: 'PUT',
      body: JSON.stringify({ session, details: detailsToSave }),
    });
    setSessions(prev => prev.map(s => s.id === session.id ? session : s));
  };

  const deleteSession = async (id: number) => {
    await apiCall(`/sessions/${id}`, {
      method: 'DELETE',
    });
    await loadData();
  };

  const getSessionWithDetails = async (idOrToken: string | number) => {
    return apiCall<{ session: LearningSession; details: LearningSessionDetail[] }>(`/sessions/${idOrToken}`);
  };

  // --- CONFIG ACTIONS ---
  const saveConfig = async (newConfig: AppConfig) => {
    await apiCall('/config', {
      method: 'POST',
      body: JSON.stringify(newConfig),
    });
    setConfig(newConfig);

    // Apply styling variables dynamically
    document.documentElement.style.setProperty('--font-family', `"${newConfig.fontFamily}", 'Segoe UI', Arial, sans-serif`);
    document.documentElement.style.setProperty('--font-size-base', `${newConfig.fontSize}px`);
  };

  const resetAllData = async () => {
    await apiCall('/reset', {
      method: 'POST',
    });
    await loadData();
  };

  return (
    <AppContext.Provider value={{
      activePage,
      navigateTo,
      breadcrumbs,
      subjects,
      quizzes,
      sessions,
      config,
      loadData,
      createSubject,
      updateSubject,
      deleteSubject,
      createQuiz,
      updateQuiz,
      deleteQuiz,
      saveQuestion,
      deleteQuestion,
      getQuestionsForQuiz,
      getQuestionById,
      startNewSession,
      updateSession,
      deleteSession,
      getSessionWithDetails,
      saveConfig,
      resetAllData
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
