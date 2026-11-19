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
} from '../types';

const TOKEN_STORAGE_KEY = 'medpulse_hassan_token';

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted iframes
  }
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.error === 'string' && data.error.length > 0
        ? data.error
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function apiMe(): Promise<{ user: UserProfile }> {
  return requestJson('/api/auth/me');
}

export async function apiLogin(payload: {
  email: string;
  password: string;
}): Promise<{ user: UserProfile; token: string }> {
  const res = await requestJson<{ user: UserProfile; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setStoredToken(res.token);
  return res;
}

export async function apiRegister(payload: {
  name: string;
  email: string;
  password: string;
  phone: string;
  bloodGroup: string;
  emergencyContact: string;
}): Promise<{ user: UserProfile; token: string }> {
  const res = await requestJson<{ user: UserProfile; token: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setStoredToken(res.token);
  return res;
}

export async function apiDemoLogin(): Promise<{ user: UserProfile; token: string }> {
  const res = await requestJson<{ user: UserProfile; token: string }>('/api/auth/demo', {
    method: 'POST',
  });
  setStoredToken(res.token);
  return res;
}

export async function apiLogout(): Promise<void> {
  try {
    await requestJson('/api/auth/logout', { method: 'POST' });
  } finally {
    setStoredToken(null);
  }
}

export async function apiGetRoster(): Promise<{
  hospitals: Hospital[];
  doctors: Doctor[];
  syncedAt: string;
}> {
  return requestJson('/api/roster');
}

export async function apiUpdateDoctorStatus(
  doctorId: string,
  availabilityStatus: AvailabilityStatus
): Promise<{ doctor: Doctor; syncedAt: string }> {
  return requestJson(`/api/doctors/${encodeURIComponent(doctorId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ availabilityStatus }),
  });
}

export async function apiRunTriage(payload: {
  query: string;
  patientAge?: string;
  severityHint?: string;
}): Promise<{ recommendation: TriageRecommendation }> {
  return requestJson('/api/triage', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiSendChatMessage(payload: {
  message: string;
  history: import('../types').ChatHistoryTurn[];
  userLocation?: GeoPoint;
  voiceMode?: boolean;
}): Promise<{ response: import('../types').AiChatResponse }> {
  return requestJson('/api/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiGetAppointments(): Promise<{ appointments: Appointment[] }> {
  return requestJson('/api/appointments');
}

export async function apiBookAppointment(payload: {
  doctorId: string;
  slotId: string;
  patientName: string;
  patientPhone: string;
  patientAge: string;
  symptomsNote: string;
  consultationMode: ConsultationMode;
}): Promise<{ appointment: Appointment; doctor: Doctor; syncedAt: string }> {
  return requestJson('/api/appointments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiCancelAppointment(
  appointmentId: string
): Promise<{ appointment: Appointment; doctor?: Doctor; syncedAt: string }> {
  return requestJson(`/api/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
    method: 'PATCH',
  });
}

export async function apiGetCabs(): Promise<{ bookings: CabBooking[] }> {
  return requestJson('/api/cabs');
}

export async function apiBookCab(payload: {
  hospitalId: string;
  vehicleCategory: VehicleCategory;
  pickup: GeoPoint;
  patientName: string;
  patientPhone: string;
  oxygenSupport: boolean;
  notes: string;
  routeDistanceKm?: number;
  routeEtaMinutes?: number;
}): Promise<{ booking: CabBooking }> {
  return requestJson('/api/cabs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateCabStatus(
  bookingId: string,
  status: CabBooking['status']
): Promise<{ booking: CabBooking }> {
  return requestJson(`/api/cabs/${encodeURIComponent(bookingId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function estimateRoadDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusKm = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return Number((2 * earthRadiusKm * Math.asin(Math.sqrt(h)) * 1.28).toFixed(2));
}

export function estimateDrivingMinutes(distanceKm: number): number {
  return Math.max(3, Math.round((distanceKm / 26) * 60) + 2);
}

export function buildGoogleMapsDirectionsUrl(origin: GeoPoint, destination: GeoPoint): string {
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
