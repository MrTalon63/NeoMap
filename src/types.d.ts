export type Geosubmit = {
	items: {
		timestamp: number;
		position: {
			latitude: number;
			longitude: number;
			accuracy: number;
			age: number;
			altitude: number;
			altitudeAccuracy: number;
			heading: number;
			speed: number;
			source: string;
		};
		cellTowers?: {
			radioType: "gsm" | "wcdma" | "lte";
			mobileCountryCode: number;
			mobileNetworkCode: number;
			age: number;
			asu: number;
			primaryScramblingCode: number;
			serving: number;
			signalStrength: number;
			arfcn: number;
		}[];
		wifiAccessPoints?: {
			macAddress: string;
			signalStrength: number;
			channel: number;
			ssid: string;
		}[];
		bluetoothBeacons?: {
			macAddress: string;
			signalStrength: number;
			age: number;
			name: string;
		}[];
	}[];
};
