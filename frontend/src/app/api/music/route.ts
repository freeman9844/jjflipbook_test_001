import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const musicDir = path.join(process.cwd(), 'public', 'Reading_Playlist_MP3');
        if (!fs.existsSync(musicDir)) {
            return NextResponse.json({ files: [] });
        }
        const files = fs.readdirSync(musicDir).filter(file => file.endsWith('.mp3'));
        return NextResponse.json({ files });
    } catch (error) {
        return NextResponse.json({ files: [] }, { status: 500 });
    }
}
