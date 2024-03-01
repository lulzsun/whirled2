package utils

import (
	"net"
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