import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

const prisma = new PrismaClient();

// PUT /api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/edit
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; sessionId: string; assignmentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Await params since it's now a Promise in Next.js 15
    const { assignmentId: assignmentIdParam } = await params;
    const assignmentId = parseInt(assignmentIdParam);
    
    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid assignment ID' }, { status: 400 });
    }

    const body = await request.json();
    const {
      title,
      description,
      instructions,
      assignment_type_id,
      total_points,
      due_date,
      time_limit,
      attempts_allowed,
      show_results,
      is_published,
      questions,
    } = body;

    // Check if assignment exists and user has permission to edit
    const existingAssignment = await prisma.assignments.findUnique({
      where: { id: assignmentId },
      include: {
        assignment_questions: {
          include: {
            assignment_question_options: true,
          },
        },
        assignment_submissions: true,
      },
    });

    if (!existingAssignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Check if user is the creator or has permission to edit
    if (existingAssignment.created_by !== parseInt(session.user.id)) {
      return NextResponse.json({ error: 'Forbidden: You can only edit assignments you created' }, { status: 403 });
    }

    const hasSubmissions = existingAssignment.assignment_submissions.length > 0;

    if (hasSubmissions) {
      // For assignments with submissions, only allow safe field updates
      const updatedAssignment = await prisma.assignments.update({
        where: { id: assignmentId },
        data: {
          title,
          description: description || null,
          instructions: instructions || null,
          due_date: due_date ? new Date(due_date) : null,
          show_results: Boolean(show_results),
          is_published: Boolean(is_published),
          updated_date: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        data: updatedAssignment,
        message: 'Assignment updated successfully (limited fields due to existing submissions)',
        warning: 'Some fields cannot be modified because students have already submitted responses.',
      });
    }

    // Use transaction to update assignment and questions
    const result = await prisma.$transaction(async tx => {
      // Update the assignment
      const updatedAssignment = await tx.assignments.update({
        where: { id: assignmentId },
        data: {
          title,
          description: description || null,
          instructions: instructions || null,
          assignment_type_id: parseInt(assignment_type_id),
          total_points: parseInt(total_points),
          due_date: due_date ? new Date(due_date) : null,
          time_limit: time_limit ? parseInt(time_limit) : null,
          attempts_allowed: parseInt(attempts_allowed),
          show_results: Boolean(show_results),
          is_published: Boolean(is_published),
          updated_date: new Date(),
        },
      });

      // Delete existing questions and options
      await tx.assignment_question_options.deleteMany({
        where: {
          assignment_questions: {
            assignment_id: assignmentId,
          },
        },
      });

      await tx.assignment_questions.deleteMany({
        where: { assignment_id: assignmentId },
      });

      // Create new questions
      for (const [index, question] of questions.entries()) {
        const createdQuestion = await tx.assignment_questions.create({
          data: {
            assignment_id: assignmentId,
            question_type_id: parseInt(question.question_type_id),
            question_text: question.question_text,
            points: parseInt(question.points),
            order_number: question.order_number || index + 1,
            required: Boolean(question.required),
          },
        });

        // Create options if they exist
        if (question.options && question.options.length > 0) {
          for (const option of question.options) {
            await tx.assignment_question_options.create({
              data: {
                question_id: createdQuestion.id,
                option_text: option.option_text,
                is_correct: Boolean(option.is_correct),
                order_number: parseInt(option.order_number),
              },
            });
          }
        }
      }

      return updatedAssignment;
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Assignment updated successfully',
    });
  } catch (error) {
    console.error('Error updating assignment:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update assignment',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}