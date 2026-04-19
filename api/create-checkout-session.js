// api/create-checkout-session.js — Vercel serverless function
// Genera una sesión de Stripe Checkout y devuelve la URL de pago.
// STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET viven en variables de entorno de Vercel.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// TODO: definir con el equipo los Price IDs reales de Stripe Dashboard
const PRICE_IDS = {
  bloom: process.env.STRIPE_PRICE_BLOOM || 'price_bloom_placeholder',
  root:  process.env.STRIPE_PRICE_ROOT  || 'price_root_placeholder',
};

// URL base de la app (configurar en variables de entorno de Vercel)
const APP_URL = process.env.APP_URL || 'https://kair.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plan, uid } = req.body;

  if (!plan || !uid) {
    return res.status(400).json({ error: 'plan y uid son obligatorios' });
  }

  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    return res.status(400).json({ error: 'Plan no válido' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // Pasar el uid de Kair como metadata para identificar al usuario en el webhook
      metadata: {
        kair_uid: uid,
        kair_plan: plan,
      },
      subscription_data: {
        metadata: {
          kair_uid: uid,
          kair_plan: plan,
        },
      },
      // URLs de retorno después del pago
      success_url: `${APP_URL}?stripe_success=1&plan=${plan}`,
      cancel_url:  `${APP_URL}?stripe_cancel=1`,
      // Locale automático desde el navegador del usuario
      locale: 'auto',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Error creando sesión de pago' });
  }
}
