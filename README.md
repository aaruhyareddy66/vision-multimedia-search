# Vision — Multimedia Search System

Vision is a multimedia search tool that automatically extracts text and detects objects from uploaded images, making them searchable by content instead of just filename. Built for small and mid-scale enterprises that need to search through large volumes of unstructured images (scanned documents, screenshots, photos) without manual tagging.

**Live demo:** https://vision-multimedia-search.vercel.app

## What it does

1. **Upload** an image through the web interface
2. **OCR (Optical Character Recognition)** extracts any text visible in the image using Tesseract
3. **Object detection** identifies real-world objects (person, laptop, car, chair, etc.) using YOLOv8
4. **Indexing** — extracted text and detected objects are stored in a search-optimized database (OpenSearch)
5. **Search** — users can search by filename, extracted text, or detected object tags and get instant results

## Architecture
──────────────┐      ┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│   Frontend   │─────▶│  Node.js API │─────▶│  Python Service   │      │  OpenSearch  │
│   (Vercel)   │      │   (Render)   │      │ (Hugging Face)     │      │  (Bonsai)    │
│              │◀─────│              │◀─────│  OCR + YOLOv8       │      │              │
└──────────────┘      └──────┬───────┘      └──────────────────┘      └──────▲───────┘
│                                                │
└────────────────────────────────────────────────┘
indexes processed metadata

- **Frontend** (Vercel): static HTML/JS interface for upload and search
- **Node.js API** (Render): handles file uploads, orchestrates processing, and serves search queries
- **Python Service** (Hugging Face Spaces, Docker): runs OCR (Tesseract) and object detection (YOLOv8) on uploaded images
- **OpenSearch** (Bonsai.io): stores and indexes extracted text/tags for fast full-text search

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| API layer | Node.js, Express |
| Processing | Python, Flask, OpenCV, Tesseract OCR, YOLOv8 (Ultralytics) |
| Search | OpenSearch (Elasticsearch-compatible) |
| Hosting | Vercel (frontend), Render (API), Hugging Face Spaces (Python/ML), Bonsai.io (search) |

## API endpoints

All requests go through the Node.js API (`https://vision-multimedia-search.onrender.com`):

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Checks status of Node, OpenSearch, and Python service |
| POST | `/upload` | Accepts a file (`multipart/form-data`, field name `file`), processes it, and indexes the result |
| GET | `/search?q=<query>` | Full-text search across filename, OCR text, and detected object tags |
| GET | `/files` | Lists all indexed files, most recent first |
| DELETE | `/files/:id` | Deletes a specific indexed file by its document ID |

## Running locally

**Prerequisites:** Node.js, Python 3.11+, Docker, Tesseract OCR installed locally.

```bash
# 1. Start OpenSearch locally (or point to a hosted instance in .env)
docker-compose up -d

# 2. Start the Python processing service
cd python-service
pip install -r requirements.txt
python app.py

# 3. Start the Node API
cd node-service
npm install
node server.js

# 4. Open frontend/index.html in a browser
```

Each service reads configuration from its own `.env` file — set `PYTHON_SERVICE_URL`, `ELASTICSEARCH_URL`, and port values there.

## Known limitations

- **Cold starts**: the free-tier Render and Hugging Face services "sleep" after periods of inactivity. The first request after idling can take 20–50 seconds while the service wakes up.
- **Storage cap**: the free OpenSearch tier on Bonsai has limited storage — suitable for demos and moderate use, not large-scale production data.
- **Object detection scope**: YOLOv8 nano detects 80 general-purpose object classes (COCO dataset). It does not perform custom/domain-specific object recognition out of the box.
- **OCR accuracy**: works best on clear, high-contrast text (documents, screenshots, printed text). Handwriting and low-resolution or heavily stylized text may not extract reliably.

## Possible improvements

- Semantic/visual similarity search using CLIP embeddings (search by meaning, not just exact text/tag match)
- Batch upload and background/async processing for multiple files
- Video file support (frame extraction + per-frame processing)
- User authentication and per-user file scoping
- A dashboard view with thumbnails and filtering by object type or date

## License

MIT
