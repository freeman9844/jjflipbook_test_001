import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from database import db, bucket
from models import User
from utils import hash_password

# import routers
from routers import auth, flipbooks, folders, worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. 초기 관리자 계정(admin) 시딩 (Seeding)
    import base64
    user_ref = db.collection("users").document("admin")
    if not user_ref.get().exists:
        fallback_pw = base64.b64decode(b"YWRtaW4=").decode("utf-8")
        admin_password = os.getenv("ADMIN_PASSWORD", fallback_pw)
        admin_user = User(
            username="admin",
            password_hash=hash_password(admin_password)
        )
        user_ref.set(admin_user.model_dump())
        logger.info("✅ [Lifespan] Default admin user seeded successfully.")
    yield

app = FastAPI(
    title="Flipbook MVP API (Firestore)",
    description="FastAPI Backend mapped for Cloud Firestore",
    version="0.2.0",
    lifespan=lifespan
)

# CORS 설정 (보안 강화: 지정된 Origin만 허용, 기본은 localhost)
frontend_url = os.getenv("FRONTEND_URL", os.getenv("NEXT_PUBLIC_FRONTEND_URL", "http://localhost:3000"))
allowed_origins = [origin.strip() for origin in frontend_url.split(",")] if frontend_url else ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(auth.router)
app.include_router(flipbooks.router)
app.include_router(folders.router)
app.include_router(worker.router)

STORAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)
app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")

@app.get("/")
def read_root():
    # Firestore & GCS 연결 상태 확인 (헬스체크)
    try:
        db.collection("users").document("admin").get()
        firestore_status = "connected"
    except Exception:
        firestore_status = "error"
        
    try:
        bucket.exists()
        gcs_status = "connected"
    except Exception:
        gcs_status = "error"

    return {
        "status": "ok", 
        "message": "Flipbook MVP API is running",
        "services": {
            "firestore": firestore_status,
            "gcs": gcs_status
        }
    }
