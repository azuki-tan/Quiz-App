import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import type { LearningSession, LearningSessionDetail, Question, Answer } from '../types';
import confetti from 'canvas-confetti';
import { cleanHtmlExplanation } from '../utils/html';

const INITIAL_LOAD = 10;
const LAZY_BATCH = 15;
const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';

const MathHtml = React.memo(({ html, className, style, tag: Tag = 'div' }: { html: string; className?: string; style?: React.CSSProperties; tag?: 'div' | 'span' }) => {
  useEffect(() => {
    if ((window as any).MathJax) {
      (window as any).MathJax.typesetPromise?.().catch((e: any) => console.error(e));
    }
  });

  return (
    <Tag 
      className={`tex2jax_process ${className || ''}`} 
      style={style} 
      dangerouslySetInnerHTML={{ __html: cleanHtmlExplanation(html) }} 
    />
  );
}, (prev, next) => prev.html === next.html && prev.className === next.className && prev.tag === next.tag && JSON.stringify(prev.style) === JSON.stringify(next.style));

interface LearningPlayPageProps {
  sessionId: string;
}

export const LearningPlayPage: React.FC<LearningPlayPageProps> = ({ sessionId }) => {
  const { navigateTo, config, updateSession: rawUpdateSession, getSessionWithDetails, getQuestionsForQuiz } = useApp();
  const { currentUser } = useAuth();
  const [session, setSession] = useState<LearningSession | null>(null);
  const [details, setDetails] = useState<LearningSessionDetail[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [shuffledAnswersMap, setShuffledAnswersMap] = useState<Record<number, Answer[]>>({});
  const allQuestionIdsRef = useRef<number[]>([]);
  const fullQuestionsMapRef = useRef<Map<number, Question>>(new Map());
  const [loadedCount, setLoadedCount] = useState(INITIAL_LOAD);
  const isSubmittingRef = useRef(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Practice state
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showExplanationPopup, setShowExplanationPopup] = useState(false);

  // Exam blocking & start states
  const [isBlocked, setIsBlocked] = useState(false);
  const [isExamStarted, setIsExamStarted] = useState(false);
  const [openCodeInput, setOpenCodeInput] = useState('');
  const [openCodeError, setOpenCodeError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [requireSeb, setRequireSeb] = useState(false);


  const examCodeName = React.useMemo(() => {
    if (!session) return 'TEST_M';
    if (session.quizTargetId < 0) {
      return session.subjectCode ? `${session.subjectCode}_All` : (session.subjectName || 'TEST_M');
    }
    return session.quizName || 'TEST_M';
  }, [session]);

  // Latest state ref for auto-save interval
  const latestStateRef = useRef<{ session: LearningSession | null; currentIndex: number; details: LearningSessionDetail[] }>({
    session: null,
    currentIndex: 0,
    details: []
  });

  const updateSession = useCallback(async (s: LearningSession, d: LearningSessionDetail[]) => {
    try {
      await rawUpdateSession(s, d);
      setIsOnline(true);
    } catch (e) {
      console.warn('Network issue or save failed:', e);
      setIsOnline(false);
      throw e;
    }
  }, [rawUpdateSession]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const { session: currentS, currentIndex: currentIdx, details: currentD } = latestStateRef.current;
      if (currentS && !currentS.isCompleted && currentS.learningMode === 'exam') {
        const sessionToSave = {
          ...currentS,
          currentIndex: currentIdx,
          studyTime: studyTimeCounter.current
        };
        const detailsToSave = currentD.map(d => ({
          ...d,
          id: d.id < 0 ? 0 : d.id
        }));
        rawUpdateSession(sessionToSave, detailsToSave)
          .then(() => console.log('Reconnected: successfully synced session progress to server'))
          .catch(e => {
            console.warn('Failed to sync on reconnect:', e);
            setIsOnline(false);
          });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [rawUpdateSession]);

  useEffect(() => {
    setIsFlipped(false);
    setShowExplanationPopup(false);
  }, [currentIndex]);

  // Trigger MathJax typeset on card flip, question change, or explanation toggle
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((window as any).MathJax) {
        (window as any).MathJax.typesetPromise?.().catch((e: any) => console.error(e));
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [currentIndex, showExplanation, isFlipped, showExplanationPopup]);
  const [isFinishChecked, setIsFinishChecked] = useState(false);
  const [localFontSize, setLocalFontSize] = useState(config.fontSize);
  const [localFontFamily, setLocalFontFamily] = useState(config.fontFamily);

  // Timer reference
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<any>(null);
  const studyTimerRef = useRef<any>(null);
  const studyTimeCounter = useRef(0);


  // Keep latestStateRef up-to-date
  useEffect(() => {
    latestStateRef.current = { session, currentIndex, details };
  }, [session, currentIndex, details]);

  // Auto-save progress when component unmounts or page reloads/closes
  useEffect(() => {
    if (requireSeb) return;

    const saveProgressSync = () => {
      if (isSubmittingRef.current) return;
      const { session: s, currentIndex: currentIdx, details: currentD } = latestStateRef.current;
      if (!s || s.isCompleted) return;

      const sessionToSave = {
        ...s,
        currentIndex: currentIdx,
        studyTime: studyTimeCounter.current
      };
      const detailsToSave = currentD.map(d => ({
        ...d,
        id: d.id < 0 ? 0 : d.id
      }));

      const payload = JSON.stringify({ session: sessionToSave, details: detailsToSave });
      const url = `${API_URL}/sessions/${s.id}`;

      fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(e => console.warn('Unload save failed:', e));
    };

    const handleBeforeUnload = () => {
      saveProgressSync();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveProgressSync();
    };
  }, [requireSeb]);

  const loadSession = async () => {
    setLoading(true);
    setErrorDetails(null);
    try {
      const data = await getSessionWithDetails(sessionId);
      if (!data) {
        setErrorDetails('Không thể tải dữ liệu phiên thi (dữ liệu rỗng).');
        return;
      }

      const { session: s, details: d, requireSeb: reqSeb, isIpBlocked } = data as any;

      if (reqSeb) {
        setSession(s);
        setRequireSeb(true);
        setLoading(false);
        return;
      }

      // Redirect completed exams
      if (s.learningMode === 'exam' && s.isCompleted) {
        navigateTo({ type: 'learning-result', sessionTokenOrId: s.sessionToken || String(s.id) });
        return;
      }

      // Check Lock Token
      if (s.learningMode === 'exam') {
        if (isIpBlocked) {
          setIsBlocked(true);
          setLoading(false);
          return;
        }

        // Check isExamStarted
        if (s.isCompleted) {
          setIsExamStarted(true);
        } else {
          const started = localStorage.getItem(`exam_started_${s.id}`) === 'true';
          setIsExamStarted(started);
        }
      }

      setSession(s);
      setDetails(d);
      setCurrentIndex(s.currentIndex);
      studyTimeCounter.current = s.studyTime;

      // Auto-fill openCodeInput for self-practice exams
      if (s.learningMode === 'exam' && !s.isScheduledExam) {
        setOpenCodeInput('123');
      }

      // Store all question IDs in order (from session details)
      const qIds = (d as LearningSessionDetail[]).map((x: LearningSessionDetail) => x.questionTargetId);
      allQuestionIdsRef.current = qIds;

      // Load only first INITIAL_LOAD + currentIndex questions for fast start
      const startIdx = s.currentIndex;
      const endIdx = Math.min(Math.max(startIdx + INITIAL_LOAD, INITIAL_LOAD), qIds.length);
      const initialIds = qIds.slice(0, endIdx);

      let allAvailableQuestions: Question[] = [];
      if ((data as any).questions && Array.isArray((data as any).questions)) {
        allAvailableQuestions = (data as any).questions;
      } else if (s.quizTargetId < 0) {
        const subjectId = -s.quizTargetId;
        // Fetch quizzes directly from server to avoid empty lists during page refresh/direct loads
        const response = await fetch(`${API_URL}/subjects/${subjectId}/quizzes`, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`Failed to fetch quizzes for subject ${subjectId}`);
        }
        const subjectQuizzes = await response.json();
        const questionsResults = await Promise.all(subjectQuizzes.map((q: any) => getQuestionsForQuiz(q.id)));
        allAvailableQuestions = questionsResults.flat();
      } else {
        allAvailableQuestions = await getQuestionsForQuiz(s.quizTargetId);
      }

      // Store full map for later lazy loads
      const fullMap = new Map(allAvailableQuestions.map(q => [q.id, q]));
      fullQuestionsMapRef.current = fullMap;

      // Load initial batch
      const initialQuestions = (initialIds as number[]).map((qId: number) => fullMap.get(qId)).filter(Boolean) as Question[];
      setQuestions(initialQuestions);
      setLoadedCount(endIdx);

      // Create sorted answers map for initial batch (no shuffling!)
      const map: Record<number, Answer[]> = {};
      initialQuestions.forEach(q => {
        const ans = [...(q.answersList || [])].sort((a, b) => a.indexOrder - b.indexOrder);
        map[q.id] = ans;
      });
      setShuffledAnswersMap(map);

      // Initialize Exam Timer
      if (s.learningMode === 'exam' && s.timeLimit && !s.isCompleted) {
        // Only calculate elapsed since startTime if it was already started
        const hasStarted = localStorage.getItem(`exam_started_${s.id}`) === 'true';
        if (hasStarted) {
          const elapsed = Math.round((new Date().getTime() - new Date(s.startTime).getTime()) / 1000);
          const remaining = Math.max(s.timeLimit - elapsed, 0);
          setTimeLeft(remaining);
        } else {
          setTimeLeft(s.timeLimit);
        }
      }
    } catch (e: any) {
      console.error(e);
      setErrorDetails(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // Load more questions lazily when approaching the end of loaded batch
  const loadMoreIfNeeded = useCallback((nextIndex: number) => {
    const allIds = allQuestionIdsRef.current;
    if (nextIndex >= loadedCount - 3 && loadedCount < allIds.length) {
      const newEnd = Math.min(loadedCount + LAZY_BATCH, allIds.length);
      const newIds = allIds.slice(loadedCount, newEnd);
      const fullMap = fullQuestionsMapRef.current;
      const newQuestions = newIds.map(id => fullMap.get(id)).filter(Boolean) as Question[];

      setQuestions(prev => {
        const existingIds = new Set(prev.map(q => q.id));
        const toAdd = newQuestions.filter(q => !existingIds.has(q.id));
        return [...prev, ...toAdd];
      });

      setShuffledAnswersMap(prev => {
        const newMap = { ...prev };
        newQuestions.forEach(q => {
          if (!newMap[q.id]) {
            const ans = [...(q.answersList || [])].sort((a, b) => a.indexOrder - b.indexOrder);
            newMap[q.id] = ans;
          }
        });
        return newMap;
      });

      setLoadedCount(newEnd);
    }
  }, [loadedCount]);

  useEffect(() => {
    loadSession();
    return () => {
      // Clear timers on unmount
      if (timerRef.current) clearInterval(timerRef.current);
      if (studyTimerRef.current) clearInterval(studyTimerRef.current);
    };
  }, [sessionId]);

  // Automatically trigger lazy loading of questions whenever the index changes
  useEffect(() => {
    if (session) {
      loadMoreIfNeeded(currentIndex);
    }
  }, [currentIndex, session, loadMoreIfNeeded]);

  // Handle study time tracking (tick study time every second)
  useEffect(() => {
    if (session && !session.isCompleted) {
      const shouldTrack = session.learningMode !== 'exam' || isExamStarted;
      if (shouldTrack) {
        studyTimerRef.current = setInterval(() => {
          studyTimeCounter.current += 1;
        }, 1000);
      }
    }
    return () => {
      if (studyTimerRef.current) clearInterval(studyTimerRef.current);
    };
  }, [session, isExamStarted]);

  // Handle Exam Countdown Timer
  useEffect(() => {
    if (session && session.learningMode === 'exam' && timeLeft !== null && !session.isCompleted && isExamStarted) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleExamSubmit(true); // Auto submit on timeout
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session, timeLeft, isExamStarted]);

  // Auto-save exam progress every 10 minutes
  useEffect(() => {
    if (requireSeb) return;
    if (!session || session.isCompleted || session.learningMode !== 'exam') return;

    const interval = setInterval(() => {
      const { session: currentS, currentIndex: currentIdx, details: currentD } = latestStateRef.current;
      if (!currentS || currentS.isCompleted) return;

      const sessionToSave = {
        ...currentS,
        currentIndex: currentIdx,
        studyTime: studyTimeCounter.current
      };
      const detailsToSave = currentD.map(d => ({
        ...d,
        id: d.id < 0 ? 0 : d.id
      }));

      updateSession(sessionToSave, detailsToSave)
        .then(() => console.log('Auto-saved exam progress to server (10 mins)'))
        .catch(e => console.error('Auto-save failed:', e));
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(interval);
  }, [session?.id, session?.learningMode, session?.isCompleted, updateSession, requireSeb]);

  // Current Question elements
  const currentDetail = details[currentIndex];
  const currentQuestion = currentDetail ? questions.find(q => q.id === currentDetail.questionTargetId) : null;
  const currentAnswers = currentQuestion ? (shuffledAnswersMap[currentQuestion.id] || []) : [];

  const handleStillLearning = async () => {
    if (!session || !currentDetail) return;
    const currentQId = currentDetail.questionTargetId;

    // 1. Save progress as '0' in localStorage (specifically for this session and question)
    localStorage.setItem(`study_progress_${session.id}_${currentQId}`, '0');

    // 2. Clone the current detail
    const clonedDetail: LearningSessionDetail = {
      ...currentDetail,
      id: -Math.floor(Math.random() * 1000000000), // unique temporary negative ID
      isChecked: false,
      isCorrect: null,
      selectedAnswersList: [],
      isSeen: false,
    };

    // 3. Find reinforcement position (closer recurrence)
    const remainingCount = details.length - (currentIndex + 1);
    let insertIndex = details.length; // default to the end

    if (remainingCount >= 3) {
      insertIndex = currentIndex + 3;
    } else if (remainingCount === 2) {
      insertIndex = currentIndex + 2;
    } else {
      insertIndex = details.length;
    }

    // 4. Update details array
    const updatedDetails = [...details];
    updatedDetails.splice(insertIndex, 0, clonedDetail);

    // Update allQuestionIdsRef
    const updatedQIds = [...allQuestionIdsRef.current];
    updatedQIds.splice(insertIndex, 0, currentQId);
    allQuestionIdsRef.current = updatedQIds;

    // Update current detail in the list to be marked as checked and wrong
    const finalDetails = updatedDetails.map((d, idx) => {
      if (idx === currentIndex) {
        return { ...d, isChecked: true, isCorrect: false };
      }
      return d;
    });

    // 5. Navigate to the next question
    const nextIndex = currentIndex + 1;
    if (nextIndex < finalDetails.length) {
      finalDetails[nextIndex].isSeen = true;
      setDetails(finalDetails);
      setCurrentIndex(nextIndex);
      setIsFlipped(false);
      setShowExplanationPopup(false);

      // Save session state to server
      const updatedSession: LearningSession = {
        ...session,
        currentIndex: nextIndex,
        studyTime: studyTimeCounter.current
      };
      await updateSession(updatedSession, finalDetails);
    } else {
      // Reached the end
      setDetails(finalDetails);
      const updatedSession: LearningSession = {
        ...session,
        studyTime: studyTimeCounter.current
      };
      await updateSession(updatedSession, finalDetails);
      handlePracticeSubmit();
    }
  };

  const handleKnown = async () => {
    if (!session || !currentDetail) return;
    const currentQId = currentDetail.questionTargetId;

    // Read current progress from localStorage
    const currentProgress = localStorage.getItem(`study_progress_${session.id}_${currentQId}`);
    let newProgress = '2'; // default: mastered immediately if not failed before
    let shouldReinforce = false;

    if (currentProgress === '0') {
      newProgress = '1';
      shouldReinforce = true;
    } else if (currentProgress === '1') {
      newProgress = '2';
      shouldReinforce = false;
    }
    localStorage.setItem(`study_progress_${session.id}_${currentQId}`, newProgress);

    // Mark current detail as seen/checked/correct
    const updatedDetails = [...details];
    updatedDetails[currentIndex].isChecked = true;
    updatedDetails[currentIndex].isCorrect = true;
    updatedDetails[currentIndex].isSeen = true;

    if (shouldReinforce) {
      // Clone the current detail for spaced recall check
      const clonedDetail: LearningSessionDetail = {
        ...currentDetail,
        id: -Math.floor(Math.random() * 1000000000), // unique temporary negative ID
        isChecked: false,
        isCorrect: null,
        selectedAnswersList: [],
        isSeen: false,
      };

      // Spaced recurrence position (longer gap)
      const remainingCount = updatedDetails.length - (currentIndex + 1);
      let insertIndex = updatedDetails.length;

      if (remainingCount >= 6) {
        insertIndex = currentIndex + 6;
      } else {
        insertIndex = updatedDetails.length;
      }

      updatedDetails.splice(insertIndex, 0, clonedDetail);

      const updatedQIds = [...allQuestionIdsRef.current];
      updatedQIds.splice(insertIndex, 0, currentQId);
      allQuestionIdsRef.current = updatedQIds;
    }

    // Navigate to the next question
    const nextIndex = currentIndex + 1;
    if (nextIndex < updatedDetails.length) {
      updatedDetails[nextIndex].isSeen = true;
      setDetails(updatedDetails);
      setCurrentIndex(nextIndex);
      setIsFlipped(false);
      setShowExplanationPopup(false);

      // Save session state to server
      const updatedSession: LearningSession = {
        ...session,
        currentIndex: nextIndex,
        studyTime: studyTimeCounter.current
      };
      await updateSession(updatedSession, updatedDetails);
    } else {
      // Reached the end
      setDetails(updatedDetails);
      const updatedSession: LearningSession = {
        ...session,
        studyTime: studyTimeCounter.current
      };
      await updateSession(updatedSession, updatedDetails);
      handlePracticeSubmit();
    }
  };
  // Format time (seconds to MM:SS)
  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Evaluate current answer for Practice Mode (including smart recall cloning)
  const evaluateAnswer = async (updatedDetailsList: LearningSessionDetail[]) => {
    if (!session || !currentQuestion) return;

    const detail = updatedDetailsList[currentIndex];
    const correctIds = currentQuestion.answersList?.filter(a => a.isCorrect).map(a => Number(a.id)) || [];
    const selectedIds = detail.selectedAnswersList ? detail.selectedAnswersList.map(Number) : [];

    const isCorrect = correctIds.length === selectedIds.length &&
      correctIds.every(id => selectedIds.includes(id));

    detail.isChecked = true;
    detail.isCorrect = isCorrect;

    // Apply smart recall mechanism like study mode
    const currentQId = detail.questionTargetId;
    const progressKey = `practice_progress_${session.id}_${currentQId}`;

    if (!isCorrect) {
      // Save progress as '0' in localStorage (specifically for this session and question)
      localStorage.setItem(progressKey, '0');

      // Clone the current detail
      const clonedDetail: LearningSessionDetail = {
        ...detail,
        id: -Math.floor(Math.random() * 1000000000), // unique temporary negative ID
        isChecked: false,
        isCorrect: null,
        selectedAnswersList: [],
        isSeen: false,
      };

      // Spaced recall position (reinforcement): closer gap (insert +3 slots away)
      const remainingCount = updatedDetailsList.length - (currentIndex + 1);
      let insertIndex = updatedDetailsList.length; // default to the end
      if (remainingCount >= 3) {
        insertIndex = currentIndex + 3;
      } else if (remainingCount === 2) {
        insertIndex = currentIndex + 2;
      }

      updatedDetailsList.splice(insertIndex, 0, clonedDetail);

      // Update allQuestionIdsRef
      const updatedQIds = [...allQuestionIdsRef.current];
      updatedQIds.splice(insertIndex, 0, currentQId);
      allQuestionIdsRef.current = updatedQIds;
    } else {
      // Read current progress from localStorage
      const currentProgress = localStorage.getItem(progressKey);
      let newProgress = '2'; // default: mastered immediately if not failed before
      let shouldReinforce = false;

      if (currentProgress === '0') {
        newProgress = '1';
        shouldReinforce = true;
      } else if (currentProgress === '1') {
        newProgress = '2';
        shouldReinforce = false;
      }
      localStorage.setItem(progressKey, newProgress);

      if (shouldReinforce) {
        // Clone the current detail for spaced recall check
        const clonedDetail: LearningSessionDetail = {
          ...detail,
          id: -Math.floor(Math.random() * 1000000000), // unique temporary negative ID
          isChecked: false,
          isCorrect: null,
          selectedAnswersList: [],
          isSeen: false,
        };

        // Spaced recurrence position (longer gap: insert +6 slots away)
        const remainingCount = updatedDetailsList.length - (currentIndex + 1);
        let insertIndex = updatedDetailsList.length;
        if (remainingCount >= 6) {
          insertIndex = currentIndex + 6;
        }

        updatedDetailsList.splice(insertIndex, 0, clonedDetail);

        // Update allQuestionIdsRef
        const updatedQIds = [...allQuestionIdsRef.current];
        updatedQIds.splice(insertIndex, 0, currentQId);
        allQuestionIdsRef.current = updatedQIds;
      }
    }

    setDetails(updatedDetailsList);
    setIsAnswerChecked(true);
    setShowExplanation(true);

    // Save session state to server
    const updatedSession: LearningSession = {
      ...session,
      currentIndex,
      studyTime: studyTimeCounter.current
    };
    await updateSession(updatedSession, updatedDetailsList);
  };

  // Answer selections
  const handleSelectAnswer = (answerId: number) => {
    if (!session || session.isCompleted || isAnswerChecked) return;

    const updatedDetails = [...details];
    const detail = updatedDetails[currentIndex];
    detail.isSeen = true;

    if (session.learningMode === 'practice') {
      const correctIds = currentQuestion?.answersList?.filter(a => a.isCorrect).map(a => Number(a.id)) || [];

      if (correctIds.length <= 1) {
        // Single choice question
        detail.selectedAnswersList = [Number(answerId)];
        setDetails(updatedDetails);
        evaluateAnswer(updatedDetails);
      } else {
        // Multiple choice question
        const selectedIds = detail.selectedAnswersList ? detail.selectedAnswersList.map(Number) : [];
        if (selectedIds.includes(Number(answerId))) {
          detail.selectedAnswersList = selectedIds.filter(id => id !== Number(answerId));
        } else {
          detail.selectedAnswersList = [...selectedIds, Number(answerId)];
        }
        setDetails(updatedDetails);

        if (detail.selectedAnswersList.length === correctIds.length) {
          evaluateAnswer(updatedDetails);
        }
      }
    } else {
      // Exam or Study mode
      const selectedIds = detail.selectedAnswersList ? detail.selectedAnswersList.map(Number) : [];
      if (selectedIds.includes(Number(answerId))) {
        detail.selectedAnswersList = selectedIds.filter(id => id !== Number(answerId));
      } else {
        detail.selectedAnswersList = [...selectedIds, Number(answerId)];
      }
      setDetails(updatedDetails);
    }
  };

  const handleCheckAnswer = () => {
    if (isAnswerChecked || !session || !currentQuestion) return;

    const updatedDetails = [...details];
    const detail = updatedDetails[currentIndex];

    if (!detail.selectedAnswersList || detail.selectedAnswersList.length === 0) {
      alert('Vui lòng chọn ít nhất một đáp án trước.');
      return;
    }

    // Validate multiple selection correctness
    const correctIds = currentQuestion.answersList?.filter(a => a.isCorrect).map(a => Number(a.id)) || [];
    const selectedIds = detail.selectedAnswersList.map(Number);
    const isCorrect = correctIds.length === selectedIds.length &&
      correctIds.every(id => selectedIds.includes(id));

    detail.isChecked = true;
    detail.isCorrect = isCorrect;

    setDetails(updatedDetails);
    setIsAnswerChecked(true);
    setShowExplanation(true);
  };

  const handleNext = async () => {
    if (!session) return;

    // Auto-save currentIndex and session progress
    const nextIndex = currentIndex + 1;
    if (nextIndex < details.length) {
      // Mark next question as seen
      const updatedDetails = [...details];
      updatedDetails[nextIndex].isSeen = true;

      setDetails(updatedDetails);
      setCurrentIndex(nextIndex);

      // Reset practice states
      setIsAnswerChecked(updatedDetails[nextIndex].isChecked);
      setShowExplanation(updatedDetails[nextIndex].isChecked);

      // Lazy load more questions if needed
      loadMoreIfNeeded(nextIndex);

      // Save state to server
      const updatedSession: LearningSession = {
        ...session,
        currentIndex: nextIndex,
        studyTime: studyTimeCounter.current
      };
      await updateSession(updatedSession, updatedDetails);
    } else {
      // Reached the end
      if (session.learningMode === 'exam') {
        // In exam mode: wrap back to question 1 instead of prompting submit
        const updatedDetails = [...details];
        updatedDetails[0].isSeen = true;
        setDetails(updatedDetails);
        setCurrentIndex(0);
        setIsAnswerChecked(updatedDetails[0].isChecked);
        setShowExplanation(updatedDetails[0].isChecked);
        loadMoreIfNeeded(0);
        const updatedSession: LearningSession = {
          ...session,
          currentIndex: 0,
          studyTime: studyTimeCounter.current
        };
        await updateSession(updatedSession, updatedDetails);
      } else {
        // Study/Practice completion
        handlePracticeSubmit();
      }
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      setIsAnswerChecked(details[prevIndex].isChecked);
      setShowExplanation(details[prevIndex].isChecked);
    } else if (currentIndex === 0 && details.length > 0) {
      const prevIndex = details.length - 1;
      setCurrentIndex(prevIndex);
      setIsAnswerChecked(details[prevIndex].isChecked);
      setShowExplanation(details[prevIndex].isChecked);
      loadMoreIfNeeded(prevIndex);
    }
  };

  const handleShowQuestion = async () => {
    const correctOpenCode = session?.openCode || '123';
    if (openCodeInput.trim() === correctOpenCode) {
      setIsExamStarted(true);
      setOpenCodeError(null);
      if (session) {
        localStorage.setItem(`exam_started_${session.id}`, 'true');

        // Reset startTime to now so the timer begins exactly now!
        const nowStr = new Date().toISOString();
        const updatedS = {
          ...session,
          startTime: nowStr,
          recentLearningDateTime: nowStr
        };
        setSession(updatedS);
        // Sync to server
        await updateSession(updatedS, details);

        // Reset timeLeft to config time limit
        if (session.timeLimit) {
          setTimeLeft(session.timeLimit);
        }
      }
    } else {
      setOpenCodeError('Sai Opencode');
    }
  };

  const handlePracticeSubmit = async () => {
    if (!session) return;
    isSubmittingRef.current = true;

    const correct = details.filter(d => d.isCorrect === true).length;
    const wrong = details.length - correct;

    const updatedSession: LearningSession = {
      ...session,
      isCompleted: true,
      studyTime: studyTimeCounter.current,
      endTime: new Date().toISOString(),
      totalCorrect: correct,
      totalWrong: wrong
    };

    await updateSession(updatedSession, details);
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    navigateTo({ type: 'learning-result', sessionTokenOrId: session.sessionToken || String(sessionId) });
  };

  const handleExamSubmit = async (isTimeout = false) => {
    if (!session) return;
    isSubmittingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (studyTimerRef.current) clearInterval(studyTimerRef.current);

    // Calculate score
    let correct = 0;
    let wrong = 0;

    // Parse questions to check answers
    const updatedDetails = details.map(d => {
      const q = fullQuestionsMapRef.current.get(d.questionTargetId);
      const correctIds = q?.answersList?.filter(a => a.isCorrect).map(a => Number(a.id)) || [];
      const selectedIds = d.selectedAnswersList ? d.selectedAnswersList.map(Number) : [];

      // Check if selected answers match correct answers
      const isCorrect = correctIds.length === selectedIds.length &&
        correctIds.every(id => selectedIds.includes(id));

      if (isCorrect) {
        correct++;
      } else {
        wrong++;
      }
      return {
        ...d,
        isChecked: true,
        isCorrect: isCorrect
      };
    });

    const updatedSession: LearningSession = {
      ...session,
      isCompleted: true,
      studyTime: studyTimeCounter.current,
      endTime: new Date().toISOString(),
      totalCorrect: correct,
      totalWrong: wrong
    };

    await updateSession(updatedSession, updatedDetails);
 
    if (isTimeout) {
      alert('Hết giờ làm bài! Ứng dụng đã tự động nộp bài.');
    } else {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
    navigateTo({ type: 'learning-result', sessionTokenOrId: session.sessionToken || String(sessionId) });
  };

  const handleBack = async () => {
    if (!session) return;
    if (session.learningMode === 'exam' && !session.isCompleted) {
      if (!confirm('Bạn đang thi trắc nghiệm. Thoát ra lúc này kết quả bài làm sẽ không được lưu. Bạn vẫn muốn thoát?')) {
        return;
      }
    }

    isSubmittingRef.current = true;
    // Save session current position
    await updateSession(
      { ...session, currentIndex, studyTime: studyTimeCounter.current },
      details
    );
    navigateTo({ type: 'learning' });
  };

  // Listening to keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || !session || session.isCompleted) return;
      if (session.learningMode === 'exam' && !isExamStarted) return;

      // Ignore keystrokes when focused inside input elements or contenteditable
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Map digit keys 1-9 to select answers
      const digitMatch = e.code.match(/^Digit([1-9])$/) || e.key.match(/^([1-9])$/);
      if (digitMatch && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const optionIndex = parseInt(digitMatch[1], 10) - 1;
        if (currentAnswers && optionIndex < currentAnswers.length) {
          e.preventDefault();
          handleSelectAnswer(currentAnswers[optionIndex].id);
          return;
        }
      }

      const keys = config.keyBindings;

      if (session.learningMode === 'study') {
        if (e.code === 'Space') {
          e.preventDefault();
          setIsFlipped(prev => !prev);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleKnown();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleStillLearning();
        } else if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          setShowExplanationPopup(prev => !prev);
        }
        return;
      }

      if (keys.nextQuestion.includes(e.code) || keys.nextQuestion.includes(e.key)) {
        e.preventDefault();
        handleNext();
      } else if (keys.previousQuestion.includes(e.code) || keys.previousQuestion.includes(e.key)) {
        e.preventDefault();
        handlePrev();
      } else if (keys.checkQuestion.includes(e.code) || keys.checkQuestion.includes(e.key)) {
        e.preventDefault();
        if (session.learningMode === 'practice') {
          handleCheckAnswer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, session, currentIndex, details, isAnswerChecked, config, isFlipped, handleStillLearning, handleKnown, handlePrev, handleNext, handleCheckAnswer, isExamStarted, currentAnswers]);

  if (isBlocked) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#F3F4F6',
        color: '#DC2626',
        fontFamily: 'Arial, sans-serif',
        padding: '20px',
        textAlign: 'center',
        zIndex: 9999
      }}>
        <div style={{
          backgroundColor: '#FFFFFF',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
          maxWidth: '500px',
          width: '100%'
        }}>
          <span style={{ fontSize: '64px', marginBottom: '20px', display: 'block' }}>⚠️</span>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>BÀI THI BỊ KHÓA</h2>
          <p style={{ fontSize: '15px', color: '#4B5563', lineHeight: '1.6', marginBottom: '24px' }}>
            Phiên thi này đã được mở trên một trình duyệt hoặc thiết bị khác trước đó. Để tránh gian lận, hệ thống chỉ cho phép làm bài trên thiết bị ban đầu.
          </p>
          <button
            onClick={() => navigateTo({ type: 'learning' })}
            style={{
              padding: '10px 24px',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '15px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Quay lại trang chính
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-12 flex justify-center">Đang tải phiên học...</div>;
  }

  if (requireSeb && session) {
    const isRunningInSeb = navigator.userAgent.toLowerCase().includes('safeexambrowser') || 
                           navigator.userAgent.toLowerCase().includes('seb/');
    
    if (isRunningInSeb) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          backgroundColor: '#FEF2F2',
          color: '#991B1B',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            padding: '40px',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(220, 38, 38, 0.05), 0 8px 10px -6px rgba(220, 38, 38, 0.05)',
            maxWidth: '550px',
            width: '100%',
            border: '1px solid #FCA5A5'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px auto',
              border: '2px solid #EF4444'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px', color: '#991B1B', letterSpacing: '-0.025em' }}>
              CẤU HÌNH TRÌNH DUYỆT KHÔNG HỢP LỆ
            </h2>
            <p style={{ fontSize: '14px', color: '#7F1D1D', lineHeight: '1.6', marginBottom: '28px' }}>
              Phiên bản hoặc cấu hình **Safe Exam Browser (SEB)** bạn đang sử dụng không khớp với yêu cầu bảo mật của kỳ thi này (Lệch mã khóa cấu hình BEK/CK).
            </p>

            <div style={{
              backgroundColor: '#FFF5F5',
              borderRadius: '12px',
              padding: '20px',
              textAlign: 'left',
              marginBottom: '28px',
              border: '1px solid #FEE2E2',
              fontSize: '13px',
              color: '#991B1B',
              lineHeight: '1.6'
            }}>
              <h4 style={{ fontWeight: 'bold', marginBottom: '8px' }}>Nguyên nhân phổ biến:</h4>
              <ul style={{ paddingLeft: '18px', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>Mã cấu hình bảo mật (SEB Keys) trong file cấu hình `.seb` bạn tải về không khớp với khóa được thiết lập trên server.</li>
                <li>Bạn đã tự ý thay đổi file `.seb` trước khi khởi chạy.</li>
                <li>Trình duyệt SEB bạn sử dụng đã bị sửa đổi hoặc không đảm bảo tính toàn vẹn.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '14px 28px',
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px 0 rgba(239, 68, 68, 0.3)'
                }}
              >
                Tải lại trang (Reload)
              </button>

              <button
                onClick={() => navigateTo({ type: 'learning' })}
                style={{
                  padding: '10px 24px',
                  backgroundColor: 'transparent',
                  color: '#4B5563',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Quay lại trang chủ
              </button>
            </div>
          </div>
        </div>
      );
    }

    const protocol = window.location.protocol === 'https:' ? 'sebs://' : 'seb://';
    const launchUrl = `${protocol}${window.location.host}/api/config/seb??sessionToken=${session.sessionToken || sessionId}`;
    
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#F3F4F6',
        color: '#1F2937',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          backgroundColor: '#FFFFFF',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
          maxWidth: '550px',
          width: '100%',
          border: '1px solid #E5E7EB'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px auto',
            border: '2px solid #3B82F6'
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>

          <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px', color: '#111827', letterSpacing: '-0.025em' }}>
            SẴN SÀNG LÀM BÀI THI
          </h2>
          <p style={{ fontSize: '14px', color: '#4B5563', marginBottom: '28px' }}>
            Bài thi này được bảo mật và yêu cầu chạy trong môi trường **Safe Exam Browser (SEB)**.
          </p>

          <div style={{
            backgroundColor: '#F8FAFC',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'left',
            marginBottom: '28px',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px 16px', fontSize: '13px' }}>
              <span style={{ color: '#64748B' }}>Môn học:</span>
              <strong style={{ color: '#0F172A' }}>{session.subjectName || '—'} ({session.subjectCode || '—'})</strong>
              
              <span style={{ color: '#64748B' }}>Mã đề thi:</span>
              <strong style={{ color: '#0F172A' }}>{examCodeName}</strong>

              <span style={{ color: '#64748B' }}>Thời gian làm:</span>
              <strong style={{ color: '#0F172A' }}>{session.timeLimit ? `${Math.round(session.timeLimit / 60)} phút` : '120 phút'}</strong>

              <span style={{ color: '#64748B' }}>Thí sinh:</span>
              <strong style={{ color: '#0F172A' }}>{session.userName || currentUser?.name || '—'}</strong>

              <span style={{ color: '#64748B' }}>Trạng thái:</span>
              <strong style={{ color: session.isCompleted ? '#EF4444' : '#10B981' }}>
                {session.isCompleted ? 'Đã nộp bài' : (session.currentIndex > 0 ? `Đang làm dở (Câu ${session.currentIndex + 1})` : 'Chưa bắt đầu')}
              </strong>

              {session.openCode && (
                <>
                  <span style={{ color: '#64748B', fontWeight: 'bold' }}>Mã mở đề (Open Code):</span>
                  <strong style={{ color: '#EF4444', fontSize: '14px', fontWeight: 'bold', backgroundColor: '#FEE2E2', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', width: 'fit-content' }}>
                    {session.openCode}
                  </strong>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <a
              href={launchUrl}
              style={{
                display: 'block',
                padding: '14px 28px',
                backgroundColor: '#3B82F6',
                color: '#FFFFFF',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                textDecoration: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.3)'
              }}
            >
              MỞ SAFE EXAM BROWSER
            </a>

            <button
              onClick={() => navigateTo({ type: 'learning' })}
              style={{
                padding: '10px 24px',
                backgroundColor: 'transparent',
                color: '#4B5563',
                border: '1px solid #D1D5DB',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Quay lại trang chính
            </button>
          </div>

          <div style={{
            marginTop: '28px',
            borderTop: '1px solid #E5E7EB',
            paddingTop: '20px',
            textAlign: 'left',
            fontSize: '12px',
            color: '#4B5563',
            lineHeight: '1.6'
          }}>
            <h4 style={{ fontWeight: 'bold', color: '#374151', marginBottom: '6px' }}>Hướng dẫn khắc phục sự cố:</h4>
            <ul style={{ paddingLeft: '18px', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <li>Nếu bạn chưa cài đặt Safe Exam Browser, vui lòng tải xuống và cài đặt trước.</li>
              <li>Nếu SEB bị tắt đột ngột trong khi thi, hãy giữ nguyên tab trình duyệt này, bấm lại nút **Mở Safe Exam Browser** phía trên để tiếp tục làm bài thi cũ của bạn (tiến trình làm bài sẽ được khôi phục).</li>
              <li>Không đóng tab này hoặc mở lại nút thi từ trang chính để tránh tạo ra phiên thi mới làm mất lịch sử làm bài.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (!session || !currentDetail) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#111827',
        color: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          backgroundColor: '#1F2937',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          maxWidth: '600px',
          width: '100%',
          border: '1px solid #374151'
        }}>
          <span style={{ fontSize: '64px', marginBottom: '20px', display: 'block' }}>⚠️</span>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#EF4444' }}>
            Không thể tải phiên thi
          </h2>
          <p style={{ fontSize: '15px', color: '#9CA3AF', lineHeight: '1.6', marginBottom: '16px' }}>
            Không tìm thấy phiên học/thi hoặc cấu hình Safe Exam Browser không hợp lệ (Lỗi 403/404). Vui lòng thử khởi chạy lại hoặc liên hệ quản trị viên.
          </p>
          {errorDetails && (
            <div style={{
              backgroundColor: '#111827',
              color: '#F87171',
              padding: '12px',
              borderRadius: '6px',
              textAlign: 'left',
              fontSize: '12px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              marginBottom: '24px',
              border: '1px solid #EF4444',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              <strong>Error Details:</strong>
              <br />
              {errorDetails}
            </div>
          )}
          <button
            onClick={() => navigateTo({ type: 'learning' })}
            style={{
              padding: '10px 24px',
              backgroundColor: '#3B82F6',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '15px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Quay lại trang chính
          </button>
        </div>
      </div>
    );
  }

  if (session.learningMode !== 'exam') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#111827',
        color: '#FFFFFF',
        fontFamily: 'Inter, sans-serif',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          backgroundColor: '#1F2937',
          padding: '40px',
          borderRadius: '12px',
          maxWidth: '500px',
          width: '100%',
          border: '1px solid #374151'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#EF4444' }}>
            Không hỗ trợ chế độ này
          </h2>
          <p style={{ fontSize: '15px', color: '#9CA3AF', lineHeight: '1.6', marginBottom: '24px' }}>
            Không hỗ trợ chế độ tự học/luyện tập trên Cổng thi cử (Exam Portal). Vui lòng quay lại Cổng thông tin học tập chính thức để sử dụng tính năng này.
          </p>
        </div>
      </div>
    );
  }

  if (session.learningMode === 'exam') {
    return (
      <div className="eos-layout animate-fade-in tex2jax_process" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#FFFFFF', fontFamily: `"${localFontFamily}", Arial, sans-serif`, overflow: 'hidden', userSelect: 'none' }}>
        {/* 1. Header (Windows style beige/grey bar changed to white) */}
        <div className="eos-header" style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #CCCCCC',
          padding: '10px 14px',
          display: 'grid',
          gridTemplateColumns: '55% 20% 25%',
          fontSize: '12px',
          flexShrink: 0,
          gap: '14px'
        }}>
          {/* Column 1: System Details & Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Top row: Checkbox and Submit Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#000', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isFinishChecked}
                  onChange={(e) => setIsFinishChecked(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ color: '#000' }}>I want to finish the exam.</span>
              </label>
              <button
                type="button"
                onClick={() => handleExamSubmit(false)}
                disabled={!isFinishChecked}
                style={{
                  padding: '4px 14px',
                  border: '1px solid #CCCCCC',
                  borderRadius: '3px',
                  backgroundColor: '#FFFFFF',
                  color: isFinishChecked ? '#000000' : '#888888',
                  cursor: isFinishChecked ? 'pointer' : 'not-allowed',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
              >
                Finish (Submit)
              </button>
            </div>

            {/* Bottom: Info grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px 8px',
              fontFamily: '"Microsoft Sans Serif", Arial',
              fontSize: '11px',
              color: '#000',
              marginTop: '4px'
            }}>
              <div>Machine: <strong style={{ color: '#000' }}>SEB_CLIENT</strong></div>
              <div>Exam Code: <strong style={{ color: '#000' }}>{examCodeName}</strong></div>
              <div>Vol:
                <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '3px', border: '1px solid #808080', backgroundColor: '#FFF', padding: '1px 3px' }}>
                  <span style={{ width: '14px', textAlign: 'center', fontWeight: 'bold' }}>8</span>
                  <span style={{ display: 'flex', flexDirection: 'column', fontSize: '7px', cursor: 'pointer', marginLeft: '3px', lineHeight: '0.8' }}>
                    <span>▲</span>
                    <span>▼</span>
                  </span>
                </span>
              </div>
              <div></div>

              <div>Server: <strong style={{ color: '#000' }}>Eng_EOS_1403202</strong></div>
              <div>Student: <strong style={{ color: '#000' }}>{session.userMssv || session.userEmail || currentUser?.mssv || currentUser?.email || '—'}</strong></div>
              <div>Name: <strong style={{ color: '#000' }}>{session.userName || currentUser?.name || '—'}</strong></div>
              <div></div>

              <div>Duration: <strong style={{ color: '#000' }}>{session.timeLimit ? `${Math.round(session.timeLimit / 60)} minutes` : '120 minutes'}</strong></div>
              <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Open Code:
                <input
                  type="text"
                  value={openCodeInput}
                  onChange={(e) => setOpenCodeInput(e.target.value)}
                  disabled={isExamStarted}
                  placeholder="Mã..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleShowQuestion();
                    }
                  }}
                  style={{ width: '60px', height: '18px', border: '1px solid #808080', padding: '1px 3px', fontSize: '11px', textAlign: 'center', backgroundColor: isExamStarted ? '#F3F4F6' : '#FFF', fontWeight: 'bold' }}
                />
                <button
                  type="button"
                  onClick={handleShowQuestion}
                  disabled={isExamStarted}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    border: '1px solid #CCCCCC',
                    backgroundColor: isExamStarted ? '#F3F4F6' : '#FFFFFF',
                    cursor: isExamStarted ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    borderRadius: '3px',
                    color: isExamStarted ? '#888888' : '#000000'
                  }}
                >
                  Show Question
                </button>
                {openCodeError && (
                  <span style={{ color: '#CC0000', fontSize: '11px', fontWeight: 'bold', marginLeft: '4px' }}>
                    {openCodeError}
                  </span>
                )}
              </div>
              <div>
                Font:
                <select
                  value={localFontFamily}
                  onChange={(e) => {
                    setLocalFontFamily(e.target.value);
                    document.documentElement.style.setProperty('--font-family', `"${e.target.value}", Arial, sans-serif`);
                  }}
                  style={{ fontSize: '11px', marginLeft: '3px', padding: '1px 2px', border: '1px solid #808080', backgroundColor: '#FFFFFF', color: '#000', fontWeight: 'bold' }}
                >
                  <option value="Microsoft Sans Serif">Microsoft Sans Serif</option>
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                </select>
              </div>

              <div>Q mark: <strong style={{ color: '#000' }}>1</strong></div>
              <div>Total Marks: <strong style={{ color: '#000' }}>{details.length}</strong></div>
              <div></div>
              <div>
                Size:
                <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '3px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const newSize = Math.max(localFontSize - 1, 10);
                      setLocalFontSize(newSize);
                      document.documentElement.style.setProperty('--font-size-base', `${newSize}px`);
                    }}
                    style={{ width: '15px', height: '15px', border: '1px solid #CCCCCC', backgroundColor: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#000', fontSize: '8px', borderRadius: '3px' }}
                  >
                    ◀
                  </button>
                  <span style={{ minWidth: '18px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px' }}>{localFontSize}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newSize = Math.min(localFontSize + 1, 24);
                      setLocalFontSize(newSize);
                      document.documentElement.style.setProperty('--font-size-base', `${newSize}px`);
                    }}
                    style={{ width: '15px', height: '15px', border: '1px solid #CCCCCC', backgroundColor: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#000', fontSize: '8px', borderRadius: '3px' }}
                  >
                    ▶
                  </button>
                </span>
              </div>
            </div>
          </div>

          {/* Column 2: Photo, Ferrari, Timer */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', borderLeft: '1px solid #CCCCCC', borderRight: '1px solid #CCCCCC', padding: '0 10px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#000', marginBottom: '2px' }}>
              {session.identifyingId || 37896}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
              {/* Avatar Picture or SVG */}
              <div style={{ position: 'relative', width: '46px', height: '55px', border: '1px solid #808080' }}>
                {currentUser?.picture ? (
                  <img
                    src={currentUser.picture}
                    alt="Avatar"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <svg viewBox="0 0 100 120" style={{ width: '100%', height: '100%', backgroundColor: '#D0D3D4' }}>
                    <rect width="100" height="120" fill="#D0D3D4" />
                    <path d="M 15,120 L 85,120 L 80,100 L 65,95 L 50,105 L 35,95 L 20,100 Z" fill="#FF5500" />
                    <path d="M 35,95 L 50,105 L 65,95 L 50,90 Z" fill="#CC4400" />
                    <rect x="42" y="80" width="16" height="20" fill="#F5CBA7" />
                    <ellipse cx="50" cy="55" rx="22" ry="26" fill="#F5CBA7" />
                    <path d="M 28,45 Q 50,30 72,45 C 75,35 68,25 50,25 C 32,25 25,35 28,45 Z" fill="#2C3E50" />
                    <rect x="33" y="48" width="14" height="10" rx="2" fill="none" stroke="#000000" strokeWidth="2" />
                    <rect x="53" y="48" width="14" height="10" rx="2" fill="none" stroke="#000000" strokeWidth="2" />
                    <line x1="47" y1="53" x2="53" y2="53" stroke="#000000" strokeWidth="2" />
                    <circle cx="40" cy="53" r="2" fill="#000" />
                    <circle cx="60" cy="53" r="2" fill="#000" />
                    <path d="M 50,55 L 48,63 L 52,63" fill="none" stroke="#D35400" strokeWidth="1.5" />
                    <path d="M 44,72 Q 50,75 56,72" fill="none" stroke="#D35400" strokeWidth="2" />
                  </svg>
                )}
                {/* Green active dot */}
                <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#00FF00', border: '1px solid #000' }}></div>
              </div>

              {/* Ferrari Shield SVG */}
              <svg viewBox="0 0 60 80" style={{ width: '38px', height: '48px' }}>
                <path d="M 5,5 Q 30,0 55,5 L 55,45 Q 55,65 30,78 Q 5,65 5,45 Z" fill="#FFEB00" stroke="#000000" strokeWidth="1.5" />
                <rect x="10" y="7" width="13" height="6" fill="#009246" />
                <rect x="23" y="6" width="14" height="6" fill="#F1F2F1" />
                <rect x="37" y="7" width="13" height="6" fill="#CE2B37" />
                <path d="M 32,20 C 32,20 30,22 28,21 C 26,20 25,22 26,24 C 27,26 28,25 29,27 C 28,29 26,30 25,32 C 24,34 26,35 28,34 C 29,33 30,35 29,38 C 28,40 27,42 25,43 C 24,44 26,45 28,44 C 30,43 32,45 31,48 C 30,51 29,54 27,56 C 29,56 31,54 33,51 C 34,48 35,46 35,43 C 36,44 38,45 40,43 C 38,41 37,39 36,37 C 37,35 39,36 41,34 C 39,33 38,32 37,30 C 37,28 39,28 41,27 C 39,26 38,25 37,24 C 36,22 37,20 38,18 C 36,19 35,21 34,22 C 33,21 33,20 32,20 Z" fill="#000000" />
                <text x="15" y="70" fontFamily="sans-serif" fontSize="10" fontWeight="bold" fill="#000000">S</text>
                <text x="38" y="70" fontFamily="sans-serif" fontSize="10" fontWeight="bold" fill="#000000">F</text>
              </svg>
            </div>

            {/* Time Left & Blue Countdown Timer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
              <span style={{ fontSize: '11px', color: '#555', fontWeight: 'bold' }}>Time Left:</span>
              {timeLeft !== null && (
                <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#0000FF', fontFamily: 'monospace' }}>
                  {formatTime(timeLeft)}
                </span>
              )}
            </div>
          </div>

          {/* Column 3: Guidelines scroll box (white background, no demo text) */}
          <div style={{
            border: '1px solid #CCCCCC',
            backgroundColor: '#FFFFFF',
            height: '80px',
            overflowY: 'auto',
            padding: '4px',
            fontSize: '9.5px',
            fontFamily: 'monospace',
            lineHeight: '1.25',
            color: '#333'
          }}>
            <div style={{ fontWeight: 'bold', borderBottom: '1px solid #CCCCCC', paddingBottom: '2px', marginBottom: '2px' }}>
              ĐÂY LÀ GIAO DIỆN DEMO EOS, KHÔNG PHẢI LÀ PHIÊN BẢN EOS CỦA ĐẠI HỌC FPT
            </div>
            <div>Vietnam Audio: 0 - 2m50s - English Audio: 2m51s - 4m40s</div>
            <div>Reading: 2</div>
            <div>Multiple Choice: 35</div>
            <div>Matching: 2</div>
            <div>Fill Blank: 6</div>
            <div>Indicate Mistake: 4</div>
          </div>
        </div>

        {/* 2. Tabs Row */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #CCCCCC',
          padding: '6px 14px',
          flexShrink: 0
        }}>
          {/* Right: Zoom controls */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              onClick={() => {
                const defaultSize = config.fontSize || 14;
                setLocalFontSize(defaultSize);
                document.documentElement.style.setProperty('--font-size-base', `${defaultSize}px`);
              }}
              style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #CCCCCC', backgroundColor: '#FFFFFF', cursor: 'pointer', fontWeight: 'bold', borderRadius: '3px' }}
            >
              Resize
            </button>
            <button
              type="button"
              onClick={() => {
                const newSize = Math.min(localFontSize + 1, 24);
                setLocalFontSize(newSize);
                document.documentElement.style.setProperty('--font-size-base', `${newSize}px`);
              }}
              style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #CCCCCC', backgroundColor: '#FFFFFF', cursor: 'pointer', fontWeight: 'bold', borderRadius: '3px' }}
            >
              Zoom In
            </button>
            <button
              type="button"
              onClick={() => {
                const newSize = Math.max(localFontSize - 1, 10);
                setLocalFontSize(newSize);
                document.documentElement.style.setProperty('--font-size-base', `${newSize}px`);
              }}
              style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #CCCCCC', backgroundColor: '#FFFFFF', cursor: 'pointer', fontWeight: 'bold', borderRadius: '3px' }}
            >
              Zoom Out
            </button>
          </div>
        </div>

        {/* 3. Progress Banner */}
        <div style={{
          backgroundColor: '#FFFFFF',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          fontSize: '13px',
          color: '#008000',
          fontWeight: 'bold',
          flexShrink: 0,
          borderBottom: '1px solid #CCCCCC',
          gap: '12px'
        }}>
          <div>
            There are {details.length} questions, and your progress of answering is
          </div>
          <div style={{
            flex: 1,
            height: '18px',
            border: '1px solid #CCCCCC',
            backgroundColor: '#FFFFFF',
            position: 'relative',
            maxWidth: '350px',
            borderRadius: '2px'
          }}>
            <div style={{
              height: '100%',
              backgroundColor: '#00CC00',
              width: `${(details.filter(d => d.selectedAnswersList && Array.isArray(d.selectedAnswersList) && d.selectedAnswersList.length > 0).length / details.length) * 100}%`,
              transition: 'width 0.2s'
            }}></div>
          </div>
        </div>

        {/* 4. Split Area */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
          {/* Left panel: Answer selection */}
          <div style={{
            width: '160px',
            backgroundColor: '#FFFFFF',
            borderRight: '4px solid #CC0000',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px 12px',
            justifyContent: 'space-between',
            flexShrink: 0
          }}>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#008000' }}>
                Answer
              </div>
              <div style={{ fontSize: '11px', color: '#333', marginTop: '2px', borderBottom: '1px solid #E5E7EB', paddingBottom: '4px', marginBottom: '12px' }}>
                (Choose answers)
              </div>

              {/* Checkboxes A, B, C, D */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '6px' }}>
                {isExamStarted ? (
                  currentAnswers.map((ans, idx) => {
                    const alphabet = String.fromCharCode(65 + idx);
                    const selectedList = currentDetail.selectedAnswersList ? currentDetail.selectedAnswersList.map(Number) : [];
                    const isSelected = selectedList.includes(Number(ans.id));
                    return (
                      <label key={ans.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', color: '#000' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectAnswer(ans.id)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span>{alphabet}</span>
                      </label>
                    );
                  })
                ) : (
                  <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>Đang khóa...</div>
                )}
              </div>
            </div>

            {/* Back / Next Buttons */}
            <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
              <button
                type="button"
                onClick={handlePrev}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: '1px solid #CCCCCC',
                  borderRadius: '3px',
                  backgroundColor: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: '#000'
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: '1px solid #CCCCCC',
                  borderRadius: '3px',
                  backgroundColor: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: '#000'
                }}
              >
                Next
              </button>
            </div>
          </div>

          {/* Right part: Question panel occupying full width, white background, no demo watermark */}
          <div style={{
            flex: 1,
            backgroundColor: '#FFFFFF',
            padding: '24px 32px',
            overflowY: 'auto'
          }}>
            {!isExamStarted ? null : (
              <>
                <div style={{
                  fontSize: `${localFontSize + 4}px`,
                  fontFamily: `"${localFontFamily}", Arial, sans-serif`,
                  fontWeight: 'bold',
                  color: '#000',
                  lineHeight: '1.5',
                  marginBottom: currentQuestion?.imageUrl ? '16px' : '28px'
                }}>
                  <MathHtml style={{ whiteSpace: 'pre-wrap' }} html={currentQuestion?.content || ''} />
                </div>

                {/* Question image (if any) */}
                {currentQuestion?.imageUrl && (
                  <img
                    src={currentQuestion.imageUrl}
                    alt="Hình ảnh câu hỏi"
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      width: `${450 * (localFontSize / (config.fontSize || 14))}px`,
                      maxHeight: `${280 * (localFontSize / (config.fontSize || 14))}px`,
                      objectFit: 'contain',
                      borderRadius: '4px',
                      marginBottom: '20px',
                      border: '1px solid #CCCCCC',
                      transition: 'all 0.2s ease'
                    }}
                  />
                )}

                {/* Choices listed underneath in plain text */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {currentAnswers.map((ans, idx) => {
                    const alphabet = String.fromCharCode(65 + idx);
                    const selectedList = currentDetail.selectedAnswersList ? currentDetail.selectedAnswersList.map(Number) : [];
                    const isSelected = selectedList.includes(Number(ans.id));
                    return (
                      <div
                        key={ans.id}
                        style={{
                          fontSize: `${localFontSize + 2}px`,
                          fontFamily: `"${localFontFamily}", Arial, sans-serif`,
                          color: isSelected ? '#0000FF' : '#000000',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          lineHeight: '1.4'
                        }}
                      >
                        {alphabet}. <MathHtml tag="span" style={{ whiteSpace: 'pre-wrap' }} html={ans.content} />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 5. Footer Taskbar (larger height) */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #CCCCCC',
          padding: '8px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          height: '50px'
        }}>
          {/* Left: Checkbox and Finish Button */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#000', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isFinishChecked}
                onChange={(e) => setIsFinishChecked(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>I want to finish the exam.</span>
            </label>
            <button
              type="button"
              onClick={() => handleExamSubmit(false)}
              disabled={!isFinishChecked}
              style={{
                padding: '4px 20px',
                border: '1px solid #CCCCCC',
                borderRadius: '3px',
                backgroundColor: '#D47A2A',
                color: '#FFFFFF',
                cursor: isFinishChecked ? 'pointer' : 'not-allowed',
                opacity: isFinishChecked ? 1 : 0.6,
                fontSize: '13px',
                fontWeight: 'bold',
                marginLeft: '12px'
              }}
            >
              Finish
            </button>
          </div>

          {/* Center: SEB RUNNING */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: '#1E4620',
              fontFamily: '"Microsoft Sans Serif", Arial',
              letterSpacing: '1px'
            }}>
              SEB RUNNING
            </div>
            {!isOnline && (
              <span style={{
                color: '#CC0000',
                fontSize: '13px',
                fontWeight: 'bold'
              }}>
                Lost Connect! Reconnecting...
              </span>
            )}
          </div>

          {/* Right: Exit */}
          <div>
            <button
              type="button"
              onClick={handleBack}
              style={{
                padding: '4px 20px',
                border: '1px solid #CCCCCC',
                borderRadius: '3px',
                backgroundColor: '#FFFFFF',
                color: '#000',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold'
              }}
            >
              Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
