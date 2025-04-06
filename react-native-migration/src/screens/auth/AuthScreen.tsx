import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../../context/AuthContext';
import { theme } from '../../theme';

type AuthMode = 'login' | 'register';

const AuthScreen = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const { user, signIn, signUp, isSigningIn, isSigningUp } = useAuth();
  const navigation = useNavigation();
  const { width, height } = Dimensions.get('window');

  // Clear error when switching modes
  useEffect(() => {
    setError('');
  }, [mode]);

  // If user is already logged in, redirect to main app
  useEffect(() => {
    if (user) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' as never }],
      });
    }
  }, [user, navigation]);

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    // Clear form
    setError('');
  };

  const validateForm = () => {
    if (!username.trim()) {
      setError('Username is required');
      return false;
    }

    if (!password.trim()) {
      setError('Password is required');
      return false;
    }

    if (mode === 'register') {
      if (!displayName.trim()) {
        setError('Display name is required');
        return false;
      }

      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return false;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    try {
      if (!validateForm()) return;

      if (mode === 'login') {
        await signIn({ username, password });
      } else {
        await signUp({ username, displayName, password });
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        {/* Left Side - Form */}
        <View style={styles.formContainer}>
          <View style={styles.logoContainer}>
            <Text style={styles.appName}>Strive</Text>
            <Text style={styles.tagline}>Fitness Redefined</Text>
          </View>

          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </Text>
            <Text style={styles.formSubtitle}>
              {mode === 'login'
                ? 'Welcome back! Please sign in to continue.'
                : 'Join Strive to start your fitness journey.'}
            </Text>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={18} color={theme.colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputsContainer}>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Username</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={theme.colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Username"
                  placeholderTextColor={theme.colors.textSecondary}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {mode === 'register' && (
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Display Name</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="text-outline"
                    size={18}
                    color={theme.colors.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Display Name"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                </View>
              </View>
            )}

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={theme.colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={theme.colors.textSecondary}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {mode === 'register' && (
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={theme.colors.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm Password"
                    placeholderTextColor={theme.colors.textSecondary}
                    secureTextEntry={!showPassword}
                  />
                </View>
              </View>
            )}

            {mode === 'login' && (
              <TouchableOpacity style={styles.forgotPassword}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={isSigningIn || isSigningUp}
            >
              {isSigningIn || isSigningUp ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.switchModeContainer}>
              <Text style={styles.switchModeText}>
                {mode === 'login'
                  ? "Don't have an account?"
                  : 'Already have an account?'}
              </Text>
              <TouchableOpacity onPress={toggleMode}>
                <Text style={styles.switchModeButton}>
                  {mode === 'login' ? 'Sign Up' : 'Sign In'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Right Side - Hero (only shown on wide screens) */}
        {width > 768 && (
          <View style={styles.heroContainer}>
            <ImageBackground
              source={require('../../../assets/fitness-hero.jpg')}
              style={styles.heroBackground}
              resizeMode="cover"
            >
              <LinearGradient
                colors={[
                  'rgba(17, 24, 39, 0.9)',
                  'rgba(17, 24, 39, 0.75)',
                  'rgba(17, 24, 39, 0.6)',
                ]}
                style={styles.heroGradient}
              >
                <View style={styles.heroContent}>
                  <Text style={styles.heroTitle}>Elevate Your Fitness Journey</Text>
                  <Text style={styles.heroDescription}>
                    Personalized workouts, nutrition tracking, and health insights all in one place.
                  </Text>

                  <View style={styles.featureList}>
                    <View style={styles.featureItem}>
                      <Ionicons name="barbell-outline" size={24} color={theme.colors.primary} />
                      <Text style={styles.featureText}>Customizable workout plans</Text>
                    </View>
                    <View style={styles.featureItem}>
                      <Ionicons name="nutrition-outline" size={24} color={theme.colors.primary} />
                      <Text style={styles.featureText}>Comprehensive nutrition tracking</Text>
                    </View>
                    <View style={styles.featureItem}>
                      <Ionicons name="stats-chart-outline" size={24} color={theme.colors.primary} />
                      <Text style={styles.featureText}>Detailed health analytics</Text>
                    </View>
                  </View>
                </View>
              </LinearGradient>
            </ImageBackground>
          </View>
        )}
      </KeyboardAvoidingView>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
    flexDirection: 'row',
  },
  formContainer: {
    flex: 1,
    padding: theme.spacing.lg,
    justifyContent: 'center',
    maxWidth: 500,
    alignSelf: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  appName: {
    fontSize: 32,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    letterSpacing: 1,
  },
  tagline: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    marginTop: 4,
  },
  formHeader: {
    marginBottom: theme.spacing.lg,
  },
  formTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  formSubtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${theme.colors.error}20`,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.error,
    marginLeft: 8,
    fontSize: theme.fontSize.sm,
    flex: 1,
  },
  inputsContainer: {
    width: '100%',
  },
  inputWrapper: {
    marginBottom: theme.spacing.md,
  },
  inputLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 50,
  },
  inputIcon: {
    marginHorizontal: theme.spacing.sm,
  },
  input: {
    flex: 1,
    height: '100%',
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
  },
  eyeIcon: {
    padding: theme.spacing.sm,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: theme.spacing.lg,
  },
  forgotPasswordText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  submitButtonText: {
    color: 'white',
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  switchModeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchModeText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  switchModeButton: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.sm,
    marginLeft: 4,
  },
  heroContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  heroBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroGradient: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  heroContent: {
    maxWidth: 500,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: theme.fontWeight.bold,
    color: 'white',
    marginBottom: theme.spacing.md,
  },
  heroDescription: {
    fontSize: theme.fontSize.lg,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: theme.spacing.xl,
  },
  featureList: {
    marginTop: theme.spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  featureText: {
    fontSize: theme.fontSize.md,
    color: 'white',
    marginLeft: theme.spacing.md,
  },
});

export default AuthScreen;