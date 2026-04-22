import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Navigation } from 'lucide-react-native';
import AccessibleButton from '@/components/AccessibleButton';
import { speechService } from '@/services/speechService';
import { accessibilityService } from '@/services/accessibilityService';

interface RouteOption {
  id: string;
  duration: string;
  distance: string;
  accessibility: 'excellent' | 'good' | 'limited';
  features: string[];
  warnings: string[];
}

export default function RoutesScreen() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    speechService.announceNavigation('Route Planner', 'Plan accessible routes with elevation and barrier information');
  }, []);

  const searchRoutes = async () => {
    if (!origin.trim() || !destination.trim()) {
      speechService.announceError('Please enter both origin and destination');
      return;
    }

    setIsSearching(true);
    speechService.speak('Searching for accessible routes');
    
    // Simulate API call
    setTimeout(() => {
      const mockRoutes: RouteOption[] = [
        {
          id: '1',
          duration: '12 minutes',
          distance: '0.8 miles',
          accessibility: 'excellent',
          features: ['Sidewalks throughout', 'Accessible crossings', 'No steep inclines'],
          warnings: [],
        },
        {
          id: '2',
          duration: '15 minutes',
          distance: '1.1 miles',
          accessibility: 'good',
          features: ['Mostly accessible', 'Elevator available', 'Well-lit path'],
          warnings: ['One moderate incline (8% grade)'],
        },
        {
          id: '3',
          duration: '18 minutes',
          distance: '1.3 miles',
          accessibility: 'limited',
          features: ['Alternative route available'],
          warnings: ['Steep section ahead', 'Construction zone', 'Uneven sidewalk'],
        },
      ];
      
      setRoutes(mockRoutes);
      setIsSearching(false);
      speechService.speak(`Found ${mockRoutes.length} route options. Best accessibility rating: ${mockRoutes[0].accessibility}`);
    }, 2000);
  };

  const selectRoute = (route: RouteOption) => {
    speechService.speak(`Selected route: ${route.duration}, ${route.distance}. Accessibility rating: ${route.accessibility}. Starting navigation.`);
    accessibilityService.triggerHapticFeedback('heavy');
  };

  const getAccessibilityColor = (level: string) => {
    const theme = accessibilityService.getColorTheme();
    if (theme === 'high-contrast') return '#000000';
    
    switch (level) {
      case 'excellent': return '#34C759';
      case 'good': return '#FF9500';
      case 'limited': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  const theme = accessibilityService.getColorTheme();
  const textScale = accessibilityService.getTextScale();

  return (
    <SafeAreaView style={[styles.container, theme === 'high-contrast' && styles.highContrastContainer]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel="Route planner screen"
      >
        <View style={styles.header}>
          <Navigation size={32} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />
          <Text 
            style={[
              styles.title, 
              { fontSize: 28 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityRole="header"
            accessibilityLevel={1}
          >
            Route Planner
          </Text>
          <Text 
            style={[
              styles.subtitle, 
              { fontSize: 16 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            Find accessible routes with detailed barrier information
          </Text>
        </View>

        <View style={styles.inputSection}>
          <View style={styles.inputContainer}>
            <MapPin size={20} color={theme === 'high-contrast' ? '#000000' : '#666666'} />
            <TextInput
              style={[
                styles.input,
                { fontSize: 16 * textScale },
                theme === 'high-contrast' && styles.highContrastInput
              ]}
              placeholder="Starting location"
              value={origin}
              onChangeText={setOrigin}
              accessibilityLabel="Starting location"
              accessibilityHint="Enter your starting point for route planning"
              returnKeyType="next"
            />
          </View>

          <View style={styles.inputContainer}>
            <MapPin size={20} color={theme === 'high-contrast' ? '#000000' : '#666666'} />
            <TextInput
              style={[
                styles.input,
                { fontSize: 16 * textScale },
                theme === 'high-contrast' && styles.highContrastInput
              ]}
              placeholder="Destination"
              value={destination}
              onChangeText={setDestination}
              accessibilityLabel="Destination"
              accessibilityHint="Enter your destination for route planning"
              returnKeyType="search"
              onSubmitEditing={searchRoutes}
            />
          </View>

          <AccessibleButton
            title={isSearching ? "Searching..." : "Find Accessible Routes"}
            onPress={searchRoutes}
            disabled={isSearching}
            accessibilityLabel="Find accessible routes"
            accessibilityHint="Search for routes with accessibility information"
            announcement="Searching for accessible routes"
          />
        </View>

        {routes.length > 0 && (
          <View style={styles.routesSection}>
            <Text 
              style={[
                styles.sectionTitle, 
                { fontSize: 22 * textScale },
                theme === 'high-contrast' && styles.highContrastText
              ]}
              accessibilityRole="header"
              accessibilityLevel={2}
            >
              Route Options
            </Text>

            {routes.map((route, index) => (
              <View 
                key={route.id} 
                style={[
                  styles.routeCard,
                  theme === 'high-contrast' && styles.highContrastCard
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Route option ${index + 1}: ${route.duration}, ${route.distance}, accessibility ${route.accessibility}`}
              >
                <View style={styles.routeHeader}>
                  <View style={styles.routeInfo}>
                    <Text 
                      style={[
                        styles.routeTime, 
                        { fontSize: 18 * textScale },
                        theme === 'high-contrast' && styles.highContrastText
                      ]}
                    >
                      {route.duration}
                    </Text>
                    <Text 
                      style={[
                        styles.routeDistance, 
                        { fontSize: 14 * textScale },
                        theme === 'high-contrast' && styles.highContrastText
                      ]}
                    >
                      {route.distance}
                    </Text>
                  </View>
                  <View style={styles.accessibilityBadge}>
                    <Text 
                      style={[
                        styles.accessibilityText,
                        { fontSize: 12 * textScale },
                        { color: getAccessibilityColor(route.accessibility) }
                      ]}
                    >
                      {route.accessibility.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.routeFeatures}>
                  {route.features.map((feature, idx) => (
                    <Text 
                      key={idx}
                      style={[
                        styles.featureText, 
                        { fontSize: 14 * textScale },
                        theme === 'high-contrast' && styles.highContrastText
                      ]}
                    >
                      ✓ {feature}
                    </Text>
                  ))}
                  {route.warnings.map((warning, idx) => (
                    <Text 
                      key={idx}
                      style={[
                        styles.warningText, 
                        { fontSize: 14 * textScale },
                        theme === 'high-contrast' && styles.highContrastText
                      ]}
                    >
                      ⚠ {warning}
                    </Text>
                  ))}
                </View>

                <AccessibleButton
                  title="Select This Route"
                  onPress={() => selectRoute(route)}
                  variant="primary"
                  accessibilityLabel={`Select route ${index + 1}`}
                  accessibilityHint="Start navigation with this route"
                  announcement={`Starting navigation with route ${index + 1}`}
                />
              </View>
            ))}
          </View>
        )}
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
  inputSection: {
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    minHeight: 56,
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontFamily: 'Inter-Regular',
    color: '#000000',
  },
  highContrastInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
  },
  routesSection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginBottom: 16,
  },
  routeCard: {
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
  routeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  routeInfo: {
    flex: 1,
  },
  routeTime: {
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
  },
  routeDistance: {
    fontFamily: 'Inter-Regular',
    color: '#666666',
    marginTop: 2,
  },
  accessibilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#E5E5EA',
  },
  accessibilityText: {
    fontFamily: 'Inter-SemiBold',
  },
  routeFeatures: {
    marginBottom: 16,
  },
  featureText: {
    fontFamily: 'Inter-Regular',
    color: '#34C759',
    marginBottom: 4,
  },
  warningText: {
    fontFamily: 'Inter-Regular',
    color: '#FF9500',
    marginBottom: 4,
  },
  highContrastText: {
    color: '#000000',
  },
});