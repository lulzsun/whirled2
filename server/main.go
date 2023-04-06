// main.go
package main

import (
	"net/http/httputil"
	"net/url"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/cmd"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	// go func() {
	// 	cmd := exec.Command(filepath.Join("node_modules", ".bin", "vite"), "--port", "8091", "--clearScreen", "false")
	// 	cmd.Dir = ".."
	// 	stdout, err := cmd.StdoutPipe()
	// 	if err != nil {
	// 		log.Fatal(err)
	// 	}
	// 	stderr, err := cmd.StderrPipe()
	// 	if err != nil {
	// 		log.Fatal(err)
	// 	}
	// 	if err := cmd.Start(); err != nil {
	// 		log.Fatal(err)
	// 	}

	// 	scanner := bufio.NewScanner(io.MultiReader(stdout, stderr))
	// 	var i int
	// 	for scanner.Scan() {
	// 		line := scanner.Text()
	// 		if line != "" && i >= 5 {
	// 			fmt.Println(line)
	// 		}
	// 		i++
	// 	}
	// 	if err := scanner.Err(); err != nil {
	// 		fmt.Printf("error: %s\n", err)
	// 	}
	// 	if err := cmd.Wait(); err != nil {
	// 		log.Fatal(err)
	// 	}
	// }()

	app := pocketbase.NewWithConfig(&pocketbase.Config{
		// DefaultDebug: false,
	})
	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		// production(?)
		// e.Router.GET("/*", apis.StaticDirectoryHandler(os.DirFS("pb_public"), true))

		// development
		url, _ := url.Parse("http://localhost:8091")
		proxy := httputil.NewSingleHostReverseProxy(url)
		e.Router.GET("/*", echo.WrapHandler(proxy))
		return nil
	})
	app.Bootstrap()
	serveCmd := cmd.NewServeCommand(app, true)
	// serveCmd.SetArgs([]string{"--http=127.0.0.1:8092"})
	serveCmd.Execute()
}
