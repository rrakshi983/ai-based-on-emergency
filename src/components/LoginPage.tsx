import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { apiDemoLogin, apiLogin, apiRegister } from '../lib/api';
import type { UserProfile } from '../types';

interface LoginPageProps {
  onAuthenticated: (user: UserProfile) => void;
}

const HERO_IMAGE = '/src/assets/images/login_medical_center_1795098674956.jpg';

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('patient@hassan.care');
  const [password, setPassword] = useState('hassan123');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+91 ');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        const res = await apiLogin({ email, password });
        onAuthenticated(res.user);
      } else {
        const res = await apiRegister({
          name,
          email,
          password,
          phone,
          bloodGroup,
          emergencyContact,
        });
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoAccess() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiDemoLogin();
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start demo session.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 grid grid-cols-1 lg:grid-cols-12 items-stretch">
      {/* Left Architectural Editorial Column */}
      <div className="relative lg:col-span-6 xl:col-span-7 min-h-[340px] lg:min-h-screen overflow-hidden bg-slate-900">
        {!imgFailed ? (
          <img
            src={HERO_IMAGE}
            alt="Regional Emergency Hospital entrance in Hassan, Karnataka"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-teal-950 via-slate-900 to-slate-950 flex items-center justify-center">
            <Activity className="w-16 h-16 text-teal-400/50" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/20" />

        <div className="absolute inset-0 flex flex-col justify-between p-8 sm:p-12 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
                MedPulse Hassan
              </span>
            </div>
            <span className="text-xs font-mono text-slate-200 tracking-wide whitespace-nowrap">
              Karnataka Emergency: 108 · 112
            </span>
          </div>

          <div className="max-w-xl space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-medium text-teal-300 tracking-wide">
                Hassan District Emergency Medical Coordination
              </p>
              <h1
                className="font-display text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight leading-tight text-white"
                style={{ textWrap: 'balance' }}
              >
                Right hospital, live doctor slot, and fastest route in minutes.
              </h1>
              <p className="text-sm sm:text-base text-slate-200 leading-relaxed max-w-lg">
                AI clinical triage matches reported conditions to specialized hospitals across
                Hassan, verifies real-time doctor availability, books instant appointment tokens,
                and dispatches priority emergency transport from your live location.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/15">
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-white">06</p>
                <p className="text-xs text-slate-300 mt-0.5">24×7 Hassan Hospitals</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-white">10</p>
                <p className="text-xs text-slate-300 mt-0.5">Live Specialist Rosters</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-white">KA-13</p>
                <p className="text-xs text-slate-300 mt-0.5">GPS Cab &amp; ICU Dispatch</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Column */}
      <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-center px-6 py-10 sm:px-12 xl:px-16 bg-white">
        <div className="w-full max-w-md mx-auto space-y-8">
          <div className="space-y-2">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              {mode === 'signin' ? 'Sign in to dispatch console' : 'Create patient profile'}
            </h2>
            <p className="text-sm text-slate-600">
              {mode === 'signin'
                ? 'Access AI symptom triage, real-time Hassan doctor schedules, and emergency cab booking.'
                : 'Save your blood group and emergency contact for faster hospital admissions.'}
            </p>
          </div>

          {/* Segmented Mode Control */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'signin'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label htmlFor="auth-name" className="block text-xs font-medium text-slate-700">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rakshith Gowda"
                    className="w-full h-11 pl-10 pr-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full h-11 pl-10 pr-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full h-11 pl-10 pr-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-phone"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Mobile Number
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98450 00000"
                        className="w-full h-11 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-blood"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Blood Group
                    </label>
                    <select
                      id="auth-blood"
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    >
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-emergency"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Emergency Family Contact (Optional)
                  </label>
                  <input
                    id="auth-emergency"
                    type="tel"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="+91 98450 61299"
                    className="w-full h-11 px-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 whitespace-nowrap"
            >
              <span>
                {loading
                  ? 'Verifying...'
                  : mode === 'signin'
                  ? 'Sign In to Dashboard'
                  : 'Register & Enter Dashboard'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200" />
            <span className="px-3 text-xs text-slate-500">or immediate emergency access</span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleDemoAccess}
            className="w-full h-11 px-5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Continue with Hassan Demo Patient Profile</span>
          </button>

          <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
            Demo credentials pre-filled:{' '}
            <span className="font-mono text-slate-700">patient@hassan.care</span> ·{' '}
            <span className="font-mono text-slate-700">hassan123</span>. For critical
            life-threatening emergencies, always call Karnataka ambulance helpline{' '}
            <span className="font-mono font-semibold text-slate-700">108</span> directly.
          </div>
        </div>
      </div>
    </div>
  );
}
