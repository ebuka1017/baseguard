<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let dialogOpen = false;
  let dialogElement: HTMLDialogElement;
  let canvasElement: HTMLCanvasElement;
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    setupModernAPIs();
    setupCanvas();
  });

  onDestroy(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });

  function setupModernAPIs() {
    // ResizeObserver - baseline newly available
    resizeObserver = new ResizeObserver((entries) => {
      console.log('Svelte: Element resized:', entries);
    });

    if (dialogElement) {
      resizeObserver.observe(dialogElement);
    }

    // structuredClone - baseline newly available
    const testData = { svelte: true, reactive: { state: 'awesome' } };
    const cloned = structuredClone(testData);
    console.log('Svelte: Cloned data:', cloned);

    // Array.at() - baseline newly available
    const frameworks = ['svelte', 'vue', 'react', 'angular'];
    const firstFramework = frameworks.at(0);
    const lastFramework = frameworks.at(-1);
    console.log('Svelte: First and last frameworks:', firstFramework, lastFramework);

    // Optional chaining and nullish coalescing - baseline widely available
    const config = { api: { endpoint: null } };
    const endpoint = config?.api?.endpoint ?? 'https://default-api.com';
    console.log('Svelte: API endpoint:', endpoint);
  }

  function setupCanvas() {
    if (!canvasElement) return;
    
    const ctx = canvasElement.getContext('2d');
    if (ctx) {
      // Modern Canvas API - filter property
      ctx.filter = 'blur(3px) brightness(1.2)';
      ctx.fillStyle = '#ff3e00';
      ctx.fillRect(20, 20, 80, 80);
    }
  }

  function openDialog() {
    if (dialogElement) {
      // HTMLDialogElement.showModal() - baseline newly available
      dialogElement.showModal();
    }
    dialogOpen = true;
  }

  function closeDialog() {
    if (dialogElement) {
      dialogElement.close();
    }
    dialogOpen = false;
  }

  function testWebAPIs() {
    // Test various modern Web APIs
    
    // AbortController - baseline widely available
    const controller = new AbortController();
    const { signal } = controller;
    
    // Fetch with modern options
    fetch('https://api.example.com/svelte-data', { 
      signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ framework: 'svelte' })
    })
    .then(response => response.json())
    .catch(error => {
      if (error.name === 'AbortError') {
        console.log('Svelte: Fetch aborted');
      }
    });
    
    // Abort after 500ms
    setTimeout(() => controller.abort(), 500);
    
    // IntersectionObserver - baseline widely available
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        console.log('Svelte: Element intersection:', entry.isIntersecting);
      });
    }, {
      threshold: [0, 0.5, 1]
    });
    
    if (canvasElement) {
      observer.observe(canvasElement);
    }

    // Test URLSearchParams - baseline widely available
    const params = new URLSearchParams();
    params.set('framework', 'svelte');
    params.set('version', '4.2');
    console.log('Svelte: URL params:', params.toString());
  }

  function testAdvancedCanvas() {
    if (!canvasElement) return;
    
    // Test OffscreenCanvas - baseline newly available
    if ('OffscreenCanvas' in window) {
      const offscreen = new OffscreenCanvas(150, 150);
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ff3e00';
        ctx.fillRect(0, 0, 75, 75);
        
        // Convert to ImageBitmap - modern API
        offscreen.convertToBlob().then(blob => {
          console.log('Svelte: OffscreenCanvas blob created:', blob.size);
        });
      }
    }
    
    // Test WebGL2 - baseline widely available
    const gl = canvasElement.getContext('webgl2');
    if (gl) {
      gl.clearColor(1.0, 0.24, 0.0, 1.0); // Svelte orange
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // Test WebGL2 specific features
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 256, 256);
    }
  }

  function testServiceWorker() {
    // Service Worker registration - baseline widely available
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Svelte: SW registered:', registration.scope);
        })
        .catch(error => {
          console.log('Svelte: SW registration failed:', error);
        });
    }

    // Test Cache API - baseline widely available
    if ('caches' in window) {
      caches.open('svelte-cache-v1').then(cache => {
        cache.add('/api/data');
        console.log('Svelte: Cache opened and populated');
      });
    }
  }
</script>

