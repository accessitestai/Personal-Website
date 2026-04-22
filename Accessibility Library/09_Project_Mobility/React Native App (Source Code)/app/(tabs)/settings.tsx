import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Settings, Volume2, Eye, Smartphone } from 'lucide-react-native';
import AccessibleButton from '@/components/AccessibleButton';
import { speechService } from '@/services/speechService';
import { accessibilityService } from '@/services/accessibilityService';
import { AccessibilitySettings } from '@/types/accessibility';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AccessibilitySettings>(accessibilityService.getSettings());

  useEffect(() => {
    speechService.announceNavigation('Settings', 'Customize accessibility features and app preferences');
  }, []);

  const updateSetting = <K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    accessibilityService.updateSettings(newSettings);
    
    // Update speech service with new voice speed
    if (key === 'voiceSpeed') {
      speechService.updateSettings({ rate: value as number });
    }
    
    const settingLabels: Record<string, string> = {
      highContrast: 'High contrast mode',
      largeText: 'Large text',
      voiceSpeed: 'Voice speed',
      hapticFeedback: 'Haptic feedback',
      audioDescriptions: 'Audio descriptions',
      reducedMotion: 'Reduced motion',
    };
    
    speechService.speak(`${settingLabels[key]} ${typeof value === 'boolean' ? (value ? 'enabled' : 'disabled') : 'updated'}`);
    accessibilityService.triggerHapticFeedback('light');
  };

  const resetSettings = () => {
    const defaultSettings: AccessibilitySettings = {
      highContrast: false,
      largeText: false,
      voiceSpeed: 0.8,
      hapticFeedback: true,
      audioDescriptions: true,
      reducedMotion: false,
    };
    
    setSettings(defaultSettings);
    accessibilityService.updateSettings(defaultSettings);
    speechService.updateSettings({ rate: 0.8 });
    speechService.speak('Settings reset to default values');
  };

  const testVoice = () => {
    speechService.speak('This is a test of your current voice settings. The speech rate and voice preferences are working correctly.', true);
  };

  const theme = accessibilityService.getColorTheme();
  const textScale = accessibilityService.getTextScale();

  const SettingRow = ({ 
    icon, 
    title, 
    description, 
    value, 
    onValueChange, 
    accessibilityLabel,
    accessibilityHint 
  }: {
    icon: React.ReactNode;
    title: string;
    description: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    accessibilityLabel: string;
    accessibilityHint: string;
  }) => (
    <View style={[styles.settingRow, theme === 'high-contrast' && styles.highContrastRow]}>
      <View style={styles.settingIcon}>
        {icon}
      </View>
      <View style={styles.settingContent}>
        <Text 
          style={[
            styles.settingTitle, 
            { fontSize: 16 * textScale },
            theme === 'high-contrast' && styles.highContrastText
          ]}
        >
          {title}
        </Text>
        <Text 
          style={[
            styles.settingDescription, 
            { fontSize: 14 * textScale },
            theme === 'high-contrast' && styles.highContrastText
          ]}
        >
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityRole="switch"
        trackColor={{ 
          false: theme === 'high-contrast' ? '#CCCCCC' : '#E5E5EA', 
          true: theme === 'high-contrast' ? '#000000' : '#34C759' 
        }}
        thumbColor={value ? '#FFFFFF' : '#FFFFFF'}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, theme === 'high-contrast' && styles.highContrastContainer]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel="Settings screen"
      >
        <View style={styles.header}>
          <Settings size={32} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />
          <Text 
            style={[
              styles.title, 
              { fontSize: 28 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={1}
          >
            Settings
          </Text>
          <Text 
            style={[
              styles.subtitle, 
              { fontSize: 16 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            Customize your accessibility experience
          </Text>
        </View>

        <View style={styles.section}>
          <Text 
            style={[
              styles.sectionTitle, 
              { fontSize: 22 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={2}
          >
            Visual Accessibility
          </Text>

          <SettingRow
            icon={<Eye size={24} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />}
            title="High Contrast Mode"
            description="Increase contrast for better visibility"
            value={settings.highContrast}
            onValueChange={(value) => updateSetting('highContrast', value)}
            accessibilityLabel="High contrast mode toggle"
            accessibilityHint="Enables high contrast colors throughout the app"
          />

          <SettingRow
            icon={<Eye size={24} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />}
            title="Large Text"
            description="Increase text size for better readability"
            value={settings.largeText}
            onValueChange={(value) => updateSetting('largeText', value)}
            accessibilityLabel="Large text toggle"
            accessibilityHint="Makes all text larger and easier to read"
          />

          <SettingRow
            icon={<Smartphone size={24} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />}
            title="Reduced Motion"
            description="Minimize animations and movement effects"
            value={settings.reducedMotion}
            onValueChange={(value) => updateSetting('reducedMotion', value)}
            accessibilityLabel="Reduced motion toggle"
            accessibilityHint="Reduces animations that may cause discomfort"
          />
        </View>

        <View style={styles.section}>
          <Text 
            style={[
              styles.sectionTitle, 
              { fontSize: 22 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={2}
          >
            Audio & Voice
          </Text>

          <SettingRow
            icon={<Volume2 size={24} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />}
            title="Audio Descriptions"
            description="Provide detailed audio feedback for actions"
            value={settings.audioDescriptions}
            onValueChange={(value) => updateSetting('audioDescriptions', value)}
            accessibilityLabel="Audio descriptions toggle"
            accessibilityHint="Enables detailed voice feedback for all interactions"
          />

          <View style={[styles.settingRow, theme === 'high-contrast' && styles.highContrastRow]}>
            <Volume2 size={24} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />
            <View style={styles.settingContent}>
              <Text 
                style={[
                  styles.settingTitle, 
                  { fontSize: 16 * textScale },
                  theme === 'high-contrast' && styles.highContrastText
                ]}
              >
                Voice Speed: {Math.round(settings.voiceSpeed * 100)}%
              </Text>
              <Text 
                style={[
                  styles.settingDescription, 
                  { fontSize: 14 * textScale },
                  theme === 'high-contrast' && styles.highContrastText
                ]}
              >
                Adjust how fast the voice assistant speaks
              </Text>
            </View>
          </View>

          <View style={styles.sliderContainer}>
            <AccessibleButton
              title="Slower"
              onPress={() => updateSetting('voiceSpeed', Math.max(0.3, settings.voiceSpeed - 0.1))}
              variant="secondary"
              style={styles.speedButton}
              accessibilityLabel="Decrease voice speed"
              accessibilityHint="Make voice assistant speak slower"
            />
            <AccessibleButton
              title="Test Voice"
              onPress={testVoice}
              variant="primary"
              style={styles.testButton}
              accessibilityLabel="Test voice settings"
              accessibilityHint="Play a sample to test current voice speed"
            />
            <AccessibleButton
              title="Faster"
              onPress={() => updateSetting('voiceSpeed', Math.min(2.0, settings.voiceSpeed + 0.1))}
              variant="secondary"
              style={styles.speedButton}
              accessibilityLabel="Increase voice speed"
              accessibilityHint="Make voice assistant speak faster"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text 
            style={[
              styles.sectionTitle, 
              { fontSize: 22 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={2}
          >
            Physical Interaction
          </Text>

          <SettingRow
            icon={<Smartphone size={24} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />}
            title="Haptic Feedback"
            description="Physical vibration feedback for interactions"
            value={settings.hapticFeedback}
            onValueChange={(value) => updateSetting('hapticFeedback', value)}
            accessibilityLabel="Haptic feedback toggle"
            accessibilityHint="Enables vibration feedback when interacting with the app"
          />
        </View>

        <View style={styles.resetSection}>
          <AccessibleButton
            title="Reset All Settings"
            onPress={resetSettings}
            variant="secondary"
            accessibilityLabel="Reset all settings"
            accessibilityHint="Restore all accessibility settings to their default values"
            announcement="All settings reset to default"
          />
        </View>

        <View style={[styles.infoSection, theme === 'high-contrast' && styles.highContrastInfoSection]}>
          <Text 
            style={[
              styles.infoTitle, 
              { fontSize: 18 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            Accessibility Information
          </Text>
          <Text 
            style={[
              styles.infoText, 
              { fontSize: 14 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            This app follows WCAG 2.2 Level AAA accessibility standards. 
            All features are designed to work with screen readers and assistive technologies. 
            Voice commands are available throughout the app - just say "help" to learn more.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
          }
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
    marginBottom: 32,
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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  highContrastRow: {
    borderBottomColor: '#000000',
    borderBottomWidth: 2,
  },
  settingIcon: {
    marginRight: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginBottom: 2,
  },
  settingDescription: {
    fontFamily: 'Inter-Regular',
    color: '#666666',
    lineHeight: 18,
  },
  sliderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  speedButton: {
    flex: 1,
    paddingVertical: 8,
    minHeight: 44,
  },
  testButton: {
    flex: 2,
    paddingVertical: 8,
    minHeight: 44,
  },
  resetSection: {
    marginBottom: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  infoSection: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  highContrastInfoSection: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
  },
  infoTitle: {
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginBottom: 8,
  },
  infoText: {
    fontFamily: 'Inter-Regular',
    color: '#000000',
    lineHeight: 20,
  },
  highContrastText: {
    color: '#000000',
  },
});