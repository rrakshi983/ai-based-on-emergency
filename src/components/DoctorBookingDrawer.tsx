import React, { useEffect, useState } from 'react';
import {
  Building2,
  CalendarCheck,
  Car,
  CheckCircle2,
  Clock,
  Navigation,
  Phone,
  Stethoscope,
  X,
} from 'lucide-react';
import { apiBookAppointment } from '../lib/api';
import type {
  Appointment,
  ConsultationMode,
  Doctor,
  Hospital,
  UserProfile,
} from '../types';

interface DoctorBookingDrawerProps {
  doctor: Doctor | null;
  hospital: Hospital | undefined;
  user: UserProfile;
  initialSymptomNote?: string;
  lastSyncedLabel: string;
  onClose: () => void;
  onBooked: (appointment: Appointment, updatedDoctor: Doctor, syncedAt: string) => void;
  onOpenCabForHospital: (hospitalId: string) => void;
  onNavigateToHospital: (hospitalId: string) => void;
}

const AVAILABILITY_LABELS: Record<
  Doctor['availabilityStatus'],
  { label: string; textClass: string }
> = {
  available_now: { label: 'Available Now', textClass: 'text-emerald-700' },
  upcoming_today: { label: 'Upcoming Slot Today', textClass: 'text-amber-700' },
  on_call: { label: 'On Call / Tomorrow', textClass: 'text-slate-600' },
};

