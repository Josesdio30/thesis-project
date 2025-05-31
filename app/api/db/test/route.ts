import { NextResponse } from 'next/server';
import { query } from '@/lib/database';
import { checkDatabaseHealth } from '@/lib/db-utils';

export async function GET() {
  try {
    console.log('🔍 Running comprehensive database test...\n');

    // Test 1: Health check
    const health = await checkDatabaseHealth();
    console.log('1. Health check:', health.connected ? '✅' : '❌');

    // Test 2: Basic query
    const basicQuery = await query('SELECT NOW() as current_time, current_database(), current_user');
    console.log('2. Basic query: ✅');
    console.log('   Current time:', basicQuery.rows[0].current_time);
    console.log('   Database:', basicQuery.rows[0].current_database);
    console.log('   User:', basicQuery.rows[0].current_user);

    // Test 3: Check PostgreSQL version
    const versionQuery = await query('SELECT version()');
    const version = versionQuery.rows[0].version.split(' ').slice(0, 2).join(' ');
    console.log('3. PostgreSQL version:', version);

    // Test 4: List existing tables
    const tablesQuery = await query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('4. Tables in database:');
    if (tablesQuery.rows.length > 0) {
      tablesQuery.rows.forEach((row, index) => {
        console.log(`   ${index + 1}. ${row.table_name} (${row.table_type})`);
      });
    } else {
      console.log('   No tables found in public schema');
    }

    // Test 5: Check database size
    const sizeQuery = await query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as database_size
    `);
    console.log('5. Database size:', sizeQuery.rows[0].database_size);

    console.log('\n🎉 All database tests completed successfully!');

    return NextResponse.json({
      status: 'success',
      message: 'Comprehensive database test completed',
      data: {
        health: health,
        database: basicQuery.rows[0].current_database,
        user: basicQuery.rows[0].current_user,
        version: version,
        tables_count: tablesQuery.rows.length,
        tables: tablesQuery.rows,
        size: sizeQuery.rows[0].database_size
      }
    });

  } catch (error) {
    console.error('❌ Database test failed:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Database test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
