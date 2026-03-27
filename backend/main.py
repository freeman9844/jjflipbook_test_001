from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from contextlib import asynccontextmanager
import os
import json

from pdf_utils import convert_pdf_to_images
from models import User, Flipbook, Overlay, Folder

import bcrypt

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

# Google Cloud Storage 및 Firestore 이니셜라이징
from google.cloud import storage, firestore
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "jjflipbook-gcs-001")

storage_client = storage.Client(project=os.getenv("GOOGLE_CLOUD_PROJECT", "jwlee-argolis-202104"))
bucket = storage_client.bucket(GCS_BUCKET_NAME)

db = firestore.Client(project=os.getenv("GOOGLE_CLOUD_PROJECT", "jwlee-argolis-202104"), database="jjflipbook")

from fastapi import Header
def verify_api_key(x_api_key: str = Header(None)):
    expected = os.getenv("INTERNAL_API_KEY", "secret_dev_key")
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid Internal API Key")
    return True

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. 초기 관리자 계정(admin) 시딩 (Seeding)
    user_ref = db.collection("users").document("admin")
    if not user_ref.get().exists:
        admin_password = os.getenv("ADMIN_PASSWORD", "admin")
        admin_user = User(
            username="admin",
            password_hash=hash_password(admin_password)
        )
        user_ref.set(admin_user.dict())
        print("✅ [Lifespan] Default admin user seeded successfully.")
    yield

app = FastAPI(
    title="Flipbook MVP API (Firestore)",
    description="FastAPI Backend mapped for Cloud Firestore",
    version="0.2.0",
    lifespan=lifespan
)

# CORS 설정 (Next.js 프론트엔드 통신 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Cloud Run 프론트엔드 통신 허용을 위해 와일드카드 개방
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Flipbook MVP API using Firestore is running"}

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/login")
def login(req: LoginRequest):
    user_ref = db.collection("users").document(req.username)
    doc = user_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=401, detail="존재하지 않는 사용자입니다.")
        
    user_data = doc.to_dict()
    if not verify_password(req.password, user_data.get("password_hash")):
        raise HTTPException(status_code=401, detail="비밀번호가 일치하지 않습니다.")
        
    return {"status": "ok", "authenticated": True, "username": req.username}

# --- PDF Upload & Flipbook Management ---

STORAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)
app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")

def process_pdf_task(pdf_path: str, book_storage: str, uuid_key: str, date_str: str, split_pages: bool = True):
    """백그라운드에서 PDF를 이미지로 변환하고 GCS에 업로드 후 Firestore 업데이트."""
    try:
        # 1. 로컬에 임시 변환 저장
        filenames = convert_pdf_to_images(pdf_path, book_storage, split_pages=split_pages)
        
        # 2. GCS 버킷에 이미지 업로드 및 URL 수집 (병렬 처리)
        from concurrent.futures import ThreadPoolExecutor
        uploaded_urls = [None] * len(filenames)
        
        def upload_worker(index: int, fname: str):
            local_path = os.path.join(book_storage, fname)
            blob = bucket.blob(f"flipbooks/{date_str}/{uuid_key}/{fname}")
            blob.upload_from_filename(local_path)
            uploaded_urls[index] = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/flipbooks/{date_str}/{uuid_key}/{fname}"
            
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(upload_worker, i, fname) for i, fname in enumerate(filenames)]
            for f in futures:
                f.result() # 스레드 예외 버블링
                
        # [NEW] 원본 PDF도 GCS에 저장
        pdf_blob_name = f"flipbooks/{date_str}/{uuid_key}/original.pdf" if date_str else f"flipbooks/{uuid_key}/original.pdf"
        pdf_blob = bucket.blob(pdf_blob_name)
        pdf_blob.upload_from_filename(pdf_path)
        pdf_url = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{pdf_blob_name}"
            
        # 3. Firestore 도큐먼트 업데이트
        db.collection("flipbooks").document(uuid_key).update({
            "page_count": len(filenames),
            "image_urls": uploaded_urls,
            "pdf_url": pdf_url,
            "status": "success"
        })
        print(f"✅ [Background] Flipbook-{uuid_key} Firestore Updated successfully. ({len(filenames)} pages)")
             
    except Exception as e:
        print(f"❌ [Background] Error processing PDF-{uuid_key}: {str(e)}")
        # 실패 상태 Firestore 기록
        try:
             db.collection("flipbooks").document(uuid_key).update({
                  "status": "failed"
             })
        except Exception as fe:
             print(f"❌ [Background] Failed to update fail status for {uuid_key}: {str(fe)}")
    finally:
        # 4. 로컬 템플러리 스페이스 소거 정리 (Clean up)
        import shutil
        if os.path.exists(book_storage):
             shutil.rmtree(book_storage)
