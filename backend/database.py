import os
from google.cloud import storage, firestore

GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "jjflipbook-gcs-001")
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "jwlee-argolis-202104")
FIRESTORE_DB_NAME = os.getenv("FIRESTORE_DB_NAME", "jjflipbook")

storage_client = storage.Client(project=GOOGLE_CLOUD_PROJECT)
bucket = storage_client.bucket(GCS_BUCKET_NAME)

db = firestore.Client(project=GOOGLE_CLOUD_PROJECT, database=FIRESTORE_DB_NAME)
