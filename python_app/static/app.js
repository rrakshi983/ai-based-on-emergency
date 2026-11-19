// MedPulse Hassan — Vanilla JS Frontend for Python Flask Backend
const state = {
  user: null,
  authMode: 'signin',
  hospitals: [],
  doctors: [],
  landmarks: [],
  userLocation: { lat: 13.0072, lng: 76.0996, label: 'Hassan City Center, BM Road' },
  tracePoints: [],
  watchId: null,
  autoSpeak: true,
  chatHistory: [],
  map: null,
  mapLayerGroup: null,
  tracePolyline: null,
};

const $ = (id) => document.getElementById(id);

function showToast(msg) {
  const el = $('toast-bar');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), 4200);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'include',
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function speakText(text) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const lang = $('voice-lang') ? $('voice-lang').value : 'en-IN';
  utter.lang = lang === 'kn-IN' ? 'en-IN' : lang;
  utter.rate = 1.02;
  window.speechSynthesis.speak(utter);
}

function startSpeechRecognition(onResult) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    showToast('Speech Recognition requires Chrome or Edge browser.');
    return null;
  }
  const rec = new Ctor();
  rec.lang = $('voice-lang') ? $('voice-lang').value : 'en-IN';
  rec.interimResults = false;
  rec.onresult = (e) => {
    const transcript = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join(' ')
      .trim();
    if (transcript) onResult(transcript);
  };
  rec.onerror = () => showToast('Microphone permission denied or speech not detected.');
  rec.start();
  return rec;
}

// ---------------- AUTHENTICATION ----------------

function setAuthMode(mode) {
  state.authMode = mode;
  $('tab-signin').classList.toggle('active', mode === 'signin');
  $('tab-register').classList.toggle('active', mode === 'register');
  $('register-fields').classList.toggle('hidden', mode !== 'register');
  $('auth-title').textContent = mode === 'signin' ? 'Sign in to MedPulse Hassan' : 'Create Patient Profile';
  $('auth-submit-btn').textContent = mode === 'signin' ? 'Sign In to Dashboard' : 'Register & Enter Dashboard';
  $('auth-error').classList.add('hidden');
}

async function initAuth() {
  try {
    const res = await api('/api/auth/me');
    enterDashboard(res.user);
  } catch {
    $('auth-view').classList.remove('hidden');
    $('dashboard-view').classList.add('hidden');
  }
}

async function enterDashboard(user) {
  state.user = user;
  $('auth-view').classList.add('hidden');
  $('dashboard-view').classList.remove('hidden');
  $('user-summary').innerHTML = `<strong>${user.name}</strong><div class="tiny muted">Blood: ${user.blood_group} · ${user.phone}</div>`;
  $('veh-patient').value = user.name;
  $('veh-phone').value = user.phone;
  $('book-patient-name').value = user.name;
  $('book-patient-phone').value = user.phone;

  appendChatMessage(
    'ai',
    'Welcome to MedPulse Hassan AI Voice & Chat Assistant. Describe symptoms or tap Speak to get nearest Hassan hospital and live doctor recommendations.',
    'Welcome to MedPulse Hassan. Press speak and tell me your symptoms for immediate Hassan hospital recommendations.'
  );

  await refreshRoster();
  await refreshBookingsAndTraces();
}

// ---------------- ROSTER, NEAREST HOSPITALS & MAP ----------------

async function refreshRoster() {
  const { lat, lng } = state.userLocation;
  const data = await api(`/api/roster?lat=${lat}&lng=${lng}`);
  state.hospitals = data.hospitals;
  state.doctors = data.doctors;
  state.landmarks = data.landmarks;

  $('kpi-gps').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  $('kpi-gps-label').textContent = state.userLocation.label;
  if (state.hospitals.length) {
    const nearest = state.hospitals[0];
    $('kpi-nearest').textContent = nearest.shortName;
    $('kpi-nearest-meta').textContent = `${nearest.distanceKm} km · ${nearest.etaMinutes} min drive`;
  }
  const availNow = state.doctors.filter((d) => d.availabilityStatus === 'available_now').length;
  $('kpi-doctors').textContent = `${availNow} / ${state.doctors.length}`;
  const totalBeds = state.hospitals.reduce((acc, h) => acc + h.erBedsAvailable, 0);
  $('kpi-beds').textContent = String(totalBeds);

  renderLandmarksSelect();
  renderDoctors();
  renderHospitals();
  renderVehicleHospitalSelect();
  updateHassanMap();
}

