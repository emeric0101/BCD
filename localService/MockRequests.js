// In mock mode, the mock server intercepts HTTP calls and provides fake output to the
// client without involving a backend system. But special backend logic, such as that
// performed by function imports, is not automatically known to the mock server. To handle
// such cases, the app needs to simulate this backend logic by using standard HTTP requests
// (that are again interpreted by the mock server) as shown below.
// There are two ways to do this:
//  a)  If the mock server does not provide a handler function for a request the app can define
//      its own handler function and add it to the mock server's handler functions. This is the
//      case for function import requests. In this example a list of the app specific handler
//      functions is returned by function Request.getRequests and added to the mock server
//      handlers in Service.init
//  b)  If additional tasks have to be performed before or after a standard mock request
//      handler has run the app can attach call back functions to the respective request. The
//      app can define if the call back is to be performed before or after the mock server's
//      request hanlder
// Please note:
// The usage of synchronous calls is only allowed in this context because the requests are
// handled by a latency-free client-side mock server. In production coding, asynchronous
// calls are mandatory.
sap.ui.define(["sap/ui/base/Object", "sap/ui/core/util/MockServer"], function(Object, MockServer) {
	"use strict";

	return Object.extend("sap.ui.demoapps.rta.freestyle.test.service.Request", {

		constructor: function(oMockServer) {
			this._sTestUser = "TestUser";
			this._srvUrl = "/sap/opu/odata/sap/SEPMRA_PROD_MAN/"; //service url
			this._iLastId = 0;
			this._oMockServer = oMockServer;
			this._initRequestCallbacks();
		},

		_initRequestCallbacks: function() {
			this._oMockServer.attachAfter(MockServer.HTTPMETHOD.POST, this.onAddProduct.bind(this), "SEPMRA_C_PD_Product");
			this._oMockServer.attachAfter(MockServer.HTTPMETHOD.DELETE, this.onDeleteProduct.bind(this), "SEPMRA_C_PD_Product");
		},

		getRequests: function() {
			// This method is called by the webIDE if the app is started in mock mode with the
			// option "AddCusom Mock Requests". It returns the list of app specific mock requests.
			// The list is added to the mock server's own list of requests
			return [
				this._mockActivateProduct(),
				this._mockEditProduct(),
				this._mockCopyProduct()
			];
		},

		onDeleteProduct: function(oEvt) {

		},

		onAddProduct: function(oEvt) {
			// This mock request is called when a new Pproduct is created created by clicking 'Add' and when a product is edited.
			// Newly created products do not contain all necessary data. The missing data is added by this function
			var sNewProductId = "EPM-" + this._getNewId();
			jQuery.extend(oEvt.getParameter("oEntity"), {
				"Weight": "0.000",
				"WeightUnit": "KGM",
				"OriginalLanguage": "EN",
				"IsActiveEntity": false,
				"HasActiveEntity": false,
				"HasDraftEntity": false,
				//"ProductDraftUUID": "00505691-2EC5-1ED5-B19F-504E2115A825",
				"ActiveProduct": "",
				"ActiveProduct_Text": "",
				"Product": sNewProductId, //"EPM-000260"
				"ProductCategory": "",
				"Price": "0.00",
				"Currency": "USD", //"EUR",
				"Height": "0.00",
				"Width": "0.00",
				"Depth": "0.00",
				"DimensionUnit": "M",
				"ProductPictureURL": "",
				"Supplier": "",
				"ProductBaseUnit": "EA"
			});
			//Fix the bug
			this._fixRemoveActiveProductValue(oEvt.getParameter("oEntity"));
			//
			this._createDraftAdminData(oEvt.getParameter("oEntity").ProductDraftUUID);
			this._createProductStock(sNewProductId);
			this._createProductText(oEvt.getParameter("oEntity").ProductDraftUUID);
		},

		_fixRemoveActiveProductValue: function(oNewProduct) {
			//fix the issue: remove the ActiveProduct value for the new Product (oNewProduct is reference to the caller object)
			oNewProduct.__metadata.id = oNewProduct.__metadata.id.replace(/ActiveProduct='(.*)'/, "ActiveProduct=''");
			oNewProduct.__metadata.uri = oNewProduct.__metadata.uri.replace(/ActiveProduct='(.*)'/, "ActiveProduct=''");
			for (var prop in oNewProduct) {
				if (oNewProduct[prop] && oNewProduct[prop].__deferred && oNewProduct[prop].__deferred.uri) {
					oNewProduct[prop].__deferred.uri = oNewProduct[prop].__deferred.uri.replace(/ActiveProduct='(.*)'/, "ActiveProduct=''");
				}
			}
		},

		_mockEditProduct: function() {
			return {
				// This mock request simulates the function import "EditProduct", which is triggered when the user chooses the
				// "Edit" button.
				method: "POST",
				path: new RegExp("SEPMRA_C_PD_ProductEdit\\?ProductDraftUUID=guid'(.*)'&ActiveProduct='(.*)'"),
				response: jQuery.proxy(function(oXhr, sDraftUUID, sActiveProduct) {
					//this._createDraft(oXhr,	this._getProdIdFromUrlParam(sActiveProduct), false);
				}, this)
			};
		},

		_mockCopyProduct: function() {
			return {
				// This mock request simulates the function import "CopyProduct", which is triggered when the user chooses the
				// "Copy" button.
				method: "POST",
				path: new RegExp("SEPMRA_C_PD_ProductCopy\\?ProductDraftUUID=guid'(.*)'&ActiveProduct='(.*)'"),
				response: jQuery.proxy(function(oXhr, sDraftID, sActiveProduct) {
					this._createDraft(oXhr, this._getProdIdFromUrlParam(
						sActiveProduct), true);
				}, this)
			};
		},

		_mockActivateProduct: function() {
			return {
				// This mock request simulates the function import "ActivateProduct", which is triggered when the user chooses
				// the "Save" button.
				// Here the draft's data is used to update an existing product (if the draft was created by editing a product)
				// or the draft is used to created a new product (if the draft was created by copying a product)
				method: "POST",
				path: new RegExp("SEPMRA_C_PD_ProductActivation\\?ProductUUID=(.*)"),
				response: function(oXhr, sUrlParams) {
					var sDraftUUID = this._getProdIdFromUrlParam(sUrlParams),
						oProduct = null;

					sDraftUUID = sDraftUUID.substring(5, sDraftUUID.length - 1);
					oProduct = this._buildProductFromDraft(sDraftUUID);

					oXhr.respondJSON(200, {}, JSON.stringify({
						d: oProduct
					}));

					return true;
				}.bind(this)

			};
		},

		_buildProductFromDraft: function(sDraftUUID) {
			// create a product object based on a draft
			// In case the draft was created to add a new product the existing draft object is converted to a product by setting
			// the appropriate attribute values. If the draft was created to edit an existing product then the drafts values are
			// copied to the existing product and the draft is deleted
		},

		_getProdIdFromUrlParam: function(sUrlParams) {
			// Extracts product ID from the URL parameters
			var sParams = decodeURIComponent(sUrlParams);
			//return sParams.substring(1, sParams.length - 1);
			return sParams;
		},

		_getNewId: function() {
			this._iLastId++;
			return this._iLastId.toString();
		},

		_getNewUUID: function() {
			return "aaaaaaaa-bbbb-cccc-dddd-" + this._getNewId();
		},

		_copyProductText: function(sProductUUID, sProductDraftUUID, bNewProduct, sActiveProduct) {
			var
				aDraftProductTexts = this._oMockServer.getEntitySetData("SEPMRA_C_PD_ProductText"),
				// Get product details - the data is used to pre-fill the draft fields
				oOriginalProductText = this._findFirst("ActiveProduct", sProductUUID, aDraftProductTexts),
				oDraftProductText = {},
				sDraftPath, sOriginalPath;

			jQuery.extend(oDraftProductText, oOriginalProductText);
			oDraftProductText.ProductTextDraftUUID = this._getNewUUID();
			oDraftProductText.ProductDraftUUID = sProductDraftUUID;
			oDraftProductText.IsActiveEntity = false;
			oDraftProductText.HasDraftEntity = false;

			if (bNewProduct) {
				oDraftProductText.ActiveProduct = "";
				oDraftProductText.HasActiveEntity = false;
				oDraftProductText.SiblingEntity = {};
			} else {
				// the product text is being edited -
				oDraftProductText.HasActiveEntity = true;
				//set the HasDraftEntity property of the original product to true
				oOriginalProductText.HasDraftEntity = true;
				//TODO
				oDraftProductText.SiblingEntity = {};
			}
			sDraftPath = this._srvUrl + "SEPMRA_C_PD_ProductText(ProductTextDraftUUID=guid'" + oDraftProductText.ProductTextDraftUUID +
				"',ActiveProduct='" + sActiveProduct + "',ActiveLanguage='EN')";
			//updates the draft association paths
			sOriginalPath = oOriginalProductText.__metadata.uri;
			oDraftProductText.__metadata = {
				"id": sDraftPath,
				"type": "SEPMRA_PROD_MAN.SEPMRA_C_PD_ProductTextType",
				"uri": sDraftPath
			};
			for (var prop in oDraftProductText) {
				if (oDraftProductText[prop] && oDraftProductText[prop].__deferred && oDraftProductText[prop].__deferred.uri) {
					oDraftProductText[prop].__deferred.uri = oDraftProductText[prop].__deferred.uri.replace(sOriginalPath, sDraftPath);
				}
			}
			aDraftProductTexts.push(oDraftProductText);
			this._oMockServer.setEntitySetData("SEPMRA_C_PD_ProductText", aDraftProductTexts);

			//create new entry into the DraftAdministrativeData
			this._createDraftAdminData(oDraftProductText.ProductTextDraftUUID);
		},

		_createDraftAdminData: function(oDraftUUID) {
			var aDraftAdminData = this._oMockServer.getEntitySetData("I_DraftAdministrativeData");
			var iNow = (new Date()).getTime();
			//creates entry in I_DraftAdministrativeData
			aDraftAdminData.push({
				DraftUUID: oDraftUUID,
				DraftEntityType: "SEPMRA_I_PRODUCTWITHDRAFT",
				CreationDateTime: "\/Date(" + iNow + "+0000)\/",
				CreatedByUser: this._sTestUser,
				LastChangeDateTime: "\/Date(" + iNow + "+0000)\/",
				LastChangedByUser: this._sTestUser,
				DraftAccessType: "",
				ProcessingStartDateTime: "\/Date(" + iNow + "+0000)\/",
				InProcessByUser: "", //this._sTestUser,
				DraftIsKeptByUser: false,
				EnqueueStartDateTime: "0.0000000",
				DraftIsCreatedByMe: true,
				DraftIsLastChangedByMe: true,
				DraftIsProcessedByMe: false,
				CreatedByUserDescription: "",
				LastChangedByUserDescription: "",
				InProcessByUserDescription: "",
				__metadata: {
					"id": "/sap/opu/odata/sap/SEPMRA_PROD_MAN/I_DraftAdministrativeData(guid'" + oDraftUUID + "')",
					"type": "SEPMRA_PROD_MAN.I_DraftAdministrativeDataType",
					"uri": "/sap/opu/odata/sap/SEPMRA_PROD_MAN/I_DraftAdministrativeData(guid'" + oDraftUUID + "')"
				}
			});
			this._oMockServer.setEntitySetData("I_DraftAdministrativeData", aDraftAdminData);
		},

		_createProductStock: function(oProductId) {
			var aProductStocks = this._oMockServer.getEntitySetData("SEPMRA_C_PD_ProductStock");
			aProductStocks.push({
				Product: oProductId,
				Quantity: "0",
				QuantityUnit: "EA",
				StockAvailability: 1,
				__metadata: {
					"id": "/sap/opu/odata/sap/SEPMRA_PROD_MAN/SEPMRA_C_PD_ProductStock('" + oProductId + "')",
					"type": "SEPMRA_PROD_MAN.SEPMRA_C_PD_ProductStockType",
					"uri": "/sap/opu/odata/sap/SEPMRA_PROD_MAN/SEPMRA_C_PD_ProductStock('" + oProductId + "')"
				},
				to_StockAvailability: {
					"__deferred": {
						"uri": "/sap/opu/odata/sap/SEPMRA_PROD_MAN/SEPMRA_C_PD_ProductStock('" + oProductId + "')/to_StockAvailability"
					}
				}
			});
			this._oMockServer.setEntitySetData("SEPMRA_C_PD_ProductStock", aProductStocks);
		},

		_createProductText: function(oDraftUUID) {
			var aProductTexts = this._oMockServer.getEntitySetData("SEPMRA_C_PD_ProductText");
			aProductTexts.push({
				ProductTextDraftUUID: oDraftUUID,
				ActiveProduct: "",
				ActiveLanguage: "",
				Language: "EN",
				Name: "",
				Description: "",
				IsActiveEntity: false,
				HasActiveEntity: false,
				HasDraftEntity: false,
				__metadata: {
					"id": "/sap/opu/odata/sap/SEPMRA_PROD_MAN/SEPMRA_C_PD_ProductText(ProductTextDraftUUID=guid'" + oDraftUUID +
						"',ActiveProduct='',ActiveLanguage='')",
					"type": "SEPMRA_PROD_MAN.SEPMRA_C_PD_ProductTextType",
					"uri": "/sap/opu/odata/sap/SEPMRA_PROD_MAN/SEPMRA_C_PD_ProductText(ProductTextDraftUUID=guid'" + oDraftUUID +
						"',ActiveProduct='',ActiveLanguage='')"
				}
			});
			this._oMockServer.setEntitySetData("SEPMRA_C_PD_ProductText", aProductTexts);
		},

		_createDraft: function(oXhr, sProductUUID, bNewProduct) {
			var
				aProducts = this._oMockServer.getEntitySetData("SEPMRA_C_PD_Product"),
				// Get product details - the data is used to pre-fill the draft fields
				oOriginalProduct = this._findFirst("ActiveProduct", sProductUUID, aProducts),
				oDraft = {},
				sDraftPath, sOriginalPath;

			// Writes the product data to the draft
			// Most of the values for the draft can be copied from the product
			jQuery.extend(oDraft, oOriginalProduct);
			oDraft.CreatedByUser = this._sTestUser;
			oDraft.ProductDraftUUID = this._getNewUUID();
			oDraft.IsActiveEntity = false;
			oDraft.HasDraftEntity = false;

			if (bNewProduct) {
				// A new product is created as a copy of an existing one
				oDraft.Product = "EPM-" + this._getNewId();
				oDraft.ActiveProduct = "";
				oDraft.HasActiveEntity = false;
				//updates the metadata
				sDraftPath = this._srvUrl + "SEPMRA_C_PD_Product(ProductDraftUUID=guid'" + oDraft.ProductDraftUUID + "',ActiveProduct='')";
				//to check:

				oDraft.SiblingEntity = {};
			} else {
				// A product is edited -
				oDraft.HasActiveEntity = true;
				sDraftPath = this._srvUrl + "SEPMRA_C_PD_Product(ProductDraftUUID=guid'" + oDraft.ProductDraftUUID + "',ActiveProduct='" + oDraft.ActiveProduct +
					"')";
				//set the HasDraftEntity property of the original product to true
				oOriginalProduct.HasDraftEntity = true;
				//to check:
				oDraft.SiblingEntity = {};
			}

			//updates the draft association paths
			sOriginalPath = oOriginalProduct.__metadata.uri;
			oDraft.__metadata = {
				"id": sDraftPath,
				"type": "SEPMRA_PROD_MAN.SEPMRA_C_PD_ProductType",
				"uri": sDraftPath
			};
			for (var prop in oDraft) {
				if (oDraft[prop] && oDraft[prop].__deferred && oDraft[prop].__deferred.uri) {
					oDraft[prop].__deferred.uri = oDraft[prop].__deferred.uri.replace(sOriginalPath, sDraftPath);
				}
			}

			aProducts.push(oDraft);
			this._oMockServer.setEntitySetData("SEPMRA_C_PD_Product", aProducts);

			//create new entry in the product text collection, copy content from the original one
			this._copyProductText(sProductUUID, oDraft.ProductDraftUUID, bNewProduct, oDraft.ActiveProduct);
			//create new entry into the DraftAdministrativeData
			this._createDraftAdminData(oDraft.ProductDraftUUID);

			oXhr.respondJSON(200, {}, JSON.stringify({
				d: oDraft
			}));
			return true;
		},

		_findFirst: function(sAttribute, searchValue, aSearchList) {
			// Searches in an array of objects for a given attribute value and returns the first match.
			var aMatches = this._find(sAttribute, searchValue, aSearchList, true);
			if (aMatches.length > 0) {
				return aMatches[0];
			}
			return null;
		},

		_find: function(sAttribute, searchValue, aSearchList, bLeaveEarly) {
			// Searches in an array of objects for a given attribute value and returns all matching objecsts in an array.
			// If bLeaveEarly is set to true only the first match will be returned
			var aResult = [];
			for (var i = 0; i < aSearchList.length; i++) {
				if (aSearchList[i][sAttribute] === searchValue) {
					aResult.push(aSearchList[i]);
				}
				if (aResult.length === 1 && bLeaveEarly) {
					break;
				}
			}
			return aResult;
		}
	});
});
