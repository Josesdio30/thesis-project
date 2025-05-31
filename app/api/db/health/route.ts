import { NextRequest, NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/db-utils';

export async function GET() {
  try {
    const health = await checkDatabaseHealth();
    
    if (health.connected) {
      return NextResponse.json({
        status: 'success',
        message: 'Database connection successful',
        data: health
      }, { status: 200 });
    } else {
      return NextResponse.json({
        status: 'error',
        message: 'Database connection failed',
        error: health.error
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Database health check error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
