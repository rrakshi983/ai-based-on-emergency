import React, { useMemo, useState } from 'react';
import {
  Building2,
  CalendarCheck,
  Car,
  Navigation,
  Phone,
  Search,
} from 'lucide-react';
import { estimateDrivingMinutes, estimateRoadDistanceKm } from '../lib/api';
import type { Doctor, GeoPoint, Hospital } from '../types';

interface HospitalsDirectoryViewProps {
  hospitals: Hospital[];
  doctors: Doctor[];
  userLocation: GeoPoint;
  onDispatchCab: (hospital: Hospital) => void;
  onNavigateHospital: (hospital: Hospital) => void;
  onBookDoctor: (doctor: Doctor) => void;
}

export function HospitalsDirectoryView({
  hospitals,
  doctors,
  userLocation,
  onDispatchCab,
  onNavigateHospital,
  onBookDoctor,
}: HospitalsDirectoryViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return hospitals
      .filter((h) => {
        if (categoryFilter !== 'all' && h.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          h.name.toLowerCase().includes(q) ||
          h.area.toLowerCase().includes(q) ||
          h.specialties.some((s) => s.toLowerCase().includes(q)) ||
          h.diseasesTreated.some((d) => d.toLowerCase().includes(q))
        );
      })
      .sort(
        (a, b) =>
          estimateRoadDistanceKm(userLocation, a.coordinates) -
          estimateRoadDistanceKm(userLocation, b.coordinates)
      );
  }, [hospitals, categoryFilter, searchQuery, userLocation]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Hassan District Emergency Hospitals
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Sorted by live road distance from{' '}
              <span className="font-medium text-slate-800">
                {userLocation.label || 'your current GPS location'}
              </span>
              .
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hospital, disease, or area..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto w-fit max-w-full">
          {(
            [
              'all',
              'Government Tertiary',
              'Multi-Specialty',
              'Cardiac & Trauma',
              'Maternal & Pediatric',
            ] as const
          ).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                categoryFilter === cat
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat === 'all' ? 'All Centers' : cat}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((hospital) => {
          const distKm = estimateRoadDistanceKm(userLocation, hospital.coordinates);
          const etaMins = estimateDrivingMinutes(distKm);
          const staff = doctors.filter((d) => d.hospitalId === hospital.id);

          return (
            <div
              key={hospital.id}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-teal-700">{hospital.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{hospital.traumaLevel} Trauma Care</span>
                    <span aria-hidden="true">·</span>
                    <span>24×7 Emergency Active</span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{hospital.name}</span>
                  </h3>
                  <p className="text-xs text-slate-600">{hospital.address}</p>
                  <p className="text-xs text-slate-500 font-mono">
                    Emergency Desk: {hospital.emergencyDesk} · Reception: {hospital.phone}
                  </p>
                </div>

                {/* Live Capacity Numbers */}
                <div className="grid grid-cols-4 gap-4 lg:gap-6 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                  <div>
                    <p className="text-[11px] text-slate-500">Distance</p>
                    <p className="font-mono text-sm font-bold text-teal-700 tabular-nums">
                      {distKm.toFixed(1)} km
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                      ~{etaMins} min
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">ER Beds</p>
                    <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {hospital.erBedsAvailable}
                    </p>
                    <p className="text-[11px] text-emerald-700">Open</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">ICU / Vent</p>
                    <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {hospital.icuBedsAvailable} / {hospital.ventilatorsReady}
                    </p>
                    <p className="text-[11px] text-slate-500">Ready</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">ER Wait</p>
                    <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {hospital.avgWaitMins} min
                    </p>
                    <p className="text-[11px] text-slate-500">Average</p>
                  </div>
                </div>
              </div>

              {/* Clinical Coverage & Cashless Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-xs">
                <div>
                  <p className="font-semibold text-slate-800 mb-1">
                    Primary Emergencies &amp; Diseases Treated
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    {hospital.diseasesTreated.join(' · ')}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 mb-1">
                    Departments &amp; Accepted Cashless Panels
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    {hospital.specialties.join(' · ')}
                  </p>
                  <p className="text-slate-500 mt-1">
                    Insurance: {hospital.cashlessInsurance.join(', ')}
                  </p>
                </div>
              </div>

              {/* On-Site Specialists Roster */}
              {staff.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-semibold text-slate-800">
                    Specialists Available at {hospital.shortName}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {staff.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50/60"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {doc.name}
                          </p>
                          <p className="text-[11px] text-slate-600 truncate">
                            {doc.specialty} ·{' '}
                            <span
                              className={
                                doc.availabilityStatus === 'available_now'
                                  ? 'text-emerald-700 font-medium'
                                  : 'text-amber-700 font-medium'
                              }
                            >
                              {doc.nextAvailableLabel}
                            </span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onBookDoctor(doc)}
                          className="h-8 px-3 rounded-md bg-white border border-slate-200 hover:border-teal-600 hover:text-teal-800 text-xs font-semibold text-slate-800 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                        >
                          <CalendarCheck className="w-3.5 h-3.5 text-teal-700" />
                          <span>Book</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onDispatchCab(hospital)}
                  className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Car className="w-3.5 h-3.5" />
                  <span>Book Emergency Cab Here</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateHospital(hospital)}
                  className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Navigation className="w-3.5 h-3.5 text-teal-700" />
                  <span>Live Map &amp; Directions</span>
                </button>

                <a
                  href={`tel:${hospital.emergencyDesk.replace(/\s+/g, '')}`}
                  className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  <span>Call Emergency Desk</span>
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
