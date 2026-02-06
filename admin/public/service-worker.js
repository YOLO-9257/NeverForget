/**
 * NeverForget PWA Service Worker
 * 功能：离线缓存、后台同步、推送通知
 * @version 1.0.0
 */

const CACHE_NAME = 'neverforget-v1';
const STATIC_CACHE = 'neverforget-static-v1';
const API_CACHE = 'neverforget-api-v1';
const IMAGE_CACHE = 'neverforget-images-v1';

// 静态资源缓存列表
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// 需要缓存的API路径
const CACHEABLE_API_PATHS = [
  '/api/email/accounts',
  '/api/email/categories',
  '/api/notification/channels'
];

// 安装事件：缓存静态资源
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('neverforget-') && 
                     name !== STATIC_CACHE && 
                     name !== API_CACHE && 
                     name !== IMAGE_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

// 获取缓存策略
function getCacheStrategy(request) {
  const url = new URL(request.url);
  
  // 静态资源：优先使用缓存
  if (STATIC_ASSETS.includes(url.pathname) || 
      request.destination === 'style' || 
      request.destination === 'script' ||
      request.destination === 'font') {
    return 'cache-first';
  }
  
  // API请求：网络优先，失败时回退到缓存
  if (url.pathname.startsWith('/api/')) {
    // 检查是否是可缓存的API
    const isCacheableApi = CACHEABLE_API_PATHS.some(path => 
      url.pathname.startsWith(path)
    );
    return isCacheableApi ? 'stale-while-revalidate' : 'network-only';
  }
  
  // 图片：缓存优先，但定期更新
  if (request.destination === 'image') {
    return 'cache-first';
  }
  
  // 其他：网络优先
  return 'network-first';
}

// 网络请求拦截
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 跳过非GET请求和浏览器扩展请求
  if (request.method !== 'GET' || 
      url.protocol === 'chrome-extension:' ||
      url.protocol === 'moz-extension:') {
    return;
  }
  
  const strategy = getCacheStrategy(request);
  
  event.respondWith(
    handleFetch(request, strategy)
  );
});

// 处理网络请求
async function handleFetch(request, strategy) {
  const url = new URL(request.url);
  
  switch (strategy) {
    case 'cache-first':
      return cacheFirst(request);
      
    case 'network-first':
      return networkFirst(request);
      
    case 'stale-while-revalidate':
      return staleWhileRevalidate(request);
      
    case 'network-only':
      return fetch(request);
      
    default:
      return networkFirst(request);
  }
}

// 缓存优先策略
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Cache-first fetch failed:', error);
    throw error;
  }
}

// 网络优先策略
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cache = await caches.open(API_CACHE);
    const cached = await cache.match(request);
    
    if (cached) {
      return cached;
    }
    
    throw error;
  }
}

// 过时重新验证策略
async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);
  
  // 同时发起网络请求更新缓存
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch((error) => {
      console.error('[SW] Background fetch failed:', error);
    });
  
  // 优先返回缓存，如果没有缓存则等待网络
  if (cached) {
    fetchPromise; // 不等待，后台更新
    return cached;
  }
  
  return fetchPromise;
}

// 推送通知事件
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (e) {
    data = {
      title: '新消息',
      body: event.data?.text() || '您有一条新消息'
    };
  }
  
  const options = {
    body: data.body || '您有一条新消息',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/badge-72x72.png',
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.data || {},
    timestamp: data.timestamp || Date.now(),
    vibrate: data.vibrate || [200, 100, 200]
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'NeverForget',
      options
    )
  );
});

// 通知点击事件
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  
  event.notification.close();
  
  const notificationData = event.notification.data;
  let url = '/';
  
  // 根据通知类型打开不同页面
  if (notificationData.type === 'email') {
    url = `/email-inbox?account=${notificationData.accountId}`;
  } else if (notificationData.type === 'reminder') {
    url = `/tasks/${notificationData.reminderId}`;
  } else if (notificationData.url) {
    url = notificationData.url;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // 查找已打开的窗口
        for (const client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        // 如果没有打开的窗口，打开新窗口
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// 后台同步事件
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-emails') {
    event.waitUntil(syncEmails());
  } else if (event.tag === 'sync-pending-actions') {
    event.waitUntil(syncPendingActions());
  }
});

// 同步邮件
async function syncEmails() {
  try {
    const response = await fetch('/api/email/sync-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Sync failed: ' + response.status);
    }
    
    console.log('[SW] Background email sync completed');
    return response.json();
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
    throw error;
  }
}

// 同步待处理操作
async function syncPendingActions() {
  const db = await openDB('neverforget-pending', 1);
  const actions = await db.getAll('actions');
  
  for (const action of actions) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body
      });
      
      if (response.ok) {
        await db.delete('actions', action.id);
      }
    } catch (error) {
      console.error('[SW] Failed to sync action:', action.id, error);
    }
  }
}

// 定期后台获取（用于保持数据新鲜）
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-new-emails') {
    event.waitUntil(checkNewEmails());
  }
});

async function checkNewEmails() {
  try {
    const response = await fetch('/api/email/check-new');
    const data = await response.json();
    
    if (data.hasNewEmails) {
      self.registration.showNotification('新邮件提醒', {
        body: `您有 ${data.count} 封新邮件`,
        icon: '/icons/icon-192x192.png',
        tag: 'new-emails',
        data: { type: 'email', url: '/email-inbox' }
      });
    }
  } catch (error) {
    console.error('[SW] Check new emails failed:', error);
  }
}

// 消息处理（来自主线程）
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(STATIC_CACHE)
        .then((cache) => cache.addAll(event.data.urls))
    );
  }
});

// IndexedDB 辅助函数
function openDB(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('actions')) {
        db.createObjectStore('actions', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

console.log('[SW] Service Worker loaded');
