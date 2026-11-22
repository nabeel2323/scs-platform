# SCS Platform API route, client and permission matrix

**Audit date:** 22 November 2026  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Source checkpoint:** `8a46082e17b08521d5c976d06996af57fcfb3dcc`  
**Scope:** all 28 NestJS module controller files under `apps/api/src/modules/**`.

## Evidence and interpretation

This is a controller-source map of route families, primary client surfaces and method-level permission keys. It is not a runtime call graph or a complete generated OpenAPI operation inventory. Controller prefixes and method decorators were inspected; route families are grouped for readability.

- Routes without a method-level `@RequirePermission` are **not automatically public**. Many are behind class-level `JwtAuthGuard` and rely on self-ownership, organization/store membership, order ownership, role checks or service-level tenant scope.
- Where a method-level permission is listed, the named permission is the canonical permission decorator observed in source. The API remains authoritative even where web/mobile clients also hide actions.
- Shared contracts/codegen live in `packages/contracts`. Web wrappers live in `apps/web/src/lib/{api.ts,buyer-api.ts}`, Admin wrappers in `apps/admin/src/lib/api.ts`, and mobile API access is concentrated in `mobile/lib/services/api_service.dart` and `mobile/packages/mobile-core/lib/src/api_client.dart`.
- Client surfaces below identify the owning journey area, not proof that every route has a currently invoked UI call site. Exact route-to-call-site tracing remains part of MAP-001.

## Controller inventory

