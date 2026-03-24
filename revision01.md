# JJFlipBook 시스템 개선 제안서 (인프라 추가 없음)

새로운 인프라 컴포넌트(Cloud CDN, Eventarc, Pub/Sub 등)를 추가 배포하지 않고, **기존의 코드 레벨, 설정, 그리고 현재 스택 내에서의 최적화**에 초점을 맞추어 도출한 개선점입니다.

---

## 1. 치명적인 보안 패치 (코드 레벨)

### 🔴 프론트엔드 클라이언트 측 인증 우회 제거
*   **이슈:** `AuthGuard.tsx` 파일이 하드코딩된 자격 증명(`id === "admin" && password === "admin"`)을 사용하고, `localStorage.getItem("isAuthenticated") === "true"` 값만으로 인증 상태를 판단합니다. 브라우저 콘솔에서 누구나 이 값을 조작하여 로그인 화면을 우회할 수 있습니다.
*   **해결책:** 하드코딩된 자격 증명을 제거하세요. 로그인 성공 시 JWT나 세션 토큰을 `HttpOnly` 쿠키로 저장하고, Next.js Middleware나 서버 측(Server-Side)에서 이 토큰을 검증하도록 로직을 변경해야 합니다.

### 🔴 백엔드 엔드포인트 보호
*   **이슈:** `POST /upload`, `DELETE /flipbook/{uuid_key}`와 같은 데이터를 조작하는 FastAPI 엔드포인트에 인증 확인 로직이 없습니다. API URL만 알면 누구나 데이터를 삭제하거나 업로드할 수 있습니다.
*   **해결책:** FastAPI의 의존성 주입(Dependency Injection, 예: `Depends`)을 사용하여 데이터 변경(Mutation)을 일으키는 모든 엔드포인트에 토큰 유효성 검사(JWT 등)를 필수로 적용하세요.

### 🔴 하드코딩된 관리자 계정 생성 로직 제거
*   **이슈:** `main.py`의 `lifespan` 이벤트에서 `admin`이라는 비밀번호로 관리자 계정을 명시적으로 생성(Seed)하고 있습니다.
*   **해결책:** 비밀번호를 소스 코드에서 제거하고, 환경 변수(`os.getenv("ADMIN_PASSWORD")`)를 통해 기본 관리자 자격 증명을 읽어오도록 수정하세요.

---

## 2. 최우선 코드 버그 수정 (High-Priority Fixes)

### 🔴 데이터 모델 불일치로 인한 커버 이미지 로딩 실패 (프론트엔드)
*   **이슈:** 대시보드(`src/app/page.tsx`)는 여전히 이전 SQLite 데이터 모델(`image_paths_json: string`)을 기대하며, `book.id`를 사용하여 GCS URL을 수동으로 조합하고 있습니다. 하지만 백엔드는 Firestore로 마이그레이션되면서 전체 URL 배열인 `image_urls`을 반환합니다. 이로 인해 커버 이미지를 불러오지 못하고 JSON 파싱 에러가 발생합니다.
*   **해결책:** `page.tsx`의 `Flipbook` 인터페이스를 수정하여 `image_urls: string[]`을 기대하도록 변경하고, `coverUrl = book.image_urls?.[0]`와 같이 단순 할당하세요. 기존의 `JSON.parse` 로직은 제거해야 합니다.

### 🔴 운영 환경에서의 하드코딩된 로컬호스트 URL
*   **이슈:** `src/app/edit/[bookId]/page.tsx` 파일 내 `BACKEND_URL`이 `"http://localhost:8000"`으로 하드코딩되어 있습니다. 이는 Cloud Run 운영 환경에서 100% 충돌을 일으킵니다.
*   **해결책:** `page.tsx`에 구현된 것과 동일하게 Next.js API 프록시(`/api/backend/...`)를 일관되게 사용하도록 컴포넌트를 리팩토링하세요.

---

