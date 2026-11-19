import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  Car,
  CheckCircle2,
  Mic,
  MicOff,
  Navigation,
  Search,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { apiRunTriage, estimateDrivingMinutes, estimateRoadDistanceKm } from '../lib/api';
import type {
  Doctor,
  GeoPoint,
  Hospital,
  TriageRecommendation,
} from '../types';

interface AiTriagePanelProps {
  hospitals: Hospital[];
  doctors: Doctor[];
  userLocation: GeoPoint;
  onSelectDoctorToBook: (doctor: Doctor, symptomContext: string) => void;
  onDispatchCabToHospital: (hospital: Hospital) => void;
  onNavigateToHospital: (hospital: Hospital) => void;
}

const CLINICAL_SCENARIOS = [
  {
    label: 'Chest Pain & Left Arm Tightness',
    query: 'Sudden crushing chest pain radiating to left arm with sweating and shortness of breath',
    severity: 'Critical',
  },
  {
    label: 'Sudden Slurred Speech / Stroke',
    query: 'Sudden facial droop, slurred speech, and weakness on right side of body started 30 minutes ago',
    severity: 'Critical',
  },
  {
    label: 'Road Accident Leg Fracture',
    query: 'Two-wheeler road accident near Hassan ring road with suspected compound leg fracture and bleeding',
    severity: 'Urgent',
  },
  {
    label: 'Child High Fever & Dengue Rash',
    query: '6-year-old child with 103.5F fever, severe lethargy, vomiting, and red spots on skin',
    severity: 'Urgent',
  },
  {
    label: 'Snakebite / Toxicology',
    query: 'Possible snakebite on ankle while working in estate outside Hassan, swelling increasing',
    severity: 'Critical',
  },
  {
    label: 'Severe Asthma / Low Oxygen',
    query: 'Severe wheezing, difficulty speaking full sentences, inhaler not relieving breathlessness',
    severity: 'Urgent',
  },
];

