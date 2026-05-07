/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, FormEvent } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, orderBy, where 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  School, UserCog, Monitor, MessageSquare, Bell, Search, User, 
  Clock, CheckCircle2, Trash2, Volume2, VolumeX, Plus 
} from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { db, handleFirestoreError, OperationType } from './lib/firebase';

// --- Types & Constants ---
export type TeacherStatus = 'available' | 'in_class' | 'consulting' | 'away';

export interface Teacher {
  id: string;
  name: string;
  status: TeacherStatus;
  updatedAt: number;
}

export interface Call {
  id: string;
  teacherId: string;
  teacherName: string;
  timestamp: number;
  status: 'active' | 'checked';
}

export const STATUS_LABELS: Record<TeacherStatus, string> = {
  available: '자리에 계심',
  in_class: '수업 중',
  consulting: '상담 중',
  away: '부재중',
};

export const STATUS_COLORS: Record<TeacherStatus, string> = {
  available: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  in_class: 'bg-amber-50 text-amber-600 border-amber-100',
  consulting: 'bg-rose-50 text-rose-600 border-rose-100',
  away: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const STATUS_DOT_COLORS: Record<TeacherStatus, string> = {
  available: 'bg-emerald-500',
  in_class: 'bg-amber-500',
  consulting: 'bg-rose-500',
  away: 'bg-slate-500',
};

// --- Components ---

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navItems = [
    { path: '/', label: '학생 호출 (복도)', icon: MessageSquare },
    { path: '/teacher', label: '현황판 (교무실)', icon: Monitor },
    { path: '/admin', label: '교사 관리', icon: UserCog },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center group-hover:bg-blue-700 transition-colors">
              <School className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-800">
              교무실 호출 시스템 <span className="text-blue-600">Smart Call</span>
            </h1>
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest leading-none">System Active</span>
          </div>
          <nav className="flex items-center gap-2 ml-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all
                    ${isActive 
                      ? 'bg-blue-600 text-white shadow-md' 
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 flex justify-around items-center z-50">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-all ${isActive ? 'text-blue-600' : 'text-slate-500'}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-tight">{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StudentDashboard() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'teachers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const teacherData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Teacher[];
      setTeachers(teacherData);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'teachers'));
    return () => unsubscribe();
  }, []);

  const handleCall = async (teacher: Teacher) => {
    try {
      await addDoc(collection(db, 'calls'), {
        teacherId: teacher.id,
        teacherName: teacher.name,
        timestamp: Date.now(),
        status: 'active'
      });
      toast.success(`${teacher.name} 선생님을 호출했습니다!`, { icon: '🔔' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'calls');
    }
  };

  const filteredTeachers = teachers.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">선생님 호출 (학생용)</h2>
          <p className="text-slate-500 text-sm font-medium italic">카드 클릭 시 호출 메시지가 즉시 교무실로 전송됩니다.</p>
        </div>
        <div className="relative group w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500" />
          <input
            type="text"
            placeholder="선생님 성함 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 transition-all text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : filteredTeachers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredTeachers.map((teacher) => (
            <motion.div
              key={teacher.id}
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              className={`bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:border-blue-300 hover:ring-4 hover:ring-blue-100 cursor-pointer transition-all flex flex-col justify-between ${teacher.status === 'in_class' || teacher.status === 'away' ? 'opacity-80' : ''}`}
            >
              <div className="flex flex-col mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-extrabold text-xl text-slate-800">{teacher.name} 선생님</h3>
                  <div className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-widest border ${STATUS_COLORS[teacher.status]}`}>{STATUS_LABELS[teacher.status]}</div>
                </div>
                <div className="flex items-center gap-2 text-slate-400"><User className="w-3.5 h-3.5" /><span className="text-xs font-bold uppercase tracking-tight">Department Office</span></div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); handleCall(teacher); }}
                disabled={teacher.status === 'away' || teacher.status === 'in_class'}
                className={`w-full py-3 rounded-2xl font-extrabold text-sm transition-all shadow-sm ${teacher.status === 'away' || teacher.status === 'in_class' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-100 active:scale-95'}`}
              >
                {teacher.status === 'consulting' ? '상담 대기 요청' : '호출하기'}
              </button>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-slate-100 rounded-3xl border-2 border-dashed border-slate-200"><p className="text-slate-500 font-medium">검색 결과가 없습니다.</p></div>
      )}
    </div>
  );
}

