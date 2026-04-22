export interface AccessibilitySettings {
  highContrast: boolean;
  largeText: boolean;
  voiceSpeed: number;
  hapticFeedback: boolean;
  audioDescriptions: boolean;
  reducedMotion: boolean;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface AccessibleFacility {
  id: string;
  name: string;
  type: 'restroom' | 'parking' | 'entrance' | 'elevator' | 'ramp';
  location: LocationData;
  description: string;
  accessibilityFeatures: string[];
  verified: boolean;
}

export interface RouteAccessibility {
  hasSteps: boolean;
  hasElevator: boolean;
  hasRamp: boolean;
  sidewalkCondition: 'good' | 'fair' | 'poor';
  surfaceType: string;
  inclineGrade: number;
  accessibleEntrances: AccessibleFacility[];
}