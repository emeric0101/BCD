sap.ui.define([
	"jquery.sap.global"
	],
	function(jQuery) {
		"use strict";

		/**
		 * RatingAndCount renderer.
		 * @namespace
		 */
		var RatingAndCountRenderer = {};

		/**
		 * Renders the HTML for the given control, using the provided
		 * {@link sap.ui.core.RenderManager}.
		 *
		 * @param {sap.ui.core.RenderManager}
		 *            oRm the RenderManager that can be used for writing to the render
		 *            output buffer
		 * @param {sap.ui.core.Control}
		 *            oControl an object representation of the control that should be
		 *            rendered
		 */
		RatingAndCountRenderer.render = function(oRm, oControl) {
			var oRatingCount = oControl.hasListeners("press")
				? oControl.getAggregation("_ratingCountLink")
				: oControl.getAggregation("_ratingCountLabel");

			// if (oControl.getVerticalAdjustment() && oControl.getVerticalAdjustment() !== 0) {
			// 	oRm.addStyle("-ms-transform", "translateY(" + oControl.getVerticalAdjustment() + "%)");
			// 	oRm.addStyle("-webkit-transform", "translateY(" + oControl.getVerticalAdjustment() + "%)");
			// 	oRm.addStyle("transform", "translateY(" + oControl.getVerticalAdjustment() + "%)");
			// }
			// if (oControl.getVerticalAlignContent()) {
			// 	oRm.addStyle("line-height", oControl.getIconSize());
			// 	oRatingCount.addStyleClass("sapUiRtaTestDemoappControlRatingAndCountVAlign");
			// }

			oRm.addClass('sapUiDemoappsDemokitRtaFreestyleRatingAndCount');

			oRm.write("<div");
			oRm.writeControlData(oControl); // write the Control ID and enable event
			// handling
			oRm.writeStyles();
			oRm.writeClasses();
			oRm.write(">");
			oRm.renderControl(oControl.getAggregation("_ratingIndicator"));
			oRm.renderControl(oRatingCount);
			oRm.write("</div>");
		};
		return RatingAndCountRenderer;
	},
	/* For UI controls the export parameter is yet still necessary, everywhere else do not use it. */
	/* bExport= */
	true
);
