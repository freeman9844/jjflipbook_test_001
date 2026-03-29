import os
import requests
import pytest

# 환경 변수에서 배포된 API URL 주입 (기본값 로컬)
API_URL = os.getenv("DEPLOYED_API_URL", "http://localhost:8080")

def test_api_health_check():
    """1. 루트 엔드포인트 헬스체크"""
    response = requests.get(f"{API_URL}/")
    assert response.status_code == 200, "API 서버가 정상 동작하지 않습니다."
    data = response.json()
    assert "status" in data or "message" in data

def test_upload_pdf_integration():
    """2. E2E_TEST PDF 실제 업로드 연동 테스트"""
    test_pdf_path = os.path.join(os.path.dirname(__file__), "test_data", "sample.pdf")
    
    assert os.path.exists(test_pdf_path), f"더미 테스트 PDF 파일을 찾을 수 없습니다: {test_pdf_path}"

    with open(test_pdf_path, "rb") as f:
        # Prefix E2E_TEST_ 를 붙인 파일명 (서버에서 이 이름을 그대로 저장하는지 여부에 따라)
        # 만약 클라이언트가 보내는 파일명을 백엔드가 그대로 존중한다면 "E2E_TEST_sample.pdf"
        files = {"file": ("E2E_TEST_sample.pdf", f, "application/pdf")}
        
        response = requests.post(f"{API_URL}/upload", files=files)
        
        assert response.status_code == 200, f"업로드 실패. 응답 코드: {response.status_code}, 메시지: {response.text}"
        data = response.json()
        assert "book_id" in data, "응답 객체에 book_id 가 포함되어야 합니다."
        
        book_id = data["book_id"]
        
        # 3. GET /flipbook/{book_id} 로 폴링 (초기 상태 혹은 success)
        # 백그라운드 변환이 완전히 끝나지 않았을 수 있으므로 200만 확인
        get_response = requests.get(f"{API_URL}/flipbook/{book_id}")
        assert get_response.status_code == 200, f"Flipbook 조회 실패: {get_response.text}"
        
        # prefix 확인 테스트
        book_data = get_response.json()
        print("E2E_TEST_ Uploaded Flipbook Title:", book_data.get("title"))

