# G-002 Controller-to-Service Callsite Map — 22 November 2026

## Scope

Source checkpoint: 5071a5f087e32fc376a9c5f92c600b69effea477. This document connects all 28 module controller files in docs/api-route-permission-matrix.md to their controller methods and called service methods. The route matrix remains authoritative for full HTTP paths, guards and permission decorators. The G-002 database operation map remains authoritative for service-to-table operations. This is a static source callsite map, not a runtime trace or an approved RLS policy.

## Controller method to service call map

| Controller | Controller methods and callsites |
|---|---|
| AdminController (/admin) | listOrders→AdminService.listOrders; getOrderDetail→getOrderDetail; listMerchants→listMerchants; getMerchantDetail→getMerchantDetail; getKpis→getKpis; getOfferRevenueKpis→getOfferRevenueKpis; getOfferTrend→getOfferTrend; getAuditLogs→getAuditLogs; listVerifications/verificationQueue→listVerifications; listCategories→listCategories; listBrands→listBrands; listOffers→listOffers; listDisputes/getDispute→listDisputes/getDisputeDetail; listUsers/getUserDetail/updateUser/assignRole/removeRole/createUser/updateUserProfile→corresponding AdminService methods; getPermissionCatalog/getRoleDetail/updateRolePermissions/listRoles→corresponding AdminService methods; listOrganizations/getOrganizationDetail/deactivateOrganization/listOrgUpdateRequests/reviewOrgUpdateRequest→corresponding AdminService methods; listProductsModeration/productMediaPreviews/adminCreateProduct/adminUpdateProduct/adminGetProductAttributeValues/adminSetProductAttributeValues/moderateProductPost/moderateProduct/getModerationQueue/startProductReview/moderateProductP11/getAdminModerationHistory/adminGetVariant/adminCreateVariant/adminUpdateVariant/adminGetVariantAttributeValues/adminSetVariantAttributeValues/adminBulkVariantOperations→corresponding AdminService methods. |
| AnalyticsController (/analytics) | track→AnalyticsService.track; trackBatch→trackBatch; eventCounts→getEventCounts; userActivity→getUserActivity. |
| CatalogImportController (/admin/catalog-imports) | upload/list/detail/preview/execute/retry/errors/report/template/export→CatalogImportService.upload/listImports/getImportDetail/getPreview/execute/retry/getErrors/downloadReport/downloadTemplate/exportCatalog. |
| CatalogController (root) | Category/brand/product/variant/media/import-job/canonical/data-quality methods call CatalogService; submitProduct/withdrawProduct/publishProduct/unpublishProduct/getMerchantModerationHistory call ProductGovernanceService; get/set product and variant attribute values call CatalogTaxonomyService (writes also call AuditService.record); search/getTopCategories/getPopularBrands/getSearchFacets call SearchService; presignMedia calls StorageService.createPresignedPutUrl. |
| CatalogOfferController (root) | listOffersForProduct/listOffersForProductRanked/listMerchantOffers/listMerchantOfferTrend/listMerchantOfferAnalytics/getOffer/createOffer/proposeOffer/updateOfferPricing/withdrawOffer/approveOffer/rejectOffer/suspendOffer/reactivateOffer→OfferService methods of the same names (getOffer may also call getOfferForMerchant). |
| CatalogRequestsController (root) | createRequest/listMerchantRequests/listAdminRequests/approveRequest/rejectRequest→CatalogRequestsService methods of the same names. |
| CatalogTaxonomyController (root) | Attribute/group/product-type CRUD, publish readiness, publish/duplicate/versioning, product-type attribute/variant-dimension/category operations→CatalogTaxonomyService; getProductsByProductType→CatalogService.getProductsByProductType; preview→CatalogTaxonomyService.getProductTypeSchema + RulesService.evaluate. |
| AuthController (/auth) | OTP request/verify, email OTP, account link/unlink, refresh/logout, switch-org, password login and device check→IdentityService.requestOtp/verifyOtp/requestEmailOtp/verifyEmailOtp/linkEmailToAccount/linkPhoneToAccount/unlinkEmailFromAccount/unlinkPhoneFromAccount/refreshToken/logout/switchOrg/loginWithPassword/checkDeviceLogin. |
| OrganizationsController (/organizations, /roles) | createOrg/joinOrg/getOrg/updateOrg/addMember/listMembers/removeMember/lookupMember/requestUpdate/listUpdateRequests/listRoles→IdentityService methods of the same names (joinOrg calls joinOrgByInvite; lookupMember calls lookupUser). |
| ProfileController (/me) | getProfile/updateProfile/getMyOrganizations/credentials and session/trusted-device operations→IdentityService; register/list/unregister device token→NotificationsService; favorites and saved suppliers→CatalogService. |
| InventoryController (root) | exportInventory/exportMovements/checkLowStock/listByStore/createItem/bulkAdjustStock/transferStock/listByWarehouse/listByVariant/getLowStock/updateItem/adjustStock/reserveStock/releaseStock/listMovements→InventoryService methods of the same names. |
| MerchantController (root) | Store/warehouse/customer/document/verification methods→MerchantService; presignDocumentUpload→StorageService.createPresignedPutUrl. |
| StoreMembershipController (/stores/:storeId/members) | listMembers/listEligibleUsers/addMember/removeMember/changeRole/activateMember/deactivateMember→StoreMembershipService; controller also directly reads stores and store_members before service calls. |
| NotificationsController (root) | list/unreadCount/markAllAsRead/markAsRead/markAsUnread/getPreferences/updatePreference/registerDeviceToken/unregisterDeviceToken→NotificationsService methods of the same names. |
| OperationsController (/admin/ops/p13) | status→lease/control/alert/pilot snapshots and live-holder counts; openAlerts→OpsAlertService.listOpen; scan→OpsMonitorService.scan; pause/resume→OpsControlService.setPaused; controlHistory→history; pilotState→PilotControlService.snapshot; setPilotFlag/addAllowlist/revokeAllowlist→PilotControlService methods. |
| CartController (/cart) | getCart/addItem/updateItem/removeItem/clearCart/validateCart/removePromo/applyPromo→CartService.getActiveCartWithItems/addItem/updateItemQuantity/removeItem/clearCart/validateCart/removePromoCode/applyPromoCode. |
| OrdersController (root) | Checkout/preview, master-order list/detail/history/tracking, buyer order list/detail/reorder/cancel, merchant accept/reject/prepare/status, driver pickup/delivery/assignment→OrdersService methods of corresponding names. |
| PaymentsController (root) | getPayment/submitProof/confirmCash/requestRefund/verifyPayment/requestedRefunds/approveRefund/listPayments/verificationQueue/stalePayments/calculateSettlement/markSettlementPaid/listSettlements/merchantListPayments/merchantSettlements→PaymentsService methods; getPayment additionally loads order/payment-events/refunds. |
| PricingController (root) | create/list/get/update price lists, tier CRUD, getProductPricing, resolvePrice→PricingService methods; controller calls assertStoreInOrg and assertStoreMember before store-scoped list operations. |
| PromotionsController (root) | createPromotion/listByStore/listActive/getPromotion/updatePromotion/validateCode/getNearbyOffers→PromotionsService methods; nearby route calls listNearbyOffers (its current query behavior is separately tracked in MAP-001). |
| ReturnsController (root) | Buyer/merchant/Admin return lifecycle methods→ReturnsService; business calendar routes→BusinessCalendarService; commission reversals→CommissionReversalService; settlement adjustments→SettlementAdjustmentService; reconciliation routes→ReconciliationService. |
| DisputesController (root) | createDispute/listDisputes/getDispute/getDisputeEvents/submitEvidence/submitResponse/resolveDispute/createConversation/getConversation/getMessages/sendMessage/markRead→DisputesService methods of corresponding names. |
| ReviewsController (root) | createReview/getStoreReviews/getOrderReviews/getReview/getTrust→ReviewsService.createReview/getReviewsBySubject/getReviewsByOrder/getReview/getTrustSnapshot. |
| CarrierAdminController (/carrier) | Credential routes→CarrierCredentialsService; configuration routes→CarrierConfigurationsService; recoverShipment→direct shipment/store reads and shipment update, CarrierReconciliationService.reconcileShipment, AuditService.record; getRecoveryQueue→direct stores/shipments read model. |
| CarrierWebhookController (/webhooks/carrier) | handleWebhook/handleWebhookWithToken→private processWebhook; provider credentials, webhook events, shipment linkage and retry outbox are direct DatabaseService operations. No user JWT is used; the credential token/HMAC establishes provider tenant context. |
| ShipmentOperationsController (/shipments) | createCarrierShipment/cancelShipment/getTracking/requestLabel/getLabels/listShipments/getShipmentDetail/requestRTS use direct DatabaseService operations; provider cancel/tracking uses ShippingProviderRegistry; exception/retry/RTS/return lifecycle methods also call OrdersService; label detail uses StorageService. |
| ShippingController (/shipping) | providers/methods/zones/estimates and zone-method associations→ShippingService methods of the same names. |
| BootstrapController (/system/bootstrap) | status/owner OTP/createSuperAdmin→BootstrapService; createSuperAdmin also calls rateLimit.checkAndIncrement/getResetSeconds. |

