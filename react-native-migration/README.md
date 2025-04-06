# Strive Fitness - React Native App

This is the React Native implementation of the Strive Fitness application, a comprehensive men's fitness tracker.

## Features

- **Customizable Dashboard**: Personalized health and fitness tracking widgets
- **Workout Management**: Create, edit, and track workout routines
- **Exercise Tracking**: Monitor sets, reps, weights, and personal bests
- **Nutrition Tracking**: Log food intake with comprehensive macronutrient data
- **Health Metrics**: Track vital statistics and upload medical test results
- **Health Platform Integrations**: Connect with Apple Health, Garmin, Android Health, WHOOP, and Oura Ring
- **Medication & Supplements**: Track medication schedules and supplement intake

## Getting Started

### Prerequisites

- Node.js (v16+)
- Yarn or npm package manager
- Expo CLI
- For iOS development: macOS, Xcode
- For Android development: Android Studio, JDK

### Installation

1. Clone this repository
2. Install dependencies
3. Copy the environment file and add your API keys

### Development

Start the development server, which will open the Expo developer tools in the browser. You can run the app on:
- iOS Simulator
- Android Emulator
- Physical device using the Expo Go app (scan the QR code)

### Building for Production

#### For EAS (Expo Application Services) Builds

1. Prepare your app for building
2. Build for development, production, or a specific platform
3. Submit to app stores when ready

## Project Structure

```
strive-fitness/
├── assets/               # Images, fonts, and other static files
├── src/
│   ├── api/              # API client and service integrations
│   ├── components/       # Reusable UI components
│   ├── context/          # React Context providers
│   ├── hooks/            # Custom React hooks
│   ├── navigation/       # Navigation configuration
│   ├── screens/          # Screen components
│   ├── theme/            # Theme configuration and styles
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Utility functions
├── app.json              # Expo configuration
├── babel.config.js       # Babel configuration
├── eas.json              # EAS Build configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Project dependencies
```

## External Services

The app integrates with the following services:

- **Nutritionix API**: For food database access
- **OpenFoodFacts API**: For barcode scanning nutrition information
- **Health Platform APIs**: For syncing health and fitness data

## License

This project is proprietary and confidential.
