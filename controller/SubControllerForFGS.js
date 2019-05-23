// Creates a sub-controller to be used by the master controller to handle specifically filtering, grouping, and sorting
// dialogs
sap.ui.define([
	"sap/ui/base/Object",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/ui/demoapps/rta/freestyle/util/controls"
], function(BaseObject, Filter, FilterOperator, Sorter, controls) {
	"use strict";

	// Reads the SAP attribute label from the list-item context
	function fnGetSAPLabel(oListItemContext, sAttributeName) {
		return oListItemContext.getProperty("/#SEPMRA_C_PD_ProductType/" + sAttributeName + "/@sap:label");
	}

	return BaseObject.extend("sap.ui.demoapps.rta.freestyle.controller.SubControllerForFGS", {

		mFilters: {
			Availibility: {
				filters: {},
				missingFilter: function(sKey) {
					return new Filter("to_ProductStock/StockAvailability", FilterOperator.EQ, sKey);
				},
				keyForLabel: "xfld.availability"
			},
			Price: {
				filters: {
					"LE100": new Filter("Price", FilterOperator.LE, "100"),
					"BT100-500": new Filter("Price", FilterOperator.BT, "100", "500"),
					"BT500-1000": new Filter("Price", FilterOperator.BT, "500", "1000"),
					"GT1000": new Filter("Price", FilterOperator.GE, "1000")
				},
				keyForLabel: "xfld.price"
			}
		},
		aFilterByKeys: [null, "xtit.filterBy", "xtit.filterBy2", "xtit.filterBy3"],

		constructor: function(oParentView, oTableOperations, fnApplyTableOperations) {
			this._oParentView = oParentView;
			this._oResourceBundle = oParentView.getController().getResourceBundle();
			this._oTableOperations = oTableOperations;
			this._fnApplyTableOperations = fnApplyTableOperations;
			this._mDialogs = {};

			var sTextBelow100 = this._getText("xfld.groupPriceBetween", ["0-100"]),
				sTextBelow500 = this._getText("xfld.groupPriceBetween", ["100-500"]),
				sTextBelow1000 = this._getText("xfld.groupPriceBetween", ["500-1000"]),
				sTextAbove1000 = this._getText("xfld.groupPrice", ["1000"]);

			// Sets the pre-defined price ranges for use in grouping. The texts can only be defined once i18n bundle is
			// available because the text "price between" is defined only once.
			this._oPriceGroups = {
				"LE100": sTextBelow100,
				"BT100-500": sTextBelow500,
				"BT500-1000": sTextBelow1000,
				"GT1000": sTextAbove1000,
				"unknownPrice": "?"
			};
			var oViewPropertiesModel = oParentView.getModel("masterView");
			oViewPropertiesModel.setProperty("/LE100", sTextBelow100);
			oViewPropertiesModel.setProperty("/BT100-500", sTextBelow500);
			oViewPropertiesModel.setProperty("/BT500-1000", sTextBelow1000);
			oViewPropertiesModel.setProperty("/GT1000", sTextAbove1000);
			this._addDefaultFilters({});
		},

		// Where the user has selected no filter for a ViewSettingsFilterItem, add the default filter if this
		// has been defined in mFilters.
		_addDefaultFilters: function(oFilterFlags) {
			for (var sKey in this.mFilters) {
				if (!oFilterFlags[sKey]) {
					var oDefaultFilter = this.mFilters[sKey].defaultFilter;
					if (oDefaultFilter) {
						this._oTableOperations.addFilter(oDefaultFilter, sKey);
					}
				}
			}
		},

		// Opens the requested filter, grouping, and sorting dialogs
		openDialog: function(sDialogFragmentName, sInitialSelection) {
			var sFullFragmentName = "sap.ui.demoapps.rta.freestyle.view.dialog." + sDialogFragmentName,
				oDialog = this._mDialogs[sFullFragmentName];
			if (!oDialog) {
				this._mDialogs[sFullFragmentName] = oDialog = sap.ui.xmlfragment(sFullFragmentName, this);
				controls.attachControlToView(this._oParentView, oDialog);
				if (sInitialSelection) {
					oDialog.setSelectedSortItem(sInitialSelection);
				}
			}
			return oDialog.open();
		},

		// Handler for the filter criteria, which is set by the user
		onFilterDialogConfirm: function(oEvent) {
			var params = oEvent.getParameters(),
				oFilterFlags = {},
				i = 0;

			var aFilterItems = params.filterItems; // Array of type ViewSettingsItem
			// Rebuilds filters every time. Makes it easier if the user has removed filter selections
			this._oTableOperations.resetFilters();

			// Determines which filters the user selected according to the predefined price and stock filters
			for (i = 0; i < aFilterItems.length; i++) {
				var oViewSettingsItem = aFilterItems[i],
					sViewSettingsItemKey = oViewSettingsItem.getKey(),
					sViewSettingsFilterItemKey = oViewSettingsItem.getParent().getKey(),
					oFilterHandler = this.mFilters[sViewSettingsFilterItemKey],
					oSelectedFilterExpression = oFilterHandler.filters[sViewSettingsItemKey];

				if (!oSelectedFilterExpression) {
					oSelectedFilterExpression = oFilterHandler.filters[sViewSettingsItemKey] = oFilterHandler.missingFilter(sViewSettingsItemKey);
				}
				this._oTableOperations.addFilter(oSelectedFilterExpression, sViewSettingsFilterItemKey);
				oFilterFlags[sViewSettingsFilterItemKey] = true;
			}
			// For all of the filter attributes that have a default filter, add this default where no filter was
			// selected by the user.  Currently only IsActiveEntity has a default filter.  This must be set to ensure that
			// the correct set of products is shown to the user.  Note that the filter selection conditions for the editing
			// status requires that the default filter is thrown away and specific filters for the requested editing status set.
			// In other words, it is not possible to have the default set of user products and apply additional status filtering
			// to this "logical set" because the backend only allows ONE filter to use the parameter IsActiveEntity.
			this._addDefaultFilters(oFilterFlags);
			// Updates table operation settings and updates list binding accordingly
			this._fnApplyTableOperations(this._setFilterToolbar.bind(this, oFilterFlags));
		},

		// In the case of a filter of Editing Status, filter is based on Product Flags
		_setEditingFilter: function(oSelectedFilterExpression, sKey) {
			switch (sKey) {
				case "editingDraft":
					this._oTableOperations.addFilter(oSelectedFilterExpression, "false", "IsActiveEntity");
					break;
				case "editingLocked":
					this._oTableOperations.addFilter(oSelectedFilterExpression, "false", "IsLocked");
					break;
				case "editingActive":
					this._oTableOperations.addFilter(oSelectedFilterExpression, "false", "IsActiveEntity");
					break;
			}
		},

		_setFilterToolbar: function(oFilterFlags) {
			// Shows/hides infoToolbar in the list

			var aFilterTexts = [];
			for (var sKey in this.mFilters) {
				if (oFilterFlags[sKey]) {
					aFilterTexts.push(this._getText(this.mFilters[sKey].keyForLabel));
				}
			}
			var sFilterByKey = this.aFilterByKeys[aFilterTexts.length],
				sFilterBarLabel = sFilterByKey && this._getText(sFilterByKey, aFilterTexts),
				oViewPropertiesModel = this._oParentView.getModel("masterView");
			oViewPropertiesModel.setProperty("/isFilterBarVisible", !!sFilterByKey);
			oViewPropertiesModel.setProperty("/filterBarLabel", sFilterBarLabel);
		},

		// Defines the Draft filter settings available
		_oEditingFilters: {
			"editingDraft": new Filter("IsActiveEntity", FilterOperator.EQ, "false"),
			"editingLocked": new Filter("HasDraftEntity", FilterOperator.EQ, "true"),
			"editingActive": new Filter("IsActiveEntity", FilterOperator.EQ, "true")

		},

		// Handler for the Confirm button on the sort dialog. Depending on the selections made on the sort
		// dialog, the respective sorters are created and stored in the _oTableOperations object.
		// The actual setting of the sorters on the binding is done in function setSorters
		onSortDialogConfirmed: function(oEvent) {
			var mParams = oEvent.getParameters(),
				sSortPath = mParams.sortItem.getKey();
			this._oTableOperations.addSorter(new Sorter(sSortPath, mParams.sortDescending));
			this._fnApplyTableOperations();
		},

		// Handler for the grouping criteria, which are set by the user
		onGroupingDialogConfirmed: function(oEvent) {
			var mParams = oEvent.getParameters(),
				sortPath;
			if (mParams.groupItem) {
				sortPath = mParams.groupItem.getKey();
			}
			if (sortPath && sortPath !== "") {
				this._oTableOperations.setGrouping(new Sorter(sortPath, mParams.groupDescending,
					this._oGroupFunctions[sortPath].bind(this)));
			} else {
				// Not defined: reset Grouping
				this._oTableOperations.removeGrouping();
			}
			//}
			this._fnApplyTableOperations();
		},

		_oGroupFunctions: {

			// Assumption is that all prices contain the currency code and that the currency conversion has to be done in
			// the backend system of the app
			Price: function(oListItemContext) {
				var sKey, iPrice = Number(oListItemContext.getProperty("Price"));
				if (iPrice <= 100) {
					sKey = "LE100";
				} else if (iPrice <= 500) {
					sKey = "BT100-500";
				} else if (iPrice <= 1000) {
					sKey = "BT500-1000";
				} else if (iPrice > 1000) {
					sKey = "GT1000";
				} else {
					sKey = "unknownPrice";
				}

				return {
					key: sKey,
					text: this._oPriceGroups[sKey]
				};
			},

			"to_ProductStock/Quantity": function(oListItemContext) {
				var sText = oListItemContext.getProperty("to_ProductStock/to_StockAvailability/StockAvailability_Text") || this._getText(
					"xfld.undefinedAvail");
				return {
					key: sText,
					text: sText
				};
			},

			"to_ProductCategory/MainProductCategory": function(oListItemContext) {
				return this._getCategoryName(oListItemContext, "to_ProductCategory/MainProductCategory");
			},

			ProductCategory: function(oListItemContext) {
				return this._getCategoryName(oListItemContext, "ProductCategory");
			}
		},

		// Reads the corresponding category name based on the list-item context
		_getCategoryName: function(oListItemContext, sCategoryType) {
			var sKey = oListItemContext.getProperty(sCategoryType);
			return {
				key: sKey,
				text: this._getText("xfld.groupingLabel", [fnGetSAPLabel(oListItemContext, sCategoryType), sKey])
			};
		},

		// Shortcut to get i18n text
		_getText: function() {
			return this._oResourceBundle.getText.apply(this._oResourceBundle, arguments);
		}
	});
});
