/**
 * PWA 工具模块
 * 功能：Service Worker注册、推送通知、离线支持、安装提示
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    'beforeinstallprompt': BeforeInstallPromptEvent;
  }
}

// PWA状态类型
export interface PWAStatus {
  isInstallable: boolean;
  isInstalled: boolean;
  isOffline: boolean;
  swRegistered: boolean;
  pushEnabled: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
}

// 推送订阅类型
export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

class PWAManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private listeners: Set<(status: PWAStatus) => void> = new Set();
  private currentStatus: PWAStatus = {
    isInstallable: false,
    isInstalled: false,
    isOffline: !navigator.onLine,
    swRegistered: false,
    pushEnabled: false,
    deferredPrompt: null
  };

  constructor() {
    this.init();
  }

  private init() {
    // 监听网络状态
    window.addEventListener('online', () => this.updateStatus({ isOffline: false }));
    window.addEventListener('offline', () => this.updateStatus({ isOffline: true }));

    // 监听PWA安装提示
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.updateStatus({ 
        isInstallable: true, 
        deferredPrompt: e 
      });
    });

    // 监听PWA已安装
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.updateStatus({ 
        isInstallable: false, 
        isInstalled: true,
        deferredPrompt: null 
      });
      console.log('PWA was installed');
    });

    // 检查是否已安装
    if (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true) {
      this.updateStatus({ isInstalled: true });
    }
  }

  private updateStatus(updates: Partial<PWAStatus>) {
    this.currentStatus = { ...this.currentStatus, ...updates };
    this.listeners.forEach(listener => listener(this.currentStatus));
  }

  /**
   * 注册Service Worker
   */
  async registerServiceWorker(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return false;
    }

    try {
      this.swRegistration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });

      console.log('Service Worker registered:', this.swRegistration);
      this.updateStatus({ swRegistered: true });

      // 监听Service Worker状态变化
      this.swRegistration.addEventListener('updatefound', () => {
        const newWorker = this.swRegistration!.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 发现新版本，提示用户刷新
              this.showUpdateNotification();
            }
          });
        }
      });

      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }

  /**
   * 显示更新提示
   */
  private showUpdateNotification() {
    // 可以通过事件或回调通知UI层
    window.dispatchEvent(new CustomEvent('sw-update-available'));
  }

  /**
   * 更新Service Worker
   */
  async updateServiceWorker(): Promise<void> {
    if (this.swRegistration) {
      await this.swRegistration.update();
    }
  }

  /**
   * 跳过等待，立即激活新Service Worker
   */
  async skipWaiting(): Promise<void> {
    if (this.swRegistration && this.swRegistration.waiting) {
      this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  /**
   * 触发PWA安装
   */
  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) {
      console.warn('Installation prompt not available');
      return false;
    }

    try {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
        this.deferredPrompt = null;
        this.updateStatus({ 
          isInstallable: false,
          deferredPrompt: null 
        });
        return true;
      } else {
        console.log('User dismissed the install prompt');
        return false;
      }
    } catch (error) {
      console.error('Installation prompt failed:', error);
      return false;
    }
  }

  /**
   * 请求推送通知权限
   */
  async requestPushPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const enabled = permission === 'granted';
      this.updateStatus({ pushEnabled: enabled });
      return enabled;
    } catch (error) {
      console.error('Push permission request failed:', error);
      return false;
    }
  }

  /**
   * 订阅推送通知
   */
  async subscribePush(publicVapidKey: string): Promise<PushSubscriptionData | null> {
    if (!this.swRegistration) {
      console.warn('Service Worker not registered');
      return null;
    }

    try {
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicVapidKey) as BufferSource
      });

      const data: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!)))
        }
      };

      // 发送到服务器保存
      await this.savePushSubscription(data);
      
      this.updateStatus({ pushEnabled: true });
      return data;
    } catch (error) {
      console.error('Push subscription failed:', error);
      return null;
    }
  }

  /**
   * 取消推送订阅
   */
  async unsubscribePush(): Promise<boolean> {
    if (!this.swRegistration) return false;

    try {
      const subscription = await this.swRegistration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await this.deletePushSubscription();
        this.updateStatus({ pushEnabled: false });
      }
      return true;
    } catch (error) {
      console.error('Push unsubscription failed:', error);
      return false;
    }
  }

  /**
   * 注册后台同步
   */
  async registerBackgroundSync(tag: string): Promise<boolean> {
    if (!this.swRegistration) {
      console.warn('Service Worker not registered');
      return false;
    }

    try {
      // 类型断言以解决TypeScript问题
      const syncManager = (this.swRegistration as any).sync;
      if (!syncManager) {
        console.warn('Background Sync not supported');
        return false;
      }

      await syncManager.register(tag);
      console.log('Background sync registered:', tag);
      return true;
    } catch (error) {
      console.error('Background sync registration failed:', error);
      return false;
    }
  }

  /**
   * 缓存指定URL
   */
  async cacheUrls(urls: string[]): Promise<boolean> {
    if (!this.swRegistration) {
      console.warn('Service Worker not registered');
      return false;
    }

    try {
      this.swRegistration.active?.postMessage({
        type: 'CACHE_URLS',
        urls
      });
      return true;
    } catch (error) {
      console.error('Cache URLs failed:', error);
      return false;
    }
  }

  /**
   * 获取当前PWA状态
   */
  getStatus(): PWAStatus {
    return { ...this.currentStatus };
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: (status: PWAStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus);
    return () => this.listeners.delete(listener);
  }

  /**
   * 检查是否支持PWA功能
   */
  checkSupport(): { sw: boolean; push: boolean; sync: boolean } {
    return {
      sw: 'serviceWorker' in navigator,
      push: 'PushManager' in window,
      sync: 'sync' in (ServiceWorkerRegistration.prototype as any)
    };
  }

  // 辅助方法：转换VAPID密钥
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  // API调用：保存推送订阅
  private async savePushSubscription(data: PushSubscriptionData): Promise<void> {
    const apiUrl = localStorage.getItem('api_url') || '';
    const token = localStorage.getItem('auth_token') || '';

    await fetch(`${apiUrl}/api/notification/push-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
  }

  // API调用：删除推送订阅
  private async deletePushSubscription(): Promise<void> {
    const apiUrl = localStorage.getItem('api_url') || '';
    const token = localStorage.getItem('auth_token') || '';

    await fetch(`${apiUrl}/api/notification/push-subscription`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }
}

// 导出单例
export const pwaManager = new PWAManager();

// Hook for React
export function usePWA() {
  const [status, setStatus] = React.useState<PWAStatus>(pwaManager.getStatus());

  React.useEffect(() => {
    return pwaManager.subscribe(setStatus);
  }, []);

  return {
    ...status,
    registerSW: () => pwaManager.registerServiceWorker(),
    promptInstall: () => pwaManager.promptInstall(),
    requestPushPermission: () => pwaManager.requestPushPermission(),
    subscribePush: (key: string) => pwaManager.subscribePush(key),
    unsubscribePush: () => pwaManager.unsubscribePush(),
    registerSync: (tag: string) => pwaManager.registerBackgroundSync(tag),
    checkSupport: () => pwaManager.checkSupport()
  };
}

// 为了TypeScript，添加React导入
import * as React from 'react';
