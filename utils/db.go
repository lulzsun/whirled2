package db

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Create collections
func Bootstrap(app *pocketbase.PocketBase) {
	// Users collection / table
	usersCollection, err := app.Dao().FindCollectionByNameOrId("users")
	if err == nil && usersCollection.Schema.GetFieldByName("birthday") == nil {
		form := forms.NewCollectionUpsert(app, usersCollection)

		form.Schema.AddField(&schema.SchemaField{
			Name: "birthday",
			Type: schema.FieldTypeDate,
		})

		if err := form.Submit(); err != nil {
			log.Fatalln(err)
		}
	} else if err != nil {
		return
	}

	// Profiles collection / table
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
				&schema.SchemaField{
					Name:     "nickname",
					Type:     schema.FieldTypeText,
					Required: true,
					Options: &schema.TextOptions{
						Min: types.Pointer(3),
						Max: types.Pointer(10),
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
	if _, err := app.Dao().FindCollectionByNameOrId("comments"); err != nil {
		commentsCollection := &models.Collection{
			Name:       "comments",
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
}
