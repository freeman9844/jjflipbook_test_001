from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from main import app
from utils import verify_api_key

client = TestClient(app)

@patch('routers.flipbooks.enqueue_pdf_processing_task')
def test_upload_pdf_uses_cloud_tasks(mock_enqueue, tmp_path):
    app.dependency_overrides[verify_api_key] = lambda: True
    
    # Create a dummy pdf file
    pdf_file = tmp_path / "dummy.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 dummy content")
    
    with open(pdf_file, "rb") as f:
        response = client.post(
            "/upload",
            files={"file": ("dummy.pdf", f, "application/pdf")},
            params={"split_pages": "true"}
        )
    
    assert response.status_code == 200
    mock_enqueue.assert_called_once()
    app.dependency_overrides.clear()
