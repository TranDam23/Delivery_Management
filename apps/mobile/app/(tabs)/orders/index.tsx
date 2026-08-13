import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";

interface OrderListItem {
  id: string;
  tracking_code: string;
  service_type: string;
  cod_amount: number;
  order_statuses: { code: string; name: string } | null;
}

export default function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await apiFetch<{ items: OrderListItem[] }>("/orders");
      setOrders(result.items);
    } catch {
      // TODO: hien thi toast loi
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={orders}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/order/${item.id}`)}>
          <Text style={styles.trackingCode}>{item.tracking_code}</Text>
          <Text style={styles.status}>{item.order_statuses?.name ?? "—"}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>Chua co don hang nao</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    gap: 4,
  },
  trackingCode: { fontWeight: "600", fontSize: 16 },
  status: { color: "#6b7280" },
  empty: { textAlign: "center", marginTop: 40, color: "#9ca3af" },
});
