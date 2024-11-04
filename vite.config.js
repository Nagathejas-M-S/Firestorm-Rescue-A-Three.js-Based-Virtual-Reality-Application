import { defineConfig } from 'vite';
// Import any plugins you might need

export default defineConfig({
  plugins: [
    // Add plugins here if needed
  ],
  assetsInclude: ['**/*.fbx', '**/*.glb'], // Add this line to include fbx and glb files
  build: {
    rollupOptions: {
      // Customize output settings if necessary
    }
  }
});
