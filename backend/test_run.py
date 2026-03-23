from fastapi.testclient import TestClient
import os

# 현재 디렉토리가 backend인 점을 고려하여 import 경로 처리
# 만약 부모 디렉토리에서 실행한다면 python -m backend.test_run 형태가 필요할 수 있습니다.
from main import app

client = TestClient(app)

print("--- FastAPI Start Validation ---")
try:
    with TestClient(app) as client:
        # 1. Root Check
        response = client.get("/")
        print("Root Status:", response.status_code)
        print("Root Response:", response.json())

        # 2. Upload Check
        with open("test.pdf", "rb") as f:
             files = {"file": ("test.pdf", f, "application/pdf")}
             response = client.post("/upload", files=files)
        print("\n--- Upload API Test ---")
        print("Upload Status:", response.status_code)
        print("Upload Response:", response.json())
        
        # 3. Check file list
        if response.status_code == 200:
             book_id = response.json().get("book_id")
             print(f"\n✅ Uploaded. Book ID: {book_id}")
             
             # 백그라운드 태스크가 완료되었는지 확인 (TestClient는 context 블록 끝날 때 돌 수도 있지만, 
             # 동기 백그라운드 Task는 요청 직후 스레드가 아닌 요청 스코프 내에서 순차 처리되므로 이미 완료되었을 수 있음)
             response = client.get(f"/flipbook/{book_id}")
             print("Flipbook Get Status:", response.status_code)
             print("Flipbook Response:", response.json())
    
    # DB 파일 생성 확인 (절대 경로로 조회 가능하도록 DB_URL 역추적 하거나 직접 조회)
    db_path = os.path.join(os.path.dirname(__file__), "flipbook.db")
    if os.path.exists(db_path):
        print(f"✅ Success: Database file created at {db_path}")
    else:
        print(f"❌ Warning: Database file not found at {db_path} yet")
        
except Exception as e:
    print("❌ Error during validation:", str(e))