| Controller / base path | Route families observed | Permission / authorization boundary | Primary client or integration consumers |
|---|---|---|---|
| `admin/admin.controller.ts` — `/admin` | Orders/merchants; KPIs/trends; audit; verification; users/roles/organizations; catalog moderation | `admin:orders:read`, `admin:merchants:read`, `admin:kpis:read`, `admin:audit:read`, `merchant:verification:review`, `admin:users:read/write`, `admin:roles:write`, catalog governance and moderation permissions | Admin dashboard, users/roles, merchants, orders, verification, catalog and analytics |
| `analytics/analytics.controller.ts` — `/analytics` | Track single/batch events; read event counts and activity | `analytics:track`, `analytics:read`; authenticated caller attribution | Web/mobile event clients; Admin analytics |
| `catalog-import/catalog-import.controller.ts` — `/admin/catalog-imports` | Upload/list/detail/preview/execute/retry/errors/report/template/export | `catalog:imports:manage` | Admin Import Center |
| `catalog/catalog.controller.ts` — root | Categories/brands; merchant products/variants/media; product imports; search/facets; canonical matching; data quality | Merchant read routes use `catalog:products:read` plus store/org membership checks; merchant writes use `merchant:products:write`; category/brand/product-type governance uses dedicated catalog permissions | Web buyer search/product detail; Web/mobile merchant catalog; Admin catalog moderation |
| `catalog/catalog.offer.controller.ts` — root | Buyer product offers/ranking; merchant offer list/analytics/detail; create/propose/pricing/withdraw; admin lifecycle governance | Read routes authenticated; merchant reads use merchant principal + store/org membership; writes `catalog:offers:write`; governance `catalog:offers:govern` | Web/mobile buyer offer comparison; Web/mobile merchant offers; Admin offer governance |
| `catalog/catalog.requests.controller.ts` — root | Merchant request create/list; Admin request list/approve/reject | Merchant `catalog:offers:write`; Admin `catalog:requests:manage` | Web merchant requests; Admin Requests |
| `catalog/catalog.taxonomy.controller.ts` — root | Attributes/options/groups; product types/schema/publish readiness/versions/variant dimensions | Governance writes `catalog:attributes:manage`, `catalog:product-types:manage`; authenticated taxonomy reads | Web/mobile product schema and merchant editors; Admin taxonomy/Product Types |
| `identity/auth.controller.ts` — `/auth` | OTP request/verify; email OTP; account link/unlink; refresh/logout; org switch; password login/device check | Throttled authentication entry points; JWT-protected account operations; presented device/session credentials | Web and mobile authentication/session flows |
| `identity/organizations.controller.ts` — `/organizations`, `/roles` | Organization create/join/read/update; members/lookup; update requests; role list | JWT; create `identity:organizations:create`; organization/member writes `identity:organizations:write`; membership-scoped reads | Web/mobile organization onboarding and management |
| `identity/profile.controller.ts` — `/me` | Profile/organizations; device tokens; favorites/saved suppliers; credentials; sessions/trusted devices | JWT and self-resource ownership | Web/mobile profile, security, saved suppliers and push registration |
| `inventory/inventory.controller.ts` — root | Store/warehouse/variant inventory and movements; exports; adjust/transfer/reserve/release; low-stock checks | `merchant:inventory:read/write`; store scope service-enforced | Web/mobile merchant inventory |
| `merchant/merchant.controller.ts` — root | Stores/warehouses; customers; documents; verification | Store/document writes `merchant:stores:write`; verification uses `merchant:verification:review` or store-write permissions; reads are tenant/object scoped | Web/mobile merchant profile, registration and verification; Admin verification |
| `merchant/store-membership.controller.ts` — `/stores/:storeId/members` | List/eligible members; add/remove; role change; activate/deactivate | Member list `merchant:stores:read`; mutations and eligible-user lookup `merchant:products:write`; active store membership and manager checks remain service-enforced | Web/mobile merchant team management |
| `notifications/notifications.controller.ts` — root | Notifications/count/read/unread; preferences; device tokens | JWT and caller-scoped notification/device ownership | Web/mobile notifications and push registration |
| `operations/operations.controller.ts` — `/admin/ops/p13` | Worker status/alerts/scan; pause/resume; pilot flags/allowlist | `admin:returns:read/write`; admin operational surface | Admin operations/monitoring |
| `orders/cart.controller.ts` — `/cart` | Cart read; item add/update/remove/clear; validate/reprice; promo apply/remove | JWT self-scope; mutations require `orders:write`; `GET /cart` remains self-scoped read | Web/mobile buyer cart |
| `orders/orders.controller.ts` — root | Checkout; master/order list/detail/history/tracking; merchant accept/reject/prepare/status; buyer cancel/reorder/delivery; driver shipment actions | `orders:write`, `orders:cancel`, `merchant:orders:write`, `fulfillment:shipments:assign/pickup/deliver/read`; service object/tenant checks | Web/mobile buyer and merchant orders; Admin order monitor; mobile driver |
| `payments/payments.controller.ts` — root | Payment details/proof/COD/refund; Admin verification/refund/payment/settlements; merchant payment/settlement lists | Buyer `orders:write`; merchant `merchant:orders:write/read`; Admin `admin:payments:verify/read`, `admin:refunds:approve`, `admin:settlements:write/read`; order ownership scope | Web/mobile buyer and merchant payments; Admin Payments/Settlements |
| `pricing/pricing.controller.ts` — root | Price lists/tiers; variant pricing; resolve-price | `merchant:pricing:read/write`; store ownership/membership scope | Web merchant pricing/Product Studio; selected mobile merchant surfaces |
| `promotions/promotions.controller.ts` — root | Promotion create/list/detail/update/validate; `GET /offers/nearby` | Writes `merchant:promotions:write`; other routes JWT; nearby route currently ignores coordinates/radius in service | Web merchant promotions; buyer discovery candidate; no nearby wrapper found in inspected web/mobile API clients |
| `returns/returns.controller.ts` — root | Buyer returns; merchant approve/reject/receive/inspect; Admin expiry/refund/escalation; calendars; commission reversals; adjustments; reconciliation | Buyer self/order scope; merchant `merchant:orders:read/write`; Admin returns/refund/commission/adjustment/reconciliation permissions | Web/mobile buyer and merchant returns; Admin Returns, Calendar, Commission, Adjustments, Reconciliation |
| `reviews/disputes.controller.ts` — root | Dispute create/list/detail/events/evidence/response/resolve; order conversations/messages/read | `support:disputes:write`, `support:disputes:resolve` on explicit actions; ownership/state checks on other actions | Web/mobile buyer/merchant disputes; Admin Disputes |
| `reviews/reviews.controller.ts` — root | Create order review; store/order review reads; trust summary | JWT plus order/store ownership and service projection | Web/mobile product/store/review journeys |
| `shipping/carrier-admin.controller.ts` — `/carrier` | Carrier credentials/configuration read/write/deactivate; recovery queue/action | `admin:carrier:read/write`, `admin:shipping:recovery` | Admin Carrier & Recovery |
| `shipping/carrier-webhook.controller.ts` — `/webhooks/carrier` | Provider callbacks by provider key or webhook token | Throttling and provider/webhook authentication; not a user JWT route | External carrier callbacks |
| `shipping/shipment-operations.controller.ts` — `/shipments` | Create/cancel shipment; tracking/labels; list/detail; exceptions/retry/RTS/return | `fulfillment:shipments:read/write/return`, `fulfillment:labels:read/write`; shipment ownership/role scope | Web/mobile merchant shipment and delivery; mobile driver; Admin Ship Operations |
| `shipping/shipping.controller.ts` — `/shipping` | Providers/methods/zones/estimates and zone-method links | `fulfillment:shipments:read`, `merchant:shipping:read/write`; estimate uses authenticated/service scope | Web/mobile buyer estimates and merchant shipping configuration |
| `system/bootstrap.controller.ts` — `/system/bootstrap` | Bootstrap status; owner OTP; initial Super Admin creation | Throttled bootstrap lifecycle; separate one-time setup trust boundary | Initial platform setup only |