## Direct controller database access

Only four module controllers in this inventory directly issue query-builder operations through DatabaseService. Other controllers reach the database through services or the shared tenant-scope helpers below.

| Controller | Direct tables and operations | Context / scope evidence |
|---|---|---|
| StoreMembershipController | stores R; store_members R | Resolves store then verifies activeOrg; listMembers additionally requires ACTIVE store membership before calling StoreMembershipService. |
| CarrierAdminController | shipments R/U; stores R | Recovery detail resolves shipment→store→org; privileged platform roles bypass; recovery queue resolves org store IDs then filters shipments by those IDs. |
| CarrierWebhookController | carrier_credentials R; carrier_webhook_events I/U; shipments R; outbox_events I | No JWT. Token route resolves exactly one credential by providerKey+webhookToken; legacy providerKey-only route now rejects when more than one active credential exists. Credential/HMAC is the provider identity; payload tenant IDs are not trusted. |
| ShipmentOperationsController | shipments R/U; stores R; orders R; shipment_events R/I; shipment_labels R; outbox_events R/I | JWT + method permission. assertShipmentAccessible resolves shipment→store→org; platform roles bypass. listShipments scopes non-privileged callers to activeOrg stores, then applies request filters. Create-shipment and label-queue paths use DB transactions. |

## Shared tenant-scope helper callsites

