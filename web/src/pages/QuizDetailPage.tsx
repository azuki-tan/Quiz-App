import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Plus, Edit2, Trash2, Upload, FileText, CheckCircle2, XCircle, Image, X } from 'lucide-react';
import type { Question, Answer } from '../types';
import { RichTextEditor } from '../components/RichTextEditor';
import { cleanHtmlExplanation } from '../utils/html';

interface BinaryAnswer {
  content: string;
  isCorrect: boolean;
}

interface BinaryQuestion {
  content: string;
  answers: BinaryAnswer[];
  explanation: string;
}

function readNetString(dataView: DataView, bytes: Uint8Array, offset: number): { text: string; newOffset: number } {
  let count = 0;
  let shift = 0;
  let current = offset;
  
  while (true) {
    if (current >= dataView.byteLength) {
      throw new Error("Kết thúc tệp bất ngờ khi đọc chuỗi nhị phân (varint).");
    }
    const b = dataView.getUint8(current);
    current += 1;
    
    count |= (b & 0x7F) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  
  if (count === 0) {
    return { text: "", newOffset: current };
  }
  
  if (current + count > dataView.byteLength) {
    throw new Error("Kích thước chuỗi vượt quá chiều dài tệp nhị phân còn lại.");
  }
  
  const stringBytes = bytes.subarray(current, current + count);
  const text = new TextDecoder("utf-8").decode(stringBytes);
  
  return { text, newOffset: current + count };
}

function parseLegacyBinary(arrayBuffer: ArrayBuffer): BinaryQuestion[] {
  const dataView = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let offset = 0;
  
  if (arrayBuffer.byteLength < 4) {
    throw new Error("Tệp quá nhỏ hoặc không hợp lệ.");
  }
  const numberOfQuestions = dataView.getInt32(offset, true);
  offset += 4;
  
  const questions: BinaryQuestion[] = [];
  
  for (let i = 0; i < numberOfQuestions; i++) {
    // Read question content
    const qTextResult = readNetString(dataView, bytes, offset);
    const questionText = qTextResult.text;
    offset = qTextResult.newOffset;
    
    // Read number of answers (1 byte)
    if (offset >= arrayBuffer.byteLength) {
      throw new Error(`Kết thúc tệp bất ngờ khi đọc số đáp án ở câu thứ ${i + 1}.`);
    }
    const numAnswers = dataView.getUint8(offset);
    offset += 1;
    
    const answers: BinaryAnswer[] = [];
    for (let j = 0; j < numAnswers; j++) {
      // Read answer content
      const aTextResult = readNetString(dataView, bytes, offset);
      const answerText = aTextResult.text;
      offset = aTextResult.newOffset;
      
      // Read isCorrect (1 byte)
      if (offset >= arrayBuffer.byteLength) {
        throw new Error(`Kết thúc tệp bất ngờ khi đọc trạng thái đúng/sai của câu thứ ${i + 1}, đáp án thứ ${j + 1}.`);
      }
      const isCorrect = dataView.getUint8(offset) !== 0;
      offset += 1;
      
      answers.push({ content: answerText, isCorrect });
    }
    
    // Read explanation
    const expResult = readNetString(dataView, bytes, offset);
    const explanationText = expResult.text;
    offset = expResult.newOffset;
    
    questions.push({
      content: questionText,
      answers,
      explanation: explanationText
    });
  }
  
  return questions;
}

interface QuizDetailPageProps {
  quizId: number;
}

export const QuizDetailPage: React.FC<QuizDetailPageProps> = ({ quizId }) => {
  const { quizzes, navigateTo, saveQuestion, deleteQuestion, getQuestionsForQuiz } = useApp();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Edit/Add Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [questionContent, setQuestionContent] = useState('');
  const [questionExplanation, setQuestionExplanation] = useState('');
  const [answers, setAnswers] = useState<Omit<Answer, 'id'>[]>([
    { content: '', isCorrect: false, indexOrder: 0, questionTargetId: 0 },
    { content: '', isCorrect: false, indexOrder: 1, questionTargetId: 0 },
    { content: '', isCorrect: false, indexOrder: 2, questionTargetId: 0 },
    { content: '', isCorrect: false, indexOrder: 3, questionTargetId: 0 },
  ]);
  const [questionImageUrl, setQuestionImageUrl] = useState<string>('');
  const [questionExplanationImage, setQuestionExplanationImage] = useState<string>('');
  const questionImgRef = useRef<HTMLInputElement>(null);
  const explImgRef = useRef<HTMLInputElement>(null);
  // Track which image area last had focus for paste: 'question' | 'explanation'
  const [lastImgFocus, setLastImgFocus] = useState<'question' | 'explanation'>('question');



  // Image file → base64
  const handleImageFile = (file: File, setter: (v: string) => void) => {
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file hình ảnh (PNG, JPG, GIF, WebP...)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Ảnh không được vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setter(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Clipboard paste handler when modal is open
  useEffect(() => {
    if (!showModal) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            if (lastImgFocus === 'explanation') {
              handleImageFile(file, setQuestionExplanationImage);
            } else {
              handleImageFile(file, setQuestionImageUrl);
            }
          }
          e.preventDefault();
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [showModal, lastImgFocus]);


  const quiz = quizzes.find(q => q.id === quizId);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const list = await getQuestionsForQuiz(quizId);
      setQuestions(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [quizId]);

  // Trigger MathJax typeset when page contents update
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((window as any).MathJax) {
        (window as any).MathJax.typesetPromise?.().catch((e: any) => console.error(e));
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [questions, currentPage, searchQuery, showModal]);



  const handleOpenAddModal = () => {
    setEditingQuestion(null);
    setQuestionContent('');
    setQuestionExplanation('');
    setQuestionImageUrl('');
    setQuestionExplanationImage('');
    setAnswers([
      { content: '', isCorrect: false, indexOrder: 0, questionTargetId: 0 },
      { content: '', isCorrect: false, indexOrder: 1, questionTargetId: 0 },
      { content: '', isCorrect: false, indexOrder: 2, questionTargetId: 0 },
      { content: '', isCorrect: false, indexOrder: 3, questionTargetId: 0 },
    ]);
    setShowModal(true);
  };

  const handleOpenEditModal = (q: Question) => {
    setEditingQuestion(q);
    setQuestionContent(cleanHtmlExplanation(q.content));
    setQuestionExplanation(cleanHtmlExplanation(q.explanation || ''));
    setQuestionImageUrl(q.imageUrl || '');
    setQuestionExplanationImage(q.explanationImage || '');
    if (q.answersList && q.answersList.length > 0) {
      setAnswers(q.answersList.map(a => ({
        content: a.content,
        isCorrect: a.isCorrect,
        indexOrder: a.indexOrder,
        questionTargetId: q.id
      })));
    } else {
      setAnswers([
        { content: '', isCorrect: false, indexOrder: 0, questionTargetId: q.id },
        { content: '', isCorrect: false, indexOrder: 1, questionTargetId: q.id },
      ]);
    }
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Bạn có chắc chắn muốn xóa câu hỏi này?')) {
      await deleteQuestion(id);
      loadQuestions();
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionContent.trim()) return;

    // Filter out empty answers
    const validAnswers = answers.filter(a => a.content.trim() !== '');
    if (validAnswers.length < 2) {
      alert('Vui lòng nhập ít nhất 2 đáp án.');
      return;
    }

    const hasCorrect = validAnswers.some(a => a.isCorrect);
    if (!hasCorrect) {
      alert('Vui lòng chọn ít nhất 1 đáp án đúng.');
      return;
    }

    const questionData: Omit<Question, 'id'> & { id?: number } = {
      content: cleanHtmlExplanation(questionContent),
      explanation: cleanHtmlExplanation(questionExplanation),
      imageUrl: questionImageUrl || null as any,
      explanationImage: questionExplanationImage || null as any,
      quizTargetId: quizId,
      answersList: validAnswers.map((a, idx) => ({
        id: 0, // DB will auto-assign
        content: a.content.trim(),
        isCorrect: a.isCorrect,
        indexOrder: idx,
        questionTargetId: editingQuestion?.id || 0,
      })) as Answer[],
    };

    if (editingQuestion) {
      questionData.id = editingQuestion.id;
    }

    await saveQuestion(questionData);
    setShowModal(false);
    loadQuestions();
  };

  // (handleImageFile is defined above near state declarations)

  const handleAnswerChange = (index: number, field: 'content' | 'isCorrect', value: any) => {
    const newAnswers = [...answers];
    if (field === 'content') {
      newAnswers[index].content = value;
    } else if (field === 'isCorrect') {
      newAnswers[index].isCorrect = value;
    }
    setAnswers(newAnswers);
  };

  const addAnswerField = () => {
    setAnswers([...answers, { content: '', isCorrect: false, indexOrder: answers.length, questionTargetId: editingQuestion?.id || 0 }]);
  };

  const removeAnswerField = (index: number) => {
    if (answers.length <= 2) {
      alert('Phải có tối thiểu 2 đáp án.');
      return;
    }
    setAnswers(answers.filter((_, idx) => idx !== index));
  };

  // Import JSON File
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        
        let qList: any[] = [];
        if (parsed.questionsList && Array.isArray(parsed.questionsList)) {
          qList = parsed.questionsList;
        } else if (Array.isArray(parsed)) {
          qList = parsed;
        } else {
          throw new Error('Định dạng JSON không hợp lệ.');
        }

        if (qList.length === 0) {
          alert('Tệp JSON không chứa câu hỏi nào.');
          return;
        }

        setLoading(true);

        // Save batch
        for (const q of qList) {
          const rawAnswers = q.answersList || q.answers || [];
          const answersList: Answer[] = rawAnswers.map((a: any, idx: number) => ({
            id: 0,
            content: a.content || '',
            isCorrect: a.is_correct !== undefined ? a.is_correct : (a.isCorrect !== undefined ? a.isCorrect : false),
            indexOrder: a.indexOrder !== undefined ? a.indexOrder : idx,
            questionTargetId: 0,
          }));

          await saveQuestion({
            content: cleanHtmlExplanation(q.content || ''),
            explanation: cleanHtmlExplanation(q.explanation || ''),
            quizTargetId: quizId,
            answersList,
          });
        }

        alert(`Đã nhập thành công ${qList.length} câu hỏi!`);
        loadQuestions();
      } catch (err) {
        alert(`Lỗi khi đọc file JSON: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  // Import Binary File (Legacy format)
  const handleImportBinary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const qList = parseLegacyBinary(buffer);

        if (qList.length === 0) {
          alert('Tệp Binary không chứa câu hỏi nào.');
          return;
        }

        setLoading(true);

        // Save batch
        for (const q of qList) {
          const answersList: Answer[] = q.answers.map((a, idx) => ({
            id: 0,
            content: a.content || '',
            isCorrect: a.isCorrect,
            indexOrder: idx,
            questionTargetId: 0,
          }));

          await saveQuestion({
            content: cleanHtmlExplanation(q.content || ''),
            explanation: cleanHtmlExplanation(q.explanation || ''),
            quizTargetId: quizId,
            answersList,
          });
        }

        alert(`Đã nhập thành công ${qList.length} câu hỏi từ tệp nhị phân!`);
        loadQuestions();
      } catch (err: any) {
        alert(`Lỗi khi đọc file Binary: ${err.message || err}`);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input
    e.target.value = '';
  };

  // Filter questions
  const filteredQuestions = questions.filter(
    q => q.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination calculation
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredQuestions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredQuestions.length / itemsPerPage);

  if (!quiz) {
    return (
      <div className="p-6">
        <button className="btn btn-secondary mb-4" onClick={() => navigateTo({ type: 'library' })}>
          <ArrowLeft size={16} /> Quay lại
        </button>
        <div>Không tìm thấy thông tin bộ đề.</div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto w-full h-full" style={{ height: '100%' }}>
      <div className="p-6 animate-fade-in flex flex-col gap-6">
        {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <button 
            className="btn btn-secondary p-2" 
            style={{ borderRadius: '50%' }}
            onClick={() => navigateTo({ type: 'subject-detail', subjectId: quiz.subjectTargetId })}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Quản lý câu hỏi</span>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2 }}>{quiz.name}</h2>
          </div>
        </div>
        
        <div className="flex gap-2">
          {/* Import JSON */}
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            <Upload size={18} />
            <span>Import JSON</span>
            <input 
              type="file" 
              accept=".json" 
              onChange={handleImportJson} 
              style={{ display: 'none' }} 
            />
          </label>



          {/* Import Binary */}
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            <Upload size={18} />
            <span>Import Binary</span>
            <input 
              type="file" 
              accept=".bin,.dat" 
              onChange={handleImportBinary} 
              style={{ display: 'none' }} 
            />
          </label>
          
          <button 
            className="btn btn-primary"
            onClick={handleOpenAddModal}
          >
            <Plus size={18} />
            <span>Thêm câu hỏi</span>
          </button>
        </div>
      </div>

      {/* Stats and Search */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
          Tổng cộng: {filteredQuestions.length} câu hỏi {searchQuery && '(đã lọc)'}
        </div>
        
        {/* Search */}
        <input 
          type="text" 
          placeholder="Tìm kiếm nội dung câu hỏi..." 
          className="input"
          style={{ maxWidth: '380px' }}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="flex justify-center p-12" style={{ color: 'var(--text-secondary)' }}>
          Đang tải câu hỏi...
        </div>
      ) : currentItems.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12" style={{ color: 'var(--text-secondary)' }}>
          <FileText size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <span style={{ fontWeight: 600 }}>Chưa có câu hỏi nào</span>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Hãy tự tạo câu hỏi hoặc chọn "Import JSON" / "Import Binary" để nhập ngân hàng đề.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {currentItems.map((q, qIdx) => {
            const displayIndex = indexOfFirstItem + qIdx + 1;
            return (
              <div key={q.id} className="card p-5 flex flex-col gap-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1" style={{ fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.4 }}>
                    <span style={{ color: 'var(--primary-color)', marginRight: '6px' }}>Câu {displayIndex}:</span>
                    <span style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanHtmlExplanation(q.content) }} />
                  </div>
                  
                  {/* Edit/Delete actions */}
                  <div className="flex gap-1">
                    <button 
                      className="btn btn-secondary p-1"
                      style={{ borderColor: 'transparent', color: 'var(--primary-color)' }}
                      onClick={() => handleOpenEditModal(q)}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      className="btn btn-secondary p-1"
                      style={{ borderColor: 'transparent', color: 'var(--toast-error)' }}
                      onClick={() => handleDelete(q.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Question image if present */}
                {q.imageUrl && (
                  <img
                    src={q.imageUrl}
                    alt="Hình ảnh câu hỏi"
                    style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '6px', marginTop: '6px', border: '1px solid var(--border-color)' }}
                  />
                )}

                {/* Answers list */}
                <div className="grid grid-cols-2 gap-3" style={{ paddingLeft: '1rem', marginTop: '0.5rem' }}>
                  {q.answersList?.map((ans, aIdx) => {
                    const alphabet = String.fromCharCode(65 + aIdx); // A, B, C, D
                    return (
                      <div 
                        key={ans.id} 
                        className="flex items-center gap-2 p-2"
                        style={{ 
                          borderRadius: '6px',
                          border: `1px solid ${ans.isCorrect ? 'rgba(82, 196, 26, 0.3)' : 'var(--border-color)'}`,
                          backgroundColor: ans.isCorrect ? 'rgba(82, 196, 26, 0.05)' : 'transparent'
                        }}
                      >
                        {ans.isCorrect ? (
                          <CheckCircle2 size={16} style={{ color: 'var(--toast-success)', flexShrink: 0 }} />
                        ) : (
                          <XCircle size={16} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                        )}
                        <span style={{ fontWeight: 600, color: ans.isCorrect ? 'var(--toast-success)' : 'var(--text-secondary)' }}>
                          {alphabet}.
                        </span>
                        <span style={{ fontSize: '0.9rem', color: ans.isCorrect ? 'var(--toast-success)' : 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                          {ans.content}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                {q.explanation && (
                  <div 
                    style={{ 
                      fontSize: '0.85rem', 
                      backgroundColor: 'rgba(0,0,0,0.02)', 
                      padding: '8px 12px', 
                      borderRadius: '6px', 
                      marginTop: '0.5rem',
                      borderLeft: '3px solid var(--sidebar-header)'
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Giải thích: </span>
                    <div className="explanation-content" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanHtmlExplanation(q.explanation) }} />
                    {q.explanationImage && (
                      <img
                        src={q.explanationImage}
                        alt="Hình ảnh giải thích"
                        style={{ display: 'block', maxWidth: '100%', maxHeight: '160px', objectFit: 'contain', borderRadius: '4px', marginTop: '8px', border: '1px solid var(--border-color)' }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-4">
              <button 
                className="btn btn-secondary py-1"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              >
                Trước
              </button>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                Trang {currentPage} / {totalPages}
              </span>
              <button 
                className="btn btn-secondary py-1"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              >
                Sau
              </button>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Edit/Add Question Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingQuestion ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi mới'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }}
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSaveQuestion}>
              {/* Question Text */}
              <div className="form-group">
                <label className="form-label">Nội dung câu hỏi</label>
                <textarea 
                  className="input" 
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  required
                  placeholder="Nhập nội dung câu hỏi..."
                  value={questionContent}
                  onChange={(e) => setQuestionContent(e.target.value)}
                />
              </div>

              {/* Question Image */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Image size={15} />
                  Hình ảnh câu hỏi (Tùy chọn)
                </label>
                {questionImageUrl ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                      src={questionImageUrl}
                      alt="Xem trước"
                      style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'block' }}
                    />
                    <button
                      type="button"
                      onClick={() => setQuestionImageUrl('')}
                      style={{
                        position: 'absolute', top: '6px', right: '6px',
                        background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%',
                        width: '26px', height: '26px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
                      }}
                      title="Xóa ảnh"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: '8px', padding: '20px',
                      border: '2px dashed var(--border-color)', borderRadius: '8px',
                      cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary-color)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                    onClick={() => setLastImgFocus('question')}
                  >
                    <Image size={28} />
                    <span>Nhấp để chọn ảnh, hoặc dán ảnh từ clipboard (Ctrl+V)</span>
                    <span style={{ fontSize: '0.78rem' }}>PNG, JPG, GIF, WebP — tối đa 5MB</span>
                    <input
                      ref={questionImgRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f, setQuestionImageUrl); e.target.value = ''; }}
                    />
                  </label>
                )}
              </div>

              {/* Answers Grid */}
              <div className="form-group">
                <div className="flex justify-between items-center mb-1">
                  <label className="form-label">Danh sách đáp án</label>
                  <button 
                    type="button" 
                    className="btn btn-secondary py-1 px-2"
                    style={{ fontSize: '0.8rem' }}
                    onClick={addAnswerField}
                  >
                    + Thêm dòng
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {answers.map((ans, idx) => {
                    const alphabet = String.fromCharCode(65 + idx);
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        {/* Checkbox correct */}
                        <label 
                          className="checkbox-container" 
                          style={{ cursor: 'pointer' }}
                          title="Đánh dấu đây là đáp án đúng"
                        >
                          <input 
                            type="checkbox"
                            checked={ans.isCorrect}
                            onChange={(e) => handleAnswerChange(idx, 'isCorrect', e.target.checked)}
                          />
                          <span className="checkmark"></span>
                        </label>
                        
                        <span style={{ fontWeight: 600, width: '20px' }}>{alphabet}.</span>
                        
                        <input 
                          type="text" 
                          className="input" 
                          placeholder={`Nhập đáp án ${alphabet}...`}
                          required={idx < 2} // at least first 2 answers are required
                          value={ans.content}
                          onChange={(e) => handleAnswerChange(idx, 'content', e.target.value)}
                        />
                        
                        <button 
                          type="button" 
                          className="btn btn-secondary p-1"
                          style={{ color: 'var(--toast-error)', borderColor: 'transparent' }}
                          onClick={() => removeAnswerField(idx)}
                          disabled={answers.length <= 2}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Explanation */}
              <div className="form-group">
                <label className="form-label">Giải thích chi tiết (Tùy chọn)</label>
                <RichTextEditor 
                  value={questionExplanation}
                  onChange={setQuestionExplanation}
                  placeholder="Nhập giải thích vì sao đáp án này đúng..."
                />
              </div>

              {/* Explanation Image */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Image size={15} />
                  Hình ảnh giải thích (Tùy chọn)
                </label>
                {questionExplanationImage ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                      src={questionExplanationImage}
                      alt="Xem trước giải thích"
                      style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'block' }}
                    />
                    <button
                      type="button"
                      onClick={() => setQuestionExplanationImage('')}
                      style={{
                        position: 'absolute', top: '6px', right: '6px',
                        background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%',
                        width: '26px', height: '26px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
                      }}
                      title="Xóa ảnh"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: '8px', padding: '16px',
                      border: '2px dashed var(--border-color)', borderRadius: '8px',
                      cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary-color)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                    onClick={() => setLastImgFocus('explanation')}
                  >
                    <Image size={24} />
                    <span>Nhấp để chọn ảnh giải thích</span>
                    <input
                      ref={explImgRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f, setQuestionExplanationImage); e.target.value = ''; }}
                    />
                  </label>
                )}
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                >
                  Lưu lại
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


    </div>
  );
};
