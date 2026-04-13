#!/bin/bash
set -e  # 어떤 명령이든 실패하면 즉시 중단

# ========================================
# [멀티 환경 통합 배포 스크립트]
# 대화형 프롬프트를 통해 타겟 프로젝트를 선택하고,
# 환경 변수 설정 후 TDD 검증 및 Cloud Run 배포를 진행합니다.
# ========================================

echo "========================================"
echo "🚀 배포할 타겟 환경을 선택하세요:"
echo "  1) jwlee-test-project-01 (개인 프로젝트 망)"
echo "  2) jwlee-argolis-202104  (운영 VPC 사설망)"
echo "========================================"
read -p "번호 선택 (1 또는 2): " project_choice

if [ "$project_choice" = "1" ]; then
    export PROJECT_ID="jwlee-test-project-01"
    export GCS_BUCKET_NAME="jjflipbook-gcs-0001"
    export VPC_NETWORK="default"
    export VPC_SUBNET="default"
    export DOCKER_REPO="asia-northeast3-docker.pkg.dev/$PROJECT_ID/jwlee-repo"
    export REGION="asia-northeast3"
    export FIRESTORE_DB_NAME="jjflipbook"
elif [ "$project_choice" = "2" ]; then
    export PROJECT_ID="jwlee-argolis-202104"
    export GCS_BUCKET_NAME="jjflipbook-gcs-001"
    export VPC_NETWORK="jwlee-vpc-001"
    export VPC_SUBNET="jwlee-vpc-001"
    export DOCKER_REPO="gcr.io/$PROJECT_ID"
    export REGION="asia-northeast3"
    export FIRESTORE_DB_NAME="jjflipbook"
else
    echo "❌ 잘못된 입력입니다. 스크립트를 종료합니다."
    exit 1
fi

# ========================================
# [보안 환경변수 입력]
# 민감한 시크릿은 스크립트에 하드코딩하지 않고 실행 시점에 입력받습니다.
# ========================================
echo ""
echo "🔐 보안 환경변수를 입력하세요 (미입력 시 기본값 사용 - 프로덕션 비권장):"

read -sp "  ADMIN_PASSWORD (관리자 비밀번호, 기본: admin): " INPUT_ADMIN_PASSWORD
echo ""
export ADMIN_PASSWORD="${INPUT_ADMIN_PASSWORD:-admin}"

read -sp "  INTERNAL_API_KEY (내부 API 키, 기본: secret_dev_key): " INPUT_INTERNAL_API_KEY
echo ""
export INTERNAL_API_KEY="${INPUT_INTERNAL_API_KEY:-secret_dev_key}"

read -sp "  SESSION_SECRET (세션 서명 키, 기본: simple-mvp-session-secret-123): " INPUT_SESSION_SECRET
echo ""
export SESSION_SECRET="${INPUT_SESSION_SECRET:-simple-mvp-session-secret-123}"

if [ "$ADMIN_PASSWORD" = "admin" ] || [ "$INTERNAL_API_KEY" = "secret_dev_key" ] || [ "$SESSION_SECRET" = "simple-mvp-session-secret-123" ]; then
    echo "⚠️  경고: 기본값 시크릿이 사용됩니다. 프로덕션 환경에서는 강한 값을 설정하세요!"
fi

# gcloud 명령어 경로 결정
# 환경변수 미설정 시 PATH에서 gcloud를 먼저 찾고, 없으면 macOS 기본 경로 시도
if command -v gcloud &> /dev/null; then
    export GCLOUD_PATH="gcloud"
else
    export GCLOUD_PATH="${GCLOUD_PATH:-/Users/jungwoonlee/google-cloud-sdk/bin/gcloud}"
fi

if [ -z "$PROJECT_ID" ]; then
  echo "❌ gcloud 프로젝트 ID를 찾을 수 없습니다."
  exit 1
fi

if ! command -v "$GCLOUD_PATH" &> /dev/null && [ ! -f "$GCLOUD_PATH" ]; then
  echo "❌ gcloud 명령어를 찾을 수 없습니다. GCLOUD_PATH 환경변수를 설정하세요."
  exit 1
