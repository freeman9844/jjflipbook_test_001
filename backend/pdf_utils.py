import os
import logging
from pdf2image import convert_from_path

logger = logging.getLogger(__name__)

# macOS M1/M2 등 애플 실리콘 환경 대비 (컨테이너 내에선 PATH 활용)
POPPLER_PATH = "/opt/homebrew/bin" if os.path.exists("/opt/homebrew/bin") else None

def convert_pdf_to_images(pdf_path: str, output_dir: str, dpi: int = 200, split_pages: bool = False) -> list[str]:
    """
    PDF 파일을 불러와 각 페이지를 WebP 이미지로 변환하고 저장합니다.
    진행 완료 시 저장된 파일명 목록을 반환합니다.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    from pdf2image import pdfinfo_from_path
    info = pdfinfo_from_path(pdf_path, poppler_path=POPPLER_PATH)
    total_pages = info["Pages"]
    
    saved_files = []
    page_count = 1
    chunk_size = 5 # 5장씩 청크 가공 처리 후 가시성 메모리 해제
    
    for start in range(1, total_pages + 1, chunk_size):
        end = min(start + chunk_size - 1, total_pages)
        logger.info(f"Processing pages {start} to {end} / {total_pages}...")
        
        images = convert_from_path(
            pdf_path,
            first_page=start,
            last_page=end,
            dpi=dpi,
            poppler_path=POPPLER_PATH,
            fmt="webp",
            thread_count=4
        )
        
        for i, image in enumerate(images):
            width, height = image.size
            if split_pages and width > height:
                # 1. Left Page
                left_img = image.crop((0, 0, width // 2, height))
                left_filename = f"page_{page_count}.webp"
                left_img.save(os.path.join(output_dir, left_filename), "WEBP")
                saved_files.append(left_filename)
                page_count += 1
                
                # 2. Right Page
                right_img = image.crop((width // 2, 0, width, height))
                right_filename = f"page_{page_count}.webp"
                right_img.save(os.path.join(output_dir, right_filename), "WEBP")
                saved_files.append(right_filename)
                page_count += 1
            else:
                filename = f"page_{page_count}.webp"
                output_path = os.path.join(output_dir, filename)
                image.save(output_path, "WEBP")
                saved_files.append(filename)
                page_count += 1
        
        # 가독성 메모리 변량 클리어용 가비지 컬렉터 암시
        del images 

    logger.info(f"Successfully converted {total_pages} sheets to {len(saved_files)} individual pages.")
    return saved_files
