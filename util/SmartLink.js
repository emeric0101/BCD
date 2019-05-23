sap.ui.define([
	'sap/ui/base/Object',
	'sap/ui/comp/navpopover/Factory'
], function(BaseObject, Factory) {
	"use strict";

	var Util = BaseObject.extend("sap.ui.rta.test.SmartLink",  {});

	Util.getServiceReal = Factory.getService;

	var mSetting = {

		semanticObjectSupplierId: {
			links: [
				{
					action: "action_addtofavorites",
					intent: "#1",
					text: "Add to Favorites"
				}, {
					action: "action_gotoproducts",
					intent: "#2",
					text: "See other supplier products"
				}, {
					action: "action_gotoreviews",
					intent: "#3",
					text: "Check supplier reviews"
				}
			]
		}
	};

	Util.mockUShellServices = function() {

		Factory.getService = function(sServiceName) {
			switch (sServiceName) {
				case "CrossApplicationNavigation":
					return {
						hrefForExternal: function(oTarget) {
							if (!oTarget || !oTarget.target || !oTarget.target.shellHash) {
								return null;
							}
							return oTarget.target.shellHash;
						},
						getDistinctSemanticObjects: function() {
							var aSemanticObjects = [];
							for ( var sSemanticObject in mSetting) {
								aSemanticObjects.push(sSemanticObject);
							}
							var oDeferred = jQuery.Deferred();
							setTimeout(function() {
								oDeferred.resolve(aSemanticObjects);
							}, 0);
							return oDeferred.promise();
						},
						getLinks: function(aParams) {
							var aLinks = [];
							if (!Array.isArray(aParams)) {
								mSetting[aParams.semanticObject] ? aLinks = mSetting[aParams.semanticObject].links : aLinks = [];
							} else {
								aParams.forEach(function(aParams_) {
									mSetting[aParams_[0].semanticObject] ? aLinks.push([
											mSetting[aParams_[0].semanticObject].links
										]) : aLinks.push([
											[]
										]);
								});
							}
							var oDeferred = jQuery.Deferred();
							setTimeout(function() {
								oDeferred.resolve(aLinks);
							}, 0);
							return oDeferred.promise();
						}
					};
				case "URLParsing":
					return {
						parseShellHash: function(sIntent) {
							var sAction;
							for ( var sSemanticObject in mSetting) {
								mSetting[sSemanticObject].links.some(function(oLink) { // eslint-disable-line no-loop-func
									if (oLink.intent === sIntent) {
										sAction = oLink.action;
										return true;
									}
								});
								if (sAction) {
									return {
										semanticObject: sSemanticObject,
										action: sAction
									};
								}
							}
							return {
								semanticObject: null,
								action: null
							};
						}
					};
				default:
					return Util.getServiceReal(sServiceName);
			}
		};
	};

	Util.unMockUShellServices = function() {
		Factory.getService = Util.getServiceReal;
	};

	return Util;
}, /* bExport= */true);
