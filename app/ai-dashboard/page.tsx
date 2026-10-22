'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Sidebar from '../_components/sidebar';
import Topbar from '../_components/topbar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FaRobot,
  FaShieldAlt,
  FaSpinner,
  FaPlay,
  FaLock,
  FaCheckCircle,
  FaExclamationTriangle,
  FaCircle,
} from 'react-icons/fa';
import { AutoGradingModal } from '../course/_components/assignment/AutoGradingModal';
import { PlagiarismModal } from '../course/_components/assignment/PlagiarismModal';
import { Assignment } from '@/hooks/useAssignmentData';

type Tab = 'grading' | 'plagiarism';

interface CourseOption {
  course_code: string;
  course_name: string;
}

interface FeatureAccess {
  ai_grading: boolean;
  plagiarism: boolean;
}

type RunState = 'never' | 'running' | 'completed' | 'failed';

interface GradingRowStatus {
  state: RunState;
  items_processed: number;
  total_students: number;
  average_score_pct: number | null;
}

interface PlagiarismRowStatus {
  state: RunState;
  high: number;
  medium: number;
  clean: number;
  max_similarity_pct: number | null;
}

const POLL_INTERVAL_MS = 5000;

function normalizeGradingState(status: string | null | undefined): RunState {
  if (!status) return 'never';
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'success' || s === 'succeeded') return 'completed';
  if (s === 'failed' || s === 'error') return 'failed';
  if (s === 'running' || s === 'processing' || s === 'pending' || s === 'queued') return 'running';
  return 'never';
}

function normalizePlagiarismState(status: string | null | undefined): RunState {
  if (!status) return 'never';
  const s = status.toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'failed') return 'failed';
  if (s === 'processing' || s === 'running' || s === 'pending' || s === 'queued') return 'running';
  return 'never';
}

