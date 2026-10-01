"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { LocationSource } from "@delivery/shared";
import { TextField } from "@/components/ui/field";

export interface AddressMapValue {
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  formatted_address: string | null;
  location_source: (typeof LocationSource)[keyof typeof LocationSource] | null;
}

interface AddressMapPickerProps {
  value: AddressMapValue;
  onChange: (value: AddressMapValue) => void;
}

interface GoogleLatLng {
  lat(): number;
  lng(): number;
}

interface GoogleMapClickEvent {
  latLng?: GoogleLatLng;
}

interface GoogleMap {
  addListener(eventName: string, callback: (event: GoogleMapClickEvent) => void): { remove(): void };
  setCenter(position: { lat: number; lng: number }): void;
}

interface GoogleMarker {
  addListener(eventName: string, callback: (event: { latLng?: GoogleLatLng }) => void): { remove(): void };
  setMap(map: GoogleMap | null): void;
  setPosition(position: { lat: number; lng: number }): void;
}

interface GoogleGeocoderResult {
  formatted_address: string;
  place_id: string;
}

interface GoogleMapsApi {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: { map: GoogleMap; position: { lat: number; lng: number }; draggable: boolean; title: string }) => GoogleMarker;
  Geocoder: new () => {
    geocode(
      request: { location: { lat: number; lng: number } },
      callback: (results: GoogleGeocoderResult[] | null, status: string) => void,
    ): void;
  };
  GeocoderStatus: { OK: string };
}

declare global {
  interface Window {
    google?: { maps?: GoogleMapsApi };
  }
}

