// api/stripe-webhook.js — Vercel serverless function
// Escucha eventos de Stripe y actualiza el campo `plan` en Supabase.
// Requiere: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY; // clave de servicio (no la anon)
const WEBHOOK_SECRET        = process.env.STRIPE_WEBHOOK_SECRET;

// ─── Helper: actualizar perfil en Supabase ─────────────────────────────────
async function updatePerfil(uid, data) {
  const url = `${SUPABASE_URL}/rest/v1/perfiles?uid=eq.${encodeURIComponent(uid)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase PATCH error: ${body}`);
  }
}

// ─── Leer raw body (necesario para verificar firma de Stripe) ──────────────
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ─── Handler principal ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {

      // ── Pago completado: activar plan ───────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const uid     = session.metadata?.kair_uid;
        const plan    = session.metadata?.kair_plan;
        if (!uid || !plan) break;

        const customerId     = session.customer;
        const subscriptionId = session.subscription;

        // Calcular fecha de expiración (+1 mes como referencia inicial;
        // se actualiza en invoice.payment_succeeded con la fecha real)
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        await updatePerfil(uid, {
          plan,
          stripe_customer_id:      customerId,
          stripe_subscription_id:  subscriptionId,
          plan_expires_at:         expiresAt.toISOString(),
        });

        console.log(`Plan ${plan} activado para uid=${uid}`);
        break;
      }

      // ── Pago recurrente exitoso: renovar fecha de expiración ────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.billing_reason !== 'subscription_cycle') break;

        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        // Obtener la suscripción para saber la fecha de renovación real
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const uid          = subscription.metadata?.kair_uid;
        if (!uid) break;

        const expiresAt = new Date(subscription.current_period_end * 1000);
        await updatePerfil(uid, {
          plan_expires_at: expiresAt.toISOString(),
        });

        console.log(`Plan renovado para uid=${uid}, expira ${expiresAt.toISOString()}`);
        break;
      }

      // ── Suscripción cancelada o eliminada: volver a seed ────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const uid          = subscription.metadata?.kair_uid;
        if (!uid) break;

        await updatePerfil(uid, {
          plan:                   'seed',
          stripe_subscription_id: null,
          plan_expires_at:        null,
        });

        console.log(`Suscripción cancelada para uid=${uid} — vuelve a Seed`);
        break;
      }

      // ── Pago fallido: notificar (sin degradar plan aún — Stripe reintenta) ─
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        // TODO: definir con el equipo si se degrada inmediatamente o tras N reintentos
        // Por ahora solo logueamos; Stripe gestiona los reintentos automáticamente
        console.warn(`Pago fallido — invoice ${invoice.id}, subscription ${invoice.subscription}`);
        break;
      }

      default:
        // Evento no gestionado — OK, simplemente ignorar
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Error procesando webhook:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
