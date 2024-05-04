package utils

import (
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
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
	usersCollection, err := app.Dao().FindCollectionByNameOrId("users")
	if err == nil && usersCollection.Schema.GetFieldByName("birthday") == nil {
		form := forms.NewCollectionUpsert(app, usersCollection)

		form.Schema.RemoveField(form.Schema.GetFieldByName("name").Id)
		form.Schema.AddField(&schema.SchemaField{
			Name:     "nickname",
			Type:     schema.FieldTypeText,
			Required: false,
			Options: &schema.TextOptions{
				Min: types.Pointer(3),
				Max: types.Pointer(30),
			},
		})
		form.Schema.AddField(&schema.SchemaField{
			Name:     "birthday",
			Type:     schema.FieldTypeDate,
			Required: true,
		})

		if err := form.Submit(); err != nil {
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
	profilesCollection, err := app.Dao().FindCollectionByNameOrId("profiles")
	if err != nil {
		profilesCollection = &models.Collection{
			Name:       "profiles",
			Type:       models.CollectionTypeBase,
			ListRule:   nil,
			ViewRule:   nil,
			CreateRule: nil,
			UpdateRule: nil,
			DeleteRule: nil,
			Schema: schema.NewSchema(
				&schema.SchemaField{
					Name:     "user_id",
					Type:     schema.FieldTypeRelation,
					Required: true,
					Options: &schema.RelationOptions{
						MaxSelect:     types.Pointer(1),
						CollectionId:  usersCollection.Id,
						CascadeDelete: true,
					},
				},
			),
			Indexes: types.JsonArray[string]{
				"CREATE UNIQUE INDEX idx_user ON profiles (user_id)",
			},
		}

		if err := app.Dao().SaveCollection(profilesCollection); err != nil {
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
	if _, err := app.Dao().FindCollectionByNameOrId("comments"); err != nil {
		commentsCollection := &models.Collection{
			Name:       "comments",
			Type:       models.CollectionTypeBase,
			ListRule:   nil,
			ViewRule:   nil,
			CreateRule: types.Pointer(""),
			UpdateRule: nil,
			DeleteRule: nil,
			Schema: schema.NewSchema(
				&schema.SchemaField{
					Name:     "user_id",
					Type:     schema.FieldTypeRelation,
					Required: false,
					Options: &schema.RelationOptions{
						MaxSelect:     types.Pointer(1),
						CollectionId:  usersCollection.Id,
						CascadeDelete: false,
					},
				},
				&schema.SchemaField{
					Name:     "profile_id",
					Type:     schema.FieldTypeRelation,
					Required: true,
					Options: &schema.RelationOptions{
						MaxSelect:     types.Pointer(1),
						CollectionId:  profilesCollection.Id,
						CascadeDelete: false,
					},
				},
				&schema.SchemaField{
					Name:     "parent_id",
					Type:     schema.FieldTypeText,
					Required: false,
				},
				&schema.SchemaField{
					Name:     "content",
					Type:     schema.FieldTypeText,
					Required: true,
					Options: &schema.TextOptions{
						Min: types.Pointer(1),
						Max: types.Pointer(280),
					},
				},
				&schema.SchemaField{
					Name:     "is_deleted",
					Type:     schema.FieldTypeBool,
					Required: false,
				},
			),
		}

		if err := app.Dao().SaveCollection(commentsCollection); err != nil {
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
	if _, err := app.Dao().FindCollectionByNameOrId("rooms"); err != nil {
		roomsCollection := &models.Collection{
			Name:       "rooms",
			Type:       models.CollectionTypeBase,
			ListRule:   nil,
			ViewRule:   nil,
			CreateRule: nil,
			UpdateRule: nil,
			DeleteRule: nil,
			Schema: schema.NewSchema(
				&schema.SchemaField{
					Name:     "owner_id",
					Type:     schema.FieldTypeRelation,
					Required: false,
					Options: &schema.RelationOptions{
						MaxSelect:     types.Pointer(1),
						CollectionId:  usersCollection.Id,
						CascadeDelete: true,
					},
				},
				&schema.SchemaField{
					Name:     "name",
					Type:     schema.FieldTypeText,
					Required: false,
					Options: &schema.TextOptions{
						Min: types.Pointer(3),
						Max: types.Pointer(30),
					},
				},
				&schema.SchemaField{
					Name:     "description",
					Type:     schema.FieldTypeText,
					Required: false,
					Options: &schema.TextOptions{
						Min: types.Pointer(1),
						Max: types.Pointer(280),
					},
				},
				&schema.SchemaField{
					Name:     "is_home",
					Type:     schema.FieldTypeBool,
					Required: false,
				},
				&schema.SchemaField{
					Name:     "is_featured",
					Type:     schema.FieldTypeBool,
					Required: false,
				},
				&schema.SchemaField{
					Name:     "objects",
					Type:     schema.FieldTypeJson,
					Required: false,
					Options: &schema.JsonOptions{
						MaxSize: 5000000, //5 MB in bytes
					},
				},
			),
		}

		if err := app.Dao().SaveCollection(roomsCollection); err != nil {
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
	if _, err := app.Dao().FindCollectionByNameOrId("stuff"); err != nil {
		stuffCollection := &models.Collection{
			Name:       "stuff",
			Type:       models.CollectionTypeBase,
			ListRule:   nil,
			ViewRule:   nil,
			CreateRule: nil,
			UpdateRule: nil,
			DeleteRule: nil,
			Schema: schema.NewSchema(
				&schema.SchemaField{
					Name:     "owner_id",
					Type:     schema.FieldTypeRelation,
					Required: true,
					Options: &schema.RelationOptions{
						MaxSelect:     types.Pointer(1),
						CollectionId:  usersCollection.Id,
						CascadeDelete: true,
					},
				},
				&schema.SchemaField{
					Name:     "stuff_id",
					Type:     schema.FieldTypeText,
					Required: true,
				},
				&schema.SchemaField{
					Name:     "type",
					Type:     schema.FieldTypeNumber,
					Required: true,
				},
				&schema.SchemaField{
					Name:     "in_use",
					Type:     schema.FieldTypeText,
					Required: false,
				},
			),
		}

		if err := app.Dao().SaveCollection(stuffCollection); err != nil {
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
	avatarsCollection, err := app.Dao().FindCollectionByNameOrId("avatars")
	if err != nil {
		avatarsCollection = &models.Collection{
			Name:       "avatars",
			Type:       models.CollectionTypeBase,
			ListRule:   nil,
			ViewRule:   nil,
			CreateRule: nil,
			UpdateRule: nil,
			DeleteRule: nil,
			Schema: schema.NewSchema(
				&schema.SchemaField{
					Name:     "creator_id",
					Type:     schema.FieldTypeRelation,
					Required: false,
					Options: &schema.RelationOptions{
						MaxSelect:     types.Pointer(1),
						CollectionId:  usersCollection.Id,
						CascadeDelete: true,
					},
				},
				&schema.SchemaField{
					Name:     "name",
					Type:     schema.FieldTypeText,
					Required: false,
					Options: &schema.TextOptions{
						Min: types.Pointer(3),
						Max: types.Pointer(30),
					},
				},
				&schema.SchemaField{
					Name:     "description",
					Type:     schema.FieldTypeText,
					Required: false,
					Options: &schema.TextOptions{
						Min: types.Pointer(1),
						Max: types.Pointer(280),
					},
				},
				&schema.SchemaField{
					Name:     "thumb",
					Type:     schema.FieldTypeFile,
					Required: false,
					Options: &schema.FileOptions{
						MimeTypes: []string{
							"image/jpeg", 
							"image/png", 
							"image/gif", 
							"image/bmp",
							"image/webp",
						},
						MaxSelect: 1,
						MaxSize: 5000000, //5 MB in bytes
						Protected: false,
					},
				},
				&schema.SchemaField{
					Name:     "file",
					Type:     schema.FieldTypeFile,
					Required: true,
					Options: &schema.FileOptions{
						MaxSelect: 1,
						MaxSize: 50000000, //50 MB in bytes
						Protected: false,
					},
				},
				&schema.SchemaField{
					Name:     "scale",
					Type:     schema.FieldTypeNumber,
					Required: false,
					Options: &schema.NumberOptions{
						Min: types.Pointer(0.001),
						Max: types.Pointer(100.0),
						NoDecimal: false,
					},
				},
			),
		}

		if err := app.Dao().SaveCollection(avatarsCollection); err != nil {
			log.Fatalln(err)
		}
	}

	// add some default avatars

	// add robot
	record := models.Record{}
	err = app.Dao().RecordQuery("avatars").
		AndWhere(dbx.HashExp{"name": "Robot"}).
		AndWhere(dbx.HashExp{"creator_id": ""}).
		One(&record)

	if err != nil && !record.HasId() {
		form := forms.NewRecordUpsert(app, models.NewRecord(avatarsCollection))
		form.LoadData(map[string]any{
			"name": "Robot",
			"description": "Test avatar",
			"scale": 1,
		})
		file, err := filesystem.NewFileFromPath("./web/static/assets/avatars/RobotExpressive.glb")
		if err != nil {
			log.Fatalln(err)
		}
		form.AddFiles("file", file)
	
		if err := form.Submit(); err != nil {
			log.Fatalln(err)
		}
	}

	// add fox
	record = models.Record{}
	err = app.Dao().RecordQuery("avatars").
		AndWhere(dbx.HashExp{"name": "Fox"}).
		AndWhere(dbx.HashExp{"creator_id": ""}).
		One(&record)

	if err != nil && !record.HasId() {
		form := forms.NewRecordUpsert(app, models.NewRecord(avatarsCollection))
		form.LoadData(map[string]any{
			"name": "Fox",
			"description": "Test avatar",
			"scale": 1,
		})
		file, err := filesystem.NewFileFromPath("./web/static/assets/avatars/Fox.glb")
		if err != nil {
			log.Fatalln(err)
		}
		form.AddFiles("file", file)
	
		if err := form.Submit(); err != nil {
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
	furnitureCollection, err := app.Dao().FindCollectionByNameOrId("furniture")
	if err != nil {
		furnitureCollection = &models.Collection{
			Name:       "furniture",
			Type:       models.CollectionTypeBase,
			ListRule:   nil,
			ViewRule:   nil,
			CreateRule: nil,
			UpdateRule: nil,
			DeleteRule: nil,
			Schema: schema.NewSchema(
				&schema.SchemaField{
					Name:     "creator_id",
					Type:     schema.FieldTypeRelation,
					Required: false,
					Options: &schema.RelationOptions{
						MaxSelect:     types.Pointer(1),
						CollectionId:  usersCollection.Id,
						CascadeDelete: true,
					},
				},
				&schema.SchemaField{
					Name:     "name",
					Type:     schema.FieldTypeText,
					Required: false,
					Options: &schema.TextOptions{
						Min: types.Pointer(3),
						Max: types.Pointer(30),
					},
				},
				&schema.SchemaField{
					Name:     "description",
					Type:     schema.FieldTypeText,
					Required: false,
					Options: &schema.TextOptions{
						Min: types.Pointer(1),
						Max: types.Pointer(280),
					},
				},
				&schema.SchemaField{
					Name:     "thumb",
					Type:     schema.FieldTypeFile,
					Required: false,
					Options: &schema.FileOptions{
						MimeTypes: []string{
							"image/jpeg", 
							"image/png", 
							"image/gif", 
							"image/bmp",
							"image/webp",
						},
						MaxSelect: 1,
						MaxSize: 5000000, //5 MB in bytes
						Protected: false,
					},
				},
				&schema.SchemaField{
					Name:     "file",
					Type:     schema.FieldTypeFile,
					Required: true,
					Options: &schema.FileOptions{
						MaxSelect: 1,
						MaxSize: 50000000, //50 MB in bytes
						Protected: false,
					},
				},
				&schema.SchemaField{
					Name:     "scale",
					Type:     schema.FieldTypeNumber,
					Required: false,
					Options: &schema.NumberOptions{
						Min: types.Pointer(0.001),
						Max: types.Pointer(100.0),
						NoDecimal: false,
					},
				},
			),
		}

		if err := app.Dao().SaveCollection(furnitureCollection); err != nil {
			log.Fatalln(err)
		}
	}

	// add some default furniture

	// add chair
	record = models.Record{}
	err = app.Dao().RecordQuery("furniture").
		AndWhere(dbx.HashExp{"name": "Chair"}).
		AndWhere(dbx.HashExp{"creator_id": ""}).
		One(&record)

	if err != nil && !record.HasId() {
		form := forms.NewRecordUpsert(app, models.NewRecord(furnitureCollection))
		form.LoadData(map[string]any{
			"name": "Chair",
			"description": "Test furniture",
			"scale": 5,
		})
		file, err := filesystem.NewFileFromPath("./web/static/assets/furniture/SheenChair.glb")
		if err != nil {
			log.Fatalln(err)
		}
		form.AddFiles("file", file)
	
		if err := form.Submit(); err != nil {
			log.Fatalln(err)
		}
	}

	// add sofa
	record = models.Record{}
	err = app.Dao().RecordQuery("furniture").
		AndWhere(dbx.HashExp{"name": "Sofa"}).
		AndWhere(dbx.HashExp{"creator_id": ""}).
		One(&record)

	if err != nil && !record.HasId() {
		form := forms.NewRecordUpsert(app, models.NewRecord(furnitureCollection))
		form.LoadData(map[string]any{
			"name": "Sofa",
			"description": "Test furniture",
			"scale": 5,
		})
		file, err := filesystem.NewFileFromPath("./web/static/assets/furniture/GlamVelvetSofa.glb")
		if err != nil {
			log.Fatalln(err)
		}
		form.AddFiles("file", file)
	
		if err := form.Submit(); err != nil {
			log.Fatalln(err)
		}
	}
}
