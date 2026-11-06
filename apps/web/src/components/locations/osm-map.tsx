"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

interface OsmMapProps {
  latitude: number | null;
  longitude: number | null;
  onSelect: (latitude: number, longitude: number) => void;
}

// Tâm mặc định: giữa Việt Nam, thu nhỏ để thấy cả nước khi chưa có ghim.
const DEFAULT_CENTER: [number, number] = [16.047079, 108.20623];

/** Bản đồ OpenStreetMap (Leaflet): bấm vào bản đồ hoặc kéo ghim để chọn vị trí. */
export default function OsmMap({ latitude, longitude, onSelect }: OsmMapProps): React.JSX.Element {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const onSelectRef = useRef(onSelect);
  const latestRef = useRef({ latitude, longitude });
  onSelectRef.current = onSelect;
  latestRef.current = { latitude, longitude };

  function placeMarker(lat: number, lng: number): void {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      return;
    }
    // Ghim vẽ bằng CSS để không phụ thuộc ảnh biểu tượng mặc định của Leaflet (hay lỗi đường dẫn khi đóng gói).
    const icon = L.divIcon({
      className: "",
      html: '<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#f5c518;border:2px solid #111;box-shadow:0 1px 4px rgba(0,0,0,.5)"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 22],
    });
    const marker = L.marker([lat, lng], { draggable: true, icon, title: "Vị trí lấy/giao hàng" }).addTo(map);
    marker.on("dragend", () => {
      const moved = marker.getLatLng();
      onSelectRef.current(moved.lat, moved.lng);
    });
    markerRef.current = marker;
  }

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((module) => {
      const L = module.default ?? module;
      if (cancelled || !elementRef.current || mapRef.current) return;
      leafletRef.current = L;
      const initial = latestRef.current;
      const hasPoint = initial.latitude !== null && initial.longitude !== null;
      const map = L.map(elementRef.current, { zoomControl: true, attributionControl: true })
        .setView(hasPoint ? [initial.latitude!, initial.longitude!] : DEFAULT_CENTER, hasPoint ? 16 : 6);
      const primary = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);
      // Máy chủ tile chính của OSM đôi khi từ chối một số môi trường (chính sách sử dụng):
      // nếu chưa tải được tile nào sau vài lần lỗi thì chuyển sang máy chủ tile cộng đồng OpenStreetMap.de (cùng dữ liệu, không cần khóa).
      let tileLoaded = false;
      let tileErrors = 0;
      primary.on("tileload", () => { tileLoaded = true; });
      primary.on("tileerror", () => {
        tileErrors += 1;
        if (tileLoaded || tileErrors < 3 || !mapRef.current) return;
        mapRef.current.removeLayer(primary);
        L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        }).addTo(mapRef.current);
      });
      map.on("click", (event) => {
        onSelectRef.current(event.latlng.lat, event.latlng.lng);
      });
      mapRef.current = map;
      if (hasPoint) placeMarker(initial.latitude!, initial.longitude!);
    });
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Đồng bộ khi vị trí thay đổi từ bên ngoài (nhập tay tọa độ, xóa ghim khi đổi địa chỉ, mở địa chỉ khác).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (latitude === null || longitude === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    placeMarker(latitude, longitude);
    if (!map.getBounds().contains([latitude, longitude])) map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
  }, [latitude, longitude]);

  return <div ref={elementRef} className="h-[280px] w-full overflow-hidden rounded-md bg-[#e5e7eb]" />;
}
