/*global location */
sap.ui.define([
	"sap/ui/demoapps/rta/freestyle/controller/BaseController",
	"sap/m/DraftIndicatorState",
	"sap/m/MessagePopover",
	"sap/m/MessagePopoverItem",
	"sap/ui/model/json/JSONModel",
	"sap/ui/demoapps/rta/freestyle/util/controls",
	"./utilities",
	"sap/m/MessageToast"
], function(
	BaseController,
	DraftIndicatorState,
	MessagePopover,
	MessagePopoverItem,
	JSONModel,
	controls,
	utilities,
	MessageToast
) {
	"use strict";

	return BaseController.extend("sap.ui.demoapps.rta.freestyle.controller.ProductEdit", {

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit: function() {
			var oApplication = this.getApplication();
			oApplication.registerEdit(this);
			this._oODataHelper = oApplication.getODataHelper();
			this._oViewModel = new JSONModel({
				dataLoaded: false,
				openItemsRequest: 0,
				subCategoriesAvailable: false
			});
			this.setModel(this._oViewModel, "editView");
			this._oSubCategory = this.byId("subcategory");
			this._oSubcategoryItemTemplate = this._oSubCategory && this.byId("subcategoryItem").clone();

			// Create Message Popover for Error Handling
			MessagePopover.setDefaultHandlers({
				asyncDescriptionHandler: function(oConfig) {
					$.ajax({
						url: oConfig.item.getLongtextUrl()
					}).done(function(data) {
						oConfig.item.setDescription(data);
						oConfig.promise.resolve();
					});
				}
			});

			this._oMessagePopover = new MessagePopover({
				items: {
					path: "message>/",
					template: new MessagePopoverItem({
						longtextUrl: "{message>descriptionUrl}",
						type: "{message>type}",
						title: "{message>message}"
					})
				}
			});
			controls.attachControlToView(this.getView(), this._oMessagePopover);
			this.setModel(sap.ui.getCore().getMessageManager().getMessageModel(), "message");
		},

		productChanged: function() {

			var oApplicationProperties = this.getApplicationProperties(),
				sDraftId = oApplicationProperties.getProperty("/draftId");
			// if (sDraftId === utilities.getNullUUID()) {
			// 	this._notAvailable();
			// 	return;
			// }
			oApplicationProperties.setProperty("/draftIndicatorState", DraftIndicatorState.Clear);
			this._bIsInHistory = oApplicationProperties.getProperty("/detailInHistory");
			this._sProductId = oApplicationProperties.getProperty("/productId");
			this._sDraftId = sDraftId;
			var sContextPath = this._oODataHelper.getPathForDraft(this._sProductId, this._sDraftId, false),
				sTitleKey = this._sProductId ? "xtit.productEdit" : "xtit.productNew";
			// this._bindView(sContextPath);
			this._oViewModel.setProperty("/dataLoaded", true);
			this._oViewModel.setProperty("/title", this.getResourceBundle().getText(sTitleKey));
		},

		// Bind the header and the items to the context path
		_bindView: function(sContextPath) {
			// this._oViewModel.setProperty("/dataLoaded", false);
			var oView = this.getView(),
				bDataRequested = false;
			if (this._sContextPath !== sContextPath) {
				this._sContextPath = sContextPath;
				this._oBindingContext = null;
				oView.bindElement({
					path: sContextPath,
					events: {
						dataRequested: function() {
							bDataRequested = true;
						},
						dataReceived: this.onDataLoaded.bind(this, sContextPath)
					},
					parameters: {
						expand: "DraftAdministrativeData,to_ProductCategory,to_Supplier,to_ProductTextInOriginalLang"
					}
				});
			}
		},

		onSave: function() {
			MessageToast.show('Save action');
		},

		onCancel: function(oEvent) {
			if (this._isInvalid()) {
				return;
			}
			if (this._bIsDraftDirty) {
				if (!this._oCancelPopover) {
					this._oCancelPopover = this.byId("cancelPopover");
					jQuery.sap.syncStyleClass(controls.getContentDensityClass(), this.getView(), this._oCancelPopover);
				}
				this._oCancelPopover.openBy(oEvent.getSource());
			} else {
				this._onDiscard();
			}
		},

		onDiscard: function() {
			this._oCancelPopover.close();
			this._onDiscard();
		},

		_onDiscard: function() {
			if (this._bIsInHistory) {
				this.onNavBack();
			}
			var oApplicationProperties = this.getApplicationProperties();
			var sProductId = oApplicationProperties.getProperty("/productId");
			this.getApplication().prepareForDelete(sProductId);
			this.getApplication().displayProduct('HT-1000');
			// this._oODataHelper.deleteDraftEntity(this._oBindingContext, this._bIsDraftDirty);
		},

		onMessageIndicator: function(oEvent) {
			this._oMessagePopover.toggle(oEvent.getSource());
		},

		onDataLoaded: function(sContextPath, oEvent) {
			if (sContextPath !== this._sContextPath || this._isInvalid()) {
				return;
			}
			//var oApplicationProperties = this.getApplicationProperties(),
			var iOpenRequest = this._oViewModel.getProperty("/openItemsRequest");
			if (iOpenRequest === 0) {
				this.getApplication().resetAppBusy();
			}
			this._oBindingContext = oEvent.getSource().getBoundContext();
			if (this._oBindingContext) {
				if (!this._oViewModel.getProperty("/dataLoaded")) {
					this._oViewModel.setProperty("/dataLoaded", true);
					var oAdminData = this._oBindingContext.getObject("DraftAdministrativeData");
					//Information that the user has changed something in the draft ("Dirty") is that the ChangedAt
					// timestamp is later than the CreatedAt timestamp.  Note that these are set to be the same timestamp
					// when created in the backend, so they really are identical and not just a few ms difference.
					this._bIsDraftDirty = !utilities.isDraftClean(oAdminData);
					// Sets Main Category as a filter on subcategory so that only relevant subcategories are shown
					// in ComboBox
					this._setCategoryFilter(this._oBindingContext.getProperty("to_ProductCategory/MainProductCategory") || "");
				}
			}
			// else {
			// 	this._notAvailable();
			// }
		},

		onItemsRequested: function() {
			var iOpenRequest = this._oViewModel.getProperty("/openItemsRequest") + 1;
			this._oViewModel.setProperty("/openItemsRequest", iOpenRequest);
		},

		onItemsReceived: function() {
			var iOpenRequest = this._oViewModel.getProperty("/openItemsRequest") - 1;
			this._oViewModel.setProperty("/openItemsRequest", iOpenRequest);
			if (iOpenRequest === 0 && this._oViewModel.getProperty("/dataLoaded")) {
				this.getApplication().resetAppBusy();
			}
		},

		_notAvailable: function() {
			this.getApplication().navToEmptyPage(this.getResourceBundle().getText("ymsg.draftNotAvailable"));
		},

		unbind: function() {
			this._sContextPath = null;
			this._oBindingContext = null;
			this.getView().unbindElement();
			this._oViewModel.setProperty("/openItemsRequest", 0);
		},

		onInputChange: function() {
			this._fieldChange();
		},

		onNumberChange: function(oEvent) {
			// If a number field is empty, an error occurs in the backend.
			// So this sets a missing number to "0".
			var oField = oEvent.getSource(),
				sNumber = oField.getValue();
			if (sNumber === "") {
				oField.setValue("0");
			}
			this._fieldChange();
		},

		onCategoryChange: function(oEvent) {
			// Category is not save with the Product.  It is unique accroding to the sub category and
			// can be found in the navigation property.
			var oCategory = oEvent.getSource();
			if (this._oSubCategory) {
				this._oSubCategory.setSelectedKey();
				this._setCategoryFilter(oCategory.getValue());
			}
		},

		onSubCategoryChange: function() {
			var oCategory = this.byId("category");
			if (oCategory && oCategory.getValue().trim() === "") {
				// Sub Category was selected from all the possible entries, so add appropriate main category
				var sMainCategory = this.getView().getBindingContext().getProperty("to_ProductCategory/MainProductCategory");
				// Add only via value because the category field is one way binding
				oCategory.setValue(sMainCategory);
			}
			this._fieldChange();
		},

		_fieldChange: function() {
			if (this._isInvalid()) {
				return;
			}
			this._bIsDraftDirty = true;
			jQuery.sap.log.info("Event triggered for Field Change ", null, "nw.epm.refapps.products.manage.view.S3_ProductEdit.controller");
			this._oODataHelper.saveProductDraft();
		},

		_setCategoryFilter: function(sMainCatgId) {
			if (this._oSubCategory) {
				var sPath = sMainCatgId.trim() ? "/SEPMRA_I_ProductMainCategory('" + encodeURIComponent(sMainCatgId) + "')/to_Category" :
					"/SEPMRA_I_ProductCategory",
					oBindingInfo = {
						path: sPath,
						events: {
							dataRequested: this._oViewModel.setProperty.bind(this._oViewModel, "/subCategoriesAvailable", false),
							dataReceived: this._oViewModel.setProperty.bind(this._oViewModel, "/subCategoriesAvailable", true)
						},
						template: this._oSubcategoryItemTemplate
					};
				this._oSubCategory.bindItems(oBindingInfo);
			}
		},

		_isInvalid: function() {
			return !this._oODataHelper.isDraftIdValid(this._sDraftId);
		},

		onNavBack: function() {
			this.getApplication().navBack(true, false);
		},

		sendEmail: function() {
			var sProductId = this._oBindingContext.getProperty("ProductForEdit"),
				oProductNameInput = this.byId("productNameInput"),
				sProductName = oProductNameInput && oProductNameInput.getValue();
			utilities.sendEmailForProduct(this.getResourceBundle(), sProductName, sProductId);
		}
	});
});