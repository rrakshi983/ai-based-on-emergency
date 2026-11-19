export type AvailabilityStatus = 'available_now' | 'upcoming_today' | 'on_call';

export type ConsultationMode = 'Emergency Priority' | 'In-Person OPD' | 'Tele-Triage';

export type VehicleCategory =
  | 'Priority Medical Cab'
  | 'Wheelchair Access Van'
  | 'BLS Ambulance'
  | 'ICU Cardiac Ambulance';

export type UrgencyTier = 'Critical' | 'Urgent' | 'Standard';

export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  bloodGroup: string;
  emergencyContact: string;
  role: 'patient' | 'coordinator';
}

export interface Hospital {
  id: string;
  name: string;
  shortName: string;
  category: 'Government Tertiary' | 'Multi-Specialty' | 'Cardiac & Trauma' | 'Maternal & Pediatric';
  area: string;
  address: string;
  phone: string;
  emergencyDesk: string;
  coordinates: GeoPoint;
  specialties: string[];
  diseasesTreated: string[];
  erBedsAvailable: number;
  icuBedsAvailable: number;
  ventilatorsReady: number;
  ambulanceFleetReady: number;
  open24x7: boolean;
  traumaLevel: 'Level I' | 'Level II' | 'Specialized';
  avgWaitMins: number;
  cashlessInsurance: string[];
}

export interface DoctorSlot {
  id: string;
  dayLabel: 'Today' | 'Tomorrow';
  timeLabel: string;
  isoSlotKey: string;
  isEmergencySlot: boolean;
  isBooked: boolean;
  bookedByUserId?: string;
}

export interface Doctor {
  id: string;
  name: string;
  qualification: string;
  specialty: string;
  subSpecialty: string;
  hospitalId: string;
  hospitalName: string;
  wingRoom: string;
  experienceYears: number;
  languages: string[];
  consultationFeeInr: number;
  availabilityStatus: AvailabilityStatus;
  statusDetail: string;
  nextAvailableLabel: string;
  treatedConditions: string[];
  avatarUrl: string;
  rating: number;
  casesHandled: number;
  slots: DoctorSlot[];
}

export interface Appointment {
  id: string;
  confirmationCode: string;
  tokenNumber: string;
  userId: string;
  patientName: string;
  patientPhone: string;
  patientAge: string;
  symptomsNote: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  hospitalId: string;
  hospitalName: string;
  wingRoom: string;
  slotId: string;
  dayLabel: 'Today' | 'Tomorrow';
  timeLabel: string;
  consultationMode: ConsultationMode;
  consultationFeeInr: number;
  status: 'confirmed' | 'cancelled' | 'completed';
  createdAt: string;
}

export interface CabBooking {
  id: string;
  bookingCode: string;
  userId: string;
  patientName: string;
  patientPhone: string;
  vehicleCategory: VehicleCategory;
  pickup: GeoPoint;
  hospitalId: string;
  hospitalName: string;
  hospitalCoordinates: GeoPoint;
  distanceKm: number;
  etaMinutes: number;
  estimatedFareInr: number;
  driverName: string;
  driverPhone: string;
  vehicleNumber: string;
  oxygenSupport: boolean;
  status: 'dispatched' | 'arriving' | 'en_route' | 'completed' | 'cancelled';
  notes: string;
  createdAt: string;
}

export interface TriageRecommendation {
  conditionSummary: string;
  urgencyLevel: UrgencyTier;
  recommendedSpecialty: string;
  clinicalReasoning: string;
  immediateSteps: string[];
  recommendedHospitalIds: string[];
  recommendedDoctorIds: string[];
  recommendedVehicleType: VehicleCategory;
  disclaimer: string;
}

export interface RouteMetrics {
  distanceText: string;
  durationText: string;
  distanceKm: number;
  durationMins: number;
  source: 'google-routes' | 'haversine-estimate';
  steps?: string[];
}

export interface LocationTracePoint {
  lat: number;
  lng: number;
  accuracyMeters?: number;
  timestamp: string;
  label?: string;
}

export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AiChatResponse {
  reply: string;
  voiceScript: string;
  urgencyLevel: UrgencyTier;
  suggestedHospitalIds: string[];
  suggestedDoctorIds: string[];
  suggestedVehicleCategory?: VehicleCategory;
  followUpQuestions: string[];
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  voiceScript?: string;
  urgencyLevel?: UrgencyTier;
  suggestedHospitalIds?: string[];
  suggestedDoctorIds?: string[];
  suggestedVehicleCategory?: VehicleCategory;
  followUpQuestions?: string[];
  inputMode?: 'text' | 'voice';
}

