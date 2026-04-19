// api/config.js — Función serverless de Vercel
// Lee las claves desde las variables de entorno de Vercel
// y las sirve al frontend. Nunca aparecen en el repositorio.

export default function handler(req, res) {
  // Solo permitir GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.status(200).json({
    SUPABASE_URL:           process.env.SUPABASE_URL           || '',
    SUPABASE_ANON_KEY:      process.env.SUPABASE_ANON_KEY      || '',
    GEMINI_API_KEY:         process.env.GEMINI_API_KEY         || '',
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || ''
  });
}
