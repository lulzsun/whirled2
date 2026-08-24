package utils

import (
	"database/sql"
	"errors"
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Economy constants and wallet/ledger helpers.
// Spec: docs/specs/shop-currency.md

// Currency denominations (transactions.currency)
const (
	CurrencyCoins = iota
)

// Transaction types (transactions.type)
// Append-only: values are persisted in the ledger, never renumber.
const (
	TxUnknown = iota
	TxSignupGrant
	TxDailyBonus
	TxPurchaseSpend
	TxSaleIncome
	TxAdminAdjust
	TxGameReward // reserved (spec §3)
	TxTradeIn    // reserved (spec §3)
	TxTradeOut   // reserved (spec §3)
)

// Tunable faucet amounts (spec §4)
const (
	SignupGrantCoins = 1000
	DailyBonusCoins  = 100
)

var ErrInsufficientCoins = errors.New("insufficient coins")

// AdjustCoins applies a signed coin delta to a user's wallet and appends the
// matching ledger row, atomically. The debit guard lives inside the UPDATE
// (`coins + amount >= 0`) so concurrent spends can never drive a balance
// negative; zero rows affected means insufficient funds (or no wallet) and
// nothing is written. Returns the balance after the adjustment.
func AdjustCoins(app core.App, userId string, amount int64, txType int, refId string, note string) (int64, error) {
	var balance int64
	if amount == 0 {
		// zero-amount ledger entries are noise (spec §6)
		err := app.DB().
			NewQuery(`SELECT coins FROM wallets WHERE user_id = {:user}`).
			Bind(dbx.Params{"user": userId}).Row(&balance)
		return balance, err
	}
	err := app.RunInTransaction(func(txApp core.App) error {
		res, err := txApp.DB().
			NewQuery(`
				UPDATE wallets
				SET coins = coins + {:amount}, updated = {:now}
				WHERE user_id = {:user} AND coins + {:amount} >= 0
			`).
			Bind(dbx.Params{
				"amount": amount,
				"user":   userId,
				"now":    types.NowDateTime().String(),
			}).Execute()
		if err != nil {
			return err
		}
		affected, err := res.RowsAffected()
		if err != nil {
			return err
		}
		if affected == 0 {
			return ErrInsufficientCoins
		}
		if err := txApp.DB().
			NewQuery(`SELECT coins FROM wallets WHERE user_id = {:user}`).
			Bind(dbx.Params{"user": userId}).Row(&balance); err != nil {
			return err
		}

		collection, err := txApp.FindCollectionByNameOrId("transactions")
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Load(map[string]any{
			"user_id":  userId,
			"amount":   amount,
			"balance":  balance,
			"currency": CurrencyCoins,
			"type":     txType,
			"ref_id":   refId,
			"note":     note,
		})
		return txApp.Save(record)
	})
	return balance, err
}

// EnsureWallet creates the user's wallet if it does not exist yet and applies
// the one-time signup grant. Reports whether a wallet was created.
func EnsureWallet(app core.App, userId string) (bool, error) {
	_, err := app.FindFirstRecordByFilter(
		"wallets",
		"user_id = {:user}",
		dbx.Params{"user": userId},
	)
	if err == nil {
		return false, nil
	}
	err = app.RunInTransaction(func(txApp core.App) error {
		collection, err := txApp.FindCollectionByNameOrId("wallets")
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Load(map[string]any{
			"user_id": userId,
			"coins":   0,
		})
		if err := txApp.Save(record); err != nil {
			return err
		}
		_, err = AdjustCoins(txApp, userId, SignupGrantCoins, TxSignupGrant, "", "signup grant")
		return err
	})
	return err == nil, err
}

// GetCoins returns the user's coin balance, or 0 when no wallet exists.
func GetCoins(app core.App, userId string) int64 {
	var coins int64
	err := app.DB().
		NewQuery(`SELECT coins FROM wallets WHERE user_id = {:user}`).
		Bind(dbx.Params{"user": userId}).Row(&coins)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		log.Println(err)
	}
	return coins
}
