import React, { useEffect, useState } from 'react';

// Data dummy assignment per course
const initialAssignments = [
  {
    id: 1,
    title: 'Latihan Biologi',
    courseName: 'BIOLOGI',
    courseCode: 'BIO6713004',
    className: 'X-MIPA',
    courseType: 'Core Courses',
    done: false,
    questions: [
      {
        type: 'essay',
        question: 'Jelaskan proses fotosintesis!',
      },
      {
        type: 'pilihan_ganda',
        question: 'Manakah berikut ini yang merupakan hasil fotosintesis?',
        options: ['Oksigen', 'Karbon dioksida', 'Air', 'Nitrogen'],
      },
    ],
    answers: [
      { student: 'Budi', answers: ['', ''], score: null },
      { student: 'Ani', answers: ['', ''], score: null },
    ],
  },
];

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-md relative">
        <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-700" onClick={onClose}>
          &times;
        </button>
        {children}
      </div>
    </div>
  );
}

export default function AssignmentTab() {
  const [assignments, setAssignments] = useState(initialAssignments);
  const unfinished = assignments.filter(a => !a.done).length;
  const [isGuru, setIsGuru] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [form, setForm] = useState({
    title: '',
    questions: [{ type: 'essay', question: '', options: [''] }],
  });
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [answer, setAnswer] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem('user');
      if (user) {
        const parsed = JSON.parse(user);
        setIsGuru(parsed.role === 'GURU');
        setUserName(parsed.username || '');
        setUserRole(parsed.role || '');
      }
    }
  }, []);

  // Handler untuk tambah assignment
  const handleAddAssignment = () => {
    const newAssignment = {
      id: assignments.length + 1,
      title: form.title,
      courseName: assignments[0]?.courseName || 'BIOLOGI',
      courseCode: assignments[0]?.courseCode || 'BIO6713004',
      className: assignments[0]?.className || 'X-MIPA',
      courseType: assignments[0]?.courseType || 'Core Courses',
      done: false,
      questions: form.questions.map(q => ({
        type: q.type,
        question: q.question,
        options: q.type === 'pilihan_ganda' ? q.options : undefined,
      })),
      answers: [
        { student: 'Budi', answers: Array(form.questions.length).fill(''), score: null },
        { student: 'Ani', answers: Array(form.questions.length).fill(''), score: null },
      ],
    };
    setAssignments([...assignments, newAssignment]);
    setShowAddModal(false);
    setForm({ title: '', questions: [{ type: 'essay', question: '', options: [''] }] });
  };

  // Handler klik card assignment
  const handleCardClick = (a: any) => {
    setSelectedAssignment(a);
    // Cek apakah user sudah submit
    const myAns = a.answers.find((ans: any) => ans.student === userName);
    setAnswer(myAns ? myAns.answers : Array(a.questions.length).fill(''));
    setShowDetailModal(true);
  };

  // Handler submit jawaban murid
  const handleSubmitAnswer = () => {
    if (!selectedAssignment) return;
    setAssignments(prev =>
      prev.map(a =>
        a.id === selectedAssignment.id
          ? {
              ...a,
              answers: a.answers.map(ans => (ans.student === userName ? { ...ans, answers: answer } : ans)),
              done: true,
            }
          : a
      )
    );
    setShowDetailModal(false);
  };

  // Handler tambah pertanyaan
  const handleAddQuestion = () => {
    setForm(f => ({
      ...f,
      questions: [...f.questions, { type: 'essay', question: '', options: [''] }],
    }));
  };

  // Handler hapus pertanyaan
  const handleRemoveQuestion = (idx: number) => {
    setForm(f => ({
      ...f,
      questions: f.questions.filter((_, i) => i !== idx),
    }));
  };

  // Handler edit pertanyaan
  const handleQuestionChange = (idx: number, field: string, value: any) => {
    setForm(f => ({
      ...f,
      questions: f.questions.map((q, i) => (i === idx ? { ...q, [field]: value } : q)),
    }));
  };

  // Handler tambah opsi pada pertanyaan pilihan ganda
  const handleAddOption = (qIdx: number) => {
    setForm(f => ({
      ...f,
      questions: f.questions.map((q, i) => (i === qIdx ? { ...q, options: [...(q.options || []), ''] } : q)),
    }));
  };

  // Handler edit opsi
  const handleOptionChange = (qIdx: number, oIdx: number, value: string) => {
    setForm(f => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIdx ? { ...q, options: q.options.map((opt: string, j: number) => (j === oIdx ? value : opt)) } : q
      ),
    }));
  };

  return (
    <div className="relative">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {assignments.map(a => (
          <div
            key={a.id}
            onClick={() => handleCardClick(a)}
            className={`relative bg-white p-6 rounded-md shadow border transition hover:shadow-lg group cursor-pointer ${
              a.done ? 'opacity-80' : ''
            }`}
          >
            <div className="font-bold text-lg mb-1">{a.title || a.courseName}</div>
            <div className="text-gray-600 flex items-center mb-1">
              <span className="mr-2">Kode:</span> <span className="font-mono">{a.courseCode}</span>
            </div>
            <div className="text-gray-600 flex items-center mb-4">
              <span className="mr-2">Kelas:</span> <span>{a.className}</span>
            </div>
            {/* Hover: tampilkan course type */}
            <div className="absolute left-0 right-0 bottom-0 px-6 py-2 bg-gray-800 text-white text-sm rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Course type: <span className="font-semibold">{a.courseType}</span>
            </div>
            {/* Status selesai */}
            {a.done ? (
              <div className="text-green-600 font-semibold mt-2">Selesai</div>
            ) : (
              <div className="text-red-600 font-semibold mt-2">Belum Selesai</div>
            )}
          </div>
        ))}
      </div>
      {/* Status global */}
      {unfinished === 0 ? (
        <div className="text-green-600 font-bold text-lg text-center">All Done</div>
      ) : (
        <div className="text-red-600 font-bold text-lg text-center">Sisa {unfinished} assignment</div>
      )}
      {/* Floating button untuk guru */}
      {isGuru && (
        <button
          className="fixed bottom-8 right-8 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg w-16 h-16 flex items-center justify-center text-3xl transition-all"
          title="Tambah Soal"
          onClick={() => setShowAddModal(true)}
        >
          +
        </button>
      )}

      {/* Modal tambah assignment (banyak pertanyaan) */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)}>
        <h2 className="text-xl font-bold mb-4">Tambah Assignment</h2>
        <div className="mb-2">
          <label className="block mb-1">Judul Assignment</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Contoh: UTS Biologi"
          />
        </div>
        {form.questions.map((q, idx) => (
          <div key={idx} className="mb-4 border rounded p-2 relative">
            <button
              className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-lg"
              onClick={() => handleRemoveQuestion(idx)}
              title="Hapus pertanyaan"
              disabled={form.questions.length === 1}
            >
              &times;
            </button>
            <div className="mb-2">
              <label className="block mb-1">Tipe Soal</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={q.type}
                onChange={e => handleQuestionChange(idx, 'type', e.target.value)}
              >
                <option value="essay">Essay</option>
                <option value="pilihan_ganda">Pilihan Ganda</option>
              </select>
            </div>
            <div className="mb-2">
              <label className="block mb-1">Pertanyaan</label>
              <textarea
                className="border rounded px-2 py-1 w-full"
                value={q.question}
                onChange={e => handleQuestionChange(idx, 'question', e.target.value)}
              />
            </div>
            {q.type === 'pilihan_ganda' && (
              <div className="mb-2">
                <label className="block mb-1">Opsi Jawaban</label>
                {q.options.map((opt: string, oIdx: number) => (
                  <input
                    key={oIdx}
                    className="border rounded px-2 py-1 w-full mb-1"
                    value={opt}
                    onChange={e => handleOptionChange(idx, oIdx, e.target.value)}
                    placeholder={`Opsi ${oIdx + 1}`}
                  />
                ))}
                <button
                  className="mt-1 text-blue-600 hover:underline text-sm"
                  onClick={e => {
                    e.preventDefault();
                    handleAddOption(idx);
                  }}
                >
                  + Tambah Opsi
                </button>
              </div>
            )}
          </div>
        ))}
        <button className="bg-gray-200 text-gray-700 px-3 py-1 rounded mb-2 mr-2" onClick={handleAddQuestion}>
          + Tambah Pertanyaan
        </button>
        <button className="bg-blue-600 text-white px-4 py-2 rounded mt-2" onClick={handleAddAssignment}>
          Simpan Assignment
        </button>
      </Modal>

      {/* Modal detail assignment (untuk klik card) */}
      <Modal open={showDetailModal} onClose={() => setShowDetailModal(false)}>
        {selectedAssignment && (
          <div>
            <h2 className="text-xl font-bold mb-2">{selectedAssignment.title || 'Assignment'}</h2>
            {selectedAssignment.questions.map((q: any, idx: number) => (
              <div key={idx} className="mb-4">
                <div className="font-semibold mb-1">
                  {idx + 1}. {q.question}
                </div>
                {q.type === 'pilihan_ganda' && q.options && (
                  <ul className="mb-2">
                    {q.options.map((opt: string, oIdx: number) => (
                      <li key={oIdx}>
                        {String.fromCharCode(65 + oIdx)}. {opt}
                      </li>
                    ))}
                  </ul>
                )}
                {/* Untuk murid: tampilkan form jawab ATAU hasil jawaban jika sudah submit */}
                {userRole === 'STUDENT' && (
                  <div>
                    {(() => {
                      // Cek apakah sudah submit (jawaban tidak kosong semua)
                      const myAns = selectedAssignment.answers.find((ans: any) => ans.student === userName);
                      const sudahSubmit = myAns && myAns.answers.some((a: string) => a && a.length > 0);
                      if (sudahSubmit) {
                        // Tampilkan jawaban readonly
                        return (
                          <div className="bg-gray-100 p-2 rounded mb-2">
                            <div className="text-gray-600 text-sm mb-1">Jawaban Anda:</div>
                            <div className="text-gray-800">
                              {myAns.answers[idx] ? (
                                myAns.answers[idx]
                              ) : (
                                <span className="italic text-gray-400">Belum dijawab</span>
                              )}
                            </div>
                          </div>
                        );
                      } else {
                        // Tampilkan form jawab
                        return q.type === 'essay' ? (
                          <textarea
                            className="border rounded px-2 py-1 w-full mb-2"
                            value={answer[idx] || ''}
                            onChange={e =>
                              setAnswer(ans => {
                                const copy = [...ans];
                                copy[idx] = e.target.value;
                                return copy;
                              })
                            }
                          />
                        ) : (
                          <select
                            className="border rounded px-2 py-1 w-full mb-2"
                            value={answer[idx] || ''}
                            onChange={e =>
                              setAnswer(ans => {
                                const copy = [...ans];
                                copy[idx] = e.target.value;
                                return copy;
                              })
                            }
                          >
                            <option value="">Pilih jawaban</option>
                            {q.options.map((opt: string, oIdx: number) => (
                              <option key={oIdx} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        );
                      }
                    })()}
                  </div>
                )}
              </div>
            ))}
            {/* Untuk murid: tombol submit hanya jika belum submit */}
            {userRole === 'STUDENT' &&
              (() => {
                const myAns = selectedAssignment.answers.find((ans: any) => ans.student === userName);
                const sudahSubmit = myAns && myAns.answers.some((a: string) => a && a.length > 0);
                return !sudahSubmit ? (
                  <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={handleSubmitAnswer}>
                    Submit
                  </button>
                ) : null;
              })()}
            {/* Untuk guru: lihat jawaban murid */}
            {userRole === 'GURU' && (
              <div className="mt-4">
                <h3 className="font-semibold mb-2">Jawaban Murid</h3>
                <ul>
                  {selectedAssignment.answers.map((ans: any, idx: number) => (
                    <li key={idx} className="mb-2 border-b pb-2">
                      <div className="font-medium">{ans.student}</div>
                      <div>
                        {selectedAssignment.questions.map((q: any, qIdx: number) => (
                          <div key={qIdx} className="mb-1">
                            <span className="font-semibold">{qIdx + 1}.</span>{' '}
                            {ans.answers[qIdx] || <span className="italic text-gray-400">Belum dijawab</span>}
                          </div>
                        ))}
                      </div>
                      <div>
                        <label className="mr-2">Nilai:</label>
                        <input
                          type="number"
                          className="border rounded px-2 py-1 w-20"
                          value={ans.score === null || ans.score === undefined ? '' : ans.score}
                          onChange={e => {
                            const val = e.target.value;
                            setAssignments(prev =>
                              prev.map(a =>
                                a.id === selectedAssignment.id
                                  ? {
                                      ...a,
                                      answers: a.answers.map((aAns: any, aIdx: number) =>
                                        aIdx === idx ? { ...aAns, score: val === '' ? null : Number(val) } : aAns
                                      ),
                                    }
                                  : a
                              )
                            );
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
