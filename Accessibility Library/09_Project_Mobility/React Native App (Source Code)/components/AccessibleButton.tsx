import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { speechService } from '@/services/speechService';
import { accessibilityService } from '@/services/accessibilityService';

interface AccessibleButtonProps {
  title: string;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'emergency';
  style?: ViewStyle;
  textStyle?: TextStyle;
  announcement?: string;
}

export default function AccessibleButton({
  title,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  variant = 'primary',
  style,
  textStyle,
  announcement,
}: AccessibleButtonProps) {
  const handlePress = () => {
    if (disabled) return;

    accessibilityService.triggerHapticFeedback('medium');
    
    if (announcement) {
      speechService.announceAction(announcement);
    } else {
      speechService.announceAction(title);
    }

    onPress();
  };

  const getButtonStyle = (): ViewStyle => {
    const theme = accessibilityService.getColorTheme();
    const baseStyle = styles.button;
    
    switch (variant) {
      case 'primary':
        return {
          ...baseStyle,
          backgroundColor: theme === 'high-contrast' ? '#000000' : '#007AFF',
          borderColor: theme === 'high-contrast' ? '#FFFFFF' : '#007AFF',
        };
      case 'secondary':
        return {
          ...baseStyle,
          backgroundColor: theme === 'high-contrast' ? '#FFFFFF' : '#F2F2F7',
          borderColor: theme === 'high-contrast' ? '#000000' : '#C6C6C8',
        };
      case 'emergency':
        return {
          ...baseStyle,
          backgroundColor: theme === 'high-contrast' ? '#000000' : '#FF3B30',
          borderColor: theme === 'high-contrast' ? '#FFFFFF' : '#FF3B30',
        };
      default:
        return baseStyle;
    }
  };

  const getTextStyle = (): TextStyle => {
    const theme = accessibilityService.getColorTheme();
    const textScale = accessibilityService.getTextScale();
    
    let color = '#FFFFFF';
    if (variant === 'secondary') {
      color = theme === 'high-contrast' ? '#000000' : '#000000';
    }

    return {
      ...styles.buttonText,
      color,
      fontSize: 18 * textScale,
      opacity: disabled ? 0.5 : 1,
    };
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style, disabled && styles.disabled]}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
    >
      <Text style={[getTextStyle(), textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});