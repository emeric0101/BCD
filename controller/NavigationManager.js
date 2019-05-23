sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/Device",
	"sap/ui/core/routing/History"
], function(BaseObject, Device, History) {
	"use strict";

	// 'Constants' for the route names used in this app
	var sDisplayRoute = "display",
		sEditRoute = "edit",
		sCreateRoute = "create",
		sMasterRoute = "master";

	// The main task of this method is initializing the router. However, it is first checked, whether the component data contain
	// information about cross-app navigation. If so, the startup parameters are translated into a route. This route
	// is set programmatically. Initialization of the router is postponed until this has been executed.
	function fnExtractStartupParametersAndInitializeRouter(oComponentData, oRouter) {
		if (oComponentData && oComponentData.startupParameters && jQuery.isArray(oComponentData.startupParameters.Product) &&
			oComponentData.startupParameters.Product.length > 0) {
			var sUrl = oRouter.getURL(sDisplayRoute, {
				productId: oComponentData.startupParameters.Product[0]
			});
			if (sUrl) {
				sap.ui.require(["sap/ui/core/routing/HashChanger"], function(HashChanger) {
					var oHashChanger = HashChanger.getInstance();
					oHashChanger.replaceHash(sUrl);
					oRouter.initialize();
				});
				return; // router is initialized (possibly asynchronously) via the function defined above
			}
		}
		oRouter.initialize();
	}

	// Helper class for class Application. It handles all navigation related issues in the app.
	// In particular, this class is the only one that interacts with the router.
	// This class has references to the controllers of S2 and S3 views and calls methods from them.
	// More precisely, on S2 methods adaptToDetailSelection, setAutomaticUpdate, getPreferredSuccessors, and findItem are used
	// On S3 controllers (display and edit) method productChanged is used in order to inform the view that it should adapt its
	// binding to the currently selected entity. Method unbind is used to inform the view that it is no longer in display.
	// Note that productChanged is preferably called before the navigation takes place whereas unbind is called after
	// navigation has finished. This is done in order to hide the data exchange from the user.
	// However, there are two exceptions from this:
	// - When the user enters a url manually, the navigation is done automatically via routing. Therefore, the controllers
	// can only be informed in the route handler
	// - During startup the S3 view is initialized with the first route matching it. Therefore, it cannot be updated before
	// the route is triggerd.
	return BaseObject.extend("sap.ui.demoapps.rta.freestyle.controller.NavigationManager", {
		// The following properties of this class are set during initialization and not changed afterwards:
		// _oRouter: The router of this app
		// _oApplicationProperties: global state model of the app
		// _oResourceBundle: The resource bundle used by this app
		// _oMasterController, _oDisplayController, _oEditController: Controllers of S2 and S3 views.
		//    they are registered in the corresponding onInit-methods.
		// _bRouteMatched: Set to true on the first match of a route

		// The following attributes will change during the lifetime of this class:
		// _bProgrammaticNavigation: This attribute is used to distinguish between hash changes performed
		//    programmatically (via method _executeNavigation) and hash changes performed by the user (via browser interaction).
		// _bSubControllersMustBeAdapted: This attribute indicates whether the S3 controller must be updated in the route handler
		//  (see explanation above).
		// _oUnhandledRoute: If this object is truthy it describes a route that has matched and still needs to be handled. In
		// this case it contains:
		//    properties 'route' (the name of the route) and 'arguments' (the arguments from the route).
		//    Exception: For illegal routes the object is just empty.
		//    Note that this attribute is used to defer handling of routes manually entered by the user while the app is busy.

		// --- Startup

		constructor: function(oRouter, oApplicationProperties, oResourceBundle) {
			this._oRouter = oRouter;
			this._oApplicationProperties = oApplicationProperties;
			this._oResourceBundle = oResourceBundle;
		},

		init: function(oComponentData, oMainView) {
			//Allow root view to be sync and async in demos
			Promise.resolve().then(function(){
				var oController = oMainView.getController();
				if (!oController) {
					return oMainView.loaded().then(function(){
						return oMainView.getController();
					});
				} else{
					return oController;
				}
			}).then(function(oController){
				oController.attachAfterNavigate(this.afterNavigate, this);
			}.bind(this));
			
			
			
			this._bSubControllersMustBeAdapted = true;
			this._oRouter.getTargetHandler().setCloseDialogs(false);
			this._oRouter.attachRoutePatternMatched(this.onRoutePatternMatched, this);
			this._oRouter.attachBypassed(this.onBypassed, this);
			// Router is initialized at the end, since this triggers the instantiation of the views.
			// In onInit of the views we want to rely on the component being correctly initialized.
			fnExtractStartupParametersAndInitializeRouter(oComponentData, this._oRouter);
		},

		registerMaster: function(oMasterController) {
			// This method is called in onInit() of the S2-view
			this._oMasterController = oMasterController;
		},

		registerDisplay: function(oDisplayController) {
			// This method is called in onInit() of the S3Display-view
			this._oDisplayController = oDisplayController;
		},

		registerEdit: function(oEditController) {
			// This method is called in onInit() of the S3Edit-view
			this._oEditController = oEditController;
		},

		registerDetailInfo: function(oDetailInfoController) {
			// This method is used by onSelectionChange() of S2_ProductMaster controller
			this._oDetailInfoController = oDetailInfoController;
		},

		registerDetailChart: function(oDetailChartController) {
			// This method is used by onSelectionChange() of S2_ProductMaster controller
			this._oDetailChartController = oDetailChartController;
		},

		// - Navigation methods

		afterNavigate: function() {
			// This method is called after each navigation. It unbinds the S3-views which are currently not visible, so that they
			// do not load any data. Note that both S3 views may be invisible (on phone).
			var sDraftId = this._oApplicationProperties.getProperty("/draftId");
			if (!sDraftId && this._oEditController) {
				this._oEditController.unbind();
			}
			var sProductId = this._oApplicationProperties.getProperty("/productId");
			if ((sDraftId || !sProductId || sProductId === " ") && this._oDisplayController) {
				this._oDisplayController.unbind();
			}
		},

		onRoutePatternMatched: function(oEvent) {
			// This method is registered at the router. It will be called whenever the url-hash changes. Note that there may be
			// two reasons for this. The hash may be set by the browser (e.g. if the user follows a link leading to this App) or
			// by the router itself. The second case applies when the App calls a navigation method of the router itself.
			this._routeMatched({
				route: oEvent.getParameter("name"),
				arguments: oEvent.getParameter("arguments")
			});
		},

		_routeMatched: function(oUnhandledRoute) {
			this._bRouteMatched = true;
			this._oUnhandledRoute = oUnhandledRoute;
			this._routeHandler();
		},

		_routeHandler: function() {
			// This method checks whether there is an unhandled route which can currently be handled. If this is the case the
			// route is handled.
			if (!this._oUnhandledRoute) {
				return;
			}
			var iMetaDataLoadState = this._oApplicationProperties.getProperty("/metaDataLoadState");
			if (iMetaDataLoadState === -1) {
				// If metadata loading has failed, the route must have been entered manually. We cannot handle this here but
				// we can trigger a new attempt to read the metadata.
				this._oApplicationProperties.getProperty("/applicationController").whenMetadataLoaded();
				return;
			} else if (iMetaDataLoadState === 1) {
				var sRoute = this._oUnhandledRoute.route,
					oArguments = this._oUnhandledRoute.arguments,
					bEditRoute = sRoute === sEditRoute,
					bDraftRoute = bEditRoute || sRoute === sCreateRoute,
					sProductId = (sRoute === sDisplayRoute || bEditRoute) ? decodeURIComponent(oArguments.productId) : "",
					sDraftId = bDraftRoute ? oArguments.DraftUUID : "";
				this._oApplicationProperties.setProperty("/productId", sProductId);
				this._oApplicationProperties.setProperty("/draftId", sDraftId);
				this._oUnhandledRoute = null;
				if (!sRoute) {
					this._onBypassed();
					return;
				}
				if (sProductId || bDraftRoute) {
					var oCurrentController = bDraftRoute ? this._oEditController : this._oDisplayController;
					if (this._bSubControllersMustBeAdapted && oCurrentController) {
						oCurrentController.productChanged();
					}
					this._oMasterController.adaptToDetailSelection(!this._bProgrammaticNavigation);
				}
				if (!this._bProgrammaticNavigation) {
					this._oApplicationProperties.setProperty("/preferredIds", []);
				}
				this._oApplicationProperties.setProperty("/detailInHistory", Device.system.phone);
				this._bSubControllersMustBeAdapted = true;
				this._bProgrammaticNavigation = false;
			}
		},

		// Called for invalid url-hashes
		onBypassed: function() {
			this._routeMatched({});
		},

		_onBypassed: function() {
			this._oApplicationProperties.setProperty("/emptyText", this._oResourceBundle.getText("ymsg.pageNotFound"));
			this._oApplicationProperties.setProperty("/productId", " ");
			this._oApplicationProperties.setProperty("/draftId", null);
			this._oMasterController.adaptToDetailSelection(false);
			this._oApplicationProperties.setProperty("/preferredIds", []);
		},

		// --- Implementation of the public navigation methods exposed by the Application class

		navToEmptyPage: function(sText, bResetUrl) {
			// This method navigates to the empty page in detail area. Prerequisites for
			// calling this method are as for showProductDetailPage.
			// sText is the text to be shown on the empty page
			// bResetUrl defines whether the route should be set back to the master route
			this._oApplicationProperties.setProperty("/emptyText", sText);
			this._oApplicationProperties.setProperty("/draftId", null);
			this._oMasterController.setAutomaticUpdate(true);
			if (bResetUrl) {
				// Set back the route to the generic one
				this._executeNavigation(sMasterRoute, null, true);
			}
			this._oRouter.getTargets().display("empty");
			this._oApplicationProperties.setProperty("/preferredIds", []);
		},

		displayProduct: function(sProductId, bFromList) {
			// This method navigates to the display page for the specified product id.
			this._oApplicationProperties.setProperty("/productId", sProductId);
			this._oApplicationProperties.setProperty("/draftId", "");

			this._oMasterController.adaptToDetailSelection();
			this._oMasterController.setAutomaticUpdate(true);
			if (this._oDisplayController) {
				this._oDisplayController.productChanged();
			}
			this._executeNavigation(sDisplayRoute, {
				productId: encodeURIComponent(sProductId)
			}, !(bFromList && Device.system.phone)); // true: hash should not be stored in the history
		},

		editProductDraft: function(sProductId, sDraftId, bFromList) {
			this._oApplicationProperties.setProperty("/productId", sProductId);
			this._oApplicationProperties.setProperty("/draftId", sDraftId);
			this._oMasterController.adaptToDetailSelection();
			this._oMasterController.setAutomaticUpdate(false);
			var bAddToHistory = bFromList && Device.system.phone;
			this._oApplicationProperties.setProperty("/detailInHistory", bAddToHistory);
			if (this._oEditController) {
				this._oEditController.productChanged();
			}
			var oParams = {
				DraftUUID: sDraftId
			};
			if (sProductId) {
				oParams.productId = encodeURIComponent(sProductId);
			}
			// true: hash should not be stored in the history
			this._executeNavigation(sProductId ? sEditRoute : sCreateRoute, oParams, !bAddToHistory);
		},

		navToMaster: function(sId, aPreferredReplace) {
			// This method navigates to the master route. sPreferredId is an optional parameter that may contain the id of a
			// product that (on non-phone devices) is preferably shown (provided it is in the master list). Prerequisites for
			// calling this method are as for showProductDetailPage.
			this._executeNavigation(sMasterRoute, {}, true);
			this._oApplicationProperties.setProperty("/productId", null);
			this._oApplicationProperties.setProperty("/draftId", null);
			if (sId) {
				this._oApplicationProperties.setProperty("/preferredIds", this._oMasterController.getPreferredSuccessors(sId, aPreferredReplace));
			}
			this._oMasterController.setAutomaticUpdate(true);

		},

		// Handling of back functionality.
		// bPreferHistory: Information whether back should be realized via browser-history if browser history is available.
		//                 This should be true with the exception of those views which do not have an own url (like the
		//                 summary page in our example)
		// bFromDetailScreen: Information whether back is called from master or from detail screen. This is used to decide
		//                 where to go when history
		// cannot be used. When coming from a detail screen (only possible on phone) go to master, when coming from master,
		// go back to shell.
		navBack: function(bPreferHistory, bFromDetailScreen) {
			this._oApplicationProperties.setProperty("/productId", null);
			this._oApplicationProperties.setProperty("/draftId", null);
			this._oApplicationProperties.setProperty("/preferredIds", []);
			var oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");
			if (bPreferHistory) {
				var oHistory = History.getInstance(),
					sPreviousHash = oHistory.getPreviousHash();
				if (sPreviousHash !== undefined || !oCrossAppNavigator.isInitialNavigation()) {
					history.go(-1);
					return;
				}
			}
			if (bFromDetailScreen) {
				this._oRootView.getController().backMaster();
				this._oRouter.navTo("main", {}, true);
				return;
			}
			oCrossAppNavigator.toExternal({
				target: {
					shellHash: "#"
				}
			});
		},

		metadataFailed: function(sErrorText) {
			this._oApplicationProperties.setProperty("/emptyText", sErrorText);
			if (!Device.system.phone || this._oApplicationProperties.getProperty("/productId") || this._oApplicationProperties.getProperty(
					"/draftId")) {
				this._oRouter.getTargets().display("empty");
			}
		},

		metadataSuccess: function() {
			this._routeHandler();
		},

		_executeNavigation: function(sRoute, oParameters, bReplace) {
			// This method wraps the navTo-method of the router. It is called for navigation performed programmatically.
			// Thus, we expect that the subcontrollers have already been informed. So _bSubControllersMustBeAdapted is
			// set to false which is evaluated in onRoutePatternMatched.
			// However, there is one exception: If the detail controller was not registered at this point in time, adapting
			// it had to be postponed.
			this._bProgrammaticNavigation = true;
			this._bSubControllersMustBeAdapted = !(sRoute === sDisplayRoute ? this._oDisplayController : this._oEditController);
			this._oRouter.navTo(sRoute, oParameters, bReplace);
		},

		destroySupplierCard: function() {
			// When a new item is selected, the supplier card is destroyed to prevent the supplier information
			// being read by default every time a new item is selected.
			if (this._oDetailInfoController) {
				this._oDetailInfoController.destroySupplierCard();
			}
		},

		destroyDetailChart: function() {
			// When a user has selected sales data for a product, but then switches back to the product display, it
			// is assumed that the user will usually not want to display the sales data for a different product.
			// Therefore the controller for the chart view is destroyed to prevent the unnecessary reading of this data.
			// Of course, if a user requests the sales data for a different product, it will be read but it is assumed
			// that it is more efficient only to read the sales data when the user requests to do so.
			// Exception: if the display detail is in sales display when a new product is selected, the controller is
			// not destroyed and the sales data for the different product is read and displayed immediately.
			if (this._oDetailChartController) {
				this._oDetailChartController.destroy();
				delete this._oDetailChartController;
			}
		}
	});
});
