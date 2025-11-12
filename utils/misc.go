package utils

import (
	"fmt"
	"net"
	"reflect"
	"strings"
	"time"

	"github.com/google/uuid"
)

func GetLocalIP() ([]string, error) {
	var localIPs []string

	// Get all network interfaces
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	// Iterate over each network interface
	for _, iface := range interfaces {
		// Get the addresses associated with the interface
		addrs, err := iface.Addrs()
		if err != nil {
			return nil, err
		}

		// Iterate over each address
		for _, addr := range addrs {
			// Check if it's an IPv4 address and not a loopback address
			ipNet, ok := addr.(*net.IPNet)
			if ok && !ipNet.IP.IsLoopback() && ipNet.IP.To4() != nil {
				localIPs = append(localIPs, ipNet.IP.String())
			}
		}
	}

	return localIPs, nil
}

func StructToMap(s interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	val := reflect.ValueOf(s)
	typ := reflect.TypeOf(s)

	for i := 0; i < val.NumField(); i++ {
		result[typ.Field(i).Name] = val.Field(i).Interface()
	}

	return result
}

// Merge two maps together
func MergeMaps(maps ...map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	for _, m := range maps {
		for k, v := range m {
			result[k] = v
		}
	}
	return result
}

func FormatRelativeTime(timestamp string) string {
	t, err := time.Parse("2006-01-02 15:04:05.000Z", timestamp)
	if err != nil {
		return timestamp
	}

	now := time.Now()
	diff := now.Sub(t)

	switch {
	case diff < time.Minute:
		return "just now"
	case diff < time.Hour:
		minutes := int(diff.Minutes())
		return fmt.Sprintf("%d minutes ago", minutes)
	case diff < 24*time.Hour:
		hours := int(diff.Hours())
		if hours > 1 {
			return fmt.Sprintf("%d hours ago", hours)
		}
		return fmt.Sprintf("%d hour ago", hours)
	case diff < 30*24*time.Hour:
		days := int(diff.Hours() / 24)
		if days > 1 {
			return fmt.Sprintf("%d days ago", days)
		}
		return fmt.Sprintf("%d day ago", days)
	case diff < 365*24*time.Hour:
		months := int(diff.Hours() / (24 * 30))
		if months > 1 {
			return fmt.Sprintf("%d months ago", months)
		}
		return fmt.Sprintf("%d month ago", months)
	default:
		years := int(diff.Hours() / (24 * 365))
		if years > 1 {
			return fmt.Sprintf("%d years ago", years)
		}
		return fmt.Sprintf("%d year ago", years)
	}
}

func GenerateHTMLSafeID() string {
	id := uuid.New()
	hexString := strings.ReplaceAll(id.String(), "-", "")
	return fmt.Sprintf("%s%s", "id_", hexString)
}