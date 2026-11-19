import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  Car,
  MessageSquare,
  Mic,
  MicOff,
  Navigation,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  apiSendChatMessage,
  estimateDrivingMinutes,
  estimateRoadDistanceKm,
} from '../lib/api';
import type {
  ChatMessageItem,
  Doctor,
  GeoPoint,
  Hospital,
} from '../types';

interface AiVoiceChatPanelProps {
  hospitals: Hospital[];
  doctors: Doctor[];
  userLocation: GeoPoint;
  onBookDoctor: (doctor: Doctor, symptomContext: string) => void;
  onDispatchCab: (hospital: Hospital) => void;
  onNavigateHospital: (hospital: Hospital) => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

const STARTER_PROMPTS = [
  'Sudden chest tightness near BM Road Hassan — which hospital and doctor are open now?',
  'My 6-year-old child has high fever and vomiting near Vidyanagar Hassan',
  'Two-wheeler accident on Hassan Ring Road with leg injury — need trauma doctor and cab',
  'Which neurologist is available right now in Hassan for sudden dizziness and slurred speech?',
];

export function AiVoiceChatPanel({
  hospitals,
  doctors,
  userLocation,
  onBookDoctor,
  onDispatchCab,
  onNavigateHospital,
}: AiVoiceChatPanelProps) {
  const nearestHospital = useMemo(() => {
    if (!hospitals.length) return null;
    return [...hospitals].sort(
      (a, b) =>
        estimateRoadDistanceKm(userLocation, a.coordinates) -
        estimateRoadDistanceKm(userLocation, b.coordinates)
    )[0];
  }, [hospitals, userLocation]);

  const [messages, setMessages] = useState<ChatMessageItem[]>(() => [
    {
      id: 'welcome-hassan',
      role: 'assistant',
      timestamp: new Date().toISOString(),
      text: 'Welcome to MedPulse Hassan AI Voice & Chat Triage. Type or press the microphone to describe any disease, injury, or emergency symptom. I will match your live Hassan location to the nearest equipped hospital, check real-time doctor availability, and read out immediate guidance.',
      voiceScript:
        'Welcome to MedPulse Hassan emergency assistant. Press the microphone and describe your symptoms for immediate hospital and doctor recommendations in Hassan.',
      urgencyLevel: 'Standard',
      followUpQuestions: [
        'Find the nearest hospital from my location',
        'Show doctors available right now in Hassan',
        'I need an emergency ambulance for chest pain',
      ],
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice Recognition & Speech Synthesis state
  const [speechSupported] = useState<boolean>(() => Boolean(getSpeechRecognitionCtor()));
  const [ttsSupported] = useState<boolean>(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window
  );
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceLang, setVoiceLang] = useState<'en-IN' | 'kn-IN' | 'en-US'>('en-IN');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
  }

  function speakText(text: string, messageId: string) {
    if (!ttsSupported || !text.trim()) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceLang === 'kn-IN' ? 'en-IN' : voiceLang;
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeakingMessageId(messageId);
    utterance.onend = () => setSpeakingMessageId((curr) => (curr === messageId ? null : curr));
    utterance.onerror = () => setSpeakingMessageId((curr) => (curr === messageId ? null : curr));

    window.speechSynthesis.speak(utterance);
  }

  async function sendMessage(rawText: string, mode: 'text' | 'voice' = 'text') {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;

    stopSpeaking();
    setError(null);
    setInputText('');
    setInterimTranscript('');

    const userMsg: ChatMessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
      inputMode: mode,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setSending(true);

    try {
      const historyPayload = nextMessages
        .filter((m) => m.id !== 'welcome-hassan')
        .slice(-8)
        .map((m) => ({ role: m.role, text: m.text }));

      const { response } = await apiSendChatMessage({
        message: trimmed,
        history: historyPayload,
        userLocation,
        voiceMode: mode === 'voice',
      });

      const assistantId = `ai-${Date.now()}`;
      const aiMsg: ChatMessageItem = {
        id: assistantId,
        role: 'assistant',
        text: response.reply,
        timestamp: new Date().toISOString(),
        voiceScript: response.voiceScript,
        urgencyLevel: response.urgencyLevel,
        suggestedHospitalIds: response.suggestedHospitalIds,
        suggestedDoctorIds: response.suggestedDoctorIds,
        suggestedVehicleCategory: response.suggestedVehicleCategory,
        followUpQuestions: response.followUpQuestions,
      };

      setMessages((prev) => [...prev, aiMsg]);

      if (autoSpeak && response.voiceScript) {
        speakText(response.voiceScript, assistantId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach AI Healthcare Assistant.');
    } finally {
      setSending(false);
    }
  }

  function toggleVoiceListening() {
    if (!speechSupported) {
      setError(
        'Voice input is not supported in this browser. Please use Chrome or Edge, or type your symptoms below.'
      );
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    stopSpeaking();
    setError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = voiceLang;
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalCaptured = '';

    recognition.onstart = () => {
      setListening(true);
      setInterimTranscript('');
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalCaptured += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript((finalCaptured + interim).trim());
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Please allow microphone access to use Voice Triage.');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Voice recognition error: ${event.error}. Please try again or type below.`);
      }
    };

    recognition.onend = () => {
      setListening(false);
      const spoken = finalCaptured.trim();
      if (spoken.length >= 2) {
        sendMessage(spoken, 'voice');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function handleResetConversation() {
    stopSpeaking();
    setError(null);
    setMessages([
      {
        id: 'welcome-hassan',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        text: 'Conversation reset. Tell me your symptoms or press the microphone for live Hassan hospital, doctor, and ambulance recommendations.',
        voiceScript:
          'Conversation reset. Please describe your symptoms for Hassan hospital and doctor recommendations.',
        urgencyLevel: 'Standard',
        followUpQuestions: [
          'Find the nearest hospital from my location',
          'Show doctors available right now in Hassan',
          'I need an emergency ambulance for chest pain',
        ],
      },
    ]);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Main Conversational AI + Voice Workspace */}
      <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden min-h-[640px]">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              AI Medical Chatbot &amp; Voice Recommendation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Grounded in live Hassan hospitals ({hospitals.length}) · Live doctor slots · GPS:{' '}
              <span className="font-mono text-slate-700 tabular-nums">
                {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Voice language"
              value={voiceLang}
              onChange={(e) => setVoiceLang(e.target.value as 'en-IN' | 'kn-IN' | 'en-US')}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:border-teal-600"
            >
              <option value="en-IN">Voice: English (IN)</option>
              <option value="kn-IN">Voice: Kannada (IN)</option>
              <option value="en-US">Voice: English (US)</option>
            </select>

            <button
              type="button"
              onClick={() => {
                if (autoSpeak) stopSpeaking();
                setAutoSpeak((v) => !v);
              }}
              className={`h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                autoSpeak
                  ? 'border-teal-600 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {autoSpeak ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{autoSpeak ? 'Auto-Speak On' : 'Voice Muted'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetConversation}
              title="Reset conversation"
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 inline-flex items-center justify-center"
              aria-label="Reset conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[520px] bg-slate-50/40">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const suggestedHospitals = (msg.suggestedHospitalIds || [])
              .map((id) => hospitals.find((h) => h.id === id))
              .filter((h): h is Hospital => Boolean(h));
            const suggestedDoctors = (msg.suggestedDoctorIds || [])
              .map((id) => doctors.find((d) => d.id === id))
              .filter((d): d is Doctor => Boolean(d));
            const isSpeakingThis = speakingMessageId === msg.id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[82%] rounded-xl px-4 py-3.5 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  {/* Metadata Line */}
                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 text-[11px] mb-1.5 ${
                      isUser ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    <span className="font-medium">
                      {isUser
                        ? msg.inputMode === 'voice'
                          ? 'You · Voice Input'
                          : 'You'
                        : 'MedPulse Hassan AI'}
                      {!isUser && msg.urgencyLevel && (
                        <>
                          {' · '}
                          <span
                            className={
                              msg.urgencyLevel === 'Critical'
                                ? 'text-red-700 font-semibold'
                                : msg.urgencyLevel === 'Urgent'
                                ? 'text-amber-700 font-semibold'
                                : 'text-teal-700 font-semibold'
                            }
                          >
                            {msg.urgencyLevel} Priority
                          </span>
                        </>
                      )}
                    </span>

                    {!isUser && ttsSupported && (msg.voiceScript || msg.text) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isSpeakingThis) {
                            stopSpeaking();
                          } else {
                            speakText(msg.voiceScript || msg.text, msg.id);
                          }
                        }}
                        className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 font-medium whitespace-nowrap"
                      >
                        {isSpeakingThis ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5" />
                            <span>Stop Voice</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>Listen</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* Recommended Hassan Doctors inside Chat */}
                  {!isUser && suggestedDoctors.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-2">
                      <p className="text-xs font-semibold text-slate-700">
                        Recommended Hassan Specialists
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {suggestedDoctors.map((doc) => (
                          <div
                            key={doc.id}
                            className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 flex flex-col justify-between gap-2"
                          >
                            <div>
                              <p className="font-display text-xs font-bold text-slate-900">
                                {doc.name}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                {doc.specialty} · {doc.hospitalName}
                              </p>
                              <p className="text-[11px] font-medium text-emerald-700 mt-0.5">
                                {doc.nextAvailableLabel}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onBookDoctor(doc, msg.text)}
                              className="h-8 px-3 rounded-md bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                            >
                              <CalendarCheck className="w-3.5 h-3.5" />
                              <span>Book Live Slot</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended Hassan Hospitals inside Chat */}
                  {!isUser && suggestedHospitals.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                      <p className="text-xs font-semibold text-slate-700">
                        Nearest Equipped Hassan Hospitals
                      </p>
                      <div className="space-y-2">
                        {suggestedHospitals.map((hosp) => {
                          const distKm = estimateRoadDistanceKm(userLocation, hosp.coordinates);
                          const eta = estimateDrivingMinutes(distKm);
                          return (
                            <div
                              key={hosp.id}
                              className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="font-display text-xs font-bold text-slate-900">
                                  {hosp.shortName}
                                </p>
                                <p className="text-[11px] text-slate-600 font-mono tabular-nums">
                                  {distKm.toFixed(1)} km · {eta} min drive · ER Beds:{' '}
                                  {hosp.erBedsAvailable} · ICU: {hosp.icuBedsAvailable}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => onNavigateHospital(hosp)}
                                  className="h-8 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Navigation className="w-3.5 h-3.5 text-teal-700" />
                                  <span>Route</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDispatchCab(hosp)}
                                  className="h-8 px-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Car className="w-3.5 h-3.5" />
                                  <span>Book Vehicle</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Interactive Follow-Up Suggestions */}
                  {!isUser && msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                      {msg.followUpQuestions.map((q) => (
                        <button
                          key={q}
                          type="button"
                          disabled={sending}
                          onClick={() => sendMessage(q, 'text')}
                          className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs text-slate-700 transition-colors text-left"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex items-start">
              <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-xs text-slate-600">
                Checking Hassan hospital beds, distances, and live specialist schedules...
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Voice Listening Live Transcript Banner */}
        {listening && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200 flex items-center justify-between gap-3">
            <div className="text-xs text-red-900 min-w-0">
              <span className="font-semibold">Listening ({voiceLang}): </span>
              <span className="text-red-700">
                {interimTranscript || 'Speak your symptoms, disease, or emergency in Hassan...'}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleVoiceListening}
              className="h-8 px-3 rounded-md bg-red-600 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Stop &amp; Send
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mx-6 my-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
          >
            {error}
          </div>
        )}

        {/* Chat & Voice Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(inputText, 'text');
          }}
          className="p-4 border-t border-slate-200 bg-white flex items-center gap-2.5"
        >
          <button
            type="button"
            onClick={toggleVoiceListening}
            disabled={sending}
            aria-label={listening ? 'Stop voice recording' : 'Start voice recommendation input'}
            className={`h-11 px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              listening
                ? 'bg-red-600 border-red-600 text-white'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
            }`}
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-red-600" />}
            <span className="hidden sm:inline">{listening ? 'Listening...' : 'Speak'}</span>
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask about a disease, nearest Hassan hospital, or speak using the mic..."
            className="flex-1 h-11 px-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />

          <button
            type="submit"
            disabled={sending || inputText.trim().length < 2}
            className="h-11 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
        </form>
      </section>

      {/* Right Side Panel: Voice Triage Quick Starters & Nearest Hassan Hospital Card */}
      <aside className="lg:col-span-4 space-y-5">
        {/* Hands-Free Voice Console Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-red-600" />
            <h3 className="font-display text-sm font-bold text-slate-900">
              Hands-Free Voice Triage
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            In urgent situations, tap below and speak naturally in English or Kannada. MedPulse
            transcribes your symptoms, identifies the best Hassan hospital and available specialist,
            and reads out first-aid directions aloud.
          </p>
          <button
            type="button"
            onClick={toggleVoiceListening}
            disabled={sending}
            className={`w-full h-11 px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
              listening
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-teal-700 hover:bg-teal-800 text-white'
            }`}
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{listening ? 'Stop Listening' : 'Start Voice Consultation'}</span>
          </button>
          <p className="text-[11px] text-slate-500">
            Voice Speech API: {speechSupported ? 'Ready' : 'Type Mode'} · Spoken Audio:{' '}
            {ttsSupported ? (autoSpeak ? 'Active' : 'Muted') : 'Unavailable'}
          </p>
        </div>

        {/* Nearest Hassan Hospital Live Card */}
        {nearestHospital && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-teal-700">Nearest Hospital to Your GPS</p>
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                {nearestHospital.name}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">{nearestHospital.area}</p>
            </div>
            <div className="flex items-center justify-between text-xs font-mono tabular-nums pt-2 border-t border-slate-100">
              <span className="text-slate-700">
                {estimateRoadDistanceKm(userLocation, nearestHospital.coordinates).toFixed(1)} km ·{' '}
                {estimateDrivingMinutes(
                  estimateRoadDistanceKm(userLocation, nearestHospital.coordinates)
                )}{' '}
                min
              </span>
              <span className="text-emerald-700 font-semibold">
                {nearestHospital.erBedsAvailable} ER beds open
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onNavigateHospital(nearestHospital)}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Navigation className="w-3.5 h-3.5 text-teal-700" />
                <span>Trace Route</span>
              </button>
              <button
                type="button"
                onClick={() => onDispatchCab(nearestHospital)}
                className="h-9 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Car className="w-3.5 h-3.5" />
                <span>Book Cab</span>
              </button>
            </div>
          </div>
        )}

        {/* Sample Hassan Emergency Queries */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-teal-700" />
            <h3 className="font-display text-sm font-bold text-slate-900">
              Quick Clinical Prompts
            </h3>
          </div>
          <div className="space-y-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={sending}
                onClick={() => sendMessage(prompt, 'text')}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs text-slate-700 leading-snug transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
