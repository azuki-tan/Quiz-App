import type { Subject, Quiz, Question, Answer, LearningSession, LearningSessionDetail, AppConfig } from './types';

const DB_NAME = 'quiz_app_db';
const DB_VERSION = 1;

export class QuizDB {
  private static db: IDBDatabase | null = null;

  static async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;

        // Subjects store
        if (!db.objectStoreNames.contains('subjects')) {
          db.createObjectStore('subjects', { keyPath: 'id', autoIncrement: true });
        }

        // Quizzes store
        if (!db.objectStoreNames.contains('quizzes')) {
          const store = db.createObjectStore('quizzes', { keyPath: 'id', autoIncrement: true });
          store.createIndex('subjectTargetId', 'subjectTargetId', { unique: false });
        }

        // Questions store
        if (!db.objectStoreNames.contains('questions')) {
          const store = db.createObjectStore('questions', { keyPath: 'id', autoIncrement: true });
          store.createIndex('quizTargetId', 'quizTargetId', { unique: false });
        }

        // Answers store
        if (!db.objectStoreNames.contains('answers')) {
          const store = db.createObjectStore('answers', { keyPath: 'id', autoIncrement: true });
          store.createIndex('questionTargetId', 'questionTargetId', { unique: false });
        }

        // Sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
          store.createIndex('quizTargetId', 'quizTargetId', { unique: false });
        }

        // Session Details store
        if (!db.objectStoreNames.contains('session_details')) {
          const store = db.createObjectStore('session_details', { keyPath: 'id', autoIncrement: true });
          store.createIndex('learningSessionId', 'learningSessionId', { unique: false });
        }

        // Config store
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'id' });
        }
      };
    });
  }

  private static getStore(name: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized. Call QuizDB.init() first.');
    const transaction = this.db.transaction(name, mode);
    return transaction.objectStore(name);
  }

  // --- SUBJECTS ---
  static async getSubjects(): Promise<Subject[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('subjects', 'readonly');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  static async saveSubject(subject: Omit<Subject, 'id'> & { id?: number }): Promise<number> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('subjects', 'readwrite');
      const data = { ...subject };
      if (data.id === 0) delete (data as any).id; // Let IndexedDB auto-increment
      
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  static async deleteSubject(id: number): Promise<void> {
    // Also delete associated quizzes
    const quizzes = await this.getQuizzesBySubject(id);
    for (const quiz of quizzes) {
      await this.deleteQuiz(quiz.id);
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('subjects', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- QUIZZES ---
  static async getQuizzesBySubject(subjectId: number): Promise<Quiz[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('quizzes', 'readonly');
      const index = store.index('subjectTargetId');
      const request = index.getAll(subjectId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  static async getQuizById(id: number): Promise<Quiz | null> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('quizzes', 'readonly');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  static async saveQuiz(quiz: Omit<Quiz, 'id'> & { id?: number }): Promise<number> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('quizzes', 'readwrite');
      const data = { ...quiz };
      if (data.id === 0) delete (data as any).id;
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  static async deleteQuiz(id: number): Promise<void> {
    // Delete questions
    const questions = await this.getQuestionsByQuiz(id);
    for (const q of questions) {
      await this.deleteQuestion(q.id);
    }
    // Delete sessions
    const sessions = await this.getSessionsByQuiz(id);
    for (const s of sessions) {
      await this.deleteSession(s.id);
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('quizzes', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- QUESTIONS ---
  static async getQuestionsByQuiz(quizId: number): Promise<Question[]> {
    const questions: Question[] = await new Promise((resolve, reject) => {
      const store = this.getStore('questions', 'readonly');
      const index = store.index('quizTargetId');
      const request = index.getAll(quizId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    // Populate answers for each question
    for (const q of questions) {
      q.answersList = await this.getAnswersByQuestion(q.id);
    }
    return questions;
  }

  static async getQuestionById(id: number): Promise<Question | null> {
    const question: Question | null = await new Promise((resolve, reject) => {
      const store = this.getStore('questions', 'readonly');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    if (question) {
      question.answersList = await this.getAnswersByQuestion(question.id);
    }
    return question;
  }

  static async saveQuestion(question: Omit<Question, 'id'> & { id?: number }): Promise<number> {
    const qId = await new Promise<number>((resolve, reject) => {
      const store = this.getStore('questions', 'readwrite');
      const data = { ...question };
      delete (data as any).answersList; // Do not save nested answersList directly in question record
      if (data.id === 0) delete (data as any).id;
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });

    // Save answers if provided
    if (question.answersList) {
      // First delete existing answers for this question
      const existingAnswers = await this.getAnswersByQuestion(qId);
      for (const a of existingAnswers) {
        await this.deleteAnswer(a.id);
      }
      // Save new ones
      for (const ans of question.answersList) {
        await this.saveAnswer({
          ...ans,
          questionTargetId: qId,
        });
      }
    }

    return qId;
  }

  static async deleteQuestion(id: number): Promise<void> {
    // Delete answers
    const answers = await this.getAnswersByQuestion(id);
    for (const a of answers) {
      await this.deleteAnswer(a.id);
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('questions', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- ANSWERS ---
  static async getAnswersByQuestion(questionId: number): Promise<Answer[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('answers', 'readonly');
      const index = store.index('questionTargetId');
      const request = index.getAll(questionId);
      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => a.indexOrder - b.indexOrder);
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async saveAnswer(answer: Omit<Answer, 'id'> & { id?: number }): Promise<number> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('answers', 'readwrite');
      const data = { ...answer };
      if (data.id === 0) delete (data as any).id;
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  static async deleteAnswer(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('answers', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- SESSIONS ---
  static async getSessions(): Promise<LearningSession[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('sessions', 'readonly');
      const request = store.getAll();
      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async getSessionsByQuiz(quizId: number): Promise<LearningSession[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('sessions', 'readonly');
      const index = store.index('quizTargetId');
      const request = index.getAll(quizId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  static async getSessionById(id: number): Promise<LearningSession | null> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('sessions', 'readonly');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  static async saveSession(session: Omit<LearningSession, 'id'> & { id?: number }): Promise<number> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('sessions', 'readwrite');
      const data = { ...session };
      if (data.id === 0) delete (data as any).id;
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  static async deleteSession(id: number): Promise<void> {
    // Delete session details
    const details = await this.getSessionDetails(id);
    for (const d of details) {
      await this.deleteSessionDetail(d.id);
    }

    return new Promise((resolve, reject) => {
      const store = this.getStore('sessions', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- SESSION DETAILS ---
  static async getSessionDetails(sessionId: number): Promise<LearningSessionDetail[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('session_details', 'readonly');
      const index = store.index('learningSessionId');
      const request = index.getAll(sessionId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  static async saveSessionDetail(detail: Omit<LearningSessionDetail, 'id'> & { id?: number }): Promise<number> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('session_details', 'readwrite');
      const data = { ...detail };
      if (data.id === 0) delete (data as any).id;
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  static async saveSessionDetailsBatch(details: LearningSessionDetail[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized.');
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction('session_details', 'readwrite');
      const store = transaction.objectStore('session_details');

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      for (const d of details) {
        const data = { ...d };
        if (data.id === 0) delete (data as any).id;
        store.put(data);
      }
    });
  }

  static async deleteSessionDetail(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('session_details', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- CONFIG ---
  static async getConfig(): Promise<AppConfig> {
    const defaultConfig: AppConfig = {
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
    };

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(defaultConfig);
        return;
      }
      try {
        const store = this.getStore('config', 'readonly');
        const request = store.get(1);
        request.onsuccess = () => {
          resolve(request.result || defaultConfig);
        };
        request.onerror = () => {
          resolve(defaultConfig);
        };
      } catch {
        resolve(defaultConfig);
      }
    });
  }

  static async saveConfig(config: AppConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('config', 'readwrite');
      const request = store.put(config);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- DANGEROUS: WIPE DATABASE ---
  static async wipeDatabase(): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        ['subjects', 'quizzes', 'questions', 'answers', 'sessions', 'session_details'],
        'readwrite'
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      transaction.objectStore('subjects').clear();
      transaction.objectStore('quizzes').clear();
      transaction.objectStore('questions').clear();
      transaction.objectStore('answers').clear();
      transaction.objectStore('sessions').clear();
      transaction.objectStore('session_details').clear();
    });
  }
}
