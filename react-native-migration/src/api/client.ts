import { API_URL, DEV_API_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Type for API response
export type ApiResponse<T = any> = {
  data?: T;
  error?: string;
  status?: number;
};

// HTTP methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Get the appropriate API URL based on environment
export const getApiUrl = (): string => {
  return __DEV__ ? (DEV_API_URL || 'http://localhost:3000') : (API_URL || 'https://api.strive-fitness.com');
};

// Get the API client with auth token if available
export const getApiClient = async () => {
  const token = await AsyncStorage.getItem('auth_token');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return {
    baseUrl: getApiUrl(),
    headers,
  };
};

// Make an API request
export const makeRequest = async <T = any>(
  method: HttpMethod,
  endpoint: string,
  data?: any,
  customHeaders?: HeadersInit
): Promise<T> => {
  try {
    const client = await getApiClient();
    const url = `${client.baseUrl}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        ...client.headers,
        ...customHeaders,
      },
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    // For 204 No Content responses
    if (response.status === 204) {
      return {} as T;
    }

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return responseData;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

// Helper functions for common request types
export const get = <T = any>(endpoint: string, customHeaders?: HeadersInit): Promise<T> => {
  return makeRequest<T>('GET', endpoint, undefined, customHeaders);
};

export const post = <T = any>(endpoint: string, data: any, customHeaders?: HeadersInit): Promise<T> => {
  return makeRequest<T>('POST', endpoint, data, customHeaders);
};

export const put = <T = any>(endpoint: string, data: any, customHeaders?: HeadersInit): Promise<T> => {
  return makeRequest<T>('PUT', endpoint, data, customHeaders);
};

export const patch = <T = any>(endpoint: string, data: any, customHeaders?: HeadersInit): Promise<T> => {
  return makeRequest<T>('PATCH', endpoint, data, customHeaders);
};

export const del = <T = any>(endpoint: string, customHeaders?: HeadersInit): Promise<T> => {
  return makeRequest<T>('DELETE', endpoint, undefined, customHeaders);
};

// Export a default API object with all methods
export default {
  get,
  post,
  put,
  patch,
  delete: del,
};