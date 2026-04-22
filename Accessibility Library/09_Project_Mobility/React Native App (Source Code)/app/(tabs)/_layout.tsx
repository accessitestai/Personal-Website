import { Tabs } from 'expo-router';
import { Home, Navigation, MapPin, Settings, Zap } from 'lucide-react-native';
import { speechService } from '@/services/speechService';
import { accessibilityService } from '@/services/accessibilityService';

export default function TabLayout() {
  const handleTabPress = (routeName: string) => {
    const screenNames: Record<string, string> = {
      index: 'Home',
      routes: 'Route Planner',
      facilities: 'Nearby Facilities', 
      emergency: 'Emergency Assistance',
      settings: 'Settings',
    };
    
    speechService.announceNavigation(screenNames[routeName] || routeName);
    accessibilityService.triggerHapticFeedback('light');
  };

  const theme = accessibilityService.getColorTheme();
  const iconColor = theme === 'high-contrast' ? '#000000' : '#007AFF';
  const inactiveColor = theme === 'high-contrast' ? '#666666' : '#8E8E93';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: iconColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'Inter-SemiBold',
        },
        tabBarStyle: {
          height: 80,
          paddingBottom: 8,
          paddingTop: 8,
          backgroundColor: theme === 'high-contrast' ? '#FFFFFF' : '#F8F9FA',
          borderTopWidth: theme === 'high-contrast' ? 2 : 1,
          borderTopColor: theme === 'high-contrast' ? '#000000' : '#E5E5EA',
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ size, color }) => <Home size={size} color={color} />,
          tabBarAccessibilityLabel: 'Home tab',
          tabBarAccessibilityHint: 'Navigate to home screen',
        }}
        listeners={{
          tabPress: () => handleTabPress('index'),
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Routes',
          tabBarIcon: ({ size, color }) => <Navigation size={size} color={color} />,
          tabBarAccessibilityLabel: 'Routes tab',
          tabBarAccessibilityHint: 'Navigate to accessible route planning',
        }}
        listeners={{
          tabPress: () => handleTabPress('routes'),
        }}
      />
      <Tabs.Screen
        name="facilities"
        options={{
          title: 'Facilities',
          tabBarIcon: ({ size, color }) => <MapPin size={size} color={color} />,
          tabBarAccessibilityLabel: 'Facilities tab',
          tabBarAccessibilityHint: 'Find nearby accessible facilities',
        }}
        listeners={{
          tabPress: () => handleTabPress('facilities'),
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: 'Emergency',
          tabBarIcon: ({ size, color }) => <Zap size={size} color={color} />,
          tabBarAccessibilityLabel: 'Emergency tab',
          tabBarAccessibilityHint: 'Access emergency assistance features',
        }}
        listeners={{
          tabPress: () => handleTabPress('emergency'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ size, color }) => <Settings size={size} color={color} />,
          tabBarAccessibilityLabel: 'Settings tab',
          tabBarAccessibilityHint: 'Access accessibility and app settings',
        }}
        listeners={{
          tabPress: () => handleTabPress('settings'),
        }}
      />
    </Tabs>
  );
}