function renderLandmarksSelect() {
  const sel = $('landmark-select');
  if (sel.options.length > 0) return;
  sel.innerHTML =
    `<option value="">Select Hassan Landmark...</option>` +
    state.landmarks
      .map((l, idx) => `<option value="${idx}">${l.label}</option>`)
      .join('');
}

function renderDoctors(filter = '') {
  const q = filter.trim().toLowerCase();
  const filtered = state.doctors.filter((d) => {
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      d.specialty.toLowerCase().includes(q) ||
      d.hospitalName.toLowerCase().includes(q) ||
      d.treatedConditions.some((c) => c.toLowerCase().includes(q))
    );
  });

  $('doctors-grid').innerHTML = filtered
    .map(
      (doc) => `
      <article class="item-card">
        <div>
          <div class="tiny mono ${doc.availabilityStatus === 'available_now' ? 'accent-green' : 'muted'}">
            ${doc.availabilityStatus === 'available_now' ? 'Available Now' : 'Upcoming Today'} · ₹${doc.consultationFeeInr}
          </div>
          <h3>${doc.name}</h3>
          <p class="muted">${doc.specialty} · ${doc.hospitalName}</p>
          <p class="tiny muted mt-12">Treats: ${doc.treatedConditions.join(', ')}</p>
        </div>
        <div class="slot-row">
          ${doc.slots
            .map(
              (s) => `
            <button
              type="button"
              class="slot-btn ${s.emergency ? 'emergency' : ''}"
              ${s.isBooked ? 'disabled' : ''}
              onclick="openBookingModal('${doc.id}', '${s.id}')"
            >${s.day === 'Tomorrow' ? 'Tmrw ' : ''}${s.time}</button>
          `
            )
            .join('')}
        </div>
      </article>
    `
    )
    .join('');
}

function renderHospitals() {
  $('hospitals-list').innerHTML = state.hospitals
    .map(
      (h) => `
      <article class="item-card">
        <div>
          <div class="tiny mono" style="color: var(--teal); font-weight: 600;">
            ${h.distanceKm} km · ${h.etaMinutes} min · ${h.traumaLevel}
          </div>
          <h3>${h.shortName}</h3>
          <p class="muted">${h.address}</p>
          <p class="tiny mono mt-12">ER Beds: ${h.erBedsAvailable} · ICU: ${h.icuBedsAvailable} · Desk: ${h.emergencyDesk}</p>
        </div>
        <div class="btn-group">
          <a
            class="btn btn-secondary"
            target="_blank"
            rel="noopener"
            href="https://www.google.com/maps/dir/?api=1&origin=${state.userLocation.lat},${state.userLocation.lng}&destination=${h.lat},${h.lng}&travelmode=driving"
          >Directions</a>
          <button type="button" class="btn btn-danger" onclick="jumpToVehicle('${h.id}')">Book Vehicle</button>
        </div>
      </article>
    `
    )
    .join('');
}

function renderVehicleHospitalSelect() {
  const sel = $('veh-hospital');
  const currentVal = sel.value;
  sel.innerHTML = state.hospitals
    .map((h) => `<option value="${h.id}">${h.shortName} (${h.distanceKm} km · ${h.etaMinutes} min)</option>`)
    .join('');
  if (currentVal) sel.value = currentVal;
}

// ---------------- LEAFLET HASSAN MAP & LIVE GPS TRACING ----------------

