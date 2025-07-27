import { Assignment } from '../hooks/useAssignmentData';
import { calculatePercentage, getLetterGrade, needsManualGrading, getScoreDisplayStatus } from './scoringUtils';

export const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const isOverdue = (dueDate?: string) => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

export const getUserSubmission = (assignment: Assignment, currentUserId: number) => {
  if (!currentUserId || !assignment.submissions) return null;
  return assignment.submissions.find(sub => sub.student.id === currentUserId);
};

export const getAssignmentStatus = (assignment: Assignment, isTeacher: boolean, currentUserId?: number) => {
  if (!assignment.is_published) {
    return {
      text: 'Draft',
      color: 'text-orange-700',
      bg: 'bg-orange-100',
      iconName: 'edit',
    };
  }

  if (!isTeacher && currentUserId) {
    const userSubmission = getUserSubmission(assignment, currentUserId);
    if (userSubmission) {
      // Check if assignment needs manual grading
      const scoreInfo = getScoreDisplay(userSubmission.total_score, assignment.total_points, assignment);

      if (scoreInfo.status === 'pending') {
        return {
          text: 'Awaiting Review',
          color: 'text-amber-700',
          bg: 'bg-amber-100',
          iconName: 'clock',
        };
      }

      if (scoreInfo.status === 'partial') {
        return {
          text: `Partial: ${scoreInfo.raw}`,
          color: 'text-blue-700',
          bg: 'bg-blue-100',
          iconName: 'eye',
        };
      }

      if (userSubmission.total_score !== null) {
        return {
          text: `Scored: ${scoreInfo.raw}`,
          color: 'text-purple-700',
          bg: 'bg-purple-100',
          iconName: 'eye',
        };
      }

      return {
        text: 'Submitted',
        color: 'text-blue-700',
        bg: 'bg-blue-100',
        iconName: 'eye',
      };
    }

    if (isOverdue(assignment.due_date)) {
      return {
        text: 'Overdue',
        color: 'text-red-700',
        bg: 'bg-red-100',
        iconName: 'clock',
      };
    }
  }

  return {
    text: 'Published',
    color: 'text-green-700',
    bg: 'bg-green-100',
    iconName: 'globe',
  };
};

export const groupAssignmentsBySession = (assignments: Assignment[]) => {
  return assignments.reduce((groups, assignment) => {
    const sessionTitle = assignment.session_title || 'Unknown Session';
    if (!groups[sessionTitle]) {
      groups[sessionTitle] = [];
    }
    groups[sessionTitle].push(assignment);
    return groups;
  }, {} as Record<string, Assignment[]>);
};

export const filterAssignments = (assignments: Assignment[], isTeacher: boolean) => {
  return assignments.filter(assignment => {
    // For students, only show published assignments
    if (!isTeacher) {
      return assignment.is_published;
    }
    // For teachers, show all assignments
    return true;
  });
};

export const getScoreDisplay = (score: number | null, totalPoints: number, assignment?: Assignment) => {
  // If we have assignment data, check if it needs manual grading
  if (assignment && assignment.questions) {
    const questionTypes = assignment.questions.map(q => ({
      id: q.question_type_id,
      name: q.question_type?.name || 'Unknown',
    }));

    const questions = assignment.questions.map(q => ({
      id: q.id,
      question_type_id: q.question_type_id,
      question_text: q.question_text,
      points: q.points || 0,
    }));

    // Check if this assignment has been fully graded
    const isFullyGraded = score !== null && score > 0;

    const scoreStatus = getScoreDisplayStatus(score, totalPoints, questions, questionTypes, isFullyGraded);

    return {
      raw: scoreStatus.display,
      percentage: scoreStatus.percentage ? `${scoreStatus.percentage.toFixed(1)}%` : 'N/A',
      letterGrade: scoreStatus.letterGrade || 'N/A',
      display: scoreStatus.display,
      status: scoreStatus.status,
    };
  }

  // Fallback to original logic if no assignment data
  if (score === null) {
    return {
      raw: 'Not graded',
      percentage: '0%',
      letterGrade: 'N/A',
      display: 'Not graded',
      status: 'pending' as const,
    };
  }

  const percentage = calculatePercentage(score, totalPoints);
  const letterGrade = getLetterGrade(percentage);

  return {
    raw: `${score}/${totalPoints}`,
    percentage: `${percentage.toFixed(1)}%`,
    letterGrade,
    display: `${score}/${totalPoints} (${percentage.toFixed(1)}% - ${letterGrade})`,
    status: 'graded' as const,
  };
};
export const getSubmissionStatusColor = (score: number | null, totalPoints: number, status?: string) => {
  // Handle pending grading status
  if (status === 'pending') {
    return {
      color: 'text-amber-700',
      bg: 'bg-amber-100',
    };
  }

  if (status === 'partial') {
    return {
      color: 'text-blue-700',
      bg: 'bg-blue-100',
    };
  }

  if (score === null) {
    return {
      color: 'text-yellow-700',
      bg: 'bg-yellow-100',
    };
  }

  const percentage = calculatePercentage(score, totalPoints);

  if (percentage >= 90) {
    return {
      color: 'text-green-700',
      bg: 'bg-green-100',
    };
  } else if (percentage >= 80) {
    return {
      color: 'text-blue-700',
      bg: 'bg-blue-100',
    };
  } else if (percentage >= 70) {
    return {
      color: 'text-orange-700',
      bg: 'bg-orange-100',
    };
  } else {
    return {
      color: 'text-red-700',
      bg: 'bg-red-100',
    };
  }
};
