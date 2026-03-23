import os
from pdf2image import convert_from_path

# macOS M1/M2 등 애플 실리콘 환경 대비 (컨테이너 내에선 PATH 활용)
POPPLER_PATH = "/opt/homebrew/bin" if os.path.exists("/opt/homebrew/bin") else None

def convert_pdf_to_images(pdf_path: str, output_dir: str, dpi: int = 200, split_pages: bool = False) -> list[str]:
    """
    PDF 파일을 불러와 각 페이지를 WebP 이미지로 변환하고 저장합니다.
    진행 완료 시 저장된 파일명 목록을 반환합니다.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"Starting PDF conversion: {pdf_path} -> {output_dir} (split_pages={split_pages})")
    images = convert_from_path(
        pdf_path,
        dpi=dpi,
        poppler_path=POPPLER_PATH,
        fmt="webp"
    )
    
    saved_files = []
    page_count = 1
    
    for i, image in enumerate(images):
        width, height = image.size
        
        # 가로가 세로보다 길다면 split_pages 활성화 시 반으로 분할 (좌, 우)
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
            
            print(f"Split Wide Page {i+1} into two pages ({left_filename}, {right_filename})")
        else:
            filename = f"page_{page_count}.webp"
            output_path = os.path.join(output_dir, filename)
            image.save(output_path, "WEBP")
            saved_files.append(filename)
            page_count += 1
            
    print(f"Successfully converted {len(images)} sheets to {len(saved_files)} individual pages.")
    return saved_files
