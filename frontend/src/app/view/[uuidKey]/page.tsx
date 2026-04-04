"use client";

import React, { useEffect, useState, use, useRef } from 'react';
// Next.js SSR 대응을 위해 클라이언트 사이드 전용 로드로 처리되도록 할 수도 있으나, 
// react-pageflip은 "use client" 상단 선언 시 대부분 정상 로딩됩니다.
import HTMLFlipBook from 'react-pageflip';

export default function FlipbookViewer({ params }: { params: Promise<{ uuidKey: string }> }) {
    // Next 15부터 params는 Promise로 전달됩니다.
    const resolvedParams = use(params);
    const uuidKey = resolvedParams.uuidKey;

    const [book, setBook] = useState<any>(null);
    const [overlays, setOverlays] = useState<any[]>([]);
    const [error, setError] = useState<string>("");
    
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [isAdmin, setIsAdmin] = useState(false);
    const [zoom, setZoom] = useState<number>(100);
    const [windowWidth, setWindowWidth] = useState(1200);
    const [windowHeight, setWindowHeight] = useState(800);
    const [isMounted, setIsMounted] = useState(false);
    const flipBookRef = useRef<any>(null);
    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

    // 배경음악 관련 상태
    const [musicFiles, setMusicFiles] = useState<string[]>([]);
    const [currentSong, setCurrentSong] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setWindowWidth(window.innerWidth);
            setWindowHeight(window.innerHeight);
            setIsMounted(true);
            const handleResize = () => {
                setWindowWidth(window.innerWidth);
                setWindowHeight(window.innerHeight);
            };
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }
    }, []);

    useEffect(() => {
        if (typeof window !== "undefined") {
             setIsAdmin(localStorage.getItem("isAuthenticated") === "true");
        }
    }, []);

    // 키보드 네비게이션 추가 (화살표 키)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!flipBookRef.current) return;
            if (e.key === 'ArrowRight') {
                flipBookRef.current.pageFlip().flipNext();
            } else if (e.key === 'ArrowLeft') {
                flipBookRef.current.pageFlip().flipPrev();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        const fetchBook = async () => {
            try {
                const res = await fetch(`/api/backend/flipbook/${uuidKey}`);
                if (!res.ok) throw new Error("플립북을 찾을 수 없거나 불러오지 못했습니다.");
                const data = await res.json();
                setBook(data);

                // 오버레이 조회 추가
                const overlayRes = await fetch(`/api/backend/flipbook/${uuidKey}/overlays`);
                if (overlayRes.ok) {
                    const overlayData = await overlayRes.json();
                    setOverlays(overlayData);
                }
            } catch (err: any) {
                setError(err.message);
            }
        };
        fetchBook();
    }, [uuidKey]);

    // 음악 목록 불러오기
    useEffect(() => {
        fetch('/api/music')
            .then(res => res.json())
            .then(data => {
                if (data.files && data.files.length > 0) {
                    setMusicFiles(data.files);
                    const randomSong = data.files[Math.floor(Math.random() * data.files.length)];
                    setCurrentSong(randomSong);
                }
            })
            .catch(err => console.error("음악 목록 불러오기 실패:", err));
    }, []);

    // 음악 재생 상태 연동 및 모바일 First-Interaction Unlock 로직
    useEffect(() => {
        // 기존 상태 연동
        if (currentSong && audioRef.current && isPlaying) {
            audioRef.current.play().catch(e => console.log("자동재생 방지됨:", e));
        }

        // 브라우저 정책 우회를 위한 첫 터치 언락 함수
        const unlockAudio = async () => {
            if (audioRef.current && currentSong && !isPlaying) {
                try {
                    await audioRef.current.play();
                    setIsPlaying(true);
                    // 성공하면 더이상 감지할 필요 없음
                    window.removeEventListener('pointerdown', unlockAudio);
                    window.removeEventListener('touchstart', unlockAudio);
                    window.removeEventListener('keydown', unlockAudio);
                } catch (e) {
                    console.log("아직 오디오 락 해제 불가:", e);
                }
            }
        };

        if (typeof window !== 'undefined' && !isPlaying) {
            window.addEventListener('pointerdown', unlockAudio, { once: true });
            window.addEventListener('touchstart', unlockAudio, { once: true });
            window.addEventListener('keydown', unlockAudio, { once: true });
        }

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('pointerdown', unlockAudio);
                window.removeEventListener('touchstart', unlockAudio);
                window.removeEventListener('keydown', unlockAudio);
            }
        };
    }, [currentSong, isPlaying]);

    const handleSongEnd = () => {
        if (musicFiles.length > 0) {
            // 현재 곡 제외하고 랜덤 선택하도록 개선
            const otherSongs = musicFiles.filter(s => s !== currentSong);
            const nextList = otherSongs.length > 0 ? otherSongs : musicFiles;
            const nextSong = nextList[Math.floor(Math.random() * nextList.length)];
            setCurrentSong(nextSong);
        }
    };

    const toggleMusic = () => {
        if (!audioRef.current || !currentSong) return;
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play().catch(e => console.log("재생 오류:", e));
            setIsPlaying(true);
        }
    };

    if (error) return <div style={{ color: 'red', padding: 20 }}>에러: {error}</div>;
    if (!book) return <div style={{ color: '#5f6368', padding: 20 }}>로딩 중...</div>;

    const hasImages = book.image_urls && book.image_urls.length > 0;
    const isMobile = windowWidth < 768;
    const styles = getStyles(isMobile);

    if (!isMounted) return <div style={styles.container} />;

    return (
        <div style={styles.container}>
            {/* Audio Element */}
            {currentSong && (
                <audio 
                    ref={audioRef} 
                    src={currentSong.startsWith('http') ? currentSong : `/Reading_Playlist_MP3/${encodeURIComponent(currentSong)}`} 
                    onEnded={handleSongEnd}
                />
            )}

            {/* 1. 좌측 세로형 사이드바 (Sidebar) */}
            {!isMobile && (
                <div style={styles.sidebar}>
                    <div style={styles.logoArea}>
                        <span style={styles.logoText}>JJFlipBook</span>
                    </div>
                    <div style={styles.sidebarMenu}>
                        {isAdmin && (
                            <button style={styles.sidebarTab} onClick={() => window.location.href = '/'}>My Documents</button>
                        )}
                        <button style={{ ...styles.sidebarTab, ...styles.sidebarTabActive }}>View</button>
                    </div>
                </div>
            )}

            {/* 2. 중앙 플립북 영역 */}
            <div style={styles.workspaceArea}>
                {hasImages ? (
                    <div style={{ 
                        transform: `scale(${Math.min((windowWidth - (isMobile ? 40 : 240)) / 500, (windowHeight - (isMobile ? 220 : 80)) / 700) * (zoom / 100)})`,
                        transformOrigin: isMobile ? 'center top' : 'center center',
                        width: '500px', 
                        height: '700px', 
                        position: 'relative',
                        marginTop: isMobile ? '20px' : '0'
                    }}>
                        {/* @ts-ignore */}
                        <HTMLFlipBook 
                            ref={flipBookRef}
                            width={500} 
                            height={700}
                            size="fixed"
                            minWidth={300}
                            maxWidth={1000}
                            minHeight={400}
                            maxHeight={1500}
                            maxShadowOpacity={0.5}
                            showCover={true}
                            onFlip={(e: any) => setCurrentPage(e.data + 1)}
                        >
                            {book.image_urls.map((url: string, index: number) => (
                                <div key={index} style={styles.pageItem}>
                                     {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                                        src={url.startsWith('http') ? url : `${BACKEND_URL}${url}`} 
                                        alt={`Page ${index + 1}`} 
                                        style={styles.pageImage}
                                    />
                                    
                                    {overlays.filter((o: any) => o.page === (index + 1)).map((o: any, i: number) => (
                                        <div key={i} style={{
                                             position: 'absolute',
                                             left: `${o.x}%`,
                                             top: `${o.y}%`,
                                             width: `${o.width}%`,
                                             height: `${o.height}%`,
                                             zIndex: 10,
                                             pointerEvents: 'auto'
                                        }}>
                                             {o.type === 'video' ? (
                                                 <iframe 
                                                      src={o.data_url.includes("youtube.com/watch") ? o.data_url.replace("watch?v=", "embed/") : o.data_url} 
                                                      style={{ width: '100%', height: '100%', border: 'none' }}
                                                      allowFullScreen
                                                 />
                                             ) : (
                                                 <a 
                                                      href={o.data_url} 
                                                      target="_blank" 
                                                      rel="noopener noreferrer" 
                                                      style={{ display: 'block', width: '100%', height: '100%', backgroundColor: 'rgba(0, 195, 255, 0.1)' }}
                                                 />
                                             )}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </HTMLFlipBook>
                    </div>
                ) : (
                    <div style={{ color: 'gray' }}>변환된 페이지가 없습니다.</div>
                )}

                {/* 3. 하단 고정 컨트롤 바 */}
                {hasImages && (
                    <div style={styles.bottomBar}>
                        <div style={styles.zoomControl}>
                            <button style={styles.pillBtn} onClick={() => setZoom(Math.max(50, zoom - 10))}>-</button>
                            <span style={styles.zoomText}>{zoom}%</span>
                            <button style={styles.pillBtn} onClick={() => setZoom(Math.min(200, zoom + 10))}>+</button>
                        </div>
                        <div style={styles.pagerControl}>
                            <button 
                                style={styles.pagerBtn} 
                                disabled={currentPage === 1} 
                                onClick={() => flipBookRef.current?.pageFlip().flipPrev()}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                            <span style={styles.pagerText}>{currentPage} / {book.image_urls.length}</span>
                            <button 
                                style={styles.pagerBtn} 
                                disabled={currentPage === book.image_urls.length} 
                                onClick={() => flipBookRef.current?.pageFlip().flipNext()}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>
                        <div style={styles.musicControl}>
                            {book.pdf_url && (
                                <a 
                                    href={book.pdf_url.startsWith('http') ? book.pdf_url : `${BACKEND_URL}${book.pdf_url}`}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        ...styles.musicBtn, 
                                        color: '#5f6368',
                                        backgroundColor: 'transparent',
                                        textDecoration: 'none'
                                    }}
                                    title="원본 PDF 다운로드"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                </a>
                            )}
                            {isPlaying && currentSong && (
                                <div style={styles.musicTitle}>
                                    🎵 {currentSong.split('/').pop()?.replace('.mp3', '')}
                                </div>
                            )}
                            <button 
                                style={{
                                    ...styles.musicBtn, 
                                    color: isPlaying ? '#2563eb' : '#5f6368',
                                    backgroundColor: isPlaying ? '#eef2ff' : 'transparent'
                                }} 
                                onClick={toggleMusic} 
                                title={currentSong ? currentSong.split('/').pop() : "음악 없음"}
                            >
                                {isPlaying ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const getStyles = (isMobile: boolean): Record<string, React.CSSProperties> => ({
    container: { display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100vh', width: '100vw', backgroundColor: '#f5f7f9', color: '#1a1a1a', fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' },
    sidebar: { width: isMobile ? '100%' : '220px', backgroundColor: 'white', borderRight: isMobile ? 'none' : '1px solid #e4e7eb', borderBottom: isMobile ? '1px solid #e4e7eb' : 'none', display: 'flex', flexDirection: isMobile ? 'row' : 'column', padding: isMobile ? '16px' : '32px 16px', boxSizing: 'border-box', gap: isMobile ? '16px' : '32px', zIndex: 10 },
    logoArea: { display: 'flex', alignItems: 'center', paddingBottom: isMobile ? '0' : '16px', borderBottom: isMobile ? 'none' : '1px solid #f1f3f5', marginLeft: '8px' },
    logoText: { fontSize: '20px', fontWeight: 'bold', color: '#1a1a1a', letterSpacing: '-0.5px' },
    sidebarMenu: { display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '8px', flex: 1 },
    sidebarTab: { background: 'none', border: 'none', fontSize: '15px', color: '#4b5563', cursor: 'pointer', padding: '12px 16px', borderRadius: '10px', textAlign: 'left', fontWeight: 500, transition: 'all 0.2s', width: '100%' },
    sidebarTabActive: { backgroundColor: '#eef2ff', color: '#2563eb', fontWeight: 600 },
    workspaceArea: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: isMobile ? '12px' : '24px', overflow: 'hidden' },
    pageItem: { backgroundColor: 'white', boxShadow: '0 0 15px rgba(0,0,0,0.15)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', width: '100%', height: '100%' },
    pageImage: { width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' },
    bottomBar: { position: 'absolute', bottom: isMobile ? '12px' : '24px', display: 'flex', gap: '24px', backgroundColor: 'rgba(255, 255, 255, 0.95)', padding: '7px 16px', borderRadius: '24px', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)', backdropFilter: 'blur(10px)', alignItems: 'center', transform: isMobile ? 'scale(0.9)' : 'none' },
    zoomControl: { display: 'flex', alignItems: 'center', gap: '8px' },
    pillBtn: { width: '22px', height: '22px', border: 'none', backgroundColor: '#f1f3f4', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#5f6368' },
    zoomText: { fontSize: '12px', fontWeight: 500, color: '#3c4043', width: '36px', textAlign: 'center' },
    pagerControl: { display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '1px solid #e8eaed', paddingLeft: '16px' },
    pagerBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#5f6368', padding: 0 },
    pagerText: { fontSize: '12px', fontWeight: 500, color: '#3c4043' },
    musicControl: { display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '1px solid #e8eaed', paddingLeft: '16px' },
    musicBtn: { border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '50%', transition: 'all 0.2s', width: '32px', height: '32px' },
    musicTitle: { fontSize: '11px', color: '#2563eb', fontWeight: 500, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
});
