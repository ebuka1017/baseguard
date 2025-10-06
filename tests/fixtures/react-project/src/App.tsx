import React, { useState, useEffect } from 'react';
import './App.css';

// Component using modern web features that may have compatibility issues
const App: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resizeObserver, setResizeObserver] = useState<ResizeObserver | null>(null);

  useEffect(() => {
    // Modern JavaScript API - ResizeObserver (baseline newly available)
    const observer = new ResizeObserver((entries) => {
      console.log('Element resized:', entries);
    });
    setResizeObserver(observer);

    // Modern JavaScript API - structuredClone (baseline newly available)
    const data = { name: 'test', nested: { value: 42 } };
    const cloned = structuredClone(data);
    console.log('Cloned data:', cloned);

    // Modern Array method - Array.at() (baseline newly available)
    const items = [1, 2, 3, 4, 5];
    const lastItem = items.at(-1);
    console.log('Last item:', lastItem);

    return () => {
      observer.disconnect();
    };
  }, []);

  const openDialog = () => {
    // Modern HTML API - HTMLDialogElement.showModal() (baseline newly available)
    const dialog = document.querySelector('dialog');
    if (dialog) {
      dialog.showModal();
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    const dialog = document.querySelector('dialog');
    if (dialog) {
      dialog.close();
    }
    setDialogOpen(false);
  };

  // Canvas API usage (widely supported but good test case)
  const drawCanvas = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Modern Canvas API - filter property (baseline newly available)
      ctx.filter = 'blur(5px)';
      ctx.fillRect(0, 0, 100, 100);
    }
  };

  return (
    <div className="app">
      <h1>React Test App</h1>
      <button onClick={openDialog}>Open Dialog</button>
      <button onClick={drawCanvas}>Draw Canvas</button>
      
      <dialog open={dialogOpen}>
        <p>This is a modern dialog element</p>
        <button onClick={closeDialog}>Close</button>
      </dialog>

      <div className="container-query-test">
        <p>Container with modern CSS</p>
      </div>
    </div>
  );
};

export default App;