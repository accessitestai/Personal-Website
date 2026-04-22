import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Mic, MicOff } from 'lucide-react-native';
import { speechService } from '@/services/speechService';
import { accessibilityService } from '@/services/accessibilityService';

interface VoiceAssistantProps {
  onCommand: (command: string) => void;
}

export default function VoiceAssistant({ onCommand }: VoiceAssistantProps) {
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState<string>('');

  const startListening = () => {
    if (Platform.OS === 'web') {
      startWebSpeechRecognition();
    } else {
      // For native platforms, you would implement native speech recognition
      speechService.speak('Voice recognition not available on this platform');
    }
  };

  const startWebSpeechRecognition = () => {
    if (typeof window === 'undefined' || !('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      speechService.speak('Speech recognition not supported in this browser');
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      speechService.speak('Listening for command');
      accessibilityService.triggerHapticFeedback('light');
    };

    recognition.onresult = (event: any) => {
      const command = event.results[0][0].transcript.toLowerCase();
      setLastCommand(command);
      processVoiceCommand(command);
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      speechService.speak('Sorry, I didn\'t catch that. Please try again.');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const processVoiceCommand = (command: string) => {
    setIsListening(false);
    
    // Process common voice commands
    if (command.includes('navigate') || command.includes('go to')) {
      if (command.includes('home')) {
        onCommand('navigate_home');
        speechService.speak('Navigating to home');
      } else if (command.includes('route') || command.includes('directions')) {
        onCommand('navigate_routes');
        speechService.speak('Opening route planner');
      } else if (command.includes('facilities') || command.includes('restroom')) {
        onCommand('navigate_facilities');
        speechService.speak('Opening nearby facilities');
      } else if (command.includes('settings')) {
        onCommand('navigate_settings');
        speechService.speak('Opening settings');
      }
    } else if (command.includes('help') || command.includes('emergency')) {
      onCommand('emergency');
      speechService.speak('Activating emergency assistance');
    } else if (command.includes('repeat') || command.includes('again')) {
      speechService.speak('Last command was: ' + lastCommand);
    } else {
      speechService.speak('Command not recognized. Say navigate home, route planner, nearby facilities, settings, or help for emergency.');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      speechService.speak('Stopped listening');
    } else {
      startListening();
    }
  };

  const theme = accessibilityService.getColorTheme();
  const textScale = accessibilityService.getTextScale();

  return (
    <View style={[styles.container, theme === 'high-contrast' && styles.highContrastContainer]}>
      <TouchableOpacity
        style={[
          styles.micButton,
          isListening && styles.micButtonActive,
          theme === 'high-contrast' && styles.highContrastButton
        ]}
        onPress={toggleListening}
        accessibilityRole="button"
        accessibilityLabel={isListening ? 'Stop voice command' : 'Start voice command'}
        accessibilityHint="Double tap to activate voice commands"
      >
        {isListening ? (
          <MicOff size={32} color={theme === 'high-contrast' ? '#000000' : '#FFFFFF'} />
        ) : (
          <Mic size={32} color={theme === 'high-contrast' ? '#000000' : '#FFFFFF'} />
        )}
      </TouchableOpacity>
      
      <Text 
        style={[
          styles.statusText, 
          { fontSize: 16 * textScale },
          theme === 'high-contrast' && styles.highContrastText
        ]}
        accessibilityLiveRegion="polite"
      >
        {isListening ? 'Listening...' : 'Tap to speak'}
      </Text>
      
      {lastCommand && (
        <Text 
          style={[
            styles.lastCommand, 
            { fontSize: 14 * textScale },
            theme === 'high-contrast' && styles.highContrastText
          ]}
          accessibilityLabel={`Last command: ${lastCommand}`}
        >
          Last: "{lastCommand}"
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginVertical: 8,
  },
  highContrastContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  micButtonActive: {
    backgroundColor: '#FF3B30',
  },
  highContrastButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#000000',
  },
  statusText: {
    fontWeight: '600',
    color: '#333333',
    textAlign: 'center',
  },
  lastCommand: {
    color: '#666666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  highContrastText: {
    color: '#000000',
  },
});