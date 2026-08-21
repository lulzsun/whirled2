// Command swfinfo surveys a corpus of SWF avatars.
//
// It answers the questions M0 exists to answer (see
// docs/specs/swf-avatar-rendering.md §8): how much of the corpus is AVM1 vs
// AVM2, which files can be driven by the controlConnect host shim, and what
// frame labels the AVM1 files actually use — which is what the W1b label
// matcher has to be designed against.
//
// Usage:
//
//	go run ./tools/swfinfo [flags] <path>...
//
// Paths may be files or directories; directories are walked recursively for
// *.swf. With no paths, it defaults to the avatars shipped in the repo plus
// anything uploaded into the local PocketBase store.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"whirled2/utils/swf"
)

var defaultPaths = []string{
	"web/static/assets/avatars",
	"pb_data/storage",
}

type record struct {
	Path  string    `json:"path"`
	Error string    `json:"error,omitempty"`
	Info  *swf.Info `json:"info,omitempty"`
}

func main() {
	var (
		asJSON  = flag.Bool("json", false, "emit JSON instead of a table")
		labels  = flag.Bool("labels", false, "list every frame label per file")
		verbose = flag.Bool("v", false, "include files that failed to parse")
	)
	flag.Parse()

	paths := flag.Args()
	if len(paths) == 0 {
		paths = defaultPaths
		fmt.Fprintf(os.Stderr, "no paths given, defaulting to: %s\n\n",
			strings.Join(paths, " "))
	}

	files, err := collect(paths)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
	if len(files) == 0 {
		fmt.Fprintln(os.Stderr, "no .swf files found")
		os.Exit(1)
	}

	records := make([]record, 0, len(files))
	for _, path := range files {
		rec := record{Path: path}
		f, err := os.Open(path)
		if err != nil {
			rec.Error = err.Error()
			records = append(records, rec)
			continue
		}
		info, err := swf.Parse(f)
		f.Close()
		if err != nil {
			rec.Error = err.Error()
		}
		rec.Info = info
		records = append(records, rec)
	}

	if *asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(records); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		return
	}

	printTable(records, *verbose)
	printSummary(records)
	if *labels {
		printLabels(records)
	}
}

