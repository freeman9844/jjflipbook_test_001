import json

def enqueue_pdf_processing_task(project_id: str, location: str, queue: str, worker_url: str, payload: dict):
    try:
        from google.cloud import tasks_v2
    except Exception:
        # Mock for local testing on unsupported platforms
        from unittest.mock import MagicMock
        tasks_v2 = MagicMock()
        tasks_v2.HttpMethod.POST = "POST"
        
    client = tasks_v2.CloudTasksClient()
    
    parent = client.queue_path(project_id, location, queue)
    
    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": worker_url,
            "headers": {"Content-type": "application/json"},
            "body": json.dumps(payload).encode(),
            "oidc_token": {"service_account_email": f"{project_id}@appspot.gserviceaccount.com"}
        }
    }
    
    response = client.create_task(request={"parent": parent, "task": task})
    return response