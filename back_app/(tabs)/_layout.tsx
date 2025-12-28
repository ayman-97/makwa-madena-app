import React from 'react';
import { Tabs } from 'expo-router';

// لاحظ: حذفنا سطر import { Platform } ... لأنه لم يعد ضرورياً

export default function TabLayout() {
  return (
    <Tabs
      // إخفاء الشريط السفلي تماماً
      tabBar={() => null} 
      
      screenOptions={{
        // إخفاء العنوان العلوي
        headerShown: false,
      }}>
      
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}