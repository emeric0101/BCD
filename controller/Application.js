sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/Device",
	"sap/ui/model/json/JSONModel",
	"./NavigationManager",
	"./ODataMetadataLoader",
	"sap/ui/demoapps/rta/freestyle/model/Products"
], function(BaseObject, Device, JSONModel, NavigationManager, ODataMetadataLoader, Products) {
	"use strict";

	// This class serves as controller for the whole App. It is a singleton object which is initialized by the Component.
	// Since the Component exposes a reference to this singleton object all controllers have access to it and can use its
	// public methods. Note that this class possesses two helper classes: NavigationManager and ODataMetadataLoader. The
	// first one deals with all navigation topics. Therefore, all methods of this class dealing with navigation are
	// forwarded to that class. The second one is responsible for the process of metadata loading during startup of the app.

	// There is a third helper class sap.ui.demoapps.rta.freestyle.model.Products providing methods for explicit
	// OData calls. Access to this class is provided by method getODataHelper.

	// The controllers of the S2 and the S3 views register at this singelton as soon as they are initialized, such that this
	// class can call public methods of these controllers as necessary.
	// This class creates a json model which is attached to the component as named model appProperties. It is used to store
	// global app state. Note that the model can be accessed declaratively and programmatically by all views and classes
	// used by this App.
	return BaseObject.extend("sap.ui.demoapps.rta.freestyle.controller.Application", {

		// The properties of this class are initialized during startup and never changed afterwards:
		// _oMainView: the view hosting this App
		// _oApplicationProperties: the json model with name appProperties (see above)
		// _oNavigationManager, _oODataMetadaLoader, _oODataHelper: instances of the helper classes as described above
		// _oMasterController: the controller of the S2 view

		// --- Application startup

		init: function(oComponent) {
			this._oMainView = oComponent.getAggregation("rootControl");

			// Make device information available for declarative definitions
			var oDeviceModel = new JSONModel(Device);
			oDeviceModel.setDefaultBindingMode("OneWay");
			oComponent.setModel(oDeviceModel, "device");

			// Initialize the global model
			this._oApplicationProperties = new JSONModel({
				metaDataLoadState: 0, // 0 = App is loading metadata (of OData model),
				// 1 = metadata has been loaded successfully, -1 = loading of metadata has failed.
				// metaDataLoadState of 1 indicates that the oData service is available and therefore the app
				// can continue to be started.
				// The display of the master list (in method onDataReceived) and display of the selected item (in method
				// adaptToDetailSelection) use the metaDataLoadState via appProperties model.
				// metaDataLoadState determines when the footer buttons in S2_ProductMaster.xml are active.
				// When metaData can't be loaded, the user is prompted to retry and the metaDate read again (see
				// ODataMetadataLoader.js).
				isAppBusy: true, // busy state of the whole app
				isMultiSelect: false, // multi-select mode of the master list
				isListLoading: false, // is the app currently loading the master list
				listNoDataText: " ", // no data text of the master list (only relevant when list is empty)
				applicationController: this, // provide access of the application controller to every class that can
				// access the component
				productId: null, // id of the product currently displayed/edited product
				draftId: null, // id of the draft currently being edited
				preferredIds: [], // an array of ids that are prioritized to be displayed when the list has loaded again
				masterImmediateBusy: true, // should the master view set busy immediately or with usual delay
				detailImmediateBusy: true, // should the detail view set busy immediately or with usual delay
				detailInHistory: false, // is navigation to detail page put into the history (for phone only)
				isChartDisplay: false // have the Sales Data in the display been selected for display?
			});
			oComponent.setModel(this._oApplicationProperties, "appProperties");

			// Allow binding of master list to be changed with updates. During editing, this is stopped.
			var fnSetAutomaticUpdate = function(bSetAutomaticUpdate) {
				this._oMasterController.setAutomaticUpdate(true);
			};
			// Create OData helper for changes into backend
			this._oODataHelper = new Products(oComponent, this._oMainView, fnSetAutomaticUpdate.bind(this, true), fnSetAutomaticUpdate.bind(
				this, false));

			// Create and initialize navigation manager
			var oRouter = oComponent.getRouter();

			this._oNavigationManager = new NavigationManager(oRouter, this._oApplicationProperties, oComponent.getModel(
				"i18n").getResourceBundle());
			this._oNavigationManager.init(oComponent.getComponentData(), this._oMainView);

			// Create and initialize metadata loader
			this._oODataMetadataLoader = new ODataMetadataLoader(oComponent);
			this._oODataMetadataLoader.init(this._oNavigationManager);
		},

		// ---Registration of S2 and S3 controllers

		registerMaster: function(oMasterController) {
			// This method is called in onInit() of the S2-view
			this._oMasterController = oMasterController;
			this._oNavigationManager.registerMaster(oMasterController);
		},

		registerDisplay: function(oDisplayController) {
			// This method is called in onInit() of the S3_ProductDisplay view
			this._oNavigationManager.registerDisplay(oDisplayController);
		},

		registerEdit: function(oEditController) {
			// This method is called in onInit() of the S3_ProductEdit view
			this._oNavigationManager.registerEdit(oEditController);
		},

		registerDetailInfo: function(oDetailInfoController) {
			// Keep a reference to the controller where the Supplier Card is created
			this._oNavigationManager.registerDetailInfo(oDetailInfoController);
		},

		registerDetailChart: function(oDetailChartController) {
			// Keep a reference to the controller where the Chart Data is created
			this._oNavigationManager.registerDetailChart(oDetailChartController);
		},

		//--- Navigation methods

		displayProduct: function(sProductId, bFromList) {
			// display the product specified by sProductId
			// bFromList is true if this has been triggered by actively selecting this product in the master list
			this._oNavigationManager.displayProduct(sProductId, bFromList);
		},

		editProductDraft: function(sProductId, sDraftId, bFromList) {
			// edit the product draft specified by sProductId and sDraftId
			// bFromList is true if this has been triggered by actively selecting this product in the master list
			this._oNavigationManager.editProductDraft(sProductId, sDraftId, bFromList);
		},

		navToEmptyPage: function(sText, bResetUrl) {
			// This method navigates to the empty page in detail area.
			// sText is the text to be shown on the empty page
			// If bResetUrl is true, the url is reset to the root url of the app
			this._oNavigationManager.navToEmptyPage(sText, bResetUrl);
		},

		navToMaster: function(sId, aPreferredReplace) {
			// Navigate to master.
			// In the non-phone case sId and aPreferredReplace can be used to define an array of ids that preferably shown
			// next in the detail area. More precisely: The first of those items which is actually in the list will be shown
			// in the detail area. See method getPreferredSuccessors of S2_ProductMaster.controller to find out, how this
			// array is derived from sId and aPreferredReplace.
			this._oNavigationManager.navToMaster(sId, aPreferredReplace);
		},

		navBack: function(bPreferHistory, bFromDetailScreen) {
			// Perform a back navigation.
			// bPreferHistory indicates whether the back navigation should be done by a browser back, in case it is possible
			// bFromDetailScreen indicates whether the back navigation was triggered by the back button on the detail area
			this._oNavigationManager.navBack(bPreferHistory, bFromDetailScreen);
		},

		//--- Additional public methods

		whenMetadataLoaded: function(fnMetadataLoaded, fnNoMetadata) {
			// This method can be called when another action depends on the fact that the metadata have been loaded
			// successfully. More precisely the contract of this method is as follows:
			// - when the metadata have already been loaded successfully fnMetadataLoaded is executed immediately.
			// - In case the metadata have not yet been loaded successfully, it is once more tried to load the metadata.
			//   fnMetadataLoaded will be called when the metadata have been loaded succesfully, whereas fnNoMetadata will
			//   be called when the metadata loading has failed.
			// - When the method is called while the metadata are still loading, fnMetaDataLoaded and fnNoMetadata will override
			//   functions which have been provided by previous calls.
			this._oODataMetadataLoader.whenMetadataLoaded(fnMetadataLoaded, fnNoMetadata);
		},

		hideMasterInPortrait: function() {
			// This method is only needed in portrait mode on a tablet. In this case, it hides the master list.
			this._oMainView.getController().hideMaster();
		},

		getODataHelper: function() {
			// Returns the (singleton) helper for handling oData operations in this application
			return this._oODataHelper;
		},

		prepareForDelete: function(sProductId) {
			// Adjust the preferred Ids when an item has been selected for delete
			this._oMasterController.prepareResetOfList(sProductId, true);
		},

		destroySupplierCard: function() {
			// On change of selected item, destroy the Supplier Card if created for this prodcut.  We prevent
			// Supplier information for other products from always being read on selection. It should only be
			// read when requested by the user, so to improve performance
			this._oNavigationManager.destroySupplierCard();
		},

		destroyDetailChart: function() {
			// When a user has selected Sales Data for the product as a chart, the view that
			// was created will be destroyed and deleted when a new product is selected by the user.
			// This prevents automatic reads of the sales data, when it is expected that the user only
			// rarely will request this data.  This will improve performance in the app.
			this._oNavigationManager.destroyDetailChart();
		},

		setAppBusy: function() {
			// Set Busy Indicator at Root View
			this._oApplicationProperties.setProperty("/isAppBusy", true);
			this._oApplicationProperties.setProperty("/detailImmediateBusy", true);
		},

		resetAppBusy: function() {
			// Remove BusyIndicator from Root View
			this._oApplicationProperties.setProperty("/isAppBusy", false);
		}

	});
});
