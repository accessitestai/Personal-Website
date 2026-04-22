import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import AccessibleButton from '@/components/AccessibleButton';
import VoiceAssistant from '@/components/VoiceAssistant';
import { speechService } from '@/services/speechService';
import { accessibilityService } from '@/services/accessibilityService';

export default function HomeScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationError, setLocationError] = useState<string>('');

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        const errorMsg = 'Location permission denied. Some features may be limited.';
        setLocationError(errorMsg);
        speechService.speak(errorMsg);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
      speechService.speak('Location services enabled');
    } catch (error) {
      const errorMsg = 'Unable to get location. Please check your settings.';
      setLocationError(errorMsg);
      speechService.speak(errorMsg);
    }
  };

  const handleVoiceCommand = (command: string) => {
    switch (command) {
      case 'navigate_home':
        speechService.speak('You are already on the home screen');
        break;
      case 'navigate_routes':
        router.push('/(tabs)/routes');
        break;
      case 'navigate_facilities':
        router.push('/(tabs)/facilities');
        break;
      case 'navigate_settings':
        router.push('/(tabs)/settings');
        break;
      case 'emergency':
        router.push('/(tabs)/emergency');
        break;
    }
  };

  const navigateToRoutes = () => {
    router.push('/(tabs)/routes');
  };

  const navigateToFacilities = () => {
    router.push('/(tabs)/facilities');
  };

  const navigateToEmergency = () => {
    router.push('/(tabs)/emergency');
  };

  const theme = accessibilityService.getColorTheme();
  const textScale = accessibilityService.getTextScale();

  return (
    <SafeAreaView style={[styles.container, theme === 'high-contrast' && styles.highContrastContainer]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel="Home screen content"
      >
        <View style={styles.header}>
          <Text 
            style={[
              styles.title, 
              { fontSize: 28 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={1}
          >
            Mobility Assistant
          </Text>
          <Text 
            style={[
              styles.subtitle, 
              { fontSize: 18 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            Your accessible navigation companion
          </Text>
        </View>

        <VoiceAssistant onCommand={handleVoiceCommand} />

        {locationError && (
          <View style={[styles.errorContainer, theme === 'high-contrast' && styles.highContrastError]}>
            <Text 
              style={[
                styles.errorText, 
                { fontSize: 16 * textScale },
                theme === 'high-contrast' && styles.highContrastErrorText
              ]}
              accessibilityRole="alert"
            >
              {locationError}
            </Text>
          </View>
        )}

        <View style={styles.quickActions}>
          <Text 
            style={[
              styles.sectionTitle, 
              { fontSize: 22 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={2}
          >
            Quick Actions
          </Text>

          <AccessibleButton
            title="Plan Accessible Route"
            onPress={navigateToRoutes}
            accessibilityLabel="Plan accessible route"
            accessibilityHint="Find wheelchair and visually impaired friendly routes to your destination"
            announcement="Opening route planner"
          />

          <AccessibleButton
            title="Find Nearby Facilities"
            onPress={navigateToFacilities}
            variant="secondary"
            accessibilityLabel="Find nearby accessible facilities"
            accessibilityHint="Locate restrooms, parking, and accessible entrances nearby"
            announcement="Opening nearby facilities"
          />

          <AccessibleButton
            title="Emergency Assistance"
            onPress={navigateToEmergency}
            variant="emergency"
            accessibilityLabel="Emergency assistance"
            accessibilityHint="Access emergency features and contacts"
            announcement="Opening emergency assistance"
          />
        </View>

        <View style={styles.statusSection}>
          <Text 
            style={[
              styles.sectionTitle, 
              { fontSize: 22 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={2}
          >
            Status
          </Text>
          
          <View style={[styles.statusItem, theme === 'high-contrast' && styles.highContrastStatusItem]}>
            <Text 
              style={[
                styles.statusLabel, 
                { fontSize: 16 * textScale },
                theme === 'high-contrast' && styles.highContrastText
              ]}
            >
              Location Services:
            </Text>
            <Text 
              style={[
                styles.statusValue, 
                { fontSize: 16 * textScale },
                location ? styles.statusActive : styles.statusInactive,
                theme === 'high-contrast' && (location ? styles.highContrastActive : styles.highContrastInactive)
              ]}
              accessibilityLabel={location ? 'Location services active' : 'Location services inactive'}
            >
              {location ? 'Active' : 'Inactive'}
            </Text>
          </View>

          <View style={[styles.statusItem, theme === 'high-contrast' && styles.highContrastStatusItem]}>
            <Text 
              style={[
                styles.statusLabel, 
                { fontSize: 16 * textScale },
                theme === 'high-contrast' && styles.highContrastText
              ]}
            >
              Voice Commands:
            </Text>
            <Text 
              style={[
                styles.statusValue, 
                { fontSize: 16 * textScale },
                styles.statusActive,
                theme === 'high-contrast' && styles.highContrastActive
              ]}
              accessibilityLabel="Voice commands available"
            >
              Available
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  highContrastContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontFamily: 'Inter-Bold',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    color: '#666666',
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginBottom: 16,
  },
  quickActions: {
    marginVertical: 24,
  },
  statusSection: {
    marginTop: 24,
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  highContrastStatusItem: {
    borderBottomColor: '#000000',
    borderBottomWidth: 2,
  },
  statusLabel: {
    fontFamily: 'Inter-Regular',
    color: '#000000',
  },
  statusValue: {
    fontFamily: 'Inter-SemiBold',
  },
  statusActive: {
    color: '#34C759',
  },
  statusInactive: {
    color: '#FF3B30',
  },
  highContrastActive: {
    color: '#000000',
  },
  highContrastInactive: {
    color: '#000000',
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: 16,
    borderRadius: 8,
    marginVertical: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30',
  },
  highContrastError: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
  },
  errorText: {
    fontFamily: 'Inter-Regular',
    color: '#D32F2F',
  },
  highContrastErrorText: {
    color: '#000000',
  },
  highContrastText: {
    color: '#000000',
  },
});