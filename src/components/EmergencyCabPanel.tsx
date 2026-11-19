import React, { useState } from 'react';
import {
  Ambulance,
  Car,
  CheckCircle2,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { HASSAN_LANDMARKS } from '../data/hassanMedicalRoster';
import {
  apiBookCab,
  apiUpdateCabStatus,
  buildGoogleMapsDirectionsUrl,
  estimateDrivingMinutes,
  estimateRoadDistanceKm,
} from '../lib/api';
import type {
  CabBooking,
  GeoPoint,
  Hospital,
  RouteMetrics,
  UserProfile,
  VehicleCategory,
} from '../types';

interface EmergencyCabPanelProps {
  user: UserProfile;
  userLocation: GeoPoint;
  hospitals: Hospital[];
  selectedHospital: Hospital;
  onSelectHospital: (hospital: Hospital) => void;
  onSelectPickupLandmark: (point: GeoPoint) => void;
  onRequestGps: () => void;
  gpsStatus: 'idle' | 'locating' | 'live' | 'fallback';
  routeMetrics: RouteMetrics | null;
  bookings: CabBooking[];
  onBookingCreated: (booking: CabBooking) => void;
  onBookingUpdated: (booking: CabBooking) => void;
}

const VEHICLE_OPTIONS: {
  category: VehicleCategory;
  subtitle: string;
  baseRate: number;
  perKm: number;
  dispatchMins: string;
  oxygenIncluded: boolean;
}[] = [
  {
    category: 'Priority Medical Cab',
    subtitle: 'AC Sedan · Immediate Hassan city pickup for non-stretcher urgent visits',
    baseRate: 90,
    perKm: 18,
    dispatchMins: '3–5 min',
    oxygenIncluded: false,
  },
  {
    category: 'Wheelchair Access Van',
    subtitle: 'Hydraulic ramp & seating for 2 family attendants',
    baseRate: 180,
    perKm: 24,
    dispatchMins: '5–8 min',
    oxygenIncluded: false,
  },
  {
    category: 'BLS Ambulance',
    subtitle: 'Stretcher, medical oxygen cylinder & Basic Life Support EMT',
    baseRate: 350,
    perKm: 32,
    dispatchMins: '4–7 min',
    oxygenIncluded: true,
  },
  {
    category: 'ICU Cardiac Ambulance',
    subtitle: 'Ventilator, multipara monitor, defibrillator & paramedic crew',
    baseRate: 750,
    perKm: 48,
    dispatchMins: '6–9 min',
    oxygenIncluded: true,
  },
];

const STATUS_SEQUENCE: CabBooking['status'][] = ['dispatched', 'arriving', 'en_route', 'completed'];

export function EmergencyCabPanel({
  user,
  userLocation,
  hospitals,
  selectedHospital,
  onSelectHospital,
  onSelectPickupLandmark,
  onRequestGps,
  gpsStatus,
  routeMetrics,
  bookings,
  onBookingCreated,
  onBookingUpdated,
}: EmergencyCabPanelProps) {
  const [vehicleCategory, setVehicleCategory] =
    useState<VehicleCategory>('Priority Medical Cab');
  const [patientName, setPatientName] = useState(user.name);
  const [patientPhone, setPatientPhone] = useState(user.phone);
  const [oxygenSupport, setOxygenSupport] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const distanceKm =
    routeMetrics?.distanceKm ||
    estimateRoadDistanceKm(userLocation, selectedHospital.coordinates);
  const etaMins = routeMetrics?.durationMins || estimateDrivingMinutes(distanceKm);

  const selectedVehicleMeta =
    VEHICLE_OPTIONS.find((v) => v.category === vehicleCategory) || VEHICLE_OPTIONS[0];
  const estimatedFare = Math.round(
    selectedVehicleMeta.baseRate + Math.max(1, distanceKm) * selectedVehicleMeta.perKm
  );

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiBookCab({
        hospitalId: selectedHospital.id,
        vehicleCategory,
        pickup: userLocation,
        patientName,
        patientPhone,
        oxygenSupport: oxygenSupport || selectedVehicleMeta.oxygenIncluded,
        notes,
        routeDistanceKm: distanceKm,
        routeEtaMinutes: etaMins,
      });
      onBookingCreated(res.booking);
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to book emergency cab.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdvanceStatus(booking: CabBooking, nextStatus: CabBooking['status']) {
    setUpdatingId(booking.id);
    try {
      const res = await apiUpdateCabStatus(booking.id, nextStatus);
      onBookingUpdated(res.booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update trip status.');
    } finally {
      setUpdatingId(null);
    }
  }

  const activeBookings = bookings.filter(
    (b) => b.status !== 'completed' && b.status !== 'cancelled'
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Dispatch Configuration Form */}
      <form
        onSubmit={handleDispatch}
        className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Emergency Cab &amp; Ambulance Dispatch
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Instant KA-13 Hassan fleet routing from your current location to emergency reception.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Est. Route</p>
            <p className="font-mono text-sm font-semibold text-teal-700 tabular-nums">
              {distanceKm.toFixed(1)} km · {etaMins} min
            </p>
          </div>
        </div>

        {/* Pickup Location Selector */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-900">
              1. Pickup Location (Current GPS or Hassan Landmark)
            </label>
            <button
              type="button"
              onClick={onRequestGps}
              className="text-xs font-medium text-teal-700 hover:text-teal-800 flex items-center gap-1 whitespace-nowrap"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>{gpsStatus === 'locating' ? 'Detecting GPS...' : 'Detect Live GPS'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
            <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-medium truncate">
              {userLocation.label || 'Current GPS Coordinates'}
            </span>
            <span className="ml-auto font-mono text-slate-500 tabular-nums shrink-0">
              {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {HASSAN_LANDMARKS.map((landmark) => {
              const active = userLocation.label === landmark.label;
              return (
                <button
                  key={landmark.label}
                  type="button"
                  onClick={() => onSelectPickupLandmark(landmark)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {landmark.label.replace(', Hassan', '')}
                </button>
              );
            })}
          </div>
        </div>

        {/* Destination Hospital */}
        <div className="space-y-1.5">
          <label htmlFor="cab-hosp" className="block text-xs font-semibold text-slate-900">
            2. Destination Emergency Hospital in Hassan
          </label>
          <select
            id="cab-hosp"
            value={selectedHospital.id}
            onChange={(e) => {
              const found = hospitals.find((h) => h.id === e.target.value);
              if (found) onSelectHospital(found);
            }}
            className="w-full h-11 px-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          >
            {hospitals.map((h) => {
              const dist = estimateRoadDistanceKm(userLocation, h.coordinates);
              return (
                <option key={h.id} value={h.id}>
                  {h.shortName} ({h.area}) — {dist.toFixed(1)} km · {h.erBedsAvailable} ER beds
                </option>
              );
            })}
          </select>
        </div>

        {/* Vehicle Selection */}
        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-slate-900">
            3. Select Emergency Vehicle Tier
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {VEHICLE_OPTIONS.map((v) => {
              const isSelected = vehicleCategory === v.category;
              const fare = Math.round(v.baseRate + Math.max(1, distanceKm) * v.perKm);
              return (
                <button
                  key={v.category}
                  type="button"
                  onClick={() => setVehicleCategory(v.category)}
                  className={`p-3.5 rounded-lg border text-left transition-colors ${
                    isSelected
                      ? 'border-red-600 bg-red-50/50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      {v.category.includes('Ambulance') ? (
                        <Ambulance className="w-4 h-4 text-red-600 shrink-0" />
                      ) : (
                        <Car className="w-4 h-4 text-teal-700 shrink-0" />
                      )}
                      <span>{v.category}</span>
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                      ₹{fare}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-snug">{v.subtitle}</p>
                  <p className="text-[11px] font-mono text-slate-500 mt-2">
                    Dispatch ETA: {v.dispatchMins}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rider Contact & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="cab-name" className="block text-xs font-medium text-slate-700">
              Patient / Attendant Name
            </label>
            <input
              id="cab-name"
              type="text"
              required
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="cab-phone" className="block text-xs font-medium text-slate-700">
              Driver Callback Number
            </label>
            <input
              id="cab-phone"
              type="tel"
              required
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={oxygenSupport || selectedVehicleMeta.oxygenIncluded}
              disabled={selectedVehicleMeta.oxygenIncluded}
              onChange={(e) => setOxygenSupport(e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Portable oxygen cylinder &amp; priority stretcher clearance</span>
          </label>
        </div>

        <div className="space-y-1">
          <label htmlFor="cab-notes" className="block text-xs font-medium text-slate-700">
            Pickup Landmark / Gate Instructions (Optional)
          </label>
          <input
            id="cab-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Near Main Gate, 2nd Cross, patient requires wheelchair assistance"
            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
          >
            {error}
          </div>
        )}

        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500">Estimated Total Fare</p>
            <p className="font-mono text-xl font-bold text-slate-900 tabular-nums">
              ₹{estimatedFare}
            </p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="h-11 px-6 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>{submitting ? 'Dispatching Fleet...' : `Dispatch ${vehicleCategory}`}</span>
          </button>
        </div>
      </form>

      {/* Right: Active Dispatch Tracker & History */}
      <div className="xl:col-span-5 space-y-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Active Emergency Dispatches
            </h3>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {activeBookings.length} active
            </span>
          </div>

          {activeBookings.length === 0 ? (
            <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 rounded-lg px-4">
              <Car className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-sm font-medium text-slate-700">No active vehicle dispatch</p>
              <p className="text-xs text-slate-500">
                Select your pickup point and Hassan hospital on the left to dispatch a priority
                medical cab or ambulance with live driver details.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeBookings.map((booking) => {
                const currentStepIdx = STATUS_SEQUENCE.indexOf(booking.status);
                const nextStatus =
                  currentStepIdx >= 0 && currentStepIdx < STATUS_SEQUENCE.length - 1
                    ? STATUS_SEQUENCE[currentStepIdx + 1]
                    : null;

                return (
                  <div
                    key={booking.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs font-semibold text-red-700">
                          {booking.bookingCode} · {booking.vehicleCategory}
                        </p>
                        <p className="font-display text-sm font-bold text-slate-900 mt-0.5">
                          To {booking.hospitalName}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-semibold text-teal-700 tabular-nums">
                        ETA {booking.etaMinutes} min
                      </span>
                    </div>

                    {/* Progress Steps */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['Dispatched', 'Arriving', 'En Route', 'Arrived'] as const).map(
                        (label, idx) => (
                          <div key={label} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full ${
                                idx <= currentStepIdx ? 'bg-teal-700' : 'bg-slate-200'
                              }`}
                            />
                            <p
                              className={`text-[10px] font-medium ${
                                idx <= currentStepIdx ? 'text-slate-900' : 'text-slate-400'
                              }`}
                            >
                              {label}
                            </p>
                          </div>
                        )
                      )}
                    </div>

                    <div className="bg-white rounded-md border border-slate-200 p-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">Assigned Driver</p>
                        <p className="font-semibold text-slate-900 flex items-center gap-1 mt-0.5">
                          <UserCheck className="w-3.5 h-3.5 text-teal-700" />
                          {booking.driverName}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Vehicle Plate</p>
                        <p className="font-mono font-semibold text-slate-900 mt-0.5">
                          {booking.vehicleNumber}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Driver Phone</p>
                        <p className="font-mono text-slate-800 mt-0.5">{booking.driverPhone}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Distance / Fare</p>
                        <p className="font-mono text-slate-800 tabular-nums mt-0.5">
                          {booking.distanceKm.toFixed(1)} km · ₹{booking.estimatedFareInr}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href={buildGoogleMapsDirectionsUrl(
                          booking.pickup,
                          booking.hospitalCoordinates
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 px-3 rounded-md bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Track Route</span>
                      </a>

                      <a
                        href={`tel:${booking.driverPhone.replace(/\s+/g, '')}`}
                        className="h-8 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call Driver</span>
                      </a>

                      {nextStatus && (
                        <button
                          type="button"
                          disabled={updatingId === booking.id}
                          onClick={() => handleAdvanceStatus(booking, nextStatus)}
                          className="h-8 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap"
                        >
                          Mark {nextStatus.replace('_', ' ')}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={updatingId === booking.id}
                        onClick={() => handleAdvanceStatus(booking, 'cancelled')}
                        className="ml-auto h-8 px-2.5 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Past Dispatches Summary */}
        {bookings.some((b) => b.status === 'completed' || b.status === 'cancelled') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-sm font-bold text-slate-900">Recent Trip Log</h3>
            <div className="divide-y divide-slate-100">
              {bookings
                .filter((b) => b.status === 'completed' || b.status === 'cancelled')
                .slice(0, 4)
                .map((b) => (
                  <div key={b.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">
                        {b.vehicleCategory} → {b.hospitalName}
                      </p>
                      <p className="text-slate-500 font-mono tabular-nums">
                        {b.bookingCode} · {b.vehicleNumber} · ₹{b.estimatedFareInr}
                      </p>
                    </div>
                    <span
                      className={`font-medium inline-flex items-center gap-1 whitespace-nowrap ${
                        b.status === 'completed' ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {b.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {b.status === 'completed' ? 'Completed' : 'Cancelled'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
