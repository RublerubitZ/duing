import type { Storage } from './index';

// React Native 구현 placeholder.
// Expo 도입 시: pnpm add @react-native-async-storage/async-storage 후
//   import AsyncStorage from '@react-native-async-storage/async-storage';
//   export const nativeStorage: Storage = { ...AsyncStorage };

export const nativeStorage: Storage = {
  async getItem() {
    throw new Error('[@duing/storage/native] @react-native-async-storage/async-storage 미설치');
  },
  async setItem() {
    throw new Error('[@duing/storage/native] @react-native-async-storage/async-storage 미설치');
  },
  async removeItem() {
    throw new Error('[@duing/storage/native] @react-native-async-storage/async-storage 미설치');
  },
};