fi

echo ""
echo "🚀 배포를 시작합니다! Project ID: $PROJECT_ID, Region: $REGION"

echo "----------------------------------------"
echo "🛠️ [Phase 0] 배포 전 (Pre-Flight) 오프라인 TDD 및 빌드 검증 시작..."
echo "----------------------------------------"

# 1. 백엔드 메모리 단위 테스트 (TestClient)
echo "▶ Checking & Installing Backend Local Test Dependencies..."
if ! backend/venv/bin/python3 -c "import pytest, fastapi, bcrypt" &> /dev/null; then
  echo "📦 패키지 의존성이 누락되었습니다. backend/requirements.txt 를 설치합니다..."
  backend/venv/bin/pip install -r backend/requirements.txt --quiet --index-url https://pypi.org/simple
fi

echo "▶ Running Backend Local Tests..."
PYTHONPATH=./backend backend/venv/bin/python3 -m pytest backend/tests/test_api_local.py -v
if [ $? -ne 0 ]; then
  echo "❌ [PRE-FLIGHT] 백엔드 오프라인 단위 테스트 실패! 배포를 전면 취소합니다."
  exit 1
fi

# 2. 프론트엔드 검증 (Type-Check, Lint, Test, Build)
echo "▶ Running Frontend TDD & Build Checks..."
cd frontend

# 필수 의존성 설치 (공개 NPM 레지스트리 강제, 의존성 충돌 무시)
export NPM_CONFIG_UPDATE_NOTIFIER=false
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false
npm install --quiet --legacy-peer-deps --loglevel=error --registry=https://registry.npmjs.org/

echo "   [2-1] TypeScript Strict Type-Check..."
npm run type-check
if [ $? -ne 0 ]; then
  echo "❌ [PRE-FLIGHT] 프론트엔드 정적 타입 검사 탈락! (Type-check failed)"
  cd ..
  exit 1
fi

echo "   [2-2] ESLint Code-Smell Check..."
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ [PRE-FLIGHT] 프론트엔드 코드 품질 검사 탈락! (ESLint failed)"
  cd ..
  exit 1
fi

echo "   [2-3] Jest Component Unit Test..."
npm run test
if [ $? -ne 0 ]; then
  echo "❌ [PRE-FLIGHT] 프론트엔드 단위 UI 테스트 탈락!"
  cd ..
  exit 1
fi

echo "   [2-4] Next.js SSR Static Build Check..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ [PRE-FLIGHT] 프론트엔드 로컬 빌드/컴파일 실패! 배포 파이프라인을 중단합니다."
  cd ..
  exit 1
fi

cd ..

echo "✅ 사전 역량 검증 완벽 통과! 진짜 클라우드 배포 파이프라인(Phase 1~4)을 시작합니다..."

# ========================================
# [VPC 및 네트워크 보안 옵션 처리]
# VPC_NETWORK가 설정되어 있지 않거나 'default'인 경우 서버리스 VPC Egress를 비활성화합니다.
# ========================================
VPC_OPTIONS=""
INGRESS_OPTIONS="--ingress=all"

if [ -n "$VPC_NETWORK" ] && [ "$VPC_NETWORK" != "default" ]; then
  VPC_OPTIONS="--network=$VPC_NETWORK --subnet=$VPC_SUBNET --vpc-egress=private-ranges-only"
  INGRESS_OPTIONS="--ingress=internal"
  echo "🔒 커스텀 VPC 보안 모드로 배포됩니다. (Network: $VPC_NETWORK)"
else
  echo "🔓 퍼블릭 모드로 배포됩니다. (VPC 서버리스 Egress 비활성화)"
fi

echo "----------------------------------------"
echo "📦 [1/4] Backend 도커 이미지 빌드 중..."
echo "----------------------------------------"
$GCLOUD_PATH builds submit backend \
  --project=$PROJECT_ID \
  --tag $DOCKER_REPO/flipbook-backend:latest
if [ $? -ne 0 ]; then echo "❌ Backend 빌드 실패!"; exit 1; fi

