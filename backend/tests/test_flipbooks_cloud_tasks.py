from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from main import app
from utils import verify_api_key

client = TestClient(app)

@patch('database.bucket')
@patch('routers.flipbooks.enqueue_pdf_processing_task')
def test_upload_pdf_uses_cloud_tasks(mock_enqueue, mock_bucket, tmp_path, monkeypatch):
    app.dependency_overrides[verify_api_key] = lambda: True
    monkeypatch.setenv("WORKER_URL", "http://mock-worker")
    
    mock_blob = MagicMock()
    mock_bucket.blob.return_value = mock_blob
    
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
    mock_bucket.blob.assert_called_once()
    mock_blob.upload_from_filename.assert_called_once()
    
    # Verify payload changed
    call_args = mock_enqueue.call_args[1]
    assert "pdf_path" not in call_args["payload"]
    assert "uuid_key" in call_args["payload"]
    app.dependency_overrides.clear()