const MAP_SCRIPT_ID = "delivertrust-google-maps-js";
let mapsScriptPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise<void>((resolve, reject) => {
    let script = document.getElementById(MAP_SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = MAP_SCRIPT_ID;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=vi&region=VN&v=weekly`;
      script.async = true;
      script.defer = true;
    }

    const onLoad = () => {
      if (window.google?.maps) resolve();
      else reject(new Error("Google Maps chưa sẵn sàng. Kiểm tra API key và quyền Maps JavaScript API."));
    };
    const onError = () => reject(new Error("Không tải được Google Maps. Kiểm tra kết nối mạng và API key."));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!script.isConnected) document.head.appendChild(script);
  }).catch((error: unknown) => {
    mapsScriptPromise = null;
    throw error;
  });

  return mapsScriptPromise!;
}

function validCoordinate(value: string, min: number, max: number): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

/** Bộ ghim tọa độ Google Maps có fallback nhập tọa độ khi chưa cấu hình API key. */
export function AddressMapPicker({ value, onChange }: AddressMapPickerProps): React.JSX.Element {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const selectPointRef = useRef<((latitude: number, longitude: number) => void) | null>(null);
  const markerDragListenerRef = useRef<{ remove(): void } | null>(null);
  const manualCoordinateEditRef = useRef(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [latitudeInput, setLatitudeInput] = useState(value.latitude?.toString() ?? "");
  const [longitudeInput, setLongitudeInput] = useState(value.longitude?.toString() ?? "");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";

  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    if (manualCoordinateEditRef.current) {
      manualCoordinateEditRef.current = false;
      if (value.latitude === null || value.longitude === null) {
        markerDragListenerRef.current?.remove();
        markerDragListenerRef.current = null;
        markerRef.current?.setMap(null);
        markerRef.current = null;
      }
      return;
    }

    if (value.latitude === null || value.longitude === null) {
      setLatitudeInput("");
      setLongitudeInput("");
      markerDragListenerRef.current?.remove();
      markerDragListenerRef.current = null;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      return;
    }

    setLatitudeInput(value.latitude.toString());
    setLongitudeInput(value.longitude.toString());
    const point = { lat: value.latitude, lng: value.longitude };
    if (markerRef.current && mapRef.current) {
      markerRef.current.setPosition(point);
      mapRef.current.setCenter(point);
    }
  }, [value.latitude, value.longitude]);

  useEffect(() => {
    if (!apiKey || !mapElementRef.current) return;
    let mounted = true;
    let mapClickListener: { remove(): void } | null = null;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!mounted || !mapElementRef.current || !window.google?.maps) return;
        const maps = window.google.maps;
        const currentValue = valueRef.current;
        const initialPoint = currentValue.latitude !== null && currentValue.longitude !== null
          ? { lat: currentValue.latitude, lng: currentValue.longitude }
          : { lat: 16.047079, lng: 108.20623 };
        const map = new maps.Map(mapElementRef.current, {
          center: initialPoint,
          zoom: currentValue.latitude !== null ? 16 : 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });
        mapRef.current = map;

        const selectPoint = (latitude: number, longitude: number): void => {
          const point = { lat: latitude, lng: longitude };
          setCoordinateError(null);
          setLatitudeInput(latitude.toString());
          setLongitudeInput(longitude.toString());
          markerRef.current?.setPosition(point);
          if (!markerRef.current) {
            markerRef.current = new maps.Marker({ map, position: point, draggable: true, title: "Vị trí lấy/giao hàng" });
            markerDragListenerRef.current = markerRef.current.addListener("dragend", (event) => {
              const moved = event.latLng;
              if (moved) selectPoint(moved.lat(), moved.lng());
            });
          }
          map.setCenter(point);

          const coordinates = {
            latitude,
            longitude,
            place_id: null,
            formatted_address: null,
            location_source: LocationSource.MAP_PIN,
          } satisfies AddressMapValue;
          onChangeRef.current(coordinates);

          new maps.Geocoder().geocode({ location: point }, (results, status) => {
            if (status !== maps.GeocoderStatus.OK || !results?.[0]) return;
            onChangeRef.current({
              ...coordinates,
              place_id: results[0].place_id || null,
              formatted_address: results[0].formatted_address || null,
            });
          });
        };
        selectPointRef.current = selectPoint;

        mapClickListener = map.addListener("click", (event) => {
          const point = event.latLng;
          if (point) selectPoint(point.lat(), point.lng());
        });
        if (currentValue.latitude !== null && currentValue.longitude !== null && !markerRef.current) {
          markerRef.current = new maps.Marker({ map, position: initialPoint, draggable: true, title: "Vị trí lấy/giao hàng" });
          markerDragListenerRef.current = markerRef.current.addListener("dragend", (event) => {
            const moved = event.latLng;
            if (moved) selectPoint(moved.lat(), moved.lng());
          });
        }
        setMapReady(true);
      })
      .catch((caught: unknown) => {
        if (mounted) setMapError(caught instanceof Error ? caught.message : "Không tải được bản đồ");
      });

    return () => {
      mounted = false;
      mapClickListener?.remove();
      markerDragListenerRef.current?.remove();
      markerDragListenerRef.current = null;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
      selectPointRef.current = null;
    };
  // The map is initialized once per component. Pin movement is handled by Maps listeners.
  }, [apiKey]);

  function updateCoordinates(nextLatitude: string, nextLongitude: string): void {
    manualCoordinateEditRef.current = true;
    setLatitudeInput(nextLatitude);
    setLongitudeInput(nextLongitude);
    const latitude = validCoordinate(nextLatitude, -90, 90);
    const longitude = validCoordinate(nextLongitude, -180, 180);
    if (latitude === null || longitude === null) {
      const hasPartialCoordinates = Boolean(nextLatitude.trim() || nextLongitude.trim());
      setCoordinateError(hasPartialCoordinates ? "Nhập đủ vĩ độ và kinh độ hợp lệ, hoặc để trống cả hai." : null);
      if (value.latitude !== null || value.longitude !== null) {
        onChange({ ...value, latitude: null, longitude: null, place_id: null, formatted_address: null, location_source: null });
      }
      return;
    }
    setCoordinateError(null);
    if (apiKey && selectPointRef.current) {
      selectPointRef.current(latitude, longitude);
    } else {
      onChange({ ...value, latitude, longitude, place_id: null, formatted_address: null, location_source: LocationSource.MAP_PIN });
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-dt-border bg-dt-panel2 p-3" aria-label="Chọn vị trí trên bản đồ">
      <div className="flex items-start gap-2">
        <MapPin size={15} className="mt-0.5 shrink-0 text-dt-yellow" />
        <div>
          <p className="text-[11px] font-medium">Vị trí trên bản đồ</p>
          <p className="mt-1 text-[10px] leading-4 text-dt-muted">Ghim chính xác giúp hệ thống tìm kho gần nhất và lập tuyến tốt hơn.</p>
        </div>
      </div>

      {apiKey ? (
        <>
          <div ref={mapElementRef} className="h-[280px] w-full overflow-hidden rounded-md bg-[#e5e7eb]" />
          {!mapReady && !mapError ? <p className="text-[10px] text-dt-muted">Đang tải bản đồ...</p> : null}
          {mapError ? <p role="alert" className="text-[10px] text-dt-red">{mapError}</p> : null}
          <p className="text-[10px] text-dt-muted">Bấm vào bản đồ hoặc kéo ghim để chọn vị trí. Sau khi chọn, kiểm tra lại xã/phường và tỉnh/thành phố ở danh sách phía trên.</p>
        </>
      ) : (
        <p className="rounded-md border border-dt-yellow/25 bg-dt-yellow/5 p-3 text-[10px] leading-5 text-dt-muted">
          Bản đồ tương tác chưa được bật. Hãy cấu hình <code className="text-dt-yellow">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> trong <code>apps/web/.env</code> và bật Maps JavaScript API cùng Geocoding API. Bạn vẫn có thể dán tọa độ Google Maps vào hai ô bên dưới.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Vĩ độ"
          inputMode="decimal"
          placeholder="Ví dụ: 21.0285"
          value={latitudeInput}
          onChange={(event) => updateCoordinates(event.target.value, longitudeInput)}
        />
        <TextField
          label="Kinh độ"
          inputMode="decimal"
          placeholder="Ví dụ: 105.8542"
          value={longitudeInput}
          onChange={(event) => updateCoordinates(latitudeInput, event.target.value)}
        />
      </div>
      {coordinateError ? <p role="alert" className="text-[10px] text-dt-red">{coordinateError}</p> : null}

      {value.latitude !== null && value.longitude !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-dt-muted">
          <span>{value.formatted_address ?? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`}</span>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${value.latitude},${value.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-dt-yellow hover:underline"
          >
            Mở Google Maps <ExternalLink size={11} />
          </a>
        </div>
      ) : null}
    </section>
  );
}
