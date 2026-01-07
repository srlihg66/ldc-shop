'use server'

import { db } from "@/lib/db"
import { cards, orders, refundRequests } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { checkAdmin } from "@/actions/admin"

export async function markOrderPaid(orderId: string) {
  await checkAdmin()
  if (!orderId) throw new Error("Missing order id")

  await db.update(orders).set({
    status: 'paid',
    paidAt: new Date(),
  }).where(eq(orders.orderId, orderId))

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath(`/order/${orderId}`)
}

export async function markOrderDelivered(orderId: string) {
  await checkAdmin()
  if (!orderId) throw new Error("Missing order id")

  const order = await db.query.orders.findFirst({ where: eq(orders.orderId, orderId) })
  if (!order) throw new Error("Order not found")
  if (!order.cardKey) throw new Error("Missing card key; cannot mark delivered")

  await db.update(orders).set({
    status: 'delivered',
    deliveredAt: new Date(),
  }).where(eq(orders.orderId, orderId))

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath(`/order/${orderId}`)
}

export async function cancelOrder(orderId: string) {
  await checkAdmin()
  if (!orderId) throw new Error("Missing order id")

  await db.transaction(async (tx) => {
    await tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.orderId, orderId))
    try {
      await tx.execute(sql`
        ALTER TABLE cards ADD COLUMN IF NOT EXISTS reserved_order_id TEXT;
        ALTER TABLE cards ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMP;
      `)
    } catch {
      // best effort
    }
    await tx.update(cards).set({ reservedOrderId: null, reservedAt: null })
      .where(sql`${cards.reservedOrderId} = ${orderId} AND ${cards.isUsed} = false`)
  })

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath(`/order/${orderId}`)
}

export async function updateOrderEmail(orderId: string, email: string | null) {
  await checkAdmin()
  if (!orderId) throw new Error("Missing order id")
  const next = (email || '').trim()
  await db.update(orders).set({ email: next || null }).where(eq(orders.orderId, orderId))
  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${orderId}`)
}

async function deleteOneOrder(tx: any, orderId: string) {
  const order = await tx.query.orders.findFirst({ where: eq(orders.orderId, orderId) })
  if (!order) return

  // Release reserved card if any
  try {
    await tx.execute(sql`
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS reserved_order_id TEXT;
      ALTER TABLE cards ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMP;
    `)
  } catch {
    // best effort
  }

  await tx.update(cards).set({ reservedOrderId: null, reservedAt: null })
    .where(sql`${cards.reservedOrderId} = ${orderId} AND ${cards.isUsed} = false`)

  // Delete related refund requests (best effort)
  try {
    await tx.delete(refundRequests).where(eq(refundRequests.orderId, orderId))
  } catch {
    // table may not exist yet
  }

  await tx.delete(orders).where(eq(orders.orderId, orderId))
}

export async function deleteOrder(orderId: string) {
  await checkAdmin()
  if (!orderId) throw new Error("Missing order id")

  await db.transaction(async (tx) => {
    await deleteOneOrder(tx, orderId)
  })

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${orderId}`)
}

export async function deleteOrders(orderIds: string[]) {
  await checkAdmin()
  const ids = (orderIds || []).map((s) => String(s).trim()).filter(Boolean)
  if (!ids.length) return

  await db.transaction(async (tx) => {
    for (const id of ids) {
      await deleteOneOrder(tx, id)
    }
  })

  revalidatePath('/admin/orders')
}
