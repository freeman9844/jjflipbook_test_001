import os
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Query
from database import db, GOOGLE_CLOUD_PROJECT
from models import Flipbook, Overlay
from utils import verify_api_key
from services.flipbook_service import process_pdf_task, delete_single_flipbook
from cloud_tasks import enqueue_pdf_processing_task
import aiofiles
from datetime import datetime, timezone

router = APIRouter(tags=["Flipbooks"])

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage")

@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    split_pages: bool = Query(True),
    folder_id: str = Query(None),
    validated: bool = Depends(verify_api_key)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files allowed")
        
    book = Flipbook(title=file.filename, folder_id=folder_id)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    
    data = book.model_dump()
    data["date_folder"] = date_str
    db.collection("flipbooks").document(book.uuid_key).set(data)
    
    book_dir = os.path.join(STORAGE_DIR, book.uuid_key)
    os.makedirs(book_dir, exist_ok=True)
    
    pdf_path = os.path.join(book_dir, "original.pdf")
    async with aiofiles.open(pdf_path, 'wb') as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)
            
    worker_url = os.getenv("WORKER_URL")
    if worker_url:
        location = os.getenv("REGION", "asia-northeast3")
        queue_name = os.getenv("TASK_QUEUE_NAME", "pdf-worker-queue")
        
        payload = {
            "pdf_path": pdf_path,
            "book_storage": book_dir,
            "uuid_key": book.uuid_key,
            "date_str": date_str,
            "split_pages": split_pages
        }
        
        try:
            enqueue_pdf_processing_task(
                project_id=GOOGLE_CLOUD_PROJECT,
                location=location,
                queue=queue_name,
                worker_url=f"{worker_url}/worker/process-pdf",
                payload=payload
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to enqueue processing task: {str(e)}")
    else:
        import threading
        thread = threading.Thread(target=process_pdf_task, args=(pdf_path, book_dir, book.uuid_key, date_str, split_pages))
        thread.start()
    
    return {
         "status": "ok", 
         "message": "PDF uploaded successfully. Processing queued.", 
         "book_id": book.uuid_key
    }

@router.get("/flipbooks")
def list_flipbooks():
    docs = db.collection("flipbooks").stream()
    results = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = doc.id
        results.append(d)
    return results

@router.get("/flipbook/{uuid_key}")
def get_flipbook(uuid_key: str):
    doc_ref = db.collection("flipbooks").document(uuid_key)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Flipbook not found")
        
    book = doc.to_dict()
    book["id"] = uuid_key
    return book

@router.get("/flipbook/{uuid_key}/overlays")
def get_overlays(uuid_key: str):
    doc_ref = db.collection("flipbooks").document(uuid_key)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    docs = doc_ref.collection("overlays").stream()
    results = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = doc.id
        results.append(d)
    return results

@router.post("/flipbook/{uuid_key}/overlays")
def update_overlays(uuid_key: str, overlays: list[dict]):
    doc_ref = db.collection("flipbooks").document(uuid_key)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    existing_docs = doc_ref.collection("overlays").stream()
    batch = db.batch()
    for d in existing_docs:
        batch.delete(d.reference)
    batch.commit()
        
    for data in overlays:
        doc_ref.collection("overlays").add(data)
        
    return {"status": "ok", "message": f"{len(overlays)} overlays updated"}

@router.delete("/flipbook/{uuid_key}")
def delete_flipbook(uuid_key: str, validated: bool = Depends(verify_api_key)):
    delete_single_flipbook(uuid_key)
    return {"status": "ok", "message": f"Flipbook {uuid_key} deleted"}
