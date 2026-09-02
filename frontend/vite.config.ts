import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Fixed at 5174 (chatbot's own frontend defaults to Vite's 5173) so both
// can run side by side without a port clash.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
})
