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
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
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
        let body: any;

        if (contentType.includes('multipart/form-data')) {
            // FormData 파싱 및 전파
            body = await request.formData();
        } else if (contentType.includes('application/json')) {
            body = JSON.stringify(await request.json());
        } else {
            body = await request.blob();
        }

        const res = await fetch(url, {
            method: 'POST',
            body: body,
            // headers 전달 시 폼 데이터는 헬퍼가 바운더리 자동 생성하도록 헤더 생략
            headers: contentType.includes('multipart/form-data') 
                ? { 'X-API-Key': process.env.INTERNAL_API_KEY || 'secret_dev_key' } 
                : { 'Content-Type': contentType, 'X-API-Key': process.env.INTERNAL_API_KEY || 'secret_dev_key' }
        });

        const data = await res.json();
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
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
