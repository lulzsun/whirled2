package utils

import (
	"log"
	"os"
	"strings"
)

func ReadSqlQuery(filePath string) string {
	sqlQuery, err := os.ReadFile(filePath)
	if !strings.HasSuffix(filePath, ".sql") {
		log.Println("File is not a .sql file")
		return ""
	}

	if err != nil {
		log.Println("Error reading .sql file:", err)
		return ""
	}

	sqlString := string(sqlQuery)
	return sqlString
}