export function AiTriagePanel({
  hospitals,
  doctors,
  userLocation,
  onSelectDoctorToBook,
  onDispatchCabToHospital,
  onNavigateToHospital,
}: AiTriagePanelProps) {
  const [query, setQuery] = useState('');
  const [patientAge, setPatientAge] = useState('Adult (30–55)');
  const [severityHint, setSeverityHint] = useState('Urgent');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageRecommendation | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function stopVoiceReadout() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  function speakRecommendation(rec: TriageRecommendation) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const topHosp = hospitals.find((h) => h.id === rec.recommendedHospitalIds[0]);
    const topDoc = doctors.find((d) => d.id === rec.recommendedDoctorIds[0]);
    const script = [
      `${rec.urgencyLevel} priority triage. ${rec.conditionSummary}.`,
      topHosp ? `Recommended hospital in Hassan: ${topHosp.shortName}.` : '',
      topDoc ? `Recommended specialist: ${topDoc.name}, ${topDoc.specialty}.` : '',
      rec.immediateSteps.length ? `First step: ${rec.immediateSteps[0]}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.lang = 'en-IN';
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function handleVoiceDictate() {
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onstart: (() => void) | null;
        onend: (() => void) | null;
        onerror: ((e: { error: string }) => void) | null;
        onresult: ((e: { results: { [i: number]: { 0: { transcript: string } }; length: number } }) => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onstart: (() => void) | null;
        onend: (() => void) | null;
        onerror: ((e: { error: string }) => void) | null;
        onresult: ((e: { results: { [i: number]: { 0: { transcript: string } }; length: number } }) => void) | null;
        start: () => void;
        stop: () => void;
      };
    };
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Ctor) {
      setError('Voice dictation is not supported in this browser. Please type your symptoms.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    stopVoiceReadout();
    setError(null);
    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    let captured = '';
    rec.onstart = () => setListening(true);
    rec.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript + ' ';
      }
      captured = text.trim();
      if (captured) setQuery(captured);
    };
    rec.onerror = (event) => {
      setListening(false);
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Allow microphone access for voice triage.');
      }
    };
    rec.onend = () => {
      setListening(false);
      if (captured.length >= 3) {
        runAnalysis(captured, severityHint, true);
      }
    };
    recognitionRef.current = rec;
    rec.start();
  }

  async function runAnalysis(inputQuery: string, sev = severityHint, autoRead = false) {
    if (!inputQuery.trim()) return;
    stopVoiceReadout();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRunTriage({
        query: inputQuery,
        patientAge,
        severityHint: sev,
      });
      setResult(res.recommendation);
      if (autoRead) {
        speakRecommendation(res.recommendation);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete AI triage.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runAnalysis(query);
  }

  const matchedHospitals = (result?.recommendedHospitalIds || [])
    .map((id) => hospitals.find((h) => h.id === id))
    .filter((h): h is Hospital => Boolean(h));

  const matchedDoctors = (result?.recommendedDoctorIds || [])
    .map((id) => doctors.find((d) => d.id === id))
    .filter((d): d is Doctor => Boolean(d));

  return (
    <div className="space-y-6">
      {/* Primary Triage Input Console */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              AI Disease &amp; Emergency Triage for Hassan
            </h2>
            <p className="text-sm text-slate-600">
              Describe the disease, injury, or symptoms to match the exact specialist department,
              nearest equipped Hassan hospital, and currently available doctor slot.
            </p>
          </div>
          <span className="font-mono text-xs text-red-700 font-semibold whitespace-nowrap">
            Life-Threatening? Dial 108 Immediately
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="triage-input" className="block text-xs font-semibold text-slate-700">
              Condition, Disease, or Symptoms
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <textarea
                id="triage-input"
                rows={2}
                required
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Example: Sudden severe chest pressure, sweating, or high fever with persistent vomiting..."
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1">
                <label htmlFor="triage-age" className="block text-xs font-medium text-slate-600">
                  Age Group
                </label>
                <select
                  id="triage-age"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-teal-600"
                >
                  <option>Infant / Child (0–12)</option>
                  <option>Youth (13–29)</option>
                  <option>Adult (30–55)</option>
                  <option>Senior (56+)</option>
                  <option>Pregnant Patient</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">Reported Urgency</label>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['Standard', 'Urgent', 'Critical'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setSeverityHint(tier)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        severityHint === tier
                          ? tier === 'Critical'
                            ? 'bg-red-600 text-white'
                            : 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleVoiceDictate}
                disabled={loading}
                className={`h-10 px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  listening
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                }`}
              >
                {listening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4 text-red-600" />
                )}
                <span>{listening ? 'Listening...' : 'Voice Input'}</span>
              </button>

              <button
                type="submit"
                disabled={loading || query.trim().length < 3}
                className="h-10 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors inline-flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
              >
                <span>{loading ? 'Analyzing Clinical Roster...' : 'Recommend Hospital & Doctor'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>

        {/* Quick Clinical Scenarios */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <p className="text-xs font-medium text-slate-500">Quick Emergency Scenarios in Hassan</p>
          <div className="flex flex-wrap gap-2">
            {CLINICAL_SCENARIOS.map((sc) => (
              <button
                key={sc.label}
                type="button"
                disabled={loading}
                onClick={() => {
                  setQuery(sc.query);
                  setSeverityHint(sc.severity);
                  runAnalysis(sc.query, sc.severity);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800"
          >
            {error}
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 animate-pulse">
          <div className="h-5 w-64 bg-slate-200 rounded" />
          <div className="h-4 w-full max-w-2xl bg-slate-100 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="h-32 bg-slate-100 rounded-lg" />
            <div className="h-32 bg-slate-100 rounded-lg" />
          </div>
        </div>
      )}

      {/* Structured AI Triage Recommendation Output */}
      {!loading && result && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Urgency Header Strip */}
          <div
            className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 ${
              result.urgencyLevel === 'Critical'
                ? 'bg-red-50 border-red-200'
                : result.urgencyLevel === 'Urgent'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-teal-50 border-teal-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {result.urgencyLevel === 'Critical' ? (
                <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
              ) : result.urgencyLevel === 'Urgent' ? (
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span
                    className={
                      result.urgencyLevel === 'Critical'
                        ? 'text-red-800'
                        : result.urgencyLevel === 'Urgent'
                        ? 'text-amber-800'
                        : 'text-teal-800'
                    }
                  >
                    Triage Level: {result.urgencyLevel}
                  </span>
                  <span className="text-slate-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-slate-800">
                    Department: {result.recommendedSpecialty}
                  </span>
                  <span className="text-slate-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-slate-700">
                    Suggested Transport: {result.recommendedVehicleType}
                  </span>
                </div>
                <p className="font-display text-base font-bold text-slate-900 mt-1">
                  {result.conditionSummary}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => (speaking ? stopVoiceReadout() : speakRecommendation(result))}
              className="h-9 px-3.5 rounded-lg border border-slate-300/80 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              {speaking ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-red-600" />
                  <span>Stop Voice</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-teal-700" />
                  <span>Voice Recommendation</span>
                </>
              )}
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Clinical Rationale + Pre-Arrival Steps */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6 border-b border-slate-200">
              <div className="lg:col-span-6 space-y-2">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Routing Rationale
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {result.clinicalReasoning}
                </p>
                <p className="text-xs text-slate-500 pt-1">{result.disclaimer}</p>
              </div>

              <div className="lg:col-span-6 space-y-2">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Immediate Pre-Arrival Steps
                </h3>
                <ol className="space-y-1.5 text-sm text-slate-700 list-decimal list-inside">
                  {result.immediateSteps.map((step, i) => (
                    <li key={i} className="leading-snug">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Matched Specialist Doctors (Real-Time Availability & Direct Slot Booking) */}
            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Recommended Hassan Specialists (Live Availability)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchedDoctors.map((doc) => {
                  const openToday = doc.slots.filter(
                    (s) => s.dayLabel === 'Today' && !s.isBooked
                  ).length;
                  return (
                    <div
                      key={doc.id}
                      className="rounded-lg border border-slate-200 p-4 flex flex-col justify-between gap-4 hover:border-teal-600/50 transition-colors"
                    >
                      <div className="flex items-start gap-3.5">
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
                          <div className="flex flex-wrap items-center gap-2 text-xs mt-1.5">
                            <span
                              className={`font-semibold ${
                                doc.availabilityStatus === 'available_now'
                                  ? 'text-emerald-700'
                                  : doc.availabilityStatus === 'upcoming_today'
                                  ? 'text-amber-700'
                                  : 'text-slate-600'
                              }`}
                            >
                              {doc.nextAvailableLabel}
                            </span>
                            <span className="text-slate-300" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono text-slate-600 tabular-nums">
                              {openToday} open today
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                        <span className="font-mono text-xs text-slate-600 tabular-nums">
                          Fee ₹{doc.consultationFeeInr} · {doc.wingRoom.split('·')[0]}
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectDoctorToBook(doc, query)}
                          className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <CalendarCheck className="w-3.5 h-3.5" />
                          <span>Book Live Slot</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Matched Hassan Hospitals */}
            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Recommended Equipped Hospitals in Hassan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchedHospitals.map((hosp) => {
                  const distKm = estimateRoadDistanceKm(userLocation, hosp.coordinates);
                  const eta = estimateDrivingMinutes(distKm);
                  return (
                    <div
                      key={hosp.id}
                      className="rounded-lg border border-slate-200 p-4 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-display text-sm font-bold text-slate-900">
                            {hosp.shortName}
                          </p>
                          <span className="font-mono text-xs font-semibold text-teal-700 tabular-nums whitespace-nowrap">
                            {distKm.toFixed(1)} km · {eta} min
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{hosp.address}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-2 font-mono tabular-nums">
                          <span>ER Beds: {hosp.erBedsAvailable}</span>
                          <span aria-hidden="true">·</span>
                          <span>ICU: {hosp.icuBedsAvailable}</span>
                          <span aria-hidden="true">·</span>
                          <span>{hosp.traumaLevel}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => onDispatchCabToHospital(hosp)}
                          className="h-9 px-3.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <Car className="w-3.5 h-3.5" />
                          <span>Dispatch Cab</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigateToHospital(hosp)}
                          className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <Navigation className="w-3.5 h-3.5 text-teal-700" />
                          <span>View Route</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
