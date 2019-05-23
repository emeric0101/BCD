sap.ui.define([
	"sap/ui/model/json/JSONModel",
	"sap/ui/demoapps/rta/freestyle/controller/BaseController",
	"sap/ui/demoapps/rta/freestyle/util/controls"
], function(JSONModel, BaseController, controls) {
	"use strict";

	return BaseController.extend("sap.ui.demoapps.rta.freestyle.controller.ProductGeneralForm", {
		// User wants to open the business card of the product supplier
		onSupplierPressed: function(oEvent) {
			if (!this._oPopover || !sap.ui.getCore().byId(this._oPopover.getId())) {
				this._initializeSupplierCard();
			}
			this._oPopover.openBy(oEvent.getSource());
		},

		_initializeSupplierCard: function() {
			var oCardModel = new JSONModel({
				open: true,
				delay:1000,
				loading: false
			});
			var oComponent = this.getOwnerComponent();
			oComponent.runAsOwner(function() {
				this._oSupplierCard = sap.ui.xmlfragment(this.getView().createId("companyQuickView"), "sap.ui.demoapps.rta.freestyle.view.SupplierCard", {
					dataRequested: oCardModel.setProperty.bind(oCardModel, "/loading", true),
					change: oCardModel.setProperty.bind(oCardModel, "/loading", false)
				});

				this._oPopover = new sap.m.Popover({
					id: this.getView().createId("FormPopover"),
					showHeader: false,
					contentMinWidth: "250px",
					contentWidth: "20%",
					content: this._oSupplierCard,
					placement: "HorizontalPreferredRight",
					afterOpen: oCardModel.setProperty.bind(oCardModel, "/open", true),
					afterClose: function () {
						oCardModel.setProperty.bind(oCardModel, "/open", false);
					}.bind(this)
				});

				this._oPopover.removeStyleClass("sapUiPopupWithPadding");
				this._oPopover.addStyleClass("sapUiSizeCompact");
				this._oPopover.setModel(oCardModel, "supplierCard");
				controls.attachControlToView(this.getView(), this._oPopover);
			}.bind(this));
		}
	});
});
