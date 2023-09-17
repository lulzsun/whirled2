# Whirled
brave new whirled

# development
```bash
npx tailwindcss -i ./tailwind.css -o ./web/static/styles.css --watch
go run main.go
nodemon -e go,json,html --exec go run main.go --signal SIGTERM
```

# ref
- https://github.com/lulzsun/whirled2/blob/715570214ccb2ba995913b28aeb9a6272063dadd/
- https://github.com/pocketbase/pocketbase/discussions/3051
- https://github.com/pocketbase/pocketbase/discussions/1670
- https://github.com/pocketbase/pocketbase/issues/718
- https://pocketbase.io/docs/api-records