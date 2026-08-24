package utils

import (
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Create collections
func Bootstrap(app *pocketbase.PocketBase) {
	// Users collection / table
	/* SQLITE equivalent:
	CREATE TABLE users (
		id TEXT PRIMARY KEY,
		username TEXT NOT NULL,
		passwordHash TEXT NOT NULL,
		email TEXT NOT NULL,
		nickname TEXT NOT NULL,
		birthday DATE NOT NULL,
		created DATE NOT NULL,
		updated DATE NOT NULL
	);
	CREATE UNIQUE INDEX idx_user ON profiles (user_id);
	*/
	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err == nil && usersCollection.Fields.GetByName("birthday") == nil {
		usersCollection.Fields.RemoveByName("name")
		usersCollection.Fields.Add(
			&core.TextField{
				Name:     "nickname",
				Required: false,
				Min:      3,
				Max:      30,
			},
			&core.DateField{
				Name:     "birthday",
				Required: true,
			},
		)

		if err := app.Save(usersCollection); err != nil {
			log.Fatalln(err)
		}
	} else if err != nil {
		return
	}

	// Profiles collection / table
	/* SQLITE equivalent:
	CREATE TABLE profiles (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		created DATE NOT NULL,
		updated DATE NOT NULL,
		FOREIGN KEY (user_id) REFERENCES users (id)
	);
	CREATE UNIQUE INDEX idx_user ON profiles (user_id);
	*/
	profilesCollection, err := app.FindCollectionByNameOrId("profiles")
	if err != nil {
		profilesCollection = core.NewBaseCollection("profiles")
		profilesCollection.ListRule = nil
		profilesCollection.ViewRule = nil
		profilesCollection.CreateRule = nil
		profilesCollection.UpdateRule = nil
		profilesCollection.DeleteRule = nil
		profilesCollection.Fields.Add(
			&core.RelationField{
				Name:          "user_id",
				Required:      true,
				MaxSelect:     1,
				CollectionId:  usersCollection.Id,
				CascadeDelete: true,
			},
		)
		profilesCollection.Indexes = types.JSONArray[string]{
			"CREATE UNIQUE INDEX idx_user ON profiles (user_id)",
		}

		if err := app.Save(profilesCollection); err != nil {
			log.Fatalln(err)
		}
	}

	// Comments collection / table
	/* SQLITE equivalent:
	CREATE TABLE comments (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		profile_id TEXT NOT NULL,
		parent_id TEXT NOT NULL,
		content TEXT NOT NULL,
		is_deleted BOOL,
		FOREIGN KEY (user_id) REFERENCES users (id)
		FOREIGN KEY (profile_id) REFERENCES profiles (id)
	);
	*/
	if _, err := app.FindCollectionByNameOrId("comments"); err != nil {
		commentsCollection := core.NewBaseCollection("comments")
		commentsCollection.ListRule = nil
		commentsCollection.ViewRule = nil
		commentsCollection.CreateRule = types.Pointer("")
		commentsCollection.UpdateRule = nil
		commentsCollection.DeleteRule = nil
		commentsCollection.Fields.Add(
			&core.RelationField{
				Name:          "user_id",
				Required:      false,
				MaxSelect:     1,
				CollectionId:  usersCollection.Id,
				CascadeDelete: false,
			},
			&core.RelationField{
				Name:          "profile_id",
				Required:      true,
				MaxSelect:     1,
				CollectionId:  profilesCollection.Id,
				CascadeDelete: false,
			},
			&core.TextField{
				Name:     "parent_id",
				Required: false,
			},
			&core.TextField{
				Name:     "content",
				Required: true,
				Min:      1,
				Max:      280,
			},
			&core.BoolField{
				Name:     "is_deleted",
				Required: false,
			},
		)

		if err := app.Save(commentsCollection); err != nil {
			log.Fatalln(err)
		}
	}

	// Rooms collection / table
	/* SQLITE equivalent:
	CREATE TABLE rooms (
		id TEXT PRIMARY KEY,
		owner_id TEXT,
		name TEXT,
		description TEXT,
		objects JSONB,
		created DATE NOT NULL,
		updated DATE NOT NULL,
		FOREIGN KEY (owner_id) REFERENCES users (id)
	);
	*/
	if _, err := app.FindCollectionByNameOrId("rooms"); err != nil {
		roomsCollection := core.NewBaseCollection("rooms")
		roomsCollection.ListRule = nil
		roomsCollection.ViewRule = nil
		roomsCollection.CreateRule = nil
		roomsCollection.UpdateRule = nil
		roomsCollection.DeleteRule = nil
		roomsCollection.Fields.Add(
			&core.RelationField{
				Name:          "owner_id",
				Required:      false,
				MaxSelect:     1,
				CollectionId:  usersCollection.Id,
				CascadeDelete: true,
			},
			&core.TextField{
				Name:     "name",
				Required: false,
				Min:      3,
				Max:      30,
			},
			&core.TextField{
				Name:     "description",
				Required: false,
				Min:      1,
				Max:      280,
			},
			&core.BoolField{
				Name:     "is_home",
				Required: false,
			},
			&core.BoolField{
				Name:     "is_featured",
				Required: false,
			},
			&core.JSONField{
				Name:     "objects",
				Required: false,
				MaxSize:  5000000, // 5 MB in bytes
			},
		)

		if err := app.Save(roomsCollection); err != nil {
			log.Fatalln(err)
		}
	}

	// Stuff collection / table
	/* SQLITE equivalent:
	CREATE TABLE stuff (
		id TEXT PRIMARY KEY,
		owner_id TEXT NOT NULL,
		stuff_id TEXT NOT NULL,
		in_use TEXT,
		type INT NOT NULL,
		created DATE NOT NULL,
		updated DATE NOT NULL,
		FOREIGN KEY (owner_id) REFERENCES users (id)
	);
	*/
	if _, err := app.FindCollectionByNameOrId("stuff"); err != nil {
		stuffCollection := core.NewBaseCollection("stuff")
		stuffCollection.ListRule = nil
		stuffCollection.ViewRule = types.Pointer("owner_id = @request.auth.id")
		stuffCollection.CreateRule = nil
		stuffCollection.UpdateRule = nil
		stuffCollection.DeleteRule = types.Pointer("owner_id = @request.auth.id")
		stuffCollection.Fields.Add(
			&core.RelationField{
				Name:          "owner_id",
				Required:      true,
				MaxSelect:     1,
				CollectionId:  usersCollection.Id,
				CascadeDelete: true,
			},
			&core.TextField{
				Name:     "stuff_id",
				Required: true,
			},
			&core.NumberField{
				Name:     "type",
				Required: true,
			},
			&core.TextField{
				Name:     "in_use",
				Required: false,
			},
		)

		if err := app.Save(stuffCollection); err != nil {
			log.Fatalln(err)
		}
	}

	// Wallets collection / table
	// One per user; coin balance is a cache of the transactions ledger.
	// See docs/specs/shop-currency.md §5.1
	/* SQLITE equivalent:
	CREATE TABLE wallets (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		coins INTEGER NOT NULL,
		last_daily DATE,
		created DATE NOT NULL,
		updated DATE NOT NULL,
		FOREIGN KEY (user_id) REFERENCES users (id)
	);
	CREATE UNIQUE INDEX idx_wallet_user ON wallets (user_id);
	*/
	if _, err := app.FindCollectionByNameOrId("wallets"); err != nil {
		walletsCollection := core.NewBaseCollection("wallets")
		walletsCollection.ListRule = nil
		walletsCollection.ViewRule = types.Pointer("user_id = @request.auth.id")
		walletsCollection.CreateRule = nil
		walletsCollection.UpdateRule = nil
		walletsCollection.DeleteRule = nil
		walletsCollection.Fields.Add(
			&core.RelationField{
				Name:          "user_id",
				Required:      true,
				MaxSelect:     1,
				CollectionId:  usersCollection.Id,
				CascadeDelete: true,
			},
			&core.NumberField{
				Name:    "coins",
				OnlyInt: true,
				Min:     types.Pointer(0.0),
			},
			&core.DateField{
				Name: "last_daily",
			},
			&core.AutodateField{
				Name:     "created",
				OnCreate: true,
			},
			&core.AutodateField{
				Name:     "updated",
				OnCreate: true,
				OnUpdate: true,
			},
		)
		walletsCollection.Indexes = types.JSONArray[string]{
			"CREATE UNIQUE INDEX idx_wallet_user ON wallets (user_id)",
		}

		if err := app.Save(walletsCollection); err != nil {
			log.Fatalln(err)
		}
	}

	// Transactions collection / table
	// Append-only coin ledger; rows are never updated or deleted. user_id is
	// deliberately not a relation so history survives account deletion.
	// See docs/specs/shop-currency.md §5.2
	/* SQLITE equivalent:
	CREATE TABLE transactions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		amount INTEGER NOT NULL,
		balance INTEGER NOT NULL,
		currency INTEGER NOT NULL,
		type INTEGER NOT NULL,
		ref_id TEXT,
		note TEXT,
		created DATE NOT NULL
	);
	CREATE INDEX idx_tx_user ON transactions (user_id, created);
	*/
	if _, err := app.FindCollectionByNameOrId("transactions"); err != nil {
		transactionsCollection := core.NewBaseCollection("transactions")
		transactionsCollection.ListRule = nil
		transactionsCollection.ViewRule = nil
		transactionsCollection.CreateRule = nil
		transactionsCollection.UpdateRule = nil
		transactionsCollection.DeleteRule = nil
		transactionsCollection.Fields.Add(
			&core.TextField{
				Name:     "user_id",
				Required: true,
			},
			&core.NumberField{
				Name:     "amount",
				Required: true,
				OnlyInt:  true,
			},
			&core.NumberField{
				Name:    "balance",
				OnlyInt: true,
			},
			&core.NumberField{
				Name:    "currency",
				OnlyInt: true,
			},
			&core.NumberField{
				Name:     "type",
				Required: true,
				OnlyInt:  true,
			},
			&core.TextField{
				Name: "ref_id",
			},
			&core.TextField{
				Name: "note",
			},
			&core.AutodateField{
				Name:     "created",
				OnCreate: true,
			},
		)
		transactionsCollection.Indexes = types.JSONArray[string]{
			"CREATE INDEX idx_tx_user ON transactions (user_id, created)",
		}

		if err := app.Save(transactionsCollection); err != nil {
			log.Fatalln(err)
		}
	}

	// Avatars collection / table
	/* SQLITE equivalent:
	CREATE TABLE furniture (
		id TEXT PRIMARY KEY,
		creator_id TEXT,
		name TEXT,
		description TEXT,
		created DATE NOT NULL,
		updated DATE NOT NULL,
		FOREIGN KEY (creator_id) REFERENCES users (id)
	);
	*/
	avatarsCollection, err := app.FindCollectionByNameOrId("avatars")
	if err != nil {
		avatarsCollection = core.NewBaseCollection("avatars")
		avatarsCollection.ListRule = nil
		avatarsCollection.ViewRule = nil
		avatarsCollection.CreateRule = types.Pointer("@request.auth.id != '' && creator_id = @request.auth.id")
		avatarsCollection.UpdateRule = nil
		avatarsCollection.DeleteRule = nil

		avatarsCollection.Fields.Add(
			&core.RelationField{
				Name:          "creator_id",
				Required:      false,
				MaxSelect:     1,
				CollectionId:  usersCollection.Id,
				CascadeDelete: true,
			},
			&core.TextField{
				Name:     "name",
				Required: false,
				Min:      3,
				Max:      30,
			},
			&core.TextField{
				Name:     "description",
				Required: false,
				Min:      1,
				Max:      280,
			},
			&core.FileField{
				Name:     "thumb",
				Required: false,
				MimeTypes: []string{
					"image/jpeg",
					"image/png",
					"image/gif",
					"image/bmp",
					"image/webp",
				},
				MaxSelect: 1,
				Thumbs: []string{
					"420x420",
				},
				MaxSize:   1000000, // 1 MB in bytes
				Protected: false,
			},
			&core.FileField{
				Name:      "file",
				Required:  true,
				MaxSelect: 1,
				MaxSize:   50000000, // 50 MB in bytes
				Protected: false,
			},
			&core.NumberField{
				Name:     "scale",
				Required: false,
				Min:      types.Pointer(0.001),
				Max:      types.Pointer(100.0),
			},
		)

		if err := app.Save(avatarsCollection); err != nil {
			log.Fatalln(err)
		}
	}

	// add some default avatars

	// add guest (ghost)
	record := core.NewRecord(avatarsCollection)
	err = app.RecordQuery("avatars").
		AndWhere(dbx.HashExp{"name": "Ghost"}).
		AndWhere(dbx.HashExp{"creator_id": ""}).
		One(&record)

	if err != nil {
		record.Load(map[string]any{
			"name":        "Ghost",
			"description": "Ghost!",
			"scale":       1,
		})
		file, err := filesystem.NewFileFromPath("./web/static/assets/avatars/guest.swf")
		if err != nil {
			log.Fatalln(err)
		}
		record.Set("file", file)

		if err := app.Save(record); err != nil {
			log.Fatalln(err)
		}
	}

	// add member (tofu)
	record = core.NewRecord(avatarsCollection)
	err = app.RecordQuery("avatars").
		AndWhere(dbx.HashExp{"name": "Tofu"}).
		AndWhere(dbx.HashExp{"creator_id": ""}).
		One(&record)

	if err != nil {
		record.Load(map[string]any{
			"name":        "Tofu",
			"description": "Tofu!",
			"scale":       1,
		})
		file, err := filesystem.NewFileFromPath("./web/static/assets/avatars/member.swf")
		if err != nil {
			log.Fatalln(err)
		}
		record.Set("file", file)

		if err := app.Save(record); err != nil {
			log.Fatalln(err)
		}
	}

	// add robot
	record = core.NewRecord(avatarsCollection)
	err = app.RecordQuery("avatars").
		AndWhere(dbx.HashExp{"name": "Robot"}).
		AndWhere(dbx.HashExp{"creator_id": ""}).
		One(&record)

	if err != nil {
		record.Load(map[string]any{
			"name":        "Robot",
			"description": "Test avatar",
			"scale":       1,
		})
		file, err := filesystem.NewFileFromPath("./web/static/assets/avatars/RobotExpressive.glb")
		if err != nil {
			log.Fatalln(err)
		}
		record.Set("file", file)

		if err := app.Save(record); err != nil {
			log.Fatalln(err)
		}
	}

	// add fox
	record = core.NewRecord(avatarsCollection)
	err = app.RecordQuery("avatars").
		AndWhere(dbx.HashExp{"name": "Fox"}).
		AndWhere(dbx.HashExp{"creator_id": ""}).
		One(&record)

	if err != nil {
		record.Load(map[string]any{
			"name":        "Fox",
			"description": "Test avatar",
			"scale":       0.05,
		})
		file, err := filesystem.NewFileFromPath("./web/static/assets/avatars/Fox.glb")
		if err != nil {
			log.Fatalln(err)
		}
		record.Set("file", file)

		if err := app.Save(record); err != nil {
			log.Fatalln(err)
		}
	}

	// Furniture collection / table
	/* SQLITE equivalent:
	CREATE TABLE furniture (
		id TEXT PRIMARY KEY,
		creator_id TEXT,
		name TEXT,
		description TEXT,
		created DATE NOT NULL,
		updated DATE NOT NULL,
		FOREIGN KEY (creator_id) REFERENCES users (id)
	);
	*/
	furnitureCollection, err := app.FindCollectionByNameOrId("furniture")
	if err != nil {
		furnitureCollection = core.NewBaseCollection("furniture")
		furnitureCollection.ListRule = nil
		furnitureCollection.ViewRule = nil
		furnitureCollection.CreateRule = nil
		furnitureCollection.UpdateRule = nil
		furnitureCollection.DeleteRule = nil
		furnitureCollection.Fields.Add(
			&core.RelationField{
				Name:          "creator_id",
				Required:      false,
				MaxSelect:     1,
				CollectionId:  usersCollection.Id,
				CascadeDelete: true,
			},
			&core.TextField{
				Name:     "name",
				Required: false,
				Min:      3,
				Max:      30,
			},
			&core.TextField{
				Name:     "description",
				Required: false,
				Min:      1,
				Max:      280,
			},
			&core.FileField{
				Name:     "thumb",
				Required: false,
				MimeTypes: []string{
					"image/jpeg",
					"image/png",
					"image/gif",
					"image/bmp",
					"image/webp",
				},
				MaxSelect: 1,
				MaxSize:   5000000, // 5 MB in bytes
				Protected: false,
			},
			&core.FileField{
				Name:      "file",
				Required:  true,
				MaxSelect: 1,
				MaxSize:   50000000, // 50 MB in bytes
				Protected: false,
			},
			&core.NumberField{
				Name:     "scale",
				Required: false,
				Min:      types.Pointer(0.001),
				Max:      types.Pointer(100.0),
			},
		)

		if err := app.Save(furnitureCollection); err != nil {
			log.Fatalln(err)
		}
	}

	// add some default furniture

	// add chair
	record = core.NewRecord(furnitureCollection)
	err = app.RecordQuery("furniture").
		AndWhere(dbx.HashExp{"name": "Chair"}).
		AndWhere(dbx.HashExp{"creator_id": ""}).
		One(&record)

	if err != nil {
		record.Load(map[string]any{
			"name":        "Chair",
			"description": "Test furniture",
			"scale":       5,
		})
		file, err := filesystem.NewFileFromPath("./web/static/assets/furniture/SheenChair.glb")
		if err != nil {
			log.Fatalln(err)
		}
		record.Set("file", file)

		if err := app.Save(record); err != nil {
			log.Fatalln(err)
		}
	}

	// add sofa
	record = core.NewRecord(furnitureCollection)
	err = app.RecordQuery("furniture").
		AndWhere(dbx.HashExp{"name": "Sofa"}).
		AndWhere(dbx.HashExp{"creator_id": ""}).
		One(&record)

	if err != nil {
		record.Load(map[string]any{
			"name":        "Sofa",
			"description": "Test furniture",
			"scale":       5,
		})
		file, err := filesystem.NewFileFromPath("./web/static/assets/furniture/GlamVelvetSofa.glb")
		if err != nil {
			log.Fatalln(err)
		}
		record.Set("file", file)

		if err := app.Save(record); err != nil {
			log.Fatalln(err)
		}
	}

	// Backfill wallets (with signup grant) for users created before the
	// economy existed
	usersWithoutWallets := []struct {
		Id string `db:"id"`
	}{}
	err = app.DB().
		NewQuery(`
		SELECT u.id
		FROM users u
		LEFT JOIN wallets w ON w.user_id = u.id
		WHERE w.id IS NULL
	`).All(&usersWithoutWallets)
	if err != nil {
		log.Println(err)
		return
	}
	for _, user := range usersWithoutWallets {
		if _, err := EnsureWallet(app, user.Id); err != nil {
			log.Println(err)
		}
	}
}
