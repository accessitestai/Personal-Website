import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Phone, AlertTriangle, MapPin, Users } from 'lucide-react-native';
import AccessibleButton from '@/components/AccessibleButton';
import { speechService } from '@/services/speechService';
import { accessibilityService } from '@/services/accessibilityService';

export default function EmergencyScreen() {
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    speechService.announceNavigation('Emergency Assistance', 'Access emergency contacts, SOS features, and safety information');
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
        speechService.speak(`${countdown - 1}`, true);
      }, 1000);
    } else if (emergencyMode && countdown === 0) {
      triggerEmergencyCall();
    }
    return () => clearTimeout(timer);
  }, [countdown, emergencyMode]);

  const startEmergencyCountdown = () => {
    setEmergencyMode(true);
    setCountdown(5);
    speechService.speak('Emergency SOS activated. Calling emergency services in 5 seconds. Press cancel to stop.', true);
    accessibilityService.triggerHapticFeedback('heavy');
  };

  const cancelEmergency = () => {
    setEmergencyMode(false);
    setCountdown(0);
    speechService.speak('Emergency call cancelled', true);
    accessibilityService.triggerHapticFeedback('light');
  };

  const triggerEmergencyCall = () => {
    setEmergencyMode(false);
    setCountdown(0);
    speechService.speak('Calling emergency services now', true);
    
    if (Platform.OS === 'web') {
      speechService.speak('Emergency call feature not available on web. Please call 911 directly.');
    } else {
      Linking.openURL('tel:911');
    }
  };

  const callEmergencyContact = (name: string, number: string) => {
    speechService.speak(`Calling ${name}`);
    accessibilityService.triggerHapticFeedback('medium');
    
    if (Platform.OS === 'web') {
      speechService.speak('Phone call feature not available on web');
    } else {
      Linking.openURL(`tel:${number}`);
    }
  };

  const shareLocation = () => {
    speechService.speak('Sharing current location with emergency contacts');
    accessibilityService.triggerHapticFeedback('medium');
    // In a real app, this would share location via SMS/email
  };

  const accessMedicalInfo = () => {
    speechService.speak('Accessing medical information and emergency instructions');
    // In a real app, this would show stored medical information
  };

  const theme = accessibilityService.getColorTheme();
  const textScale = accessibilityService.getTextScale();

  return (
    <SafeAreaView style={[styles.container, theme === 'high-contrast' && styles.highContrastContainer]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel="Emergency assistance screen"
      >
        <View style={styles.header}>
          <AlertTriangle size={32} color={theme === 'high-contrast' ? '#000000' : '#FF3B30'} />
          <Text 
            style={[
              styles.title, 
              { fontSize: 28 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={1}
          >
            Emergency Assistance
          </Text>
          <Text 
            style={[
              styles.subtitle, 
              { fontSize: 16 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            Quick access to emergency services and contacts
          </Text>
        </View>

        {emergencyMode && (
          <View style={[styles.emergencyAlert, theme === 'high-contrast' && styles.highContrastAlert]}>
            <Text 
              style={[
                styles.emergencyText, 
                { fontSize: 24 * textScale },
                theme === 'high-contrast' && styles.highContrastEmergencyText
              ]}
              accessibilityLiveRegion="assertive"
            >
              Calling Emergency Services in {countdown}
            </Text>
            <AccessibleButton
              title="CANCEL"
              onPress={cancelEmergency}
              variant="emergency"
              style={styles.cancelButton}
              accessibilityLabel="Cancel emergency call"
              accessibilityHint="Stop the emergency countdown"
              announcement="Emergency call cancelled"
            />
          </View>
        )}

        <View style={styles.sosSection}>
          <Text 
            style={[
              styles.sectionTitle, 
              { fontSize: 22 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={2}
          >
            Emergency SOS
          </Text>

          <AccessibleButton
            title="SOS - Call 911"
            onPress={startEmergencyCountdown}
            variant="emergency"
            style={styles.sosButton}
            accessibilityLabel="Emergency SOS"
            accessibilityHint="Start emergency countdown to call 911"
            announcement="Emergency SOS activated"
            disabled={emergencyMode}
          />

          <Text 
            style={[
              styles.sosDescription, 
              { fontSize: 14 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            This will automatically call emergency services after a 5-second countdown. 
            Your location will be shared if available.
          </Text>
        </View>

        <View style={styles.contactsSection}>
          <Text 
            style={[
              styles.sectionTitle, 
              { fontSize: 22 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={2}
          >
            Emergency Contacts
          </Text>

          <View style={[styles.contactCard, theme === 'high-contrast' && styles.highContrastCard]}>
            <View style={styles.contactHeader}>
              <Phone size={24} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />
              <Text 
                style={[
                  styles.contactName, 
                  { fontSize: 18 * textScale },
                  theme === 'high-contrast' && styles.highContrastText
                ]}
              >
                Primary Contact
              </Text>
            </View>
            <Text 
              style={[
                styles.contactDetails, 
                { fontSize: 14 * textScale },
                theme === 'high-contrast' && styles.highContrastText
              ]}
            >
              John Doe - Caregiver
            </Text>
            <AccessibleButton
              title="Call Primary Contact"
              onPress={() => callEmergencyContact('John Doe', '+1234567890')}
              variant="primary"
              accessibilityLabel="Call primary emergency contact John Doe"
              accessibilityHint="Place a call to your primary emergency contact"
              announcement="Calling primary contact"
            />
          </View>

          <View style={[styles.contactCard, theme === 'high-contrast' && styles.highContrastCard]}>
            <View style={styles.contactHeader}>
              <Users size={24} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />
              <Text 
                style={[
                  styles.contactName, 
                  { fontSize: 18 * textScale },
                  theme === 'high-contrast' && styles.highContrastText
                ]}
              >
                Family Contact
              </Text>
            </View>
            <Text 
              style={[
                styles.contactDetails, 
                { fontSize: 14 * textScale },
                theme === 'high-contrast' && styles.highContrastText
              ]}
            >
              Jane Smith - Family Member
            </Text>
            <AccessibleButton
              title="Call Family Contact"
              onPress={() => callEmergencyContact('Jane Smith', '+0987654321')}
              variant="secondary"
              accessibilityLabel="Call family emergency contact Jane Smith"
              accessibilityHint="Place a call to your family emergency contact"
              announcement="Calling family contact"
            />
          </View>
        </View>

        <View style={styles.utilitiesSection}>
          <Text 
            style={[
              styles.sectionTitle, 
              { fontSize: 22 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={2}
          >
            Emergency Utilities
          </Text>

          <AccessibleButton
            title="Share My Location"
            onPress={shareLocation}
            variant="secondary"
            accessibilityLabel="Share current location"
            accessibilityHint="Send your current location to emergency contacts"
            announcement="Sharing location with emergency contacts"
          />

          <AccessibleButton
            title="Medical Information"
            onPress={accessMedicalInfo}
            variant="secondary"
            accessibilityLabel="Access medical information"
            accessibilityHint="View stored medical information and emergency instructions"
            announcement="Opening medical information"
          />
        </View>

        <View style={[styles.helpSection, theme === 'high-contrast' && styles.highContrastHelpSection]}>
          <Text 
            style={[
              styles.helpTitle, 
              { fontSize: 18 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            Important Numbers
          </Text>
          <Text 
            style={[
              styles.helpText, 
              { fontSize: 14 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            • Emergency Services: 911{'\n'}
            • Poison Control: 1-800-222-1222{'\n'}
            • Crisis Text Line: Text HOME to 741741{'\n'}
            • National Suicide Prevention: 988
          </Text>
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
    marginTop: 8,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    color: '#666666',
    textAlign: 'center',
  },
  emergencyAlert: {
    backgroundColor: '#FF3B30',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  highContrastAlert: {
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#000000',
  },
  emergencyText: {
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  highContrastEmergencyText: {
    color: '#000000',
  },
  cancelButton: {
    minWidth: 120,
  },
  sosSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginBottom: 16,
  },
  sosButton: {
    marginBottom: 12,
  },
  sosDescription: {
    fontFamily: 'Inter-Regular',
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
  },
  contactsSection: {
    marginBottom: 32,
  },
  contactCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  highContrastCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  contactName: {
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginLeft: 12,
  },
  contactDetails: {
    fontFamily: 'Inter-Regular',
    color: '#666666',
    marginBottom: 12,
    marginLeft: 36,
  },
  utilitiesSection: {
    marginBottom: 32,
  },
  helpSection: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  highContrastHelpSection: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
  },
  helpTitle: {
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginBottom: 8,
  },
  helpText: {
    fontFamily: 'Inter-Regular',
    color: '#000000',
    lineHeight: 20,
  },
  highContrastText: {
    color: '#000000',
  },
});