import React, { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  ExternalLink,
  LocateFixed,
  Navigation,
  Route as RouteIcon,
} from 'lucide-react';
import {
  buildGoogleMapsDirectionsUrl,
  estimateDrivingMinutes,
  estimateRoadDistanceKm,
} from '../lib/api';
import type { GeoPoint, Hospital, LocationTracePoint, RouteMetrics } from '../types';

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

interface HassanMapNavigatorProps {
  userLocation: GeoPoint;
  hospitals: Hospital[];
  selectedHospital: Hospital;
  onSelectHospital: (hospital: Hospital) => void;
  onRouteComputed?: (metrics: RouteMetrics) => void;
  onRequestGps: () => void;
  gpsStatus: 'idle' | 'locating' | 'live' | 'fallback';
  locationTrace?: LocationTracePoint[];
  isTracing?: boolean;
  onToggleTrace?: () => void;
}

interface RouteOverlayProps {
  origin: GeoPoint;
  destination: GeoPoint;
  onRouteComputed?: (metrics: RouteMetrics) => void;
}

interface MapsPolylineHandle {
  setOptions: (options: { strokeColor?: string; strokeOpacity?: number; strokeWeight?: number }) => void;
  setMap: (map: unknown) => void;
}

function ModernRoutesOverlay({ origin, destination, onRouteComputed }: RouteOverlayProps) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<MapsPolylineHandle[]>([]);

  useEffect(() => {
    if (!map || !routesLib || !origin || !destination) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    let cancelled = false;
    const request = {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
    };

    const RouteClass = (routesLib as unknown as {
      Route?: {
        computeRoutes: (req: unknown) => Promise<{
          routes?: Array<{
            distanceMeters?: number;
            durationMillis?: number;
            viewport?: unknown;
            createPolylines: () => MapsPolylineHandle[];
            legs?: Array<{
              steps?: Array<{ navigationInstruction?: { instructions?: string } }>;
            }>;
          }>;
        }>;
      };
    }).Route;

    if (!RouteClass?.computeRoutes) {
      return;
    }

    RouteClass.computeRoutes(request)
      .then(({ routes }) => {
        if (cancelled || !routes || routes.length === 0) return;
        const primaryRoute = routes[0];
        const newPolylines = primaryRoute.createPolylines();
        newPolylines.forEach((polyline) => {
          polyline.setOptions({
            strokeColor: '#0F766E',
            strokeOpacity: 0.92,
            strokeWeight: 5,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport, 60);
        }

        const distKm = Number(((primaryRoute.distanceMeters ?? 0) / 1000).toFixed(2));
        const durMins = Math.max(1, Math.round((primaryRoute.durationMillis ?? 0) / 60000));
        const steps = (primaryRoute.legs?.[0]?.steps || [])
          .map((s) => s.navigationInstruction?.instructions)
          .filter((text): text is string => Boolean(text))
          .slice(0, 6);

        onRouteComputed?.({
          distanceKm: distKm,
          durationMins: durMins,
          distanceText: `${distKm.toFixed(1)} km`,
          durationText: `${durMins} min`,
          source: 'google-routes',
          steps,
        });
      })
      .catch((err) => {
        console.error('Google Maps Routes API computation fallback:', err);
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, origin.lat, origin.lng, destination.lat, destination.lng, onRouteComputed]);

  return null;
}

function HospitalAdvancedMarker({
  hospital,
  selected,
  onSelect,
}: {
  hospital: Hospital;
  selected: boolean;
  onSelect: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: hospital.coordinates.lat, lng: hospital.coordinates.lng }}
        title={hospital.name}
        onClick={onSelect}
        zIndex={selected ? 50 : 10}
      >
        <Pin
          background={selected ? '#DC2626' : '#0F766E'}
          borderColor={selected ? '#991B1B' : '#115E59'}
          glyphColor="#FFFFFF"
          scale={selected ? 1.25 : 1}
        />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={onSelect}>
          <div className="p-1 text-slate-900">
            <p className="font-display font-semibold text-xs leading-snug">{hospital.shortName}</p>
            <p className="text-[11px] text-slate-600 mt-0.5">{hospital.area}</p>
            <p className="font-mono text-[11px] text-teal-700 mt-1">
              ER Beds: {hospital.erBedsAvailable} · ICU: {hospital.icuBedsAvailable}
            </p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

/**
 * Interactive Hassan Coordinate Map fallback used cleanly whenever VITE_GOOGLE_MAPS_API_KEY
 * is not provisioned yet, while preserving exact lat/lng plotting, clickable hospitals,
 * route geometry, and direct turn-by-turn Google Maps navigation.
 */
function HassanVectorCoordinateMap({
  userLocation,
  hospitals,
  selectedHospital,
  onSelectHospital,
  locationTrace = [],
}: {
  userLocation: GeoPoint;
  hospitals: Hospital[];
  selectedHospital: Hospital;
  onSelectHospital: (hospital: Hospital) => void;
  locationTrace?: LocationTracePoint[];
}) {
  const allPoints = [
    userLocation,
    ...locationTrace,
    ...hospitals.map((h) => h.coordinates),
  ];
  const minLat = Math.min(...allPoints.map((p) => p.lat)) - 0.0055;
  const maxLat = Math.max(...allPoints.map((p) => p.lat)) + 0.0055;
  const minLng = Math.min(...allPoints.map((p) => p.lng)) - 0.0075;
  const maxLng = Math.max(...allPoints.map((p) => p.lng)) + 0.0075;

  const project = (pt: GeoPoint) => {
    const xPct = ((pt.lng - minLng) / Math.max(0.001, maxLng - minLng)) * 84 + 8;
    const yPct = (1 - (pt.lat - minLat) / Math.max(0.001, maxLat - minLat)) * 78 + 11;
    return { x: xPct, y: yPct };
  };

  const originPos = project(userLocation);
  const destPos = project(selectedHospital.coordinates);
  const traceCoords = locationTrace.map((pt) => project(pt));

  // Midpoint slight bend representing Hassan road corridor routing
  const midX = (originPos.x + destPos.x) / 2 + (originPos.y > destPos.y ? 4 : -4);
  const midY = (originPos.y + destPos.y) / 2 - 3;

  return (
    <div className="relative w-full h-full bg-[#EEF3F6] overflow-hidden select-none">
      {/* Subtle Geographic Coordinate Grid & Hassan Arterial Corridors */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      >
        {/* Grid lines */}
        {[20, 40, 60, 80].map((v) => (
          <g key={v}>
            <line x1={v} y1={0} x2={v} y2={100} stroke="#CBD5E1" strokeWidth="0.2" />
            <line x1={0} y1={v} x2={100} y2={v} stroke="#CBD5E1" strokeWidth="0.2" />
          </g>
        ))}

        {/* Major Hassan Road Corridors (NH-75 / BM Road, Salagame Road, Ring Road) */}
        <path
          d="M 0 64 Q 32 56, 54 52 T 100 44"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.4"
        />
        <path
          d="M 48 0 Q 51 35, 53 52 L 56 100"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.9"
        />
        <path
          d="M 14 22 Q 48 16, 86 28 Q 92 60, 80 86 Q 48 92, 18 82 Q 8 54, 14 22"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          opacity="0.85"
        />

        {/* Live GPS Location Trace Breadcrumb Trail */}
        {traceCoords.length > 1 && (
          <polyline
            points={traceCoords.map((c) => `${c.x},${c.y}`).join(' ')}
            fill="none"
            stroke="#2563EB"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.75"
          />
        )}

        {/* Active Emergency Route Path */}
        <path
          d={`M ${originPos.x} ${originPos.y} Q ${midX} ${midY}, ${destPos.x} ${destPos.y}`}
          fill="none"
          stroke="#0F766E"
          strokeWidth="1.2"
          strokeDasharray="2.2 1.4"
          strokeLinecap="round"
        />
        <path
          d={`M ${originPos.x} ${originPos.y} Q ${midX} ${midY}, ${destPos.x} ${destPos.y}`}
          fill="none"
          stroke="#0F766E"
          strokeWidth="2.8"
          opacity="0.14"
        />
      </svg>

      {/* Road Labels */}
      <span className="absolute left-4 bottom-12 text-[10px] font-mono text-slate-500 tracking-wide">
        BM Road · NH-75 Corridor
      </span>
      <span className="absolute left-1/2 top-3 -translate-x-1/2 text-[10px] font-mono text-slate-500 tracking-wide">
        Salagame Road · Vidyanagar
      </span>

      {/* User Current Location Marker */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
        style={{ left: `${originPos.x}%`, top: `${originPos.y}%` }}
      >
        <div className="relative flex flex-col items-center">
          <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md" />
          <span className="mt-1 px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-medium whitespace-nowrap shadow-xs">
            You · {userLocation.label ? userLocation.label.split(',')[0] : 'Current GPS'}
          </span>
        </div>
      </div>

      {/* Hospital Markers */}
      {hospitals.map((hospital) => {
        const pos = project(hospital.coordinates);
        const isSelected = hospital.id === selectedHospital.id;
        return (
          <button
            key={hospital.id}
            type="button"
            onClick={() => onSelectHospital(hospital)}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded-lg ${
              isSelected ? 'z-30 scale-105' : 'z-10 hover:scale-105'
            }`}
            aria-label={`Select ${hospital.shortName}`}
          >
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-display font-bold text-xs shadow-md border-2 border-white ${
                  isSelected ? 'bg-red-600' : 'bg-teal-700'
                }`}
              >
                H
              </div>
              <span
                className={`mt-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap shadow-xs border ${
                  isSelected
                    ? 'bg-red-600 text-white border-red-700'
                    : 'bg-white/95 text-slate-800 border-slate-200'
                }`}
              >
                {hospital.shortName}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function HassanMapNavigator({
  userLocation,
  hospitals,
  selectedHospital,
  onSelectHospital,
  onRouteComputed,
  onRequestGps,
  gpsStatus,
  locationTrace = [],
  isTracing = false,
  onToggleTrace,
}: HassanMapNavigatorProps) {
  const [liveRoute, setLiveRoute] = useState<RouteMetrics | null>(null);

  const fallbackDistanceKm = estimateRoadDistanceKm(userLocation, selectedHospital.coordinates);
  const fallbackMins = estimateDrivingMinutes(fallbackDistanceKm);

  const activeRoute: RouteMetrics = liveRoute || {
    distanceKm: fallbackDistanceKm,
    durationMins: fallbackMins,
    distanceText: `${fallbackDistanceKm.toFixed(1)} km`,
    durationText: `${fallbackMins} min`,
    source: 'haversine-estimate',
    steps: [
      `Start from ${userLocation.label || 'your current Hassan location'}`,
      `Merge toward Hassan City / BM Road emergency corridor`,
      `Continue toward ${selectedHospital.area}`,
      `Arrive at ${selectedHospital.shortName} Emergency Entrance`,
    ],
  };

  useEffect(() => {
    // Reset Google route state whenever origin/destination changes so fallback immediately updates
    setLiveRoute(null);
    onRouteComputed?.({
      distanceKm: fallbackDistanceKm,
      durationMins: fallbackMins,
      distanceText: `${fallbackDistanceKm.toFixed(1)} km`,
      durationText: `${fallbackMins} min`,
      source: 'haversine-estimate',
    });
  }, [
    userLocation.lat,
    userLocation.lng,
    selectedHospital.id,
    fallbackDistanceKm,
    fallbackMins,
  ]);

  const handleGoogleRoute = (metrics: RouteMetrics) => {
    setLiveRoute(metrics);
    onRouteComputed?.(metrics);
  };

  const directionsUrl = buildGoogleMapsDirectionsUrl(userLocation, selectedHospital.coordinates);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Map Header Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Compass className="w-3.5 h-3.5 text-teal-700 shrink-0" />
            <span className="truncate">
              From: <strong className="font-medium text-slate-800">{userLocation.label || 'Current GPS'}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
            </span>
          </div>
          <p className="font-display text-sm font-semibold text-slate-900 mt-0.5 truncate">
            Route to {selectedHospital.shortName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onToggleTrace && (
            <button
              type="button"
              onClick={onToggleTrace}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isTracing
                  ? 'border-blue-600 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>
                {isTracing
                  ? `Tracing Live (${locationTrace.length})`
                  : 'Live GPS Trace'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onRequestGps}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <LocateFixed className="w-3.5 h-3.5 text-teal-700" />
            <span>
              {gpsStatus === 'locating'
                ? 'Locating...'
                : gpsStatus === 'live'
                ? 'Refresh GPS'
                : 'Locate Me'}
            </span>
          </button>

          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Turn-by-Turn Directions</span>
            <ExternalLink className="w-3 h-3 opacity-80" />
          </a>
        </div>
      </div>

      {/* Map Viewport (Explicit height prevents 0x0 collapse) */}
      <div className="relative w-full h-[380px] sm:h-[430px]">
        {GOOGLE_MAPS_API_KEY ? (
          <APIProvider
            apiKey={GOOGLE_MAPS_API_KEY}
            libraries={['marker', 'routes']}
            language="en"
            region="IN"
          >
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultCenter={{ lat: userLocation.lat, lng: userLocation.lng }}
              defaultZoom={14}
              gestureHandling="greedy"
              streetViewControl={false}
              mapTypeControl={false}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <AdvancedMarker
                position={{ lat: userLocation.lat, lng: userLocation.lng }}
                title="Your Current Location"
                zIndex={40}
              >
                <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md" />
              </AdvancedMarker>

              {hospitals.map((hospital) => (
                <HospitalAdvancedMarker
                  key={hospital.id}
                  hospital={hospital}
                  selected={hospital.id === selectedHospital.id}
                  onSelect={() => onSelectHospital(hospital)}
                />
              ))}

              <ModernRoutesOverlay
                origin={userLocation}
                destination={selectedHospital.coordinates}
                onRouteComputed={handleGoogleRoute}
              />
            </GoogleMap>
          </APIProvider>
        ) : (
          <HassanVectorCoordinateMap
            userLocation={userLocation}
            hospitals={hospitals}
            selectedHospital={selectedHospital}
            onSelectHospital={onSelectHospital}
            locationTrace={locationTrace}
          />
        )}
      </div>

      {/* Live Route Telemetry & Steps Strip */}
      <div className="px-5 py-4 bg-slate-50/70 border-t border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        <div className="md:col-span-4 flex items-center gap-6">
          <div>
            <p className="text-xs text-slate-500">Driving Distance</p>
            <p className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {activeRoute.distanceText}
            </p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div>
            <p className="text-xs text-slate-500">Est. Drive Time</p>
            <p className="font-mono text-lg font-semibold text-teal-700 tabular-nums">
              {activeRoute.durationText}
            </p>
          </div>
        </div>

        <div className="md:col-span-8">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
            <RouteIcon className="w-3.5 h-3.5 text-teal-700" />
            <span>Route Guidance Summary</span>
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 list-decimal list-inside">
            {(activeRoute.steps || []).slice(0, 4).map((step, idx) => (
              <li key={idx} className="truncate">
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
