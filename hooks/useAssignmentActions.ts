import { useCallback } from 'react';
import { Assignment } from './useAssignmentData';

export const useAssignmentActions = (courseCode: string, onRefresh: () => void) => {
  const handlePublishToggle = useCallback(
    async (assignment: Assignment) => {
      try {
        const response = await fetch(
          `/api/courses/${courseCode}/sessions/${assignment.session_id}/assignments/${assignment.id}/publish`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_published: !assignment.is_published }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update assignment status');
        }

        onRefresh();
      } catch (error) {
        console.error('Error updating assignment status:', error);
        throw error;
      }
    },
    [courseCode, onRefresh]
  );

  const handleBulkPublish = useCallback(
    async (assignments: Assignment[], publish: boolean) => {
      const targetAssignments = assignments.filter(a => a.is_published !== publish);

      if (targetAssignments.length === 0) {
        alert(`All assignments are already ${publish ? 'published' : 'unpublished'}.`);
        return;
      }

      const confirmMessage = `Are you sure you want to ${publish ? 'publish' : 'unpublish'} ${
        targetAssignments.length
      } assignment${targetAssignments.length !== 1 ? 's' : ''}?`;

      if (!confirm(confirmMessage)) {
        return;
      }

      try {
        const promises = targetAssignments.map(assignment =>
          fetch(`/api/courses/${courseCode}/sessions/${assignment.session_id}/assignments/${assignment.id}/publish`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_published: publish }),
          })
        );

        const results = await Promise.allSettled(promises);
        const failed = results.filter(result => result.status === 'rejected').length;

        if (failed > 0) {
          alert(
            `${targetAssignments.length - failed} assignments ${
              publish ? 'published' : 'unpublished'
            } successfully. ${failed} failed.`
          );
        } else {
          alert(`All ${targetAssignments.length} assignments ${publish ? 'published' : 'unpublished'} successfully.`);
        }

        onRefresh();
      } catch (error) {
        console.error('Error bulk updating assignments:', error);
        alert('Failed to update assignments. Please try again.');
      }
    },
    [courseCode, onRefresh]
  );

  const handleSubmitAnswer = useCallback(
    async (assignment: Assignment, answers: any[], currentUserId: number) => {
      try {
        // Transform answers to match API format
        const formattedAnswers = answers
          .map((answer, index) => {
            const question = assignment.questions?.[index];
            if (!question) return null;

            return {
              question_id: question.id,
              answer_text: typeof answer === 'string' ? answer : null,
              selected_option_id:
                typeof answer === 'object' && answer.selected_option_id ? answer.selected_option_id : null,
            };
          })
          .filter(Boolean);

        const response = await fetch(
          `/api/courses/${courseCode}/sessions/${assignment.session_id}/assignments/${assignment.id}/submit`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: currentUserId,
              answers: formattedAnswers,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to submit assignment');
        }
      } catch (error) {
        console.error('Error submitting assignment:', error);
        throw error;
      }
    },
    [courseCode]
  );

  const handleGradeAssignment = useCallback(
    async (assignmentId: number, submissionId: number, grades: any[], feedback: string, graderId: number) => {
      try {
        const response = await fetch(
          `/api/courses/${courseCode}/sessions/${assignmentId}/assignments/${assignmentId}/grade`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              submission_id: submissionId,
              grader_id: graderId,
              grades,
              feedback,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to grade assignment');
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error grading assignment:', error);
        throw error;
      }
    },
    [courseCode]
  );

  return { handlePublishToggle, handleBulkPublish, handleSubmitAnswer, handleGradeAssignment };
};
