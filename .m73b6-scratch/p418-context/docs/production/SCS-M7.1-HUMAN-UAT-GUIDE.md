# SCS Platform — M7.1 Human UAT Guide

**Date:** 2026-09-27  
**Milestone:** M7.1 — Order Lifecycle & Fulfillment  
**Prerequisites:** M6.2 production release gate PASS  

---

## Purpose

This guide covers manual UI acceptance testing for M7.1 fulfillment workflows across web and mobile. Each scenario maps to a real screen and API endpoint.

---

## Web Merchant Fulfillment UAT

### WM-01: Fulfillment Queue Visibility

1. Login as merchant (MERCHANT_OWNER role)
2. Navigate to `/merchant/orders`
3. Verify: orders in ACCEPTED status show **Prepare** button
4. Verify: orders in PREPARING status show **Ready** button
5. Verify: orders in READY status show **Assign Driver** button
6. Verify: orders in ASSIGNED+ show informational status text

### WM-02: Prepare Action

1. Find an order in ACCEPTED status
2. Click **Prepare**
3. Verify: order transitions to PREPARING
4. Verify: success snackbar appears
5. Verify: button changes to **Ready**

### WM-03: Ready Action

1. Find an order in PREPARING status
2. Click **Ready**
3. Verify: order transitions to READY
4. Verify: button changes to **Assign Driver**

### WM-04: Assign Driver

1. Find an order in READY status
2. Click **Assign Driver**
3. Enter a valid driver user ID in the dialog
4. Click **Assign**
5. Verify: order transitions to ASSIGNED
6. Verify: dialog closes with success message

### WM-05: Status Filters

1. Navigate to merchant orders page
2. Verify: ASSIGNED and PICKED_UP appear in status filter options
3. Verify: filtering by each fulfillment status works correctly

---

## Web Buyer Tracking UAT

### WB-01: Order Detail Tracking

1. Login as buyer
2. Navigate to an order that has been accepted by a merchant
3. Verify: **Shipment Tracking** section appears in the order detail
4. Verify: shipment status badge shows current fulfillment status
5. Verify: event timeline shows fulfillment events in chronological order

### WB-02: Multi-Merchant Tracking

1. Create a master order with items from 2+ merchants
2. Have each merchant accept and progress their sub-orders independently
3. Login as buyer, view the master order
4. Verify: each sub-order shows its own shipment tracking
5. Verify: statuses are independent (not flattened)

### WB-03: Tracking Updates

1. View an order with active shipment
2. Have merchant progress the order (Prepare → Ready → Assign Driver)
3. Refresh the buyer order detail page
4. Verify: new shipment events appear in the timeline

---

## Mobile Merchant Fulfillment UAT

### MM-01: Merchant Orders — Fulfillment Actions

1. Open mobile app, login as merchant
2. Navigate to Merchant → Orders
3. Verify: ACCEPTED orders show **Prepare** button (full-width, green)
4. Verify: PREPARING orders show **Ready** button
5. Verify: READY orders show **Assign Driver** button
6. Verify: ASSIGNED orders show "Awaiting driver pickup…" text
7. Verify: PICKED_UP/OUT_FOR_DELIVERY show "In transit" text

### MM-02: Prepare Flow

1. Tap **Prepare** on an ACCEPTED order
2. Verify: API call to POST /v1/orders/:id/prepare succeeds
3. Verify: card refreshes to show PREPARING status with **Ready** button

### MM-03: Ready Flow

1. Tap **Ready** on a PREPARING order
2. Verify: API call to POST /v1/orders/:id/ready succeeds
3. Verify: card refreshes to show READY status with **Assign Driver** button

### MM-04: Assign Driver Flow

1. Tap **Assign Driver** on a READY order
2. Enter driver user ID in dialog
3. Tap **Assign**
4. Verify: API call to POST /v1/orders/:id/assign-driver succeeds
5. Verify: card refreshes to show ASSIGNED status

---

## Mobile Driver Workflow UAT

### MD-01: Driver Home Entry

1. Login as DRIVER role user
2. Verify: **Driver** section appears on home screen
3. Verify: "My Shipments" card is visible

### MD-02: Driver Shipments Screen

1. Tap **My Shipments** card
2. Verify: navigates to `/driver/shipments`
3. Verify: assigned shipments are listed with status badges
4. Verify: empty state shows when no shipments assigned

### MD-03: Pickup Flow

1. Find a shipment in ASSIGNED status
2. Tap **Pickup**
3. Confirm the dialog
4. Verify: shipment transitions to PICKED_UP
5. Verify: button changes to **Out for Delivery**

### MD-04: Out for Delivery Flow

1. Find a shipment in PICKED_UP status
2. Tap **Out for Delivery**
3. Confirm the dialog
4. Verify: shipment transitions to OUT_FOR_DELIVERY
5. Verify: button changes to **Deliver**

### MD-05: Deliver Flow

1. Find a shipment in OUT_FOR_DELIVERY status
2. Tap **Deliver**
3. Confirm the dialog
4. Verify: shipment transitions to DELIVERED
5. Verify: "Delivered successfully" text appears

### MD-06: Route Protection

1. Login as non-DRIVER user (e.g., BUYER)
2. Attempt to navigate to `/driver/shipments`
3. Verify: redirected to `/home`

---

## Mobile Buyer Tracking UAT

### MB-01: Order Detail Tracking

1. Login as buyer
2. Navigate to an order with active fulfillment
3. Verify: **Shipment Tracking** section appears
4. Verify: shipment status badge is shown
5. Verify: event timeline shows each fulfillment event

---

## Test Environment

| Component | Version |
|---|---|
| API | NestJS + Drizzle + PostgreSQL |
| Web | React (Next.js) |
| Mobile | Flutter (retail + wholesale flavors) |
| Migration | 0040_shipments.sql |

---

## Notes

- Do NOT test carrier integrations, GPS tracking, shipping labels, photo proof, or push notifications — these are M7.2+ scope.
- Driver role must be assigned via organization_members.role_id before testing.
- Multi-merchant tests require 2+ merchant accounts with separate stores.