function TeacherDashboard() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastCallCount = useRef(0);

  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    const q = query(collection(db, 'calls'), where('status', '==', 'active'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const callData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Call[];
      setCalls(callData);
      if (callData.length > lastCallCount.current && !isMuted) audioRef.current?.play().catch(() => {});
      lastCallCount.current = callData.length;
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'calls'));
    return () => unsubscribe();
  }, [isMuted]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      calls.forEach(async (call) => {
        if (now - call.timestamp > 5 * 60 * 1000) {
          try { await updateDoc(doc(db, 'calls', call.id), { status: 'checked' }); } catch (e) {}
        }
      });
    }, 60000);
    return () => clearInterval(timer);
  }, [calls]);

  const handleCheck = async (callId: string) => {
    try { await updateDoc(doc(db, 'calls', callId), { status: 'checked' }); } catch (error) { handleFirestoreError(error, OperationType.UPDATE, 'calls'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-800 flex items-center gap-3">
            <span className="flex h-3 w-3 rounded-full bg-blue-600 animate-pulse"></span>
            실시간 호출 현황
          </h2>
          <p className="text-slate-500 text-sm font-medium">교무실 호출 알림 피드입니다. {calls.length}개의 대기 중인 호출이 있습니다.</p>
        </div>
        <button onClick={() => setIsMuted(!isMuted)} className={`p-2.5 rounded-xl transition-all ${isMuted ? 'bg-slate-200 text-slate-500' : 'bg-blue-600 text-white shadow-lg'}`}>
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm flex flex-col">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">Live Notification Feed</span>
          {calls.length > 0 && <span className="text-[10px] font-extrabold px-2 py-1 bg-blue-600 text-white rounded uppercase tracking-wider">{calls.length} NEW CALLS</span>}
        </div>
        
        <div className="p-4 md:p-6 flex flex-col gap-4 min-h-[400px]">
          <AnimatePresence mode="popLayout">
            {calls.length > 0 ? (
              calls.map((call) => (
                <motion.div
                  key={call.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: 20 }}
                  className="p-5 bg-blue-50 border border-blue-100 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group"
                >
                  <div className="flex flex-col">
                    <span className="text-[10px] text-blue-500 font-extrabold uppercase tracking-widest mb-1">Now Calling</span>
                    <p className="text-lg font-extrabold text-slate-800"><span className="text-blue-600">{call.teacherName} 선생님</span>, 학생 호출 도착</p>
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mt-1"><Clock className="w-3 h-3" />{formatDistanceToNow(call.timestamp, { addSuffix: true, locale: ko })} • {new Date(call.timestamp).toLocaleTimeString('ko-KR')}</span>
                  </div>
                  <button onClick={() => handleCheck(call.id)} className="w-full md:w-auto px-6 py-2.5 bg-white text-blue-600 rounded-xl border border-blue-200 font-extrabold text-sm hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95">확인 완료</button>
                </motion.div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-20">
                <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mb-4 border border-slate-100"><Bell className="w-10 h-10 text-slate-200" /></div>
                <h3 className="text-xl font-extrabold text-slate-800">대기 중인 호출 없음</h3>
                <p className="text-slate-400 text-sm font-bold tracking-tight max-w-xs text-center mt-2 uppercase">All students have been checked</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'teachers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const teacherData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Teacher[];
      setTeachers(teacherData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'teachers'));
    return () => unsubscribe();
  }, []);

  const handleAddTeacher = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await addDoc(collection(db, 'teachers'), { name: newName, status: 'available', updatedAt: Date.now() });
      setNewName(''); setIsAdding(false); toast.success('선생님이 등록되었습니다.');
    } catch (error) { handleFirestoreError(error, OperationType.CREATE, 'teachers'); }
  };

  const updateStatus = async (teacherId: string, newStatus: TeacherStatus) => {
    try { await updateDoc(doc(db, 'teachers', teacherId), { status: newStatus, updatedAt: Date.now() }); toast.success('상태가 업데이트되었습니다.'); } catch (error) { handleFirestoreError(error, OperationType.UPDATE, 'teachers'); }
  };

  const deleteTeacher = async (teacherId: string, name: string) => {
    if (!window.confirm(`${name} 선생님 정보를 삭제하시겠습니까?`)) return;
    try { await deleteDoc(doc(db, 'teachers', teacherId)); toast.success('선생님 정보가 삭제되었습니다.'); } catch (error) { handleFirestoreError(error, OperationType.DELETE, 'teachers'); }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-800 uppercase">선생님 상태 관리 <span className="text-blue-600">(Admin)</span></h2>
        {!isAdding && <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-extrabold hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all"><Plus className="w-5 h-5" />선생님 등록</button>}
      </div>

      {isAdding && (
        <form onSubmit={handleAddTeacher} className="bg-white p-6 rounded-[2rem] border border-blue-200 shadow-md flex items-center gap-3">
          <input autoFocus type="text" placeholder="선생님 성함 입력" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1 px-4 py-3 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none font-bold" />
          <button type="submit" className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-extrabold shadow-md">등록</button>
          <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-extrabold">취소</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {teachers.map((teacher) => (
          <div key={teacher.id} className="bg-slate-800 rounded-[2rem] p-6 text-white shadow-xl flex flex-col gap-6 border border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-slate-700 rounded-2xl flex items-center justify-center border border-slate-600"><User className="w-8 h-8 text-slate-400" /></div>
                <div><h3 className="font-extrabold text-xl">{teacher.name}</h3><p className="text-xs text-slate-400 font-extrabold tracking-widest uppercase">Member of Staff</p></div>
              </div>
              <button onClick={() => deleteTeacher(teacher.id, teacher.name)} className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-700 transition-all rounded-xl"><Trash2 className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(STATUS_LABELS) as TeacherStatus[]).map((status) => {
                const isActive = teacher.status === status;
                const statusColor = { available: 'bg-emerald-600 border-emerald-500', in_class: 'bg-amber-600 border-amber-500', consulting: 'bg-rose-600 border-rose-500', away: 'bg-slate-600 border-slate-500' }[status];
                return (
                  <button key={status} onClick={() => updateStatus(teacher.id, status)} className={`py-3.5 rounded-2xl font-extrabold text-sm transition-all border-2 text-center ${isActive ? `${statusColor} text-white shadow-inner ring-2 ring-white/20` : 'bg-slate-700 border-slate-600 text-slate-400 opacity-40 hover:opacity-100'}`}>
                    {STATUS_LABELS[status]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<StudentDashboard />} />
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </Layout>
      <Toaster position="top-right" />
    </BrowserRouter>
  );
}
