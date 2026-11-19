import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Building2,
  CalendarCheck,
  Car,
  Clock,
  LocateFixed,
  LogOut,
  Menu,
  MessageSquare,
  Navigation,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import { AiTriagePanel } from './components/AiTriagePanel';
import { AiVoiceChatPanel } from './components/AiVoiceChatPanel';
import { DoctorBookingDrawer } from './components/DoctorBookingDrawer';
import { DoctorsAvailabilityView } from './components/DoctorsAvailabilityView';
import { EmergencyCabPanel } from './components/EmergencyCabPanel';
import { HassanMapNavigator } from './components/HassanMapNavigator';
import { HospitalsDirectoryView } from './components/HospitalsDirectoryView';
import { LoginPage } from './components/LoginPage';
import { HASSAN_CENTER } from './data/hassanMedicalRoster';
import {
  apiCancelAppointment,
  apiGetAppointments,
  apiGetCabs,
  apiGetRoster,
  apiLogout,
  apiMe,
  apiUpdateDoctorStatus,
  buildGoogleMapsDirectionsUrl,
} from './lib/api';
import type {
  Appointment,
  AvailabilityStatus,
  CabBooking,
  Doctor,
  GeoPoint,
  Hospital,
  LocationTracePoint,
  RouteMetrics,
  UserProfile,
} from './types';

