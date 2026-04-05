import pytest
import sys
from unittest.mock import MagicMock

# Create a mock for google.cloud.tasks_v2
mock_tasks_v2 = MagicMock()
mock_tasks_v2.HttpMethod.POST = "POST"
# Make it available in sys.modules so the try/except block imports it successfully
sys.modules['google.cloud'] = MagicMock()
sys.modules['google.cloud'].tasks_v2 = mock_tasks_v2
sys.modules['google.cloud.tasks_v2'] = mock_tasks_v2

def test_create_pdf_task():
    mock_client = mock_tasks_v2.CloudTasksClient.return_value
    mock_client.create_task.return_value = MagicMock(name="tasks/test-task")
    
    from cloud_tasks import enqueue_pdf_processing_task
    
    result = enqueue_pdf_processing_task(
        project_id="test-project",
        location="asia-northeast3",
        queue="pdf-worker-queue",
        worker_url="https://worker.example.com/worker/process-pdf",
        payload={"pdf_path": "test.pdf", "book_storage": "/tmp/book", "uuid_key": "123", "date_str": "20240101", "split_pages": True}
    )
    
    assert result is not None
    mock_client.create_task.assert_called_once()
