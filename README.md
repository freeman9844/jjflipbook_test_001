[🇺🇸 English Version](./README_EN.md)

# 📖 JJFlipBook - PDF 플립북 뷰어 서비스

PDF 문서를 업로드하여 웹 브라우저에서 실제 책을 넘기는 듯한 **3D 플립북(Page Flip)** 형태로 감상할 수 있는 어플리케이션입니다.

---

## 🏗️ 전체 아키텍처

본 프로젝트는 **Next.js 프론트엔드**와 **FastAPI 백엔드**, 그리고 **Google Cloud 인프라**를 전격 활용하여 탄생한 서버리스 기반 멀티 티어 애플리케이션입니다.

| 계층 (Layer) | 기술 스택 / 활용 |
| :--- | :--- |
| **Frontend** | `Next.js 14+`, `TailwindCSS / Vanilla CSS`, `react-pageflip` (3D 넘김) |
| **Backend** | `FastAPI (Python 3.11)`, `poppler-utils`, `pdf2image` (PDF 분할 변환) |
| **Database** | `Google Cloud Firestore` (NoSQL - 오버레이 및 메타 영구 보존) |
| **Storage** | `Google Cloud Storage` (변환된 대형 페이지 이미지 저장소 - 날짜별 폴더 구조화) |
| **Compute** | `Google Cloud Run` (서버리스 컨테이너 수직 탑재 배포) |

---

## 🏃 로컬 구동 방법

로컬 및 오프라인 환경에서 테스트 시 아래 가이드를 상호 참조하여 실행합니다.

### 1. Backend (FastAPI) 기동
```bash
# 1. 백엔드 폴더 이동 및 가상환경 설정
cd backend
python3 -m venv venv
source venv/bin/activate

# 2. 의존성 패키지 설치
pip install -r requirements.txt

# 3. 로컬 가동 (기본 8000 포트)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
> [!NOTE]  
> 로컬에서 GCS 및 Firestore 연동을 위해서는 사용자 터미널에 `gcloud auth application-default login` 인증 토큰이 필수적입니다.

### 2. Frontend (Next.js) 기동
```bash
# 1. 프론트엔드 폴더 이동 및 패키지 설치
cd frontend
npm install