type DashboardTab = 'triage' | 'chat' | 'doctors' | 'hospitals' | 'cab' | 'bookings';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>('triage');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Real-time clinical data
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [cabBookings, setCabBookings] = useState<CabBooking[]>([]);
  const [syncedAt, setSyncedAt] = useState<string>(new Date().toISOString());
  const [refreshingRoster, setRefreshingRoster] = useState(false);

  // Location & Map routing state
  const [userLocation, setUserLocation] = useState<GeoPoint>(HASSAN_CENTER);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'live' | 'fallback'>('idle');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('hosp-hims');
  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics | null>(null);
  const [isTracing, setIsTracing] = useState(false);
  const [locationTrace, setLocationTrace] = useState<LocationTracePoint[]>([
    {
      lat: HASSAN_CENTER.lat,
      lng: HASSAN_CENTER.lng,
      label: HASSAN_CENTER.label,
      timestamp: new Date().toISOString(),
    },
  ]);
  const watchIdRef = useRef<number | null>(null);

  // Doctor Booking Drawer state
  const [drawerDoctorId, setDrawerDoctorId] = useState<string | null>(null);
  const [drawerSymptomContext, setDrawerSymptomContext] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  const loadRoster = useCallback(async (silent = false) => {
    if (!silent) setRefreshingRoster(true);
    try {
      const data = await apiGetRoster();
      setHospitals(data.hospitals);
      setDoctors(data.doctors);
      setSyncedAt(data.syncedAt);
    } catch (err) {
      console.error('Failed to sync clinical roster:', err);
    } finally {
      if (!silent) setRefreshingRoster(false);
    }
  }, []);

  const loadUserBookings = useCallback(async () => {
    try {
      const [aptRes, cabRes] = await Promise.all([apiGetAppointments(), apiGetCabs()]);
      setAppointments(aptRes.appointments);
      setCabBookings(cabRes.bookings);
    } catch (err) {
      console.error('Failed to load user bookings:', err);
    }
  }, []);

  // Restore session on mount
  useEffect(() => {
    let active = true;
    apiMe()
      .then((res) => {
        if (active) setUser(res.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setAuthChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Load live roster & bookings once signed in, plus 20s live sync polling
  useEffect(() => {
    if (!user) return;
    loadRoster();
    loadUserBookings();
    const timer = window.setInterval(() => {
      loadRoster(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [user, loadRoster, loadUserBookings]);

  const requestCurrentGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('fallback');
      showToast('Browser geolocation unavailable. Using Hassan City Center coordinates.');
      return;
    }
    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({
          lat,
          lng,
          label: 'Your Live GPS Location',
        });
        setLocationTrace((prev) => [
          ...prev.slice(-24),
          {
            lat,
            lng,
            accuracyMeters: Math.round(pos.coords.accuracy),
            label: 'Live GPS Fix',
            timestamp: new Date().toISOString(),
          },
        ]);
        setGpsStatus('live');
        showToast('Live GPS coordinates locked for Hassan route & cab ETA.');
      },
      () => {
        setUserLocation(HASSAN_CENTER);
        setGpsStatus('fallback');
        showToast('Location permission declined. Defaulting to Hassan City Center (BM Road).');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }, [showToast]);

  const toggleLiveTrace = useCallback(() => {
    if (isTracing) {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracing(false);
      showToast('Stopped continuous GPS location tracing.');
      return;
    }

    if (!('geolocation' in navigator)) {
      showToast('Browser geolocation unavailable for continuous tracing.');
      return;
    }

    setIsTracing(true);
    setGpsStatus('locating');
    showToast('Started continuous live GPS location trace in Hassan.');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({
          lat,
          lng,
          label: 'Live Traced GPS',
        });
        setGpsStatus('live');
        setLocationTrace((prev) => [
          ...prev.slice(-29),
          {
            lat,
            lng,
            accuracyMeters: Math.round(pos.coords.accuracy),
            label: 'Live Trace',
            timestamp: new Date().toISOString(),
          },
        ]);
      },
      () => {
        setIsTracing(false);
        setGpsStatus('fallback');
        showToast('Unable to watch live GPS. Using Hassan City Center coordinates.');
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 }
    );
  }, [isTracing, showToast]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const selectedHospital = useMemo(
    () => hospitals.find((h) => h.id === selectedHospitalId) || hospitals[0],
    [hospitals, selectedHospitalId]
  );

  const drawerDoctor = useMemo(
    () => doctors.find((d) => d.id === drawerDoctorId) || null,
    [doctors, drawerDoctorId]
  );

  const lastSyncedLabel = useMemo(() => {
    try {
      return new Date(syncedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return 'Just now';
    }
  }, [syncedAt]);

  const availableDoctorsNow = useMemo(
    () => doctors.filter((d) => d.availabilityStatus === 'available_now'),
    [doctors]
  );

  const totalOpenSlotsToday = useMemo(
    () =>
      doctors.reduce(
        (sum, doc) => sum + doc.slots.filter((s) => s.dayLabel === 'Today' && !s.isBooked).length,
        0
      ),
    [doctors]
  );

  const totalErBeds = useMemo(
    () => hospitals.reduce((sum, h) => sum + h.erBedsAvailable, 0),
    [hospitals]
  );

  const activeBookingsCount = useMemo(
    () =>
      appointments.filter((a) => a.status === 'confirmed').length +
      cabBookings.filter((c) => c.status !== 'completed' && c.status !== 'cancelled').length,
    [appointments, cabBookings]
  );

  async function handleSignOut() {
    await apiLogout();
    setUser(null);
    setAppointments([]);
    setCabBookings([]);
    setActiveTab('triage');
  }

  async function handleQuickDoctorStatus(doctorId: string, status: AvailabilityStatus) {
    try {
      const res = await apiUpdateDoctorStatus(doctorId, status);
      setDoctors((prev) => prev.map((d) => (d.id === doctorId ? res.doctor : d)));
      setSyncedAt(res.syncedAt);
      showToast(`Updated ${res.doctor.name} availability in real time.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update doctor status.');
    }
  }

  async function handleCancelAppointment(appointmentId: string) {
    try {
      const res = await apiCancelAppointment(appointmentId);
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? res.appointment : a))
      );
      if (res.doctor) {
        setDoctors((prev) => prev.map((d) => (d.id === res.doctor!.id ? res.doctor! : d)));
      }
      setSyncedAt(res.syncedAt);
      showToast('Appointment cancelled and slot released back to live schedule.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to cancel appointment.');
    }
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 text-sm">
          <Activity className="w-5 h-5 text-teal-700 animate-pulse" />
          <span>Loading MedPulse Hassan...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onAuthenticated={(loggedInUser) => setUser(loggedInUser)} />;
  }

  const navItems: { id: DashboardTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'triage', label: 'AI Triage & Command', icon: Sparkles },
    { id: 'chat', label: 'AI Chat & Voice', icon: MessageSquare },
    { id: 'doctors', label: 'Doctors & Live Slots', icon: Stethoscope, badge: availableDoctorsNow.length },
    { id: 'hospitals', label: 'Hassan Hospitals', icon: Building2, badge: hospitals.length },
    { id: 'cab', label: 'Emergency Cab & Map', icon: Car },
    { id: 'bookings', label: 'My Bookings', icon: CalendarCheck, badge: activeBookingsCount },
  ];

  const activeNavTitle = navItems.find((n) => n.id === activeTab)?.label || 'Command';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Left Sidebar (248px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            MedPulse Hassan
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full h-10 px-3 rounded-lg text-sm font-medium flex items-center justify-between gap-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-300' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Patient Profile & Emergency Helpline Footer */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="text-xs space-y-0.5">
            <p className="font-display font-semibold text-slate-900 truncate">{user.name}</p>
            <p className="text-slate-500 truncate">
              Blood Group <span className="font-mono font-semibold text-red-700">{user.bloodGroup}</span> ·{' '}
              <span className="font-mono">{user.phone}</span>
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="font-mono text-[11px] text-slate-500">Ambulance: 108</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs font-medium text-slate-600 hover:text-red-700 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white h-full shadow-xl flex flex-col">
            <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display text-base font-bold text-slate-900">
                MedPulse Hassan
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full h-11 px-3 rounded-lg text-sm font-medium flex items-center justify-between ${
                      active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="font-mono text-xs tabular-nums opacity-75">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-600 truncate">{user.name}</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs font-semibold text-red-600"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Contextual Top Bar (Single Row, Concise Breadcrumb + 1 Primary Action) */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="lg:hidden w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                Hassan District
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-bold text-slate-900 truncate">{activeNavTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={requestCurrentGps}
              className="hidden sm:inline-flex h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <LocateFixed className="w-3.5 h-3.5 text-teal-700" />
              <span>
                {gpsStatus === 'live'
                  ? 'Live GPS Active'
                  : gpsStatus === 'locating'
                  ? 'Locating...'
                  : 'Locate Me'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cab')}
              className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Car className="w-3.5 h-3.5" />
              <span>Book Emergency Cab</span>
            </button>
          </div>
        </header>

        {/* Feedback Toast */}
        {toastMessage && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4">
            <div
              role="status"
              className="max-w-7xl mx-auto rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-medium text-teal-900 flex items-center justify-between gap-4"
            >
              <span>{toastMessage}</span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="text-teal-700 hover:text-teal-900"
                aria-label="Dismiss message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main Scrollable Viewport */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* TAB 1: AI TRIAGE & COMMAND OVERVIEW */}
            {activeTab === 'triage' && (
              <>
                {/* Full-Width 4-Column Operational KPI Strip */}
                <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                  <div className="p-5">
                    <p className="text-xs text-slate-500">Doctors Available Now</p>
                    <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                      {availableDoctorsNow.length} / {doctors.length}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Active Hassan specialists</p>
                  </div>
                  <div className="p-5">
                    <p className="text-xs text-slate-500">Open Slots Today</p>
                    <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                      {totalOpenSlotsToday}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Instant online booking</p>
                  </div>
                  <div className="p-5">
                    <p className="text-xs text-slate-500">Emergency Beds Open</p>
                    <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                      {totalErBeds}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Across {hospitals.length} Hassan centers</p>
                  </div>
                  <div className="p-5">
                    <p className="text-xs text-slate-500">Roster Sync Clock</p>
                    <p className="font-mono text-2xl font-bold text-teal-700 tabular-nums mt-1">
                      {lastSyncedLabel}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Auto-refresh every 20s</p>
                  </div>
                </div>

                {/* Primary Focal Anchor: AI Disease & Emergency Triage Engine */}
                <AiTriagePanel
                  hospitals={hospitals}
                  doctors={doctors}
                  userLocation={userLocation}
                  onSelectDoctorToBook={(doc, symptomContext) => {
                    setDrawerSymptomContext(symptomContext);
                    setDrawerDoctorId(doc.id);
                  }}
                  onDispatchCabToHospital={(hospital) => {
                    setSelectedHospitalId(hospital.id);
                    setActiveTab('cab');
                  }}
                  onNavigateToHospital={(hospital) => {
                    setSelectedHospitalId(hospital.id);
                    setActiveTab('cab');
                  }}
                />

                {/* Live Doctors Available Right Now — Seamless Quick-Book Section */}
                <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        Doctors Available Right Now in Hassan
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Click any live time slot or specialist profile to lock an immediate
                        appointment token.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('doctors')}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap"
                    >
                      View all {doctors.length} specialists →
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {availableDoctorsNow.slice(0, 6).map((doc) => {
                      const nextOpenSlots = doc.slots
                        .filter((s) => s.dayLabel === 'Today' && !s.isBooked)
                        .slice(0, 3);
                      return (
                        <div
                          key={doc.id}
                          className="rounded-lg border border-slate-200 p-4 flex flex-col justify-between gap-3 hover:border-teal-600/50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <img
                              src={doc.avatarUrl}
                              alt={doc.name}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-display text-sm font-bold text-slate-900 truncate">
                                {doc.name}
                              </p>
                              <p className="text-xs text-slate-600 truncate">
                                {doc.specialty} · {doc.hospitalName}
                              </p>
                              <p className="text-xs font-semibold text-emerald-700 mt-1">
                                Available Now · ₹{doc.consultationFeeInr}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                            {nextOpenSlots.map((slot) => (
                              <button
                                key={slot.id}
                                type="button"
                                onClick={() => {
                                  setDrawerSymptomContext('');
                                  setDrawerDoctorId(doc.id);
                                }}
                                className={`px-2 py-1 rounded border text-[11px] font-mono font-medium tabular-nums transition-colors whitespace-nowrap ${
                                  slot.isEmergencySlot
                                    ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                    : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-teal-600'
                                }`}
                              >
                                {slot.timeLabel}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                setDrawerSymptomContext('');
                                setDrawerDoctorId(doc.id);
                              }}
                              className="ml-auto text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap"
                            >
                              Book →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Live Hassan Location & Hospital Route Navigator */}
                {selectedHospital && (
                  <HassanMapNavigator
                    userLocation={userLocation}
                    hospitals={hospitals}
                    selectedHospital={selectedHospital}
                    onSelectHospital={(h) => setSelectedHospitalId(h.id)}
                    onRouteComputed={setRouteMetrics}
                    onRequestGps={requestCurrentGps}
                    gpsStatus={gpsStatus}
                    locationTrace={locationTrace}
                    isTracing={isTracing}
                    onToggleTrace={toggleLiveTrace}
                  />
                )}
              </>
            )}

            {/* TAB 2: AI CHATBOT & VOICE RECOMMENDATION SYSTEM */}
            {activeTab === 'chat' && (
              <AiVoiceChatPanel
                hospitals={hospitals}
                doctors={doctors}
                userLocation={userLocation}
                onBookDoctor={(doc, symptomContext) => {
                  setDrawerSymptomContext(symptomContext);
                  setDrawerDoctorId(doc.id);
                }}
                onDispatchCab={(hospital) => {
                  setSelectedHospitalId(hospital.id);
                  setActiveTab('cab');
                }}
                onNavigateHospital={(hospital) => {
                  setSelectedHospitalId(hospital.id);
                  setActiveTab('cab');
                }}
              />
            )}

            {/* TAB 2: REAL-TIME DOCTORS & SLOT BOOKING */}
            {activeTab === 'doctors' && (
              <DoctorsAvailabilityView
                doctors={doctors}
                hospitals={hospitals}
                lastSyncedLabel={lastSyncedLabel}
                onRefreshRoster={() => loadRoster()}
                refreshing={refreshingRoster}
                onSelectDoctor={(doc) => {
                  setDrawerSymptomContext('');
                  setDrawerDoctorId(doc.id);
                }}
                onQuickStatusChange={handleQuickDoctorStatus}
              />
            )}

            {/* TAB 3: HASSAN HOSPITALS DIRECTORY */}
            {activeTab === 'hospitals' && (
              <HospitalsDirectoryView
                hospitals={hospitals}
                doctors={doctors}
                userLocation={userLocation}
                onDispatchCab={(hospital) => {
                  setSelectedHospitalId(hospital.id);
                  setActiveTab('cab');
                }}
                onNavigateHospital={(hospital) => {
                  setSelectedHospitalId(hospital.id);
                  setActiveTab('cab');
                }}
                onBookDoctor={(doc) => {
                  setDrawerSymptomContext('');
                  setDrawerDoctorId(doc.id);
                }}
              />
            )}

            {/* TAB 4: EMERGENCY CAB DISPATCH & LIVE DIRECTIONS */}
            {activeTab === 'cab' && selectedHospital && (
              <div className="space-y-6">
                <HassanMapNavigator
                  userLocation={userLocation}
                  hospitals={hospitals}
                  selectedHospital={selectedHospital}
                  onSelectHospital={(h) => setSelectedHospitalId(h.id)}
                  onRouteComputed={setRouteMetrics}
                  onRequestGps={requestCurrentGps}
                  gpsStatus={gpsStatus}
                  locationTrace={locationTrace}
                  isTracing={isTracing}
                  onToggleTrace={toggleLiveTrace}
                />

                <EmergencyCabPanel
                  user={user}
                  userLocation={userLocation}
                  hospitals={hospitals}
                  selectedHospital={selectedHospital}
                  onSelectHospital={(h) => setSelectedHospitalId(h.id)}
                  onSelectPickupLandmark={(pt) => {
                    setUserLocation(pt);
                    setGpsStatus('fallback');
                  }}
                  onRequestGps={requestCurrentGps}
                  gpsStatus={gpsStatus}
                  routeMetrics={routeMetrics}
                  bookings={cabBookings}
                  onBookingCreated={(booking) => {
                    setCabBookings((prev) => [booking, ...prev]);
                    showToast(
                      `${booking.vehicleCategory} (${booking.vehicleNumber}) dispatched to ${booking.hospitalName}.`
                    );
                  }}
                  onBookingUpdated={(updated) => {
                    setCabBookings((prev) =>
                      prev.map((b) => (b.id === updated.id ? updated : b))
                    );
                    showToast(`Dispatch ${updated.bookingCode} updated to ${updated.status.replace('_', ' ')}.`);
                  }}
                />
              </div>
            )}

            {/* TAB 5: MY APPOINTMENTS & DISPATCH PASSES */}
            {activeTab === 'bookings' && (
              <div className="space-y-6">
                {/* Doctor Appointments Table/List */}
                <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        Confirmed Doctor Appointments
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Present your confirmation code and token number at the hospital wing desk.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('doctors')}
                      className="h-9 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      Book New Slot
                    </button>
                  </div>

                  {appointments.length === 0 ? (
                    <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg space-y-2">
                      <CalendarCheck className="w-7 h-7 text-slate-400 mx-auto" />
                      <p className="text-sm font-semibold text-slate-800">
                        No doctor appointments booked yet
                      </p>
                      <p className="text-xs text-slate-500">
                        Browse live doctor schedules or run AI Triage to book an instant slot.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {appointments.map((apt) => {
                        const hosp = hospitals.find((h) => h.id === apt.hospitalId);
                        return (
                          <div
                            key={apt.id}
                            className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-mono font-bold text-slate-900">
                                  {apt.confirmationCode}
                                </span>
                                <span className="text-slate-300" aria-hidden="true">
                                  ·
                                </span>
                                <span className="font-mono font-semibold text-teal-700">
                                  Token {apt.tokenNumber}
                                </span>
                                <span className="text-slate-300" aria-hidden="true">
                                  ·
                                </span>
                                <span
                                  className={`font-semibold ${
                                    apt.status === 'confirmed'
                                      ? 'text-emerald-700'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {apt.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                                </span>
                              </div>

                              <p className="font-display text-sm font-bold text-slate-900">
                                {apt.doctorName} — {apt.doctorSpecialty}
                              </p>
                              <p className="text-xs text-slate-600">
                                {apt.hospitalName} ({apt.wingRoom})
                              </p>
                              <p className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 font-mono text-slate-800">
                                  <Clock className="w-3.5 h-3.5 text-teal-700" />
                                  {apt.dayLabel}, {apt.timeLabel}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{apt.consultationMode}</span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  Patient: {apt.patientName} ({apt.patientAge})
                                </span>
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {hosp && apt.status === 'confirmed' && (
                                <>
                                  <a
                                    href={buildGoogleMapsDirectionsUrl(
                                      userLocation,
                                      hosp.coordinates
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="h-8 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    <Navigation className="w-3.5 h-3.5 text-teal-700" />
                                    <span>Directions</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedHospitalId(hosp.id);
                                      setActiveTab('cab');
                                    }}
                                    className="h-8 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    <Car className="w-3.5 h-3.5" />
                                    <span>Book Cab</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelAppointment(apt.id)}
                                    className="h-8 px-3 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap"
                                  >
                                    Cancel Slot
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Emergency Cab Booking History */}
                <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        Emergency Cab &amp; Ambulance History
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        All KA-13 Hassan emergency vehicle bookings associated with your account.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('cab')}
                      className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      New Dispatch
                    </button>
                  </div>

                  {cabBookings.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                      No emergency cabs or ambulances booked yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2.5 pr-4 font-medium">Code</th>
                            <th className="py-2.5 pr-4 font-medium">Vehicle &amp; Plate</th>
                            <th className="py-2.5 pr-4 font-medium">Destination</th>
                            <th className="py-2.5 pr-4 font-medium">Driver</th>
                            <th className="py-2.5 pr-4 font-medium text-right">Distance</th>
                            <th className="py-2.5 pr-4 font-medium text-right">Fare</th>
                            <th className="py-2.5 font-medium text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {cabBookings.map((b) => (
                            <tr key={b.id} className="hover:bg-slate-50/80">
                              <td className="py-3 pr-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                                {b.bookingCode}
                              </td>
                              <td className="py-3 pr-4">
                                <p className="font-medium text-slate-900">{b.vehicleCategory}</p>
                                <p className="font-mono text-slate-500">{b.vehicleNumber}</p>
                              </td>
                              <td className="py-3 pr-4 text-slate-800">{b.hospitalName}</td>
                              <td className="py-3 pr-4">
                                <p className="text-slate-900">{b.driverName}</p>
                                <p className="font-mono text-slate-500">{b.driverPhone}</p>
                              </td>
                              <td className="py-3 pr-4 font-mono text-right tabular-nums text-slate-700 whitespace-nowrap">
                                {b.distanceKm.toFixed(1)} km
                              </td>
                              <td className="py-3 pr-4 font-mono text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                                ₹{b.estimatedFareInr}
                              </td>
                              <td className="py-3 text-right font-medium capitalize text-teal-700 whitespace-nowrap">
                                {b.status.replace('_', ' ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* Quiet Clinical Safety & Legal Footer */}
            <footer className="pt-6 pb-8 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
              <p>
                MedPulse Hassan — Clinical triage guidance, hospital finder, and transport
                coordination for Hassan District, Karnataka. In life-threatening emergencies, call{' '}
                <strong className="font-mono text-slate-700">108</strong> or{' '}
                <strong className="font-mono text-slate-700">112</strong> immediately.
              </p>
              <p className="shrink-0">
                Mapping &amp; directions subject to{' '}
                <a
                  href="https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-700"
                >
                  Google Maps Platform Terms
                </a>
                .
              </p>
            </footer>
          </div>
        </main>
      </div>

      {/* Integrated Doctor Profile & Live Slot Booking Drawer */}
      <DoctorBookingDrawer
        doctor={drawerDoctor}
        hospital={hospitals.find((h) => h.id === drawerDoctor?.hospitalId)}
        user={user}
        initialSymptomNote={drawerSymptomContext}
        lastSyncedLabel={lastSyncedLabel}
        onClose={() => setDrawerDoctorId(null)}
        onBooked={(appointment, updatedDoctor, newSyncedAt) => {
          setAppointments((prev) => [appointment, ...prev]);
          setDoctors((prev) =>
            prev.map((d) => (d.id === updatedDoctor.id ? updatedDoctor : d))
          );
          setSyncedAt(newSyncedAt);
          showToast(
            `Appointment confirmed (${appointment.confirmationCode}) with ${appointment.doctorName} at ${appointment.timeLabel}.`
          );
        }}
        onOpenCabForHospital={(hospitalId) => {
          setSelectedHospitalId(hospitalId);
          setActiveTab('cab');
        }}
        onNavigateToHospital={(hospitalId) => {
          setSelectedHospitalId(hospitalId);
          setActiveTab('cab');
        }}
      />
    </div>
  );
}
