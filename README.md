# SearchLens 

## What's New 

### Search Engine (`/app`) — New Features
- **Results Sort Toggle** — switch between Hybrid / Lexical / Semantic sorting
- **JSON Export** — download full results with scores and metadata
- **AI Query Intelligence** — query rewriting, domain detection, strength, alternative queries (sidebar panel)
- **AI Text Correction** — per-result "AI Fix" button with correction suggestions and improved text

### Resume Analyzer (`/resume`) — New Features
- **True Drag & Drop** — drag files directly onto the upload zone
- **Languages Section** — automatic detection of Languages resume sections
- **Entity Extraction UI** — visual NER entity display from resume + JD (tabbed view)
- **AI Section Rewriter** — "Rewrite" button generates ATS-optimized improved section text (with Copy button)
- **Full AI ATS Report tab** — pass likelihood, critical issues, quick wins, keyword strategy, formatting advice

### Landing Page
- Live animated feature preview showing Sort Toggle, AI Query Intel, Resume Drag & Drop

## Quick Start

### Backend
```bash
cd backend
npm install
npm start        # port 3001
# Add GEMINI_API_KEY= to .env for AI features
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # port 5173
```

Login: **demo@searchlens.ai / demo123**

## Full Feature List

### Search Engine
- BM25 lexical + n-gram semantic hybrid scoring
- Adjustable alpha blend slider
- Named Entity Recognition
- Query expansion (30+ domains)
- **Sort results: Hybrid / Lexical / Semantic** ✨
- **JSON export** ✨
- **AI query intelligence** ✨
- **AI text correction suggestions** ✨

### Resume Analyzer
- PDF, DOCX, XLSX, CSV, JSON, TXT support
- **Drag & drop upload** ✨
- Paste resume text
- Section detection: Summary, Experience, Education, Skills, Projects, Certifications, Contact, **Languages** ✨
- Section-wise ATS scoring
- Keyword gap analysis
- **Entity extraction UI (tabbed)** ✨
- **AI section suggestions** ✨
- **AI section rewriter with copy** ✨
- **Full AI ATS report** ✨

### Anomaly Detection
- Z-score on real PC metrics + manual input
- AI root cause analysis

### IoT Fleet
- Real PC + 5 simulated devices
- Live SSE streaming, remote commands

### General
- Animated landing with live demo preview
- Backend + Gemini health indicators
- Sample corpus loader
- JWT auth