function updateHassanMap() {
  const mapEl = $('hassan-map');
  if (!mapEl || typeof L === 'undefined') return;

  if (!state.map) {
    state.map = L.map('hassan-map').setView([state.userLocation.lat, state.userLocation.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(state.map);
    state.mapLayerGroup = L.layerGroup().addTo(state.map);
  }

  state.mapLayerGroup.clearLayers();

  // Plot user GPS marker
  L.circleMarker([state.userLocation.lat, state.userLocation.lng], {
    radius: 8,
    fillColor: '#2563eb',
    color: '#ffffff',
    weight: 2,
    fillOpacity: 1,
  })
    .bindPopup(`<strong>Your Location</strong><br/>${state.userLocation.label}`)
    .addTo(state.mapLayerGroup);

  // Plot GPS trace breadcrumb polyline
  if (state.tracePoints.length > 1) {
    L.polyline(
      state.tracePoints.map((p) => [p.lat, p.lng]),
      { color: '#2563eb', weight: 3, dashArray: '5, 6' }
    ).addTo(state.mapLayerGroup);
  }

  // Plot Hassan hospitals
  state.hospitals.forEach((h, idx) => {
    L.circleMarker([h.lat, h.lng], {
      radius: idx === 0 ? 9 : 7,
      fillColor: idx === 0 ? '#dc2626' : '#0f766e',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0.95,
    })
      .bindPopup(
        `<strong>${h.shortName}</strong><br/>${h.distanceKm} km · ${h.etaMinutes} min<br/>ER Beds: ${h.erBedsAvailable}`
      )
      .addTo(state.mapLayerGroup);
  });

  state.map.setView([state.userLocation.lat, state.userLocation.lng], 14);
}

async function recordLocationTrace(lat, lng, accuracyMeters, label) {
  state.userLocation = { lat, lng, label };
  state.tracePoints.push({ lat, lng });
  $('veh-pickup-label').value = `${label} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

  try {
    await api('/api/location/trace', {
      method: 'POST',
      body: JSON.stringify({ lat, lng, accuracyMeters }),
    });
  } catch {
    // Ignore transient trace logging failure
  }
  await refreshRoster();
  await refreshBookingsAndTraces();
}

function toggleLiveGpsTrace() {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    $('gps-trace-btn').textContent = 'Start Live GPS Trace';
    showToast('Stopped live GPS location trace.');
    return;
  }

  if (!('geolocation' in navigator)) {
    showToast('Browser Geolocation not available. Use Hassan landmark selector.');
    return;
  }

  $('gps-trace-btn').textContent = 'Stop Live GPS Trace';
  showToast('Live GPS location tracing active in Hassan...');
  state.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      recordLocationTrace(
        pos.coords.latitude,
        pos.coords.longitude,
        Math.round(pos.coords.accuracy),
        'Live Traced GPS'
      );
    },
    () => {
      showToast('Location permission denied. Using Hassan City Center.');
      state.watchId = null;
      $('gps-trace-btn').textContent = 'Start Live GPS Trace';
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

// ---------------- BOOKING MODAL & VEHICLE DISPATCH ----------------

window.openBookingModal = function openBookingModal(doctorId, preselectedSlotId) {
  const doc = state.doctors.find((d) => d.id === doctorId);
  if (!doc) return;
  $('book-doc-id').value = doc.id;
  $('modal-doc-name').textContent = `Book ${doc.name}`;
  $('modal-doc-meta').textContent = `${doc.specialty} · ${doc.hospitalName} · Fee ₹${doc.consultationFeeInr}`;
  const openSlots = doc.slots.filter((s) => !s.isBooked);
  $('book-slot-id').innerHTML = openSlots
    .map((s) => `<option value="${s.id}">${s.day}, ${s.time}</option>`)
    .join('');
  if (preselectedSlotId) $('book-slot-id').value = preselectedSlotId;
  $('booking-modal').classList.remove('hidden');
};

window.jumpToVehicle = function jumpToVehicle(hospitalId) {
  switchView('vehicles');
  $('veh-hospital').value = hospitalId;
};

async function refreshBookingsAndTraces() {
  const [aptRes, vehRes, traceRes] = await Promise.all([
    api('/api/appointments'),
    api('/api/vehicles'),
    api('/api/location/trace'),
  ]);

  $('appointments-list').innerHTML = aptRes.appointments.length
    ? aptRes.appointments
        .map(
          (a) => `
      <div class="list-row">
        <div>
          <strong class="mono">${a.confirmation_code} · Token ${a.token_number}</strong>
          <div>${a.doctor_name} (${a.doctor_specialty}) — ${a.hospital_name}</div>
          <div class="tiny muted">${a.slot_label} · Status: ${a.status}</div>
        </div>
        ${
          a.status === 'confirmed'
            ? `<button type="button" class="btn btn-ghost" onclick="cancelApt('${a.id}')">Cancel</button>`
            : ''
        }
      </div>
    `
        )
        .join('')
    : '<p class="muted">No doctor appointments booked yet.</p>';

  $('vehicles-history').innerHTML = vehRes.bookings.length
    ? vehRes.bookings
        .map(
          (v) => `
      <div class="list-row">
        <div>
          <strong class="mono">${v.booking_code} · ${v.vehicle_category} (${v.vehicle_number})</strong>
          <div>To ${v.hospital_name} · Driver: ${v.driver_name} (${v.driver_phone})</div>
          <div class="tiny mono muted">${v.distance_km} km · ETA ${v.eta_minutes} min · Est. ₹${v.fare_inr}</div>
        </div>
        <strong class="accent-green">${v.status}</strong>
      </div>
    `
        )
        .join('')
    : '<p class="muted">No emergency vehicles dispatched yet.</p>';

  $('trace-log-list').innerHTML = traceRes.traces.length
    ? traceRes.traces
        .map(
          (t) => `
      <div class="list-row">
        <div class="mono tiny">${t.lat.toFixed(5)}, ${t.lng.toFixed(5)} · Nearest: ${t.nearest_hospital} (${t.distance_km} km)</div>
        <span class="tiny muted">${new Date(t.recorded_at).toLocaleTimeString()}</span>
      </div>
    `
        )
        .join('')
    : '<p class="muted">Start Live GPS Trace to log coordinates in Hassan.</p>';
}

window.cancelApt = async function cancelApt(aptId) {
  await api(`/api/appointments/${aptId}/cancel`, { method: 'PATCH' });
  showToast('Appointment cancelled and slot released.');
  await refreshRoster();
  await refreshBookingsAndTraces();
};

// ---------------- AI TRIAGE & AI CHATBOT + VOICE ----------------

function appendChatMessage(role, text, voiceScript = '', extras = {}) {
  const feed = $('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role === 'user' ? 'user' : 'ai'}`;

  let actionsHtml = '';
  if (role === 'ai') {
    const docButtons = (extras.suggestedDoctorIds || [])
      .map((id) => state.doctors.find((d) => d.id === id))
      .filter(Boolean)
      .map(
        (d) =>
          `<button type="button" class="btn btn-teal" style="height:32px;font-size:12px" onclick="openBookingModal('${d.id}')">Book ${d.name}</button>`
      )
      .join('');
    const hospButtons = (extras.suggestedHospitalIds || [])
      .map((id) => state.hospitals.find((h) => h.id === id))
      .filter(Boolean)
      .map(
        (h) =>
          `<button type="button" class="btn btn-danger" style="height:32px;font-size:12px" onclick="jumpToVehicle('${h.id}')">Cab to ${h.shortName}</button>`
      )
      .join('');
    if (docButtons || hospButtons) {
      actionsHtml = `<div class="btn-group mt-12">${docButtons}${hospButtons}</div>`;
    }
  }

  div.innerHTML = `
    <div class="chat-meta">
      <span>${role === 'user' ? 'You' : 'MedPulse Hassan AI'}</span>
      ${
        role === 'ai' && (voiceScript || text)
          ? `<button type="button" class="link-danger" style="color:var(--teal)" data-speak>Listen</button>`
          : ''
      }
    </div>
    <div>${text}</div>
    ${actionsHtml}
  `;

  const speakBtn = div.querySelector('[data-speak]');
  if (speakBtn) {
    speakBtn.addEventListener('click', () => speakText(voiceScript || text));
  }

  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

async function sendChat(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  appendChatMessage('user', trimmed);
  state.chatHistory.push({ role: 'user', text: trimmed });

  try {
    const { response } = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: trimmed,
        history: state.chatHistory.slice(-8),
        lat: state.userLocation.lat,
        lng: state.userLocation.lng,
      }),
    });
    state.chatHistory.push({ role: 'assistant', text: response.reply });
    appendChatMessage('ai', response.reply, response.voiceScript, response);
    if (state.autoSpeak && response.voiceScript) {
      speakText(response.voiceScript);
    }
  } catch (err) {
    appendChatMessage('ai', err.message);
  }
}

