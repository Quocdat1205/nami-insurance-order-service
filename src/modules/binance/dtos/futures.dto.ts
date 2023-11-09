//   symbol	STRING	YES
// side	ENUM	YES
// positionSide	ENUM	NO	Default BOTH for One-way Mode ; LONG or SHORT for Hedge Mode. It must be sent in Hedge Mode.
// type	ENUM	YES
// timeInForce	ENUM	NO
// quantity	DECIMAL	NO	Cannot be sent with closePosition=true(Close-All)
// reduceOnly	STRING	NO	"true" or "false". default "false". Cannot be sent in Hedge Mode; cannot be sent with closePosition=true
// price	DECIMAL	NO
// newClientOrderId	STRING	NO	A unique id among open orders. Automatically generated if not sent. Can only be string following the rule: ^[\.A-Z\:/a-z0-9_-]{1,36}$
// stopPrice	DECIMAL	NO	Used with STOP/STOP_MARKET or TAKE_PROFIT/TAKE_PROFIT_MARKET orders.
// closePosition	STRING	NO	true, false；Close-All，used with STOP_MARKET or TAKE_PROFIT_MARKET.
// activationPrice	DECIMAL	NO	Used with TRAILING_STOP_MARKET orders, default as the latest price(supporting different workingType)
// callbackRate	DECIMAL	NO	Used with TRAILING_STOP_MARKET orders, min 0.1, max 5 where 1 for 1%
// workingType	ENUM	NO	stopPrice triggered by: "MARK_PRICE", "CONTRACT_PRICE". Default "CONTRACT_PRICE"
// priceProtect
export class FuturesPlaceOrderRequestDTO {
  symbol: string;
  side: string;
  type: string;
  positionSide?: string;
  timeInForce?: string;
  quantity?: number;
  reduceOnly?: string;
  price?: number;
  newClientOrderId?: string;
  stopPrice?: number;
  closePosition?: string;
  activationPrice?: number;
  callbackRate?: number;
  workingType?: string;
  priceProtect?: boolean;
}

//   {
//     "clientOrderId": "testOrder",
//     "cumQty": "0",
//     "cumQuote": "0",
//     "executedQty": "0",
//     "orderId": 22542179,
//     "avgPrice": "0.00000",
//     "origQty": "10",
//     "price": "0",
//     "reduceOnly": false,
//     "side": "BUY",
//     "positionSide": "SHORT",
//     "status": "NEW",
//     "stopPrice": "9300",        // please ignore when order type is TRAILING_STOP_MARKET
//     "closePosition": false,   // if Close-All
//     "symbol": "BTCUSDT",
//     "timeInForce": "GTD",
//     "type": "TRAILING_STOP_MARKET",
//     "origType": "TRAILING_STOP_MARKET",
//     "activatePrice": "9020",    // activation price, only return with TRAILING_STOP_MARKET order
//     "priceRate": "0.3",         // callback rate, only return with TRAILING_STOP_MARKET order
//     "updateTime": 1566818724722,
//     "workingType": "CONTRACT_PRICE",
//     "priceProtect": false,      // if conditional order trigger is protected
//     "priceMatch": "NONE",              //price match mode
//     "selfTradePreventionMode": "NONE", //self trading preventation mode
//     "goodTillDate": 1693207680000      //order pre-set auot cancel time for TIF GTD order
// }
export class FuturesPlaceOrderResponseDTO {
  clientOrderId: string;
  cumQty: string;
  cumQuote: string;
  executedQty: string;
  orderId: number;
  avgPrice: string;
  origQty: string;
  price: string;
  reduceOnly: boolean;
  side: string;
  positionSide: string;
  status: string;
  stopPrice: string;
  closePosition: boolean;
  symbol: string;
  timeInForce: string;
  type: string;
  origType: string;
  activatePrice: string;
  priceRate: string;
  updateTime: number;
  workingType: string;
  priceProtect: boolean;
  priceMatch: string;
  selfTradePreventionMode: string;
  goodTillDate: number;
}
