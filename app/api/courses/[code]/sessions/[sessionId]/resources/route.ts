import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: { code: string; sessionId: string } }) {
  try {
    const { code, sessionId } = params;
    const body = await request.json();

    console.log('=== RESOURCE SAVE REQUEST ===');
    console.log('Course Code:', code);
    console.log('Session ID:', sessionId);
    console.log('Request Body:', body);
    console.log('============================');

    // TODO: Replace this with your actual database save
    // Example with Prisma:
    // const resource = await prisma.session_resources.create({
    //   data: {
    //     session_id: parseInt(sessionId),
    //     file_name: body.file_name,
    //     file_url: body.file_url,
    //     file_type: body.file_type,
    //     title: body.title,
    //     description: body.description,
    //     created_at: new Date(),
    //   }
    // });

    // For now, store in memory/local storage (TEMPORARY SOLUTION)
    const resource = {
      id: Date.now(),
      session_id: parseInt(sessionId),
      file_name: body.file_name,
      file_url: body.file_url,
      file_type: body.file_type,
      title: body.title,
      description: body.description,
      created_at: new Date().toISOString(),
    };

    // TEMPORARY: Store in a JSON file (replace with real database)
    const fs = require('fs');
    const path = require('path');
    const resourcesFile = path.join(process.cwd(), 'temp_resources.json');

    let resources = [];
    try {
      const fileContent = fs.readFileSync(resourcesFile, 'utf8');
      resources = JSON.parse(fileContent);
    } catch (error) {
      // File doesn't exist yet
      resources = [];
    }

    resources.push(resource);
    fs.writeFileSync(resourcesFile, JSON.stringify(resources, null, 2));

    return NextResponse.json({
      success: true,
      message: 'Resource saved successfully',
      data: resource,
    });
  } catch (error) {
    console.error('=== API ERROR ===');
    console.error('Error details:', error);

    return NextResponse.json(
      {
        error: 'Failed to save resource',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, { params }: { params: { code: string; sessionId: string } }) {
  try {
    const { sessionId } = params;

    console.log('=== RESOURCE FETCH REQUEST ===');
    console.log('Session ID:', sessionId);
    console.log('===============================');

    // TODO: Replace with your actual database fetch
    // Example with Prisma:
    // const resources = await prisma.session_resources.findMany({
    //   where: { session_id: parseInt(sessionId) },
    //   orderBy: { created_at: 'desc' }
    // });

    // TEMPORARY: Read from JSON file (replace with real database)
    const fs = require('fs');
    const path = require('path');
    const resourcesFile = path.join(process.cwd(), 'temp_resources.json');

    let allResources = [];
    try {
      const fileContent = fs.readFileSync(resourcesFile, 'utf8');
      allResources = JSON.parse(fileContent);
    } catch (error) {
      allResources = [];
    }

    // Filter resources for this session
    const sessionResources = allResources.filter(resource => resource.session_id === parseInt(sessionId));

    return NextResponse.json({
      success: true,
      data: sessionResources,
    });
  } catch (error) {
    console.error('=== FETCH ERROR ===');
    console.error('Error details:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch resources',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