# 2. 로컬 가동 (기본 3000 포트)
npm run dev
```

---

## 🚀 Google Cloud Run 원클릭 배포 가이드

본 지면에 포함된 쉘 도구(`deploy.sh`)를 가동하면, Artifact Registry 빌드 및 Cloud Run 자동 교차 주입 배포를 5분 내로 원클릭 가동할 수 있습니다.

```bash
# 워크스페이스 마스터 디렉토리에서 실행
./deploy.sh
```

### 💡 주요 환경 변수 개요 (`deploy.sh` 가 자동 주입)
*   `NEXT_PUBLIC_BACKEND_URL`: 프론트엔드가 static 빌드 시 백엔드 앤드포인트를 바라볼 수 있도록 정적으로 구워지는 주소입니다.
*   `GOOGLE_CLOUD_PROJECT`: Cloud Storage 및 Firestore SDK 호출 시 낚아채는 프로젝트 ID 변수입니다.

> [!IMPORTANT]
> **Cloud Run 메모리 및 CPU 권장 사항**: PDF 페이지 장 수가 많거나 해상도가 높을 경우 연산 RAM 소모량이 큽니다. 백앤드의 원활한 안정적 연산을 위해 `deploy.sh` 내에 `--memory=2Gi` 및 `--no-cpu-throttling` 확충 레벨이 배정되어 있습니다. 

---

## 📂 디렉토리 구조도

```text
├── backend/
│   ├── main.py            # FastAPI 비즈니스 로직 (Firestore, GCS 연동)
│   ├── models.py          # Pydantic NoSQL 데이터 모델 팩토리
│   ├── pdf_utils.py       # poppler 기반 PDF 페이지 렌더링 디코더
│   ├── Dockerfile         # 백엔드 컨테이너 빌드 가이드 
│   └── requirements.txt   # 라이브러리 명세 파이프라인
│
├── frontend/
│   ├── src/app/           # Next.js App Router (Dashboard 및 View 페이지)
│   ├── Dockerfile         # 독립형 standalone Next.js 최적화 빌드 펙
│   └── cloudbuild.yaml    # 빌드 시점 ARG 환경변수 주입 스펙
│
└── deploy.sh              # Cloud Run 원클릭 배포 자동화 마스터 스크립트
```

## 🚀 대용량 PDF 처리 및 성능/안정성 최적화 (OOM 방지)

대용량 문서 업로드 및 변환 시 서버 과부하 및 메모리 고갈(OOM)을 방지하도록 백엔드와 프론트엔드의 파일 처리 파이프라인을 스트리밍 및 분할 구조로 최신화했습니다.

### 1. 청크 단위 PDF 변환 (Chunked PDF Processing)
*   **메모리 스파이크 차단**: 대형 PDF 전체를 메모리에 로드하지 않고, **5페이지 단위 청크(Chunk)**로 순차 디코딩하여 RAM 점유율을 극도로 낮추었습니다. (`pdf_utils.py`)

### 2. 엔드-투-엔드 스트리밍 업로드 (Streaming Pipeline)
*   **Frontend-Proxy Relay**: Next.js API Routes 에서 페이로드를 전체 버퍼링하지 않고 `Request.body`를 그대로 파이프하는 **Streaming Body Proxy (`duplex: 'half'`)**를 가동하여 대형 파일 중계 부하를 제거했습니다.
*   **Backend Streaming Sink**: FastAPI에서 `await file.read()` 대신 `shutil.copyfileobj` 스트리밍을 통해 로컬 임시 디렉토리에 고부담 바인딩 없이 파이프합니다. (`main.py`)

### 3. 확실한 자원 회수 (Resource Cleanup Guarantee)
*   **에러 내성 강화**: 파일 처리 성공 여부와 무관하게 `finally` 블록에서 디렉토리 소거(`shutil.rmtree`)를 강제 마킹하여 임시 스토리지 누수가 원천 차단됩니다.

---

## 📊 대시보드 사용성 및 정렬 고도화

사용자 경험과 직관적인 문맥 전달력을 위한 데이터 렌더링 리비전입니다.

*   **최신순 자동 정렬**: 생성일(`created_at`) 타임스탬프를 기준으로 내림차순 렌더 큐를 고정하여 신규 투입된 문서가 상단에 직관 배치됩니다.
*   **업데이트 날짜 시각화**: 카드 피처 뷰 왼쪽 하단에 `2026/03/24` 형태의 통일된 연월일 데이트 레이블을 자동 투사하여 문서 히스토리를 강화했습니다.

---

## 🔒 Direct VPC 내부망 설계 및 반응형 UI 업데이트

최근 패치를 통해 **보안이 강화된 내부망 라우팅** 및 **모바일 화면 대응 디자인**이 통합되었습니다.

### 1. 모바일 반응형 UI 픽스
*   **대시보드**: 모바일 환경에서 좌측 배너가 **상단 가로형 메뉴**로 자동 결합 변형되어 세로 스크롤 구조를 확보합니다.
*   **플립북 뷰어**: 모바일 화면 폭을 최대치로 활용하기 위해 **사이드바를 오프라인 소거**하며, 가동 스케일 연산이 브라우저 너비 피팅에 최적화됩니다.

### 2. Direct VPC Egress & Next.js API Routes Proxy
인프라에 직접적인 노크 공격 폭격을 차단하기 위해 폐쇄 진영을 설계했습니다.
*   **Proxy Relay**: 브라우저 클라이언트가 직접 백엔드를 찌르지 않고, `FE App Server (Node.js)`가 요청 연산을 Proxy 대리 위탁합니다. (`/api/backend/*`)
*   **Internal Ingress**: 백엔드(`Backend Cloud Run`)는 `--ingress=internal`로 가동되어 공용 인터넷 진입이 완벽 차단됩니다.
*   **Direct VPC Egress**: 프론트엔드가 `--vpc-egress=all-traffic` 플래그를 타고 오직 가상 사설망(VPC)의 탯줄을 통해서만 백엔드를 다이렉트 교신합니다.

---

## 🔑 Firestore 기반 인증 시스템 (Authentication)

보안과 전용 세션 관리를 위해 고드된 로그인 시스템이 신설되었습니다.
*   **관리자 자동 시딩**: 초기 부팅 시 Firestore `users` 컬렉션에 `admin` 마스터 계정이 자동 생성됩니다. (초기 PW: `admin`)
*   **패스워드 암호화**: `passlib` 및 `bcrypt==3.2.0` 사양을 조합하여 안전한 단방향 솔트 해싱으로 암호를 보호합니다.
*   **연결형 세션**: 대시보드 진입 시 최우선 `isAuthenticated` 훅 연산을 통해 불법 경로 침입을 엄격하게 단속합니다.

---

## ⚡ PDF 다중 스레드 연산 속도 최적화 (Speed Booster)

대용량 PDF 처리 및 클라우드 전송에 수반되던 시간적 지연 병목을 **구조적 병렬화**로 완전히 단축했습니다.
*   **렌더링 멀티 프로세스**: `pdf2image` 디코딩 연산자에 `thread_count=4` 분산 레벨을 부여하여 무거운 변환 코스트를 분할 가속합니다.
*   **스레딩 GCS 동시 업로드**: I/O 바운드 구간을 `ThreadPoolExecutor` 풀 구조로 우회하여 5개의 연동 페이로드가 **동시 다발적 릴레이 전송**을 우월하게 수행합니다.

---

## 🛡️ 시스템 내부 보안 및 무장 최적화 (2차 최적화 단축 팩)

시스템 전반에 걸친 잔류 버그 소강 상태 흡수 및 내부 과금 코스트 절감을 위한 연합 패치입니다.

### 1. 전사적 API 보안 Header 잠금
*   **의존성 가드 주사**: `POST /upload`, `DELETE /flipbook` 와 같이 구조를 파괴하는 엔드포인트에 `verify_api_key` Header 점검을 통과시켜 불법 무단 엑세스를 가두었습니다.
*   **환경 변수 시딩**: 관리자 `ADMIN_PASSWORD` seeder 구조를 `os.getenv` 분할 주입하여 하드코딩 흔적을 백본에서 완전히 소거했습니다.

### 2. 가독성 로딩 큐 팩 & 코스트 축소
*   **지수 백오프 기반 타이머**: 파일 처리 중 무식한 3초 list polling 폭격을 폐기하고, **최대 30초 점진 누적 타이머 (Exponential Backoff)** 슬롯을 내장하여 DB 할당량 읽기(Read) 과금을 90% 이상 흡수합니다.
*   **실패 예외 안전망**: PDF 디코딩 타임 아웃 시 도큐먼트를 `status: "failed"` 로 즉각 마킹하여 무한 대기 오해를 시각적으로 처리합니다.

### 3. Next.js `<Image />` 렌더 가속
*   **CLS 방지 매직**: 대시보드 리스닝 아이템이 전통 `<img>` 태그에서 Next.js `<Image />` 최적화 객체 세트 마이그를 접목 받았으며 `next.config.ts` Remote Support 연동이 완료되었습니다.

---

## ☁️ Google Cloud 배포 구조도 (Architecture)

```mermaid
graph TD
    User([사용자 / 웹 브라우저]) -->|1. HTTPS 접속| FE_Run["Frontend (Next.js) <br> Cloud Run"];
    
    subgraph VPC ["VPC 사설망 (Direct VPC Egress)"]
        FE_Run -->|2. Proxy API 중계| BE_Run["Backend (FastAPI) <br> Cloud Run <br> (Ingress: Internal)"];
    end
    
    subgraph Google Cloud Platform
        BE_Run -->|3. PDF 이미지 분할| Poppler["Poppler-utils <br> (컨테이너 내장)"];
        BE_Run -->|4. 원본 / 변환 이미지 저장| GCS[("Cloud Storage <br> 이미지 버킷")];
        BE_Run -->|5. 메타데이터 / 오버레이 저장| Firestore[("Cloud Firestore <br> NoSQL DB")];
        
        GCS -.->|6. 이미지 다이렉트 로딩| User;
    end

    style FE_Run fill:#e8f0fe,stroke:#1a73e8,stroke-width:2px
    style BE_Run fill:#e8f0fe,stroke:#1a73e8,stroke-width:2px
    style GCS fill:#e6f4ea,stroke:#1e8e3e,stroke-width:2px
    style Firestore fill:#e6f4ea,stroke:#1e8e3e,stroke-width:2px
```
