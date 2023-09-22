package db

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Create collections
func Bootstrap(app *pocketbase.PocketBase) {
	usersCollection, err := app.Dao().FindCollectionByNameOrId("users")
	if err != nil {
		log.Fatalln(err)
	}
	if _, err := app.Dao().FindCollectionByNameOrId("profiles"); err != nil {
		profilesCollection := &models.Collection{
			Name:       "profiles",
			Type:       models.CollectionTypeBase,
			ListRule:   nil,
			ViewRule:   nil,
			CreateRule: nil,
			UpdateRule: nil,
			DeleteRule: nil,
			Schema: schema.NewSchema(
				&schema.SchemaField{
					Name:     "user",
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
						Max: types.Pointer(10),
					},
				},
			),
			Indexes: types.JsonArray[string]{
				"CREATE UNIQUE INDEX idx_user ON profiles (user)",
			},
		}

		if err := app.Dao().SaveCollection(profilesCollection); err != nil {
			log.Fatalln(err)
		}
	}
}
