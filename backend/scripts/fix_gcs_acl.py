import os
from google.cloud import storage

# 프로젝트 ID 및 버킷명
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "jwlee-argolis-202104")
BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "jjflipbook-gcs-001")

def fix_acl():
    print(f"🔄 Setting GCS Bucket {BUCKET_NAME} to Public Read...")
    try:
        client = storage.Client(project=PROJECT_ID)
        bucket = client.get_bucket(BUCKET_NAME)
        
        # 1. IAM Policy 읽어오기
        policy = bucket.get_iam_policy(requested_policy_version=3)
        
        # 2. 전용 읽기 권한(roles/storage.objectViewer) 바인딩 추가
        has_all_users = False
        for binding in policy.bindings:
             if binding["role"] == "roles/storage.objectViewer":
                  if "allUsers" not in binding["members"]:
                       binding["members"].add("allUsers")
                  has_all_users = True
                  break
                  
        if not has_all_users:
             policy.bindings.append({
                  "role": "roles/storage.objectViewer",
                  "members": {"allUsers"}
             })
             
        # 3. Policy 적용
        bucket.set_iam_policy(policy)
        print("✅ GCS Bucket is now Public!")
        
    except Exception as e:
        print(f"❌ Error updating Policy: {str(e)}")
        print("⚠️ 만약 Public Access Prevention(공개 액세스 방지)가 켜져 있으면 에러가 발생합니다.")

if __name__ == "__main__":
    fix_acl()
