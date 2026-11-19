import json
import math
import os
import random
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, session
from google import genai
from google.genai import types
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "hassan_medpulse.db"

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.getenv("SESSION_SECRET", "medpulse-hassan-python-secret-key-2026")

HASSAN_CENTER = {
    "lat": 13.0072,
    "lng": 76.0996,
    "label": "Hassan City Center, BM Road",
}

HASSAN_LANDMARKS = [
    {"label": "Hassan KSRTC Bus Stand", "lat": 13.0068, "lng": 76.1029},
    {"label": "Vidyanagar, Hassan", "lat": 13.0145, "lng": 76.1095},
    {"label": "Hemavathi Nagar, Hassan", "lat": 13.0018, "lng": 76.0912},
    {"label": "Salagame Road, Hassan", "lat": 13.0191, "lng": 76.1011},
    {"label": "Hassan Railway Station", "lat": 12.9964, "lng": 76.1092},
]

HASSAN_HOSPITALS = [
    {
        "id": "hosp-hims",
        "name": "Hassan Institute of Medical Sciences (HIMS) Teaching Hospital",
        "shortName": "HIMS Teaching Hospital",
        "category": "Government Tertiary",
        "area": "Sri Chamarajendra Hospital Campus, Race Course Road",
        "address": "Race Course Road, Near Subhash Square, Hassan, Karnataka 573201",
        "phone": "+91 8172 231 699",
        "emergencyDesk": "08172-231500",
        "lat": 13.0053,
        "lng": 76.0968,
        "specialties": [
            "Emergency Medicine",
            "Trauma & Orthopedics",
            "Cardiology",
            "General Medicine",
            "Pediatrics & NICU",
            "Pulmonology",
        ],
        "diseasesTreated": [
            "Road Traffic Trauma",
            "Acute Myocardial Infarction",
            "Snakebite & Toxicology",
            "Dengue Hemorrhagic Fever",
            "Acute Respiratory Distress",
            "Pediatric Seizures",
        ],
        "erBedsAvailable": 14,
        "icuBedsAvailable": 6,
        "traumaLevel": "Level I",
    },
    {
        "id": "hosp-ssm",
        "name": "SSM Super Specialty Hospital",
        "shortName": "SSM Hospital",
        "category": "Multi-Specialty",
        "area": "Salagame Road, Vidyanagar",
        "address": "Salagame Road, Near Dairy Circle, Hassan, Karnataka 573201",
        "phone": "+91 8172 240 222",
        "emergencyDesk": "08172-240108",
        "lat": 13.0149,
        "lng": 76.1018,
        "specialties": [
            "Interventional Cardiology",
            "Neurology & Stroke Care",
            "Critical Care",
            "Nephrology & Dialysis",
            "General Surgery",
        ],
        "diseasesTreated": [
            "Acute Coronary Syndrome",
            "Ischemic Stroke & TIA",
            "Severe Hypertension Crisis",
            "Acute Kidney Injury",
            "Sepsis & Multi-organ Support",
        ],
        "erBedsAvailable": 9,
        "icuBedsAvailable": 5,
        "traumaLevel": "Level I",
    },
    {
        "id": "hosp-janapriya",
        "name": "Janapriya Multi-Specialty & Cardiac Care",
        "shortName": "Janapriya Hospital",
        "category": "Cardiac & Trauma",
        "area": "Shankaripuram, BM Road Corridor",
        "address": "Shankaripuram Main Road, Off BM Road, Hassan, Karnataka 573201",
        "phone": "+91 8172 268 411",
        "emergencyDesk": "08172-268911",
        "lat": 13.0089,
        "lng": 76.0924,
        "specialties": [
            "Cardiology",
            "Trauma & Orthopedics",
            "Neurosurgery",
            "Pulmonology",
            "Emergency Medicine",
        ],
        "diseasesTreated": [
            "Heart Attack & Arrhythmia",
            "Compound Fractures",
            "Head Injury & Concussion",
            "Severe Asthma Exacerbation",
            "Chest Pain Evaluation",
        ],
        "erBedsAvailable": 7,
        "icuBedsAvailable": 4,
        "traumaLevel": "Level II",
    },
    {
        "id": "hosp-mangala",
        "name": "Mangala Hospital & Critical Care Centre",
        "shortName": "Mangala Hospital",
        "category": "Multi-Specialty",
        "area": "Kuvempu Nagar, Ring Road",
        "address": "Kuvempu Nagar Extension, Near Ring Road, Hassan, Karnataka 573201",
        "phone": "+91 8172 252 800",
        "emergencyDesk": "08172-252888",
        "lat": 13.0014,
        "lng": 76.1074,
        "specialties": [
            "Neurology & Stroke Care",
            "General Medicine",
            "Gastroenterology",
            "Nephrology & Dialysis",
            "Emergency Medicine",
        ],
        "diseasesTreated": [
            "Status Epilepticus & Seizures",
            "Acute Pancreatitis & GI Bleed",
            "Diabetic Ketoacidosis",
            "Severe Migraine & Vertigo",
            "Typhoid & Viral Hemorrhagic Fevers",
        ],
        "erBedsAvailable": 8,
        "icuBedsAvailable": 3,
        "traumaLevel": "Level II",
    },
    {
        "id": "hosp-hemavathi",
        "name": "Hemavathi Mother & Child Emergency Hospital",
        "shortName": "Hemavathi Maternal & Pediatric",
        "category": "Maternal & Pediatric",
        "area": "KR Puram, Hassan",
        "address": "3rd Cross, KR Puram, Near Park Road, Hassan, Karnataka 573201",
        "phone": "+91 8172 263 720",
        "emergencyDesk": "08172-263700",
        "lat": 13.0099,
        "lng": 76.1045,
        "specialties": [
            "Pediatrics & NICU",
            "Obstetrics & Gynecology",
            "Neonatal Critical Care",
            "General Medicine",
        ],
        "diseasesTreated": [
            "High-Risk Obstetric Emergency",
            "Febrile Seizures in Infants",
            "Pediatric Dengue & Dehydration",
            "Neonatal Respiratory Distress",
            "Pre-eclampsia & Labor Emergency",
        ],
        "erBedsAvailable": 10,
        "icuBedsAvailable": 6,
        "traumaLevel": "Specialized",
    },
    {
        "id": "hosp-sanjeevini",
        "name": "Sanjeevini Cooperative Hospital",
        "shortName": "Sanjeevini Hospital",
        "category": "Multi-Specialty",
        "area": "BM Road, Opposite Town Hall",
        "address": "BM Road, Near Old Bus Stand Circle, Hassan, Karnataka 573201",
        "phone": "+91 8172 267 510",
        "emergencyDesk": "08172-267599",
        "lat": 13.0061,
        "lng": 76.1008,
        "specialties": [
            "General Medicine",
            "Pulmonology",
            "Trauma & Orthopedics",
            "ENT & Emergency",
            "General Surgery",
        ],
        "diseasesTreated": [
            "Severe Pneumonia & COPD Flare",
            "Acute Appendicitis",
            "Fractures & Dislocations",
            "Allergic Anaphylaxis",
            "High Fever & Infectious Disease",
        ],
        "erBedsAvailable": 6,
        "icuBedsAvailable": 3,
        "traumaLevel": "Level II",
    },
]

