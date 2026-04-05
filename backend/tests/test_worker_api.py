from fastapi.testclient import TestClient
from main import app
from unittest.mock import patch

client = TestClient(app)

@patch('routers.worker.process_pdf_task')
def test_worker_process_pdf_endpoint(mock_process_task):
    payload = {
        "uuid_key": "test-uuid",
        "date_str": "20240101",
        "split_pages": True
    }
    response = client.post("/worker/process-pdf", json=payload)
    
    assert response.status_code == 200
    assert response.json() == {"status": "processing"}
    # The new signature doesn't need local paths in the payload
    mock_process_task.assert_called_once_with(
        "test-uuid", "20240101", True
    )
