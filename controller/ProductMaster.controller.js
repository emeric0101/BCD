/*global history */
sap.ui.define([
	"sap/ui/demoapps/rta/freestyle/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Sorter",
	"sap/m/GroupHeaderListItem",
	"sap/ui/Device",
	"sap/ui/demoapps/rta/freestyle/util/TableOperations",
	"./utilities",
	"./SubControllerForFGS",
	"sap/ui/demoapps/rta/freestyle/util/controls",
	"sap/m/MessageToast"
], function(BaseController, JSONModel, Sorter, GroupHeaderListItem, Device, TableOperations, utilities,
	SubControllerForFGS, controls, MessageToast) {
	"use strict";

	var sInitialSort = "to_ProductTextInOriginalLang/Name";

	function fnGetRelevantIdFromContext(oContext) {
		return oContext.getProperty("Product") || oContext.getProperty("DraftUUID");
	}
	// updateMode is used in Edit to stop the master list being refreshed whenever a property that is in the master list
	// is changed in the edit screen.  Suspended is used when the list is still loading and edit has started.  Once the list
	// has been refreshed, further refreshes are prevented whilst the editing is taking place.
	return BaseController.extend("sap.ui.demoapps.rta.freestyle.controller.ProductMaster", {

		updateMode: {
			AUTO: 0,
			PREPARESUSPEND: 1,
			SUSPENDED: 2
		},
		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit: function() {
			// Control state model
			this._oList = this.byId("list");
			this._oSearchField = this.byId("searchField");
			this._oApplicationProperties = this.getApplicationProperties();
			this._iAutomaticUpdateMode = this.updateMode.AUTO;
			this._oViewProperties = new JSONModel({
				itemCount: -1,
				isFilterBarVisible: false,
				filterBarLabel: "",
				markExists: false,
				swipeEnabled: false,
				originalBusyDelayList: this._oList.getBusyIndicatorDelay()
			});
			this.setModel(this._oViewProperties, "masterView");
			// Put down master list's original value for busy indicator delay,
			// so it can be restored later on. Busy handling on the master list is
			// taken care of by the master list itself.

			var oDefaultSorter = new Sorter(sInitialSort);

			this._oTableOperations = new TableOperations(this._oList, ["to_ProductTextInOriginalLang/Name", "ProductForEdit"], oDefaultSorter);
			var fnApplyTableOperations = this.applyTableOperations.bind(this);
			this.getApplication().registerMaster(this);
			this._oSubControllerForFGS = new SubControllerForFGS(this.getView(), this._oTableOperations, fnApplyTableOperations);
			this._iAdaptAfterUpdateMode = 0;

			// The default filter required to provide the correct products to show each user is defined and added to Table Operations
			// in the constructor of SubControllerForFGS.  To save an extra request to backend, this default filter is obtained from
			// table operations and added here to the list binding here.  In this context, the filters are applied as FilterType
			// Application, hence subsequent filtering in Table Operations needs to filter as Application Filter.
			var oFilter = this._oTableOperations.getFilterTable();
			this._oListItemTemplate = this.byId("objectListItem").clone();
			this._oList.bindAggregation("items", {
				path: "/SEPMRA_C_PD_Product",
				filters: oFilter,
				template: this._oListItemTemplate,
				suspended: false,
				groupHeaderFactory: this.createGroupHeader,
				parameters: {
					countMode: "Inline",
					expand: "to_ProductTextInOriginalLang,to_ProductCategory,DraftAdministrativeData,to_ProductStock,to_ProductStock/to_StockAvailability,to_Supplier",
					select: "Product,DraftUUID,Price,Currency,ProductCategory,Product,to_ProductTextInOriginalLang/Name,to_ProductCategory/ProductCategory,DraftAdministrativeData/InProcessByUser,DraftAdministrativeData/DraftIsCreatedByMe,DraftAdministrativeData/InProcessByUserDescription,DraftAdministrativeData/LastChangedByUser,DraftAdministrativeData/DraftUUID,DraftAdministrativeData/CreationDateTime,DraftAdministrativeData/LastChangeDateTime,ProductBaseUnit,IsActiveEntity,HasDraftEntity,to_ProductCategory/MainProductCategory,ProductPictureURL,to_ProductStock/Quantity,to_ProductStock/to_StockAvailability/StockAvailability_Text,to_Supplier/EmailAddress"
				},

				events: {
					dataRequested: this.onDataRequested.bind(this),
					dataReceived: this.onDataReceived.bind(this)
				}

			});

		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		onDataRequested: function() {
			// Event handler called when retrieving data for the the master list starts. It is attached declaratively.
			// Resets the displayed content of the search field to the search term that is actually used.
			// There may be a difference, as the user might have changed the content but not triggered the search.
			this._oSearchField.setValue(this._sCurrentSearchTerm);
			this._oApplicationProperties.setProperty("/isListLoading", true);
		},

		onDataReceived: function(oEvent) {
			if (this._oApplicationProperties.getProperty("/metaDataLoadState") < 1) {
				return;
			}
			if (this._iAutomaticUpdateMode === this.updateMode.PREPARESUSPEND) {
				this._getListBinding().suspend();
				this._iAutomaticUpdateMode = this.updateMode.SUSPENDED;
			}
			this._oApplicationProperties.setProperty("/isListLoading", false);
			this._oApplicationProperties.setProperty("/masterImmediateBusy", false);
			var iCount = this._getListBinding().getLength();

			this._oViewProperties.setProperty("/itemCount", iCount);
			if (iCount === 0) {
				var sNoDataId = ((this._oTableOperations.getSearchTerm() || this._oTableOperations.getFilterTable()) ? "ymsg.noDataAfterSearch" :
					"ymsg.noData");
				this._oApplicationProperties.setProperty("/listNoDataText", this.getResourceBundle().getText(sNoDataId));
			}
			if (this._isListInMultiSelectMode()) {
				this._iMarkedCount = this._oList.getSelectedContexts(true).length;
				this._oViewProperties.setProperty("/markExists", this._iMarkedCount > 0);
			}
			// If not on the phone, make sure that a PO is selected (if possible)
			this.findItem();
			if (this._iAdaptAfterUpdateMode) {
				this._selectCurrentItem();
			}
		},

		findItem: function() {
			// This method has four tasks:
			// - Check whether it is necessary to identify a new list item to be displayed in the detail area (if not return immediately)
			// - Determine the required list item
			// - Execute the navigation that displays the identified list item (or execute the navigation to the EmptyPage if no list item could be identified)
			// - Reset state
			if (Device.system.phone || this._relevantId()) { // Task 1
				this._selectCurrentItem();
				this.getApplication().resetAppBusy();
				return;
			}
			// Task 2
			var aItems = this._oList.getItems();
			if (aItems.length > 0) {
				var oItemToSelect = null,
					aPreferredIds = this._oApplicationProperties.getProperty("/preferredIds"),
					oODataHelper = this.getApplication().getODataHelper();
				for (var i = 0; !oItemToSelect && i < aPreferredIds.length; i++) {
					var sId = aPreferredIds[i];
					oItemToSelect = oODataHelper.isDraftIdValid(sId) && this._getListItemForId(sId);
				}
				oItemToSelect = oItemToSelect || this._getFirstRealItem();
				this._navToListItem(oItemToSelect); // Task 3
			} else {
				this.getApplication().navToEmptyPage(this._oApplicationProperties.getProperty("/listNoDataText"), true); // Task 3
			}
		},

		adaptToDetailSelection: function(bScrollTo) {
			// adapt the state of the master list to the object displayed in the detail area
			// This contains two aspects:
			// - set the corresponding list item as selected
			// - scroll to the corresponding list item (only if bScrollTo is true)
			this._iAdaptAfterUpdateMode = bScrollTo ? 1 : 2;
			if (this._oApplicationProperties.getProperty("/metaDataLoadState") === 1 && !this._oApplicationProperties.getProperty(
					"/isListLoading")) {
				this._selectCurrentItem();
			}
		},

		_selectCurrentItem: function() {
			// this method has the same specification as adaptToDetailSelection. However, it must not be called
			// while the list is still loading.
			var bScrollTo = this._iAdaptAfterUpdateMode === 1;
			this._iAdaptAfterUpdateMode = 0;
			if (Device.system.phone || this._isListInMultiSelectMode()) {
				return;
			}
			var sId = this._relevantId(),
				oItemToSelect = sId && this._getListItemForId(sId);
			this._setItemSelected(oItemToSelect);
			if (bScrollTo && oItemToSelect) {
				this._scrollToListItem(oItemToSelect);
			}
		},

		_getListBinding: function() {
			return this._oList.getBinding("items");
		},

		_isListInMultiSelectMode: function() {
			// helper method to check if the current list is currently in the MultiSelect mode
			return this._oApplicationProperties.getProperty("/isMultiSelect");
		},

		applyTableOperations: function(fnAfterUpdate) {
			// This method is called when a new backend search has to be triggered, due to changed 'search settings'.
			// More precisely the method is called:
			// - when the user presses Sort, Filter, or Group button (therefore, it is passed as callback to SubControllerForFGS)
			// - when the user triggers a search after having changed the entry in the search field
			// The method uses attribute _oTableOperations to perform the data retrieval
			this._oTableOperations.applyTableOperations(true);
			if (fnAfterUpdate) {
				this._oList.attachEventOnce("updateFinished", fnAfterUpdate);
			}
		},

		// --- Methods dealing with new data retrieval triggered by the user. All event handlers are attached declaratively.

		onSearch: function(oEvent) {
			// Event handler for the search field in the master list.
			// Note that this handler listens to the search button and to the refresh button in the search field
			var oSearchField = oEvent.getSource(),
				sCurrentSearchFieldContent = oSearchField.getValue(),
				// If the user has pressed 'Refresh' the last search should be repeated
				sNewSearchContent = oEvent.getParameter("refreshButtonPressed") ? this._sCurrentSearchTerm : sCurrentSearchFieldContent;
			this._explicitRefresh(sNewSearchContent);
		},

		_explicitRefresh: function(sNewSearchContent, fnNoMetadata) {
			// This method is called when the user refreshes the list either via the search field or via the pull-to-refresh element
			// sNewSearchContent is the content of the search field to be applied.
			// Note: In case metadata could not be loaded yet or lost draft information could not be determined yet, it is first triggered
			// to retry this. If loading of the metadata fails (optional) fnNoMetadata will be executed.
			var fnMetadataLoaded = function() {
				if (sNewSearchContent === this._sCurrentSearchTerm) {
					this.listRefresh();
				} else {
					this._sCurrentSearchTerm = sNewSearchContent;
					this._oTableOperations.setSearchTerm(sNewSearchContent);
					this.applyTableOperations();
				}
			}.bind(this);
			this.getApplication().whenMetadataLoaded(fnMetadataLoaded, fnNoMetadata);
		},

		listRefresh: function() {
			var oBinding = this._getListBinding();
			if (this._iAutomaticUpdateMode === this.updateMode.SUSPENDED) {
				this._iAutomaticUpdateMode = this.updateMode.PREPARESUSPEND;
				oBinding.resume();
			}
			oBinding.refresh();
		},

		setAutomaticUpdate: function(bAutomaticUpdate) {
			if (bAutomaticUpdate === (this._iAutomaticUpdateMode === this.updateMode.AUTO)) { // nothing to do
				return;
			}
			var oBinding = this._getListBinding();
			if (bAutomaticUpdate) {
				if (this._iAutomaticUpdateMode === this.updateMode.SUSPENDED) {
					oBinding.resume();
				}
				this._iAutomaticUpdateMode = this.updateMode.AUTO;
			} else if (oBinding && !this._oApplicationProperties.getProperty("/isListLoading")) {
				oBinding.suspend();
				this._iAutomaticUpdateMode = this.updateMode.SUSPENDED;
			} else {
				this._iAutomaticUpdateMode = this.updateMode.PREPARESUSPEND;
			}
		},

		onRefresh: function(oEvent) {
			// Event handler for the pullToRefresh-element of the list.
			var oPullToRefresh = oEvent.getSource(),
				fnHidePullToRefresh = oPullToRefresh.hide.bind(oPullToRefresh);
			// Hide the pull to refresh when data has been loaded
			this._oList.attachEventOnce("updateFinished", fnHidePullToRefresh);
			// Refresh list from backend
			this._explicitRefresh(this._sCurrentSearchTerm, fnHidePullToRefresh);
		},

		onSort: function() {
			this._oSubControllerForFGS.openDialog("Sort", sInitialSort);
		},

		onFilter: function() {
			this._oSubControllerForFGS.openDialog("Filter");
		},

		onGroup: function() {
			this._oSubControllerForFGS.openDialog("Grouping");
		},

		/**
		 * Event handler for the list selection event
		 * @param {sap.ui.base.Event} oEvent the list selectionChange event
		 * @public
		 */
		onSelectionChange: function(oEvent) {
			// get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
			var aSelectedItems, oBindingContext, oProduct, oDraftAdministrativeData, bLockedOnly = true;
			var oListItem = oEvent.getParameter("listItem") || oEvent.getSource();

			var bMultiSelect = this._isListInMultiSelectMode();
			// If creaeted, destroy the supplier card fragment so that the supplier information is not always
			// read. Only when the user request the supplier card is it necessary to read it.
			this.getApplication().destroySupplierCard();
			if (!this._oApplicationProperties.getProperty("/isChartDisplay")) {
				// The chart was displayed for the previously selected product, but was not currently
				// shown in the details, so destroy this chart to prevent it being filled for the
				// newly selected product.  If the product display did show the chart, we leave
				// the chart and it will be filled (and shown) for the newly selected product.
				this.getApplication().destroyDetailChart();

			}
			if (bMultiSelect) { // in multi-select mode select mode selecting the list item inverts the current selection state
				if (oEvent.getParameter("selected")) { // the item turns into selected
					this._iMarkedCount++;
					if (!Device.system.phone) { // in this case the newly selected item should be displayed in the detail area,
						this._navToListItem(oListItem);
					}
				} else { // the item turns into unselected
					this._iMarkedCount--;
				}
				//In case only locked items have been selected, don't activate delete button
				aSelectedItems = this._oList.getSelectedItems();

				for (var i = 0; i < aSelectedItems.length; i++) {
					oBindingContext = aSelectedItems[i].getBindingContext();
					oProduct = oBindingContext.getObject();
					oDraftAdministrativeData = oBindingContext.getObject("DraftAdministrativeData");
					if (!oProduct.HasDraftEntity || oDraftAdministrativeData.InProcessByUser === "") {
						bLockedOnly = false;
						break;
					}

				}
				// At least one of the selected items is not locked, and at lease one item has been selected
				this._oViewProperties.setProperty("/markExists", (!bLockedOnly && this._iMarkedCount > 0));

			} else { // in single-select mode the user wants to navigate to the selected item
				this._navToListItem(oListItem);
				this.getApplication().hideMasterInPortrait();
			}
		},

		onMultiSelect: function() {
			if (this._isListInMultiSelectMode()) {
				this._iMarkedCount = 0;
				this._oViewProperties.setProperty("/markExists", false);
				this._setItemSelected();
			} else {
				this.adaptToDetailSelection();
			}
		},

		onAdd: function() {
			var oApplication = this.getApplication(),
				oODataHelper = oApplication.getODataHelper(),
				// sPreferredId = this._relevantId(),
				fnProductDraftCreated = function(oProductDraftData) {
					oApplication.editProductDraft("", oProductDraftData.DraftUUID, false);
					// this._oApplicationProperties.setProperty("/preferredIds", sPreferredId ? [sPreferredId] : []);
				}.bind(this);
			oODataHelper.createProductDraft(fnProductDraftCreated);
		},

		onSwipe: function(oEvent) {
			// Event handler for swipe in the list.
			// Its purpose is to deactivate swipe in case of multi select and in edit mode.
			if (this._isListInMultiSelectMode()) {
				oEvent.preventDefault();
			}
			var oListItem = oEvent.getParameter("listItem"),
				oBindingContext = oListItem.getBindingContext(),
				oApplication = this.getApplication(),
				oODataHelper = oApplication.getODataHelper(),
				sProductId = oBindingContext.getProperty("Product"),
				bDisabled = false;
			if (sProductId) {
				if (!oBindingContext.getProperty("IsActiveEntity")) {
					bDisabled = true;
				}
			} else {
				var sDraftId = oBindingContext.getProperty("DraftUUID");
				if (oODataHelper.isDraftIdValid(sDraftId)) {
					oEvent.preventDefault();
				}
			}
			this._oViewProperties.setProperty("/swipeEnabled", !bDisabled);
		},

		onSwipeDeleteItem: function() {
			// user has confirmed the deletion via swipe
			var oBindingContext = this._oList.getSwipedItem().getBindingContext(),
				oApplication = this.getApplication();
			var sProductId = this._oApplicationProperties.getProperty("/productId");
			this.prepareResetOfList(sProductId);
			oApplication.getODataHelper().deleteProduct(oBindingContext);
			this._oList.swipeOut();
		},

		onDelete: function() {
			MessageToast.show('Delete action');

			// //From the master list user has changed to multi select mode, selected items, then pressed delete
			// var oProduct, oBindingContext, oDraftAdministrativeData, oProductTextInOriginalLang,
			// 	aItemsLocked = [],
			// 	aSelectedItems = this._oList.getSelectedItems();
			//
			// this.aItemsToDelete = [];
			// this.aItemsUnsaved = [];
			//
			// if (aSelectedItems === undefined || aSelectedItems.length === 0) {
			// 	return;
			// } else {
			//
			// 	var oSorted = this._getDeletedRequested(aSelectedItems);
			// 	aItemsLocked = oSorted.locked;
			// 	this.aItemsUnsaved = oSorted.unsaved;
			// 	this.aItemsToDelete = oSorted.toDelete;
			//
			// 	// Determine the text of the short text message for the warning dialog
			// 	var iCanBeDeleted = this.aItemsToDelete.length,
			// 		iLocked = aItemsLocked.length,
			// 		iUnsaved = this.aItemsUnsaved.length;
			//
			// 	// For exactly one product to delete, reuse the messages from display controller.  If unsaved or locked are also
			// 	// selected, use the multi delete dialog so that this information may be made available to the user
			// 	if (iUnsaved === 1 && iCanBeDeleted === 0 && iLocked === 0 || iUnsaved === 0 && iCanBeDeleted === 1 && iLocked === 0) {
			//
			// 		oBindingContext = aSelectedItems[0].getBindingContext();
			// 		oProduct = oBindingContext.getObject();
			// 		oDraftAdministrativeData = oBindingContext.getObject("DraftAdministrativeData");
			// 		oProductTextInOriginalLang = oBindingContext.getObject("to_ProductTextInOriginalLang");
			// 		var sProductName = oProductTextInOriginalLang.Name;
			//
			// 		var bUnsavedChanges = oProduct.HasDraftEntity && oDraftAdministrativeData.InProcessByUser === "" && !oDraftAdministrativeData.DraftIsCreatedByMe;
			// 		var sUser = (bUnsavedChanges ? oDraftAdministrativeData.LastChangedByUser : "");
			// 		var fnAfterOpen = function(sAction) {
			// 			if (sAction === sap.m.MessageBox.Action.DELETE) {
			// 				this.getApplication().prepareForDelete(oProduct.ProductForEdit);
			// 				this.getApplication().getODataHelper().deleteProduct(oBindingContext);
			// 			}
			// 		}.bind(this);
			// 		utilities.showDeleteMessage(this.getResourceBundle(), sUser, sProductName, fnAfterOpen, bUnsavedChanges);
			// 	} else {
			// 		// More than one item has been selected to be deleted
			// 		var oDialogContent = this._determineDialogContent(aItemsLocked, this.aItemsUnsaved);
			// 		if (!this._oMultiDeleteDialog) {
			// 			this._oDialogProperties = new JSONModel({});
			// 			this._oMultiDeleteDialog = sap.ui.xmlfragment("sap.ui.demoapps.rta.freestyle.view.ProductMultiDeleteDialog", this);
			// 			controls.attachControlToView(this.getView(), this._oMultiDeleteDialog);
			// 		}
			//
			// 		this._iUnsaved = oDialogContent.unsaved;
			// 		this._oSingleList = new JSONModel(oDialogContent.singleList);
			//
			// 		// Lists of Items that are locked and/or have saved changes
			// 		this._oMultiDeleteDialog.setModel(this._oSingleList, "singleItems");
			//
			// 		this._oMultiDeleteDialog.setModel(this._oDialogProperties, "deleteDialog");
			// 		this._oDialogProperties.setProperty("/lockedText", oDialogContent.lockedText);
			// 		this._oDialogProperties.setProperty("/bLockedText", !(oDialogContent.lockedText === undefined));
			// 		this._oDialogProperties.setProperty("/deleteText", oDialogContent.deleteText);
			// 		this._oDialogProperties.setProperty("/bDeleteText", !(oDialogContent.deleteText === undefined));
			//
			// 		this._oDialogProperties.setProperty("/unsavedNumber", oDialogContent.unsavedNumber);
			// 		this._oDialogProperties.setProperty("/bUnsavedNumber", !(oDialogContent.unsavedNumber === undefined));
			//
			// 		this._oDialogProperties.setProperty("/unsavedText", oDialogContent.unsavedText);
			// 		this._oDialogProperties.setProperty("/bUnsavedText", !(oDialogContent.unsavedText === undefined));
			// 		this._oDialogProperties.setProperty("/deleteAnywayText", oDialogContent.deleteAnywayText);
			// 		this._oDialogProperties.setProperty("/bDeleteAnywayText", !(oDialogContent.deleteAnywayText === undefined));
			//
			// 		this._oDialogProperties.setProperty("/showCheckbox", oDialogContent.showCheckbox);
			// 		if (oDialogContent.showCheckbox) {
			// 			this._oDialogProperties.setProperty("/checkboxText", oDialogContent.checkboxText);
			// 		}
			// 		this._oDialogProperties.setProperty("/numberToDelete", oDialogContent.numberToDelete);
			// 		this._oDialogProperties.setProperty("/showDetails", false);
			//
			// 		this._oDialogProperties.setProperty("/details", oDialogContent.details);
			// 		this._oDialogProperties.setProperty("/deleteUnsavedChanges", oDialogContent.defaultUnsaved);
			//
			// 		this._oMultiDeleteDialog.open();
			// 	}
			// }
		},

		// User decides to delete items as determined by the ProductMultiDeleteDialog.
		onDeleteConfirm: function() {

			var bDeleteUnsavedChanges = this._oDialogProperties.getProperty("/deleteUnsavedChanges");
			var oODataHelper = this.getApplication().getODataHelper();
			if (this.aItemsToDelete.length > 0) {
				oODataHelper.deleteEntities(this.aItemsToDelete);
			}
			if (bDeleteUnsavedChanges && this.aItemsUnsaved.length > 0) {
				oODataHelper.deleteEntities(this.aItemsUnsaved);
			}

			this._oMultiDeleteDialog.close();
		},

		// Show details in the multi delete dialog, according to use case
		onShowDetails: function() {
			this._oDialogProperties.setProperty("/showDetails", true);
		},

		// User makes no action from the multi delete dialog
		onCancel: function() {
			this._oMultiDeleteDialog.close();
		},

		onNavBack: function() {
			this.getApplication().navBack(true, false);
		},

		onSelect: function(oEvent) {

		},

		_navToListItem: function(oListItem) {
			// This method triggers the navigation to the detail page with the specified list item oListItem
			var oCtx = oListItem.getBindingContext(),
				sProductId = oCtx.getProperty("Product"),
				bIsDisplay = oCtx.getProperty("IsActiveEntity"),
				oApplication = this.getApplication();
			if (bIsDisplay) {
				oApplication.displayProduct(sProductId, true);
			} else {
				var sDraftId = oCtx.getProperty("DraftUUID"),
					oODataHelper = oApplication.getODataHelper();
				if (oODataHelper.isDraftIdValid(sDraftId)) {
					oApplication.editProductDraft(sProductId, sDraftId, true);
				} else if (sProductId) {
					oODataHelper.whenProductIsClean(oApplication.displayProduct.bind(oApplication, sProductId, true));
				}
			}
		},

		_scrollToListItem: function(oListItem) {
			// Scroll the list to the given list item.
			var oTarget = (oListItem !== this._getFirstRealItem() && oListItem) || this._oList,
				oDomRef = oTarget.getDomRef();
			if (oDomRef) {
				oDomRef.scrollIntoView();
			}
		},

		_getFirstRealItem: function() {
			// Returns the first item of the list which is not a grouping item. Returns a faulty value if list is empty.
			var aItems = this._oList.getItems();
			for (var i = 0; i < aItems.length; i++) {
				if (!(aItems[i] instanceof GroupHeaderListItem)) {
					return aItems[i];
				}
			}
		},

		_setItemSelected: function(oItemToSelect) {
			// Set the specified list item to be selected, resp. remove all selections if the specififed item is faulty
			this._oList.removeSelections(true);
			if (oItemToSelect) {
				this._oList.setSelectedItem(oItemToSelect);
			}
		},

		_getListItemForId: function(sId) {
			// Return the list item for the specified product id or a faulty value if the list does not contain the product
			if (!sId || sId === "-") {
				return null;
			}
			var aItems = this._oList.getItems();
			for (var i = 0; i < aItems.length; i++) {
				var oItem = aItems[i];
				if (!(oItem instanceof GroupHeaderListItem)) {
					var oContext = oItem.getBindingContext();
					if (oContext && fnGetRelevantIdFromContext(oContext) === sId) {
						return oItem;
					}
				}
			}
		},

		_relevantId: function() {
			return this._oApplicationProperties.getProperty("/productId") || this._oApplicationProperties.getProperty("/draftId");
		},

		getPreferredSuccessors: function(sId, aPreferredReplace) {
			var aPreferredIds = aPreferredReplace || [sId],
				bFound = false,
				aListItems = this._oList.getItems(),
				aTail = [];
			for (var i = 0; i < aListItems.length; i++) {
				var oItem = aListItems[i];
				if (!(oItem instanceof GroupHeaderListItem)) {
					var oCtx = oItem.getBindingContext(),
						sCurrentId = fnGetRelevantIdFromContext(oCtx);
					if (sId === sCurrentId) {
						bFound = true;
					} else {
						(bFound ? aPreferredIds : aTail).push(sCurrentId);
					}
				}
			}
			if (bFound) {
				aTail.reverse();
				aPreferredIds = aPreferredIds.concat(aTail);
			}
			return aPreferredIds;
		},

		// Prepare for the removal of some items from the list (due to deletion).
		// This is done by setting the IDs currently in the list to preferredIds. Thereby we
		// start with the item currently displayed. Then the IDs following this element are added
		// in their current order. Finally, we add those items listed in front of the current item in reverse
		// order.
		prepareResetOfList: function(sCurrentProductId) {
			var aListItems = this._oList.getItems(),
				bFound = false,
				aTail = [],
				aPreferredIds = [];
			for (var i = 0; i < aListItems.length; i++) {
				var oItem = aListItems[i],
					oCtx = oItem.getBindingContext(),
					sProductId = oCtx.getProperty("Product");
				bFound = bFound || sProductId === sCurrentProductId;
				(bFound ? aPreferredIds : aTail).push(sProductId);
			}
			aTail.reverse();
			aPreferredIds = aPreferredIds.concat(aTail);
			this._oApplicationProperties.setProperty("/preferredIds", aPreferredIds);
			this._oApplicationProperties.setProperty("/productId", null); // Reset the current ID (we only have preferences now)
		},

		/**
		 * Used to create GroupHeaders with non - capitalized caption.*These headers are inserted into the master list to * group the master list 's items.
		 * @param {Object} oGroup group whose text is to be displayed
		 * @public
		 * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
		 */
		createGroupHeader: function(oGroup) {
			return new GroupHeaderListItem({
				title: oGroup.text,
				upperCase: false
			});
		},

		// Order the list of selected products for delete into those that can be deleted (active products and users own drafts), those that user has
		// to confirm (unsaved changes) and those that cannot be deleted (locked by other users)
		_getDeletedRequested: function(aItemsForDelete) {
			var oBindingContext, oProduct, oDraftAdministrativeData, oProductTextInOriginalLang,
				aItemsLocked = [],
				aItemsUnsaved = [],
				aItemsToDelete = [],
				aLockedLongText = [],
				aUnsavedLongText = [];

			for (var i = 0; i < aItemsForDelete.length; i++) {
				oBindingContext = aItemsForDelete[i].getBindingContext();
				oProduct = oBindingContext.getObject();
				oDraftAdministrativeData = oBindingContext.getObject("DraftAdministrativeData");
				oProductTextInOriginalLang = oBindingContext.getObject("to_ProductTextInOriginalLang");

				if (oProduct.HasDraftEntity && oDraftAdministrativeData.InProcessByUser !== "") {
					//Product is locked by another user and cannot be deleted.
					aItemsLocked.push({
						//Status: "Locked",
						Status: this.getResourceBundle().getText("xgrp.lockedProducts"),
						Product: oProduct.ProductForEdit,
						Name: oProductTextInOriginalLang.Name,
						User: oDraftAdministrativeData.InProcessByUser
					});
					aLockedLongText.push([oProduct.ProductForEdit]);
				} else if (oProduct.HasDraftEntity && oDraftAdministrativeData.InProcessByUser === "" && !oDraftAdministrativeData.DraftIsCreatedByMe) {
					//Another user created a draft, but the lock has been removed.  If the user created the draft, it can be deleted
					aItemsUnsaved.push({
						//Status "Unsaved changes"
						Status: this.getResourceBundle().getText("xgrp.unsavedProducts"),
						BindingContext: oBindingContext,
						Product: oProduct.ProductForEdit,
						Name: oProductTextInOriginalLang.Name,
						User: oDraftAdministrativeData.LastChangedByUser,
						DraftUUID: oDraftAdministrativeData.DraftUUID
					});
					aUnsavedLongText.push(oProduct.ProductForEdit);
				} else {
					// Items can be deleted. These are neither locked nor have unsaved changes.  User's own drafts are added to this
					// list and will be deleted if the user confirms the delete.
					aItemsToDelete.push({
						BindingContext: oBindingContext,
						Product: oProduct.ProductForEdit,
						Name: oProductTextInOriginalLang.Name,
						DraftUUID: oProduct.DraftUUID
					});
				}
			}
			return {
				locked: aItemsLocked,
				lockedTexts: aLockedLongText,
				unsaved: aItemsUnsaved,
				unsavedTexts: aUnsavedLongText,
				toDelete: aItemsToDelete
			};
		},

		// Depending on the whether the set of items selected to be deleted contains locked items, unsaved changes or
		// active items/drafts, determine the texts for the dialogue and the list of items for the details.   This dialogue is specified in the Fiori
		// UX Guidelines in the document "Draft Handling". Note that UPDATES are not currently supported by the Application Infrastructure.
		_determineDialogContent: function(aItemsLocked) {

			var iCanBeDeleted = this.aItemsToDelete.length,
				iLocked = aItemsLocked.length,
				iUnsaved = this.aItemsUnsaved.length,
				//If more than one locked item or more than one item with unsaved changes selelcted, show all of these items
				// in a grouped list in the detail part of the message dialog.
				aSingleList = [],
				bDetails = true, //Flag set if there are details to be shown (list of locked items, list of items with unsaved changes)
				bShowCheckbox = false, //If there are unsaved items and active items, offer user a checkbox to request deletion of unsaved items too
				bDefaultUnsaved = true,
				sLockedText, sDeleteText, sUnsavedText, sDeleteAnywayText, sCheckboxText, sUnsavedNumber;

			// LOCKED ITEMS
			// For the selected locked items, there are only two possibilities to show this.  For one selected locked item, we display
			// the name of this product and show no details. For more than one selected, we show how many locked items were selected.
			// The list of all locked selected items and users who are locking these items is shown in the details.
			if (iLocked > 1) {
				sLockedText = this.getResourceBundle().getText("ymsg.deletedSomeLocked", [iLocked, iLocked + iCanBeDeleted + iUnsaved]);
			} else if (iLocked === 1) {
				sLockedText = this.getResourceBundle().getText("ymsg.lockedForDelete", [
					aItemsLocked[0].Name, aItemsLocked[0].User
				]);
			}

			// ACTIVE ITEMS
			// For active items (including the user's drafts), there are no details shown.  If one such item has been selected,
			// the name of this item appears in the message.  If more than one item has been shown, the user is asked whether he wants
			// to delete all these items.
			// The message text varies if more than one active item has been selected.
			if (iCanBeDeleted > 1) {
				// More than one active/draft product has been selected. Text when there are no unsaved changes or locked
				// also selected
				if (iLocked > 0) {
					// When there are also locked item selected, message contains text numner of items to be deleted.
					sDeleteText = this.getResourceBundle().getText("ymsg.deleteRemaing", iCanBeDeleted);
				} else {
					// If there are no locked items selected, no number of items is speficied and the user is asked whether
					// he wants to delete the selected items (i.e. active items).  Note that unsaved items are considered
					// additionally in the message text.
					sDeleteText = this.getResourceBundle().getText("ymsg.deleteSelected");
				}
			} else if (iCanBeDeleted === 1) {
				// Just one active/draft product has been selected.  Text to delete the named product.
				sDeleteText = this.getResourceBundle().getText("ymsg.deleteText", [this.aItemsToDelete[0].Name]);
			}

			// UNSAVED ITEMS
			// The messages when unsaved items have been selected are more detailled. It is assumed that the deletion of active
			// items excludes locked items by definition. The action button to Delete is based on these items.
			// Now the unsaved items are added to the deletion if the checkbox is left selected. So it is an action added to
			// the delete of the active items.  If there are only unsaved items selected, the action Delete can only apply to the
			// unsaved items, so the checkbox is not shown.
			if (iUnsaved > 0) {

				// In case locked items have also been selected, state how many unsaved items were selected.
				if (iUnsaved > 1 && iLocked > 0) {
					sUnsavedNumber = this.getResourceBundle().getText("ymsg.unsavedNumber", iUnsaved);
				}
				if (iCanBeDeleted > 0) {
					// Items that can be deleted and unsaved changes have been selected.
					// A checkbox to request deletion of unsaved items is needed.  The items that can be deleted
					// will be deleted when the user presses "Delete", but he needs to decide whether to delete those
					// items with unsaved changes too.
					bShowCheckbox = true;
					if (iUnsaved === 1) {
						// Name the specific product with unsaved changes that the user can request to delete
						sCheckboxText = this.getResourceBundle().getText("ymsg.deleteUnsavedText", [
							this.aItemsUnsaved[0].Name
						]);
					} else {
						// For more than one item with unsaved changes, the user can only choose to delete all or none of these
						sCheckboxText = this.getResourceBundle().getText("ymsg.deleteUnsaved");
					}
				} else {
					// No active or draft items have been selected to delete
					if (iUnsaved === 1) {
						// Message for one product with unsaved changes
						sUnsavedText = this.getResourceBundle().getText("ymsg.deleteUnsavedText", [this.aItemsUnsaved[0].Name]);
					} else {
						if (iLocked === 0) {
							// Only unsaved items have been selected, so the messages contain only references to unsaved items
							bDefaultUnsaved = true;
							sDeleteAnywayText = this.getResourceBundle().getText("ymsg.deleteUnsavedConfirm");
							sUnsavedText = this.getResourceBundle().getText("ymsg.deleteUnsavedOnly");
						} else {
							sUnsavedText = this.getResourceBundle().getText("ymsg.deletedSomeConfirm");
						}
					}
				}
			}

			// Decide on Lists to show
			if (iLocked > 1 && iUnsaved <= 1) {
				aSingleList = aItemsLocked;
			} else if (iUnsaved > 1 && iLocked > 1) {
				aSingleList = aItemsLocked.concat(this.aItemsUnsaved);
			} else if (iUnsaved > 1) {
				aSingleList = this.aItemsUnsaved;
			}

			if (aSingleList.length < 1) {
				bDetails = false;
			}

			return {
				lockedText: sLockedText,
				deleteText: sDeleteText,
				unsavedText: sUnsavedText,
				deleteAnywayText: sDeleteAnywayText,
				details: bDetails,
				showCheckbox: bShowCheckbox,
				checkboxText: sCheckboxText,
				defaultUnsaved: bDefaultUnsaved,
				numberToDelete: iCanBeDeleted + iUnsaved + iLocked,
				singleList: aSingleList,
				unsaved: iUnsaved,
				unsavedNumber: sUnsavedNumber

			};
		}
	});
});
