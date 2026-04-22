import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Car, Users, Wheelchair } from 'lucide-react-native';
import AccessibleButton from '@/components/AccessibleButton';
import { speechService } from '@/services/speechService';
import { accessibilityService } from '@/services/accessibilityService';
import { AccessibleFacility } from '@/types/accessibility';

export default function FacilitiesScreen() {
  const [facilities, setFacilities] = useState<AccessibleFacility[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    speechService.announceNavigation('Nearby Facilities', 'Find accessible restrooms, parking, and entrances in your area');
    loadNearbyFacilities();
  }, []);

  const loadNearbyFacilities = async () => {
    setIsLoading(true);
    speechService.speak('Loading nearby accessible facilities');

    // Simulate API call
    setTimeout(() => {
      const mockFacilities: AccessibleFacility[] = [
        {
          id: '1',
          name: 'Central Library',
          type: 'restroom',
          location: { latitude: 40.7128, longitude: -74.0060, address: '123 Main St' },
          description: 'Accessible restroom with grab bars and wide entrance',
          accessibilityFeatures: ['Grab bars', 'Wide entrance', 'Automatic door', 'Baby changing station'],
          verified: true,
        },
        {
          id: '2',
          name: 'City Hall Parking',
          type: 'parking',
          location: { latitude: 40.7130, longitude: -74.0058, address: '456 Government Way' },
          description: 'Designated accessible parking spaces near main entrance',
          accessibilityFeatures: ['8 accessible spaces', 'Close to entrance', 'Level surface', 'Well-lit'],
          verified: true,
        },
        {
          id: '3',
          name: 'Metro Station Entrance',
          type: 'entrance',
          location: { latitude: 40.7125, longitude: -74.0065, address: '789 Transit Ave' },
          description: 'Fully accessible entrance with elevator',
          accessibilityFeatures: ['Elevator access', 'Tactile guidance', 'Audio announcements', 'Wide turnstiles'],
          verified: true,
        },
        {
          id: '4',
          name: 'Shopping Center',
          type: 'elevator',
          location: { latitude: 40.7132, longitude: -74.0055, address: '321 Commerce Blvd' },
          description: 'Large elevator with braille buttons and voice announcements',
          accessibilityFeatures: ['Braille buttons', 'Voice announcements', 'Large cab', 'Low controls'],
          verified: false,
        },
        {
          id: '5',
          name: 'Park Entrance Ramp',
          type: 'ramp',
          location: { latitude: 40.7120, longitude: -74.0070, address: '654 Green Park Dr' },
          description: 'Accessible ramp to park facilities',
          accessibilityFeatures: ['Gentle slope', 'Handrails', 'Non-slip surface', 'Rest areas'],
          verified: true,
        },
      ];

      setFacilities(mockFacilities);
      setIsLoading(false);
      speechService.speak(`Found ${mockFacilities.length} accessible facilities nearby`);
    }, 1500);
  };

  const filterFacilities = (type: string) => {
    setSelectedType(type);
    const typeLabels: Record<string, string> = {
      all: 'all facilities',
      restroom: 'restrooms',
      parking: 'parking',
      entrance: 'entrances',
      elevator: 'elevators',
      ramp: 'ramps',
    };
    speechService.speak(`Filtering ${typeLabels[type] || type}`);
  };

  const getFacilityIcon = (type: string) => {
    const theme = accessibilityService.getColorTheme();
    const iconColor = theme === 'high-contrast' ? '#000000' : '#007AFF';
    
    switch (type) {
      case 'restroom': return <Users size={24} color={iconColor} />;
      case 'parking': return <Car size={24} color={iconColor} />;
      case 'entrance': return <MapPin size={24} color={iconColor} />;
      case 'elevator': return <Wheelchair size={24} color={iconColor} />;
      case 'ramp': return <Wheelchair size={24} color={iconColor} />;
      default: return <MapPin size={24} color={iconColor} />;
    }
  };

  const getDirections = (facility: AccessibleFacility) => {
    speechService.speak(`Getting directions to ${facility.name}. ${facility.description}`);
    accessibilityService.triggerHapticFeedback('medium');
  };

  const filteredFacilities = selectedType === 'all' 
    ? facilities 
    : facilities.filter(f => f.type === selectedType);

  const theme = accessibilityService.getColorTheme();
  const textScale = accessibilityService.getTextScale();

  const renderFacility = ({ item: facility, index }: { item: AccessibleFacility; index: number }) => (
    <View 
      style={[
        styles.facilityCard,
        theme === 'high-contrast' && styles.highContrastCard
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${facility.name}, ${facility.type}, ${facility.verified ? 'verified' : 'unverified'}`}
      accessibilityHint={facility.description}
    >
      <View style={styles.facilityHeader}>
        {getFacilityIcon(facility.type)}
        <View style={styles.facilityInfo}>
          <Text 
            style={[
              styles.facilityName, 
              { fontSize: 18 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            {facility.name}
          </Text>
          <Text 
            style={[
              styles.facilityAddress, 
              { fontSize: 14 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
          >
            {facility.location.address}
          </Text>
        </View>
        {facility.verified && (
          <View style={[styles.verifiedBadge, theme === 'high-contrast' && styles.highContrastBadge]}>
            <Text 
              style={[
                styles.verifiedText, 
                { fontSize: 10 * textScale },
                theme === 'high-contrast' && styles.highContrastBadgeText
              ]}
            >
              VERIFIED
            </Text>
          </View>
        )}
      </View>

      <Text 
        style={[
          styles.facilityDescription, 
          { fontSize: 14 * textScale },
          theme === 'high-contrast' && styles.highContrastText
        ]}
      >
        {facility.description}
      </Text>

      <View style={styles.featuresContainer}>
        {facility.accessibilityFeatures.map((feature, idx) => (
          <Text 
            key={idx}
            style={[
              styles.featureTag, 
              { fontSize: 12 * textScale },
              theme === 'high-contrast' && styles.highContrastFeature
            ]}
          >
            {feature}
          </Text>
        ))}
      </View>

      <AccessibleButton
        title="Get Directions"
        onPress={() => getDirections(facility)}
        variant="primary"
        style={styles.directionsButton}
        accessibilityLabel={`Get directions to ${facility.name}`}
        accessibilityHint="Navigate to this accessible facility"
        announcement={`Getting directions to ${facility.name}`}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, theme === 'high-contrast' && styles.highContrastContainer]}>
      <View style={styles.header}>
        <MapPin size={32} color={theme === 'high-contrast' ? '#000000' : '#007AFF'} />
        <Text 
          style={[
            styles.title, 
            { fontSize: 28 * textScale },
            theme === 'high-contrast' && styles.highContrastText
          ]}
          accessibilityRole="header"
          accessibilityLevel={1}
        >
          Nearby Facilities
        </Text>
        <Text 
          style={[
            styles.subtitle, 
            { fontSize: 16 * textScale },
            theme === 'high-contrast' && styles.highContrastText
          ]}
        >
          Accessible facilities in your area
        </Text>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
        accessibilityLabel="Facility type filters"
      >
        {[
          { key: 'all', label: 'All' },
          { key: 'restroom', label: 'Restrooms' },
          { key: 'parking', label: 'Parking' },
          { key: 'entrance', label: 'Entrances' },
          { key: 'elevator', label: 'Elevators' },
          { key: 'ramp', label: 'Ramps' },
        ].map((filter) => (
          <AccessibleButton
            key={filter.key}
            title={filter.label}
            onPress={() => filterFacilities(filter.key)}
            variant={selectedType === filter.key ? 'primary' : 'secondary'}
            style={styles.filterButton}
            accessibilityLabel={`Filter by ${filter.label}`}
            accessibilityHint={`Show only ${filter.label.toLowerCase()}`}
            announcement={`Filtering by ${filter.label}`}
          />
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text 
            style={[
              styles.loadingText, 
              { fontSize: 16 * textScale },
              theme === 'high-contrast' && styles.highContrastText
            ]}
            accessibilityLiveRegion="polite"
          >
            Loading nearby facilities...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredFacilities}
          renderItem={renderFacility}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.facilitiesList}
          accessibilityLabel="List of nearby accessible facilities"
          showsVerticalScrollIndicator={false}
        />
      )}
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
  header: {
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
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
  filterContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  filterContent: {
    paddingRight: 20,
  },
  filterButton: {
    marginRight: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 40,
  },
  facilitiesList: {
    padding: 20,
    paddingTop: 0,
  },
  facilityCard: {
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
  facilityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  facilityInfo: {
    flex: 1,
    marginLeft: 12,
  },
  facilityName: {
    fontFamily: 'Inter-SemiBold',
    color: '#000000',
    marginBottom: 2,
  },
  facilityAddress: {
    fontFamily: 'Inter-Regular',
    color: '#666666',
  },
  verifiedBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  highContrastBadge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#000000',
  },
  verifiedText: {
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  highContrastBadgeText: {
    color: '#000000',
  },
  facilityDescription: {
    fontFamily: 'Inter-Regular',
    color: '#000000',
    marginBottom: 12,
    lineHeight: 20,
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  featureTag: {
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 6,
    fontFamily: 'Inter-Regular',
    color: '#666666',
  },
  highContrastFeature: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#000000',
    color: '#000000',
  },
  directionsButton: {
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontFamily: 'Inter-Regular',
    color: '#666666',
    textAlign: 'center',
  },
  highContrastText: {
    color: '#000000',
  },
});