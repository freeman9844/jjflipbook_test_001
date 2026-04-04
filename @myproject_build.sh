#!/bin/bash

# ========================================
# [멀티 프로젝트 빌드용 환경 변수 주입기]
# deploy.sh 실행 전 프로젝트별 인프라 환경을 설정합니다.
# ========================================

echo "========================================"
echo "🚀 배포할 타겟 프로젝트를 선택하세요:"
echo "  1) jwlee-test-project-01 (테스트 퍼블릭 망)"
echo "  2) jwlee-argolis-202104  (운영 VPC 사설망)"
echo "========================================"
read -p "번호 선택 (1 또는 2): " project_choice

if [ "$project_choice" = "1" ]; then
    # ========================================
    # [1] 테스트 환경 (Test)
    # ========================================
    export PROJECT_ID="jwlee-test-project-01"
    export GCS_BUCKET_NAME="jjflipbook-gcs-0001"
    export VPC_NETWORK="default"
    export VPC_SUBNET="default"
    export DOCKER_REPO="asia-northeast3-docker.pkg.dev/$PROJECT_ID/jwlee-repo"

elif [ "$project_choice" = "2" ]; then
    # ========================================
    # [2] 운영 환경 (Production)
    # ========================================
    export PROJECT_ID="jwlee-argolis-202104"
    export GCS_BUCKET_NAME="jjflipbook-gcs-001"
    export VPC_NETWORK="jwlee-vpc-001"
    export VPC_SUBNET="jwlee-vpc-001"
    export DOCKER_REPO="gcr.io/$PROJECT_ID"

else
    echo "❌ 잘못된 입력입니다. 스크립트를 종료합니다."
    exit 1
fi

echo "========================================"
echo "🧪 빌드 환경 설정 완료"
echo "👉 TARGET_PROJECT: $PROJECT_ID"
echo "👉 GCS_BUCKET_NAME: $GCS_BUCKET_NAME"
echo "👉 VPC_NETWORK: $VPC_NETWORK"
echo "👉 VPC_SUBNET: $VPC_SUBNET"
echo "========================================"
echo "🚀 deploy.sh 마스터 스크립트를 실행합니다..."
echo "----------------------------------------"

# 스크립트 실행 권한 확인 및 부여
chmod +x ./deploy.sh

# 실제 배포 스크립트 실행
./deploy.sh
