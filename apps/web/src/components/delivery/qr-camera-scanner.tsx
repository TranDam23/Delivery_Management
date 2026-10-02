"use client";

import jsQR from "jsqr";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  onResult: (code: string) => void;
  onClose: () => void;
}

/**
 * Quét QR bằng camera sau của thiết bị ngay trên trình duyệt. Dùng BarcodeDetector
 * khi trình duyệt có, nếu không thì giải mã từng khung hình bằng jsQR.
 * Camera chỉ hoạt động trên HTTPS hoặc localhost.
 */
export function QrCameraScanner({ onResult, onClose }: Props): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;

    async function tick(): Promise<void> {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && context) {
        try {
          let value: string | null = null;
          if (detector) {
            const found = await detector.detect(video);
            value = found[0]?.rawValue ?? null;
          } else {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            value = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
          }
          if (value && !stopped) {
            stopped = true;
            onResultRef.current(value.trim());
            return;
          }
        } catch {
          // Khung hình lỗi: bỏ qua, thử khung kế tiếp.
        }
      }
      frame = requestAnimationFrame(() => void tick());
    }

    async function start(): Promise<void> {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Trình duyệt không hỗ trợ camera hoặc trang chưa chạy trên HTTPS. Hãy nhập mã vận đơn thủ công.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        frame = requestAnimationFrame(() => void tick());
      } catch (caught) {
        setError(caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Bạn chưa cấp quyền dùng camera. Hãy cho phép camera trong trình duyệt rồi thử lại."
          : "Không mở được camera. Hãy nhập mã vận đơn thủ công.");
      }
    }
    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return <div role="dialog" aria-modal="true" aria-label="Quét mã QR" className="fixed inset-0 z-50 flex flex-col bg-black/90">
    <div className="flex items-center justify-between px-4 py-3 text-white">
      <p className="text-sm font-medium">Đưa mã QR của kiện hàng vào khung hình</p>
      <button type="button" onClick={onClose} aria-label="Đóng camera" className="rounded-full p-2 hover:bg-white/10"><X size={20} /></button>
    </div>
    <div className="relative flex flex-1 items-center justify-center overflow-hidden">
      <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute h-56 w-56 rounded-2xl border-2 border-dt-yellow" />
    </div>
    {error ? <p role="alert" className="px-4 py-4 text-center text-sm text-red-200">{error}</p> : null}
  </div>;
}
