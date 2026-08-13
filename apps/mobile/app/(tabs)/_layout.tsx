import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="orders/index" options={{ title: "Don hang" }} />
      <Tabs.Screen name="scan" options={{ title: "Quet QR" }} />
      <Tabs.Screen name="profile" options={{ title: "Ca nhan" }} />
    </Tabs>
  );
}
