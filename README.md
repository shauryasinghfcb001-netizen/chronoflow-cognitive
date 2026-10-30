# ChronoFlow — Cognitive & Daily Telemetry Workspace

**ChronoFlow** is a full-stack **Cognitive Telemetry, Screen Hygiene, GPS Movement, and AI Daily Planning Workspace** built with **React 19, TypeScript, Tailwind CSS, Express, Firebase (Firestore & Google Auth), and the Google Gemini API (`@google/genai`)**.

Designed around a clean, conversational **ChatGPT-style interface**, ChronoFlow tracks how you spend every hour of your day (`Today's Hours`), scores each hour from `0–100pt` based on cognitive focus, screen efficiency, and physical posture/motion, computes a unified **1–10 Daily Efficiency Scale**, and connects with external **Model Context Protocol (MCP) Plugins** (**MiniMe Screen Watcher**, **Codegen.com**, and **WhatsApp Telemetry**).

---

## ✨ Key Features

### 1. Conversational Gemini AI Assistant & Daily Stream (`Chat` Tab)
- **Context-Aware Q&A (`/api/gemini/chat`)**: Ask anything about your day, screen habits, productivity peaks, or schedule. Gemini receives your live `Today's Hours` timeline, `1–10 Efficiency Scale`, daily goals, and GPS trajectory.
- **Natural-Language Smart Scheduling**: Tell ChronoFlow *"Schedule 09:00 for Deep Architecture Work"* or click **"Plan my schedule for tomorrow"** to automatically populate hourly blocks via Gemini Function Calling (`scheduleCognitiveHour`).
- **End-of-Day Executive Transcription Digest (`/api/gemini/daily-summary`)**: Generates a structured daily summary highlighting productive peaks vs. cognitive drain hours, screen efficiency, and a 3-block action plan for tomorrow.
- **Voice Note Transcription (`/api/gemini/transcribe`)**: Record voice notes directly from the composer bar and transcribe them with Gemini multimodal audio analysis.
- **Real-Time Live Voice Co-Pilot (`/api/live` WebSocket)**: Bidirectional 16kHz PCM audio streaming with **Gemini Live (`gemini-3.8-live`)** and real-time voice tool calling.
- **GPS Trajectory & Google Maps Grounding (`/api/gemini/maps-grounding`)**: Log live browser Geolocation coordinates, calculate Haversine walking distance (`km`), and discover nearby quiet workspaces, cafes, and walking recovery trails grounded on Google Maps.

### 2. Today's Hours — Interactive Cognitive Timeline (`0–100pt`)
- **Hour-by-Hour Telemetry (`00:00`–`23:00`)**: Each logged hour tracks:
  - **Activity Description** & **Cognitive State** (`Deep Focus`, `Creative Synthesis`, `Active Learning`, `Shallow / Admin`, `Intentional Recovery`, or `Distracted / Drift`)
  - **Screen Hygiene**: Productive screen minutes vs. total screen minutes (`0–60m`)
  - **Physical Motion & Steps**: `Sedentary Desk`, `Standing Posture`, `Active Walk / Pacing`, or `High-Intensity Workout`
  - **Subjective Energy (`1–5`)**
- **1-Click Gemini Hour Breakdown**: Click any hour in the left sidebar or in the **Today's Hours** timeline card to have Gemini explain why that hour scored its `pt` rating and how to optimize it.

### 3. Unified 1–10 Daily Efficiency Scale (`Scale` Tab)
Synthesizes your entire day into a single **1.0 to 10.0 Efficiency Scale** across four weighted dimensions:
1. **Focus Quality (35%)** — Weighted cognitive state intensity across logged hours
2. **Screen Hygiene (25%)** — Ratio of productive screen time vs. passive screen drift
3. **Physical Motion & GPS (20%)** — Active movement hours, step count, and GPS waypoints
4. **Goal Execution (20%)** — Daily target completion rate

### 4. MCP Plugin Store & External Agent Webhooks (`Plugins` Tab)
- **MiniMe (Screen & Efficiency MCP)**: Tracks active window focus (VS Code, Terminal, Figma, Docs), flags passive screen drift, and generates per-hour efficiency coaching tips.
- **Codegen.com (Autonomous Coding Agent)**: Syncs autonomous PR reviews, test suites, and coding sprints into your hourly timeline.
- **WhatsApp (Chat & Voice Log Bridge)**: Converts timestamped self-messages and voice notes into structured hourly cognitive logs.
- **Custom MCP Connector & Webhook Ingestion**: Register any custom MCP server URL or push external telemetry directly to `POST /api/mcp/ingest`.

