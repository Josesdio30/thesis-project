import { Assignment } from '../hooks/useAssignmentData';

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
      if (userSubmission.total_score !== null) {
        return {
          text: `Scored: ${userSubmission.total_score}/${assignment.total_points}`,
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