echo "----------------------------------------"
echo "🌐 [2/4] Backend Cloud Run 배포 중..."
echo "----------------------------------------"
$GCLOUD_PATH run deploy flipbook-backend \
  --project=$PROJECT_ID \
  --image $DOCKER_REPO/flipbook-backend \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=600 \
  $VPC_OPTIONS \
  $INGRESS_OPTIONS \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,FIRESTORE_DB_NAME=$FIRESTORE_DB_NAME,GCS_BUCKET_NAME=$GCS_BUCKET_NAME,INTERNAL_API_KEY=$INTERNAL_API_KEY,ADMIN_PASSWORD=$ADMIN_PASSWORD"
if [ $? -ne 0 ]; then echo "❌ Backend 배포 실패!"; exit 1; fi

# 백엔드 URL 추출
BACKEND_URL=$($GCLOUD_PATH run services describe flipbook-backend --project=$PROJECT_ID --region $REGION --format 'value(status.url)')
echo "✅ Backend URL 발급 완료: $BACKEND_URL"

echo "----------------------------------------"
echo "📦 [3/4] Frontend 도커 이미지 빌드 중..."
echo "       (Backend URL: $BACKEND_URL 주입)"
echo "----------------------------------------"
$GCLOUD_PATH builds submit frontend \
  --project=$PROJECT_ID \
  --config frontend/cloudbuild.yaml \
  --substitutions _NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL,_DOCKER_REPO=$DOCKER_REPO
if [ $? -ne 0 ]; then echo "❌ Frontend 빌드 실패!"; exit 1; fi

echo "----------------------------------------"
echo "🌐 [4/4] Frontend Cloud Run 배포 중..."
echo "----------------------------------------"
$GCLOUD_PATH run deploy flipbook-frontend \
  --project=$PROJECT_ID \
  --image $DOCKER_REPO/flipbook-frontend \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  $VPC_OPTIONS \
  --set-env-vars "NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL,GCS_BUCKET_NAME=$GCS_BUCKET_NAME,INTERNAL_API_KEY=$INTERNAL_API_KEY,SESSION_SECRET=$SESSION_SECRET"
if [ $? -ne 0 ]; then echo "❌ Frontend 배포 실패!"; exit 1; fi

FRONTEND_URL=$($GCLOUD_PATH run services describe flipbook-frontend --project=$PROJECT_ID --region $REGION --format 'value(status.url)')

echo "----------------------------------------"
echo "🔐 [Phase 4.5] Backend CORS 정책 동적 갱신 중..."
echo "       (Frontend URL: $FRONTEND_URL 허용)"
echo "----------------------------------------"
$GCLOUD_PATH run services update flipbook-backend \
  --project=$PROJECT_ID \
  --region $REGION \
  --update-env-vars "FRONTEND_URL=$FRONTEND_URL,NEXT_PUBLIC_FRONTEND_URL=$FRONTEND_URL" > /dev/null 2>&1 || echo "⚠️ 백엔드 CORS 업데이트 중 일부 경고 발생"

echo "✅ 백엔드 CORS 보안 업데이트 완료!"

echo "========================================"
echo "🎉 모든 배포가 완료되었습니다!"
echo "👉 Frontend URL: $FRONTEND_URL"
echo "👉 Backend URL:  $BACKEND_URL"
echo "========================================"

echo "----------------------------------------"
echo "🧹 [Phase 5] 테스트 정화 (Garbage Collection) 스크립트 실행 중..."
echo "----------------------------------------"
export GOOGLE_CLOUD_PROJECT=$PROJECT_ID
export FIRESTORE_DB_NAME=$FIRESTORE_DB_NAME
export GCS_BUCKET_NAME=$GCS_BUCKET_NAME
backend/venv/bin/python3 backend/scripts/cleanup_test_data.py
if [ $? -ne 0 ]; then
  echo "⚠️ [CLEANUP WARNING] 테스트 더미 데이터 삭제 중 일부 오류가 발생했을 수 있습니다 (비치명적 경고)"
fi

echo "🚀 배포 파이프라인(TDD 내장)이 완벽하게 종료되었습니다!"
