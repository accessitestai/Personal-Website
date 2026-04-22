import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

export class SpeechService {
  private static instance: SpeechService;
  private isSpeaking: boolean = false;
  private speechQueue: string[] = [];
  private settings = {
    rate: 0.8,
    pitch: 1.0,
    language: 'en-US',
  };

  static getInstance(): SpeechService {
    if (!SpeechService.instance) {
      SpeechService.instance = new SpeechService();
    }
    return SpeechService.instance;
  }

  async speak(text: string, interrupt: boolean = false): Promise<void> {
    if (Platform.OS === 'web') {
      // Web fallback using Web Speech API
      this.speakWeb(text, interrupt);
      return;
    }

    if (interrupt) {
      await this.stop();
      this.speechQueue = [];
    }

    if (this.isSpeaking && !interrupt) {
      this.speechQueue.push(text);
      return;
    }

    this.isSpeaking = true;
    
    try {
      await Speech.speak(text, {
        rate: this.settings.rate,
        pitch: this.settings.pitch,
        language: this.settings.language,
        onDone: () => {
          this.isSpeaking = false;
          this.processQueue();
        },
        onError: () => {
          this.isSpeaking = false;
          this.processQueue();
        },
      });
    } catch (error) {
      this.isSpeaking = false;
      console.error('Speech error:', error);
    }
  }

  private speakWeb(text: string, interrupt: boolean): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (interrupt) {
        window.speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.settings.rate;
      utterance.pitch = this.settings.pitch;
      utterance.lang = this.settings.language;
      
      utterance.onend = () => {
        this.isSpeaking = false;
        this.processQueue();
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.processQueue();
      };

      this.isSpeaking = true;
      window.speechSynthesis.speak(utterance);
    }
  }

  private processQueue(): void {
    if (this.speechQueue.length > 0) {
      const nextText = this.speechQueue.shift();
      if (nextText) {
        this.speak(nextText);
      }
    }
  }

  async stop(): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } else {
      await Speech.stop();
    }
    this.isSpeaking = false;
  }

  updateSettings(newSettings: Partial<typeof this.settings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  announceNavigation(screenName: string, description?: string): void {
    const announcement = `Navigated to ${screenName}${description ? `. ${description}` : ''}`;
    this.speak(announcement);
  }

  announceAction(action: string): void {
    this.speak(`${action} activated`);
  }

  announceError(error: string): void {
    this.speak(`Error: ${error}`, true);
  }

  announceSuccess(message: string): void {
    this.speak(`Success: ${message}`);
  }
}

export const speechService = SpeechService.getInstance();