## Confirmed follow-ups from the route audit

1. **Cart write permission:** the controller previously applied only JWT authentication, while the mobile route policy and role model use `orders:write`. The current implementation adds `PermissionsGuard` after `JwtAuthGuard` and applies `orders:write` to all cart mutations while leaving self-scoped `GET /cart` read-only.
2. **Nearby promotions:** `GET /offers/nearby` does exist in `PromotionsController`; the earlier claim that no API route exists was based on inspecting only catalog controllers. However, `PromotionsService.listNearbyOffers` currently returns active promotions by date and limit and does not use `lat`, `lng` or `radiusKm`. No matching call was found in the inspected web buyer API, web API, mobile API service/client, or Home/Search entry points. A true nearby contract requires an explicit geospatial/location decision and must not be represented by a global promotion fallback.
3. **Support:** the Support module is empty; disputes/conversations are in Reviews and are not a substitute for a support-ticket lifecycle.

## Remaining MAP-001 work

- Trace each API operation to the exact web/Admin/mobile wrapper and page/screen call site; this matrix maps primary surfaces, not every call site.
- Reconcile every controller method's class-level guards, method-level decorators, service ownership/tenant checks and role grants; a missing method decorator is not automatically a vulnerability.
- Reconcile 99 Drizzle-exported tables against the 114+ historical physical relation inventory using authorized read-only evidence.
- Map worker/provider registration, activation flags, retries, leases, outbox ownership, webhook verification, observability and staging runtime topology.
- Keep generated OpenAPI/contracts and API/client behavior aligned; no schema/migration changes are implied by this inventory.


## Carrier provider registry wiring

The Nest module provides/exports `AramexProvider`; `ShippingService.onModuleInit` registers it in `ShippingProviderRegistry` as non-default while preserving `manual-driver` as default. The carrier worker resolves an explicitly configured provider key through that registry; shipment operations otherwise fall back to `manual-driver`. The separate CarrierTrackingPoller defaults a missing provider key to `aramex`. Registration itself performs no credential read or network call; a live carrier operation still requires store-scoped configuration and active encrypted organization credentials. The focused registration test is added but not executed.


## Confirmed API client wrapper symbols

The following wrapper functions were matched to controller route families by source inspection. This is wrapper-level evidence; individual page/screen call sites and generated contract schemas remain part of the remaining MAP-001 trace.

