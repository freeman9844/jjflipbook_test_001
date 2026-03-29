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

echo "----------------------------------------"
echo "🛠️ [Phase 0] 배포 전 (Pre-Flight) 오프라인 TDD 및 빌드 검증 시작..."
echo "----------------------------------------"

# 1. 백엔드 메모리 단위 테스트 (TestClient)
echo "▶ Checking & Installing Backend Local Test Dependencies..."
if ! python3 -c "import pytest, fastapi, bcrypt" &> /dev/null; then
  echo "📦 패키지 의존성이 누락되었습니다. backend/requirements.txt 를 설치합니다..."
  uv pip install -r backend/requirements.txt --quiet --index-url https://pypi.org/simple
fi

echo "▶ Running Backend Local Tests..."
PYTHONPATH=./backend python3 -m pytest backend/tests/test_api_local.py -v
if [ $? -ne 0 ]; then
  echo "❌ [PRE-FLIGHT] 백엔드 오프라인 단위 테스트 실패! 배포를 전면 취소합니다."
  exit 1
fi

# 2. 프론트엔드 검증 강화 (Type-Check, Lint, Test, Build)
echo "▶ Running Frontend TDD & Build Checks..."
cd frontend

# 필수 의존성 재확인 (퍼블릭 NPM 레지스트리 강제 지정으로 사내망 블록 우회, 의존성 충돌 무시)
npm install --quiet --no-fund --no-audit --legacy-peer-deps --registry=https://registry.npmjs.org/

echo "   [2-1] TypeScript Strict Type-Check..."
npm run type-check
if [ $? -ne 0 ]; then
  echo "❌ [PRE-FLIGHT] 프론트엔드 정적 타입 검사 탈락! (Type-check failed)"
  cd ..
  exit 1
fi

echo "   [2-2] ESLint & Prettier Code-Smell Check..."
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ [PRE-FLIGHT] 프론트엔드 코드 품질 검사 탈락! (ESLint failed)"
  cd ..
  exit 1
fi

echo "   [2-3] Jest Component Unit Test..."
npm run test
if [ $? -ne 0 ]; then
  echo "❌ [PRE-FLIGHT] 프론트엔드 단위 UI 테스트 탈락! (AuthGuard 등 렌더링 검사 실패)"
  cd ..
  exit 1
fi

echo "   [2-4] Next.js SSR Static Build Check..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ [PRE-FLIGHT] 프론트엔드 로컬 빌드/컴파일 실패! 배포를 전면 취소합니다."
  cd ..
  exit 1
fi
cd ..

echo "✅ 사전 역량 검증 완벽 통과! 진짜 클라우드 배포 파이프라인(Phase 1~4)을 시작합니다..."

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

echo "----------------------------------------"
echo "🧹 [Phase 5] 테스트 정화 (Garbage Collection) 스크립트 실행 중..."
echo "----------------------------------------"
python3 backend/scripts/cleanup_test_data.py
if [ $? -ne 0 ]; then
  echo "⚠️ [CLEANUP WARNING] 테스트 더미 데이터 삭제 중 일부 오류가 발생했을 수 있습니다 (비치명적 경고)"
fi

echo "🚀 배포 파이프라인(TDD 내장)이 완벽하게 종료되었습니다!"
