# Whirled
brave new whirled

# development
```bash
npx tailwindcss -i ./tailwind.css -o ./web/static/styles.css --watch
go run main.go
nodemon -e go,json,html --exec go run main.go --signal SIGTERM
```