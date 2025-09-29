import { NextRequest, NextResponse } from 'next/server';
// import { PrismaClient } from '@/lib/generated/prisma';
import { PrismaClient } from '@prisma/client';
import { SubmissionStatus } from '@/lib/enumeration-service';

const prisma = new PrismaClient();

// POST /api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/grade
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; sessionId: string; assignmentId: string }> }
) {
  try {
    const assignmentId = parseInt((await params).assignmentId);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid assignment ID' }, { status: 400 });
    }

    const body = await request.json();
    const { submission_id, grader_id, grades, feedback } = body;

    if (!submission_id || !grader_id || !grades || !Array.isArray(grades)) {
      return NextResponse.json(
        {
          error: 'Missing required fields: submission_id, grader_id, grades',
        },
        { status: 400 }
      );
    }

    // Verify submission exists
    const submission = await prisma.assignment_submissions.findUnique({
      where: { id: submission_id },
      include: {
        assignment_answers: true,
        assignments: {
          include: {
            assignment_questions: true,
          },
        },
      },
    });

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    if (submission.assignment_id !== assignmentId) {
      return NextResponse.json({ error: 'Submission does not belong to this assignment' }, { status: 400 });
    }

    // Update grades in a transaction
    const result = await prisma.$transaction(async tx => {
      let totalScore = 0;
      let maxPossibleScore = 0;

      // Update individual question scores
      for (const grade of grades) {
        const { question_id, points_earned, feedback: questionFeedback } = grade;

        const answer = submission.assignment_answers.find(a => a.question_id === question_id);
        if (!answer) continue;

        const question = submission.assignments.assignment_questions.find(q => q.id === question_id);
        if (!question) continue;

        await tx.assignment_answers.update({
          where: { id: answer.id },
          data: {
            points_earned: points_earned,
            feedback: questionFeedback,
          },
        });

        totalScore += points_earned;
        maxPossibleScore += question.points || 0;
      }

      // Get GRADED status ID
      const gradedStatusId = await SubmissionStatus.getGradedId();
      if (!gradedStatusId) {
        throw new Error('GRADED status not found in enumeration table');
      }

      // Update submission with total score and grading info
      const updatedSubmission = await tx.assignment_submissions.update({
        where: { id: submission_id },
        data: {
          total_score: totalScore,
          feedback: feedback,
          graded_by: grader_id,
          graded_at: new Date(),
          status_id: gradedStatusId,
        },
      });

      return {
        ...updatedSubmission,
        totalScore,
        maxPossibleScore,
        percentage: maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Assignment graded successfully',
    });
  } catch (error) {
    console.error('Error grading assignment:', error);
    return NextResponse.json(
      {
        error: 'Failed to grade assignment',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET /api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/grade
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; sessionId: string; assignmentId: string }> }
) {
  try {
    const assignmentId = parseInt((await params).assignmentId);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid assignment ID' }, { status: 400 });
    }

    const url = new URL(request.url);
    const submissionId = url.searchParams.get('submission_id');

    if (submissionId) {
      // Get specific submission for grading
      const submission = await prisma.assignment_submissions.findUnique({
        where: { id: parseInt(submissionId) },
        include: {
          assignment_answers: {
            include: {
              assignment_questions: {
                include: {
                  enumeration: true,
                  assignment_question_options: true,
                },
              },
            },
          },
          app_user_assignment_submissions_student_idToapp_user: {
            select: {
              id: true,
              user_name: true,
              nama_lengkap: true,
            },
          },
        },
      });

      if (!submission) {
        return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: submission,
      });
    } else {
      // Get all submissions that need grading
      const submissions = await prisma.assignment_submissions.findMany({
        where: {
          assignment_id: assignmentId,
          graded_at: null, // Not yet graded
        },
        include: {
          assignment_answers: {
            include: {
              assignment_questions: {
                include: {
                  enumeration: true,
                  assignment_question_options: true, // Include options for display
                },
              },
            },
          },
          app_user_assignment_submissions_student_idToapp_user: {
            select: {
              id: true,
              user_name: true,
              nama_lengkap: true,
            },
          },
        },
        orderBy: {
          submitted_at: 'asc',
        },
      });

      // Filter submissions that have essay questions needing manual grading
      const needsGrading = submissions.filter(submission =>
        submission.assignment_answers.some(
          answer =>
            answer.assignment_questions.enumeration.name === 'ESSAY' ||
            answer.assignment_questions.enumeration.name === 'FILE_UPLOAD' ||
            answer.assignment_questions.enumeration.name === 'Essay' ||
            answer.assignment_questions.enumeration.name === 'File Upload'
        )
      );

      return NextResponse.json({
        success: true,
        data: needsGrading,
        message: `Found ${needsGrading.length} submissions requiring manual grading`,
      });
    }
  } catch (error) {
    console.error('Error fetching grading data:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch grading data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