// collect expands the given paths into a sorted list of .swf files.
func collect(paths []string) ([]string, error) {
	var out []string
	seen := map[string]bool{}

	for _, p := range paths {
		st, err := os.Stat(p)
		if err != nil {
			// A missing default path just means that corpus isn't present.
			if os.IsNotExist(err) {
				fmt.Fprintf(os.Stderr, "skipping %s (does not exist)\n", p)
				continue
			}
			return nil, err
		}
		if !st.IsDir() {
			if !seen[p] {
				seen[p] = true
				out = append(out, p)
			}
			continue
		}
		err = filepath.WalkDir(p, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() || !strings.EqualFold(filepath.Ext(path), ".swf") {
				return nil
			}
			if !seen[path] {
				seen[path] = true
				out = append(out, path)
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	sort.Strings(out)
	return out, nil
}

func printTable(records []record, verbose bool) {
	fmt.Printf("%-40s  %-6s  %-5s  %-8s  %-9s  %-11s  %5s  %s\n",
		"FILE", "SIG", "VER", "SCRIPT", "TIER", "SIZE", "FPS", "LABELS")
	fmt.Println(strings.Repeat("-", 110))

	for _, rec := range records {
		name := filepath.Base(rec.Path)
		if len(name) > 40 {
			name = name[:37] + "..."
		}
		if rec.Info == nil || rec.Error != "" && rec.Info.Script == "" {
			if verbose || rec.Error != "" {
				fmt.Printf("%-40s  %s\n", name, "ERROR: "+rec.Error)
			}
			continue
		}
		i := rec.Info
		fmt.Printf("%-40s  %-6s  %-5d  %-8s  %-9s  %-11s  %5.1f  %d\n",
			name, i.Signature, i.Version, i.Script, i.Tier,
			fmt.Sprintf("%.0fx%.0f", i.WidthPx, i.HeightPx),
			i.FrameRate, len(i.AllLabelNames()))

		if i.Warning != "" {
			fmt.Printf("%-40s  ! %s\n", "", i.Warning)
		}
		if i.Truncated {
			fmt.Printf("%-40s  ! tag stream ended early; results are partial\n", "")
		}
	}
}

func printSummary(records []record) {
	var (
		total   int
		failed  int
		scripts = map[swf.ScriptKind]int{}
		tiers   = map[swf.ControlTier]int{}
		labeled int
	)

	for _, rec := range records {
		total++
		if rec.Info == nil || rec.Error != "" && rec.Info.Script == "" {
			failed++
			continue
		}
		scripts[rec.Info.Script]++
		tiers[rec.Info.Tier]++
		if len(rec.Info.AllLabelNames()) > 0 {
			labeled++
		}
	}

	parsed := total - failed
	fmt.Printf("\n%d files, %d parsed, %d failed\n", total, parsed, failed)

	fmt.Println("\nscript VM:")
	for _, k := range []swf.ScriptKind{swf.ScriptAVM2, swf.ScriptAVM1, swf.ScriptNone} {
		fmt.Printf("  %-6s %4d  %s\n", k, scripts[k], pct(scripts[k], parsed))
	}

	fmt.Println("\ncontrol tier:")
	for _, k := range []swf.ControlTier{
		swf.TierSDK, swf.TierExternal, swf.TierLabels, swf.TierStatic,
	} {
		fmt.Printf("  %-9s %4d  %s  %s\n", k, tiers[k], pct(tiers[k], parsed), tierNote(k))
	}

	fmt.Printf("\n%d of %d files (%s) expose at least one frame label\n",
		labeled, parsed, pct(labeled, parsed))
}

func tierNote(t swf.ControlTier) string {
	switch t {
	case swf.TierSDK:
		return "-> W1 controlConnect host shim"
	case swf.TierExternal:
		return "-> hand-patched; the pipeline being replaced"
	case swf.TierLabels:
		return "-> W1b frame-label control"
	case swf.TierStatic:
		return "-> renders, but cannot be driven"
	}
	return ""
}

// printLabels reports the label vocabulary across the corpus. This is the
// output W1b's matcher is designed against: if there is no shared vocabulary,
// the matcher is not worth building.
func printLabels(records []record) {
	histogram := map[string]int{}
	normalized := map[string]map[string]bool{}

	fmt.Println("\nper-file labels:")
	for _, rec := range records {
		if rec.Info == nil {
			continue
		}
		names := rec.Info.AllLabelNames()
		if len(names) == 0 {
			continue
		}
		fmt.Printf("  %s\n    %s\n", filepath.Base(rec.Path), strings.Join(names, ", "))
		for _, n := range names {
			norm := swf.NormalizeLabel(n)
			histogram[norm]++
			if normalized[norm] == nil {
				normalized[norm] = map[string]bool{}
			}
			normalized[norm][n] = true
		}
	}

	if len(histogram) == 0 {
		fmt.Println("  (none)")
		return
	}

	type entry struct {
		norm  string
		count int
	}
	entries := make([]entry, 0, len(histogram))
	for k, v := range histogram {
		entries = append(entries, entry{k, v})
	}
	sort.Slice(entries, func(a, b int) bool {
		if entries[a].count != entries[b].count {
			return entries[a].count > entries[b].count
		}
		return entries[a].norm < entries[b].norm
	})

	fmt.Println("\nnormalized label vocabulary (most common first):")
	for _, e := range entries {
		var spellings []string
		for s := range normalized[e.norm] {
			spellings = append(spellings, s)
		}
		sort.Strings(spellings)
		fmt.Printf("  %-20s %4d   spelled: %s\n",
			e.norm, e.count, strings.Join(spellings, ", "))
	}
}

func pct(n, total int) string {
	if total == 0 {
		return "  -  "
	}
	return fmt.Sprintf("%4.1f%%", float64(n)/float64(total)*100)
}
