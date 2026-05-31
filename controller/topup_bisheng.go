package controller

import (
	"bytes"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

const (
	bishengVersion           = "6.0.0"
	bishengPayOrderCreateAPI = "/api/coin/payOrder/create"
)

type BishengPayRequest struct {
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"payment_method"`
}

type bishengCreateResponse struct {
	Code                 flexibleString `json:"code"`
	Msg                  string         `json:"msg"`
	Message              string         `json:"message"`
	MerchantOrderNo      string         `json:"merchantOrderNo"`
	CoinType             string         `json:"coinType"`
	PayCoinAmount        string         `json:"payCoinAmount"`
	BookingAddress       string         `json:"bookingAddress"`
	ExchangeRate         string         `json:"exchangeRate"`
	OrderNo              string         `json:"orderNo"`
	OrderExpireDate      string         `json:"orderExpireDate"`
	CallbackCurrencyCode string         `json:"callbackCurrencyCode"`
	Sign                 string         `json:"sign"`
}

type flexibleString string

func (s *flexibleString) UnmarshalJSON(data []byte) error {
	var value interface{}
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	switch v := value.(type) {
	case string:
		*s = flexibleString(v)
	case float64:
		*s = flexibleString(strconv.FormatFloat(v, 'f', -1, 64))
	case nil:
		*s = ""
	default:
		*s = flexibleString(fmt.Sprintf("%v", v))
	}
	return nil
}

func isBishengPaymentMethod(paymentMethod string) bool {
	switch paymentMethod {
	case model.PaymentMethodBishengTRC20, model.PaymentMethodBishengBEP20, model.PaymentMethodBishengERC20:
		return true
	default:
		return false
	}
}

func bishengCoinType(paymentMethod string) string {
	switch paymentMethod {
	case model.PaymentMethodBishengBEP20:
		return "USDT_BEP20"
	case model.PaymentMethodBishengERC20:
		return "USDT_ERC20"
	default:
		return "USDT_TRC20"
	}
}

func getBishengPayMoney(amount int64, group string) decimal.Decimal {
	dAmount := decimal.NewFromInt(amount)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dAmount = dAmount.Div(decimal.NewFromFloat(common.QuotaPerUnit))
	}

	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}

	discount := 1.0
	if ds, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok && ds > 0 {
		discount = ds
	}

	return dAmount.
		Mul(decimal.NewFromFloat(topupGroupRatio)).
		Mul(decimal.NewFromFloat(discount)).
		Round(2)
}

func normalizeTopUpAmount(amount int64) int64 {
	if operation_setting.GetQuotaDisplayType() != operation_setting.QuotaDisplayTypeTokens {
		return amount
	}
	return decimal.NewFromInt(amount).Div(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart()
}

func bishengCreateOrderURL() string {
	gateway := strings.TrimRight(strings.TrimSpace(setting.BishengGateway), "/")
	if gateway == "" {
		gateway = strings.TrimRight(setting.DefaultBishengGateway, "/")
	}
	if strings.HasSuffix(gateway, bishengPayOrderCreateAPI) {
		return gateway
	}
	return gateway + bishengPayOrderCreateAPI
}

func bishengSignData(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for key, value := range params {
		if key == "sign" || strings.TrimSpace(value) == "" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys)+1)
	for _, key := range keys {
		parts = append(parts, key+"="+strings.TrimSpace(params[key]))
	}
	return strings.Join(parts, "&")
}

func bishengSign(params map[string]string) string {
	signData := bishengSignData(params)
	sum := md5.Sum([]byte(signData + "&key=" + strings.TrimSpace(setting.BishengMd5Key)))
	return hex.EncodeToString(sum[:])
}

func verifyBishengSign(params map[string]string) bool {
	sign := strings.ToLower(strings.TrimSpace(params["sign"]))
	if sign == "" || strings.TrimSpace(setting.BishengMd5Key) == "" {
		return false
	}
	return sign == bishengSign(params)
}

func parseBishengPayCoinAmount(params map[string]string) (decimal.Decimal, error) {
	payCoinAmountText := strings.TrimSpace(params["payCoinAmount"])
	if payCoinAmountText == "" {
		return decimal.Zero, fmt.Errorf("payCoinAmount is empty")
	}

	payCoinAmount, err := decimal.NewFromString(payCoinAmountText)
	if err != nil {
		return decimal.Zero, err
	}
	if payCoinAmount.LessThanOrEqual(decimal.Zero) {
		return decimal.Zero, fmt.Errorf("payCoinAmount must be greater than zero")
	}
	return payCoinAmount, nil
}

func RequestBishengAmount(c *gin.Context) {
	var req AmountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	minTopUp := int64(setting.BishengMinTopUp)
	if minTopUp <= 0 {
		minTopUp = 1
	}
	if req.Amount < minTopUp {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", minTopUp)})
		return
	}
	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getBishengPayMoney(req.Amount, group)
	if payMoney.LessThan(decimal.NewFromFloat(0.01)) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": payMoney.StringFixed(2)})
}

func RequestBishengPay(c *gin.Context) {
	var req BishengPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if !isBishengTopUpEnabled() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "当前管理员未配置 Bisheng USDT 支付信息"})
		return
	}
	if !isBishengPaymentMethod(req.PaymentMethod) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付方式不存在"})
		return
	}
	minTopUp := int64(setting.BishengMinTopUp)
	if minTopUp <= 0 {
		minTopUp = 1
	}
	if req.Amount < minTopUp {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", minTopUp)})
		return
	}

	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getBishengPayMoney(req.Amount, group)
	if payMoney.LessThan(decimal.NewFromFloat(0.01)) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	tradeNo := fmt.Sprintf("BS%s%s", time.Now().Format("060102150405"), common.GetRandomString(6))
	notifyUrl := service.GetCallbackAddress() + "/api/user/bisheng/notify"
	params := map[string]string{
		"merchantId":           strings.TrimSpace(setting.BishengMerchant),
		"version":              bishengVersion,
		"merchantOrderNo":      tradeNo,
		"amount":               payMoney.StringFixed(2),
		"coinType":             bishengCoinType(req.PaymentMethod),
		"callbackCurrencyCode": "USDT",
		"notifyUrl":            notifyUrl,
		"signType":             "MD5",
	}
	params["sign"] = bishengSign(params)
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("Bisheng USDT 签名前字符串 user_id=%d trade_no=%s sign_data=%q sign=%s", id, tradeNo, bishengSignData(params), params["sign"]))

	body, _ := json.Marshal(params)
	client := &http.Client{Timeout: 15 * time.Second}
	createOrderURL := bishengCreateOrderURL()
	resp, err := client.Post(createOrderURL, "application/json", bytes.NewReader(body))
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Bisheng USDT 拉起支付失败 user_id=%d trade_no=%s payment_method=%s amount=%d url=%s error=%q", id, tradeNo, req.PaymentMethod, req.Amount, createOrderURL, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var createResp bishengCreateResponse
	if err := json.Unmarshal(respBody, &createResp); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Bisheng USDT 响应解析失败 user_id=%d trade_no=%s status=%d body=%q error=%q", id, tradeNo, resp.StatusCode, string(respBody), err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付响应解析失败"})
		return
	}
	if string(createResp.Code) != "0" {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("Bisheng USDT 创建订单失败 user_id=%d trade_no=%s status=%d response=%q", id, tradeNo, resp.StatusCode, string(respBody)))
		errorMessage := createResp.Msg
		if errorMessage == "" {
			errorMessage = createResp.Message
		}
		if errorMessage == "" {
			errorMessage = "创建订单失败"
		}
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": errorMessage})
		return
	}
	if createResp.BookingAddress == "" || createResp.PayCoinAmount == "" {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("Bisheng USDT 创建订单响应缺少地址或金额 user_id=%d trade_no=%s response=%q", id, tradeNo, string(respBody)))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付响应缺少收款地址"})
		return
	}

	topUp := &model.TopUp{
		UserId:          id,
		Amount:          normalizeTopUpAmount(req.Amount),
		Money:           payMoney.InexactFloat64(),
		TradeNo:         tradeNo,
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: model.PaymentProviderBisheng,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Bisheng USDT 创建充值订单失败 user_id=%d trade_no=%s payment_method=%s amount=%d error=%q", id, tradeNo, req.PaymentMethod, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("Bisheng USDT 充值订单创建成功 user_id=%d trade_no=%s payment_method=%s amount=%d money=%s order_no=%s", id, tradeNo, req.PaymentMethod, req.Amount, payMoney.StringFixed(2), createResp.OrderNo))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"trade_no":          tradeNo,
			"order_no":          createResp.OrderNo,
			"coin_type":         createResp.CoinType,
			"amount":            createResp.PayCoinAmount,
			"address":           createResp.BookingAddress,
			"expire_time":       createResp.OrderExpireDate,
			"payment_method":    req.PaymentMethod,
			"payment_provider":  model.PaymentProviderBisheng,
			"payment_hint":      "请在20分钟内完成付款。",
			"callback_currency": createResp.CallbackCurrencyCode,
		},
	})
}

func parseBishengNotifyParams(c *gin.Context) map[string]string {
	params := map[string]string{}
	contentType := c.GetHeader("Content-Type")
	if strings.Contains(contentType, "application/json") {
		var raw map[string]interface{}
		if err := c.ShouldBindJSON(&raw); err == nil {
			for key, value := range raw {
				params[key] = fmt.Sprintf("%v", value)
			}
		}
		return params
	}

	_ = c.Request.ParseForm()
	for key := range c.Request.Form {
		params[key] = c.Request.Form.Get(key)
	}
	return params
}

func BishengNotify(c *gin.Context) {
	if !isBishengWebhookEnabled() {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("Bisheng USDT webhook 被拒绝 reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	params := parseBishengNotifyParams(c)
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("Bisheng USDT webhook 收到请求 path=%q client_ip=%s params=%q", c.Request.RequestURI, c.ClientIP(), common.GetJsonString(params)))
	if len(params) == 0 || !verifyBishengSign(params) {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("Bisheng USDT webhook 验签失败 path=%q client_ip=%s params=%q", c.Request.RequestURI, c.ClientIP(), common.GetJsonString(params)))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	tradeNo := params["merchantOrderNo"]
	if params["status"] != "1" {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("Bisheng USDT webhook 忽略事件 trade_no=%s status=%s params=%q", tradeNo, params["status"], common.GetJsonString(params)))
		_, _ = c.Writer.Write([]byte("success"))
		return
	}

	LockOrder(tradeNo)
	defer UnlockOrder(tradeNo)

	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("Bisheng USDT 回调订单不存在 trade_no=%s client_ip=%s", tradeNo, c.ClientIP()))
		_, _ = c.Writer.Write([]byte("success"))
		return
	}
	if topUp.PaymentProvider != model.PaymentProviderBisheng {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("Bisheng USDT 订单支付网关不匹配 trade_no=%s order_provider=%s client_ip=%s", tradeNo, topUp.PaymentProvider, c.ClientIP()))
		_, _ = c.Writer.Write([]byte("success"))
		return
	}
	if topUp.Status != common.TopUpStatusPending {
		_, _ = c.Writer.Write([]byte("success"))
		return
	}

	payCoinAmount, err := parseBishengPayCoinAmount(params)
	if err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("Bisheng USDT webhook 实收金额无效 trade_no=%s payCoinAmount=%q error=%q params=%q", tradeNo, params["payCoinAmount"], err.Error(), common.GetJsonString(params)))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	quotaToAdd := int(payCoinAmount.Mul(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart())
	if quotaToAdd <= 0 {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("Bisheng USDT webhook 实收金额过低 trade_no=%s payCoinAmount=%s quota_to_add=%d", tradeNo, payCoinAmount.String(), quotaToAdd))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	topUp.Status = common.TopUpStatusSuccess
	topUp.CompleteTime = time.Now().Unix()
	topUp.Money = payCoinAmount.InexactFloat64()
	if err := topUp.Update(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Bisheng USDT 更新充值订单失败 trade_no=%s user_id=%d error=%q", topUp.TradeNo, topUp.UserId, err.Error()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	if err := model.IncreaseUserQuota(topUp.UserId, quotaToAdd, true); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("Bisheng USDT 更新用户额度失败 trade_no=%s user_id=%d quota_to_add=%d error=%q", topUp.TradeNo, topUp.UserId, quotaToAdd, err.Error()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("Bisheng USDT 充值成功 trade_no=%s user_id=%d pay_coin_amount=%s quota_to_add=%d", topUp.TradeNo, topUp.UserId, payCoinAmount.StringFixed(2), quotaToAdd))
	model.RecordTopupLog(topUp.UserId, fmt.Sprintf("使用 USDT 充值成功，充值金额: %v，支付金额：%s USDT", logger.LogQuota(quotaToAdd), payCoinAmount.StringFixed(2)), c.ClientIP(), topUp.PaymentMethod, model.PaymentProviderBisheng)
	_, _ = c.Writer.Write([]byte("success"))
}