function StatusPill({ state }: { state: RunState }) {
  const map: Record<RunState, { label: string; bg: string; color: string; icon: ReactNode }> = {
    never: {
      label: 'Never run',
      bg: 'bg-gray-100',
      color: 'text-gray-600',
      icon: <FaCircle className="text-gray-400" size={8} />,
    },
    running: {
      label: 'Running',
      bg: 'bg-blue-100',
      color: 'text-blue-700',
      icon: <FaSpinner className="animate-spin text-blue-600" size={10} />,
    },
    completed: {
      label: 'Completed',
      bg: 'bg-green-100',
      color: 'text-green-700',
      icon: <FaCheckCircle className="text-green-600" size={10} />,
    },
    failed: {
      label: 'Failed',
      bg: 'bg-red-100',
      color: 'text-red-700',
      icon: <FaExclamationTriangle className="text-red-600" size={10} />,
    },
  };
  const m = map[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.color}`}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

export default function AiDashboardPage() {
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('grading');

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('');

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);

  const [gradingStatus, setGradingStatus] = useState<Record<number, GradingRowStatus>>({});
  const [plagiarismStatus, setPlagiarismStatus] = useState<Record<number, PlagiarismRowStatus>>({});

  const [showGradingModal, setShowGradingModal] = useState(false);
  const [showPlagiarismModal, setShowPlagiarismModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  const role = session?.user?.role?.toUpperCase();
  const isAllowed = role === 'TEACHER' || role === 'GURU' || role === 'ADMIN';

  // Load courses for current user
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user || !isAllowed) {
      setCoursesLoading(false);
      return;
    }

    const fetchCourses = async () => {
      setCoursesLoading(true);
      try {
        const userId = session.user.id;
        const url =
          role === 'ADMIN' ? '/api/courses' : `/api/courses?teacherId=${userId}`;
        const res = await fetch(url);
        const data = await res.json();
        const list: CourseOption[] = (data?.data || []).map((c: any) => ({
          course_code: c.course_code,
          course_name: c.course_name,
        }));
        const seen = new Set<string>();
        const unique = list.filter(c => {
          if (seen.has(c.course_code)) return false;
          seen.add(c.course_code);
          return true;
        });
        setCourses(unique);
        if (unique.length > 0 && !selectedCourseCode) {
          setSelectedCourseCode(unique[0].course_code);
        }
      } catch (e) {
        console.error('Failed to load courses', e);
        setCourses([]);
      } finally {
        setCoursesLoading(false);
      }
    };

    fetchCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, role, isAllowed]);

  // Load assignments + feature access for selected course
  useEffect(() => {
    if (!selectedCourseCode) {
      setAssignments([]);
      setFeatureAccess(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setAssignmentsLoading(true);
      try {
        const [aRes, fRes] = await Promise.all([
          fetch(`/api/courses/${selectedCourseCode}/assignments`),
          fetch(`/api/courses/${selectedCourseCode}/feature-access`),
        ]);
        const aData = await aRes.json();
        const fData = await fRes.json();
        if (cancelled) return;
        setAssignments(aData?.data || []);
        setFeatureAccess(fData?.success ? fData.data : null);
        setGradingStatus({});
        setPlagiarismStatus({});
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to load course data', e);
        setAssignments([]);
        setFeatureAccess(null);
      } finally {
        if (!cancelled) setAssignmentsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCourseCode]);

  const essayAssignments = useMemo(() => {
    return assignments.filter(a =>
      (a.questions || []).some((q: any) => {
        const t = (q.question_type || '').toUpperCase().replace(/[_ ]/g, '_');
        return t === 'ESSAY' || t === 'FILE_UPLOAD';
      })
    );
  }, [assignments]);

  const visibleAssignments = essayAssignments;

  // ── Per-row status fetchers ──────────────────────────────────
  const fetchGradingStatus = useCallback(async (assignmentId: number): Promise<GradingRowStatus> => {
    try {
      const res = await fetch(`/api/ai-grading/status/latest/${assignmentId}`);
      const data = await res.json();
      if (!data?.success || !data.data) {
        return { state: 'never', items_processed: 0, total_students: 0, average_score_pct: null };
      }
      const d = data.data;
      return {
        state: normalizeGradingState(d.status),
        items_processed: Number(d.items_processed ?? 0),
        total_students: Number(d.total_students ?? 0),
        average_score_pct:
          d.average_score_pct === null || d.average_score_pct === undefined
            ? null
            : Number(d.average_score_pct),
      };
    } catch {
      return { state: 'never', items_processed: 0, total_students: 0, average_score_pct: null };
    }
  }, []);

  const fetchPlagiarismStatus = useCallback(async (assignmentId: number): Promise<PlagiarismRowStatus> => {
    try {
      const statusRes = await fetch(`/api/plagiarism/status/latest/${assignmentId}`);
      const statusData = await statusRes.json();

      if (!statusData || statusData.exists === false) {
        return { state: 'never', high: 0, medium: 0, clean: 0, max_similarity_pct: null };
      }

      const state = normalizePlagiarismState(statusData.status);

      // Aggregate risk breakdown only when completed
      if (state !== 'completed') {
        return { state, high: 0, medium: 0, clean: 0, max_similarity_pct: null };
      }

      const resultsRes = await fetch(`/api/plagiarism/results/${assignmentId}`);
      const results = await resultsRes.json();
      if (!Array.isArray(results)) {
        return { state, high: 0, medium: 0, clean: 0, max_similarity_pct: null };
      }
      let high = 0;
      let medium = 0;
      let clean = 0;
      let maxSim = 0;
      for (const r of results) {
        if ((r.high_risk_count ?? 0) > 0) high += 1;
        else if ((r.medium_risk_count ?? 0) > 0) medium += 1;
        else clean += 1;
        if ((r.max_similarity ?? 0) > maxSim) maxSim = r.max_similarity;
      }
      return {
        state,
        high,
        medium,
        clean,
        max_similarity_pct: results.length > 0 ? Math.round(maxSim * 100) : null,
      };
    } catch {
      return { state: 'never', high: 0, medium: 0, clean: 0, max_similarity_pct: null };
    }
  }, []);

  // ── Lazy parallel load on tab/course change ──────────────────
  const refreshRowStatuses = useCallback(
    async (ids: number[], which: Tab) => {
      if (ids.length === 0) return;
      if (which === 'grading') {
        const entries = await Promise.all(
          ids.map(async id => [id, await fetchGradingStatus(id)] as const)
        );
        setGradingStatus(prev => {
          const next = { ...prev };
          for (const [id, s] of entries) next[id] = s;
          return next;
        });
      } else {
        const entries = await Promise.all(
          ids.map(async id => [id, await fetchPlagiarismStatus(id)] as const)
        );
        setPlagiarismStatus(prev => {
          const next = { ...prev };
          for (const [id, s] of entries) next[id] = s;
          return next;
        });
      }
    },
    [fetchGradingStatus, fetchPlagiarismStatus]
  );

  // Initial / on-change fan-out
  useEffect(() => {
    if (visibleAssignments.length === 0) return;
    const ids = visibleAssignments.map(a => a.id);
    refreshRowStatuses(ids, tab);
  }, [visibleAssignments, tab, refreshRowStatuses]);

  // Polling for running rows
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (visibleAssignments.length === 0) return;

    pollRef.current = setInterval(() => {
      const runningIds = visibleAssignments
        .map(a => a.id)
        .filter(id => {
          if (tab === 'grading') return gradingStatus[id]?.state === 'running';
          return plagiarismStatus[id]?.state === 'running';
        });
      if (runningIds.length > 0) {
        refreshRowStatuses(runningIds, tab);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [visibleAssignments, tab, gradingStatus, plagiarismStatus, refreshRowStatuses]);

  // Refresh after closing a modal (a run may have been kicked off)
  const refreshSelectedRow = useCallback(() => {
    if (!selectedAssignment) return;
    refreshRowStatuses([selectedAssignment.id], tab);
  }, [selectedAssignment, tab, refreshRowStatuses]);

  // Called by modals the moment they get back a jobId / detectionId.
  // 1) Optimistically flip the row to 'running' so the table reflects reality immediately.
  // 2) Schedule re-fetches at 2s/5s/10s to catch the backend-created job record once it lands.
  const handleRunStarted = useCallback(() => {
    if (!selectedAssignment) return;
    const id = selectedAssignment.id;
    const which = tab;

    if (which === 'grading') {
      setGradingStatus(prev => ({
        ...prev,
        [id]: prev[id]
          ? { ...prev[id], state: 'running' }
          : { state: 'running', items_processed: 0, total_students: 0, average_score_pct: null },
      }));
    } else {
      setPlagiarismStatus(prev => ({
        ...prev,
        [id]: prev[id]
          ? { ...prev[id], state: 'running' }
          : { state: 'running', high: 0, medium: 0, clean: 0, max_similarity_pct: null },
      }));
    }

    // Re-fetch true status once the backend has had a chance to record the job.
    for (const delay of [2000, 5000, 10000]) {
      setTimeout(() => refreshRowStatuses([id], which), delay);
    }
  }, [selectedAssignment, tab, refreshRowStatuses]);

  const openGrading = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setShowGradingModal(true);
  };

  const openPlagiarism = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setShowPlagiarismModal(true);
  };

  const tabEnabled =
    tab === 'grading' ? featureAccess?.ai_grading : featureAccess?.plagiarism;
  const tabAccent =
    tab === 'grading'
      ? {
          icon: <FaRobot />,
          color: 'text-indigo-600',
          accent: 'bg-indigo-600 hover:bg-indigo-700',
        }
      : {
          icon: <FaShieldAlt />,
          color: 'text-amber-500',
          accent: 'bg-amber-600 hover:bg-amber-700',
        };

  if (status === 'loading') {
    return (
      <div className="flex max-h-screen">
        <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
        <div className="flex flex-col flex-1 bg-gray-50">
          <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FaSpinner className="animate-spin text-4xl text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">Loading session...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || !session?.user) {
    return (
      <div className="flex max-h-screen">
        <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
        <div className="flex flex-col flex-1 bg-gray-50">
          <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Authentication Required
              </h3>
              <p className="text-gray-600">Please log in to access AI Dashboard.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="flex max-h-screen">
        <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />
        <div className="flex flex-col flex-1 bg-gray-50">
          <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FaLock className="text-4xl text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Access Restricted
              </h3>
              <p className="text-gray-600">
                AI Dashboard is available to teachers and administrators only.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-screen">
      <Sidebar isMobileOpen={sidebarOpen} setIsMobileOpen={setSidebarOpen} />

      <div className="flex flex-col flex-1 bg-gray-50">
        <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex-1 overflow-y-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">AI Dashboard</h1>
                <p className="text-gray-600 mt-1 text-sm">
                  Run automated grading and plagiarism detection across your courses.
                  AI scores are advisory and never replace teacher grading.
                </p>
              </div>
              <Link
                href="/dashboard"
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                ← Back to Dashboard
              </Link>
            </div>

            {/* Tab bar */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setTab('grading')}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  tab === 'grading'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border'
                }`}
              >
                <FaRobot /> Auto-Grading
              </button>
              <button
                onClick={() => setTab('plagiarism')}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  tab === 'plagiarism'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border'
                }`}
              >
                <FaShieldAlt /> Plagiarism
              </button>
            </div>

            {/* Course picker + feature status */}
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 min-w-[260px]">
                  <span className="text-sm font-medium text-gray-700">Course</span>
                  <Select
                    value={selectedCourseCode}
                    onValueChange={setSelectedCourseCode}
                    disabled={coursesLoading || courses.length === 0}
                  >
                    <SelectTrigger className="h-9 w-[260px]">
                      <SelectValue
                        placeholder={
                          coursesLoading
                            ? 'Loading courses…'
                            : courses.length === 0
                            ? 'No courses available'
                            : 'Select a course'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.map(c => (
                        <SelectItem key={c.course_code} value={c.course_code}>
                          {c.course_code} — {c.course_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCourseCode && featureAccess && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Badge
                      variant="outline"
                      className={
                        featureAccess.ai_grading
                          ? 'text-indigo-700 border-indigo-200 bg-indigo-50'
                          : 'text-gray-500'
                      }
                    >
                      <FaRobot className="mr-1.5" />
                      AI Grading {featureAccess.ai_grading ? 'enabled' : 'disabled'}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        featureAccess.plagiarism
                          ? 'text-amber-700 border-amber-200 bg-amber-50'
                          : 'text-gray-500'
                      }
                    >
                      <FaShieldAlt className="mr-1.5" />
                      Plagiarism {featureAccess.plagiarism ? 'enabled' : 'disabled'}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Body */}
          {!selectedCourseCode ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📚</div>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                Select a course to get started
              </h3>
              <p className="text-gray-500">
                Choose one of your courses above to view its assignments.
              </p>
            </div>
          ) : assignmentsLoading ? (
            <div className="text-center py-12">
              <FaSpinner className="animate-spin text-4xl text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">Loading assignments…</p>
            </div>
          ) : !tabEnabled ? (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
              <FaLock className="text-4xl text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                {tab === 'grading'
                  ? 'AI grading is not enabled for this course'
                  : 'Plagiarism detection is not enabled for this course'}
              </h3>
              <p className="text-gray-500 text-sm">
                Ask an administrator to enable this feature for the selected course.
              </p>
            </div>
          ) : visibleAssignments.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📝</div>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                No eligible assignments
              </h3>
              <p className="text-gray-500">
                {tab === 'grading'
                  ? 'AI grading applies to essay and file-upload questions only.'
                  : 'Plagiarism detection applies to essay and file-upload questions only.'}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <span className={tabAccent.color}>{tabAccent.icon}</span>
                <h2 className="text-sm font-semibold text-gray-800">
                  {tab === 'grading' ? 'Auto-Grading' : 'Plagiarism Detection'}
                </h2>
                <span className="text-xs text-gray-500 ml-2">
                  {visibleAssignments.length} assignment
                  {visibleAssignments.length !== 1 ? 's' : ''}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assignment</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead className="text-right">Submissions</TableHead>
                    {tab === 'grading' ? (
                      <>
                        <TableHead>AI Status</TableHead>
                        <TableHead className="text-right">Progress</TableHead>
                        <TableHead className="text-right">Avg AI Score</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Scan Status</TableHead>
                        <TableHead>Risk Breakdown</TableHead>
                        <TableHead className="text-right">Max Sim.</TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleAssignments.map(a => {
                    const subCount = a.submissions?.length ?? 0;
                    const canPlagiarism = subCount >= 2;
                    const gs = gradingStatus[a.id];
                    const ps = plagiarismStatus[a.id];

                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium text-gray-800 max-w-xs">
                          <div className="truncate" title={a.title}>
                            {a.title}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {a.assignment_type} • {a.total_points} pts
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-gray-700 truncate max-w-[200px]">
                            {a.session_title ?? '—'}
                          </div>
                          {a.session_number !== undefined && (
                            <div className="text-xs text-gray-500">
                              Session {a.session_number}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{subCount}</TableCell>

                        {tab === 'grading' ? (
                          <>
                            <TableCell>
                              {gs ? <StatusPill state={gs.state} /> : (
                                <span className="text-xs text-gray-400">Loading…</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm text-gray-700">
                              {gs && gs.state !== 'never' && gs.total_students > 0 ? (
                                <span>
                                  {gs.items_processed} / {gs.total_students}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {gs && gs.state === 'completed' && gs.average_score_pct !== null ? (
                                <span className="text-indigo-700">
                                  {gs.average_score_pct.toFixed(0)}%
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>
                              {ps ? <StatusPill state={ps.state} /> : (
                                <span className="text-xs text-gray-400">Loading…</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {ps && ps.state === 'completed' ? (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                    {ps.high}H
                                  </span>
                                  <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                                    {ps.medium}M
                                  </span>
                                  <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                    {ps.clean}C
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {ps && ps.state === 'completed' && ps.max_similarity_pct !== null ? (
                                <span
                                  className={
                                    ps.max_similarity_pct >= 80
                                      ? 'text-red-700'
                                      : ps.max_similarity_pct >= 60
                                      ? 'text-orange-700'
                                      : 'text-gray-700'
                                  }
                                >
                                  {ps.max_similarity_pct}%
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </TableCell>
                          </>
                        )}

                        <TableCell className="text-right">
                          {tab === 'grading' ? (
                            <button
                              onClick={() => openGrading(a)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors ${tabAccent.accent}`}
                            >
                              <FaPlay size={10} />
                              {gs?.state === 'completed' ? 'View / Rerun' : 'Run AI Grading'}
                            </button>
                          ) : (
                            <button
                              onClick={() => canPlagiarism && openPlagiarism(a)}
                              disabled={!canPlagiarism}
                              title={
                                canPlagiarism
                                  ? undefined
                                  : 'At least 2 submissions are needed.'
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                canPlagiarism
                                  ? `text-white ${tabAccent.accent}`
                                  : 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                              }`}
                            >
                              <FaPlay size={10} />
                              {ps?.state === 'completed' ? 'View / Rescan' : 'Run Check'}
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {selectedAssignment && (
        <AutoGradingModal
          assignment={selectedAssignment}
          courseCode={selectedCourseCode}
          isOpen={showGradingModal}
          onClose={() => {
            setShowGradingModal(false);
            refreshSelectedRow();
            setSelectedAssignment(null);
          }}
          onRunStarted={handleRunStarted}
        />
      )}

      {selectedAssignment && (
        <PlagiarismModal
          assignment={selectedAssignment}
          isOpen={showPlagiarismModal}
          onClose={() => {
            setShowPlagiarismModal(false);
            refreshSelectedRow();
            setSelectedAssignment(null);
          }}
          onRunStarted={handleRunStarted}
        />
      )}
    </div>
  );
}