| API family | Admin wrapper symbols | Web wrapper symbols | Mobile wrapper symbols |
|---|---|---|---|
| Authentication/profile | Admin auth/session helpers and user-detail functions | fetchProfile, updateProfile, profile/device helpers | OTP/login/session/device/profile functions in api_service.dart |
| Organizations/store membership | fetchAdminOrganizations, fetchAdminOrgUpdateRequests, reviewOrgUpdateRequest, fetchAdminUsers, assignUserRole, removeUserRole | createOrganization, joinOrganization, fetchMyOrganizations, fetchOrganization, updateOrganization, fetchOrgMembers, addOrgMember, removeOrgMember, lookupOrgMember, submitOrgUpdateRequest, fetchOrgUpdateRequests, fetchStoreMembers, addStoreMember, removeStoreMember, changeMemberRole, activateMember, deactivateMember | Organization/store/member counterparts in api_service.dart |
| Catalog/taxonomy | fetchAdminBrandsEnriched, createAttribute, updateAttribute, deleteAttribute, addAttributeOption, createAttributeGroup, createProductType, publishProductType, setVariantDimensions, updateProductTypeCategory, createNewVersion, fetchAdminCatalogRequests, approveCatalogRequest, rejectCatalogRequest, fetchDataQualityMetrics | Merchant catalog request wrappers and buyer search/product wrappers | Product/variant/media/category/product-type wrappers in api_service.dart |
| Catalog imports | uploadCatalogImport, fetchCatalogImports, fetchCatalogImport, fetchCatalogImportPreview, executeCatalogImport, fetchCatalogImportErrors, retryCatalogImport, downloadCatalogImportReport, downloadCatalogTemplate, exportCatalog | Store-scoped merchant import wrappers | Store import submit/status/process wrappers |
| Cart/checkout | Admin order/payment visibility helpers | fetchCart, addToCart, updateCartItem, removeCartItem, clearCart, validateCart, applyPromoCode, previewCheckout, checkout | fetchCart, addToCart, updateCartItem, removeCartItem, clearCart, validateCart, applyPromo, removePromo, checkout preview/submit |
| Orders/fulfillment | fetchAdminOrders, fetchAdminOrderDetail, admin cancellation/status helpers | fetchOrders, fetchOrder, fetchMasterOrder, fetchOrderHistory, cancelOrder, confirmDelivery, reorder, acceptMerchantOrder, rejectMerchantOrder, partiallyAcceptMerchantOrder, transitionOrderStatus, prepareOrder, readyOrder, assignDriver, fetchTracking | Buyer/merchant order and driver shipment action wrappers in api_service.dart |
| Payments/finance | fetchAdminPayments, payment verification/refund/settlement wrappers | Payment proof/refund wrappers in buyer/merchant client surfaces | Buyer/merchant payment and order payment methods |
| Inventory/pricing | Admin inventory and settlement operations | Inventory, warehouse, price-list and tier wrappers in buyer-api.ts | fetchWarehouseInventory, fetchLowStock, adjustStock, createInventoryItem, updateInventoryItem, bulkAdjustStock, fetchStoreInventory, transferStock, checkLowStock, price-list wrappers |
| Promotions/shipping | Admin offer KPI/trend and governance wrappers | fetchStorePromotions, createPromotion, updatePromotion, fetchShippingMethods, createShippingMethod, updateShippingMethod, deactivateShippingMethod, fetchDeliveryZones, createDeliveryZone, updateDeliveryZone, attachMethodToZone, detachMethodFromZone, fetchShippingEstimate | Merchant promotion/offer, shipping estimate and shipping configuration wrappers |
| Notifications/reviews/disputes | fetchDisputeEvents, analytics and audit wrappers | fetchNotifications, unread/read operations, createReview, fetchStoreReviews, createDispute, fetchDisputes, fetchDisputeEvents, submitDisputeEvidence | Notification, review, dispute and evidence wrappers in api_service.dart |
| Returns | Admin return, refund, commission, adjustment and reconciliation screens | fetchMyReturns, fetchReturn, createReturn, cancelReturn, markReturnShipped | No matching return wrapper found in inspected api_service.dart; confirm whether mobile returns are intentionally web-only or implemented through another service |
| Nearby promotions | No wrapper found | No offers/nearby wrapper found in api.ts or buyer-api.ts | No offers/nearby wrapper found in api_service.dart or mobile-core api_client.dart |

## Worker and provider activation cross-reference

- Source-level worker ownership, startup delays, runtime gates, leases and outbox prefix ownership are documented in docs/remediation/OUTBOX-EVENT-OWNERSHIP-MAP.md.
- P13 return-expiration processing is disabled unless P13_WORKER_ENABLED is explicitly enabled. The separate P13 monitor runs on each API instance at the configured cadence (default 60 seconds); alert dedup is enforced in Postgres and the default alert sink is log-only.
- AutoCompleteWorker, ShippingCarrierWorker, CarrierTrackingPoller and the generic OutboxDispatcher are registered in API modules and start in-process without a P13 gate. Carrier and tracking workers use atomic row claims; the generic dispatcher is a log sink and is not a side-effect delivery system.
- Aramex is registered as a non-default provider; manual-driver remains the default for ordinary shipment operations. The tracking poller uses aramex only as its fallback provider key. Actual carrier requests still require active store configuration and encrypted organization credentials.


## RBAC seed alignment correction — 22 November 2026

The source audit found that the canonical permission seed does not define `merchant:products:read`, and no built-in role receives it. Five merchant product/import read routes in CatalogController and the store-member list route therefore required a permission absent from every seeded role. CatalogController now uses the existing `catalog:products:read` key while retaining its store/org membership checks. StoreMembershipController now uses `merchant:stores:read`; that existing key is granted to MERCHANT_STAFF as well as MERCHANT_OWNER so active store members can read the member list, while mutation routes continue to require `merchant:products:write` and service-level membership-manager checks. No new permission key was added. Focused tests were added but not executed.
