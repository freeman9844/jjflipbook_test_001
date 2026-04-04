import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const bucketUrl = "https://storage.googleapis.com/storage/v1/b/jjflipbook-gcs-001/o?prefix=bgm/";
        const res = await fetch(bucketUrl, { next: { revalidate: 3600 } });
        if (!res.ok) {
            return NextResponse.json({ files: [] });
        }
        const data = await res.json();
        if (!data.items) {
            return NextResponse.json({ files: [] });
        }
        
        // Return full public URLs
        const files = data.items
            .filter((item: any) => item.name.endsWith('.mp3'))
            .map((item: any) => `https://storage.googleapis.com/jjflipbook-gcs-001/${item.name}`);
            
        return NextResponse.json({ files });
    } catch (error) {
        return NextResponse.json({ files: [] }, { status: 500 });
    }
}
