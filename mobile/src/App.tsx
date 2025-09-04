import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';

import { store } from './store';
import { AppNavigator } from './navigation/AppNavigator';
import { AuthProvider } from './providers/AuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { I18nProvider } from './providers/I18nProvider';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LoadingProvider } from './providers/LoadingProvider';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
    },
  },
});

const App: React.FC = () => {
  useEffect(() => {
    // Initialize app
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Register for push notifications
      await registerForPushNotifications();
      
      // Load cached user preferences
      await loadUserPreferences();
      
    } catch (error) {
      console.error('App initialization error:', error);
    }
  };

  const registerForPushNotifications = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Failed to get push token for push notification!');
        return;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;
      console.log('Push token:', token);

      // Store token in AsyncStorage
      await AsyncStorage.setItem('pushToken', token);

    } catch (error) {
      console.error('Error getting push token:', error);
    }
  };

  const loadUserPreferences = async () => {
    try {
      const preferences = await AsyncStorage.getItem('userPreferences');
      if (preferences) {
        const parsedPreferences = JSON.parse(preferences);
        // Apply user preferences
        console.log('Loaded user preferences:', parsedPreferences);
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  };

  return (
    <ErrorBoundary>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemeProvider>
              <I18nProvider>
                <LoadingProvider>
                  <NavigationContainer>
                    <StatusBar style="auto" />
                    <AppNavigator />
                    <Toast />
                  </NavigationContainer>
                </LoadingProvider>
              </I18nProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </Provider>
    </ErrorBoundary>
  );
};

export default App;
