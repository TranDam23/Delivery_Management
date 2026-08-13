import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiFetch } from "@/lib/api";
import { OrderStatusCode } from "@delivery/shared";

interface OrderDetail {
  order: {
    id: string;
    tracking_code: string;
    service_type: string;
    cod_amount: number;
    order_statuses: { code: string; name: string; is_final: boolean } | null;
  };
  events: Array<{
    id: string;
    event_time: string;
    note: string | null;
    order_statuses: { code: string; name: string } | null;
  }>;
}

const NEXT_STATUS_ACTIONS: Array<{ code: string; label: string }> = [
  { code: OrderStatusCode.PICKED_UP, label: "Da lay hang" },
  { code: OrderStatusCode.IN_WAREHOUSE, label: "Da nhap kho" },
  { code: OrderStatusCode.DELIVERING, label: "Dang giao hang" },
  { code: OrderStatusCode.DELIVERED, label: "Giao thanh cong" },
  { code: OrderStatusCode.DELIVERY_FAILED, label: "Giao that bai" },
];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<OrderDetail | null>(null);

  async function load() {
    try {
      const result = await apiFetch<OrderDetail>(`/orders/${id}`);
      setDetail(result);
    } catch (err) {
      Alert.alert("Loi", err instanceof Error ? err.message : "Khong tai duoc don hang");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // TODO: goi POST /api/deliveries/:deliveryId/events voi status_code tuong ung
  // (can lookup/tao deliveries record cho order nay truoc — xem apps/web/src/app/api/deliveries).
  function handleUpdateStatus(_statusCode: string) {
    Alert.alert("TODO", "Ket noi voi /api/deliveries/:id/events de cap nhat trang thai");
  }

  if (!detail) return <View style={styles.center}><Text>Dang tai...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.trackingCode}>{detail.order.tracking_code}</Text>
      <Text style={styles.status}>{detail.order.order_statuses?.name}</Text>

      <Text style={styles.sectionTitle}>Cap nhat trang thai</Text>
      <View style={styles.actions}>
        {NEXT_STATUS_ACTIONS.map((action) => (
          <Pressable
            key={action.code}
            style={styles.actionButton}
            onPress={() => handleUpdateStatus(action.code)}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Lich su van chuyen</Text>
      {detail.events.map((event) => (
        <View key={event.id} style={styles.eventRow}>
          <Text style={styles.eventStatus}>{event.order_statuses?.name}</Text>
          <Text style={styles.eventTime}>{new Date(event.event_time).toLocaleString("vi-VN")}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  trackingCode: { fontSize: 20, fontWeight: "700" },
  status: { color: "#6b7280", marginBottom: 16 },
  sectionTitle: { fontWeight: "600", marginTop: 16, marginBottom: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: { backgroundColor: "#111827", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  actionText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  eventRow: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 8 },
  eventStatus: { fontWeight: "600" },
  eventTime: { color: "#9ca3af", fontSize: 12 },
});
