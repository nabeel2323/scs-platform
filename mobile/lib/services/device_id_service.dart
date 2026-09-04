import 'dart:io';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

/// Device ID generation and management for mobile app.
/// Generates a persistent device identifier stored in SharedPreferences.
/// Used for device trust logic in dual authentication.
class DeviceIdService {
  static const String _deviceIdKey = 'scs_device_id';
  static DeviceIdService? _instance;
  static String? _cachedDeviceId;

  DeviceIdService._();

  static DeviceIdService get instance => _instance ??= DeviceIdService._();

  /// Get or generate a persistent device ID.
  /// Stored in SharedPreferences to persist across app restarts.
  Future<String> getDeviceId() async {
    // Return cached value if available
    if (_cachedDeviceId != null) {
      return _cachedDeviceId!;
    }

    final prefs = await SharedPreferences.getInstance();
    String? deviceId = prefs.getString(_deviceIdKey);

    if (deviceId == null) {
      // Generate platform-specific device ID
      deviceId = await _generatePlatformDeviceId();
      await prefs.setString(_deviceIdKey, deviceId);
    }

    _cachedDeviceId = deviceId;
    return deviceId;
  }

  /// Generate platform-specific device identifier.
  /// Uses UUID for simplicity and cross-platform consistency.
  Future<String> _generatePlatformDeviceId() async {
    try {
      // Generate a UUID v4 (random) for this device
      const uuid = Uuid();
      final deviceId = uuid.v4();

      // Prefix with platform for easier identification
      if (Platform.isAndroid) {
        return 'android-$deviceId';
      } else if (Platform.isIOS) {
        return 'ios-$deviceId';
      }
      return deviceId;
    } catch (e) {
      // Fallback to timestamp-based ID
      print('Warning: Failed to generate UUID: $e');
      return 'device-${DateTime.now().millisecondsSinceEpoch}';
    }
  }

  /// Clear the device ID (used for logout/clear data scenarios).
  Future<void> clearDeviceId() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_deviceIdKey);
    _cachedDeviceId = null;
  }

  /// Check if a device ID exists.
  Future<bool> hasDeviceId() async {
    if (_cachedDeviceId != null) return true;

    final prefs = await SharedPreferences.getInstance();
    return prefs.containsKey(_deviceIdKey);
  }

  /// Get device info for API calls.
  Future<Map<String, String>> getDeviceInfo() async {
    final deviceId = await getDeviceId();

    String platform = 'unknown';
    if (Platform.isAndroid) {
      platform = 'android';
    } else if (Platform.isIOS) {
      platform = 'ios';
    }

    return {
      'platform': platform,
      'deviceId': deviceId,
      'userAgent': 'SmartCommerce-$platform',
    };
  }
}
