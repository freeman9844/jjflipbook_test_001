import os
import logging
from concurrent.futures import ThreadPoolExecutor
from database import db, bucket, GCS_BUCKET_NAME
from pdf_utils import convert_pdf_to_images

logger = logging.getLogger(__name__)

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
        prefix_path = f"flipbooks/{date_str}/{uuid_key}/" if date_str else f"flipbooks/{uuid_key}/"
        blobs = list(bucket.list_blobs(prefix=prefix_path)) # 리스트로 변환하여 로드
        
        if blobs:
            # 최대 10개의 워커 스레드로 동시 삭제 API 호출 (I/O 바운드 작업 최적화)
            with ThreadPoolExecutor(max_workers=10) as executor:
                list(executor.map(lambda b: b.delete(), blobs))
                
    except Exception as e:
         logger.warning(f"⚠️ [Delete] GCS cleanup failed for book-{uuid_key}: {str(e)}")

def process_pdf_task(pdf_path: str, book_storage: str, uuid_key: str, date_str: str, split_pages: bool = True):
    """백그라운드에서 PDF를 이미지로 변환하고 GCS에 업로드 후 Firestore 업데이트."""
    try:
        # 1. 로컬에 임시 변환 저장
        filenames = convert_pdf_to_images(pdf_path, book_storage, split_pages=split_pages)
        
        # 2. GCS 버킷에 이미지 업로드 및 URL 수집 (병렬 처리)
        def upload_worker(fname: str):
            local_path = os.path.join(book_storage, fname)
            blob = bucket.blob(f"flipbooks/{date_str}/{uuid_key}/{fname}")
            blob.upload_from_filename(local_path)
            return f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/flipbooks/{date_str}/{uuid_key}/{fname}"
            
        with ThreadPoolExecutor(max_workers=5) as executor:
            uploaded_urls = list(executor.map(upload_worker, filenames))
                
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
        logger.info(f"✅ [Background] Flipbook-{uuid_key} Firestore Updated successfully. ({len(filenames)} pages)")
             
    except Exception as e:
        import traceback
        traceback.print_exc()
        error_msg = str(e)
        logger.error(f"❌ [Background] Error processing PDF-{uuid_key}: {error_msg}")
        # 실패 상태 및 구체적인 에러 메시지 Firestore 기록
        try:
             db.collection("flipbooks").document(uuid_key).update({
                  "status": "failed",
                  "error_message": error_msg
             })
        except Exception as fe:
             logger.error(f"❌ [Background] Failed to update fail status for {uuid_key}: {str(fe)}")
    finally:
        # 4. 로컬 템플러리 스페이스 소거 정리 (Clean up)
        import shutil
        if os.path.exists(book_storage):
             shutil.rmtree(book_storage)
