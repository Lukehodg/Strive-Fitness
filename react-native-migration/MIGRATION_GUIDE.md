# Strive Fitness - Web to React Native Migration Guide

This document outlines the process and best practices for migrating features from the Strive Fitness web application to the React Native mobile app.

## Migration Process Overview

1. **Component Analysis**: Evaluate web components for mobile compatibility
2. **UI/UX Adaptation**: Adjust layouts for mobile form factors
3. **API Integration**: Ensure mobile API client compatibility
4. **Native Feature Integration**: Implement device-specific features
5. **Testing & Validation**: Cross-platform testing

## Component Migration Guidelines

### Web Components to React Native Equivalents

| Web Component | React Native Equivalent | Notes |
|---------------|-------------------------|-------|
| `<div>` | `<View>` | Basic container element |
| `<span>`, `<p>` | `<Text>` | All text must be wrapped in Text components |
| `<img>` | `<Image>` | Requires width/height specification |
| `<input>` | `<TextInput>` | Different props and behavior |
| `<button>` | `<Pressable>`, `<TouchableOpacity>` | Use Pressable for modern apps |
| CSS classes | StyleSheet objects | Use StyleSheet.create() |
| CSS flexbox | React Native flexbox | Similar but with differences |

### Style Conversion Notes

- React Native uses JavaScript objects for styles instead of CSS
- No CSS selectors or cascading - styles are applied directly to components
- All dimensions are unitless (no px, em, rem, etc.)
- No inheritance for most style properties

## API & State Management

- Continue using the same API endpoints with the new React Native client
- TanStack Query (React Query) works in React Native with minimal changes
- AsyncStorage replaces localStorage for persistent data

## Native Feature Integration

### Mobile-Specific Features to Implement

- **Camera Access**: Barcode scanning for nutrition tracking
- **Push Notifications**: Workout and medication reminders
- **Health Kit/Google Fit**: Native health data integration
- **Haptic Feedback**: For workout timer completion, etc.
- **Offline Mode**: Local data persistence when offline
- **Deep Linking**: For sharing workout plans

## Testing Strategy

1. Test each migrated component on both iOS and Android
2. Verify responsive layouts on different screen sizes
3. Test touch interactions (differ from mouse/keyboard)
4. Test with different network conditions
5. Verify native feature integrations

## Common Issues & Solutions

- **Navigation Differences**: Use React Navigation instead of browser-based routing
- **Form Handling**: Forms behave differently on mobile - keyboard management is important
- **Performance**: List rendering needs optimization (FlatList instead of map())
- **Platform Differences**: Some components render differently on iOS vs Android
- **Gesture Handling**: Touch interactions need different handling than mouse events

## Migration Checklist

- [ ] Update component to use React Native elements
- [ ] Convert styles to StyleSheet
- [ ] Adapt layout for mobile screen sizes
- [ ] Update navigation integration
- [ ] Test on iOS simulator
- [ ] Test on Android emulator
- [ ] Address platform-specific issues
- [ ] Implement native features if applicable
- [ ] Verify offline functionality
- [ ] Performance optimization

## Resources

- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/docs/getting-started)
