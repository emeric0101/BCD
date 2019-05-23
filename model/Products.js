// Helper class for centrally handling oData CRUD and function import services. The interface provides the business
// meanings for the application and can be reused in different places where the UI-specific actions after the call
// could still be different and will be handled in the corresponding controller of the view.
// Every (main) view of this app has an instance of this class as an attribute so that it can forward all explicit
// backend calls to it.
sap.ui.define([
	"sap/ui/base/Object",
	"sap/m/DraftIndicatorState",
	"sap/ui/Device",
	"sap/ui/generic/app/transaction/TransactionController",
	"sap/ui/demoapps/rta/freestyle/util/messages",
	"sap/ui/demoapps/rta/freestyle/controller/utilities"
], function(BaseObject, DraftIndicatorState, Device, TransactionController, messages, utilities) {
	"use strict";

	var oResolvedPromise = Promise.resolve(),
		mParametersForRead = Object.freeze({
			expand: "DraftAdministrativeData,to_ProductTextInOriginalLang,to_Supplier,to_ProductStock,to_ProductStock/to_StockAvailability" +
				",to_ProductCategory,to_CollaborativeReview,to_ProductBaseUnit,to_DimensionUnit,to_WeightUnit,to_Supplier,to_Supplier/to_PrimaryContactPersonType",
			select: "Currency,Depth,DraftUUID,HasDraftEntity,Height,IsActiveEntity,Price,Product,ProductBaseUnit,ProductCategory,ProductForEdit,ProductPictureURL,Weight,Width,DraftAdministrativeData/InProcessByUser,DraftAdministrativeData/DraftUUID,DraftAdministrativeData/CreationDateTime,DraftAdministrativeData/LastChangeDateTime,DraftAdministrativeData/DraftIsCreatedByMe,to_ProductTextInOriginalLang/Name,to_ProductTextInOriginalLang/Description,to_Supplier/PhoneNumber, to_Supplier/FaxNumber,to_Supplier/URL,to_Supplier/CompanyName,to_Supplier/EmailAddress,to_ProductStock/StockAvailability,to_ProductStock/to_StockAvailability/StockAvailability_Text,to_ProductCategory/MainProductCategory,to_ProductCategory/ProductCategory,to_CollaborativeReview/AverageRatingValue,to_CollaborativeReview/NumberOfReviewPosts,to_ProductBaseUnit/UnitOfMeasure_Text,to_DimensionUnit/UnitOfMeasure_Text,to_WeightUnit/UnitOfMeasure_Text,to_Supplier/to_PrimaryContactPersonType/EmailAddress,to_Supplier/to_PrimaryContactPersonType/FirstName,to_Supplier/to_PrimaryContactPersonType/LastName,to_Supplier/to_PrimaryContactPersonType/PhoneNumber,to_Supplier/to_PrimaryContactPersonType/FormattedContactName,to_Supplier/to_PrimaryContactPersonType/MobilePhoneNumber"
		});

	return BaseObject.extend("sap.ui.demoapps.rta.freestyle.model.Products", {
		// Attributes of this class:
		// _oResourceBundle, _oODataModel, _oApplicationProperties, _oApplication, _oMainView
		// are the global objects used throughout this app
		constructor: function(oComponent, oMainView, fnBeforeActivation, fnOnActivationFailed) {
			this._oResourceBundle = oComponent.getModel("i18n").getResourceBundle();
			this._oODataModel = oComponent.getModel();
			this._oApplicationProperties = oComponent.getModel("appProperties");
			this._oApplication = this._oApplicationProperties.getProperty("/applicationController");
			this._oMainView = oMainView;
			this._fnBeforeActivation = fnBeforeActivation;
			this._fnOnActivationFailed = fnOnActivationFailed;
			this._oChangesSubmitted = oResolvedPromise;
			this._fnChangeSubmitResolve = null;
			this._mDeletedProducts = {};
			this._mDeletedDrafts = {};
			this._oTransactionController = new TransactionController(this._oODataModel);
		},

		getPathForDraft: function(sProductId, sDraftId, bIsActive) {
			return this._oODataModel.createKey("/SEPMRA_C_PD_Product", {
				Product: sProductId,
				DraftUUID: sDraftId,
				IsActiveEntity: bIsActive
			});
		},

		getParametersForRead: function() {
			return mParametersForRead;
		},

		// Additional methods for working with products

		// Creates a product draft for a new product.
		createProductDraft: function(fnProductDraftCreated) {
			this._oApplication.setAppBusy();
			var oDraftController = this._oTransactionController.getDraftController(),
				oCreatePromise = oDraftController.createNewDraftEntity("SEPMRA_C_PD_Product", "/SEPMRA_C_PD_Product"),
				fnCreatedHandler = function(oResponse) {
					fnProductDraftCreated(oResponse.data);
				};
			oCreatePromise.then(fnCreatedHandler, this._oApplication.resetAppBusy());
		},

		// Creates product draft from a specified product ID for CopyProduct
		copyProductToDraft: function(sProductId, fnNavToDraft) {
			var fnSuccess = function(oResponseContent) {
				fnNavToDraft("", oResponseContent.DraftUUID);
			};
			this._oApplication.setAppBusy();
			this._callFunctionImport("/SEPMRA_C_PD_ProductCopy", {
					Product: sProductId,
					DraftUUID: utilities.getNullUUID(),
					IsActiveEntity: true
				},
				fnSuccess
			);
		},

		// Gets product draft from a specified product ID for EditProduct
		getProductDraftFromProductId: function(oContext, fnNavToDraft, fnNoDraft) {
			this._oApplication.setAppBusy();
			var sProductId = this._oApplicationProperties.getProperty("/productId"),
				oDraftController = this._oTransactionController.getDraftController(),
				fnCreatedHandler = function(oResponse) {
					fnNavToDraft(oResponse.data.Product, oResponse.data.DraftUUID);
				},
				fnFailedHandler = function() {
					this._oApplication.setAppBusy();
					fnNoDraft();
				},
				oProductHasNoDraft = this.whenProductIsClean(sProductId);
			oProductHasNoDraft.then(oDraftController.createEditDraftEntity.bind(oDraftController, oContext)).then(fnCreatedHandler).catch(
				fnFailedHandler);
		},

		// Convenience method for calling function imports. Provides error handling and the busy indicator.
		_callFunctionImport: function(sFunctionName, oURLParameters, fnAfterFunctionExecuted, sProcessingProperty) {
			this._oODataModel.callFunction(sFunctionName, {
				method: "POST",
				urlParameters: oURLParameters,
				success: fnAfterFunctionExecuted,
				error: this._getResetPropertyFunction(sProcessingProperty)
			});
		},

		// Turns ProductDraft into Product and deletes ProductDraft
		activateProduct: function(oContext, fnAfterActivation) {
			this._fnBeforeActivation();
			//this._oApplicationProperties.setProperty("/isBusySaving", true);
			this._oApplication.setAppBusy();
			this._submitChanges().then(
				this._activateProduct.bind(this, oContext, fnAfterActivation, this._fnOnActivationFailed));
		},

		_activateProduct: function(oContext, fnAfterActivation, fnActivationFailed) {
			var oDraftController = this._oTransactionController.getDraftController(),
				oActivatePromise = oDraftController.activateDraftEntity(oContext),
				sProductId = oContext.getObject().ProductForEdit,
				fnActivatedHandler = function() {
					fnAfterActivation(sProductId);
					// Product {0} was saved successfully
					var sSuccessMessage = this._oResourceBundle.getText("ymsg.saveSuccess", [sProductId]);
					sap.ui.require(["sap/m/MessageToast"], function(MessageToast) {
						MessageToast.show(sSuccessMessage);
					});
				}.bind(this);
			oActivatePromise.then(this._invalidateFrontendCache.bind(this, sProductId, fnActivatedHandler), this._getResetPropertyFunction(
				"isBusySaving", fnActivationFailed));
		},

		// Saves ProductDraft each time a user edits a field
		saveProductDraft: function() {
			if (this._oODataModel.hasPendingChanges()) {
				this._oApplicationProperties.setProperty("/draftIndicatorState", DraftIndicatorState.Saving);
				this._submitChanges();
			}
		},

		_submitChanges: function() {
			if (this._fnChangeSubmitResolve || !this._oODataModel.hasPendingChanges()) {
				return this._oChangesSubmitted;
			}
			this._oChangesSubmitted = new Promise(function(fnResolve) {
				this._fnChangeSubmitResolve = function() {
					this._fnChangeSubmitResolve = null;
					fnResolve();
					if (this._oApplicationProperties.getProperty("/draftIndicatorState") === DraftIndicatorState.Saving) {
						this._oApplicationProperties.setProperty("/draftIndicatorState", DraftIndicatorState.Saved);
					}
				}.bind(this);
				this._sMessage = null;
				var oParameters = {};
				oParameters.success = function(oResponseData) {
					var bHasChanges = this._oODataModel.hasPendingChanges();
					if (!bHasChanges || !this._sMessage) {
						var i;
						for (i = 0; i < oResponseData.__batchResponses.length && !this._sMessage; i++) {
							var oEntry = oResponseData.__batchResponses[i];
							if (oEntry.response) {
								this._sMessage = messages.extractErrorMessageFromDetails(oEntry.response.body);
							}
						}
					}
					if (this._sMessage || !bHasChanges) {
						this._fnChangeSubmitResolve();
					} else {
						this._oODataModel.submitChanges(oParameters);
					}
				}.bind(this);
				oParameters.error = this._fnChangeSubmitResolve;
				this._oODataModel.submitChanges(oParameters);

			}.bind(this));
			return this._oChangesSubmitted;
		},

		_getResetPropertyFunction: function(sProperty, fnAfterwards) {
			return function() {
				this._oApplicationProperties.setProperty("/" + sProperty, false);
				if (fnAfterwards) {
					fnAfterwards(arguments);
				}
			}.bind(this);
		},

		deleteDraftFromResume: function(sPath, sDraftId, bDirty) {

			if (this._mDeletedDrafts[sDraftId]) { // product is already deleted (or in the process of being deleted)
				return;
			}
			this._mDeletedDrafts[sDraftId] = true;
			var fnSuccess = function() {
				var sSuccessMessage;
				this._oApplication.resetAppBusy();
				if (bDirty) {
					sSuccessMessage = this._oResourceBundle.getText("ymsg.draftEditDiscarded");
					sap.ui.require(["sap/m/MessageToast"], function(MessageToast) {
						MessageToast.show(sSuccessMessage);
					});
				}
			}.bind(this);
			var fnFailed = function() {
				this._oApplication.resetAppBusy();
				delete this._mDeletedDrafts[sDraftId];
			};

			this._oApplication.setAppBusy();
			this._oTransactionController.deleteEntity(sPath).then(
				fnSuccess,
				fnFailed
			);
		},

		deleteDraftEntity: function(oContext, bIsDraftDirty) {
			var sProductId = oContext.getObject().Product;
			var sDraftId = oContext.getObject().DraftUUID;
			this.bHasActiveEntity = oContext.getObject().HasActiveEntity;
			if (this._mDeletedDrafts[sDraftId]) { // product is already deleted (or in the process of being deleted)
				return;
			}
			this._mDeletedDrafts[sDraftId] = true;
			if (sProductId) {
				if (this.bHasActiveEntity) {
					// Just display the active product
					this._oApplication.displayProduct(sProductId);
				} else {
					// Draft Entitiy is a create entity, so need to use preferredIds
					this._oApplication.navToMaster(null, null);
				}
			} else if (this._oApplicationProperties.getProperty("/draftId") === sDraftId) {
				this._oApplicationProperties.setProperty("/draftId", "");
				this._oApplication.navToMaster(sDraftId, this._oApplicationProperties.getProperty("/preferredIds"));
			}
			var fnSuccess = function() {
				var sSuccessMessage;
				this._oApplication.resetAppBusy();
				if (bIsDraftDirty) {
					if (this.bHasActiveEntity) {
						sSuccessMessage = this._oResourceBundle.getText("ymsg.draftEditDiscarded");
					} else {
						sSuccessMessage = this._oResourceBundle.getText("ymsg.draftCreateDiscarded");
					}
					sap.ui.require(["sap/m/MessageToast"], function(MessageToast) {
						MessageToast.show(sSuccessMessage);
					});
				}

			}.bind(this);
			var fnFailed = function() {
				delete this._mDeletedDrafts[sDraftId];
			};

			this._oApplication.setAppBusy();
			this._oTransactionController.deleteEntity(oContext).then(
				fnSuccess(oContext, bIsDraftDirty),
				fnFailed
			);

		},

		deleteProduct: function(oContext) {
			var sProductId = oContext.getObject().ProductForEdit;
			if (this._mDeletedProducts[sProductId]) { // product is already deleted (or in the process of being deleted)
				return;
			}
			this._mDeletedProducts[sProductId] = true;
			var fnSuccess = function() {
					if (Device.system.phone) {
						this._oApplication.navToMaster(null, null);
						this._invalidateFrontendCache(sProductId);
					}
					var sSuccessMessage = this._oResourceBundle.getText("ymsg.deleteProduct", [sProductId]);
					sap.ui.require(["sap/m/MessageToast"], function(MessageToast) {
						MessageToast.show(sSuccessMessage);
					});
				}.bind(this),
				fnFailed = function() {
					delete this._mDeletedProducts[sProductId];
				};

			this._oApplication.setAppBusy();
			this._oTransactionController.deleteEntity(oContext).then(
				fnSuccess,
				fnFailed);
		},

		deleteEntities: function(aItemsToDelete) {
			// Delete an array of Products by using a list of binding contexts with the transaction controller
			// The binding contexts were added to the array of items to be deleted when selected by the user
			// in the multiselect delete dialog.
			var aItems = [],
				sDraftId, sProductId;
			for (var i = 0; i < aItemsToDelete.length; i++) {
				sDraftId = aItemsToDelete[i].DraftUUID;
				sProductId = aItemsToDelete[i].Product;
				// An Active Product is being deleted
				if (sDraftId === utilities.getNullUUID()) {
					if (this._mDeletedProducts[sProductId]) { // product is already deleted (or in the process of being deleted)
						break;
					}
					this._mDeletedProducts[sProductId] = true;
				} else { // A draft is being deleted
					if (this._mDeletedDrafts[sDraftId]) {
						break;
					} else {
						this._mDeletedDrafts[sDraftId] = true;
					}
				}
				aItems.push(aItemsToDelete[i].BindingContext);
			}
			// After deletion of more than one item, we don't want master list to select
			// the previously selected item
			this._oApplicationProperties.setProperty("/productId", null);
			this._oApplicationProperties.setProperty("/draftId", null);

			this._oTransactionController.deleteEntities(aItems).then(
				this._onDeletionsSuccess).catch(
				// Error handling has currently a bug and does not work
				this._onDeletionsFailure);
		},

		_onDeletionsSuccess: function(oResponse) {
			//assume that all items have been deleted
		},

		_onDeletionsFailure: function(oResponse) {
			// remove those items that could not be deleted
		},

		_invalidateFrontendCache: function(sProductId, fnAfterInvalidation) {
			if (sProductId) {
				var sActivePath = this.getPathForDraft(sProductId, utilities.getNullUUID(), true);
				this._oODataModel.createBindingContext(sActivePath, null, mParametersForRead, fnAfterInvalidation || jQuery.noop, true);
			}
		},

		isDraftIdValid: function(sDraftId) {
			return !this._mDeletedDrafts[sDraftId];
		},

		whenProductIsClean: function(sProductId) {
			return oResolvedPromise;
		}
	});
});