## 3. 백엔드 처리 효율성 및 안정성

### 🔴 블로킹(Blocking) 없는 PDF 변환 (FastAPI)
*   **이슈:** `pdf2image.convert_from_path`와 같은 무거운 CPU 바운드 작업이 메인 비동기 이벤트 루프의 스레드 풀에서 실행되는 FastAPI의 `BackgroundTasks` 내에서 실행됩니다. 동시에 여러 업로드가 발생하면 서버가 차단(Block)되어 API가 응답하지 않게 됩니다.
*   **해결책:** `asyncio.get_running_loop().run_in_executor(ProcessPoolExecutor(), ...)`를 사용하여 PDF 변환 작업을 전용 프로세스 풀(Process Pool)로 디스패치(Dispatch) 하세요.

### 🔴 백그라운드 작업을 위한 견고한 상태 관리
*   **이슈:** `process_pdf_task`에서 PDF 변환이 실패(예: 손상된 파일)하면 예외는 처리되지만 Firestore는 업데이트되지 않습니다. `page_count`가 계속 `0`으로 남아있기 때문에 프론트엔드는 무한히 폴링(Polling)을 시도하게 됩니다.
*   **해결책:** `except` 블록에 Firestore 문서 상태를 `status: "failed"`로 업데이트하는 로직을 추가하고, 프론트엔드에서 이 상태를 인지하여 폴링을 중지하도록 UI 상태 처리를 추가하세요.

### 🔴 데드 코드 및 의존성 비대화 해결
*   **이슈:** Firestore 마이그레이션 이전에 사용되었던 `db.py` 파일 내에 사용하지 않는 SQLite/SQLModel 로직이 그대로 남아있습니다.
*   **해결책:** `db.py` 파일을 삭제하고, `requirements.txt`에서 SQLModel/SQLite 의존성을 제거하여 Cloud Run 컨테이너 이미지 크기를 줄이고 관리 포인트를 최소화하세요.

### 🔴 하드코딩된 GCP 변수 분리
*   **이슈:** GCS 버킷 이름(`jjflipbook-gcs-001`)과 프로젝트 ID(`jwlee-argolis-202104`)가 `main.py`에 하드코딩되어 있습니다.
*   **해결책:** 스테이징/프로덕션 환경을 명확히 분리하고 코드 유연성을 높이기 위해 이를 `os.getenv("GCS_BUCKET_NAME")` 및 `os.getenv("GOOGLE_CLOUD_PROJECT")`로 추출하세요.

---

## 4. 프론트엔드 미세 조정 및 최적화

### 🔴 Next.js 이미지 최적화 적용
*   **이슈:** 현재 이미지를 렌더링할 때 표준 `<img>` 태그를 사용하고 있습니다.
*   **해결책:** 별도의 Cloud CDN을 두지 않고도 대역폭을 줄이기 위해 Next.js의 `<Image />` 컴포넌트로 마이그레이션하세요. 기본적으로 WebP 등 최적화된 포맷을 제공하고 레이아웃 시프트(CLS)를 방지해 줍니다. 단, `next.config.ts`의 `remotePatterns`에 `storage.googleapis.com`을 추가해야 합니다.

### 🔴 Firestore 읽기 비용 절감 (폴링 최적화)
*   **이슈:** 문서 처리 중일 때 `page.tsx`는 3초마다 `/api/backend/flipbooks` 엔드포인트를 폴링합니다. 이는 **전체** 책 목록을 계속해서 불러오기 때문에 불필요한 Firestore 읽기 할당량을 소모합니다.
*   **해결책:** 현재 처리 중인 **특정 문서**만 조회(`/api/backend/flipbook/{uuid}`)하도록 폴링 메커니즘을 변경하거나, 폴링 주기를 점점 늘리는 지수 백오프(Exponential Backoff, 예: 3초, 5초, 10초, 20초) 타이머를 구현하여 서버와 DB 부하를 줄이세요.