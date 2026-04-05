from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from services.flipbook_service import process_pdf_task

router = APIRouter(prefix="/worker", tags=["Worker"])

class ProcessPdfPayload(BaseModel):
    pdf_path: str
    book_storage: str
    uuid_key: str
    date_str: str
    split_pages: bool = True

@router.post("/process-pdf")
async def handle_process_pdf(payload: ProcessPdfPayload, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        process_pdf_task,
        payload.pdf_path,
        payload.book_storage,
        payload.uuid_key,
        payload.date_str,
        payload.split_pages
    )
    return {"status": "processing"}
