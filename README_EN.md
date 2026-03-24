[🇰🇷 한국어 버전](./README.md)

# 📖 JJFlipBook - PDF Flipbook Viewer Service

An application to upload PDF documents and view them in a **3D Flipbook (Page Flip)** format that feels like turning a real book on a web browser. Built on Next.js frontend, FastAPI backend, and Google Cloud's serverless architecture.

---

## 🏗️ Overall Architecture

This project is a multi-layer serverless application powered massively by the Google Cloud Platform infrastructure.

| Layer | Tech Stack / Usage |
| :--- | :--- |
| **Frontend** | `Next.js 14+`, `TailwindCSS / Vanilla CSS`, `react-pageflip` (3D flip) |
| **Backend** | `FastAPI (Python 3.11)`, `poppler-utils`, `pdf2image` (PDF splitting/conversion) |
| **Database** | `Google Cloud Firestore` (NoSQL - persistent storage for overlays and meta) |
| **Storage** | `Google Cloud Storage` (Storage for converted large page images - organized by date folders) |
| **Compute** | `Google Cloud Run` (Serverless container deployment) |

---

## 🏃 Local Execution Guide

Refer to the guide below to run the application securely in a local shell.

### 1. Backend (FastAPI) Startup
```bash
# 1. Move to backend folder and setup venv
cd backend
python3 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Local Run (default 8000 port)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
> [!NOTE]  
> In order to connect to GCS and Firestore locally, you must first authenticate using `gcloud auth application-default login` on your terminal.

### 2. Frontend (Next.js) Startup
```bash
# 1. Move to frontend folder and install packages
cd frontend
npm install