The following controllers pass the singleton DatabaseService to common helpers rather than issuing direct query-builder calls themselves: CatalogController, CatalogOfferController, CatalogRequestsController, MerchantController, PricingController and PaymentsController.

The common helpers in apps/api/src/common/tenant-scope.ts read these relationships:

- assertStoreInOrg/storeOrgId: stores R.
- assertStoreMember: store_members R, requiring ACTIVE membership.
- assertVariantInOrg/assertVariantStoreMember: product_variants R → products R → stores R; the membership variant also reads store_members.
- assertProductInOrg/assertProductReadable/assertProductEditableByMerchant/canManageProductCatalog: products R → stores R → store_members R as applicable; public product visibility also filters deletedAt and status.
- assertWarehouseInOrg/assertWarehouseMember: warehouses R → stores R; member variant also reads store_members.
- assertInventoryItemInOrg/assertInventoryItemMember: inventory_items R → warehouses R → stores R; member variant also reads product_variants/products/store_members and checks warehouse-store equals variant-store.
- assertOrderAccessible: caller buyerId or order store's organization; reads stores R.
- assertMasterOrderAccessible: buyer ownership or any sub-order store in caller organization; reads stores R.
- financialOrgScope is a fail-closed context check and ops-counter increment; it does not query the database.

These helpers use DatabaseService directly and are not passed the caller's active transaction. A future request-context/transaction design must account for this boundary and avoid silently running authorization reads outside the operation transaction.

## Important context boundaries

1. Carrier webhooks are external provider identities, not user/JWT identities. The webhook-token route is tenant-specific. The legacy provider-only route is now fail-closed if active credentials are ambiguous.
2. Shipment operations use organization-level store ownership for merchant shipment visibility, not the stricter active store-membership helper. Preserve this distinction unless a separate product/security decision changes it.
3. Store membership list requires an ACTIVE store_members row; mutations additionally call membership manager/target-role checks in StoreMembershipService.
4. Bootstrap is a one-time system actor; P13 operations are platform/operator controls; background workers and outbox handlers remain separate contexts.
5. The route-to-service map plus service operation map is still source-only. It does not prove deployed runtime role, actual SQL query plans, table policy completeness or the protected 114-versus-116 relation count.

## Explicit non-actions

No controller endpoint was invoked. No webhook/provider call, worker action, database query/write, migration, seed, reset, bootstrap, grant change, RLS activation, staging deployment or test run occurred.


## Method-level ownership predicate link — 22 November 2026

The controller callsite map is now paired with [G-002-METHOD-LEVEL-OWNERSHIP-PREDICATE-MAP-2026-11-22.md](./G-002-METHOD-LEVEL-OWNERSHIP-PREDICATE-MAP-2026-11-22.md) for the first high-risk service batch (Orders, Payments, Inventory). It records the ownership checks and the internal unscoped helper methods that public controller routes must wrap.


## Catalog method-level predicate link — 22 November 2026

The method-level map now includes CatalogService, CatalogOfferService, ProductGovernanceService and CatalogTaxonomyService. It records product/store, product/variant, media/product, offer/store/product, price-list/warehouse and admin taxonomy boundaries. Four ownership gaps were fixed; focused tests were added but not run.