HASSAN_DOCTORS = [
    {
        "id": "doc-ravi-sharma",
        "name": "Dr. Ravi Kumar Gowda",
        "qualification": "MD (Internal Med), DM (Cardiology)",
        "specialty": "Cardiology",
        "hospitalId": "hosp-ssm",
        "hospitalName": "SSM Super Specialty Hospital",
        "wingRoom": "Cardiac Block · Wing A, Room 104",
        "consultationFeeInr": 650,
        "availabilityStatus": "available_now",
        "treatedConditions": [
            "Chest Pain & Angina",
            "Heart Attack (STEMI)",
            "Palpitations & Arrhythmia",
            "Hypertensive Emergency",
        ],
        "slots": [
            {"id": "ravi-1", "day": "Today", "time": "Now (Priority)", "emergency": True},
            {"id": "ravi-2", "day": "Today", "time": "11:15 AM", "emergency": False},
            {"id": "ravi-3", "day": "Today", "time": "04:30 PM", "emergency": False},
            {"id": "ravi-4", "day": "Tomorrow", "time": "09:30 AM", "emergency": False},
        ],
    },
    {
        "id": "doc-ananya-rao",
        "name": "Dr. Ananya Deshpande",
        "qualification": "MD (Medicine), DM (Neurology)",
        "specialty": "Neurology & Stroke Care",
        "hospitalId": "hosp-mangala",
        "hospitalName": "Mangala Hospital & Critical Care Centre",
        "wingRoom": "Neuro Sciences · 2nd Floor, Suite 208",
        "consultationFeeInr": 600,
        "availabilityStatus": "available_now",
        "treatedConditions": [
            "Sudden Weakness / Stroke",
            "Seizures & Epilepsy",
            "Severe Migraine",
            "Loss of Consciousness",
        ],
        "slots": [
            {"id": "ananya-1", "day": "Today", "time": "Now (Stroke Alert)", "emergency": True},
            {"id": "ananya-2", "day": "Today", "time": "10:45 AM", "emergency": False},
            {"id": "ananya-3", "day": "Today", "time": "05:15 PM", "emergency": False},
            {"id": "ananya-4", "day": "Tomorrow", "time": "10:00 AM", "emergency": False},
        ],
    },
    {
        "id": "doc-rajesh-trauma",
        "name": "Dr. Rajesh Shetty",
        "qualification": "MS (Orthopedics), Fellowship in Trauma",
        "specialty": "Trauma & Orthopedics",
        "hospitalId": "hosp-janapriya",
        "hospitalName": "Janapriya Multi-Specialty & Cardiac Care",
        "wingRoom": "Trauma Bay · Ground Floor, Bay 02",
        "consultationFeeInr": 550,
        "availabilityStatus": "available_now",
        "treatedConditions": [
            "Road Accident Injuries",
            "Bone Fractures & Dislocations",
            "Severe Back / Spine Trauma",
            "Deep Lacerations",
        ],
        "slots": [
            {"id": "rajesh-1", "day": "Today", "time": "Now (Trauma Priority)", "emergency": True},
            {"id": "rajesh-2", "day": "Today", "time": "11:00 AM", "emergency": False},
            {"id": "rajesh-3", "day": "Today", "time": "05:30 PM", "emergency": False},
            {"id": "rajesh-4", "day": "Tomorrow", "time": "09:00 AM", "emergency": False},
        ],
    },
    {
        "id": "doc-priya-pediatrics",
        "name": "Dr. Priya Nagaraj",
        "qualification": "MD (Pediatrics), Fellowship in NICU",
        "specialty": "Pediatrics & NICU",
        "hospitalId": "hosp-hemavathi",
        "hospitalName": "Hemavathi Mother & Child Emergency Hospital",
        "wingRoom": "Pediatric Wing · 1st Floor, Clinic 102",
        "consultationFeeInr": 500,
        "availabilityStatus": "available_now",
        "treatedConditions": [
            "High Fever & Febrile Seizures",
            "Pediatric Dengue & Dehydration",
            "Infant Breathing Difficulty",
            "Acute Asthma in Children",
        ],
        "slots": [
            {"id": "priya-1", "day": "Today", "time": "Now (Child Urgent)", "emergency": True},
            {"id": "priya-2", "day": "Today", "time": "11:45 AM", "emergency": False},
            {"id": "priya-3", "day": "Today", "time": "06:30 PM", "emergency": False},
            {"id": "priya-4", "day": "Tomorrow", "time": "09:30 AM", "emergency": False},
        ],
    },
    {
        "id": "doc-mahesh-er",
        "name": "Dr. Mahesh Hegde",
        "qualification": "MD (Emergency Medicine), MEM",
        "specialty": "Emergency Medicine",
        "hospitalId": "hosp-hims",
        "hospitalName": "Hassan Institute of Medical Sciences (HIMS) Teaching Hospital",
        "wingRoom": "Casualty Block · Red Zone Triage Desk",
        "consultationFeeInr": 200,
        "availabilityStatus": "available_now",
        "treatedConditions": [
            "Snakebite & Scorpion Sting",
            "Poisoning & Overdose",
            "Anaphylaxis & Severe Allergies",
            "Severe Burns & Shock",
        ],
        "slots": [
            {"id": "mahesh-1", "day": "Today", "time": "Now (ER Priority)", "emergency": True},
            {"id": "mahesh-2", "day": "Today", "time": "01:30 PM", "emergency": False},
            {"id": "mahesh-3", "day": "Today", "time": "07:00 PM", "emergency": True},
            {"id": "mahesh-4", "day": "Tomorrow", "time": "08:30 AM", "emergency": False},
        ],
    },
    {
        "id": "doc-kavitha-pulmo",
        "name": "Dr. Kavitha Shivakumar",
        "qualification": "MD (Pulmonary Medicine), DNB",
        "specialty": "Pulmonology",
        "hospitalId": "hosp-sanjeevini",
        "hospitalName": "Sanjeevini Cooperative Hospital",
        "wingRoom": "Chest & Respiratory Clinic · Room 204",
        "consultationFeeInr": 450,
        "availabilityStatus": "upcoming_today",
        "treatedConditions": [
            "Severe Shortness of Breath",
            "Asthma & COPD Exacerbation",
            "Pneumonia & Chest Infection",
            "Low Oxygen Saturation",
        ],
        "slots": [
            {"id": "kavitha-1", "day": "Today", "time": "11:30 AM", "emergency": False},
            {"id": "kavitha-2", "day": "Today", "time": "02:45 PM", "emergency": True},
            {"id": "kavitha-3", "day": "Today", "time": "05:00 PM", "emergency": False},
            {"id": "kavitha-4", "day": "Tomorrow", "time": "09:45 AM", "emergency": False},
        ],
    },
]

