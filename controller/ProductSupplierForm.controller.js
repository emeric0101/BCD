sap.ui.define([
	"sap/ui/demoapps/rta/freestyle/controller/BaseController"
], function(BaseController) {
	"use strict";

	return BaseController.extend("sap.ui.demoapps.rta.freestyle.controller.ProductSupplierForm", {
		onInit: function() {
			this.byId("supplierForm").bindElement({path:"to_Supplier"});
			//HACK to support demo without stable IDs
			var oContactGroupControl = this.byId("SupplierFormPersonGroup") || this.byId("supplierForm").getGroups()[1];
			oContactGroupControl.bindElement({path:"to_PrimaryContactPersonType"});
		}
	});
});
