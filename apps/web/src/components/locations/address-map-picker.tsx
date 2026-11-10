"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ExternalLink, MapPin, Search } from "lucide-react";
import { LocationSource } from "@delivery/shared";
import { TextField } from "@/components/ui/field";
import { reverseGeocodeOsm, searchAddressOsm } from "./osm-geocode";

// Leaflet dùng đối tượng window nên chỉ tải ở trình duyệt, và chỉ khi không dùng Google Maps.
const OsmMap = dynamic(() => import("./osm-map"), {
  ssr: false,
  loading: () => <div className="flex h-[280px] items-center justify-center rounded-md bg-[#e5e7eb] text-[11px] text-slate-600">Đang tải bản đồ...</div>,
});

export interface AddressMapValue {
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  formatted_address: string | null;
  location_source: (typeof LocationSource)[keyof typeof LocationSource] | null;
}

/** Địa chỉ người dùng đã nhập ở các ô phía trên, dùng để tìm vị trí trên bản đồ. */
export interface AddressMapQuery {
  line?: string | null;
  ward?: string | null;
  district?: string | null;
  province?: string | null;
}

interface AddressMapPickerProps {
  value: AddressMapValue;
  onChange: (value: AddressMapValue) => void;
  address?: AddressMapQuery;
}

interface SearchEntry {
  query: string;
  /** Lời nhắc hiển thị khi kết quả chỉ khớp ở cấp này; rỗng nếu khớp đầy đủ. */
  note: string;
}

/** Các chuỗi tìm kiếm từ chi tiết đến tổng quát, bỏ qua phần còn trống và các chuỗi trùng nhau. */
function buildSearchEntries(address: AddressMapQuery | undefined): SearchEntry[] {
  const clean = (part: string | null | undefined): string => (part ?? "").trim();
  const line = clean(address?.line);
  const ward = clean(address?.ward);
  const district = clean(address?.district);
  const province = clean(address?.province);
  const join = (...parts: string[]): string => parts.filter(Boolean).join(", ");
  const candidates: SearchEntry[] = [
    { query: join(line, ward, district, province), note: "Đã ghim theo địa chỉ đã nhập. Hãy kiểm tra và kéo ghim nếu chưa đúng." },
    { query: join(ward, district, province), note: "Không tìm thấy số nhà, đã ghim theo phường/xã. Hãy kéo ghim đến đúng chỗ." },
    { query: join(district, province), note: "Chỉ tìm được đến quận/huyện. Hãy kéo ghim đến đúng chỗ." },
    { query: province, note: "Chỉ tìm được đến tỉnh/thành phố. Hãy bấm hoặc kéo ghim đến đúng chỗ." },
  ];
  return candidates.filter((entry, index) => entry.query && candidates.findIndex((other) => other.query === entry.query) === index);
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
export function AddressMapPicker({ value, onChange, address }: AddressMapPickerProps): React.JSX.Element {
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
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
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

  /** Tìm vị trí từ địa chỉ đã nhập ở các ô phía trên rồi ghim lên bản đồ. */
  async function searchOnMap(): Promise<void> {
    const entries = buildSearchEntries(address);
    if (entries.length === 0) {
      setSearchNote("Hãy chọn tỉnh/thành phố và nhập địa chỉ ở các ô phía trên trước.");
      return;
    }
    setSearching(true);
    setSearchNote(null);
    const { result, error } = await searchAddressOsm(entries.map((entry) => entry.query));
    setSearching(false);
    if (!result) {
      setSearchNote(error
        ? `Không dùng được dịch vụ tìm địa chỉ: ${error}. Bạn vẫn bấm trực tiếp lên bản đồ để ghim.`
        : "Không tìm thấy địa chỉ này trên bản đồ. Bạn có thể bấm trực tiếp lên bản đồ để ghim.");
      return;
    }
    setSearchNote(entries[result.levelIndex]?.note ?? null);
    selectOsmPoint(result.latitude, result.longitude, { formattedAddress: result.formattedAddress, placeId: result.placeId });
  }

  /** Chọn vị trí trên bản đồ OpenStreetMap: lưu tọa độ ngay, địa chỉ chữ (Nominatim) bổ sung sau nếu có. */
  function selectOsmPoint(latitude: number, longitude: number, preset?: { formattedAddress: string; placeId: string | null }): void {
    setCoordinateError(null);
    setLatitudeInput(latitude.toString());
    setLongitudeInput(longitude.toString());
    const coordinates = {
      latitude,
      longitude,
      place_id: null,
      formatted_address: null,
      location_source: LocationSource.MAP_PIN,
    } satisfies AddressMapValue;
    if (preset) {
      // Kết quả từ tìm kiếm đã có địa chỉ chuẩn, không cần gọi thêm dịch vụ đổi tọa độ.
      onChangeRef.current({ ...coordinates, place_id: preset.placeId, formatted_address: preset.formattedAddress });
      return;
    }
    setSearchNote(null);
    onChangeRef.current(coordinates);
    void reverseGeocodeOsm(latitude, longitude).then((result) => {
      const current = valueRef.current;
      // Bỏ qua nếu trong lúc chờ người dùng đã chọn điểm khác hoặc xóa ghim.
      if (!result || current.latitude !== latitude || current.longitude !== longitude) return;
      onChangeRef.current({ ...coordinates, place_id: result.placeId, formatted_address: result.formattedAddress });
    });
  }

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
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void searchOnMap()}
              disabled={searching}
              className="inline-flex items-center gap-1.5 rounded-dt bg-dt-yellow px-3 py-2 text-[12px] font-medium text-[#0f0f12] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Search size={13} /> {searching ? "Đang tìm..." : "Tìm vị trí theo địa chỉ đã nhập"}
            </button>
            {searchNote ? <span role="status" className="text-[10px] text-dt-muted">{searchNote}</span> : null}
          </div>
          <OsmMap latitude={value.latitude} longitude={value.longitude} onSelect={(lat, lng) => selectOsmPoint(lat, lng)} />
          <p className="text-[10px] text-dt-muted">
            Bản đồ OpenStreetMap: bấm vào bản đồ hoặc kéo ghim để chọn vị trí. Địa chỉ chữ được lấy từ Nominatim (có thể chưa chi tiết ở vùng nông thôn); tọa độ ghim vẫn chính xác. Sau khi chọn, kiểm tra lại xã/phường và tỉnh/thành phố ở danh sách phía trên.
          </p>
        </>
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
