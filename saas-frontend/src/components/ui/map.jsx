// ── mapcn map.tsx ported to JSX (no TypeScript, no shadcn) ────
// Source: https://github.com/AnmolSaini16/mapcn
// Shadcn CSS variables replaced with Tailwind dark-theme equivalents.
// Lucide icons replaced with inline SVGs.

import MapLibreGL from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  createContext, forwardRef, useCallback, useContext, useEffect,
  useId, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';

// ── Helpers ────────────────────────────────────────────────────

const cn = (...classes) => classes.filter(Boolean).join(' ');

const defaultStyles = {
  dark:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

function getDocumentTheme() {
  if (typeof document === 'undefined') return null;
  if (document.documentElement.classList.contains('dark'))  return 'dark';
  if (document.documentElement.classList.contains('light')) return 'light';
  return null;
}

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function useResolvedTheme(themeProp) {
  const [detectedTheme, setDetectedTheme] = useState(
    () => getDocumentTheme() ?? getSystemTheme(),
  );

  useEffect(() => {
    if (themeProp) return;
    const observer = new MutationObserver(() => {
      const t = getDocumentTheme();
      if (t) setDetectedTheme(t);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (!getDocumentTheme()) setDetectedTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handleChange);
    return () => { observer.disconnect(); mq.removeEventListener('change', handleChange); };
  }, [themeProp]);

  return themeProp ?? detectedTheme;
}

// ── Context ────────────────────────────────────────────────────

const MapContext = createContext(null);

export function useMap() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMap must be used within a Map component');
  return ctx;
}

// ── Loader ─────────────────────────────────────────────────────

function DefaultLoader() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
      <div className="flex gap-1">
        <span className="size-1.5 animate-pulse rounded-full bg-gray-400/60" />
        <span className="size-1.5 animate-pulse rounded-full bg-gray-400/60 [animation-delay:150ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-gray-400/60 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function getViewport(map) {
  const center = map.getCenter();
  return { center: [center.lng, center.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
}

// ── Map ────────────────────────────────────────────────────────

export const Map = forwardRef(function Map(
  { children, className, theme: themeProp, styles, projection, viewport, onViewportChange, loading = false, ...props },
  ref,
) {
  const containerRef            = useRef(null);
  const [mapInstance, setMap]   = useState(null);
  const [isLoaded,    setLoaded] = useState(false);
  const [isStyleLoaded, setStyleLoaded] = useState(false);
  const currentStyleRef   = useRef(null);
  const styleTimeoutRef   = useRef(null);
  const internalUpdateRef = useRef(false);
  const resolvedTheme     = useResolvedTheme(themeProp);
  const isControlled      = viewport !== undefined && onViewportChange !== undefined;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const mapStyles = useMemo(() => ({
    dark:  styles?.dark  ?? defaultStyles.dark,
    light: styles?.light ?? defaultStyles.light,
  }), [styles]);

  useImperativeHandle(ref, () => mapInstance, [mapInstance]);

  const clearStyleTimeout = useCallback(() => {
    if (styleTimeoutRef.current) { clearTimeout(styleTimeoutRef.current); styleTimeoutRef.current = null; }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const initialStyle = resolvedTheme === 'dark' ? mapStyles.dark : mapStyles.light;
    currentStyleRef.current = initialStyle;

    const map = new MapLibreGL.Map({
      container: containerRef.current,
      style: initialStyle,
      renderWorldCopies: false,
      attributionControl: { compact: true },
      ...props,
      ...viewport,
    });

    const styleDataHandler = () => {
      clearStyleTimeout();
      styleTimeoutRef.current = setTimeout(() => {
        setStyleLoaded(true);
        if (projection) map.setProjection(projection);
      }, 100);
    };
    const loadHandler = () => setLoaded(true);
    const handleMove  = () => { if (!internalUpdateRef.current) onViewportChangeRef.current?.(getViewport(map)); };

    map.on('load', loadHandler);
    map.on('styledata', styleDataHandler);
    map.on('move', handleMove);
    setMap(map);

    return () => {
      clearStyleTimeout();
      map.off('load', loadHandler);
      map.off('styledata', styleDataHandler);
      map.off('move', handleMove);
      map.remove();
      setLoaded(false); setStyleLoaded(false); setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapInstance || !isControlled || !viewport || mapInstance.isMoving()) return;
    const current = getViewport(mapInstance);
    const next = {
      center:  viewport.center  ?? current.center,
      zoom:    viewport.zoom    ?? current.zoom,
      bearing: viewport.bearing ?? current.bearing,
      pitch:   viewport.pitch   ?? current.pitch,
    };
    if (next.center[0] === current.center[0] && next.center[1] === current.center[1] &&
        next.zoom === current.zoom && next.bearing === current.bearing && next.pitch === current.pitch) return;
    internalUpdateRef.current = true;
    mapInstance.jumpTo(next);
    internalUpdateRef.current = false;
  }, [mapInstance, isControlled, viewport]);

  useEffect(() => {
    if (!mapInstance || !resolvedTheme) return;
    const newStyle = resolvedTheme === 'dark' ? mapStyles.dark : mapStyles.light;
    if (currentStyleRef.current === newStyle) return;
    clearStyleTimeout();
    currentStyleRef.current = newStyle;
    setStyleLoaded(false);
    mapInstance.setStyle(newStyle, { diff: true });
  }, [mapInstance, resolvedTheme, mapStyles, clearStyleTimeout]);

  const contextValue = useMemo(() => ({
    map: mapInstance,
    isLoaded: isLoaded && isStyleLoaded,
  }), [mapInstance, isLoaded, isStyleLoaded]);

  return (
    <MapContext.Provider value={contextValue}>
      <div ref={containerRef} className={cn('relative h-full w-full', className)}>
        {(!isLoaded || loading) && <DefaultLoader />}
        {mapInstance && children}
      </div>
    </MapContext.Provider>
  );
});

// ── Marker ─────────────────────────────────────────────────────

const MarkerContext = createContext(null);

function useMarkerContext() {
  const ctx = useContext(MarkerContext);
  if (!ctx) throw new Error('Marker components must be used within MapMarker');
  return ctx;
}

function DefaultMarkerIcon() {
  return <div className="relative h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" />;
}

export function MapMarker({
  longitude, latitude, children,
  onClick, onMouseEnter, onMouseLeave,
  onDragStart, onDrag, onDragEnd,
  draggable = false,
  ...markerOptions
}) {
  const { map } = useMap();
  const callbacksRef = useRef({ onClick, onMouseEnter, onMouseLeave, onDragStart, onDrag, onDragEnd });
  callbacksRef.current = { onClick, onMouseEnter, onMouseLeave, onDragStart, onDrag, onDragEnd };

  const marker = useMemo(() => {
    const m = new MapLibreGL.Marker({
      ...markerOptions,
      element: document.createElement('div'),
      draggable,
    }).setLngLat([longitude, latitude]);

    m.getElement()?.addEventListener('click',       (e) => callbacksRef.current.onClick?.(e));
    m.getElement()?.addEventListener('mouseenter',  (e) => callbacksRef.current.onMouseEnter?.(e));
    m.getElement()?.addEventListener('mouseleave',  (e) => callbacksRef.current.onMouseLeave?.(e));
    m.on('dragstart', () => { const l = m.getLngLat(); callbacksRef.current.onDragStart?.({ lng: l.lng, lat: l.lat }); });
    m.on('drag',      () => { const l = m.getLngLat(); callbacksRef.current.onDrag?.({ lng: l.lng, lat: l.lat }); });
    m.on('dragend',   () => { const l = m.getLngLat(); callbacksRef.current.onDragEnd?.({ lng: l.lng, lat: l.lat }); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) return;
    marker.addTo(map);
    return () => marker.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  if (marker.getLngLat().lng !== longitude || marker.getLngLat().lat !== latitude)
    marker.setLngLat([longitude, latitude]);
  if (marker.isDraggable() !== draggable) marker.setDraggable(draggable);

  return (
    <MarkerContext.Provider value={{ marker, map }}>
      {children}
    </MarkerContext.Provider>
  );
}

export function MarkerContent({ children, className }) {
  const { marker } = useMarkerContext();
  return createPortal(
    <div className={cn('relative cursor-pointer', className)}>
      {children || <DefaultMarkerIcon />}
    </div>,
    marker.getElement(),
  );
}

export function MarkerTooltip({ children, className, ...popupOptions }) {
  const { marker, map } = useMarkerContext();
  const container = useMemo(() => document.createElement('div'), []);
  const tooltip = useMemo(() => new MapLibreGL.Popup({
    offset: 16, ...popupOptions, closeOnClick: true, closeButton: false,
  }).setMaxWidth('none'), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map) return;
    tooltip.setDOMContent(container);
    const show = () => tooltip.setLngLat(marker.getLngLat()).addTo(map);
    const hide = () => tooltip.remove();
    marker.getElement()?.addEventListener('mouseenter', show);
    marker.getElement()?.addEventListener('mouseleave', hide);
    return () => {
      marker.getElement()?.removeEventListener('mouseenter', show);
      marker.getElement()?.removeEventListener('mouseleave', hide);
      tooltip.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return createPortal(
    <div className={cn(
      'pointer-events-none rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-md',
      className,
    )}>
      {children}
    </div>,
    container,
  );
}

export function MarkerPopup({ children, className, closeButton = false, ...popupOptions }) {
  const { marker, map } = useMarkerContext();
  const container = useMemo(() => document.createElement('div'), []);
  const popup = useMemo(() => new MapLibreGL.Popup({
    offset: 16, ...popupOptions, closeButton: false,
  }).setMaxWidth('none').setDOMContent(container), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map) return;
    popup.setDOMContent(container);
    marker.setPopup(popup);
    return () => marker.setPopup(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return createPortal(
    <div className={cn(
      'relative max-w-[250px] rounded-lg border border-white/10 bg-gray-800 p-3 shadow-xl text-sm text-white',
      className,
    )}>
      {closeButton && (
        <button
          type="button"
          onClick={() => popup.remove()}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {children}
    </div>,
    container,
  );
}

export function MarkerLabel({ children, className, position = 'top' }) {
  const positionCls = position === 'top' ? 'bottom-full mb-1' : 'top-full mt-1';
  return (
    <div className={cn('absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-white', positionCls, className)}>
      {children}
    </div>
  );
}

// ── Map-level popup ────────────────────────────────────────────

export function MapPopup({ longitude, latitude, onClose, children, className, closeButton = false, ...popupOptions }) {
  const { map } = useMap();
  const container = useMemo(() => document.createElement('div'), []);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const popup = useMemo(() => new MapLibreGL.Popup({
    offset: 16, ...popupOptions, closeButton: false,
  }).setMaxWidth('none').setLngLat([longitude, latitude]), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map) return;
    const handleClose = () => onCloseRef.current?.();
    popup.on('close', handleClose);
    popup.setDOMContent(container);
    popup.addTo(map);
    return () => { popup.off('close', handleClose); if (popup.isOpen()) popup.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  if (popup.isOpen()) {
    if (popup.getLngLat().lng !== longitude || popup.getLngLat().lat !== latitude)
      popup.setLngLat([longitude, latitude]);
  }

  return createPortal(
    <div className={cn('relative max-w-[250px] rounded-lg border border-white/10 bg-gray-800 p-3 shadow-xl text-sm text-white', className)}>
      {closeButton && (
        <button type="button" onClick={() => popup.remove()}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {children}
    </div>,
    container,
  );
}

// ── Route ──────────────────────────────────────────────────────

export function MapRoute({
  id: propId, coordinates, color = '#4285F4', width = 3, opacity = 0.8,
  dashArray, onClick, onMouseEnter, onMouseLeave, interactive = true,
}) {
  const { map, isLoaded } = useMap();
  const autoId   = useId();
  const id       = propId ?? autoId;
  const sourceId = `route-source-${id}`;
  const layerId  = `route-layer-${id}`;

  useEffect(() => {
    if (!isLoaded || !map) return;
    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
    });
    map.addLayer({
      id: layerId, type: 'line', source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity,
               ...(dashArray && { 'line-dasharray': dashArray }) },
    });
    return () => {
      try {
        if (map.getLayer(layerId))  map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map]);

  useEffect(() => {
    if (!isLoaded || !map || coordinates.length < 2) return;
    const source = map.getSource(sourceId);
    if (source) source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
  }, [isLoaded, map, coordinates, sourceId]);

  useEffect(() => {
    if (!isLoaded || !map || !map.getLayer(layerId)) return;
    map.setPaintProperty(layerId, 'line-color', color);
    map.setPaintProperty(layerId, 'line-width', width);
    map.setPaintProperty(layerId, 'line-opacity', opacity);
    if (dashArray) map.setPaintProperty(layerId, 'line-dasharray', dashArray);
  }, [isLoaded, map, layerId, color, width, opacity, dashArray]);

  useEffect(() => {
    if (!isLoaded || !map || !interactive) return;
    const handleClick      = () => onClick?.();
    const handleEnter      = () => { map.getCanvas().style.cursor = 'pointer'; onMouseEnter?.(); };
    const handleLeave      = () => { map.getCanvas().style.cursor = '';        onMouseLeave?.(); };
    map.on('click',      layerId, handleClick);
    map.on('mouseenter', layerId, handleEnter);
    map.on('mouseleave', layerId, handleLeave);
    return () => {
      map.off('click',      layerId, handleClick);
      map.off('mouseenter', layerId, handleEnter);
      map.off('mouseleave', layerId, handleLeave);
    };
  }, [isLoaded, map, layerId, onClick, onMouseEnter, onMouseLeave, interactive]);

  return null;
}

// ── Controls ───────────────────────────────────────────────────

const positionClasses = {
  'top-left':     'top-2 left-2',
  'top-right':    'top-2 right-2',
  'bottom-left':  'bottom-10 left-2',
  'bottom-right': 'bottom-10 right-2',
};

function ControlGroup({ children }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-white/10 bg-gray-800 shadow-sm [&>button:not(:last-child)]:border-b [&>button:not(:last-child)]:border-white/10">
      {children}
    </div>
  );
}

function ControlButton({ onClick, label, children, disabled = false }) {
  return (
    <button onClick={onClick} aria-label={label} type="button" disabled={disabled}
      className="flex h-8 w-8 items-center justify-center text-gray-300 transition-colors hover:bg-gray-700 first:rounded-t-md last:rounded-b-md disabled:pointer-events-none disabled:opacity-50">
      {children}
    </button>
  );
}

export function MapControls({
  position = 'bottom-right',
  showZoom = true, showCompass = false, showLocate = false, showFullscreen = false,
  className, onLocate,
}) {
  const { map } = useMap();
  const [waiting, setWaiting] = useState(false);

  const zoomIn    = useCallback(() => map?.zoomTo(map.getZoom() + 1, { duration: 300 }), [map]);
  const zoomOut   = useCallback(() => map?.zoomTo(map.getZoom() - 1, { duration: 300 }), [map]);
  const resetNorth= useCallback(() => map?.resetNorthPitch({ duration: 300 }), [map]);
  const locate    = useCallback(() => {
    setWaiting(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const coords = { longitude: pos.coords.longitude, latitude: pos.coords.latitude };
        map?.flyTo({ center: [coords.longitude, coords.latitude], zoom: 14, duration: 1500 });
        onLocate?.(coords);
        setWaiting(false);
      },
      () => setWaiting(false),
    );
  }, [map, onLocate]);
  const fullscreen = useCallback(() => {
    const c = map?.getContainer();
    if (!c) return;
    document.fullscreenElement ? document.exitFullscreen() : c.requestFullscreen();
  }, [map]);

  return (
    <div className={cn('absolute z-10 flex flex-col gap-1.5', positionClasses[position], className)}>
      {showZoom && (
        <ControlGroup>
          <ControlButton onClick={zoomIn} label="Zoom in">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </ControlButton>
          <ControlButton onClick={zoomOut} label="Zoom out">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 12h-15" />
            </svg>
          </ControlButton>
        </ControlGroup>
      )}
      {showLocate && (
        <ControlGroup>
          <ControlButton onClick={locate} label="Minha localização" disabled={waiting}>
            {waiting ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v3m0 12v3M3 12h3m12 0h3" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 21a9 9 0 110-18 9 9 0 010 18zm0 0v-3m0-12V3m9 9h-3M6 12H3" />
              </svg>
            )}
          </ControlButton>
        </ControlGroup>
      )}
      {showFullscreen && (
        <ControlGroup>
          <ControlButton onClick={fullscreen} label="Tela cheia">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2m8-16h2a2 2 0 012 2v2m0 8v2a2 2 0 01-2 2h-2" />
            </svg>
          </ControlButton>
        </ControlGroup>
      )}
    </div>
  );
}
