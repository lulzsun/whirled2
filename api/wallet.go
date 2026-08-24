package api

import (
	"log"
	"strconv"
	"strings"
	"text/template"
	"whirled2/utils"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const walletPageSize = 20

var walletTmplFiles []string
var walletTmpl *template.Template

// human labels for the utils.Tx* ledger enum
var txTypeLabels = map[int]string{
	utils.TxUnknown:       "Adjustment",
	utils.TxSignupGrant:   "Signup grant",
	utils.TxDailyBonus:    "Daily bonus",
	utils.TxPurchaseSpend: "Purchase",
	utils.TxSaleIncome:    "Sale",
	utils.TxAdminAdjust:   "Adjustment",
	utils.TxGameReward:    "Game reward",
	utils.TxTradeIn:       "Trade",
	utils.TxTradeOut:      "Trade",
	utils.TxListingFee:    "Listing fee",
}

type WalletTx struct {
	Amount  int64  `db:"amount" json:"amount"`
	Balance int64  `db:"balance" json:"balance"`
	Type    int    `db:"type" json:"type"`
	Note    string `db:"note" json:"note"`
	Created string `db:"created" json:"created"`

	// filled in Go for the template; the signed amount is prerendered so
	// the template stays free of whitespace-sensitive sign logic
	TypeLabel   string
	AmountLabel string
}

func init() {
	walletTmplFiles = append(walletTmplFiles, AppendToBaseTmplFiles(
		"web/templates/pages/wallet.gohtml",
	)...)
	walletTmpl = template.Must(template.ParseFiles(walletTmplFiles...))
}

// DailyBonusMiddleware credits the daily login bonus on the first authed
// page load of the (UTC) day (spec §9). Static/api/admin requests are
// filtered out so the check runs roughly once per page render; the check
// itself is a single indexed SELECT unless a grant is actually due.
func DailyBonusMiddleware(e *core.RequestEvent) error {
	path := e.Request.URL.Path
	if e.Auth != nil && e.Auth.Collection().Name == "users" &&
		!strings.HasPrefix(path, "/api") &&
		!strings.HasPrefix(path, "/_") &&
		!strings.HasPrefix(path, "/static") {
		if _, err := utils.GrantDailyBonus(e.App, e.Auth.Id); err != nil {
			log.Println(err)
		}
	}
	return e.Next()
}

func AddWalletRoutes(se *core.ServeEvent, app *pocketbase.PocketBase) {
	se.Router.GET("/wallet", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			e.Redirect(302, "/login")
			return nil
		}
		userId := info.Auth.Id

		page, _ := strconv.Atoi(e.Request.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}

		data := struct {
			Page  int
			Pages []int
			Items []WalletTx
		}{Page: page}

		var total int
		err := app.DB().
			NewQuery(`SELECT COUNT(*) FROM transactions WHERE user_id = {:user}`).
			Bind(dbx.Params{"user": userId}).Row(&total)
		if err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		totalPages := (total + walletPageSize - 1) / walletPageSize
		if totalPages > 1 {
			if page > totalPages {
				page = totalPages
				data.Page = page
			}
			for i := 1; i <= totalPages; i++ {
				data.Pages = append(data.Pages, i)
			}
		}

		items := []WalletTx{}
		err = app.DB().
			NewQuery(`
			SELECT amount, balance, type, note, created
			FROM transactions
			WHERE user_id = {:user}
			ORDER BY created DESC, id DESC
			LIMIT {:limit} OFFSET {:offset}
		`).
			Bind(dbx.Params{
				"user":   userId,
				"limit":  walletPageSize,
				"offset": (page - 1) * walletPageSize,
			}).All(&items)
		if err != nil {
			log.Println(err)
		} else {
			for i := range items {
				items[i].TypeLabel = txTypeLabels[items[i].Type]
				if items[i].TypeLabel == "" {
					items[i].TypeLabel = "Adjustment"
				}
				items[i].AmountLabel = strconv.FormatInt(items[i].Amount, 10)
				if items[i].Amount > 0 {
					items[i].AmountLabel = "+" + items[i].AmountLabel
				}
				// "2006-01-02 15:04:05.000Z" -> "2006-01-02 15:04"
				if len(items[i].Created) > 16 {
					items[i].Created = items[i].Created[:16]
				}
			}
			data.Items = items
		}

		if err := walletTmpl.ExecuteTemplate(e.Response, e.Get("name").(string), AppendToBaseData(e, data)); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
	se.Router.GET("/wallet/balance", func(e *core.RequestEvent) error {
		info, _ := e.RequestInfo()
		if info.Auth == nil {
			return apis.NewForbiddenError("Not logged in.", nil)
		}
		data := struct {
			AuthCoins int64
		}{AuthCoins: utils.GetCoins(app, info.Auth.Id)}
		if err := walletTmpl.ExecuteTemplate(e.Response, "coinBalance", data); err != nil {
			log.Println(err)
			return apis.NewBadRequestError("Something went wrong.", err)
		}
		return nil
	})
}