// ---------------- VIEW NAVIGATION & EVENT WIRING ----------------

function switchView(viewName) {
  document.querySelectorAll('.panel-view').forEach((el) => el.classList.add('hidden'));
  const target = $(`view-${viewName}`);
  if (target) target.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
    if (btn.dataset.view === viewName) $('topbar-title').textContent = btn.textContent;
  });
  if (viewName === 'hospitals') {
    setTimeout(() => {
      updateHassanMap();
      if (state.map) state.map.invalidateSize();
    }, 80);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('tab-signin').addEventListener('click', () => setAuthMode('signin'));
  $('tab-register').addEventListener('click', () => setAuthMode('register'));

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('auth-error').classList.add('hidden');
    try {
      const endpoint = state.authMode === 'signin' ? '/api/auth/login' : '/api/auth/register';
      const body =
        state.authMode === 'signin'
          ? { email: $('auth-email').value, password: $('auth-password').value }
          : {
              name: $('auth-name').value,
              email: $('auth-email').value,
              password: $('auth-password').value,
              phone: $('auth-phone').value,
              bloodGroup: $('auth-blood').value,
              emergencyContact: $('auth-emergency').value,
            };
      const res = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
      enterDashboard(res.user);
    } catch (err) {
      $('auth-error').textContent = err.message;
      $('auth-error').classList.remove('hidden');
    }
  });

  $('demo-login-btn').addEventListener('click', async () => {
    const res = await api('/api/auth/demo', { method: 'POST' });
    enterDashboard(res.user);
  });

  $('logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    location.reload();
  });

  $('side-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (btn) switchView(btn.dataset.view);
  });

  $('quick-cab-btn').addEventListener('click', () => switchView('vehicles'));
  $('gps-trace-btn').addEventListener('click', toggleLiveGpsTrace);

  $('locate-once-btn').addEventListener('click', () => {
    if (!('geolocation' in navigator)) return showToast('Geolocation unavailable.');
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        recordLocationTrace(
          pos.coords.latitude,
          pos.coords.longitude,
          Math.round(pos.coords.accuracy),
          'Current GPS'
        ),
      () => showToast('Permission denied. Using Hassan City Center.')
    );
  });

  $('landmark-select').addEventListener('change', (e) => {
    const idx = e.target.value;
    if (idx === '') return;
    const lm = state.landmarks[Number(idx)];
    if (lm) recordLocationTrace(lm.lat, lm.lng, 25, lm.label);
  });

  $('doctor-search').addEventListener('input', (e) => renderDoctors(e.target.value));

  // Triage form + Voice dictation
  document.querySelectorAll('.scenario-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('triage-query').value = btn.dataset.q;
      $('triage-form').requestSubmit();
    });
  });

  $('triage-voice-btn').addEventListener('click', () => {
    showToast('Listening... speak symptoms now.');
    startSpeechRecognition((spoken) => {
      $('triage-query').value = spoken;
      $('triage-form').requestSubmit();
    });
  });

  $('triage-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('triage-query').value.trim();
    const out = $('triage-result');
    out.classList.remove('hidden');
    out.innerHTML = '<p class="muted">Analyzing Hassan hospitals and live doctor availability...</p>';
    try {
      const { recommendation: r } = await api('/api/triage', {
        method: 'POST',
        body: JSON.stringify({
          query: q,
          lat: state.userLocation.lat,
          lng: state.userLocation.lng,
        }),
      });
      const docs = (r.recommendedDoctorIds || [])
        .map((id) => state.doctors.find((d) => d.id === id))
        .filter(Boolean);
      const hosps = (r.recommendedHospitalIds || [])
        .map((id) => state.hospitals.find((h) => h.id === id))
        .filter(Boolean);

      out.innerHTML = `
        <div class="row-between">
          <strong>${r.urgencyLevel} Priority · ${r.recommendedSpecialty}</strong>
          <button type="button" class="btn btn-secondary" id="speak-triage-btn">Speak Recommendation</button>
        </div>
        <p class="mt-12"><strong>${r.conditionSummary}</strong></p>
        <p class="muted mt-12">${r.clinicalReasoning}</p>
        <ol class="mt-12" style="padding-left:20px;font-size:0.86rem;">
          ${(r.immediateSteps || []).map((s) => `<li>${s}</li>`).join('')}
        </ol>
        <div class="btn-group mt-16">
          ${docs
            .map(
              (d) =>
                `<button type="button" class="btn btn-teal" onclick="openBookingModal('${d.id}')">Book ${d.name}</button>`
            )
            .join('')}
          ${hosps
            .map(
              (h) =>
                `<button type="button" class="btn btn-danger" onclick="jumpToVehicle('${h.id}')">Dispatch Cab to ${h.shortName}</button>`
            )
            .join('')}
        </div>
      `;
      $('speak-triage-btn').addEventListener('click', () =>
        speakText(r.voiceScript || r.conditionSummary)
      );
      if (state.autoSpeak && r.voiceScript) speakText(r.voiceScript);
    } catch (err) {
      out.innerHTML = `<div class="alert">${err.message}</div>`;
    }
  });

  // Chat & Voice controls
  $('toggle-autospeak').addEventListener('click', () => {
    state.autoSpeak = !state.autoSpeak;
    $('toggle-autospeak').textContent = state.autoSpeak ? 'Auto-Speak: ON' : 'Auto-Speak: OFF';
    if (!state.autoSpeak && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  });

  $('chat-mic-btn').addEventListener('click', () => {
    showToast('Listening for your voice question...');
    startSpeechRecognition((spoken) => sendChat(spoken));
  });

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = $('chat-input').value;
    $('chat-input').value = '';
    sendChat(val);
  });

  // Booking Modal submit
  $('modal-close-btn').addEventListener('click', () => $('booking-modal').classList.add('hidden'));
  $('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: $('book-doc-id').value,
          slotId: $('book-slot-id').value,
          patientName: $('book-patient-name').value,
          patientPhone: $('book-patient-phone').value,
          symptomsNote: $('book-symptoms').value,
        }),
      });
      $('booking-modal').classList.add('hidden');
      showToast(`Confirmed ${res.appointment.confirmation_code} (${res.appointment.token_number})!`);
      await refreshRoster();
      await refreshBookingsAndTraces();
    } catch (err) {
      showToast(err.message);
    }
  });

  // Vehicle Dispatch submit
  $('vehicle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { booking } = await api('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          hospitalId: $('veh-hospital').value,
          vehicleCategory: $('veh-category').value,
          patientName: $('veh-patient').value,
          patientPhone: $('veh-phone').value,
          pickupLabel: $('veh-pickup-label').value,
          pickupLat: state.userLocation.lat,
          pickupLng: state.userLocation.lng,
        }),
      });
      const box = $('vehicle-confirm');
      box.classList.remove('hidden');
      box.innerHTML = `
        <strong>Dispatched ${booking.vehicle_category} (${booking.vehicle_number})</strong>
        <p class="mt-12">Booking Code: <span class="mono">${booking.booking_code}</span> · Destination: ${booking.hospital_name}</p>
        <p class="muted">Driver: ${booking.driver_name} (${booking.driver_phone}) · ${booking.distance_km} km · ETA ${booking.eta_minutes} min · Est. ₹${booking.fare_inr}</p>
      `;
      showToast(`Vehicle ${booking.vehicle_number} dispatched to ${booking.hospital_name}.`);
      await refreshBookingsAndTraces();
    } catch (err) {
      showToast(err.message);
    }
  });

  initAuth();
});
