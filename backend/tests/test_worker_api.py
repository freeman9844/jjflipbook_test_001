from fastapi.testclient import TestClient
from main import app
from unittest.mock import patch

client = TestClient(app)

@patch('routers.worker.process_pdf_task')
def test_worker_process_pdf_endpoint(mock_process_task):
    payload = {
        "pdf_path": "/tmp/test.pdf",
        "book_storage": "/tmp/storage",
        "uuid_key": "test-uuid",
        "date_str": "20240101",
        "split_pages": True
    }
    response = client.post("/worker/process-pdf", json=payload)
    
    assert response.status_code == 200
    assert response.json() == {"status": "processing"}
    mock_process_task.assert_called_once_with(
        "/tmp/test.pdf", "/tmp/storage", "test-uuid", "20240101", True
    )
