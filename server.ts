import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import {
  FLEET_DRIVERS,
  INITIAL_DOCTORS,
  INITIAL_HOSPITALS,
} from './src/data/hassanMedicalRoster.ts';
import type {
  Appointment,
  AvailabilityStatus,
  CabBooking,
  ConsultationMode,
  Doctor,
  GeoPoint,
  Hospital,
  TriageRecommendation,
  UserProfile,
  VehicleCategory,
} from './src/types.ts';

interface StoredUser extends UserProfile {
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

interface PersistedDatabase {
  users: StoredUser[];
  hospitals: Hospital[];
  doctors: Doctor[];
  appointments: Appointment[];
  cabBookings: CabBooking[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'medpulse-db.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'medpulse-hassan-local-session-secret-v1';

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createInitialDb(): PersistedDatabase {
  const demoSalt = crypto.randomBytes(16).toString('hex');
  const demoUser: StoredUser = {
    id: 'user-demo-hassan',
    name: 'Rakshith Gowda',
    email: 'patient@hassan.care',
    phone: '+91 98450 61234',
    bloodGroup: 'O+',
    emergencyContact: '+91 98450 61299',
    role: 'patient',
    passwordSalt: demoSalt,
    passwordHash: hashPassword('hassan123', demoSalt),
    createdAt: new Date().toISOString(),
  };

  return {
    users: [demoUser],
    hospitals: structuredClone(INITIAL_HOSPITALS),
    doctors: structuredClone(INITIAL_DOCTORS),
    appointments: [],
    cabBookings: [],
  };
}

function loadDb(): PersistedDatabase {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const initial = createInitialDb();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedDatabase;
    if (!parsed.hospitals?.length || !parsed.doctors?.length) {
      const reset = createInitialDb();
      fs.writeFileSync(DB_FILE, JSON.stringify(reset, null, 2), 'utf-8');
      return reset;
    }
    return parsed;
  } catch (err) {
    console.error('Failed to load database, initializing fresh store:', err);
    return createInitialDb();
  }
}

let db: PersistedDatabase = loadDb();

function saveDb(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist database:', err);
  }
}

function signToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as { uid: string };
    return parsed.uid || null;
  } catch {
    return null;
  }
}

function toPublicUser(user: StoredUser): UserProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    bloodGroup: user.bloodGroup,
    emergencyContact: user.emergencyContact,
    role: user.role,
  };
}

function getRequestUser(req: express.Request): StoredUser | null {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('mp_session='));
    if (match) {
      token = decodeURIComponent(match.slice('mp_session='.length));
    }
  }
  const uid = verifyToken(token);
  if (!uid) return null;
  return db.users.find((u) => u.id === uid) || null;
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return Number((2 * R * Math.asin(Math.sqrt(h)) * 1.28).toFixed(2));
}

function estimateFare(vehicleCategory: VehicleCategory, distanceKm: number): number {
  const safeDist = Math.max(1, distanceKm);
  switch (vehicleCategory) {
    case 'Priority Medical Cab':
      return Math.round(90 + safeDist * 18);
    case 'Wheelchair Access Van':
      return Math.round(180 + safeDist * 24);
    case 'BLS Ambulance':
      return Math.round(350 + safeDist * 32);
    case 'ICU Cardiac Ambulance':
      return Math.round(750 + safeDist * 48);
  }
}

function recomputeDoctorAvailability(doc: Doctor): void {
  const openToday = doc.slots.filter((s) => s.dayLabel === 'Today' && !s.isBooked);
  const openImmediate = openToday.find((s) => s.timeLabel.startsWith('Now'));
  if (openImmediate) {
    doc.availabilityStatus = 'available_now';
    doc.nextAvailableLabel = `Available Now · ${openToday.length} ${
      openToday.length === 1 ? 'slot' : 'slots'
    } open today`;
  } else if (openToday.length > 0) {
    doc.availabilityStatus = 'upcoming_today';
    doc.nextAvailableLabel = `Next Slot Today · ${openToday[0].timeLabel}`;
  } else {
    const openTomorrow = doc.slots.filter((s) => s.dayLabel === 'Tomorrow' && !s.isBooked);
    doc.availabilityStatus = 'on_call';
    doc.nextAvailableLabel = openTomorrow.length
      ? `Next Slot Tomorrow · ${openTomorrow[0].timeLabel}`
      : 'On Call · Emergency Desk Only';
  }
}

const aiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Auth routes
  app.get('/api/auth/me', (req, res) => {
    const user = getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user: toPublicUser(user) });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email, password, phone, bloodGroup, emergencyContact } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
      bloodGroup?: string;
      emergencyContact?: string;
    };

    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({ error: 'Name, valid email, and password (6+ characters) are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const newUser: StoredUser = {
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || '+91 98450 00000',
      bloodGroup: bloodGroup?.trim() || 'O+',
      emergencyContact: emergencyContact?.trim() || '108',
      role: 'patient',
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    saveDb();

    const token = signToken(newUser.id);
    res.cookie('mp_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({ user: toPublicUser(newUser), token });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const user = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    const candidateHash = hashPassword(password, user.passwordSalt);
    if (candidateHash !== user.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signToken(user.id);
    res.cookie('mp_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: toPublicUser(user), token });
  });

  app.post('/api/auth/demo', (_req, res) => {
    const demoUser = db.users.find((u) => u.id === 'user-demo-hassan') || db.users[0];
    const token = signToken(demoUser.id);
    res.cookie('mp_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: toPublicUser(demoUser), token });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('mp_session');
    res.json({ ok: true });
  });

  // Real-time Hassan roster (hospitals + live doctor availability + slots)
  app.get('/api/roster', (_req, res) => {
    res.json({
      hospitals: db.hospitals,
      doctors: db.doctors,
      syncedAt: new Date().toISOString(),
    });
  });

  // Toggle doctor availability status (useful for clinical coordinator / live testing)
  app.patch('/api/doctors/:doctorId/status', (req, res) => {
    const user = getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    const doctor = db.doctors.find((d) => d.id === req.params.doctorId);
    if (!doctor) {
      res.status(404).json({ error: 'Doctor not found.' });
      return;
    }
    const { availabilityStatus } = req.body as { availabilityStatus?: AvailabilityStatus };
    if (
      availabilityStatus !== 'available_now' &&
      availabilityStatus !== 'upcoming_today' &&
      availabilityStatus !== 'on_call'
    ) {
      res.status(400).json({ error: 'Invalid availability status.' });
      return;
    }
    doctor.availabilityStatus = availabilityStatus;
    if (availabilityStatus === 'available_now') {
      doctor.statusDetail = 'Active in OPD & Priority Triage';
      const openCount = doctor.slots.filter((s) => s.dayLabel === 'Today' && !s.isBooked).length;
      doctor.nextAvailableLabel = `Available Now · ${openCount} slots open today`;
    } else if (availabilityStatus === 'upcoming_today') {
      doctor.statusDetail = 'In Rounds · Upcoming OPD Slot Today';
      const next = doctor.slots.find((s) => s.dayLabel === 'Today' && !s.isBooked);
      doctor.nextAvailableLabel = next ? `Next Slot Today · ${next.timeLabel}` : 'Upcoming Today';
    } else {
      doctor.statusDetail = 'On Emergency Call · Priority Referral';
      doctor.nextAvailableLabel = 'On Call · Desk Referral';
    }
    saveDb();
    res.json({ doctor, syncedAt: new Date().toISOString() });
  });

  // Appointments API
  app.get('/api/appointments', (req, res) => {
    const user = getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    const mine = db.appointments
      .filter((a) => a.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ appointments: mine });
  });

  app.post('/api/appointments', (req, res) => {
    const user = getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in required to book an appointment.' });
      return;
    }
    const {
      doctorId,
      slotId,
      patientName,
      patientPhone,
      patientAge,
      symptomsNote,
      consultationMode,
    } = req.body as {
      doctorId?: string;
      slotId?: string;
      patientName?: string;
      patientPhone?: string;
      patientAge?: string;
      symptomsNote?: string;
      consultationMode?: ConsultationMode;
    };

    if (!doctorId || !slotId || !patientName?.trim() || !patientPhone?.trim()) {
      res.status(400).json({ error: 'Doctor, time slot, patient name, and phone number are required.' });
      return;
    }

    const doctor = db.doctors.find((d) => d.id === doctorId);
    if (!doctor) {
      res.status(404).json({ error: 'Selected doctor was not found.' });
      return;
    }

    const slot = doctor.slots.find((s) => s.id === slotId);
    if (!slot) {
      res.status(404).json({ error: 'Selected time slot was not found.' });
      return;
    }

    if (slot.isBooked) {
      res.status(409).json({
        error: 'This slot was just booked. Please select another available time slot.',
      });
      return;
    }

    slot.isBooked = true;
    slot.bookedByUserId = user.id;
    recomputeDoctorAvailability(doctor);

    const tokenSeq = 10 + db.appointments.length + 1;
    const confirmationCode = `MPH-${Math.floor(100000 + Math.random() * 900000)}`;
    const appointment: Appointment = {
      id: `apt-${crypto.randomUUID().slice(0, 8)}`,
      confirmationCode,
      tokenNumber: `HSN-${tokenSeq}`,
      userId: user.id,
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
      patientAge: patientAge?.trim() || 'Adult',
      symptomsNote: symptomsNote?.trim() || 'General urgent consultation',
      doctorId: doctor.id,
      doctorName: doctor.name,
      doctorSpecialty: doctor.specialty,
      hospitalId: doctor.hospitalId,
      hospitalName: doctor.hospitalName,
      wingRoom: doctor.wingRoom,
      slotId: slot.id,
      dayLabel: slot.dayLabel,
      timeLabel: slot.timeLabel,
      consultationMode: consultationMode || (slot.isEmergencySlot ? 'Emergency Priority' : 'In-Person OPD'),
      consultationFeeInr: doctor.consultationFeeInr,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    db.appointments.unshift(appointment);
    saveDb();

    res.status(201).json({
      appointment,
      doctor,
      syncedAt: new Date().toISOString(),
    });
  });

  app.patch('/api/appointments/:appointmentId/cancel', (req, res) => {
    const user = getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    const appointment = db.appointments.find(
      (a) => a.id === req.params.appointmentId && a.userId === user.id
    );
    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    if (appointment.status === 'cancelled') {
      res.json({ appointment });
      return;
    }

    appointment.status = 'cancelled';
    const doctor = db.doctors.find((d) => d.id === appointment.doctorId);
    if (doctor) {
      const slot = doctor.slots.find((s) => s.id === appointment.slotId);
      if (slot) {
        slot.isBooked = false;
        delete slot.bookedByUserId;
      }
      recomputeDoctorAvailability(doctor);
    }
    saveDb();

    res.json({ appointment, doctor, syncedAt: new Date().toISOString() });
  });

  // Emergency Cab & Ambulance Bookings API
  app.get('/api/cabs', (req, res) => {
    const user = getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    const bookings = db.cabBookings
      .filter((b) => b.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ bookings });
  });

  app.post('/api/cabs', (req, res) => {
    const user = getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in required to dispatch a cab.' });
      return;
    }
    const {
      hospitalId,
      vehicleCategory,
      pickup,
      patientName,
      patientPhone,
      oxygenSupport,
      notes,
      routeDistanceKm,
      routeEtaMinutes,
    } = req.body as {
      hospitalId?: string;
      vehicleCategory?: VehicleCategory;
      pickup?: GeoPoint;
      patientName?: string;
      patientPhone?: string;
      oxygenSupport?: boolean;
      notes?: string;
      routeDistanceKm?: number;
      routeEtaMinutes?: number;
    };

    const hospital = db.hospitals.find((h) => h.id === hospitalId);
    if (!hospital || !pickup || typeof pickup.lat !== 'number' || typeof pickup.lng !== 'number') {
      res.status(400).json({ error: 'Valid destination hospital and pickup coordinates are required.' });
      return;
    }

    const chosenCategory: VehicleCategory = vehicleCategory || 'Priority Medical Cab';
    const distanceKm =
      typeof routeDistanceKm === 'number' && routeDistanceKm > 0
        ? Number(routeDistanceKm.toFixed(2))
        : haversineKm(pickup, hospital.coordinates);

    const etaMinutes =
      typeof routeEtaMinutes === 'number' && routeEtaMinutes > 0
        ? Math.max(3, Math.round(routeEtaMinutes))
        : Math.max(4, Math.round((distanceKm / 26) * 60) + 3);

    const driver = FLEET_DRIVERS[db.cabBookings.length % FLEET_DRIVERS.length];
    const booking: CabBooking = {
      id: `cab-${crypto.randomUUID().slice(0, 8)}`,
      bookingCode: `CAB-${Math.floor(10000 + Math.random() * 90000)}`,
      userId: user.id,
      patientName: patientName?.trim() || user.name,
      patientPhone: patientPhone?.trim() || user.phone,
      vehicleCategory: chosenCategory,
      pickup,
      hospitalId: hospital.id,
      hospitalName: hospital.shortName,
      hospitalCoordinates: hospital.coordinates,
      distanceKm,
      etaMinutes,
      estimatedFareInr: estimateFare(chosenCategory, distanceKm),
      driverName: driver.name,
      driverPhone: driver.phone,
      vehicleNumber: driver.plate,
      oxygenSupport:
        Boolean(oxygenSupport) ||
        chosenCategory === 'BLS Ambulance' ||
        chosenCategory === 'ICU Cardiac Ambulance',
      status: 'dispatched',
      notes: notes?.trim() || 'Priority hospital transfer',
      createdAt: new Date().toISOString(),
    };

    db.cabBookings.unshift(booking);
    saveDb();
    res.status(201).json({ booking });
  });

  app.patch('/api/cabs/:bookingId/status', (req, res) => {
    const user = getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    const booking = db.cabBookings.find(
      (b) => b.id === req.params.bookingId && b.userId === user.id
    );
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    const { status } = req.body as { status?: CabBooking['status'] };
    const allowed: CabBooking['status'][] = [
      'dispatched',
      'arriving',
      'en_route',
      'completed',
      'cancelled',
    ];
    if (!status || !allowed.includes(status)) {
      res.status(400).json({ error: 'Invalid status update.' });
      return;
    }
    booking.status = status;
    saveDb();
    res.json({ booking });
  });

  // Server-Side Gemini AI Emergency Triage & Hospital/Doctor Recommendation
  app.post('/api/triage', async (req, res) => {
    const { query, patientAge, severityHint } = req.body as {
      query?: string;
      patientAge?: string;
      severityHint?: string;
    };

    if (!query || query.trim().length < 3) {
      res.status(400).json({ error: 'Please describe the disease, condition, or symptoms.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Please add GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const hospitalContext = db.hospitals.map((h) => ({
      id: h.id,
      name: h.name,
      category: h.category,
      specialties: h.specialties,
      diseasesTreated: h.diseasesTreated,
      erBedsAvailable: h.erBedsAvailable,
      icuBedsAvailable: h.icuBedsAvailable,
      traumaLevel: h.traumaLevel,
    }));

    const doctorContext = db.doctors.map((d) => ({
      id: d.id,
      name: d.name,
      specialty: d.specialty,
      subSpecialty: d.subSpecialty,
      hospitalId: d.hospitalId,
      availabilityStatus: d.availabilityStatus,
      openSlotsToday: d.slots.filter((s) => s.dayLabel === 'Today' && !s.isBooked).length,
      treatedConditions: d.treatedConditions,
    }));

    const systemInstruction = `You are a clinical emergency triage and hospital routing assistant for Hassan District, Karnataka, India.
Given a patient's reported disease, injury, or symptoms, recommend the most suitable hospital(s) and specialist doctor(s) strictly from the provided Hassan directory.
Prioritize doctors whose availabilityStatus is 'available_now' and have openSlotsToday > 0 when medically appropriate for the condition.
Provide concise, calm, actionable pre-arrival first-aid guidance. Never diagnose definitively; always advise immediate 108 ambulance calling for life-threatening emergencies.
Return strictly valid JSON matching the schema. Only output hospital IDs and doctor IDs that exist verbatim in the provided JSON roster.`;

    const promptText = `Patient query: ${query.trim()}
Patient age group: ${patientAge?.trim() || 'Not specified'}
Reported urgency hint: ${severityHint?.trim() || 'Not specified'}

Available Hassan Hospitals:
${JSON.stringify(hospitalContext)}

Available Hassan Specialist Doctors (real-time availability):
${JSON.stringify(doctorContext)}`;

    try {
      const response = await aiClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptText,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              conditionSummary: {
                type: Type.STRING,
                description: 'Concise 1-sentence clinical summary of the reported condition.',
              },
              urgencyLevel: {
                type: Type.STRING,
                enum: ['Critical', 'Urgent', 'Standard'],
              },
              recommendedSpecialty: {
                type: Type.STRING,
                description: 'Primary medical department or specialty required.',
              },
              clinicalReasoning: {
                type: Type.STRING,
                description:
                  '2-sentence rationale explaining why these specific Hassan hospitals and currently available doctors match the disease/symptoms.',
              },
              immediateSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 4 practical pre-arrival stabilization steps.',
              },
              recommendedHospitalIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Ordered array of 1 to 3 valid hospital IDs from the provided roster.',
              },
              recommendedDoctorIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Ordered array of 1 to 3 valid doctor IDs from the provided roster.',
              },
              recommendedVehicleType: {
                type: Type.STRING,
                enum: [
                  'Priority Medical Cab',
                  'Wheelchair Access Van',
                  'BLS Ambulance',
                  'ICU Cardiac Ambulance',
                ],
              },
              disclaimer: {
                type: Type.STRING,
                description: 'Short medical safety disclaimer including Karnataka emergency helpline 108.',
              },
            },
            required: [
              'conditionSummary',
              'urgencyLevel',
              'recommendedSpecialty',
              'clinicalReasoning',
              'immediateSteps',
              'recommendedHospitalIds',
              'recommendedDoctorIds',
              'recommendedVehicleType',
              'disclaimer',
            ],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'AI triage returned an empty response. Please try again.' });
        return;
      }

      const parsed = JSON.parse(rawText) as TriageRecommendation;
      const validHospitalIds = new Set(db.hospitals.map((h) => h.id));
      const validDoctorIds = new Set(db.doctors.map((d) => d.id));

      parsed.recommendedHospitalIds = (parsed.recommendedHospitalIds || []).filter((id) =>
        validHospitalIds.has(id)
      );
      parsed.recommendedDoctorIds = (parsed.recommendedDoctorIds || []).filter((id) =>
        validDoctorIds.has(id)
      );

      if (parsed.recommendedHospitalIds.length === 0) {
        parsed.recommendedHospitalIds = [db.hospitals[0].id];
      }
      if (parsed.recommendedDoctorIds.length === 0) {
        const available = db.doctors.find((d) => d.availabilityStatus === 'available_now');
        parsed.recommendedDoctorIds = [available ? available.id : db.doctors[0].id];
      }

      res.json({ recommendation: parsed });
    } catch (err) {
      console.error('Gemini triage API error:', err);
      const message = err instanceof Error ? err.message : 'Unable to reach AI triage service.';
      res.status(502).json({
        error: `AI recommendation failed: ${message}. Please verify GEMINI_API_KEY in Settings > Secrets.`,
      });
    }
  });

  // Server-Side Gemini AI Emergency Healthcare Chatbot & Voice Recommendation API
  app.post('/api/chat', async (req, res) => {
    const { message, history, userLocation, voiceMode } = req.body as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
      userLocation?: GeoPoint;
      voiceMode?: boolean;
    };

    if (!message || message.trim().length < 2) {
      res.status(400).json({ error: 'Please enter or speak a health question or emergency symptom.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Please add GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const origin: GeoPoint =
      userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number'
        ? userLocation
        : { lat: 13.0072, lng: 76.0996, label: 'Hassan City Center, BM Road' };

    const hospitalContext = db.hospitals
      .map((h) => ({
        id: h.id,
        name: h.shortName,
        area: h.area,
        distanceKm: haversineKm(origin, h.coordinates),
        erBedsAvailable: h.erBedsAvailable,
        icuBedsAvailable: h.icuBedsAvailable,
        specialties: h.specialties,
        diseasesTreated: h.diseasesTreated,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const doctorContext = db.doctors.map((d) => ({
      id: d.id,
      name: d.name,
      specialty: d.specialty,
      hospitalId: d.hospitalId,
      hospitalName: d.hospitalName,
      availabilityStatus: d.availabilityStatus,
      nextAvailableLabel: d.nextAvailableLabel,
      openSlotsToday: d.slots.filter((s) => s.dayLabel === 'Today' && !s.isBooked).length,
      treatedConditions: d.treatedConditions,
    }));

    const recentTurns = (history || [])
      .slice(-8)
      .map((t) => `${t.role === 'user' ? 'Patient' : 'MedPulse AI'}: ${t.text}`)
      .join('\n');

    const systemInstruction = `You are MedPulse Hassan, an AI Emergency Healthcare Assistant and Voice Recommendation System for Hassan District, Karnataka, India.
Help patients describe diseases, injuries, or emergency symptoms, recommend the nearest suitable Hassan hospital and currently available specialist doctor from the provided real-time Hassan roster, and give calm, clear first-aid guidance.
- Prioritize doctors with availabilityStatus = 'available_now' and openSlotsToday > 0 when appropriate for the condition.
- Mention exact Hassan hospital names and approximate distance in km from the patient's current location.
- Always advise calling Karnataka emergency helpline 108 for life-threatening conditions.
- Provide BOTH a helpful written "reply" (3-5 concise sentences) AND a natural, clear "voiceScript" (2-3 spoken sentences with no markdown or symbols, ideal for text-to-speech playback${voiceMode ? '; the patient just spoke via voice' : ''}).
- Return strictly valid JSON matching the schema. Only output hospital IDs and doctor IDs verbatim from the provided roster.`;

    const promptText = `Patient Current Location in Hassan: ${origin.label || 'Live GPS'} (${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)})

Recent Conversation:
${recentTurns || '(New conversation)'}

Latest Patient Message: ${message.trim()}

Nearest Hassan Hospitals (sorted by live distance):
${JSON.stringify(hospitalContext)}

Live Hassan Specialist Doctors:
${JSON.stringify(doctorContext)}`;

    try {
      const response = await aiClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptText,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Clear, empathetic medical routing guidance and immediate advice.',
              },
              voiceScript: {
                type: Type.STRING,
                description: 'Natural 2-3 sentence spoken voice recommendation without symbols or bullet formatting.',
              },
              urgencyLevel: {
                type: Type.STRING,
                enum: ['Critical', 'Urgent', 'Standard'],
              },
              suggestedHospitalIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Up to 2 valid Hassan hospital IDs from the roster.',
              },
              suggestedDoctorIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Up to 2 valid Hassan specialist doctor IDs from the roster.',
              },
              suggestedVehicleCategory: {
                type: Type.STRING,
                enum: [
                  'Priority Medical Cab',
                  'Wheelchair Access Van',
                  'BLS Ambulance',
                  'ICU Cardiac Ambulance',
                ],
              },
              followUpQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 to 3 short clinical follow-up questions the patient can tap to answer.',
              },
            },
            required: [
              'reply',
              'voiceScript',
              'urgencyLevel',
              'suggestedHospitalIds',
              'suggestedDoctorIds',
              'followUpQuestions',
            ],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'AI assistant returned an empty response. Please try again.' });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        reply: string;
        voiceScript: string;
        urgencyLevel: 'Critical' | 'Urgent' | 'Standard';
        suggestedHospitalIds: string[];
        suggestedDoctorIds: string[];
        suggestedVehicleCategory?: VehicleCategory;
        followUpQuestions: string[];
      };

      const validHospitalIds = new Set(db.hospitals.map((h) => h.id));
      const validDoctorIds = new Set(db.doctors.map((d) => d.id));
      parsed.suggestedHospitalIds = (parsed.suggestedHospitalIds || []).filter((id) =>
        validHospitalIds.has(id)
      );
      parsed.suggestedDoctorIds = (parsed.suggestedDoctorIds || []).filter((id) =>
        validDoctorIds.has(id)
      );

      res.json({ response: parsed });
    } catch (err) {
      console.error('Gemini chat API error:', err);
      const errMsg = err instanceof Error ? err.message : 'Unable to reach AI assistant.';
      res.status(502).json({
        error: `AI Chatbot error: ${errMsg}. Please verify GEMINI_API_KEY in Settings > Secrets.`,
      });
    }
  });

  // Frontend serving: Vite middleware in development, static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MedPulse Hassan server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