<div class="svelte-app">
  <h1>Svelte Test App</h1>
  
  <div class="button-group">
    <button on:click={openDialog}>Open Dialog</button>
    <button on:click={testWebAPIs}>Test Web APIs</button>
    <button on:click={testAdvancedCanvas}>Test Canvas</button>
    <button on:click={testServiceWorker}>Test Service Worker</button>
  </div>
  
  <dialog bind:this={dialogElement} open={dialogOpen}>
    <div class="dialog-content">
      <h2>Modern Dialog in Svelte</h2>
      <p>This dialog uses the native HTML dialog element with modern CSS styling.</p>
      <button on:click={closeDialog}>Close Dialog</button>
    </div>
  </dialog>

  <div class="container-test">
    <h3>Container Query Test</h3>
    <p>This container adapts based on its own size, not the viewport.</p>
  </div>

  <canvas bind:this={canvasElement} width="300" height="200"></canvas>
</div>

<style>
  /* Modern CSS features in Svelte component */
  .svelte-app {
    container-type: inline-size;
    container-name: svelte-container;
    
    /* Modern CSS properties */
    aspect-ratio: 16/10;
    accent-color: #ff3e00;
    color-scheme: light dark;
    
    /* CSS Grid with modern features */
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    
    /* Modern CSS functions */
    background: color-mix(in srgb, #ff3e00 20%, white);
    
    /* Backdrop filter */
    backdrop-filter: blur(8px) saturate(1.2);
    
    padding: 2rem;
    border-radius: 12px;
  }

  /* Container queries */
  @container svelte-container (min-width: 600px) {
    .container-test {
      font-size: 1.3rem;
      grid-column: span 2;
    }
    
    .button-group {
      display: flex;
      gap: 1rem;
    }
  }

  @container svelte-container (max-width: 400px) {
    .svelte-app {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }

  /* Modern selectors */
  .svelte-app:has(dialog[open]) {
    background-color: rgba(255, 62, 0, 0.1);
    backdrop-filter: blur(12px);
  }

  /* CSS nesting */
  .button-group {
    display: grid;
    gap: 0.5rem;
    
    button {
      background: linear-gradient(135deg, #ff3e00, #ff6b35);
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255, 62, 0, 0.3);
      }
      
      &:focus-visible {
        outline: 2px solid #ff3e00;
        outline-offset: 2px;
      }
      
      &:active {
        transform: translateY(0);
      }
    }
  }

  .container-test {
    background: linear-gradient(45deg, #ff3e00, transparent);
    padding: 1.5rem;
    border-radius: 8px;
    
    /* Modern CSS units and functions */
    width: clamp(200px, 100%, 500px);
    height: max(120px, 12vh);
    margin-block: 1rem;
    padding-inline: 2rem;
  }

  /* Dialog styling with modern CSS */
  dialog {
    border: none;
    border-radius: 12px;
    padding: 0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(10px);
    
    &::backdrop {
      background: color-mix(in srgb, black 50%, transparent);
      backdrop-filter: blur(4px);
    }
  }

  .dialog-content {
    padding: 2rem;
    background: linear-gradient(135deg, white, #f8f9fa);
    border-radius: 12px;
    
    h2 {
      margin-top: 0;
      color: #ff3e00;
    }
    
    button {
      background: #ff3e00;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      
      &:hover {
        background: #e63600;
      }
    }
  }

  canvas {
    border: 2px solid #ff3e00;
    border-radius: 8px;
    background: white;
    
    &:hover {
      box-shadow: 0 4px 16px rgba(255, 62, 0, 0.2);
    }
  }

  /* CSS custom properties with modern color functions */
  :root {
    --svelte-primary: oklch(0.6 0.25 25);
    --svelte-secondary: color(display-p3 1 0.24 0);
  }

  /* Modern pseudo-classes and logical properties */
  .svelte-app > * {
    margin-block-end: 1rem;
  }

  .svelte-app *:is(h1, h2, h3) {
    color: var(--svelte-primary);
    font-weight: 600;
  }

  /* CSS @supports for progressive enhancement */
  @supports (container-type: inline-size) {
    .svelte-app {
      border: 3px solid #ff3e00;
    }
  }

  @supports (backdrop-filter: blur(10px)) {
    dialog {
      background: rgba(255, 255, 255, 0.9);
    }
  }
</style>