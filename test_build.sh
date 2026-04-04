#!/bin/bash

# ========================================
# [테스트 빌드용 환경 변수 오버라이드]
# deploy.sh 실행 전 특정 인프라 설정을 변경합니다.
# ========================================

# 프로젝트 ID 변경
export PROJECT_ID="jwlee-test-project-01"

# GCS 버킷 위치 변경
export GCS_BUCKET_NAME="jjflipbook-gcs-0001"

# VPC 네트워크 및 서브넷 설정을 default로 변경
export VPC_NETWORK="default"
export VPC_SUBNET="default"

# Artifact Registry Repo 설정 (jwlee-repo)
export DOCKER_REPO="asia-northeast3-docker.pkg.dev/$PROJECT_ID/jwlee-repo"

echo "========================================"
echo "🧪 테스트 빌드 환경 설정 완료"
echo "👉 PROJECT_ID: $PROJECT_ID"
echo "👉 GCS_BUCKET_NAME: $GCS_BUCKET_NAME"
echo "👉 VPC_NETWORK: $VPC_NETWORK"
echo "👉 VPC_SUBNET: $VPC_SUBNET"
echo "========================================"
echo "🚀 deploy.sh 스크립트를 실행합니다..."
echo "----------------------------------------"

# 스크립트 실행 권한 확인 및 부여
chmod +x ./deploy.sh

# 실제 배포 스크립트 실행
./deploy.sh