export function DoctorBookingDrawer({
  doctor,
  hospital,
  user,
  initialSymptomNote = '',
  lastSyncedLabel,
  onClose,
  onBooked,
  onOpenCabForHospital,
  onNavigateToHospital,
}: DoctorBookingDrawerProps) {
  const [selectedDay, setSelectedDay] = useState<'Today' | 'Tomorrow'>('Today');
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [consultationMode, setConsultationMode] =
    useState<ConsultationMode>('Emergency Priority');
  const [patientName, setPatientName] = useState(user.name);
  const [patientPhone, setPatientPhone] = useState(user.phone);
  const [patientAge, setPatientAge] = useState('34');
  const [symptomsNote, setSymptomsNote] = useState(initialSymptomNote);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    if (!doctor) return;
    setConfirmedAppointment(null);
    setError(null);
    setAvatarError(false);
    setSymptomsNote(initialSymptomNote);
    setPatientName(user.name);
    setPatientPhone(user.phone);

    const openToday = doctor.slots.filter((s) => s.dayLabel === 'Today' && !s.isBooked);
    if (openToday.length > 0) {
      setSelectedDay('Today');
      setSelectedSlotId(openToday[0].id);
      setConsultationMode(openToday[0].isEmergencySlot ? 'Emergency Priority' : 'In-Person OPD');
    } else {
      const openTomorrow = doctor.slots.filter((s) => s.dayLabel === 'Tomorrow' && !s.isBooked);
      setSelectedDay('Tomorrow');
      setSelectedSlotId(openTomorrow[0]?.id || '');
      setConsultationMode('In-Person OPD');
    }
  }, [doctor?.id, initialSymptomNote, user.name, user.phone]);

  if (!doctor) return null;

  const daySlots = doctor.slots.filter((s) => s.dayLabel === selectedDay);
  const openSlotsCount = doctor.slots.filter((s) => !s.isBooked).length;
  const statusMeta = AVAILABILITY_LABELS[doctor.availabilityStatus];

  async function handleConfirmBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!doctor || !selectedSlotId) {
      setError('Please select an available appointment time slot.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiBookAppointment({
        doctorId: doctor.id,
        slotId: selectedSlotId,
        patientName,
        patientPhone,
        patientAge,
        symptomsNote,
        consultationMode,
      });
      setConfirmedAppointment(res.appointment);
      onBooked(res.appointment, res.doctor, res.syncedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to book this slot.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Doctor profile and appointment booking for ${doctor.name}`}
    >
      <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Top Drawer Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">
              Doctor Profile &amp; Live Slot Booking · Synced {lastSyncedLabel}
            </p>
            <h2 className="font-display text-lg font-bold text-slate-900 truncate">
              {doctor.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking drawer"
            className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* Doctor Clinical Summary */}
          <div className="flex items-start gap-4 pb-6 border-b border-slate-200">
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
              {!avatarError ? (
                <img
                  src={doctor.avatarUrl}
                  alt={doctor.name}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-teal-700">
                  <Stethoscope className="w-8 h-8" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className={`font-semibold ${statusMeta.textClass}`}>
                  {statusMeta.label}
                </span>
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span className="text-slate-600">{doctor.specialty}</span>
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums text-slate-600">
                  {doctor.experienceYears} yrs exp
                </span>
              </div>

              <p className="text-sm font-medium text-slate-800">{doctor.qualification}</p>
              <p className="text-xs text-slate-600">{doctor.subSpecialty}</p>

              <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {hospital?.shortName || doctor.hospitalName}
                </span>
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span>{doctor.wingRoom}</span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>
                  Consultation:{' '}
                  <strong className="font-mono text-slate-900 tabular-nums">
                    ₹{doctor.consultationFeeInr}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>Languages: {doctor.languages.join(', ')}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {doctor.casesHandled.toLocaleString()} cases
                </span>
              </div>
            </div>
          </div>

          {/* Conditions Handled */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-slate-900">
              Specialized Conditions &amp; Emergencies Treated
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {doctor.treatedConditions.join(' · ')}
            </p>
            <p className="text-xs text-slate-500">
              Live Desk Status: <span className="text-slate-800 font-medium">{doctor.statusDetail}</span>
            </p>
          </div>

          {confirmedAppointment ? (
            /* Confirmation Pass State */
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-6 space-y-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Appointment Confirmed
                  </h3>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Your slot is locked in real time and the hospital reception has been notified.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-teal-200/80 p-4 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">Confirmation Code</p>
                  <p className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5">
                    {confirmedAppointment.confirmationCode}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">OPD / Priority Token</p>
                  <p className="font-mono text-base font-bold text-teal-700 tabular-nums mt-0.5">
                    {confirmedAppointment.tokenNumber}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Scheduled Slot</p>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {confirmedAppointment.dayLabel}, {confirmedAppointment.timeLabel}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Consultation Mode</p>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {confirmedAppointment.consultationMode}
                  </p>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-100">
                  <p className="text-slate-500">Location &amp; Reporting Desk</p>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {confirmedAppointment.hospitalName} — {confirmedAppointment.wingRoom}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-500">Patient</p>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {confirmedAppointment.patientName} ({confirmedAppointment.patientAge} yrs) ·{' '}
                    <span className="font-mono">{confirmedAppointment.patientPhone}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCabForHospital(confirmedAppointment.hospitalId);
                  }}
                  className="h-10 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Car className="w-4 h-4" />
                  <span>Book Emergency Cab</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToHospital(confirmedAppointment.hospitalId);
                  }}
                  className="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Navigation className="w-4 h-4 text-teal-700" />
                  <span>Show Live Directions</span>
                </button>
              </div>
            </div>
          ) : (
            /* Live Slot Selection & Booking Form */
            <form onSubmit={handleConfirmBooking} className="space-y-6">
              {/* Real-Time Slot Selector */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      1. Select Live Available Time Slot
                    </h3>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      {openSlotsCount} open slots across Today &amp; Tomorrow
                    </p>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {(['Today', 'Tomorrow'] as const).map((day) => {
                      const count = doctor.slots.filter(
                        (s) => s.dayLabel === day && !s.isBooked
                      ).length;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setSelectedDay(day);
                            const firstOpen = doctor.slots.find(
                              (s) => s.dayLabel === day && !s.isBooked
                            );
                            setSelectedSlotId(firstOpen?.id || '');
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            selectedDay === day
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {day} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {daySlots.map((slot) => {
                    const isSelected = selectedSlotId === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={slot.isBooked}
                        onClick={() => {
                          setSelectedSlotId(slot.id);
                          if (slot.isEmergencySlot) {
                            setConsultationMode('Emergency Priority');
                          }
                        }}
                        className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
                          slot.isBooked
                            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                            : isSelected
                            ? 'border-teal-700 bg-teal-700 text-white'
                            : 'border-slate-200 bg-white hover:border-teal-600 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-xs font-semibold tabular-nums truncate">
                            {slot.timeLabel}
                          </span>
                          <Clock className="w-3.5 h-3.5 opacity-70 shrink-0" />
                        </div>
                        <p
                          className={`text-[11px] mt-0.5 ${
                            slot.isBooked
                              ? 'text-slate-400'
                              : isSelected
                              ? 'text-teal-100'
                              : slot.isEmergencySlot
                              ? 'text-red-600 font-medium'
                              : 'text-slate-500'
                          }`}
                        >
                          {slot.isBooked
                            ? 'Booked'
                            : slot.isEmergencySlot
                            ? 'Priority ER Slot'
                            : 'Available'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Consultation Mode */}
              <div className="space-y-2">
                <label className="block font-display text-sm font-semibold text-slate-900">
                  2. Consultation Type
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['Emergency Priority', 'In-Person OPD', 'Tele-Triage'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setConsultationMode(m)}
                      className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                        consultationMode === m
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Patient Intake Details */}
              <div className="space-y-3">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  3. Patient Details
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label htmlFor="bk-name" className="block text-xs font-medium text-slate-700">
                      Patient Name
                    </label>
                    <input
                      id="bk-name"
                      type="text"
                      required
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="bk-age" className="block text-xs font-medium text-slate-700">
                      Age (Years)
                    </label>
                    <input
                      id="bk-age"
                      type="text"
                      required
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="bk-phone" className="block text-xs font-medium text-slate-700">
                    Contact Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="bk-phone"
                      type="tel"
                      required
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="bk-notes" className="block text-xs font-medium text-slate-700">
                    Symptoms / Disease Brief (Shared with {doctor.name})
                  </label>
                  <textarea
                    id="bk-notes"
                    rows={2}
                    value={symptomsNote}
                    onChange={(e) => setSymptomsNote(e.target.value)}
                    placeholder="e.g. Chest discomfort since 1 hour, history of hypertension..."
                    className="w-full p-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
                >
                  {error}
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500">Pay at Hospital Desk</p>
                  <p className="font-mono text-base font-bold text-slate-900 tabular-nums">
                    ₹{doctor.consultationFeeInr}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !selectedSlotId}
                  className="h-11 px-6 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                >
                  <CalendarCheck className="w-4 h-4" />
                  <span>{submitting ? 'Confirming Slot...' : 'Confirm Appointment'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
