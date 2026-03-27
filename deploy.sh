#!/bin/bash

# 설정 변수
GCLOUD_PATH="/Users/jungwoonlee/google-cloud-sdk/bin/gcloud"
PROJECT_ID=$($GCLOUD_PATH config get-value project)
REGION="asia-northeast3" # 서울 리전 (임의 변경 가능)

if [ -z "$PROJECT_ID" ]; then
  echo "❌ gcloud 프로젝트 ID를 찾을 수 없습니다. gcloud config set project [ID]를 먼저 실행하세요."
  exit 1
fi

echo "🚀 배포를 시작합니다! Project ID: $PROJECT_ID, Region: $REGION"

# 1. 백엔드 빌드 및 배포
echo "----------------------------------------"
echo "📦 [1/4] Backend 도커 이미지 빌드 중..."
echo "----------------------------------------"
$GCLOUD_PATH builds submit backend --tag gcr.io/$PROJECT_ID/flipbook-backend

echo "----------------------------------------"
echo "🌐 [2/4] Backend Cloud Run 배포 중..."
echo "----------------------------------------"
$GCLOUD_PATH run deploy flipbook-backend \
  --image gcr.io/$PROJECT_ID/flipbook-backend \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --no-cpu-throttling \
  --network=jwlee-vpc-001 \
  --subnet=jwlee-vpc-001 \
  --vpc-egress=all-traffic \
  --ingress=internal

# 백엔드 URL 추출
BACKEND_URL=$($GCLOUD_PATH run services describe flipbook-backend --region $REGION --format 'value(status.url)')
echo "✅ Backend URL 발급 완료: $BACKEND_URL"

# 2. 프론트엔드 빌드 및 배포
echo "----------------------------------------"
echo "📦 [3/4] Frontend 도커 이미지 빌드 중..."
echo "       (Backend URL: $BACKEND_URL 주입)"
echo "----------------------------------------"
$GCLOUD_PATH builds submit frontend \
  --config frontend/cloudbuild.yaml \
  --substitutions _NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL

echo "----------------------------------------"
echo "🌐 [4/4] Frontend Cloud Run 배포 중..."
echo "----------------------------------------"
$GCLOUD_PATH run deploy flipbook-frontend \
  --image gcr.io/$PROJECT_ID/flipbook-frontend \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --network=jwlee-vpc-001 \
  --subnet=jwlee-vpc-001 \
  --vpc-egress=all-traffic \
  --set-env-vars NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL

FRONTEND_URL=$($GCLOUD_PATH run services describe flipbook-frontend --region $REGION --format 'value(status.url)')

echo "========================================"
echo "🎉 모든 배포가 완료되었습니다!"
echo "👉 Frontend URL: $FRONTEND_URL"
echo "👉 Backend URL: $BACKEND_URL"
echo "========================================"
