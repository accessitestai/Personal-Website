import { AccessibilityInfo, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AccessibilitySettings } from '@/types/accessibility';

export class AccessibilityService {
  private static instance: AccessibilityService;
  private settings: AccessibilitySettings = {
    highContrast: false,
    largeText: false,
    voiceSpeed: 0.8,
    hapticFeedback: true,
    audioDescriptions: true,
    reducedMotion: false,
  };

  static getInstance(): AccessibilityService {
    if (!AccessibilityService.instance) {
      AccessibilityService.instance = new AccessibilityService();
    }
    return AccessibilityService.instance;
  }

  async initialize(): Promise<void> {
    if (Platform.OS !== 'web') {
      // Check if screen reader is enabled
      const screenReaderEnabled = await AccessibilityInfo.isScreenReaderEnabled();
      if (screenReaderEnabled) {
        this.settings.audioDescriptions = true;
      }

      // Check if reduce motion is enabled
      const reduceMotionEnabled = await AccessibilityInfo.isReduceMotionEnabled();
      this.settings.reducedMotion = reduceMotionEnabled;
    }
  }

  triggerHapticFeedback(type: 'light' | 'medium' | 'heavy' = 'medium'): void {
    if (!this.settings.hapticFeedback || Platform.OS === 'web') {
      return;
    }

    try {
      switch (type) {
        case 'light':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'heavy':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
      }
    } catch (error) {
      console.warn('Haptic feedback not available:', error);
    }
  }

  getSettings(): AccessibilitySettings {
    return { ...this.settings };
  }

  updateSettings(newSettings: Partial<AccessibilitySettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  getTextScale(): number {
    return this.settings.largeText ? 1.5 : 1;
  }

  getColorTheme(): 'light' | 'dark' | 'high-contrast' {
    if (this.settings.highContrast) {
      return 'high-contrast';
    }
    return 'light';
  }

  shouldReduceMotion(): boolean {
    return this.settings.reducedMotion;
  }

  announceForScreenReader(message: string): void {
    if (Platform.OS !== 'web') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }
}

export const accessibilityService = AccessibilityService.getInstance();