# 2. Local Run (default 3000 port)
npm run dev
```

---

## 🚀 Google Cloud Run One-Click Deployment

Using the shell script (`deploy.sh`) included in this project, you can build Artifact Registry images and deploy to Cloud Run securely.

```bash
# Run from the workspace root directory
./deploy.sh
```

### 💡 Key Environment Variables
*   `NEXT_PUBLIC_BACKEND_URL`: Injected during static build to point the frontend to the backend endpoint natively without CORS delays.
*   `GOOGLE_CLOUD_PROJECT`: Used by Cloud Storage and Firestore SDKs to identify the GCP project origins.

> [!IMPORTANT]
> **Cloud Run Memory & CPU Allocation**: PDF conversion may consume large RAM workloads. To maintain robust availability without OOM restarts, `--memory=2Gi` and `--no-cpu-throttling` configurations are included securely inside `deploy.sh`!

---

## 📂 Directory Structure

```text
├── backend/
│   ├── main.py            # FastAPI business logic (Firestore, GCS integration)
│   ├── models.py          # Pydantic NoSQL data models
│   ├── pdf_utils.py       # poppler-based PDF rendering decoder
│   ├── Dockerfile         # Backend container blueprint
│   └── requirements.txt   # Dependency specifications
│
├── frontend/
│   ├── src/app/           # Next.js App Router (Dashboard & View pages)
│   ├── Dockerfile         # Standalone Next.js optimized build blueprint
│   └── cloudbuild.yaml    # Build-time ARG injection specs
│
└── deploy.sh              # One-click Cloud Run deploy automation script
```

## 🚀 OOM Prevention & Asynchronous Performance

Designed to intercept server crashes and out-of-memory cascades during enormous PDF processing procedures.

### 1. Chunked PDF Processing
*   **Memory Spike Mitigation**: Prevents RAM spikes by parsing large PDFs sequentially in smart **5-Page Chunks** rather than dumping the whole blob.
*   **Multiprocessing**: Spawns multiple physical decoding cores utilizing `thread_count=4` inside `pdf2image` arrays.

### 2. End-to-End Streaming Transports
*   **Frontend-Proxy Relay**: Streaming API intercepts utilizing `duplex: 'half'` policies, entirely removing buffering overlaps inside the Node layer.
*   **Backend Streaming Sink**: Writing chunks via `shutil.copyfileobj` pipelines bypasses RAM allocations gracefully.
*   **Concurrent Upload Pools**: Leveraged `ThreadPoolExecutor` bindings to upload parallel arrays (up to 5 workers) directly towards the unified GCS storage bucket seamlessly.

### 3. 📂 1-Level Folder Structure & Cascade Archiving
*   **Virtual Prefix Nesting**: Implemented a standalone 1-depth metadata parsing routine mapped via `folder_id` matching states.
*   **Data Decoupling Principle**: The underlying Storage blob URLs persist securely isolated from UI layer definitions allowing seamless cross-structural `Moves` internally without actual expensive Object Copy operations!
*   **Heavy Cascade Cleanup**: Administrative purges of Folders programmatically execute hard-deletions on child `Overlays`, child `Firestore Maps`, and finally sweeping away remaining static GCS buckets systematically.

### 4. Cleanup Guarantee
*   **Forced Garbage Cleanups**: `finally` blocks explicitly mandate terminal OS-level directory wiping (`shutil.rmtree`), strictly closing out dangling memory leaks.

---

## 🔒 Restricted Internal Routing (Direct VPC Egress)

### 1. Closed Network Topology
Infrastructures are heavily isolated through stringent Virtual Private network boundaries (`jwlee-vpc-001`) preventing direct public access.
*   **Internal Ingress**: The Backend API relies on `--ingress=internal` policies to completely shut off payload deliveries originating from the open Internet.
*   **Proxy Relay**: No remote browser accesses the backend directly; Front-facing Next.js applications strictly proxy the endpoints acting as secure middlemen (`/api/backend/*`).
*   **Direct VPC Egress**: Configured symmetrically with `--vpc-egress=all-traffic`, constraining all outbounds within local subnets seamlessly.

### 2. Serverless Private DNS Routing
*   Routing for the Google Cloud service domains (`.run.app`) is autonomously overridden via a dedicated **Private DNS Zone** inside the VPC perimeter.
*   This ensures all Cloud Run-to-Cloud Run traffic inherently targets Google's interior API layers (`199.36.153.8`) ensuring rapid latency acceleration uncompromised by external NAT IPs.

### 3. Persistent API Gateway Guards
*   State-mutating REST channels natively check for administrative permissions. Deletions and updates strictly traverse persistent `verify_api_key` authentication middlewares effectively evaluating payloads.

---

## 🔑 Authentication Restructuring (Admin Core)

Robust session controls implementing local tokens securely.
*   **Admin Auto Seeding**: The `admin` account is seeded strictly during system lifespan bindings.
*   **Bcrypt Encryption Overhaul**: Upgraded the algorithm by completely stripping legacy `passlib` exceptions and replacing them manually executing intrinsic `bcrypt` validations securing hash collisions securely.
*   **React State Parity**: Client-side hook instances now synchronize with unified global generic loops bypassing overlapping component bugs reliably.

---

## 🛠️ Client React Hydration Fixes (Stability)

*   **SSR Crash Prevention**: Removed raw DOM invocations scaling global animations. Repositioned elements securely inside nested `useEffect` sandboxes dropping `This page couldn't load` crashes.
*   **React Error #310 Hooks Enforcement**: Rearranged Early Return conditional architectures completely ensuring robust React DOM component lifecycle states. Fixed unexpected unmount/mount Hooks sequential disruptions.

---

## ☁️ Google Cloud Architecture Diagram (Mermaid)

```mermaid
graph TD
    User([User / Web Browser]) -->|1. HTTPS Request| FE_Run["Frontend <br> Cloud Run"];
    
    subgraph VPC ["VPC Private Network (Direct VPC Egress)"]
        FE_Run -->|2. Proxy API Relay| BE_Run["Backend <br> Cloud Run <br> (Ingress: Internal)"];
    end
    
    subgraph Google Cloud Platform
        BE_Run -->|3. Split PDF to Images| Poppler["Poppler <br> (Built-in Docker)"];
        BE_Run -->|4. Store Outputs| GCS[("Cloud Storage Bucket")];
        BE_Run -->|5. Store Objects| Firestore[("Cloud Firestore")];
        GCS -.->|6. Direct Blob Loading| User;
    end

    style FE_Run fill:#e8f0fe,stroke:#1a73e8,stroke-width:2px
    style BE_Run fill:#e8f0fe,stroke:#1a73e8,stroke-width:2px
    style GCS fill:#e6f4ea,stroke:#1e8e3e,stroke-width:2px
    style Firestore fill:#e6f4ea,stroke:#1e8e3e,stroke-width:2px
```
