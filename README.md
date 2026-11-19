# MedPulse Hassan — AI Emergency Healthcare, Hospital, Doctor, Vehicle & Voice Triage System

**MedPulse Hassan** is an AI-powered emergency healthcare and hospital coordination system built specifically for **Hassan District, Karnataka, India**. It combines disease-based AI triage, a conversational AI medical chatbot with voice recognition and spoken voice recommendations, live GPS location tracing, real-time Hassan doctor availability and slot booking, nearest hospital routing, and KA-13 emergency vehicle/ambulance dispatch.

This repository includes **two complete, runnable implementations**:
1. **Live Full-Stack Web App (Root Directory)** — React + TypeScript + Tailwind CSS + Express + Gemini AI + Google Maps (`npm run dev`, port `3000`).
2. **Python (Flask) + HTML + CSS + JavaScript Project (`/python_app/`)** — Python Flask + SQLite + HTML5 + CSS3 + Vanilla JS + Leaflet Map + Web Speech API + Gemini AI (`python app.py`, port `5000`).

---

## Key Features

- **Website Login & Patient Registration**: Secure email/password authentication with blood group, phone number, emergency family contact, and one-click Hassan demo login (`patient@hassan.care` / `hassan123`).
- **AI Disease & Emergency Triage**: Enter or speak symptoms/diseases (e.g., chest pain, stroke signs, road trauma, pediatric fever, snakebite) to get structured urgency levels, immediate first-aid steps, matched Hassan hospitals, and currently available specialist doctors.
- **AI Healthcare Chatbot & Voice Recommendation System**:
  - Multi-turn AI medical chatbot grounded in live Hassan hospital bed capacity, distance from your GPS location, and real-time doctor availability.
  - **Voice Input** via browser Web Speech Recognition (`English (IN)`, `Kannada (IN)`, `English (US)`).
  - **Voice Output** via browser Web Speech Synthesis that speaks clinical recommendations and first-aid instructions aloud.
- **Live GPS Location Tracing & Nearest Hassan Hospital Finder**:
  - Uses Browser Geolocation (`getCurrentPosition` & continuous `watchPosition`) to trace coordinates live on an interactive Hassan map.
  - Calculates road distances and driving ETAs from your live GPS (or Hassan landmarks like KSRTC Bus Stand, Vidyanagar, Hemavathi Nagar, Salagame Road, Railway Station) to all 6 major Hassan hospitals.
- **Real-Time Doctor Availability & Slot Booking**: Browse Hassan specialists by disease or specialty, view live open slots (`Today` and `Tomorrow`), book instant appointment tokens (`HSN-XX`), and cancel/release slots in real time.
- **Emergency Vehicle & Ambulance Booking System**: Dispatch `Priority Medical Cab`, `Wheelchair Access Van`, `BLS Ambulance`, or `ICU Cardiac Ambulance` with KA-13 Hassan fleet drivers, distance-based fare estimates, and live status tracking.

---

## Hassan Hospitals Covered

| Hospital | Area in Hassan | Key Emergency Specialties |
| :--- | :--- | :--- |
| **HIMS Teaching Hospital** | Race Course Road, Near Subhash Square | Level I Trauma, Emergency Medicine, Cardiology, Toxicology, Pediatrics |
| **SSM Super Specialty Hospital** | Salagame Road, Vidyanagar | Interventional Cardiology, Neurology & Stroke Care, Dialysis, ICU |
| **Janapriya Multi-Specialty & Cardiac Care** | Shankaripuram, BM Road | Cardiology, Trauma & Orthopedics, Neurosurgery, Pulmonology |
| **Mangala Hospital & Critical Care Centre** | Kuvempu Nagar, Ring Road | Neurology & Stroke, General Medicine, GI Emergency, Dialysis |
| **Hemavathi Mother & Child Hospital** | KR Puram, Near Park Road | Pediatrics & NICU, High-Risk Obstetrics & Maternity Emergency |
| **Sanjeevini Cooperative Hospital** | BM Road, Opposite Town Hall | General Medicine, Pulmonology, Orthopedics, ENT & Surgery |

---

## Option A: Run the Python (Flask) + HTML/CSS/JS Project (`/python_app`)

### Prerequisites
- **Python 3.10+**
- A **Gemini API Key** (`GEMINI_API_KEY`) for AI Triage & Voice Chatbot