@app.post("/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    split_pages: bool = Query(True),
    folder_id: str = Query(None), # 추가: 폴더 ID
    validated: bool = Depends(verify_api_key)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files allowed")
        
    # 1. Flipbook 개체 생성
    book = Flipbook(title=file.filename, folder_id=folder_id)
    
    # 날짜 폴더 문자열 생성 (YYYYMMDD)
    from datetime import datetime
    date_str = datetime.utcnow().strftime("%Y%m%d")
    
    # 2. Firestore 저장 (Document ID = uuid_key)
    data = book.dict()
    data["date_folder"] = date_str # 삭제 시 블롭 조회를 위함
    db.collection("flipbooks").document(book.uuid_key).set(data)
    
    # 3. 전용 저장 디렉토리 탑재
    book_dir = os.path.join(STORAGE_DIR, book.uuid_key)
    os.makedirs(book_dir, exist_ok=True)
    
    # 4. 원본 PDF 저장 (Streaming 방식 복사로 RAM 보호 및 비동기 처리)
    pdf_path = os.path.join(book_dir, "original.pdf")
    import aiofiles
    async with aiofiles.open(pdf_path, 'wb') as f:
        while chunk := await file.read(1024 * 1024):  # 1MB 씩 청크 읽기
            await f.write(chunk)
        
    # 5. 백그라운드 변환 가동
    background_tasks.add_task(process_pdf_task, pdf_path, book_dir, book.uuid_key, date_str, split_pages)
    
    return {
         "status": "ok", 
         "message": "PDF uploaded successfully. Processing background.", 
         "book_id": book.uuid_key
    }
@app.get("/flipbooks")
def list_flipbooks():
    # Firestore 컬렉션 스트림 조회
    docs = db.collection("flipbooks").stream()
    results = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = doc.id # Next.js 호환을 위해 id 필드 매핑
        results.append(d)
    return results

# --- Folder API ---
@app.post("/folder")
def create_folder(folder: Folder, validated: bool = Depends(verify_api_key)):
    import uuid
    folder_id = str(uuid.uuid4())
    folder.id = folder_id
    db.collection("folders").document(folder_id).set(folder.dict())
    return {"status": "ok", "folder_id": folder_id}

@app.get("/folders")
def get_folders():
    docs = db.collection("folders").stream()
    results = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = doc.id
        results.append(d)
    # 최신순 정렬
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results

def delete_single_flipbook(uuid_key: str):
    doc_ref = db.collection("flipbooks").document(uuid_key)
    if not doc_ref.get().exists:
        return
        
    # 1. 서브 컬렉션 (Overlays) 삭제
    overlays = doc_ref.collection("overlays").stream()
    batch = db.batch()
    for d in overlays:
        batch.delete(d.reference)
    batch.commit()
        
    # 2. 메인 플립북 문서 삭제 부가 정보 추출
    book_data = doc_ref.get().to_dict()
    date_str = book_data.get("date_folder", "")
    doc_ref.delete()
    
    # 3. GCS 블롭 소거 (Prefix 기반) - 멀티스레딩 병렬 삭제 적용
    try:
        from concurrent.futures import ThreadPoolExecutor
        prefix_path = f"flipbooks/{date_str}/{uuid_key}/" if date_str else f"flipbooks/{uuid_key}/"
        blobs = list(bucket.list_blobs(prefix=prefix_path)) # 리스트로 변환하여 로드
        
        if blobs:
            # 최대 10개의 워커 스레드로 동시 삭제 API 호출 (I/O 바운드 작업 최적화)
            with ThreadPoolExecutor(max_workers=10) as executor:
                list(executor.map(lambda b: b.delete(), blobs))
                
    except Exception as e:
         print(f"⚠️ [Delete] GCS cleanup failed for book-{uuid_key}: {str(e)}")

@app.delete("/folder/{folder_id}")
def delete_folder(folder_id: str, validated: bool = Depends(verify_api_key)):
    folder_ref = db.collection("folders").document(folder_id)
    if not folder_ref.get().exists:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Cascade Delete: 속한 플립북 모두 삭제
    flipbooks = db.collection("flipbooks").where("folder_id", "==", folder_id).stream()
    deleted_count = 0
    for fb in flipbooks:
        delete_single_flipbook(fb.id)
        deleted_count += 1
        
    # 폴더 문서 삭제
    folder_ref.delete()
    return {"status": "ok", "message": f"Folder deleted with {deleted_count} flipbooks cascade deleted."}

@app.get("/flipbook/{uuid_key}")
def get_flipbook(uuid_key: str):
    doc_ref = db.collection("flipbooks").document(uuid_key)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Flipbook not found")
        
    book = doc.to_dict()
    return {
        "id": uuid_key,
        "uuid_key": uuid_key,
        "title": book.get("title", ""),
        "page_count": book.get("page_count", 0),
        "image_urls": book.get("image_urls", []),
        "pdf_url": book.get("pdf_url", None)
    }

@app.get("/flipbook/{uuid_key}/overlays")
def get_overlays(uuid_key: str):
    doc_ref = db.collection("flipbooks").document(uuid_key)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    # 서브 컬렉션 조회
    docs = doc_ref.collection("overlays").stream()
    results = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = doc.id
        results.append(d)
    return results

@app.post("/flipbook/{uuid_key}/overlays")
def update_overlays(uuid_key: str, overlays: list[dict]):
    doc_ref = db.collection("flipbooks").document(uuid_key)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    # 1. 기존 오버레이 서브 컬렉션 문서 삭제 (Batch Delete)
    existing_docs = doc_ref.collection("overlays").stream()
    batch = db.batch()
    for d in existing_docs:
        batch.delete(d.reference)
    batch.commit()
        
    # 2. 새로운 오버레이 리스트 등록
    for data in overlays:
        doc_ref.collection("overlays").add(data)
        
    return {"status": "ok", "message": f"{len(overlays)} overlays updated"}

@app.delete("/flipbook/{uuid_key}")
def delete_flipbook(uuid_key: str, validated: bool = Depends(verify_api_key)):
    doc_ref = db.collection("flipbooks").document(uuid_key)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Flipbook not found")
        
    delete_single_flipbook(uuid_key)
    return {"status": "ok", "message": "Flipbook deleted successfully"}
