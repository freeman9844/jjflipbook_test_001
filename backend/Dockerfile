FROM python:3.11-slim

# pdf2image 작동에 필연적인 poppler-utils 라이브러리 설치
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip --no-cache-dir --root-user-action=ignore && \
    pip install --no-cache-dir --root-user-action=ignore -r requirements.txt

COPY . .

# Cloud Run 기본 매핑 포트 8080 노출
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