### 5. Dual Persistence (Offline-First LocalStorage + Firebase Cloud Sync)
- Works immediately out of the box with **LocalStorage** and curated research-backed templates (*Ultradian Maker Protocol*, *Executive Deep-Work Split*, *High-Metabolic Hybrid*).
- Sign in with **Google Authentication** to sync hourly entries and daily goals in real time with **Cloud Firestore** under strict owner-only security rules.

---

## 🧠 How the Scoring Engine Works

Each logged hour in `src/utils/cognitiveEngine.ts` receives a deterministic **Hourly Productivity Score (`0–100pt`)**:

$$\text{Hourly Score} = \text{clamp}_{0..100}\left(\text{round}\left(0.55 \times \text{FocusWeight} + 0.25 \times \text{ScreenEfficiency} + 0.20 \times \text{EnergyScore} + \text{MotionBonus}\right)\right)$$

- **Productive Peak (`75–100pt`)**: High-leverage deep work, creative synthesis, or active metabolic recovery.
- **Effective Flow (`50–74pt`)**: Solid execution or structured administrative maintenance.
- **Cognitive Drain (`0–49pt`)**: High context switching or passive, unintentional screen time.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite 6 |
| **Backend** | Node.js, Express, `tsx`, WebSocket (`ws`) |
| **AI & Multimodal** | Google GenAI SDK (`@google/genai`) — `gemini-3.1-flash-lite`, `gemini-3.8-flash`, `gemini-2.5-flash` (Google Maps Grounding), `gemini-3.8-live` (Real-time Audio WebSocket) |
| **Database & Auth** | Firebase Authentication (Google Sign-In) & Cloud Firestore |
| **Testing** | Node.js native test runner (`node --import tsx --test`) |

---

## 📂 Project Structure

```text
├── server.ts                              # Express API server, Gemini routes, MCP hub & Live WebSocket proxy
├── src/
│   ├── App.tsx                            # Main ChatGPT-style shell, sidebar timeline & Firebase sync
│   ├── components/
│   │   ├── ChatGptAssistantCanvas.tsx     # Conversational Gemini assistant, voice recorder & Today's Hours explainer
│   │   ├── ScaleSectionView.tsx           # 1–10 Efficiency Scale breakdown & hourly bar chart
│   │   ├── PluginStoreSectionView.tsx     # MCP Plugin Store (MiniMe, Codegen, WhatsApp & custom connectors)
│   │   └── HourlyLogModal.tsx             # Modal for logging/editing individual hourly telemetry blocks
│   ├── utils/
│   │   ├── cognitiveEngine.ts             # Pure TypeScript scoring engine, GPS Haversine math & templates
│   │   └── __tests__/
│   │       └── cognitiveEngine.test.ts    # Unit & adversarial tests for the scoring and telemetry engine
│   └── firebase.ts                        # Firebase Auth & Firestore client initialization
├── firestore.rules                        # Owner-only Firestore security rules
└── package.json
```

---

## 🚀 Getting Started Locally

### Prerequisites
- **Node.js** `v18+` (or `v20+` recommended)
- A **Google Gemini API Key** (`GEMINI_API_KEY`)

### 1. Clone & Install Dependencies
```bash
git clone <your-github-repo-url>
cd chronoflow
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the project root (see `.env.example`):
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Start the Full-Stack Development Server
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 🔌 API & MCP Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/gemini/chat` | Context-aware Gemini assistant Q&A and natural-language hour scheduler |
| `POST` | `/api/gemini/daily-summary` | Generates an End-of-Day Executive Transcription Digest |
| `POST` | `/api/gemini/transcribe` | Multimodal audio note transcription via Gemini |
| `POST` | `/api/gemini/maps-grounding` | Location-aware focus spots & walking trails grounded with Google Maps |
| `WS` | `/api/live` | Bidirectional WebSocket proxy for real-time Gemini Live voice sessions |
| `GET` | `/api/mcp/manifest` | Returns available MCP plugins and capabilities |
| `POST` | `/api/mcp/sync` | Pulls hourly telemetry blocks from MiniMe, Codegen, or WhatsApp MCP |
| `POST` | `/api/mcp/ingest` | Webhook endpoint for external agents to push hourly telemetry blocks |

### Example: Push Telemetry via MCP Webhook
```bash
curl -X POST http://localhost:3000/api/mcp/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "hour": 10,
    "activity": "Deep Rust & TypeScript compiler optimization",
    "cognitiveState": "deep_focus",
    "screenMinutes": 52,
    "productiveScreenMinutes": 50,
    "motionState": "standing",
    "stepsCount": 320,
    "energyLevel": 5,
    "sourceAgent": "MiniMe Screen & Efficiency Agent"
  }'
```

---

## 🧪 Running Tests & Production Build

```bash
# Run unit & security tests for the cognitive telemetry engine
npm test

# Type-check & build production bundle
npm run build

# Run production server
npm start
```

---

## 📄 License

MIT License — free to use, modify, and distribute.
