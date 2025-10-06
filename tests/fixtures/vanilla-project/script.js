// Modern JavaScript features for comprehensive testing

// Modern JavaScript syntax and APIs
class VanillaTestApp {
  #privateField = 'private data'; // Private fields - baseline newly available
  
  constructor() {
    this.setupEventListeners();
    this.initializeModernAPIs();
  }

  setupEventListeners() {
    // Modern event listener setup with optional chaining
    document.getElementById('openDialog')?.addEventListener('click', this.openDialog.bind(this));
    document.getElementById('testAPIs')?.addEventListener('click', this.testWebAPIs.bind(this));
    document.getElementById('testCanvas')?.addEventListener('click', this.testCanvas.bind(this));
    document.getElementById('testWebGL')?.addEventListener('click', this.testWebGL.bind(this));
    document.getElementById('testServiceWorker')?.addEventListener('click', this.testServiceWorker.bind(this));
  }

  async initializeModernAPIs() {
    // Top-level await would be used here in a module context
    await this.setupResizeObserver();
    this.testModernJavaScript();
  }

  async setupResizeObserver() {
    // ResizeObserver - baseline newly available
    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver((entries) => {
        entries.forEach(entry => {
          console.log('Vanilla: Element resized:', entry.target.tagName, entry.contentRect);
        });
      });

      const dialog = document.getElementById('testDialog');
      if (dialog) {
        resizeObserver.observe(dialog);
      }
    }
  }

  testModernJavaScript() {
    // structuredClone - baseline newly available
    const complexData = {
      name: 'Vanilla JS Test',
      nested: {
        array: [1, 2, 3],
        date: new Date(),
        map: new Map([['key', 'value']])
      }
    };
    
    if ('structuredClone' in window) {
      const cloned = structuredClone(complexData);
      console.log('Vanilla: Cloned complex data:', cloned);
    }

    // Array.at() - baseline newly available
    const testArray = ['first', 'second', 'third', 'fourth', 'last'];
    const firstItem = testArray.at?.(0) ?? testArray[0];
    const lastItem = testArray.at?.(-1) ?? testArray[testArray.length - 1];
    console.log('Vanilla: Array access:', { firstItem, lastItem });

    // Optional chaining and nullish coalescing - baseline widely available
    const config = { api: { endpoint: null, timeout: undefined } };
    const endpoint = config?.api?.endpoint ?? 'https://default-api.com';
    const timeout = config?.api?.timeout ?? 5000;
    console.log('Vanilla: Config values:', { endpoint, timeout });

    // Private field access
    console.log('Vanilla: Private field accessible:', this.#privateField);
  }

  openDialog() {
    const dialog = document.getElementById('testDialog');
    if (dialog && 'showModal' in dialog) {
      // HTMLDialogElement.showModal() - baseline newly available
      dialog.showModal();
    } else {
      // Fallback for older browsers
      console.warn('Dialog.showModal() not supported');
      dialog.style.display = 'block';
    }
  }

  async testWebAPIs() {
    // AbortController - baseline widely available
    const controller = new AbortController();
    const { signal } = controller;

    try {
      // Fetch with modern options
      const response = await fetch('https://jsonplaceholder.typicode.com/posts/1', {
        signal,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Vanilla: Fetch successful:', data.title);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Vanilla: Fetch aborted');
      } else {
        console.error('Vanilla: Fetch error:', error);
      }
    }

    // Test abort after 100ms
    setTimeout(() => controller.abort(), 100);

    // IntersectionObserver - baseline widely available
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          console.log('Vanilla: Intersection:', entry.target.id, entry.isIntersecting);
        });
      }, {
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: '10px'
      });

      const canvas = document.getElementById('testCanvas');
      if (canvas) {
        observer.observe(canvas);
      }
    }

    // URLSearchParams - baseline widely available
    const params = new URLSearchParams();
    params.set('framework', 'vanilla');
    params.set('test', 'web-apis');
    params.set('timestamp', Date.now().toString());
    console.log('Vanilla: URL params:', params.toString());

    // FormData - baseline widely available
    const formData = new FormData();
    formData.append('test', 'vanilla-js');
    formData.append('features', JSON.stringify(['modern', 'apis']));
    console.log('Vanilla: FormData created with', formData.get('test'));
  }

  testCanvas() {
    const canvas = document.getElementById('testCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Modern Canvas API features
    ctx.save();
    
    // Canvas filter - baseline newly available
    if ('filter' in ctx) {
      ctx.filter = 'blur(2px) brightness(1.1) contrast(1.2)';
    }

    // Draw with modern features
    ctx.fillStyle = '#4285f4';
    ctx.fillRect(10, 10, 100, 100);

    // Reset filter
    ctx.filter = 'none';
    
    // Gradient with modern color syntax
    const gradient = ctx.createLinearGradient(0, 0, 200, 0);
    gradient.addColorStop(0, '#ff6b6b');
    gradient.addColorStop(1, '#4ecdc4');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(120, 10, 100, 100);

    // Path2D - baseline widely available
    if ('Path2D' in window) {
      const path = new Path2D();
      path.arc(75, 150, 50, 0, 2 * Math.PI);
      ctx.fillStyle = '#feca57';
      ctx.fill(path);
    }

    ctx.restore();

    // Test OffscreenCanvas - baseline newly available
    if ('OffscreenCanvas' in window) {
      const offscreen = new OffscreenCanvas(200, 200);
      const offscreenCtx = offscreen.getContext('2d');
      
      if (offscreenCtx) {
        offscreenCtx.fillStyle = '#ff9ff3';
        offscreenCtx.fillRect(0, 0, 100, 100);
        
        // Convert to blob - modern API
        offscreen.convertToBlob().then(blob => {
          console.log('Vanilla: OffscreenCanvas blob created:', blob.size, 'bytes');
        }).catch(error => {
          console.error('Vanilla: OffscreenCanvas error:', error);
        });
      }
    }
  }

  testWebGL() {
    const canvas = document.getElementById('testCanvas');
    if (!canvas) return;

    // Test WebGL2 - baseline widely available
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      console.warn('Vanilla: WebGL2 not supported, trying WebGL1');
      const gl1 = canvas.getContext('webgl');
      if (gl1) {
        gl1.clearColor(0.2, 0.4, 0.8, 1.0);
        gl1.clear(gl1.COLOR_BUFFER_BIT);
        console.log('Vanilla: WebGL1 context created');
      }
      return;
    }

    // WebGL2 specific features
    gl.clearColor(0.1, 0.2, 0.3, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Test WebGL2 specific functionality
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // texStorage2D is WebGL2 specific
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 256, 256);
    
    console.log('Vanilla: WebGL2 context created and texture allocated');

    // Test WebGL extensions
    const extensions = gl.getSupportedExtensions();
    console.log('Vanilla: WebGL extensions:', extensions?.length || 0);
  }

  async testServiceWorker() {
    // Service Worker - baseline widely available
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Vanilla: Service Worker registered:', registration.scope);
        
        // Listen for updates
        registration.addEventListener('updatefound', () => {
          console.log('Vanilla: Service Worker update found');
        });
      } catch (error) {
        console.log('Vanilla: Service Worker registration failed:', error.message);
      }
    }

    // Cache API - baseline widely available
    if ('caches' in window) {
      try {
        const cache = await caches.open('vanilla-test-cache-v1');
        await cache.add('/');
        console.log('Vanilla: Cache API working');
        
        // Test cache match
        const response = await cache.match('/');
        if (response) {
          console.log('Vanilla: Cache match successful');
        }
      } catch (error) {
        console.error('Vanilla: Cache API error:', error);
      }
    }

    // Push API check (requires HTTPS and user permission)
    if ('PushManager' in window && 'serviceWorker' in navigator) {
      const permission = await Notification.requestPermission();
      console.log('Vanilla: Notification permission:', permission);
    }

    // Background Sync check
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      console.log('Vanilla: Background Sync supported');
    }
  }
}

// Initialize the app when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new VanillaTestApp();
  });
} else {
  new VanillaTestApp();
}

// Test modern JavaScript features at module level
console.log('Vanilla: Script loaded with modern features');

// Test globalThis - baseline widely available
if (typeof globalThis !== 'undefined') {
  globalThis.vanillaTestApp = 'loaded';
  console.log('Vanilla: globalThis available');
}

// Test BigInt - baseline widely available
if (typeof BigInt !== 'undefined') {
  const bigNumber = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
  console.log('Vanilla: BigInt test:', bigNumber.toString());
}

// Test dynamic import (would be used in module context)
// Dynamic imports are baseline newly available
if (typeof import === 'function') {
  console.log('Vanilla: Dynamic import supported');
}

// Test WeakRef and FinalizationRegistry - baseline newly available
if (typeof WeakRef !== 'undefined') {
  const obj = { data: 'test' };
  const weakRef = new WeakRef(obj);
  console.log('Vanilla: WeakRef created');
}

if (typeof FinalizationRegistry !== 'undefined') {
  const registry = new FinalizationRegistry((heldValue) => {
    console.log('Vanilla: Object finalized:', heldValue);
  });
  console.log('Vanilla: FinalizationRegistry created');
}