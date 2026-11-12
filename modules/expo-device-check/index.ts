import { requireNativeModule } from 'expo-modules-core';

export interface DeviceCheckNativeModule {
  isSupported(): Promise<boolean>;
  generateToken(): Promise<string>;
}

export default requireNativeModule<DeviceCheckNativeModule>('DeviceCheck');
