<template>
  <div class="vue-app">
    <h1>Vue Test App</h1>
    <button @click="openDialog">Open Dialog</button>
    <button @click="testWebAPIs">Test Web APIs</button>
    <button @click="testCanvas">Test Canvas</button>
    
    <dialog ref="dialogRef" :open="dialogOpen">
      <p>This is a modern dialog element in Vue</p>
      <button @click="closeDialog">Close</button>
    </dialog>

    <div class="container-test">
      <p>Container query test in Vue</p>
    </div>

    <canvas ref="canvasRef" width="200" height="200"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const dialogOpen = ref(false);
const dialogRef = ref<HTMLDialogElement>();
const canvasRef = ref<HTMLCanvasElement>();
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  // Modern JavaScript APIs
  setupModernAPIs();
  setupCanvas();
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

const setupModernAPIs = () => {
  // ResizeObserver - baseline newly available
  resizeObserver = new ResizeObserver((entries) => {
    console.log('Vue: Element resized:', entries);
  });

  if (dialogRef.value) {
    resizeObserver.observe(dialogRef.value);
  }

  // structuredClone - baseline newly available
  const testData = { vue: true, data: { nested: 'value' } };
  const cloned = structuredClone(testData);
  console.log('Vue: Cloned data:', cloned);

  // Array.at() - baseline newly available
  const items = ['vue', 'react', 'svelte'];
  const lastFramework = items.at(-1);
  console.log('Vue: Last framework:', lastFramework);
};

const setupCanvas = () => {
  if (!canvasRef.value) return;
  
  const ctx = canvasRef.value.getContext('2d');
  if (ctx) {
    // Modern Canvas API - filter property
    ctx.filter = 'blur(2px)';
    ctx.fillStyle = 'blue';
    ctx.fillRect(10, 10, 100, 100);
  }
};

const openDialog = () => {
  if (dialogRef.value) {
    // HTMLDialogElement.showModal() - baseline newly available
    dialogRef.value.showModal();
  }
  dialogOpen.value = true;
};

const closeDialog = () => {
  if (dialogRef.value) {
    dialogRef.value.close();
  }
  dialogOpen.value = false;
};

const testWebAPIs = () => {
  // Test various modern Web APIs
  
  // AbortController - baseline widely available
  const controller = new AbortController();
  const signal = controller.signal;
  
  // Fetch with AbortSignal
  fetch('https://api.example.com/data', { signal })
    .then(response => response.json())
    .catch(error => {
      if (error.name === 'AbortError') {
        console.log('Vue: Fetch aborted');
      }
    });
  
  // Abort after 1 second
  setTimeout(() => controller.abort(), 1000);
  
  // IntersectionObserver - baseline widely available
  const observer = new IntersectionObserver((entries) => {
    console.log('Vue: Intersection observed:', entries);
  });
  
  if (dialogRef.value) {
    observer.observe(dialogRef.value);
  }
};

const testCanvas = () => {
  if (!canvasRef.value) return;
  
  // Test OffscreenCanvas - baseline newly available
  if ('OffscreenCanvas' in window) {
    const offscreen = new OffscreenCanvas(100, 100);
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 50, 50);
    }
  }
  
  // Test WebGL2 - baseline widely available
  const gl = canvasRef.value.getContext('webgl2');
  if (gl) {
    gl.clearColor(0.0, 1.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
};
</script>

<style scoped>
/* Modern CSS features in Vue component */
.vue-app {
  container-type: inline-size;
  container-name: vue-container;
  
  /* Modern CSS properties */
  aspect-ratio: 4/3;
  accent-color: #42b883;
  color-scheme: light dark;
  
  /* CSS Grid with modern gap */
  display: grid;
  gap: 1.5rem;
  
  /* Modern CSS functions */
  background: color-mix(in srgb, #42b883 30%, white);
  
  /* Backdrop filter */
  backdrop-filter: blur(5px);
}

/* Container queries */
@container vue-container (min-width: 500px) {
  .container-test {
    font-size: 1.4rem;
    color: #42b883;
  }
}

/* Modern selectors */
.vue-app:has(dialog[open]) {
  background-color: rgba(66, 184, 131, 0.1);
}

/* CSS nesting */
.vue-app {
  .container-test {
    padding: 1.5rem;
    border-radius: 8px;
    
    &:hover {
      background-color: rgba(66, 184, 131, 0.1);
    }
  }
}

/* Modern pseudo-classes */
.vue-app button:focus-visible {
  outline: 2px solid #42b883;
  outline-offset: 2px;
}

.vue-app button:is(:hover, :focus) {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

/* Modern CSS units and functions */
.container-test {
  width: clamp(200px, 50%, 400px);
  height: max(150px, 15vh);
  margin-block: 1rem;
  padding-inline: 1.5rem;
}

/* CSS custom properties with modern color functions */
:root {
  --vue-primary: oklch(0.6 0.2 160);
  --vue-secondary: color(display-p3 0.26 0.72 0.51);
}

canvas {
  border: 1px solid var(--vue-primary);
  border-radius: 4px;
}
</style>