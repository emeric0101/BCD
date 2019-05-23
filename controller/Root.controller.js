// Controller for the view hosting the (Split-)App.
sap.ui.define([
	"sap/ui/Device",
	"sap/ui/demoapps/rta/freestyle/util/controls"
], function(Device, controls) {
	"use strict";

	// This class is the controller of view sap.ui.demoapps.rta.freestyle.view.Root, the view hosting the whole app.
	return sap.ui.controller("sap.ui.demoapps.rta.freestyle.controller.Root", {
		// This class possesses one instance variable, namely _oAppControl. It provides access to the instance of sap.m.SplitApp hosting the app.
		// The variable is initialized in onInit and not changed afterwards.
		onInit: function() {
			this.getView().addStyleClass(controls.getContentDensityClass());
			this._oAppControl = this.byId("idAppControl");
		},

		//--- Public methods used by class Application (or its helper classes)

		hideMaster: function() {
			// Hide master list in portrait mode on tablet
			this._oAppControl.hideMaster();
		},

		attachAfterNavigate: function(fnAfterDetailNavigate, oListener) {
			// attach a function that is called after each navigation step
			if (Device.system.phone) {
				this._oAppControl.attachAfterMasterNavigate(fnAfterDetailNavigate, oListener);
			} else {
				this._oAppControl.attachAfterDetailNavigate(fnAfterDetailNavigate, oListener);
			}
		}
	});
});