### Setup & Run Commands

```bash
# 1. Navigate to the Python project folder
cd python_app

# 2. (Optional) Create and activate a virtual environment
python -m venv venv
# On macOS / Linux:
source venv/bin/activate
# On Windows PowerShell:
# .\venv\Scripts\Activate.ps1

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Set your Gemini API key (or create a .env file in python_app/)
export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
# On Windows PowerShell:
# $env:GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# 5. Start the Flask server
python app.py
```

Open **http://127.0.0.1:5000** in Chrome or Edge (recommended for full Web Speech API voice input & GPS tracing).

---

## Option B: Run the Full-Stack React + TypeScript + Express App (Root Directory)

### Prerequisites
- **Node.js 20+**

### Setup & Run Commands

```bash
# 1. Install dependencies
npm install

# 2. Create environment configuration
cp .env.example .env
# Edit .env and set GEMINI_API_KEY (and optionally VITE_GOOGLE_MAPS_API_KEY)

# 3. Run the development server (Express API + Vite frontend on port 3000)
npm run dev
```

Open **http://localhost:3000** in your browser.

### Build & Production Commands

```bash
npm run lint    # TypeScript type-check
npm run build   # Build production frontend bundle to dist/
npm start       # Run production Express server on port 3000
```

---

## Project Structure

```text
.
├── README.md                         # Project documentation (both stacks)
├── package.json                      # Node.js / React / Express scripts
├── server.ts                         # Express API + Gemini AI Triage & Chat server
├── src/                              # React + TypeScript + Tailwind frontend
│   ├── App.tsx                       # Main dashboard + live GPS watchPosition tracer
│   ├── data/hassanMedicalRoster.ts   # Hassan hospitals, landmarks, doctors & fleet
│   └── components/
│       ├── LoginPage.tsx             # Patient login & registration
│       ├── AiTriagePanel.tsx         # Disease AI triage + voice input/output
│       ├── AiVoiceChatPanel.tsx      # AI medical chatbot & voice recommendation
│       ├── DoctorsAvailabilityView.tsx
│       ├── DoctorBookingDrawer.tsx   # Live slot booking modal
│       ├── HospitalsDirectoryView.tsx
│       ├── HassanMapNavigator.tsx    # Interactive Hassan map + live GPS trace
│       └── EmergencyCabPanel.tsx     # KA-13 emergency vehicle dispatch
└── python_app/                       # Standalone Python (Flask) + HTML/CSS/JS version
    ├── app.py                        # Flask server, SQLite DB, Gemini AI & GPS trace API
    ├── requirements.txt              # Python dependencies
    ├── templates/
    │   └── index.html                # Semantic HTML5 login + dashboard UI
    └── static/
        ├── styles.css                # Clean clinical CSS3 styling
        └── app.js                    # Vanilla JS: GPS tracing, Leaflet map, Voice AI, Booking
```

---

## Core API Endpoints (Both Backends)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new patient profile |
| `POST` | `/api/auth/login` | Sign in with email & password |
| `POST` | `/api/auth/demo` | Start instant Hassan demo patient session |
| `GET` | `/api/roster` | Fetch Hassan hospitals (sorted by distance) and live doctor slots |
| `POST` | `/api/triage` | AI disease/symptom triage with hospital & doctor recommendations |
| `POST` | `/api/chat` | Multi-turn AI chatbot & spoken voice recommendation script |
| `GET / POST` | `/api/appointments` | List or book live doctor appointment tokens |
| `PATCH` | `/api/appointments/:id/cancel` | Cancel appointment and release time slot |
| `GET / POST` | `/api/cabs` or `/api/vehicles` | Dispatch emergency cab/ambulance & view history |
| `GET / POST` | `/api/location/trace` | Log and retrieve live GPS trace coordinates in Hassan (`python_app`) |

---

## Demo Credentials

- **Email:** `patient@hassan.care`
- **Password:** `hassan123`

---

## Medical Safety Disclaimer

MedPulse Hassan is designed for emergency routing assistance, hospital discovery, and appointment/transport coordination in Hassan District, Karnataka. AI triage and chatbot recommendations do not replace professional medical diagnosis. **For life-threatening emergencies, always dial Karnataka Ambulance Helpline `108` or National Emergency Number `112` immediately.**