FLEET_DRIVERS = [
    {"name": "Manjunath H. K.", "phone": "+91 98451 22410", "plate": "KA-13-G-4812"},
    {"name": "Raghavendra B. S.", "phone": "+91 99004 71290", "plate": "KA-13-C-8920"},
    {"name": "Prashanth Gowda", "phone": "+91 97412 55301", "plate": "KA-13-M-3044"},
    {"name": "Nagaraj Shetty", "phone": "+91 94480 18372", "plate": "KA-13-B-7719"},
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            phone TEXT NOT NULL,
            blood_group TEXT NOT NULL,
            emergency_contact TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS appointments (
            id TEXT PRIMARY KEY,
            confirmation_code TEXT NOT NULL,
            token_number TEXT NOT NULL,
            user_id TEXT NOT NULL,
            patient_name TEXT NOT NULL,
            patient_phone TEXT NOT NULL,
            symptoms_note TEXT NOT NULL,
            doctor_id TEXT NOT NULL,
            doctor_name TEXT NOT NULL,
            doctor_specialty TEXT NOT NULL,
            hospital_id TEXT NOT NULL,
            hospital_name TEXT NOT NULL,
            slot_id TEXT NOT NULL,
            slot_label TEXT NOT NULL,
            consultation_fee INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vehicle_bookings (
            id TEXT PRIMARY KEY,
            booking_code TEXT NOT NULL,
            user_id TEXT NOT NULL,
            patient_name TEXT NOT NULL,
            patient_phone TEXT NOT NULL,
            vehicle_category TEXT NOT NULL,
            pickup_label TEXT NOT NULL,
            pickup_lat REAL NOT NULL,
            pickup_lng REAL NOT NULL,
            hospital_id TEXT NOT NULL,
            hospital_name TEXT NOT NULL,
            distance_km REAL NOT NULL,
            eta_minutes INTEGER NOT NULL,
            fare_inr INTEGER NOT NULL,
            driver_name TEXT NOT NULL,
            driver_phone TEXT NOT NULL,
            vehicle_number TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS location_traces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            accuracy_m REAL,
            nearest_hospital TEXT,
            distance_km REAL,
            recorded_at TEXT NOT NULL
        );
        """
    )

    # Seed default Hassan demo account if not present
    cur.execute("SELECT id FROM users WHERE email = ?", ("patient@hassan.care",))
    if not cur.fetchone():
        cur.execute(
            """
            INSERT INTO users (id, name, email, password_hash, phone, blood_group, emergency_contact, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "user-demo-hassan",
                "Rakshith Gowda",
                "patient@hassan.care",
                generate_password_hash("hassan123"),
                "+91 98450 61234",
                "O+",
                "+91 98450 61299",
                datetime.now(timezone.utc).isoformat(),
            ),
        )
    conn.commit()
    conn.close()


def haversine_road_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    straight_km = 2 * radius * math.asin(math.sqrt(a))
    return round(straight_km * 1.28, 2)


def estimate_eta_minutes(distance_km: float) -> int:
    return max(3, round((distance_km / 26.0) * 60) + 2)


def estimate_vehicle_fare(category: str, distance_km: float) -> int:
    dist = max(1.0, distance_km)
    rates = {
        "Priority Medical Cab": (90, 18),
        "Wheelchair Access Van": (180, 24),
        "BLS Ambulance": (350, 32),
        "ICU Cardiac Ambulance": (750, 48),
    }
    base, per_km = rates.get(category, (90, 18))
    return round(base + dist * per_km)


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    conn = get_db()
    row = conn.execute(
        "SELECT id, name, email, phone, blood_group, emergency_contact FROM users WHERE id = ?",
        (uid,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "Authentication required."}), 401
        return fn(user, *args, **kwargs)

    return wrapper


def get_enriched_doctors():
    conn = get_db()
    booked_rows = conn.execute(
        "SELECT doctor_id, slot_id FROM appointments WHERE status = 'confirmed'"
    ).fetchall()
    conn.close()
    booked_pairs = {(r["doctor_id"], r["slot_id"]) for r in booked_rows}

    result = []
    for doc in HASSAN_DOCTORS:
        slots = []
        for s in doc["slots"]:
            slots.append(
                {
                    **s,
                    "isBooked": (doc["id"], s["id"]) in booked_pairs,
                }
            )
        open_today = [s for s in slots if s["day"] == "Today" and not s["isBooked"]]
        result.append(
            {
                **doc,
                "slots": slots,
                "openSlotsToday": len(open_today),
            }
        )
    return result


def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


@app.route("/")
def index():
    return render_template("index.html")


# ---------------- AUTHENTICATION ----------------


@app.route("/api/auth/me")
def api_me():
    user = current_user()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    return jsonify({"user": user})


@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    phone = (data.get("phone") or "+91 98450 00000").strip()
    blood_group = (data.get("bloodGroup") or "O+").strip()
    emergency_contact = (data.get("emergencyContact") or "108").strip()

    if not name or not email or len(password) < 6:
        return jsonify({"error": "Name, valid email, and password (6+ chars) are required."}), 400

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "An account with this email already exists."}), 409

    uid = f"user-{uuid.uuid4().hex[:8]}"
    conn.execute(
        """
        INSERT INTO users (id, name, email, password_hash, phone, blood_group, emergency_contact, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            uid,
            name,
            email,
            generate_password_hash(password),
            phone,
            blood_group,
            emergency_contact,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    conn.close()

    session["user_id"] = uid
    return jsonify({"user": current_user()}), 201


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid email or password."}), 401

    session["user_id"] = row["id"]
    return jsonify({"user": current_user()})


@app.route("/api/auth/demo", methods=["POST"])
def api_demo_login():
    session["user_id"] = "user-demo-hassan"
    return jsonify({"user": current_user()})


@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


# ---------------- HASSAN ROSTER & NEAREST HOSPITALS ----------------


@app.route("/api/roster")
def api_roster():
    lat = request.args.get("lat", type=float) or HASSAN_CENTER["lat"]
    lng = request.args.get("lng", type=float) or HASSAN_CENTER["lng"]

    hospitals_with_dist = []
    for hosp in HASSAN_HOSPITALS:
        dist = haversine_road_km(lat, lng, hosp["lat"], hosp["lng"])
        hospitals_with_dist.append(
            {
                **hosp,
                "distanceKm": dist,
                "etaMinutes": estimate_eta_minutes(dist),
            }
        )
    hospitals_with_dist.sort(key=lambda h: h["distanceKm"])

    return jsonify(
        {
            "center": HASSAN_CENTER,
            "landmarks": HASSAN_LANDMARKS,
            "hospitals": hospitals_with_dist,
            "doctors": get_enriched_doctors(),
            "syncedAt": datetime.now(timezone.utc).isoformat(),
        }
    )


# ---------------- LIVE LOCATION TRACING ----------------


@app.route("/api/location/trace", methods=["GET", "POST"])
@login_required
def api_location_trace(user):
    conn = get_db()
    if request.method == "GET":
        rows = conn.execute(
            """
            SELECT id, lat, lng, accuracy_m, nearest_hospital, distance_km, recorded_at
            FROM location_traces
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 25
            """,
            (user["id"],),
        ).fetchall()
        conn.close()
        return jsonify({"traces": [dict(r) for r in rows]})

    data = request.get_json(silent=True) or {}
    lat = data.get("lat")
    lng = data.get("lng")
    accuracy = data.get("accuracyMeters")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        conn.close()
        return jsonify({"error": "Valid latitude and longitude are required."}), 400

    nearest = min(
        HASSAN_HOSPITALS,
        key=lambda h: haversine_road_km(lat, lng, h["lat"], h["lng"]),
    )
    dist_km = haversine_road_km(lat, lng, nearest["lat"], nearest["lng"])
    now = datetime.now(timezone.utc).isoformat()

    conn.execute(
        """
        INSERT INTO location_traces (user_id, lat, lng, accuracy_m, nearest_hospital, distance_km, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (user["id"], lat, lng, accuracy, nearest["shortName"], dist_km, now),
    )
    conn.commit()
    conn.close()

    return jsonify(
        {
            "trace": {
                "lat": lat,
                "lng": lng,
                "accuracy_m": accuracy,
                "nearest_hospital": nearest["shortName"],
                "distance_km": dist_km,
                "eta_minutes": estimate_eta_minutes(dist_km),
                "recorded_at": now,
            }
        }
    )


# ---------------- DOCTOR APPOINTMENT BOOKING ----------------


@app.route("/api/appointments", methods=["GET", "POST"])
@login_required
def api_appointments(user):
    conn = get_db()
    if request.method == "GET":
        rows = conn.execute(
            "SELECT * FROM appointments WHERE user_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
        conn.close()
        return jsonify({"appointments": [dict(r) for r in rows]})

    data = request.get_json(silent=True) or {}
    doctor_id = data.get("doctorId")
    slot_id = data.get("slotId")
    patient_name = (data.get("patientName") or user["name"]).strip()
    patient_phone = (data.get("patientPhone") or user["phone"]).strip()
    symptoms_note = (data.get("symptomsNote") or "Urgent consultation").strip()

    doctors = get_enriched_doctors()
    doctor = next((d for d in doctors if d["id"] == doctor_id), None)
    if not doctor:
        conn.close()
        return jsonify({"error": "Doctor not found."}), 404

    slot = next((s for s in doctor["slots"] if s["id"] == slot_id), None)
    if not slot:
        conn.close()
        return jsonify({"error": "Time slot not found."}), 404
    if slot["isBooked"]:
        conn.close()
        return jsonify({"error": "This slot is already booked. Choose another time."}), 409

    apt_id = f"apt-{uuid.uuid4().hex[:8]}"
    conf_code = f"MPH-{random.randint(100000, 999999)}"
    token_num = f"HSN-{random.randint(10, 99)}"
    now = datetime.now(timezone.utc).isoformat()

    conn.execute(
        """
        INSERT INTO appointments (
            id, confirmation_code, token_number, user_id, patient_name, patient_phone,
            symptoms_note, doctor_id, doctor_name, doctor_specialty, hospital_id,
            hospital_name, slot_id, slot_label, consultation_fee, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
        """,
        (
            apt_id,
            conf_code,
            token_num,
            user["id"],
            patient_name,
            patient_phone,
            symptoms_note,
            doctor["id"],
            doctor["name"],
            doctor["specialty"],
            doctor["hospitalId"],
            doctor["hospitalName"],
            slot["id"],
            f"{slot['day']}, {slot['time']}",
            doctor["consultationFeeInr"],
            now,
        ),
    )
    conn.commit()
    created = dict(conn.execute("SELECT * FROM appointments WHERE id = ?", (apt_id,)).fetchone())
    conn.close()
    return jsonify({"appointment": created}), 201


@app.route("/api/appointments/<apt_id>/cancel", methods=["PATCH"])
@login_required
def api_cancel_appointment(user, apt_id):
    conn = get_db()
    conn.execute(
        "UPDATE appointments SET status = 'cancelled' WHERE id = ? AND user_id = ?",
        (apt_id, user["id"]),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM appointments WHERE id = ? AND user_id = ?", (apt_id, user["id"])
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Appointment not found."}), 404
    return jsonify({"appointment": dict(row)})


# ---------------- EMERGENCY VEHICLE BOOKING ----------------


@app.route("/api/vehicles", methods=["GET", "POST"])
@login_required
def api_vehicles(user):
    conn = get_db()
    if request.method == "GET":
        rows = conn.execute(
            "SELECT * FROM vehicle_bookings WHERE user_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
        conn.close()
        return jsonify({"bookings": [dict(r) for r in rows]})

    data = request.get_json(silent=True) or {}
    hospital_id = data.get("hospitalId")
    vehicle_category = data.get("vehicleCategory") or "Priority Medical Cab"
    pickup_lat = float(data.get("pickupLat") or HASSAN_CENTER["lat"])
    pickup_lng = float(data.get("pickupLng") or HASSAN_CENTER["lng"])
    pickup_label = (data.get("pickupLabel") or "Hassan Live GPS").strip()
    patient_name = (data.get("patientName") or user["name"]).strip()
    patient_phone = (data.get("patientPhone") or user["phone"]).strip()

    hospital = next((h for h in HASSAN_HOSPITALS if h["id"] == hospital_id), None)
    if not hospital:
        conn.close()
        return jsonify({"error": "Selected Hassan hospital not found."}), 404

    dist_km = haversine_road_km(pickup_lat, pickup_lng, hospital["lat"], hospital["lng"])
    eta_mins = estimate_eta_minutes(dist_km)
    fare = estimate_vehicle_fare(vehicle_category, dist_km)
    driver = random.choice(FLEET_DRIVERS)

    booking_id = f"veh-{uuid.uuid4().hex[:8]}"
    booking_code = f"KA13-{random.randint(10000, 99999)}"
    now = datetime.now(timezone.utc).isoformat()

    conn.execute(
        """
        INSERT INTO vehicle_bookings (
            id, booking_code, user_id, patient_name, patient_phone, vehicle_category,
            pickup_label, pickup_lat, pickup_lng, hospital_id, hospital_name,
            distance_km, eta_minutes, fare_inr, driver_name, driver_phone,
            vehicle_number, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispatched', ?)
        """,
        (
            booking_id,
            booking_code,
            user["id"],
            patient_name,
            patient_phone,
            vehicle_category,
            pickup_label,
            pickup_lat,
            pickup_lng,
            hospital["id"],
            hospital["shortName"],
            dist_km,
            eta_mins,
            fare,
            driver["name"],
            driver["phone"],
            driver["plate"],
            now,
        ),
    )
    conn.commit()
    booking = dict(
        conn.execute("SELECT * FROM vehicle_bookings WHERE id = ?", (booking_id,)).fetchone()
    )
    conn.close()
    return jsonify({"booking": booking}), 201


# ---------------- AI DISEASE TRIAGE & AI VOICE CHATBOT ----------------


@app.route("/api/triage", methods=["POST"])
@login_required
def api_triage(_user):
    data = request.get_json(silent=True) or {}
    query = (data.get("query") or "").strip()
    lat = float(data.get("lat") or HASSAN_CENTER["lat"])
    lng = float(data.get("lng") or HASSAN_CENTER["lng"])

    if len(query) < 3:
        return jsonify({"error": "Please describe the disease or symptoms."}), 400

    client = get_gemini_client()
    if not client:
        return (
            jsonify(
                {
                    "error": "GEMINI_API_KEY is not set. Add GEMINI_API_KEY in .env to run AI recommendations."
                }
            ),
            503,
        )

    hospitals_ctx = [
        {
            "id": h["id"],
            "name": h["shortName"],
            "distanceKm": haversine_road_km(lat, lng, h["lat"], h["lng"]),
            "specialties": h["specialties"],
            "diseasesTreated": h["diseasesTreated"],
            "erBedsAvailable": h["erBedsAvailable"],
        }
        for h in HASSAN_HOSPITALS
    ]
    doctors_ctx = [
        {
            "id": d["id"],
            "name": d["name"],
            "specialty": d["specialty"],
            "hospitalId": d["hospitalId"],
            "availabilityStatus": d["availabilityStatus"],
            "openSlotsToday": d["openSlotsToday"],
            "treatedConditions": d["treatedConditions"],
        }
        for d in get_enriched_doctors()
    ]

    prompt = f"""You are MedPulse Hassan AI Emergency Triage for Hassan District, Karnataka, India.
Patient reported disease/symptoms: {query}
Patient GPS in Hassan: ({lat:.4f}, {lng:.4f})

Hassan Hospitals: {json.dumps(hospitals_ctx)}
Hassan Doctors: {json.dumps(doctors_ctx)}

Return JSON with keys:
- urgencyLevel: "Critical" | "Urgent" | "Standard"
- conditionSummary: 1-sentence summary
- recommendedSpecialty: string
- clinicalReasoning: 2 sentences explaining best Hassan hospital & available doctor match
- voiceScript: 2 natural spoken sentences for voice readout (no symbols)
- immediateSteps: array of 3 practical first-aid steps
- recommendedHospitalIds: array of 1-2 valid hospital IDs
- recommendedDoctorIds: array of 1-2 valid doctor IDs
- recommendedVehicle: "Priority Medical Cab" | "Wheelchair Access Van" | "BLS Ambulance" | "ICU Cardiac Ambulance"
"""

    try:
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        resp = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        parsed = json.loads((resp.text or "{}").strip())
        return jsonify({"recommendation": parsed})
    except Exception as exc:
        return jsonify({"error": f"Gemini triage request failed: {exc}"}), 502


@app.route("/api/chat", methods=["POST"])
@login_required
def api_chat(_user):
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    history = data.get("history") or []
    lat = float(data.get("lat") or HASSAN_CENTER["lat"])
    lng = float(data.get("lng") or HASSAN_CENTER["lng"])

    if len(message) < 2:
        return jsonify({"error": "Please enter or speak a question."}), 400

    client = get_gemini_client()
    if not client:
        return (
            jsonify(
                {
                    "error": "GEMINI_API_KEY is not set. Add GEMINI_API_KEY in .env to enable AI Chat & Voice."
                }
            ),
            503,
        )

    hospitals_ctx = sorted(
        [
            {
                "id": h["id"],
                "name": h["shortName"],
                "distanceKm": haversine_road_km(lat, lng, h["lat"], h["lng"]),
                "erBedsAvailable": h["erBedsAvailable"],
                "specialties": h["specialties"],
            }
            for h in HASSAN_HOSPITALS
        ],
        key=lambda x: x["distanceKm"],
    )
    doctors_ctx = [
        {
            "id": d["id"],
            "name": d["name"],
            "specialty": d["specialty"],
            "hospitalId": d["hospitalId"],
            "availabilityStatus": d["availabilityStatus"],
            "openSlotsToday": d["openSlotsToday"],
        }
        for d in get_enriched_doctors()
    ]

    history_str = "\n".join(
        f"{'Patient' if m.get('role') == 'user' else 'AI'}: {m.get('text', '')}"
        for m in history[-6:]
    )

    prompt = f"""You are MedPulse Hassan AI Healthcare Chatbot & Voice Assistant in Hassan, Karnataka.
Always recommend calling 108 for life-threatening emergencies.
Patient Location: ({lat:.4f}, {lng:.4f})
Hassan Hospitals (nearest first): {json.dumps(hospitals_ctx)}
Live Hassan Doctors: {json.dumps(doctors_ctx)}

Conversation History:
{history_str}

Latest Patient Message: {message}

Return strictly valid JSON with keys:
- reply: concise 3-4 sentence helpful guidance referencing specific Hassan hospitals and available doctors
- voiceScript: concise 2-sentence spoken version with no bullet points or special symbols
- urgencyLevel: "Critical" | "Urgent" | "Standard"
- suggestedHospitalIds: array of 0-2 valid hospital IDs
- suggestedDoctorIds: array of 0-2 valid doctor IDs
"""

    try:
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        resp = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        parsed = json.loads((resp.text or "{}").strip())
        return jsonify({"response": parsed})
    except Exception as exc:
        return jsonify({"error": f"Gemini chatbot request failed: {exc}"}), 502


if __name__ == "__main__":
    init_db()
    port = int(os.getenv("PORT", "5000"))
    print(f"MedPulse Hassan (Python Flask) running at http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
