import React, { useMemo, useState } from 'react';
import {
  Building2,
  CalendarCheck,
  Clock,
  RefreshCw,
  Search,
  Stethoscope,
} from 'lucide-react';
import type { AvailabilityStatus, Doctor, Hospital } from '../types';

interface DoctorsAvailabilityViewProps {
  doctors: Doctor[];
  hospitals: Hospital[];
  lastSyncedLabel: string;
  onRefreshRoster: () => void;
  refreshing: boolean;
  onSelectDoctor: (doctor: Doctor) => void;
  onQuickStatusChange: (doctorId: string, status: AvailabilityStatus) => void;
}

const STATUS_DISPLAY: Record<
  AvailabilityStatus,
  { label: string; colorClass: string; borderClass: string }
> = {
  available_now: {
    label: 'Available Now',
    colorClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
  },
  upcoming_today: {
    label: 'Upcoming Today',
    colorClass: 'text-amber-700',
    borderClass: 'border-amber-200',
  },
  on_call: {
    label: 'On Call',
    colorClass: 'text-slate-600',
    borderClass: 'border-slate-200',
  },
};

export function DoctorsAvailabilityView({
  doctors,
  hospitals,
  lastSyncedLabel,
  onRefreshRoster,
  refreshing,
  onSelectDoctor,
  onQuickStatusChange,
}: DoctorsAvailabilityViewProps) {
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | AvailabilityStatus>('all');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all');
  const [hospitalFilter, setHospitalFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const specialties = useMemo(
    () => Array.from(new Set(doctors.map((d) => d.specialty))).sort(),
    [doctors]
  );

  const counts = useMemo(
    () => ({
      all: doctors.length,
      available_now: doctors.filter((d) => d.availabilityStatus === 'available_now').length,
      upcoming_today: doctors.filter((d) => d.availabilityStatus === 'upcoming_today').length,
      on_call: doctors.filter((d) => d.availabilityStatus === 'on_call').length,
    }),
    [doctors]
  );

  const filteredDoctors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return doctors.filter((doc) => {
      if (availabilityFilter !== 'all' && doc.availabilityStatus !== availabilityFilter) {
        return false;
      }
      if (specialtyFilter !== 'all' && doc.specialty !== specialtyFilter) {
        return false;
      }
      if (hospitalFilter !== 'all' && doc.hospitalId !== hospitalFilter) {
        return false;
      }
      if (!q) return true;
      return (
        doc.name.toLowerCase().includes(q) ||
        doc.specialty.toLowerCase().includes(q) ||
        doc.subSpecialty.toLowerCase().includes(q) ||
        doc.hospitalName.toLowerCase().includes(q) ||
        doc.treatedConditions.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [doctors, availabilityFilter, specialtyFilter, hospitalFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header & Real-Time Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Real-Time Doctor Availability &amp; Slot Booking
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Live Hassan specialist schedules updated automatically · Last synced{' '}
              <span className="font-mono tabular-nums text-slate-800">{lastSyncedLabel}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onRefreshRoster}
            disabled={refreshing}
            className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-teal-700 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing Slots...' : 'Refresh Live Slots'}</span>
          </button>
        </div>

        {/* Segmented Availability Filter + Dropdowns + Search */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'all', label: `All (${counts.all})` },
                { id: 'available_now', label: `Available Now (${counts.available_now})` },
                { id: 'upcoming_today', label: `Upcoming Today (${counts.upcoming_today})` },
                { id: 'on_call', label: `On Call (${counts.on_call})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAvailabilityFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  availabilityFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search doctor, disease, or symptom..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
              />
            </div>

            <select
              aria-label="Filter by specialty"
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-teal-600"
            >
              <option value="all">All Specialties</option>
              {specialties.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by Hassan hospital"
              value={hospitalFilter}
              onChange={(e) => setHospitalFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-teal-600 max-w-[210px]"
            >
              <option value="all">All Hassan Hospitals</option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.shortName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Doctors Grid */}
      {filteredDoctors.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <Stethoscope className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="font-display text-base font-semibold text-slate-900">
            No specialists match your current filters
          </p>
          <p className="text-xs text-slate-500">
            Reset the specialty or availability filter to inspect all 10 Hassan doctors.
          </p>
          <button
            type="button"
            onClick={() => {
              setAvailabilityFilter('all');
              setSpecialtyFilter('all');
              setHospitalFilter('all');
              setSearchQuery('');
            }}
            className="h-9 px-4 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredDoctors.map((doc) => {
            const status = STATUS_DISPLAY[doc.availabilityStatus];
            const openTodaySlots = doc.slots.filter(
              (s) => s.dayLabel === 'Today' && !s.isBooked
            );
            const openTomorrowSlots = doc.slots.filter(
              (s) => s.dayLabel === 'Tomorrow' && !s.isBooked
            );

            return (
              <div
                key={doc.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-4">
                  {/* Top Doctor Identity Row */}
                  <div className="flex items-start gap-4">
                    <img
                      src={doc.avatarUrl}
                      alt={doc.name}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-base font-bold text-slate-900 truncate">
                          {doc.name}
                        </h3>
                        <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums shrink-0">
                          ₹{doc.consultationFeeInr}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 truncate">
                        {doc.qualification} · {doc.experienceYears} yrs exp
                      </p>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className={`font-semibold ${status.colorClass}`}>{status.label}</span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-slate-700 font-medium">{doc.specialty}</span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          ★ {doc.rating.toFixed(1)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 flex items-center gap-1 pt-0.5 truncate">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {doc.hospitalName} — {doc.wingRoom}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Conditions Treated */}
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <span className="font-medium text-slate-800">Treats: </span>
                    {doc.treatedConditions.join(' · ')}
                  </p>

                  {/* Live Open Slots Preview */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-700 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-teal-700" />
                        <span>
                          {openTodaySlots.length > 0
                            ? `Today's Open Slots (${openTodaySlots.length})`
                            : `Tomorrow's Open Slots (${openTomorrowSlots.length})`}
                        </span>
                      </span>
                      <span className="text-slate-500 truncate">{doc.statusDetail}</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(openTodaySlots.length > 0 ? openTodaySlots : openTomorrowSlots)
                        .slice(0, 4)
                        .map((slot) => (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => onSelectDoctor(doc)}
                            className={`px-2.5 py-1.5 rounded-md border text-xs font-mono font-medium tabular-nums transition-colors whitespace-nowrap ${
                              slot.isEmergencySlot
                                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-teal-600 hover:text-teal-800'
                            }`}
                          >
                            {slot.timeLabel}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span>Desk Duty:</span>
                    <select
                      aria-label={`Update live status for ${doc.name}`}
                      value={doc.availabilityStatus}
                      onChange={(e) =>
                        onQuickStatusChange(doc.id, e.target.value as AvailabilityStatus)
                      }
                      className="h-7 px-2 rounded border border-slate-200 bg-white text-[11px] text-slate-700 focus:outline-none focus:border-teal-600"
                    >
                      <option value="available_now">Available Now</option>
                      <option value="upcoming_today">Upcoming Today</option>
                      <option value="on_call">On Call</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => onSelectDoctor(doc)}
                    className="h-9 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    <span>View Details &amp; Book Slot</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
