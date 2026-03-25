"use client";

import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';

interface Flipbook {
    id: string; // backend mapping adds id
    uuid_key: string;
    title: string;
    page_count: number;
    image_urls?: string[];
    status?: string; // 'success', 'processing', 'failed'
    folder_id?: string | null; // 폴더 기능 지원용
    created_at: string;
}

interface Folder {
    id: string;
    name: string;
    created_at: string;
}

export default function Home() {
    const [books, setBooks] = useState<Flipbook[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    
    // 폴더 네비게이션용 상태
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    
    // UI 액션 상태
    const [isMounted, setIsMounted] = useState<boolean>(false);
    const [uploading, setUploadLoading] = useState(false);
    
    // 모달 및 설정 상태
    const [deletingUuid, setDeletingUuid] = useState<string | null>(null); 
    const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
    const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
    const [newFolderName, setNewFolderName] = useState<string>("");
    
    const [splitPages, setSplitPages] = useState<boolean>(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [windowWidth, setWindowWidth] = useState(1200);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [username, setUsername] = useState<string>("");
    const [password, setPassword] = useState<string>("");

    useEffect(() => {
        if (typeof window !== "undefined") {
            setIsAuthenticated(localStorage.getItem("isAuthenticated") === "true");
            setIsMounted(true);
        }
    }, []);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setWindowWidth(window.innerWidth);
            const handleResize = () => setWindowWidth(window.innerWidth);
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }
    }, []);

    useEffect(() => {
        if (typeof document !== 'undefined') {
            const styleId = "spin-animation-style";
            if (!document.getElementById(styleId)) {
                const styleSheet = document.createElement("style");
                styleSheet.id = styleId;
                styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
                document.head.appendChild(styleSheet);
            }
        }
    }, []);

    const isMobile = windowWidth < 768;
    const styles = getStyles(isMobile);

    useEffect(() => {
        if (isAuthenticated) fetchAllData();
    }, [isAuthenticated]);

    // Polling logic
    useEffect(() => {
        if (!isAuthenticated) return;
        const isProcessing = books.some(b => b.page_count === 0 && b.status !== 'failed');
        if (!isProcessing) return;

        let delay = 3000;
        let timerId: NodeJS.Timeout;

        const doPoll = async () => {
            await fetchAllData();
            delay = Math.min(delay * 1.5, 30000); 
            timerId = setTimeout(doPoll, delay);
        };

        timerId = setTimeout(doPoll, delay);
        return () => { if (timerId) clearTimeout(timerId); };
    }, [books]);

    const fetchAllData = async () => {
        try {
            const [booksRes, foldersRes] = await Promise.all([
                fetch(`/api/backend/flipbooks`),
                fetch(`/api/backend/folders`)
            ]);
            
            if (booksRes.ok) {
                const data: Flipbook[] = await booksRes.json();
                const sortedData = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setBooks(sortedData);
            }
            if (foldersRes.ok) {
                const fData: Folder[] = await foldersRes.json();
                setFolders(fData);
            }
        } catch (err) {
            console.error("데이터 통신 지연", err);
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadLoading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const url = currentFolderId 
                ? `/api/backend/upload?split_pages=${splitPages}&folder_id=${currentFolderId}`
                : `/api/backend/upload?split_pages=${splitPages}`;
                
            const res = await fetch(url, {
                method: "POST",
                body: formData
            });
            if (res.ok) {
                alert("🎉 PDF 업로드가 수신되었습니다. 백그라운드 변환이 시작됩니다.");
                setTimeout(() => fetchAllData(), 3000); 
            } else {
                alert("❌ 업로드 처리 실패가 발생했습니다.");
            }
        } catch (err) {
            alert("❌ 통신 중 에러가 발생했습니다.");
        } finally {
            setUploadLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            const res = await fetch('/api/backend/folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newFolderName.trim() })
            });
            if (res.ok) {
                setNewFolderName("");
                setIsCreatingFolder(false);
                fetchAllData();
            } else {
                alert("❌ 폴더 생성 실패");
            }
        } catch (err) {
            alert("❌ 통신 에러");
        }
    };

    const confirmDeleteFolder = async () => {
        if (!deletingFolderId) return;
        try {
            const res = await fetch(`/api/backend/folder/${deletingFolderId}`, { method: 'DELETE' });
            if (res.ok) {
                setFolders(prev => prev.filter(f => f.id !== deletingFolderId));
                setBooks(prev => prev.filter(b => b.folder_id !== deletingFolderId));
                if (currentFolderId === deletingFolderId) setCurrentFolderId(null);
            } else {
                alert("❌ 폴더 삭제 실패");
            }
        } catch (err) {
            alert("❌ 통신 에러");
        } finally {
            setDeletingFolderId(null);
        }
    };

    const confirmDeleteFile = async () => {
        if (!deletingUuid) return;
        try {
            const res = await fetch(`/api/backend/flipbook/${deletingUuid}`, {
                method: "DELETE"
            });
            if (res.ok) {
                setBooks(prev => prev.filter(b => b.uuid_key !== deletingUuid));
            } else {
                alert("❌ 문서 삭제 실패");
            }
        } catch (err) {
            alert("❌ 통신 에러");
        } finally {
            setDeletingUuid(null);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/backend/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });
            if (res.ok) {
                localStorage.setItem("isAuthenticated", "true");
                setIsAuthenticated(true);
            } else {
                alert("❌ 로그인 정보가 일치하지 않습니다.");
            }
        } catch (err) {
            alert("❌ 로그인 처리 중 통신 오류가 발생했습니다.");
        }
    };

    if (!isMounted) return null;

    if (!isAuthenticated) {
        return (
            <div style={styles.loginContainer}>
                <form style={styles.loginForm} onSubmit={handleLogin}>
                    <h2 style={{ textAlign: 'center', margin: '0 0 16px 0', color: '#1a1a1a', fontSize: '24px', fontWeight: 'bold' }}>로그인</h2>
                    <input 
                        type="text" 
                        placeholder="아이디" 
                        style={styles.loginInput} 
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)} 
                        required 
                    />
                    <input 
                        type="password" 
                        placeholder="비밀번호" 
                        style={styles.loginInput} 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                    />
                    <button type="submit" style={styles.loginBtn}>로그인</button>
                </form>
            </div>
        );
    }

    // 렌더링 필터 (현재 뷰가 루트인지 폴더 내부인지)
    const filteredBooks = books.filter(b => (b.folder_id || null) === currentFolderId);

    return (
        <div style={styles.container}>
            {/* 1. 좌측 시이드바 */}
            <div style={styles.sidebar}>
                <div style={styles.logoArea}>
                    <span style={styles.logoText}>JJFlipBook</span>
                </div>
                <div style={styles.sidebarMenu}>
                    <button style={{ ...styles.sidebarTab, ...styles.sidebarTabActive }} onClick={() => setCurrentFolderId(null)}>My Documents</button>
                    <button style={styles.sidebarTab} onClick={() => alert("개별 문서를 선택해 주세요")}>View</button>
                    <button 
                        style={{ ...styles.sidebarTab, marginTop: 'auto', color: '#e11d48', fontWeight: 600 }} 
                        onClick={async () => { 
                            await fetch('/api/backend/logout', { method: 'POST' });
                            localStorage.removeItem("isAuthenticated"); 
                            setIsAuthenticated(false); 
                        }}
                    >
                        🚪 로그아웃
                    </button>
                </div>
            </div>

            {/* 2. 대시보드 메인 영역 */}
            <div style={styles.dashboardArea}>
                <div style={styles.dashHeader}>
                    <div>
                        <h1 style={styles.dashTitle}>
                            {currentFolderId 
                                ? folders.find(f => f.id === currentFolderId)?.name || "폴더" 
                                : "My Documents"}
                        </h1>
                        <p style={styles.dashSub}>
                            {currentFolderId 
                                ? "폴더 내 업로드된 문서를 관리합니다." 
                                : "문서 및 폴더 목록을 관리하고 읽어보세요."}
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {currentFolderId !== null && (
                            <button 
                                onClick={() => setCurrentFolderId(null)} 
                                style={{...styles.uploadBtn, backgroundColor: '#f1f3f4', color: '#1a1a1a'}}
                            >
                                ← 최상위로
                            </button>
                        )}
                        {currentFolderId === null && (
                            <button 
                                onClick={() => setIsCreatingFolder(true)} 
                                style={{...styles.uploadBtn, backgroundColor: '#eef2ff', color: '#2563eb'}}
                            >
                                + 새 폴더
                            </button>
                        )}
                        
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: '#5f6368' }}>
                            <input 
                                type="checkbox" 
                                checked={splitPages} 
                                onChange={(e) => setSplitPages(e.target.checked)} 
                                style={{ cursor: 'pointer' }}
                            />
                            📄 1p ➡️ 2장 분할 (스프레드)
                        </label>
                        <input 
                            type="file" 
                            accept=".pdf" 
                            ref={fileInputRef} 
                            style={{ display: 'none' }} 
                            onChange={handleFileChange} 
                        />
                        <button style={styles.uploadBtn} onClick={handleUploadClick} disabled={uploading}>
                            {uploading ? "업로드 중..." : "+ PDF 업로드"}
                        </button>
                    </div>
                </div>

                {folders.length === 0 && filteredBooks.length === 0 ? (
                    <div style={styles.emptyState}>
                        <div style={styles.emptyIcon}>📂</div>
                        <p style={styles.emptyText}>항목이 비어있습니다. 폴더를 생성하거나 pdf를 투입해주세요!</p>
                    </div>
                ) : (
                    <div style={styles.gridContainer}>
                        {/* 폴더 렌더링 (루트에서만 보임) */}
                        {currentFolderId === null && folders.map(folder => (
                            <div 
                                key={folder.id} 
                                style={{ ...styles.card, background: '#f8fafc', border: '1px solid #e2e8f0', position: 'relative' }} 
                                onClick={() => setCurrentFolderId(folder.id)}
                            >
                                <button 
                                    style={styles.deleteBtn} 
                                    onClick={(e) => { e.stopPropagation(); setDeletingFolderId(folder.id); }}
                                    title="폴더 삭제"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                                <div style={{...styles.cardCover, background: 'transparent', height: isMobile ? '120px' : '160px'}}>
                                    <span style={{ fontSize: '56px' }}>📁</span>
                                </div>
                                <div style={styles.cardInfo}>
                                    <h4 style={styles.cardTitle}>{folder.name}</h4>
                                    <p style={styles.cardSub}>
                                        {folder.created_at ? folder.created_at.split('T')[0].replace(/-/g, '/') : ''}
                                    </p>
                                </div>
                            </div>
                        ))}

                        {/* 플립북 렌더링 */}
                        {filteredBooks.map((book) => {
                            const coverUrl = book.image_urls && book.image_urls.length > 0 ? book.image_urls[0] : null;
                            const isFailed = book.status === "failed";
                            const isProcessing = book.page_count === 0 && !isFailed;

                            return (
                                <div 
                                    key={book.id} 
                                    style={{ 
                                        ...styles.card, 
                                        opacity: isProcessing ? 0.75 : 1, 
                                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                                        position: 'relative'
                                    }} 
                                    onClick={() => {
                                        if (!isProcessing && !isFailed) window.location.href = `/view/${book.uuid_key}`;
                                    }}
                                >
                                    <button 
                                        style={styles.deleteBtn} 
                                        onClick={(e) => { e.stopPropagation(); setDeletingUuid(book.uuid_key); }}
                                        title="문서 삭제"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>

                                    {isProcessing && (
                                        <div style={styles.processingOverlay}>
                                            <div style={styles.spinner}></div>
                                            <span style={styles.processingText}>변환 처리 중...</span>
                                        </div>
                                    )}

                                    {isFailed && (
                                        <div style={styles.processingOverlay}>
                                            <span style={{ fontSize: '24px' }}>❌</span>
                                            <span style={{ ...styles.processingText, color: '#ef4444' }}>변환 실패</span>
                                        </div>
                                    )}
                                    <div style={{ ...styles.cardCover, position: 'relative', overflow: 'hidden' }}>
                                        {coverUrl ? (
                                            <Image 
                                                src={coverUrl} 
                                                alt={book.title} 
                                                fill 
                                                style={{ objectFit: 'cover' }} 
                                                sizes="(max-width: 768px) 100vw, 33vw"
                                            />
                                        ) : (
                                            <div style={styles.coverPlaceholder}>
                                                <span style={{ fontSize: '32px' }}>📖</span>
                                            </div>
                                        )}
                                    </div>
                                    <div style={styles.cardInfo}>
                                        <h4 style={styles.cardTitle}>{book.title}</h4>
                                        <p style={styles.cardSub}>
                                            {isProcessing ? "분석 중..." : `${book.created_at ? book.created_at.split('T')[0].replace(/-/g, '/') : ''} | 페이지 수: ${book.page_count}p`}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 새 폴더 생성 모달 */}
            {isCreatingFolder && (
                <div style={styles.modalBackdrop}>
                    <div style={styles.modalContent}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#1a1a1a' }}>새 폴더 만들기</h3>
                        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#5f6368' }}>폴더 이름을 입력해주세요.</p>
                        <input 
                            type="text" 
                            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd', marginBottom: '24px', width: '100%', boxSizing: 'border-box' }}
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="폴더 이름"
                            autoFocus
                            onKeyDown={(e) => { if(e.key === 'Enter') handleCreateFolder(); }}
                        />
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }} 
                                style={{ padding: '8px 16px', backgroundColor: '#f1f3f4', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
                            >취소</button>
                            <button 
                                onClick={handleCreateFolder} 
                                style={{ padding: '8px 16px', backgroundColor: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
                            >생성하기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 폴더 삭제 모달 */}
            {deletingFolderId !== null && (
                <div style={styles.modalBackdrop}>
                    <div style={styles.modalContent}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#1a1a1a' }}>폴더 삭제</h3>
                        <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#e11d48', fontWeight: 600 }}>
                            이 폴더와 안에 담긴 모든 PDF 문서를 영구적으로 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다!)
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => setDeletingFolderId(null)} 
                                style={{ padding: '8px 16px', backgroundColor: '#f1f3f4', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
                            >취소</button>
                            <button 
                                onClick={confirmDeleteFolder} 
                                style={{ padding: '8px 16px', backgroundColor: '#e11d48', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
                            >완전 삭제</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 문서 삭제 모달 */}
            {deletingUuid !== null && (
                <div style={styles.modalBackdrop}>
                    <div style={styles.modalContent}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#1a1a1a' }}>문서 삭제</h3>
                        <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#5f6368' }}>
                            정말 이 문서를 삭제하시겠습니까? 관련 데이터가 모두 소멸됩니다.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => setDeletingUuid(null)} 
                                style={{ padding: '8px 16px', backgroundColor: '#f1f3f4', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
                            >취소</button>
                            <button 
                                onClick={confirmDeleteFile} 
                                style={{ padding: '8px 16px', backgroundColor: '#e11d48', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
                            >삭제하기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const getStyles = (isMobile: boolean): Record<string, React.CSSProperties> => ({
    container: { display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100vh', width: '100vw', backgroundColor: '#f4f6f8', color: '#1a1a1a', fontFamily: 'system-ui, -apple-system, sans-serif', overflowX: 'hidden' },
    sidebar: { width: isMobile ? '100%' : '220px', backgroundColor: 'white', borderRight: isMobile ? 'none' : '1px solid #e4e7eb', borderBottom: isMobile ? '1px solid #e4e7eb' : 'none', display: 'flex', flexDirection: isMobile ? 'row' : 'column', padding: isMobile ? '16px' : '32px 16px', boxSizing: 'border-box', gap: isMobile ? '16px' : '32px', zIndex: 10, alignItems: isMobile ? 'center' : 'stretch' },
    logoArea: { display: 'flex', alignItems: 'center', paddingBottom: isMobile ? '0' : '16px', borderBottom: isMobile ? 'none' : '1px solid #f1f3f5', marginLeft: '8px' },
    logoText: { fontSize: '20px', fontWeight: 'bold', color: '#1a1a1a', letterSpacing: '-0.5px' },
    sidebarMenu: { display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '8px', flex: isMobile ? 'none' : 1, width: isMobile ? 'auto' : '100%', marginLeft: isMobile ? 'auto' : '0' },
    sidebarTab: { background: 'none', border: 'none', fontSize: '15px', color: '#4b5563', cursor: 'pointer', padding: '12px 16px', borderRadius: '10px', textAlign: 'left', fontWeight: 500, transition: 'all 0.2s', width: isMobile ? 'auto' : '100%' },
    sidebarTabActive: { backgroundColor: '#eef2ff', color: '#2563eb', fontWeight: 600 },
    dashboardArea: { flex: 1, padding: isMobile ? '24px' : '40px 60px', overflowY: 'auto' },
    dashHeader: { display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: '32px', gap: isMobile ? '16px' : '0', flexWrap: 'wrap' },
    dashTitle: { fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#1a1a1a' },
    dashSub: { fontSize: '14px', color: '#5f6368', margin: 0 },
    uploadBtn: { padding: '12px 24px', backgroundColor: '#1a73e8', color: 'white', border: 'none', borderRadius: '24px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 4px 6px rgba(26, 115, 232, 0.2)', transition: 'all 0.2s', width: isMobile ? '100%' : 'auto' },
    gridContainer: { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '140px' : '200px'}, 1fr))`, gap: isMobile ? '16px' : '32px' },
    card: { backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.04)', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' },
    cardCover: { height: isMobile ? '180px' : '260px', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0', overflow: 'hidden' },
    coverImage: { width: '100%', height: '100%', objectFit: 'contain' },
    coverPlaceholder: { color: '#5f6368' },
    cardInfo: { padding: '16px' },
    cardTitle: { fontSize: '15px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    cardSub: { fontSize: '12px', color: '#5f6368', margin: 0 },
    emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '16px' },
    emptyIcon: { fontSize: '48px' },
    emptyText: { color: '#5f6368', fontSize: '15px' },
    processingOverlay: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: '12px', gap: '12px' },
    processingText: { fontSize: '14px', color: '#1a73e8', fontWeight: 600 },
    spinner: { width: '24px', height: '24px', border: '3px solid #f3f3f3', borderTop: '3px solid #1a73e8', borderRadius: '50%', animation: 'spin 1s linear infinite' },
    deleteBtn: { position: 'absolute', top: '12px', right: '12px', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #f1f3f4', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.08)', transition: 'all 0.2s' },
    modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modalContent: { backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '360px', boxShadow: '0 12px 36px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' },
    loginContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', backgroundColor: '#f4f6f8' },
    loginForm: { backgroundColor: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.06)', width: '340px', display: 'flex', flexDirection: 'column', gap: '12px', boxSizing: 'border-box' },
    loginInput: { padding: '12px 16px', borderRadius: '8px', border: '1px solid #dadce0', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s', width: '100%', boxSizing: 'border-box' },
    loginBtn: { padding: '12px', backgroundColor: '#1a73e8', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.2s', marginTop: '8px', width: '100%' }
});
