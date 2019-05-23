sap.ui.define([
	"sap/ui/base/Object",
	"sap/m/MessageBox",
	"sap/ui/demoapps/rta/freestyle/util/controls",
	"sap/ui/demoapps/rta/freestyle/util/messages"
], function(BaseObject, MessageBox, controls, messages) {
	"use strict";

	return BaseObject.extend("sap.ui.demoapps.rta.freestyle.controller.ODataMetadataLoader", {
		// The purpose of this class is to check that the app can connect to the oData Backend service.
		// When the metadata of an oData service has been loaded, the app startup can continue, assuming that
		// the backend connection is available.  If the connection is not available, the user can re request the
		// loading from the error message provided.
		// The search and refresh in the master list also make use of this class.

		constructor: function(oComponent) {
			this._oResourceBundle = oComponent.getModel("i18n").getResourceBundle();
			this._oODataModel = oComponent.getModel();
			this._oApplicationProperties = oComponent.getModel("appProperties");
			this._oOnMetaData = {};
		},

		init: function(oNavigationManager) {
			this._oNavigationManager = oNavigationManager;
			this._oODataModel.attachMetadataLoaded(this.onMetadataLoaded, this);
			this._oODataModel.attachMetadataFailed(this.onMetadataFailed, this);
		},

		onMetadataLoaded: function() {
			// In normal scenarios this method is called at the end of the startup process. However, when the initial loading of
			// metadata fails, this method may be called later. It is registered in init().
			this._oApplicationProperties.setProperty("/metaDataLoadState", 1);
			this._oApplicationProperties.setProperty("/isListLoading", true);
			if (this._oOnMetaData.onSuccess) {
				this._oOnMetaData.onSuccess();
			}
			this._oNavigationManager.metadataSuccess();
			this._oOnMetaData = null;
		},

		// User gets an error message, with the details.  The user can rerequest the start
		// and a refresh of the load of the metadata is triggered.
		onMetadataFailed: function(oError) {
			this._oApplicationProperties.setProperty("/metaDataLoadState", -1);
			if (this._oOnMetaData.onFailure) {
				this._oOnMetaData.onFailure();
			}
			this._oOnMetaData = {};
			var sError = messages.getErrorContent(oError);
			this._oApplicationProperties.setProperty("/listNoDataText", sError);
			this._oNavigationManager.metadataFailed(sError);
			this._bMessageOpen = true;
			MessageBox.error(sError, {
				title: this._oResourceBundle.getText("xtit.error"),
				details: messages.getErrorDetails(oError),
				actions: [MessageBox.Action.RETRY, MessageBox.Action.CLOSE],
				onClose: function(sAction) {
					this._bMessageOpen = false;
					if (sAction === MessageBox.Action.RETRY) {
						this.whenMetadataLoaded();
					}
				}.bind(this),
				styleClass: controls.getContentDensityClass()
			});
		},

		whenMetadataLoaded: function(fnMetadataLoaded, fnNoMetadata) {
			if (this._bMessageOpen) {
				return;
			}
			// The metadata does not need to be loaded again. Execute the function immediately.
			if (this._oApplicationProperties.getProperty("/metaDataLoadState") === 1) {
				if (fnMetadataLoaded) {
					fnMetadataLoaded();
				}
				// The metadata has not been loaded. Refresh the oData and add the success/failure handlers to the
				// metadata events.
			} else {
				this._oOnMetaData.onSuccess = fnMetadataLoaded;
				this._oOnMetaData.onFailure = fnNoMetadata;
				this._oApplicationProperties.setProperty("/metaDataLoadState", 0);
				this._oODataModel.refreshMetadata();
			}
		}
	});
});
