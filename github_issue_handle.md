# GitHub Flow 기반 협업 방법론 (Best Practices)

본 문서는 운영 중인 프로덕션 코드(상용 서비스)를 다룰 때, 서비스에 악영향을 주지 않고 안전하게 코드를 개선 및 배포하기 위한 **GitHub Flow** 협업 방식의 핵심 프로세스를 정리한 가이드입니다.

## 🎯 왜 GitHub Flow를 써야 하나요?
`main` 브랜치에 직접 코드를 작성하고 Push하는 것은 "실제 운영되는 서버에 즉시 코드를 덮어쓰는 것"과 같아 매우 위험합니다. 버그나 오타 하나가 서비스 장애로 직결될 수 있습니다. 
따라서 우리는 항상 **"이슈(Issue) 등록 -> 격리된 브랜치 작업 -> PR 코드 리뷰 -> 병합(Merge)"** 이라는 안전장치를 통과해야 합니다.

---

## 🚀 GitHub Flow 6단계 워크플로우

### Step 1. 작업 방향 정의 (Issue 등록)
코드 작성 전, 무엇을 왜 수정할 것인지 GitHub Issues에 등록하여 목표를 명확히 합니다.
* **명령어:** `gh issue create --title "[분류] 제목" --body "상세내용"`

### Step 2. 최신화 및 격리된 브랜치 생성 (Branching)
반드시 최신 상태의 `main`에서 출발하여, 현재 이슈만을 위한 새로운 방(Branch)을 만듭니다.
* 브랜치 네이밍: `종류/이슈번호-간단한-설명` (예: `feature/3-login-ui`, `perf/1-async-upload`)
```bash
git checkout main
git pull origin main
git checkout -b perf/1-async-upload
```

### Step 3. 개발 및 커밋 (Commit)
해당 브랜치 내에서만 코드를 마음껏 수정하고 테스트합니다. 작업 단위별로 의미 있는 메시지를 남겨 기록합니다.
```bash
git add .
git commit -m "perf: 업로드 속도 개선 (resolves #1)"
```
> **Tip:** 메시지에 `resolves #이슈번호` 또는 `fixes #이슈번호`를 적어두면 나중에 병합 시 해당 이슈가 자동으로 닫힙니다.

### Step 4. 원격 저장소에 반영 (Push)
내 컴퓨터에서 작업한 브랜치를 GitHub 서버로 올려보냅니다.
```bash
git push -u origin perf/1-async-upload
```

### Step 5. 코드 리뷰 요청 (Pull Request 생성)
가장 중요한 단계입니다. "내가 작업한 브랜치를 `main`에 합쳐도 될지 확인해줘!" 라고 리뷰를 요청합니다. 이 과정에서 자동화된 테스트(CI/CD)나 동료의 코드 리뷰가 진행됩니다.
* **명령어:** 
```bash
gh pr create --title "perf: 업로드 속도 개선 (resolves #1)" --body "상세작업내용" --base main
```

### Step 6. 최종 병합 및 정리 (Merge & Cleanup)
GitHub 화면에서 코드에 문제가 없다고 판단되면 `Merge pull request`를 눌러 `main`에 합칩니다. (보통 커밋을 하나로 깔끔하게 묶는 `Squash and Merge`를 권장합니다.)
이후 역할이 끝난 로컬의 작업 브랜치를 삭제하고 다시 `main`으로 돌아옵니다.
```bash
git checkout main
git pull origin main
git branch -d perf/1-async-upload
```

---

## 💡 요약 규칙 (Golden Rules)
1. **Never commit to main**: 절대 `main` 브랜치에 직접 커밋하거나 푸시하지 마세요.
2. **One Branch = One Issue**: 하나의 브랜치에서는 반드시 하나의 이슈(기능)만 처리하세요. 욕심을 내어 이것저것 고치면 리뷰가 어려워집니다.
3. **Review is mandatory**: 코드가 완벽해 보여도 반드시 PR을 통해 본인 혹은 동료의 리뷰 과정을 거친 후 병합하세요.
