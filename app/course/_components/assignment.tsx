import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import AssignmentCreateModal from './assignment/assignment-create-modal';
import AssignmentDetailModal from './assignment/assignment-detail-modal';
import { AssignmentHeader } from './assignment/AssignmentHeader';
import { AssignmentGrid } from './assignment/AssignmentGrid';
import { EmptyState } from './assignment/EmptyState';
import { LoadingSpinner } from './assignment/LoadingSpinner';
import { useAssignmentData, Assignment } from '../../../hooks/useAssignmentData';
import { useAssignmentActions } from '../../../hooks/useAssignmentActions';
import { filterAssignments } from '../../../lib/assignmentUtils';

interface AssignmentTabProps {
  courseCode: string;
  sessionId: number;
}

export default function AssignmentTab({ courseCode, sessionId }: AssignmentTabProps) {
  const { data: session } = useSession();
  const [viewMode, setViewMode] = useState<'all' | 'by-session'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  // Custom hooks
  const { assignments, loading, refetch } = useAssignmentData(courseCode);
  const { handlePublishToggle, handleBulkPublish, handleSubmitAnswer } = useAssignmentActions(courseCode, refetch);

  const isTeacher = session?.user?.role === 'TEACHER' || session?.user?.role === 'GURU';
  const currentUserId = session?.user?.id ? parseInt(session.user.id) : null;
  const filteredAssignments = filterAssignments(assignments, isTeacher);

  const handleAssignmentClick = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setShowDetailModal(true);
  };

  const handleEditClick = (assignment: Assignment, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAssignment(assignment);
    setShowEditModal(true);
  };

  const handlePublishToggleWrapper = async (assignment: Assignment, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await handlePublishToggle(assignment);
    } catch (error) {
      alert(
        `Failed to ${assignment.is_published ? 'unpublish' : 'publish'} assignment: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  };

  const handleBulkPublishWrapper = async (publish: boolean) => {
    await handleBulkPublish(assignments, publish);
  };

  const handleSubmitAnswerWrapper = async (answers: any[]) => {
    if (!selectedAssignment || !currentUserId) return;

    try {
      await handleSubmitAnswer(selectedAssignment, answers, currentUserId);
      await refetch(); // Refresh to get updated submission data
    } catch (error) {
      console.error('Error submitting assignment:', error);
      throw error;
    }
  };

  const handleCreateSuccess = () => {
    refetch();
  };

  const handleEditSuccess = () => {
    refetch();
    setShowEditModal(false);
    setSelectedAssignment(null);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <AssignmentHeader
        filteredAssignments={filteredAssignments}
        assignments={assignments}
        isTeacher={isTeacher}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCreateClick={() => setShowCreateModal(true)}
        onBulkPublish={handleBulkPublishWrapper}
      />

      {filteredAssignments.length === 0 ? (
        <EmptyState isTeacher={isTeacher} onCreateClick={isTeacher ? () => setShowCreateModal(true) : undefined} />
      ) : (
        <AssignmentGrid
          assignments={filteredAssignments}
          viewMode={viewMode}
          isTeacher={isTeacher}
          currentUserId={currentUserId || undefined}
          onAssignmentClick={handleAssignmentClick}
          onEditClick={handleEditClick}
          onPublishToggle={handlePublishToggleWrapper}
        />
      )}

      <AssignmentCreateModal
        sessionId={sessionId}
        courseCode={courseCode}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />

      <AssignmentCreateModal
        sessionId={sessionId}
        courseCode={courseCode}
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedAssignment(null);
        }}
        onSuccess={handleEditSuccess}
        editAssignment={selectedAssignment}
      />

      <AssignmentDetailModal
        assignment={selectedAssignment}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedAssignment(null);
        }}
        isTeacher={isTeacher}
        currentUserId={currentUserId || undefined}
        onSubmitAnswer={handleSubmitAnswerWrapper}
        onEdit={assignment => {
          setShowDetailModal(false);
          setSelectedAssignment(assignment);
          setShowEditModal(true);
        }}
      />
    </div>
  );
}
