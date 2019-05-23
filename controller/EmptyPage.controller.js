sap.ui.define([
	"sap/ui/core/mvc/Controller"
], function(Controller) {
	"use strict";

	// Controller of the EmptyPage view
	return Controller.extend("sap.ui.demoapps.rta.freestyle.controller.EmptyPage", {
		onNavBack: function() {
			// Handler for the nav button of the page. It is attached declaratively. Note that it is only available on phone.
			var oApplicationProperties = this.getView().getModel("appProperties"),
				oApplicationController = oApplicationProperties.getProperty("/applicationController");
			oApplicationController.navBack(true);
		}
	});
});
