// Provides control nw.epm.refapps.lib.reuse.control.RatingAndCount
sap.ui.define([
	"jquery.sap.global",
	"sap/ui/core/Control"
], function(jQuery, Control) {
	"use strict";

	/**
	 * Constructor for a new RatingAndCount control.
	 *
	 * @param {string} [sId] id for the new control, generated automatically if no id is given
	 * @param {object} [mSettings] initial settings for the new control
	 *
	 * @class
	 * Some class description goes here.
	 * @extends sap.ui.core.Control
	 *
	 * @author SAP SE
	 * @version 1.65.1
	 *
	 * @constructor
	 * @public
	 * @alias sap.ui.demoapps.rta.freestyle.control.RatingAndCount
	 */
	var RatingAndCount = Control.extend("sap.ui.demoapps.rta.freestyle.control.RatingAndCount", {
		metadata: {
			interfaces: ["sap.ui.core.IFormContent"],
			properties: {
				/**
				 * maxRatingValue
				 */
				maxRatingValue: {
					type: "int",
					group: "Data",
					defaultValue: 5
				},

				/**
				 * value
				 */
				value: {
					type: "float",
					group: "Data",
					defaultValue: 0
				},

				/**
				 * enabled
				 */
				enabled: {
					type: "boolean",
					group: "Behavior",
					defaultValue: true
				},

				/**
				 * iconSize
				 */
				iconSize: {
					type: "sap.ui.core.CSSSize",
					group: "Dimension",
					defaultValue: "auto"
				},

				/**
				 * ratingCount
				 */
				ratingCount: {
					type: "float",
					group: "Data",
					defaultValue: 0
				},

				/**
				 * verticalAlignContent
				 */
				verticalAlignContent: {
					type: "boolean",
					group: "Behavior",
					defaultValue: false
				},

				/**
				 * verticalAdjustment
				 */
				verticalAdjustment: {
					type: "int",
					group: "Behavior",
					defaultValue: 0
				}

			},
			events: {
				/**
				 * Event is fired when the user clicks on the control.
				 */
				press: {}
			},
			aggregations: {
				/**
				 * Shows the number of ratings. This control is only used if a handler is assigned to the press event
				 */
				_ratingCountLink: {
					type: "sap.m.Link",
					multiple: false,
					visibility: "hidden"
				},
				/**
				 * Shows the number of ratings. This control is only used if on handler is assigned to the press event
				 */
				_ratingCountLabel: {
					type: "sap.m.Label",
					multiple: false,
					visibility: "hidden"
				},
				/**
				 * The rating indicator shows the average valuee of the existing ratings
				 */
				_ratingIndicator: {
					type: "sap.m.RatingIndicator",
					multiple: false,
					visibility: "hidden"
				}
			}
		}
	});

	///**
	// * This file defines behavior for the control,
	// */
	RatingAndCount.prototype.init = function() {
		// [km]
		// Make sure the CSS file is included for all themes

		// TODO: check if styles are loaded properly
		// if (sap.ui.getCore().getConfiguration().getTheme() !== "sap_belize") {
		// 	// Get module patch for library / reuse component
		// 	var sModulePath = jQuery.sap.getModulePath("nw.epm.refapps.lib.reuse");
		// 	// Get RTL mode flag
		// 	var bRTL = sap.ui.getCore().getConfiguration().getRTL();
		// 	// Build library.css / libraryRTL.css URL
		// 	var sUrl = bRTL ? sModulePath + "/themes/base/libraryRTL.css" : sModulePath + "/themes/base/library.css";
		// 	// Include stylesheet in HEAD of document, using URL and ID
		// 	jQuery.sap.includeStyleSheet(sUrl, "sap-ui-theme-" + "nw.epm.refapps.lib.reuse");
		// }

		this._oRating = new sap.m.RatingIndicator(this.getId() + "-rating");
		this._oRating.setEnabled(false);
		this.setAggregation("_ratingIndicator", this._oRating, true);
		// The decision on whether the rating count is an sap.m.Link or an
		// sap.m.Text can
		// only be made once we know if a press handler is provided
		this._oRatingCountLink = new sap.m.Link(this.getId() + "-ratingCountLink");
		this.setAggregation("_ratingCountLink", this._oRatingCountLink, true);
		this._oRatingCountLabel = new sap.m.Label(this.getId() + "-ratingCountLabel").addStyleClass('sapUiTinyMarginBegin');
		this._oRatingCountLabel.addStyleClass("noColonLabelInForm");
		this.setAggregation("_ratingCountLabel", this._oRatingCountLabel, true);
	};

	RatingAndCount.prototype.onclick = function() {
		if (this.getEnabled() === true) {
			this.firePress({
				source: this._oRatingCountLink
			});
		}
	};

	// Overwriting the setter method is done in order to hand down the values to the
	// inner control in this. The setter method is used by the binding to update the
	// controls value.
	RatingAndCount.prototype.setValue = function(fValue) {
		if (fValue === undefined || fValue === null) {
			fValue = "0";
		}
		fValue = parseFloat(fValue);
		this._oRating.setValue(fValue);
		return this.setProperty("value", fValue, true);
	};

	// Overwriting the setter method is done in order to hand down the values to the
	// inner control in this. The setter method is used by the binding to update the
	// controls value.
	RatingAndCount.prototype.setMaxRatingValue = function(sMaxRatingValue) {
		this._oRating.setMaxValue(sMaxRatingValue);
		return this.setProperty("maxRatingValue", sMaxRatingValue);
	};

	// Overwriting the setter method is done in order to hand down the values to the
	// inner control in this. The setter method is used by the binding to update the
	// controls value.
	RatingAndCount.prototype.setIconSize = function(sIconSize) {
		this._oRating.setIconSize(sIconSize);
		return this.setProperty("iconSize", sIconSize, true);
	};

	// Overwriting the setter method is done in order to hand down the values to the
	// inner control. The setter method is used by the binding to update the
	// controls value.
	// Note that in this case potentially two controls may be affected.
	RatingAndCount.prototype.setRatingCount = function(sRatingCount) {
		if (sRatingCount === null) {
			sRatingCount = 0;
		}

		this._oRatingCountLabel.setText("(" + sRatingCount + ")");
		this._oRatingCountLink.setText("(" + sRatingCount + ")");
		return this.setProperty("ratingCount", sRatingCount);
	};

	return RatingAndCount;
});
