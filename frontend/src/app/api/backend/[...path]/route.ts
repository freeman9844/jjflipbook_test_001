import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// GET Proxy
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const resolvedParams = await params;
    const path = resolvedParams.path.join('/');
    const searchParams = request.nextUrl.search;
    const url = `${BACKEND_URL}/${path}${searchParams}`;

    try {
        const res = await fetch(url);
        const responseContentType = res.headers.get('content-type') || '';
        let data;
        if (responseContentType.includes('application/json')) {
            data = await res.json();
        } else {
            data = { message: await res.text() };
        }
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        console.error(`[Proxy GET Error] ${url}:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST Proxy
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const resolvedParams = await params;
    const path = resolvedParams.path.join('/');
    const searchParams = request.nextUrl.search;
    const url = `${BACKEND_URL}/${path}${searchParams}`;

    try {
        const contentType = request.headers.get('content-type') || 'application/json';
        const apiKey = process.env.INTERNAL_API_KEY || 'secret_dev_key';

        const res = await fetch(url, {
            method: 'POST',
            body: request.body, 
            headers: {
                'Content-Type': contentType,
                'X-API-Key': apiKey
            },
            // @ts-ignore
            duplex: 'half'
        } as any);

        // FastAPI 500 에러 등에 대비하여 JSON이 아닐 경우 텍스트로 조회하여 방어
        const responseContentType = res.headers.get('content-type') || '';
        let data;
        if (responseContentType.includes('application/json')) {
            data = await res.json();
        } else {
            data = { message: await res.text() };
        }

        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE Proxy
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const resolvedParams = await params;
    const path = resolvedParams.path.join('/');
    const searchParams = request.nextUrl.search;
    const url = `${BACKEND_URL}/${path}${searchParams}`;

    try {
        const res = await fetch(url, { 
            method: 'DELETE',
            headers: { 'X-API-Key': process.env.INTERNAL_API_KEY || 'secret_dev_key' }
        });
        const responseContentType = res.headers.get('content-type') || '';
        let data;
        if (responseContentType.includes('application/json')) {
            data = await res.json();
        } else {
            data = { message: await res.text() };
        }
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        console.error(`[Proxy DELETE Error] ${url}:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
