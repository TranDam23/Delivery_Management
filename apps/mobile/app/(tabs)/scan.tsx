import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";

interface OrderLookup {
  order: { id: string; tracking_code: string };
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const router = useRouter();

  async function handleScan({ data: trackingCode }: BarcodeScanningResult) {
    if (scanned) return;
    setScanned(true);
    try {
      const result = await apiFetch<OrderLookup>(`/orders/track/${trackingCode}`);
      router.push(`/order/${result.order.id}`);
    } catch {
      // TODO: hien thi toast "Khong tim thay don hang"
    } finally {
      setTimeout(() => setScanned(false), 1500);
    }
  }

  if (!permission) return <View style={styles.center} />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Can quyen truy cap camera de quet QR</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Cap quyen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <CameraView
      style={styles.camera}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      onBarcodeScanned={scanned ? undefined : handleScan}
    />
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  message: { textAlign: "center" },
  button: { backgroundColor: "#111827", borderRadius: 8, padding: 12 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
