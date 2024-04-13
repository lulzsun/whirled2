package utils

import (
	"net"
	"reflect"
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