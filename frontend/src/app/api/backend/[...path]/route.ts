import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const SESSION_TOKEN = process.env.SESSION_SECRET || "simple-mvp-session-secret-123";

function isAuthenticated(request: NextRequest) {
    const token = request.cookies.get('auth_token')?.value;
    return token === SESSION_TOKEN;
}

// GET Proxy
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const resolvedParams = await params;
    const pathStr = resolvedParams.path.join('/');
    
    // allow public viewing (flipbook metadata and overlays)
    // assuming `/flipbook/{uuid_key}` and `/flipbook/{uuid_key}/overlays` need public access
    // if everything needs auth, just check!
    // the frontend `/view/[uuidKey]/page.tsx` needs to access these without auth if it's public.
    // wait, is viewing public?
    // Let's check `view/[uuidKey]/page.tsx`
    // It doesn't check authentication to render, just to show admin features.
    // So GET to `/flipbook/xxx` and `/flipbook/xxx/overlays` MUST be public!
    // But GET to `/folders` and `/flipbooks` (dashboard lists) should be protected?
    // Dashboard handles auth locally, but API proxy was open.
    // Let's explicitly protect `/folders` and `/flipbooks` GET endpoints.
    
    if (pathStr === 'folders' || pathStr === 'flipbooks') {
        if (!isAuthenticated(request)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const searchParams = request.nextUrl.search;
    const url = `${BACKEND_URL}/${pathStr}${searchParams}`;

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
    const pathStr = resolvedParams.path.join('/');
    const searchParams = request.nextUrl.search;
    const url = `${BACKEND_URL}/${pathStr}${searchParams}`;

    // Handle logout (frontend only, clear cookie)
    if (pathStr === 'logout') {
        const resObj = NextResponse.json({ status: 'ok', message: 'Logged out' });
        resObj.cookies.delete('auth_token');
        return resObj;
    }

    // For all other POST requests except login, check authentication
    if (pathStr !== 'login' && !isAuthenticated(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

        const responseContentType = res.headers.get('content-type') || '';
        let data;
        if (responseContentType.includes('application/json')) {
            data = await res.json();
        } else {
            data = { message: await res.text() };
        }

        const resObj = NextResponse.json(data, { status: res.status });

        // If login was successful, set HttpOnly cookie
        if (pathStr === 'login' && res.ok && data.authenticated) {
            resObj.cookies.set('auth_token', SESSION_TOKEN, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/'
            });
        }

        return resObj;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE Proxy
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    if (!isAuthenticated(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const pathStr = resolvedParams.path.join('/');
    const searchParams = request.nextUrl.search;
    const url = `${BACKEND_URL}/${pathStr}${searchParams}`;

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