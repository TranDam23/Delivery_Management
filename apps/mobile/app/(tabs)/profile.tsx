import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAuthStore } from "@/store/auth-store";

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{user?.full_name}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      <Text style={styles.role}>{user?.roleCode}</Text>
      <Pressable style={styles.button} onPress={() => logout()}>
        <Text style={styles.buttonText}>Dang xuat</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8 },
  name: { fontSize: 20, fontWeight: "600" },
  email: { color: "#6b7280" },
  role: { color: "#6b7280", marginBottom: 24 },
  button: { backgroundColor: "#ef4444", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
