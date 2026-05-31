package setting

var (
	DefaultBishengGateway = "https://gateway.bishengusdt.com/api/coin/payOrder/create"
	BishengEnabled        bool
	BishengGateway        string = DefaultBishengGateway
	BishengMerchant       string
	BishengMd5Key         string
	BishengMinTopUp       int = 1
)
