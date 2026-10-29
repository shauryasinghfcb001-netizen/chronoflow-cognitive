# ChronoFlow — AI Cognitive & Daily Telemetry Workspace

**ChronoFlow** is a ChatGPT-style AI workspace and cognitive telemetry platform powered by **Google Gemini (`@google/genai`)**, **React 19**, **Tailwind CSS**, **Express**, and **Firebase (Firestore & Google Auth)**.

It combines a conversational AI assistant with hourly cognitive state tracking, autonomous **MCP (Model Context Protocol)** screen & agent integrations (**MiniMe**, **Codegen**, **WhatsApp Bridge**, **GitHub**, **Linear**), and 3 core autonomous skills (**GPS Location Tracker**, **Voice Day Summary & Transcription**, and **Talk-to-Plan Next Day**).

---

## ✨ Key Features

### 1. 💬 ChatGPT-Style Gemini AI Workspace (`/api/gemini/chat`)
- **Ask Anything + Daily Context Awareness**: Ask general questions, coding questions, or specific questions about your schedule, cognitive load, and screen activity.
- **Today's Hours Interactive Breakdown**:
  - Visualizes every tracked hour (`08:00` – `17:00`) with plain-English badges (`Deep Focus`, `Shallow Work`, `Distracted`, `Meeting`, `Rest`), energy percentage, active desktop app, and physical motion state.
  - One-click **"✨ Explain"** and **"Ask Gemini"** buttons on both the left sidebar and main canvas so Gemini explains your day, energy peaks, and bottlenecks in plain English.
- **Natural Language Scheduling (`scheduleCognitiveHour` Function Calling)**:
  - Tell the assistant *"Schedule Deep Focus at 14:00 for System Architecture with 90% energy"* and Gemini automatically updates your hourly timeline while answering your prompt cleanly.

### 2. 📊 Scale & Analytics View (`Recharts` + Visual Heatmap)
- **Weekly Cognitive Trend Chart**: 7-day stacked bar & area visualization comparing **Deep Focus (hrs)** vs. **Distracted (hrs)** and weekly efficiency scores (`82%` avg).
- **Hourly Energy & Motion Matrix Heatmap**: Color-coded 24-hour matrix representing cognitive state, energy intensity (`0–100%`), and physical motion state (`sedentary`, `light_activity`, `active_transit`, `exercising`).
- **MiniMe Screen Telemetry Breakdown**: Aggregates active window titles, productive vs. distracted minutes, and context-switch counts per hour.

### 3. 🔌 Plugin Store & MCP Hub (Model Context Protocol)
- **MiniMe Screen & Efficiency Watcher**: Monitors active windows, IDE sessions, and browser tabs to organize your hourly timeline automatically.
- **Codegen Autonomous PR Agent**: Connects autonomous code generation and PR review telemetry into your daily cognitive blocks.
- **WhatsApp Personal Agent Bridge**: Webhook & MCP bridge to query or update your daily schedule straight from WhatsApp.
- **Custom MCP Server Registration**: Add any custom MCP endpoint (`stdio` or `SSE` JSON-RPC) dynamically.

### 4. 🎙️ 3 Core Autonomous Agent Skills
1. **📍 Live GPS & Transit Context Skill**: Tracks physical coordinates, speed, and place context (`Home Office`, `Tech Hub`, `In Transit`) and correlates movement with cognitive energy.
2. **🔊 Daily Audio Summary & Transcription (`/api/gemini/daily-summary`)**: Generates an executive briefing of everything you accomplished today with Web Speech API voice playback and full transcript export.
3. **🗣️ Talk-to-Plan Next Day (`/api/gemini/plan-day`)**: Speak or type how you want tomorrow structured, and the agent builds or updates your hourly blocks in a continuous autonomous loop.

### 5. 🔐 Cloud Sync & Security
- **Firebase Authentication & Firestore**: Sign in with Google to persist hourly records, MCP configurations, and telemetry logs across devices, with automatic local storage fallback when offline.
- **Built-in Security & QA Verification Suite**: Inspect API health, XSS/injection sanitization, MCP schema validation, and Firestore rules compliance.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Recharts, Motion |
| **AI Engine** | Google Gemini SDK (`@google/genai`) with Structured Function Calling |
| **Backend** | Node.js, Express (`server.ts` with Vite middleware) |
| **Database & Auth** | Firebase Firestore + Google OAuth (`firebase/auth`, `firebase/firestore`) |
| **Testing** | Node.js Native Test Runner (`node:test`) + Playwright E2E Verification |

---

## 🚀 Getting Started Locally

### 1. Clone the repository
```bash
git clone https://github.com/<your-username>/chronoflow.git
cd chronoflow
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env` file in the root directory (see `.env.example`):
```env
GEMINI_API_KEY=your_google_gemini_api_key_here
```

*(Optional)* If you want to use your own Firebase project, update `firebase-applet-config.json` with your Firebase Web App credentials.

### 4. Start the development server
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 🧪 Running Tests & Building for Production

```bash
# Run unit tests for cognitive metrics, MCP telemetry, and security validation
npm test

# Type-check with TypeScript
npm run lint

# Build production bundle
npm run build

# Start production server
npm start
```

---

## 📂 Project Structure

```text
├── server.ts                              # Express API server & Gemini AI endpoints (/api/gemini/*)
├── src/
│   ├── App.tsx                            # Main ChatGPT-style shell, sidebar, & view switcher
│   ├── components/
│   │   ├── ChatGptAssistantCanvas.tsx     # Primary Gemini chat, Today's Hours explainer & 3 skills
│   │   ├── ScaleAnalyticsView.tsx         # Recharts Weekly Cognitive Trend & telemetry analytics
│   │   ├── HourlyMatrixView.tsx           # Visual heatmap & 24-hour energy/motion inspector
│   │   ├── McpPluginStoreModal.tsx        # MiniMe, Codegen, WhatsApp & custom MCP manager
│   │   ├── AutonomousSkillsHub.tsx        # GPS, Voice Transcription & Next-Day Planner loop
│   │   └── SecurityVerificationModal.tsx  # Built-in QA & cybersecurity audit suite
│   ├── utils/
│   │   ├── cognitiveMetrics.ts            # Pure cognitive load & weekly trend calculations
│   │   ├── mcpEngine.ts                   # MiniMe screen watcher & MCP payload normalizer
│   │   └── agentSkillsEngine.ts           # GPS, speech synthesis & schedule parser utilities
│   ├── firebase.ts                        # Firebase Auth & Firestore initialization
│   └── types.ts                           # TypeScript interfaces for hourly records & MCPs
├── firestore.rules                        # Firestore security rules
└── README.md                              # Project documentation
```

---

## 📄 License

MIT License — feel free to fork, customize, and connect your own MCP agents.
